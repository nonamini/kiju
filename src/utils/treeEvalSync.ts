/**
 * Synchronizes node evaluations produced in Tree mode back into unified
 * KifuRecord storage so Studio and Library share identical analysis status
 * and evaluation data (Issue #63, spec L3).
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { MoveEvaluation } from '../types/shogi';
import type { KifuTreeNode, MergedKifuTree } from '../types/tree';
import { getKifuRecord, updateKifuRecord } from './kifuRecordStorage';

function collectEvaluationsByGame(
  nodes: KifuTreeNode[],
  byGame: Map<string, Record<number, MoveEvaluation>>
): void {
  for (const node of nodes) {
    if (node.evaluation && node.move.ply > 0) {
      for (const ref of node.gameRefs) {
        let map = byGame.get(ref.gameId);
        if (!map) {
          map = {};
          byGame.set(ref.gameId, map);
        }
        map[node.move.ply] = node.evaluation;
      }
    }
    if (node.children.length > 0) {
      collectEvaluationsByGame(node.children, byGame);
    }
  }
}

/**
 * Merges evaluations from a MergedKifuTree into each referenced KifuRecord.
 * Returns the number of records updated.
 */
export function syncTreeEvaluationsToRecords(
  tree: MergedKifuTree,
  engineId?: string
): number {
  const byGame = new Map<string, Record<number, MoveEvaluation>>();
  collectEvaluationsByGame(tree.rootNodes, byGame);

  let updatedCount = 0;
  for (const [gameId, newEvals] of byGame.entries()) {
    const rec = getKifuRecord(gameId);
    if (!rec) continue;
    const mergedEvals: Record<number, MoveEvaluation> = {
      ...(rec.evaluations ?? {}),
      ...newEvals,
    };
    const nextStatus =
      rec.analysisStatus === 'queued' || rec.analysisStatus === 'processing'
        ? rec.analysisStatus
        : 'completed';
    const nextEngineId = rec.analysisEngineId ?? engineId;
    updateKifuRecord(gameId, {
      evaluations: mergedEvals,
      analysisStatus: nextStatus,
      analysisEngineId: nextEngineId,
      analyzedPliesCount: Object.keys(mergedEvals).length,
    });
    updatedCount++;
  }
  return updatedCount;
}
