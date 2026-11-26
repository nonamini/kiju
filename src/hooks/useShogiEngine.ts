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
import { MoveEvaluation, MultiPvCandidate } from '../types/shogi';
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
  candidates: MultiPvCandidate[];
  candidatesSfen: string | null;
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
  const [candidates, setCandidates] = useState<MultiPvCandidate[]>([]);
  const [candidatesSfen, setCandidatesSfen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const multiPvMapRef = useRef<Map<number, MultiPvCandidate>>(new Map());

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
      const mpRank = info.multipv || 1;
      if (info.scoreCp !== undefined) {
        const candUsi = info.bestMove ?? info.pv?.[0];
        if (candUsi) {
          multiPvMapRef.current.set(mpRank, {
            multipv: mpRank,
            usi: candUsi,
            scoreCp: info.scoreCp,
            isMate: info.isMate,
            matePly: info.matePly,
            pv: info.pv,
          });
          setCandidates(
            Array.from(multiPvMapRef.current.values()).sort(
              (a, b) => a.multipv - b.multipv
            )
          );
        }
      }

      if (mpRank === 1) {
        setCurrentInfo(info);
        if (info.scoreCp !== undefined) {
          const sortedCandidates = Array.from(multiPvMapRef.current.values()).sort(
            (a, b) => a.multipv - b.multipv
          );
          setEvaluation({
            scoreCp: info.scoreCp,
            isMate: info.isMate,
            matePly: info.matePly,
            depth: info.depth,
            bestMove: info.bestMove,
            pv: info.pv,
            candidates: sortedCandidates.length > 0 ? sortedCandidates : undefined,
            evaluatedAt: new Date().toISOString(),
          });
        }
      }
    });

    const unsubBestMove = bridge.onBestMove((result) => {
      setLatestResult(result);
      if (result.evaluation) {
        const fallbackCandidates = Array.from(multiPvMapRef.current.values()).sort(
          (a, b) => a.multipv - b.multipv
        );
        const mergedCandidates =
          result.evaluation.candidates && result.evaluation.candidates.length > 0
            ? result.evaluation.candidates
            : fallbackCandidates.length > 0
              ? fallbackCandidates
              : undefined;
        setEvaluation({
          ...result.evaluation,
          candidates: mergedCandidates,
        });
        setCandidates(mergedCandidates ?? []);
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

      multiPvMapRef.current.clear();
      setCandidates([]);
      setCandidatesSfen(sfen ?? null);
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
    candidates,
    candidatesSfen,
    init,
    switchEngine,
    setOption,
    searchPosition,
    stop,
    error,
  };
}

