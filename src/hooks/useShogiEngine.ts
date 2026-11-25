/**
 * React Hook for Fairy-Stockfish Wasm Web Worker Engine.
 * Exposes live engine state, reactive evaluation updates, and asynchronous position search.
 * Zero UI thread blocking.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_ENGINE_ID,
  EngineId,
  EngineProfile,
  getAllEngineProfiles,
  getEngineProfile,
  subscribeEngineRegistryChange,
} from '../engine/engineConfig';
import { getSharedEngineBridge, ShogiEngineBridge } from '../engine/shogiEngineBridge';
import { EngineSearchInfo, EngineSearchResult, EngineStatus } from '../engine/types';
import { MoveEvaluation } from '../types/shogi';
import { loadAppSettings } from '../utils/appSettingsStorage';

export interface UseShogiEngineOptions {
  autoInit?: boolean;
}

export interface EngineLoadProgress {
  percent: number;
  message: string;
}

export interface UseShogiEngineReturn {
  status: EngineStatus;
  isReady: boolean;
  isSearching: boolean;
  activeEngineId: EngineId;
  activeEngineProfile: EngineProfile;
  loadProgress: EngineLoadProgress | null;
  availableEngines: EngineProfile[];
  currentInfo: EngineSearchInfo | null;
  latestResult: EngineSearchResult | null;
  evaluation: MoveEvaluation | null;
  init: () => Promise<void>;
  switchEngine: (engineId: EngineId) => Promise<void>;
  setOption: (name: string, value: string | number | boolean) => void;
  searchPosition: (
    sfen?: string,
    moves?: string[],
    options?: { depth?: number; movetime?: number; byoyomi?: number }
  ) => Promise<EngineSearchResult>;
  stop: () => void;
  error: string | null;
}

export function useShogiEngine(options: UseShogiEngineOptions = {}): UseShogiEngineReturn {
  const bridgeRef = useRef<ShogiEngineBridge>(
    getSharedEngineBridge({ defaultEngineId: loadAppSettings().defaultEngineId })
  );
  const [status, setStatus] = useState<EngineStatus>(() => bridgeRef.current.getStatus());
  const [activeEngineId, setActiveEngineId] = useState<EngineId>(() => bridgeRef.current.getActiveEngineId());
  const [availableEngines, setAvailableEngines] = useState<EngineProfile[]>(() => getAllEngineProfiles());
  const [loadProgress, setLoadProgress] = useState<EngineLoadProgress | null>(null);
  const [currentInfo, setCurrentInfo] = useState<EngineSearchInfo | null>(null);
  const [latestResult, setLatestResult] = useState<EngineSearchResult | null>(null);
  const [evaluation, setEvaluation] = useState<MoveEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAvailableEngines(getAllEngineProfiles());
    return subscribeEngineRegistryChange(() => {
      setAvailableEngines(getAllEngineProfiles());
    });
  }, []);


  useEffect(() => {
    const bridge = bridgeRef.current;

    const unsubStatus = bridge.onStatusChange((newStatus) => {
      setStatus(newStatus);
      if (newStatus === 'error') {
        setError('Engine encountered an error during initialization or search');
      }
    });

    const unsubInfo = bridge.onInfo((info) => {
      setCurrentInfo(info);
      if (info.scoreCp !== undefined) {
        setEvaluation({
          scoreCp: info.scoreCp,
          isMate: info.isMate,
          matePly: info.matePly,
          depth: info.depth,
          bestMove: info.bestMove,
          pv: info.pv,
          evaluatedAt: new Date().toISOString(),
        });
      }
    });

    const unsubBestMove = bridge.onBestMove((result) => {
      setLatestResult(result);
      if (result.evaluation) {
        setEvaluation(result.evaluation);
      }
    });

    const unsubProgress = bridge.onProgress((percent, message) => {
      setLoadProgress({ percent, message });
    });

    const unsubSwitched = bridge.onEngineSwitched((engineId) => {
      setActiveEngineId(engineId);
      setLoadProgress(null);
    });

    if (options.autoInit && bridge.getStatus() === 'uninitialized') {
      bridge.init().catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    }

    return () => {
      unsubStatus();
      unsubInfo();
      unsubBestMove();
      unsubProgress();
      unsubSwitched();
    };
  }, [options.autoInit]);

  const init = useCallback(async () => {
    setError(null);
    try {
      await bridgeRef.current.init();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    }
  }, []);

  const switchEngine = useCallback(async (engineId: EngineId) => {
    setError(null);
    setLoadProgress({ percent: 0, message: `Switching to ${engineId}...` });
    try {
      bridgeRef.current.switchEngine(engineId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    }
  }, []);

  const searchPosition = useCallback(
    async (
      sfen?: string,
      moves?: string[],
      searchOptions?: { depth?: number; movetime?: number; byoyomi?: number }
    ): Promise<EngineSearchResult> => {
      const bridge = bridgeRef.current;
      if (!bridge.isReady()) {
        await bridge.init();
      }

      bridge.setPosition(sfen, moves);
      return await bridge.search(searchOptions);
    },
    []
  );

  const stop = useCallback(() => {
    bridgeRef.current.stop();
  }, []);

  const setOption = useCallback((name: string, value: string | number | boolean) => {
    bridgeRef.current.setOption(name, value);
  }, []);

  const activeEngineProfile =
    getEngineProfile(activeEngineId) ??
    availableEngines[0] ??
    getEngineProfile(DEFAULT_ENGINE_ID)!;

  return {
    status,
    isReady: status === 'ready' || status === 'searching',
    isSearching: status === 'searching',
    activeEngineId,
    activeEngineProfile,
    loadProgress,
    availableEngines,
    currentInfo,
    latestResult,
    evaluation,
    init,
    switchEngine,
    setOption,
    searchPosition,
    stop,
    error,
  };
}

