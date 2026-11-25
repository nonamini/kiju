/**
 * Unified USI Engine Bridge (Wasm Web Worker + User NNUE + WebSocket USI) (#141, #142).
 * Manages dedicated Web Worker lifecycle and optional external WebSocket USI connections.
 * Guarantees zero UI thread blocking during calculations.
 * Strictly English code, comments, and variables (Rule 1).
 * Strictly TypeScript strict without any (Rule 2).
 */

import { Color, MoveEvaluation, MultiPvCandidate } from '../types/shogi';
import { loadCustomEngineModelBinary } from './customEngineModelStore';
import {
  DEFAULT_ENGINE_ID,
  EngineId,
  EngineProfile,
  getEngineProfile,
  resolveEngineDisplayName,
} from './engineConfig';
import {
  formatGoCommand,
  formatPositionCommand,
  parseEngineBestMoveLine,
  parseEngineInfoLine,
} from './engineProtocolParser';
import { LocalUsiSessionHandle, startLocalUsiSession } from './localUsiRuntime';
import {
  EngineCommand,
  EngineMessage,
  EngineSearchInfo,
  EngineSearchResult,
  EngineStatus,
} from './types';

export interface ShogiEngineBridgeOptions {
  workerUrl?: string;
  autoInit?: boolean;
  /** Engine profile to activate once initialized (#47). */
  defaultEngineId?: EngineId;
}

function determineSideToMove(sfen?: string, moves?: string[]): Color {
  let turn: Color = 'b';
  if (sfen && sfen !== 'startpos') {
    const parts = sfen.trim().split(/\s+/);
    if (parts[1] === 'w' || parts[1] === 'b') {
      turn = parts[1];
    }
  }
  if (moves && moves.length % 2 === 1) {
    turn = turn === 'b' ? 'w' : 'b';
  }
  return turn;
}

export class ShogiEngineBridge {
  private worker: Worker | null = null;
  private workerUrl: string;
  private status: EngineStatus = 'uninitialized';
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;

  private searchPromise: Promise<EngineSearchResult> | null = null;
  private searchResolve: ((result: EngineSearchResult) => void) | null = null;

  private activeEngineId: EngineId = DEFAULT_ENGINE_ID;
  private activeEngineName: string = 'Fairy-Stockfish 14 Wasm';
  private configuredEngineId: EngineId | null = null;
  private hasAppliedInitialConfig = false;

  // External USI transport state (WebSocket #142 or Local .exe #143)
  private ws: WebSocket | null = null;
  private localSession: LocalUsiSessionHandle | null = null;
  private extSideToMove: Color = 'b';
  private extMultiPvMap: Map<number, MultiPvCandidate> = new Map();
  private extLastEvaluation: MoveEvaluation | null = null;
  private extReadyEmitted = false;

  private infoListeners: Set<(info: EngineSearchInfo) => void> = new Set();
  private bestMoveListeners: Set<(result: EngineSearchResult) => void> = new Set();
  private statusListeners: Set<(status: EngineStatus) => void> = new Set();
  private rawOutputListeners: Set<(line: string) => void> = new Set();
  private progressListeners: Set<(percent: number, message: string) => void> = new Set();
  private engineSwitchedListeners: Set<(engineId: EngineId, engineName: string) => void> =
    new Set();

  constructor(options: ShogiEngineBridgeOptions = {}) {
    const assetBase = import.meta.env.BASE_URL === './' ? '/' : import.meta.env.BASE_URL;
    this.workerUrl = options.workerUrl ?? `${assetBase}engine/stockfishBridgeWorker.js`;
    this.configuredEngineId = options.defaultEngineId ?? null;
    if (this.configuredEngineId && getEngineProfile(this.configuredEngineId)) {
      this.activeEngineId = this.configuredEngineId;
      this.activeEngineName = resolveEngineDisplayName(this.configuredEngineId);
    }

    if (options.autoInit) {
      this.init().catch((err) => {
        console.error('Failed to auto-initialize ShogiEngineBridge:', err);
      });
    }
  }

  /**
   * Initializes the Web Worker (and activates configured default engine if present).
   */
  public async init(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      this.updateStatus('error');
      throw new Error('Web Workers are not available in this environment');
    }

    this.updateStatus('initializing');

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;

      try {
        this.worker = new Worker(this.workerUrl);

        this.worker.onmessage = (event: MessageEvent<EngineMessage>) => {
          this.handleWorkerMessage(event.data);
        };

        this.worker.onerror = (err: ErrorEvent) => {
          console.error(
            'ShogiEngineBridge worker error:',
            err.message,
            err.filename,
            err.lineno,
            err.colno,
            err
          );
          this.updateStatus('error');
          reject(err);
        };

        const initCmd: EngineCommand = { type: 'INIT' };
        this.worker.postMessage(initCmd);
      } catch (err) {
        this.updateStatus('error');
        reject(err);
      }
    });

    return this.readyPromise;
  }

  /**
   * Dispatches messages received from the Web Worker.
   */
  private handleWorkerMessage(msg: EngineMessage): void {
    if (!msg) return;

    switch (msg.type) {
      case 'STATUS_CHANGE':
        // Ignore worker status updates while connected via external WebSocket or local .exe USI
        if (!this.ws && !this.localSession) {
          this.updateStatus(msg.status);
        }
        if (msg.status === 'offline' || msg.status === 'error') {
          if (this.readyResolve) {
            this.readyResolve();
            this.readyResolve = null;
          }
        }
        break;

      case 'READY_OK': {
        this.updateStatus('ready');
        const configured = this.configuredEngineId;
        if (
          !this.hasAppliedInitialConfig &&
          configured &&
          configured !== DEFAULT_ENGINE_ID &&
          getEngineProfile(configured)
        ) {
          this.hasAppliedInitialConfig = true;
          void this.performEngineSwitch(configured);
        } else {
          this.hasAppliedInitialConfig = true;
        }
        if (this.readyResolve) {
          this.readyResolve();
          this.readyResolve = null;
        }
        break;
      }

      case 'INFO':
        for (const listener of this.infoListeners) {
          listener(msg.info);
        }
        break;

      case 'BESTMOVE':
        this.updateStatus('ready');
        for (const listener of this.bestMoveListeners) {
          listener(msg.result);
        }
        if (this.searchResolve) {
          this.searchResolve(msg.result);
          this.searchResolve = null;
          this.searchPromise = null;
        }
        break;

      case 'RAW_OUTPUT':
        for (const listener of this.rawOutputListeners) {
          listener(msg.line);
        }
        break;

      case 'PROGRESS':
        this.emitProgress(msg.percent, msg.message);
        break;

      case 'ENGINE_SWITCHED':
        this.activeEngineId = msg.engineId;
        this.activeEngineName = msg.engineName;
        this.updateStatus('ready');
        this.emitEngineSwitched(msg.engineId, msg.engineName);
        break;

      case 'ERROR':
        console.error('Engine Worker reported error:', msg.error);
        this.updateStatus('error');
        break;
    }
  }

  private updateStatus(newStatus: EngineStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      for (const listener of this.statusListeners) {
        listener(newStatus);
      }
    }
  }

  private emitProgress(percent: number, message: string): void {
    for (const listener of this.progressListeners) {
      listener(percent, message);
    }
  }

  private emitEngineSwitched(engineId: EngineId, engineName: string): void {
    for (const listener of this.engineSwitchedListeners) {
      listener(engineId, engineName);
    }
  }

  private closeWebSocket(): void {
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.send('quit');
          this.ws.close();
        }
      } catch {
        // Ignore close errors
      }
      this.ws = null;
      this.extReadyEmitted = false;
    }
  }

  private closeLocalSession(): void {
    if (this.localSession) {
      try {
        this.localSession.close();
      } catch {
        // Ignore close errors
      }
      this.localSession = null;
      this.extReadyEmitted = false;
    }
  }

  private closeExternalTransports(): void {
    this.closeWebSocket();
    this.closeLocalSession();
  }

  private handleExternalUsiLine(
    rawLine: string,
    profileId: EngineId,
    displayName: string
  ): void {
    const clean = rawLine.trim();
    if (!clean) return;

    for (const listener of this.rawOutputListeners) {
      listener(clean);
    }

    if (clean === 'usiok' || clean === 'readyok') {
      if (!this.extReadyEmitted) {
        this.extReadyEmitted = true;
        this.activeEngineId = profileId;
        this.activeEngineName = displayName;
        this.emitProgress(100, `${displayName} ready!`);
        this.updateStatus('ready');
        this.emitEngineSwitched(profileId, displayName);
      } else {
        this.updateStatus('ready');
      }
    } else if (clean.startsWith('info ')) {
      const info = parseEngineInfoLine(clean, this.extSideToMove);
      if (info) {
        if (info.scoreCp !== undefined) {
          const mpRank = info.multipv || 1;
          if (info.bestMove) {
            this.extMultiPvMap.set(mpRank, {
              multipv: mpRank,
              usi: info.bestMove,
              scoreCp: info.scoreCp,
              isMate: info.isMate,
              matePly: info.matePly,
              pv: info.pv,
            });
          }
          if (mpRank === 1) {
            this.extLastEvaluation = {
              scoreCp: info.scoreCp,
              isMate: info.isMate,
              matePly: info.matePly,
              depth: info.depth,
              bestMove: info.bestMove,
              pv: info.pv,
              evaluatedAt: new Date().toISOString(),
            };
          }
        }
        for (const listener of this.infoListeners) {
          listener(info);
        }
      }
    } else if (clean.startsWith('bestmove')) {
      const parsed = parseEngineBestMoveLine(clean);
      if (parsed) {
        const candidates = Array.from(this.extMultiPvMap.values()).sort(
          (a, b) => a.multipv - b.multipv
        );
        if (this.extLastEvaluation) {
          this.extLastEvaluation.candidates =
            candidates.length > 0 ? candidates : undefined;
        }
        const result: EngineSearchResult = {
          bestMove: parsed.bestMove,
          ponder: parsed.ponder,
          evaluation: this.extLastEvaluation ?? undefined,
        };
        this.updateStatus('ready');
        for (const listener of this.bestMoveListeners) {
          listener(result);
        }
        if (this.searchResolve) {
          this.searchResolve(result);
          this.searchResolve = null;
          this.searchPromise = null;
        }
      }
    }
  }

  private async connectWebSocketEngine(profile: EngineProfile): Promise<void> {
    if (!profile.wsUrl || typeof WebSocket === 'undefined') {
      this.updateStatus('error');
      return;
    }

    const displayName = resolveEngineDisplayName(profile);
    this.updateStatus('initializing');
    this.emitProgress(20, `Connecting to ${displayName} (${profile.wsUrl})...`);

    try {
      const socket = new WebSocket(profile.wsUrl);
      this.ws = socket;
      this.extReadyEmitted = false;

      socket.onopen = () => {
        if (this.ws !== socket) return;
        this.emitProgress(60, `Initializing USI handshake (${displayName})...`);
        socket.send('usi');
        socket.send('isready');
      };

      socket.onmessage = (event: MessageEvent) => {
        if (this.ws !== socket) return;
        const raw = typeof event.data === 'string' ? event.data : String(event.data ?? '');
        for (const line of raw.split(/\r?\n/)) {
          this.handleExternalUsiLine(line, profile.id, displayName);
        }
      };

      socket.onerror = () => {
        if (this.ws !== socket) return;
        console.error('[ShogiEngineBridge] WebSocket USI error for', profile.wsUrl);
        this.closeWebSocket();
        this.updateStatus('error');
      };

      socket.onclose = () => {
        if (this.ws === socket) {
          this.ws = null;
          this.extReadyEmitted = false;
          if (this.status === 'initializing' || this.status === 'searching') {
            this.updateStatus('error');
          }
        }
      };
    } catch (err) {
      console.error('[ShogiEngineBridge] Failed to open WebSocket USI bridge:', err);
      this.closeWebSocket();
      this.updateStatus('error');
    }
  }

  private async connectLocalExeEngine(profile: EngineProfile): Promise<void> {
    if (!profile.exePath) {
      this.updateStatus('error');
      return;
    }

    const displayName = resolveEngineDisplayName(profile);
    this.updateStatus('initializing');
    this.emitProgress(20, `Launching ${displayName}...`);
    this.extReadyEmitted = false;

    try {
      const handle = await startLocalUsiSession(
        profile.exePath,
        (line) => {
          if (this.localSession !== handle) return;
          this.handleExternalUsiLine(line, profile.id, displayName);
        },
        (errMsg) => {
          if (this.localSession !== handle) return;
          console.error('[ShogiEngineBridge] Local USI engine error:', errMsg);
          this.closeLocalSession();
          this.updateStatus('error');
        }
      );
      this.localSession = handle;
      this.emitProgress(60, `Initializing USI handshake (${displayName})...`);
      handle.send('usi');
      handle.send('isready');
    } catch (err) {
      console.error('[ShogiEngineBridge] Failed to launch local USI engine:', err);
      this.closeLocalSession();
      this.updateStatus('error');
    }
  }

  private async performEngineSwitch(engineId: EngineId): Promise<void> {
    const profile =
      getEngineProfile(engineId) ?? getEngineProfile(DEFAULT_ENGINE_ID);
    if (!profile) return;

    this.closeExternalTransports();

    if (profile.transportType === 'local-exe' && profile.exePath) {
      await this.connectLocalExeEngine(profile);
      return;
    }

    if (profile.transportType === 'websocket-usi' && profile.wsUrl) {
      await this.connectWebSocketEngine(profile);
      return;
    }

    if (!this.worker) {
      await this.init();
    }

    if (profile.transportType === 'custom-nnue' && profile.customModelId) {
      const displayName = resolveEngineDisplayName(profile);
      this.emitProgress(20, `Loading ${displayName} from IndexedDB...`);
      const stored = await loadCustomEngineModelBinary(profile.customModelId);
      if (!stored) {
        this.updateStatus('error');
        return;
      }
      this.sendCommandToWorker({
        type: 'SWITCH_ENGINE',
        engineId: profile.id,
        engineName: displayName,
        nnFileName: stored.nnFileName,
        nnBuffer: stored.nnBuffer,
        fvScale: profile.fvScale,
      });
      return;
    }

    this.sendCommandToWorker({
      type: 'SWITCH_ENGINE',
      engineId: DEFAULT_ENGINE_ID,
      engineName: 'Fairy-Stockfish 14 Wasm',
    });
  }

  /**
   * Sets a USI engine option (e.g. MultiPV, Hash).
   */
  public setOption(name: string, value: string | number | boolean): void {
    this.sendCommand({ type: 'SET_OPTION', name, value });
  }

  /**
   * Sets the board position to evaluate or search.
   */
  public setPosition(sfen?: string, moves?: string[]): void {
    this.sendCommand({ type: 'POSITION', sfen, moves });
  }

  /**
   * Launches engine search on current position.
   */
  public async search(
    options: {
      depth?: number;
      movetime?: number;
      byoyomi?: number;
      btime?: number;
      wtime?: number;
    } = {}
  ): Promise<EngineSearchResult> {
    if (this.searchPromise) {
      this.stop();
    }

    if (
      this.status === 'offline' ||
      this.status === 'error' ||
      this.status === 'uninitialized'
    ) {
      return Promise.reject(
        new Error(`Engine is currently in ${this.status} state`)
      );
    }

    const timeoutMs = (options.movetime ?? 3000) + 1500;

    this.searchPromise = new Promise<EngineSearchResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.searchResolve === resolve) {
          this.searchResolve = null;
          this.searchPromise = null;
          reject(new Error('Engine search timed out'));
        }
      }, timeoutMs);

      this.searchResolve = (res) => {
        clearTimeout(timer);
        resolve(res);
      };
      this.sendCommand({ type: 'GO', ...options });
    });

    return this.searchPromise;
  }

  /**
   * Stops the ongoing engine search immediately.
   */
  public stop(): void {
    this.sendCommand({ type: 'STOP' });
  }

  /**
   * Subscribes to periodic search information (depth, score, PV, nps).
   */
  public onInfo(listener: (info: EngineSearchInfo) => void): () => void {
    this.infoListeners.add(listener);
    return () => this.infoListeners.delete(listener);
  }

  /**
   * Subscribes to search bestmove completion.
   */
  public onBestMove(listener: (result: EngineSearchResult) => void): () => void {
    this.bestMoveListeners.add(listener);
    return () => this.bestMoveListeners.delete(listener);
  }

  /**
   * Subscribes to engine status changes.
   */
  public onStatusChange(listener: (status: EngineStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  /**
   * Subscribes to raw engine stdout lines for debugging.
   */
  public onRawOutput(listener: (line: string) => void): () => void {
    this.rawOutputListeners.add(listener);
    return () => this.rawOutputListeners.delete(listener);
  }

  public getStatus(): EngineStatus {
    return this.status;
  }

  public isReady(): boolean {
    return this.status === 'ready' || this.status === 'searching';
  }

  /**
   * Switches active thinking engine to any registered profile (Wasm, user NNUE, or WebSocket USI).
   */
  public switchEngine(engineId: EngineId): void {
    this.hasAppliedInitialConfig = true;
    void this.performEngineSwitch(engineId);
  }

  /**
   * Updates the configured default engine (#47 / #141 / #142).
   * When the bridge is already ready the switch is applied immediately;
   * otherwise it is applied once initialized.
   */
  public setConfiguredEngine(engineId: EngineId): void {
    this.configuredEngineId = engineId;
    this.activeEngineId = engineId;
    this.activeEngineName = resolveEngineDisplayName(engineId);
    if (this.status === 'ready' || this.status === 'searching') {
      this.hasAppliedInitialConfig = true;
      void this.performEngineSwitch(engineId);
    }
  }

  public getActiveEngineId(): EngineId {
    return this.activeEngineId;
  }

  public getActiveEngineName(): string {
    return this.activeEngineName;
  }

  public onProgress(listener: (percent: number, message: string) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  public onEngineSwitched(
    listener: (engineId: EngineId, engineName: string) => void
  ): () => void {
    this.engineSwitchedListeners.add(listener);
    return () => this.engineSwitchedListeners.delete(listener);
  }

  private sendCommandToWorker(cmd: EngineCommand): void {
    if (!this.worker) {
      console.warn('Cannot send command; engine worker is not active:', cmd);
      return;
    }
    this.worker.postMessage(cmd);
  }

  private dispatchExternalCommand(
    cmd: EngineCommand,
    sendLine: (line: string) => void
  ): void {
    switch (cmd.type) {
      case 'ISREADY':
        sendLine('isready');
        return;
      case 'SET_OPTION':
        sendLine(`setoption name ${cmd.name} value ${cmd.value}`);
        return;
      case 'POSITION':
        this.extSideToMove = determineSideToMove(cmd.sfen, cmd.moves);
        this.extLastEvaluation = null;
        this.extMultiPvMap.clear();
        sendLine(formatPositionCommand(cmd.sfen, cmd.moves));
        return;
      case 'GO':
        this.updateStatus('searching');
        sendLine(formatGoCommand(cmd));
        return;
      case 'STOP':
        sendLine('stop');
        return;
      case 'RAW_COMMAND':
        sendLine(cmd.command);
        return;
      case 'QUIT':
        this.closeExternalTransports();
        return;
      default:
        return;
    }
  }

  private sendCommand(cmd: EngineCommand): void {
    if (this.localSession) {
      const session = this.localSession;
      this.dispatchExternalCommand(cmd, (line) => session.send(line));
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const socket = this.ws;
      this.dispatchExternalCommand(cmd, (line) => socket.send(line));
      return;
    }

    this.sendCommandToWorker(cmd);
  }

  /**
   * Terminates WebSocket, Local USI, and Web Worker connections completely and frees memory.
   */
  public terminate(): void {
    this.closeExternalTransports();
    if (this.worker) {
      this.sendCommandToWorker({ type: 'QUIT' });
      this.worker.terminate();
      this.worker = null;
    }
    this.updateStatus('terminated');
    this.readyPromise = null;
    this.readyResolve = null;
    this.searchPromise = null;
    this.searchResolve = null;
    this.hasAppliedInitialConfig = false;
    this.infoListeners.clear();
    this.bestMoveListeners.clear();
    this.statusListeners.clear();
    this.rawOutputListeners.clear();
    this.progressListeners.clear();
    this.engineSwitchedListeners.clear();
  }
}

// Singleton engine instance for application-wide reuse
let defaultBridgeInstance: ShogiEngineBridge | null = null;

export function getSharedEngineBridge(
  options: ShogiEngineBridgeOptions = {}
): ShogiEngineBridge {
  if (!defaultBridgeInstance) {
    defaultBridgeInstance = new ShogiEngineBridge(options);
  }
  return defaultBridgeInstance;
}
