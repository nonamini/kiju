import { describe, expect, it, vi } from 'vitest';
import {
  applyEvaluationsToPath,
  applyEvaluationsToTree,
  collectPathNodes,
  collectUniqueTreeNodes,
  executeBatchAnalysis,
  formatBestMoveKifString,
} from '../src/utils/treeAnalysisEngine';
import { mockTree } from '../src/mock/mockData';
import { ShogiBoard } from '../src/utils/shogiBoard';
import { EngineSearchResult } from '../src/engine/types';

describe('treeAnalysisEngine unit tests', () => {
  it('collects all unique nodes with correct move histories from tree', () => {
    const collected = collectUniqueTreeNodes(mockTree, false);
    expect(collected.length).toBeGreaterThan(0);

    // Root node 1 (7g7f) should have usiMoves: ['7g7f']
    const rootItem = collected[0];
    expect(rootItem).toBeDefined();
    expect(rootItem?.usiMoves).toEqual(['7g7f']);
    expect(rootItem?.ply).toBe(1);

    // Second ply node should have 2 moves
    const ply2Item = collected.find((item) => item.ply === 2);
    expect(ply2Item).toBeDefined();
    expect(ply2Item?.usiMoves.length).toBe(2);
    expect(ply2Item?.usiMoves[0]).toBe('7g7f');
  });

  it('filters out already evaluated nodes when skipAlreadyAnalyzed is true', () => {
    const unanalyzedTree = {
      ...mockTree,
      rootNodes: [
        {
          ...mockTree.rootNodes[0]!,
          evaluation: undefined,
          children: [],
        },
      ],
    };

    const allPositions = collectUniqueTreeNodes(unanalyzedTree, false);
    const skipPositions = collectUniqueTreeNodes(unanalyzedTree, true);

    expect(allPositions.length).toBe(1);
    expect(skipPositions.length).toBe(1);

    // When node has evaluation
    const analyzedTree = {
      ...mockTree,
      rootNodes: [
        {
          ...mockTree.rootNodes[0]!,
          evaluation: {
            scoreCp: 100,
            depth: 15,
            evaluatedAt: new Date().toISOString(),
          },
          children: [],
        },
      ],
    };

    const skipped = collectUniqueTreeNodes(analyzedTree, true);
    expect(skipped.length).toBe(0);
  });

  it('collects path nodes accurately', () => {
    const path = [mockTree.rootNodes[0]!, mockTree.rootNodes[0]!.children[0]!];
    const collected = collectPathNodes(path);

    expect(collected.length).toBe(2);
    expect(collected[0]?.usiMoves).toEqual(['7g7f']);
    expect(collected[1]?.usiMoves).toEqual(['7g7f', '8c8d']);
  });

  it('formats best move USI string into readable KIF', () => {
    const board = new ShogiBoard();
    const formatted = formatBestMoveKifString('7g7f', board, 1, 'b');
    expect(formatted).toBe('▲７六歩(77)');
  });

  it('executes batch analysis, reports progress, and returns evaluation map', async () => {
    const positions = collectPathNodes([mockTree.rootNodes[0]!]);

    const mockSearchResult: EngineSearchResult = {
      bestMove: '8c8d',
      evaluation: {
        scoreCp: 70,
        depth: 12,
        bestMove: '8c8d',
        pv: ['8c8d', '2g2f'],
        evaluatedAt: new Date().toISOString(),
      },
    };

    const mockEngine = {
      searchPosition: vi.fn().mockResolvedValue(mockSearchResult),
      stop: vi.fn(),
    };

    const progressReports: any[] = [];
    const evaluations = await executeBatchAnalysis(positions, mockEngine, {
      movetimeMs: 100,
      onProgress: (p) => progressReports.push(p),
    });

    expect(mockEngine.searchPosition).toHaveBeenCalledTimes(1);
    expect(evaluations.size).toBe(1);

    const firstNodeId = positions[0]!.node.id;
    const evaluated = evaluations.get(firstNodeId);
    expect(evaluated).toBeDefined();
    expect(evaluated?.scoreCp).toBe(70);
    expect(evaluated?.depth).toBe(12);
    expect(evaluated?.bestMove).toBe('8c8d');
    expect(evaluated?.bestMoveKif).toBe('△８四歩(83)');

    expect(progressReports.length).toBe(1);
    expect(progressReports[0]?.percent).toBe(100);
    expect(progressReports[0]?.analyzedCount).toBe(1);
  });

  it('halts batch analysis gracefully on abort signal', async () => {
    const positions = collectPathNodes([
      mockTree.rootNodes[0]!,
      mockTree.rootNodes[0]!.children[0]!,
    ]);

    const controller = new AbortController();
    const mockEngine = {
      searchPosition: vi.fn().mockImplementation(async () => {
        controller.abort(); // Abort after first call
        return {
          bestMove: '8c8d',
          evaluation: { scoreCp: 50, depth: 10, evaluatedAt: '' },
        };
      }),
      stop: vi.fn(),
    };

    const evaluations = await executeBatchAnalysis(positions, mockEngine, {
      signal: controller.signal,
    });

    // Should only have analyzed at most 1 before noticing abort
    expect(mockEngine.searchPosition).toHaveBeenCalledTimes(1);
    expect(evaluations.size).toBe(1);
  });

  it('immutably applies evaluations to tree and path', () => {
    const root = mockTree.rootNodes[0]!;
    const map = new Map();
    map.set(root.id, {
      scoreCp: 350,
      depth: 20,
      bestMove: '8c8d',
      evaluatedAt: new Date().toISOString(),
    });

    const updatedTree = applyEvaluationsToTree(mockTree, map);
    expect(updatedTree.rootNodes[0]?.evaluation?.scoreCp).toBe(350);
    expect(updatedTree.rootNodes[0]?.move.evaluation?.scoreCp).toBe(350);
    // Original tree remains unchanged
    expect(mockTree.rootNodes[0]?.evaluation?.scoreCp).not.toBe(350);

    const updatedPath = applyEvaluationsToPath([root], map);
    expect(updatedPath[0]?.evaluation?.scoreCp).toBe(350);
    expect(updatedPath[0]?.move.evaluation?.scoreCp).toBe(350);
  });
});
