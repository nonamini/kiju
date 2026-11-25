/**
 * React Hook for Tree and Game Batch Analysis.
 * Orchestrates sequential engine evaluations, progress tracking, and tree updates.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { useCallback, useRef, useState } from 'react';
import { UseShogiEngineReturn } from './useShogiEngine';
import { useSettings } from '../contexts/SettingsContext';
import { KifuTreeNode, MergedKifuTree } from '../types/tree';
import { Color, MoveEvaluation } from '../types/shogi';
import { ShogiBoard } from '../utils/shogiBoard';
import {
  applyEvaluationsToPath,
  applyEvaluationsToTree,
  BatchAnalysisProgress,
  collectPathNodes,
  collectUniqueTreeNodes,
  executeBatchAnalysis,
  formatBestMoveKifString,
} from '../utils/treeAnalysisEngine';

export interface UseBatchAnalysisOptions {
  engine: UseShogiEngineReturn;
}

export interface RunAnalysisOptions {
  movetimeMs?: number;
  depth?: number;
  skipAlreadyAnalyzed?: boolean;
}

export interface UseBatchAnalysisReturn {
  isAnalyzing: boolean;
  progress: BatchAnalysisProgress | null;
  error: string | null;
  analyzeTree: (
    tree: MergedKifuTree,
    options?: RunAnalysisOptions
  ) => Promise<MergedKifuTree | null>;
  analyzePath: (
    path: KifuTreeNode[],
    options?: RunAnalysisOptions
  ) => Promise<KifuTreeNode[] | null>;
  analyzeSinglePosition: (
    board: ShogiBoard,
    usiMoves: string[],
    ply: number,
    sideToMove: Color,
    options?: { movetimeMs?: number; depth?: number }
  ) => Promise<MoveEvaluation | null>;
  cancelAnalysis: () => void;
}

export function useBatchAnalysis({
  engine,
}: UseBatchAnalysisOptions): UseBatchAnalysisReturn {
  const { settings } = useSettings();
  const defaultDepth = settings.defaultAnalysisDepth;
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<BatchAnalysisProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const cancelAnalysis = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    engine.stop();
    setIsAnalyzing(false);
  }, [engine]);

  const analyzeTree = useCallback(
    async (
      tree: MergedKifuTree,
      options: RunAnalysisOptions = {}
    ): Promise<MergedKifuTree | null> => {
      if (isAnalyzing) return null;

      try {
        setError(null);
        setIsAnalyzing(true);
        const controller = new AbortController();
        abortControllerRef.current = controller;

        if (!engine.isReady) {
          await engine.init();
        }

        const positions = collectUniqueTreeNodes(
          tree,
          options.skipAlreadyAnalyzed ?? false
        );

        if (positions.length === 0) {
          setIsAnalyzing(false);
          return tree;
        }

        setProgress({
          analyzedCount: 0,
          totalCount: positions.length,
          skippedCount: 0,
          percent: 0,
          currentNodeId: '',
          currentMoveKif: '',
          currentPly: 0,
        });

        const evaluationMap = await executeBatchAnalysis(positions, engine, {
          movetimeMs: options.movetimeMs ?? 300,
          depth: options.depth ?? defaultDepth,
          skipAlreadyAnalyzed: options.skipAlreadyAnalyzed,
          onProgress: (p) => setProgress(p),
          signal: controller.signal,
        });

        const updatedTree = applyEvaluationsToTree(tree, evaluationMap);
        return updatedTree;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return null;
      } finally {
        setIsAnalyzing(false);
        abortControllerRef.current = null;
      }
    },
    [engine, isAnalyzing, defaultDepth]
  );

  const analyzePath = useCallback(
    async (
      path: KifuTreeNode[],
      options: RunAnalysisOptions = {}
    ): Promise<KifuTreeNode[] | null> => {
      if (isAnalyzing || path.length === 0) return null;

      try {
        setError(null);
        setIsAnalyzing(true);
        const controller = new AbortController();
        abortControllerRef.current = controller;

        if (!engine.isReady) {
          await engine.init();
        }

        const positions = collectPathNodes(
          path,
          options.skipAlreadyAnalyzed ?? false
        );

        if (positions.length === 0) {
          setIsAnalyzing(false);
          return path;
        }

        setProgress({
          analyzedCount: 0,
          totalCount: positions.length,
          skippedCount: 0,
          percent: 0,
          currentNodeId: '',
          currentMoveKif: '',
          currentPly: 0,
        });

        const evaluationMap = await executeBatchAnalysis(positions, engine, {
          movetimeMs: options.movetimeMs ?? 300,
          depth: options.depth ?? defaultDepth,
          skipAlreadyAnalyzed: options.skipAlreadyAnalyzed,
          onProgress: (p) => setProgress(p),
          signal: controller.signal,
        });

        const updatedPath = applyEvaluationsToPath(path, evaluationMap);
        return updatedPath;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return null;
      } finally {
        setIsAnalyzing(false);
        abortControllerRef.current = null;
      }
    },
    [engine, isAnalyzing, defaultDepth]
  );

  const analyzeSinglePosition = useCallback(
    async (
      board: ShogiBoard,
      usiMoves: string[],
      ply: number,
      sideToMove: Color,
      options: { movetimeMs?: number; depth?: number } = {}
    ): Promise<MoveEvaluation | null> => {
      if (isAnalyzing) return null;

      try {
        setError(null);
        if (!engine.isReady) {
          await engine.init();
        }

        const result = await engine.searchPosition(undefined, usiMoves, {
          movetime: options.movetimeMs ?? 500,
          depth: options.depth ?? defaultDepth,
        });

        const bestMoveUsi = result.bestMove?.trim();
        const bestMoveKif = formatBestMoveKifString(
          bestMoveUsi,
          board,
          ply,
          sideToMove
        );

        const evaluation: MoveEvaluation = {
          scoreCp: result.evaluation?.scoreCp ?? 0,
          depth: result.evaluation?.depth ?? options.depth ?? defaultDepth,
          bestMove: bestMoveUsi,
          bestMoveKif,
          pv: result.evaluation?.pv,
          isMate: result.evaluation?.isMate,
          matePly: result.evaluation?.matePly,
          evaluatedAt: new Date().toISOString(),
        };

        return evaluation;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        return null;
      }
    },
    [engine, isAnalyzing, defaultDepth]
  );

  return {
    isAnalyzing,
    progress,
    error,
    analyzeTree,
    analyzePath,
    analyzeSinglePosition,
    cancelAnalysis,
  };
}
