/**
 * Dedicated Web Worker Bridge for Fairy-Stockfish Wasm.
 * Runs in background thread to guarantee zero UI thread blocking.
 * Communicates with main thread via typed EngineCommand and EngineMessage protocols.
 */

/* eslint-disable no-undef */

// Load Emscripten Stockfish module relative to worker location (subpath-safe)
const ENGINE_SCRIPT_URL = new URL('stockfish.js', self.location.href).href;
let stockfishModuleLoadError = null;
try {
  importScripts(ENGINE_SCRIPT_URL);
} catch (err) {
  stockfishModuleLoadError = err instanceof Error ? err.message : String(err);
  console.error('[stockfishBridgeWorker] Failed to importScripts stockfish.js:', err);
}

let stockfish = null;
let isReady = false;
let currentSideToMove = 'b';
let lastEvaluation = null;
let currentMultiPvMap = new Map();
let currentSearchResolve = null;
let workerIsSearching = false;
let stopSentForCurrentSearch = false;
let ignoreCurrentSearch = false;
let queuedOptions = [];
let queuedPositionCmd = null;
let queuedGoCmd = null;

function applyPositionCmd(cmd) {
  if (!stockfish) return;
  currentSideToMove = determineSideToMove(cmd.sfen, cmd.moves);
  lastEvaluation = null;
  currentMultiPvMap.clear();
  let posStr = cmd.sfen && cmd.sfen !== 'startpos' ? `position sfen ${cmd.sfen}` : 'position startpos';
  if (cmd.moves && cmd.moves.length > 0) {
    posStr += ` moves ${cmd.moves.join(' ')}`;
  }
  stockfish.postMessage(posStr);
}

function startGoCmd(cmd) {
  if (!stockfish) return;
  workerIsSearching = true;
  stopSentForCurrentSearch = false;
  ignoreCurrentSearch = false;
  self.postMessage({ type: 'STATUS_CHANGE', status: 'searching' });
  const tokens = ['go'];
  if (cmd.depth) tokens.push(`depth ${cmd.depth}`);
  else if (cmd.movetime) tokens.push(`movetime ${cmd.movetime}`);
  else if (cmd.byoyomi) tokens.push(`byoyomi ${cmd.byoyomi}`);
  else tokens.push('depth 8');

  if (cmd.btime) tokens.push(`btime ${cmd.btime}`);
  if (cmd.wtime) tokens.push(`wtime ${cmd.wtime}`);

  stockfish.postMessage(tokens.join(' '));
}

// Helper to determine side to move from SFEN and move list
function determineSideToMove(sfen, moves) {
  let turn = 'b';
  if (sfen && sfen !== 'startpos') {
    const parts = sfen.trim().split(/\s+/);
    if (parts[1] === 'w' || parts[1] === 'b') {
      turn = parts[1];
    }
  }
  if (moves && moves.length > 0) {
    for (let i = 0; i < moves.length; i++) {
      turn = turn === 'b' ? 'w' : 'b';
    }
  }
  return turn;
}

// Parses "info" line from engine stdout
function parseInfoLine(line, sideToMove) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('info ') && trimmed !== 'info') return null;

  const tokens = trimmed.split(/\s+/);
  let depth = 0;
  let seldepth;
  let scoreCp;
  let isMate;
  let matePly;
  let nodes;
  let nps;
  let timeMs;
  let multipv;
  const pv = [];
  let inPv = false;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (inPv) {
      pv.push(token);
      continue;
    }

    if (token === 'depth' && i + 1 < tokens.length) {
      depth = parseInt(tokens[++i], 10);
    } else if (token === 'seldepth' && i + 1 < tokens.length) {
      seldepth = parseInt(tokens[++i], 10);
    } else if (token === 'multipv' && i + 1 < tokens.length) {
      multipv = parseInt(tokens[++i], 10);
    } else if (token === 'nodes' && i + 1 < tokens.length) {
      nodes = parseInt(tokens[++i], 10);
    } else if (token === 'nps' && i + 1 < tokens.length) {
      nps = parseInt(tokens[++i], 10);
    } else if (token === 'time' && i + 1 < tokens.length) {
      timeMs = parseInt(tokens[++i], 10);
    } else if (token === 'score' && i + 2 < tokens.length) {
      const type = tokens[++i];
      const val = parseInt(tokens[++i], 10);
      if (type === 'cp') {
        scoreCp = sideToMove === 'w' ? -val : val;
      } else if (type === 'mate') {
        isMate = true;
        matePly = Math.abs(val);
        let isSenteMating = false;
        if (val === 0) {
          isSenteMating = sideToMove === 'w';
        } else if (sideToMove === 'b') {
          isSenteMating = val > 0;
        } else {
          isSenteMating = val < 0;
        }
        scoreCp = isSenteMating ? 30000 : -30000;
      }
    } else if (token === 'pv') {
      inPv = true;
    }
  }

  if (depth === 0 && pv.length === 0 && scoreCp === undefined) return null;

  return {
    depth,
    seldepth,
    scoreCp,
    isMate,
    matePly,
    nodes,
    nps,
    timeMs,
    multipv,
    pv: pv.length > 0 ? pv : undefined,
    bestMove: pv[0],
    rawLine: trimmed,
  };
}

// Parses "bestmove" line from engine stdout
function parseBestMoveLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('bestmove')) return null;

  const parts = trimmed.split(/\s+/);
  const bestMove = parts[1];
  let ponder;
  const ponderIdx = parts.indexOf('ponder');
  if (ponderIdx !== -1 && parts[ponderIdx + 1]) {
    ponder = parts[ponderIdx + 1];
  }

  return { bestMove, ponder };
}

async function initEngine() {
  if (stockfish) return;

  self.postMessage({ type: 'STATUS_CHANGE', status: 'initializing' });

  if (stockfishModuleLoadError) {
    self.postMessage({
      type: 'STATUS_CHANGE',
      status: 'offline',
      message: `Failed to load engine script: ${stockfishModuleLoadError}`,
    });
    return;
  }

  if (typeof Stockfish !== 'function') {
    self.postMessage({
      type: 'STATUS_CHANGE',
      status: 'offline',
      message: 'Stockfish Wasm factory function is not defined',
    });
    return;
  }

  try {
    console.log('[stockfishBridgeWorker] Initializing Stockfish Wasm with crossOriginIsolated =', typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : 'undefined');
    stockfish = await Stockfish({
      mainScriptUrlOrBlob: ENGINE_SCRIPT_URL,
      locateFile: (file) => new URL(file, self.location.href).href,
    });
    console.log('[stockfishBridgeWorker] Stockfish factory resolved:', stockfish);

    stockfish.addMessageListener((line) => {
      console.log('[stockfish stdout]', line);
      self.postMessage({ type: 'RAW_OUTPUT', line });

      if (line === 'usiok' || line === 'readyok') {
        isReady = true;
        self.postMessage({ type: 'READY_OK', engineName: 'Fairy-Stockfish 14 Wasm' });
        self.postMessage({ type: 'STATUS_CHANGE', status: 'ready' });
      } else if (line.startsWith('info ')) {
        if (ignoreCurrentSearch) {
          return;
        }
        const info = parseInfoLine(line, currentSideToMove);
        if (info) {
          if (info.scoreCp !== undefined) {
            const mpRank = info.multipv || 1;
            if (info.bestMove) {
              currentMultiPvMap.set(mpRank, {
                multipv: mpRank,
                usi: info.bestMove,
                scoreCp: info.scoreCp,
                isMate: info.isMate,
                matePly: info.matePly,
                pv: info.pv,
              });
            }
            if (mpRank === 1) {
              lastEvaluation = {
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
          self.postMessage({ type: 'INFO', info });
        }
      } else if (line.startsWith('bestmove')) {
        const wasIgnored = ignoreCurrentSearch;
        workerIsSearching = false;
        stopSentForCurrentSearch = false;
        ignoreCurrentSearch = false;

        if (!wasIgnored) {
          const parsed = parseBestMoveLine(line);
          if (parsed) {
            const candidates = Array.from(currentMultiPvMap.values())
              .sort((a, b) => a.multipv - b.multipv);
            if (lastEvaluation) {
              lastEvaluation.candidates = candidates.length > 0 ? candidates : undefined;
            }
            const result = {
              bestMove: parsed.bestMove,
              ponder: parsed.ponder,
              evaluation: lastEvaluation,
            };
            self.postMessage({ type: 'BESTMOVE', result });
            if (!queuedGoCmd) {
              self.postMessage({ type: 'STATUS_CHANGE', status: 'ready' });
            }
            if (currentSearchResolve) {
              currentSearchResolve(result);
              currentSearchResolve = null;
            }
          }
        }

        if (queuedOptions.length > 0) {
          const pendingOpts = queuedOptions.splice(0, queuedOptions.length);
          for (const opt of pendingOpts) {
            stockfish.postMessage(`setoption name ${opt.name} value ${opt.value}`);
          }
        }
        if (queuedPositionCmd) {
          const nextPos = queuedPositionCmd;
          queuedPositionCmd = null;
          applyPositionCmd(nextPos);
        }
        if (queuedGoCmd) {
          const nextGo = queuedGoCmd;
          queuedGoCmd = null;
          startGoCmd(nextGo);
        } else if (wasIgnored) {
          self.postMessage({ type: 'STATUS_CHANGE', status: 'ready' });
        }
      }
    });

    // Initialize in USI mode with Shogi variant
    console.log('[stockfishBridgeWorker] Sending USI init commands');
    stockfish.postMessage('usi');
    stockfish.postMessage('isready');
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[stockfishBridgeWorker] Stockfish initialization failed:', err);
    const isSharedArrayBufferError = errorMsg.includes('SharedArrayBuffer') || typeof SharedArrayBuffer === 'undefined';
    
    if (isSharedArrayBufferError) {
      console.warn('[Wasm Engine] SharedArrayBuffer is unavailable. crossOriginIsolated =', typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : 'undefined');
      self.postMessage({ type: 'STATUS_CHANGE', status: 'offline', message: `SharedArrayBuffer unavailable (crossOriginIsolated=${typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : 'undefined'})` });
    } else {
      self.postMessage({ type: 'ERROR', error: errorMsg });
      self.postMessage({ type: 'STATUS_CHANGE', status: 'error', message: errorMsg });
    }
  }
}

self.onmessage = async (e) => {
  const cmd = e.data;
  if (!cmd || !cmd.type) return;

  switch (cmd.type) {
    case 'INIT':
      await initEngine();
      break;

    case 'ISREADY':
      if (stockfish) {
        stockfish.postMessage('isready');
      }
      break;

    case 'SET_OPTION':
      if (stockfish && cmd.name !== undefined) {
        if (workerIsSearching) {
          queuedOptions.push({ name: cmd.name, value: cmd.value });
        } else {
          stockfish.postMessage(`setoption name ${cmd.name} value ${cmd.value}`);
        }
      }
      break;

    case 'POSITION': {
      if (stockfish) {
        if (workerIsSearching) {
          ignoreCurrentSearch = true;
          queuedPositionCmd = cmd;
          queuedGoCmd = null;
          if (!stopSentForCurrentSearch) {
            stopSentForCurrentSearch = true;
            stockfish.postMessage('stop');
          }
        } else {
          applyPositionCmd(cmd);
        }
      }
      break;
    }

    case 'GO': {
      if (stockfish) {
        if (workerIsSearching) {
          ignoreCurrentSearch = true;
          queuedGoCmd = cmd;
          if (!stopSentForCurrentSearch) {
            stopSentForCurrentSearch = true;
            stockfish.postMessage('stop');
          }
        } else {
          startGoCmd(cmd);
        }
      } else {
        // Stockfish Wasm is not running (e.g. SharedArrayBuffer unavailable)
        // Immediately notify main thread so it falls back to heuristics
        self.postMessage({
          type: 'ERROR',
          error: 'Wasm engine instance is unavailable (SharedArrayBuffer restricted)',
        });
        self.postMessage({
          type: 'BESTMOVE',
          result: {
            bestMove: 'resign',
            evaluation: undefined,
          },
        });
      }
      break;
    }

    case 'SWITCH_ENGINE': {
      const targetEngineId = cmd.engineId;
      if (!targetEngineId) break;

      const engineLabel = cmd.engineName || targetEngineId;
      self.postMessage({
        type: 'STATUS_CHANGE',
        status: 'initializing',
        message: `Switching to ${engineLabel}...`,
      });

      if (targetEngineId === 'fairy-stockfish') {
        if (stockfish) {
          stockfish.postMessage('setoption name EvalFile value ');
          stockfish.postMessage('isready');
        }
        self.postMessage({ type: 'PROGRESS', percent: 100, message: 'Fairy-Stockfish ready' });
        self.postMessage({
          type: 'ENGINE_SWITCHED',
          engineId: 'fairy-stockfish',
          engineName: 'Fairy-Stockfish 14 Wasm',
        });
        self.postMessage({ type: 'STATUS_CHANGE', status: 'ready' });
        break;
      }

      // Mount user-imported NNUE/model buffer stored in IndexedDB into Wasm FS (#141)
      try {
        self.postMessage({ type: 'PROGRESS', percent: 30, message: `Mounting ${engineLabel}...` });

        if (stockfish && cmd.nnBuffer) {
          const safeFileName = (cmd.nnFileName || 'custom.nnue').replace(/[^a-zA-Z0-9._-]/g, '_');
          if (stockfish.FS && typeof stockfish.FS.writeFile === 'function') {
            stockfish.FS.writeFile(`/${safeFileName}`, new Uint8Array(cmd.nnBuffer));
            stockfish.postMessage(`setoption name EvalFile value /${safeFileName}`);
          }
          if (typeof cmd.fvScale === 'number') {
            stockfish.postMessage(`setoption name FV_SCALE value ${cmd.fvScale}`);
          }
          stockfish.postMessage('isready');
        }

        self.postMessage({ type: 'PROGRESS', percent: 100, message: `${engineLabel} ready!` });
        self.postMessage({
          type: 'ENGINE_SWITCHED',
          engineId: targetEngineId,
          engineName: engineLabel,
        });
        self.postMessage({ type: 'STATUS_CHANGE', status: 'ready' });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        self.postMessage({ type: 'ERROR', error: `Failed to mount custom model: ${errorMsg}` });
        self.postMessage({ type: 'STATUS_CHANGE', status: 'error', message: errorMsg });
      }
      break;
    }

    case 'STOP':
      if (stockfish) {
        queuedPositionCmd = null;
        queuedGoCmd = null;
        if (workerIsSearching) {
          ignoreCurrentSearch = true;
          if (!stopSentForCurrentSearch) {
            stopSentForCurrentSearch = true;
            stockfish.postMessage('stop');
          }
        } else {
          stockfish.postMessage('stop');
        }
      }
      break;

    case 'RAW_COMMAND':
      if (stockfish && cmd.command) {
        stockfish.postMessage(cmd.command);
      }
      break;

    case 'QUIT':
      workerIsSearching = false;
      stopSentForCurrentSearch = false;
      ignoreCurrentSearch = false;
      queuedOptions = [];
      queuedPositionCmd = null;
      queuedGoCmd = null;
      if (stockfish) {
        stockfish.postMessage('quit');
        stockfish = null;
        isReady = false;
        self.postMessage({ type: 'STATUS_CHANGE', status: 'terminated' });
      }
      break;
  }
};

