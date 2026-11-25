/**
 * Bidirectional Converter between TacticsNoteItem and JKFPlayer / JSONKifuFormat.
 * Converts tactics sequences, branches, comments, and metadata into a complete JKF structure
 * so that both TacticsDetailPage and Studio can share the exact same branch tree model.
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import { JKFPlayer, Formats } from 'json-kifu-format';
import type { KifuRecord } from '../types/kifuRecord';
import { TacticsNoteItem } from '../types/tacticsNote';
import { parseUsiMove, cleanJkfFalsyPromotions } from './usiFormatter';
import { SavedStudioGame } from './studioKifuStorage';
import { getTacticsItemById, saveTacticsItem } from './tacticsStorage';

/**
 * Creates a SavedStudioGame from a TacticsNoteItem, ready to be loaded into Studio.
 */
export function createStudioGameFromTactic(item: TacticsNoteItem): SavedStudioGame {
  const player = createJkfPlayerFromTactic(item);
  const now = new Date().toISOString();

  // Convert evalHistory if present
  const evaluations: SavedStudioGame['evaluations'] = {};
  if (item.evalHistory) {
    for (const ev of item.evalHistory) {
      evaluations[ev.ply] = {
        scoreCp: ev.scoreCp,
        isMate: ev.isMate,
        depth: 10,
        evaluatedAt: now,
      };
    }
  }

  return {
    id: `tactic_game_${item.id}`,
    title: item.title,
    senteName: '先手',
    goteName: '後手',
    gameKind: 'joseki',
    openingId: item.tag || 'tactic',
    openingName: item.title,
    totalPlies: player.getMaxTesuu(),
    forkCount: (item.branches?.length ?? 0),
    jkfJson: JSON.stringify(player.kifu),
    evaluations: Object.keys(evaluations).length > 0 ? evaluations : undefined,
    tags: Array.from(new Set(['定跡', item.tag].filter(Boolean))),
    tournament: item.sourceGame?.tournament,
    matchDate: item.sourceGame?.matchDate,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Syncs updated jkfJson and evaluations from a `tactic_game_*` KifuRecord
 * back into its source TacticsNoteItem in tacticsStorage.
 */
export function syncKifuRecordToTacticsNote(rec: KifuRecord): TacticsNoteItem | null {
  if (!rec.id.startsWith('tactic_game_')) return null;
  const tacticId = rec.id.replace(/^tactic_game_/, '');
  const existing = getTacticsItemById(tacticId);
  if (!existing) return null;

  let changed = false;
  let nextJkfJson = existing.jkfJson;
  if (rec.jkfJson && rec.jkfJson !== '{}' && rec.jkfJson !== existing.jkfJson) {
    nextJkfJson = rec.jkfJson;
    changed = true;
  }

  let nextEvalHistory = existing.evalHistory;
  if (rec.evaluations && Object.keys(rec.evaluations).length > 0) {
    const converted = Object.entries(rec.evaluations)
      .map(([plyStr, val]) => ({
        ply: Number(plyStr),
        scoreCp: val.scoreCp,
        isMate: val.isMate,
      }))
      .filter((e) => !Number.isNaN(e.ply))
      .sort((a, b) => a.ply - b.ply);
    if (
      converted.length > 0 &&
      JSON.stringify(converted) !== JSON.stringify(existing.evalHistory ?? [])
    ) {
      nextEvalHistory = converted;
      changed = true;
    }
  }

  if (!changed) return existing;

  const updated: TacticsNoteItem = {
    ...existing,
    jkfJson: nextJkfJson,
    evalHistory: nextEvalHistory,
    isCustom: true,
    updatedAt: new Date().toISOString(),
  };
  saveTacticsItem(updated);
  return updated;
}

/**
 * Batch syncs all `tactic_game_*` KifuRecords (e.g. after cloud analysis pull)
 * back to `tacticsStorage`.
 */
export function syncTacticRecordsFromLibrary(records: KifuRecord[]): number {
  let updatedCount = 0;
  for (const rec of records) {
    if (!rec.id.startsWith('tactic_game_') || rec.deletedAt) continue;
    const before = getTacticsItemById(rec.id.replace(/^tactic_game_/, ''));
    const after = syncKifuRecordToTacticsNote(rec);
    if (before && after && after.updatedAt !== before.updatedAt) {
      updatedCount += 1;
    }
  }
  return updatedCount;
}

/**
 * Creates a fully initialized JKFPlayer from a TacticsNoteItem.
 * Builds the mainline moves and adds branches as JKF forks.
 */
export function createJkfPlayerFromTactic(item: TacticsNoteItem): JKFPlayer {
  // If item already contains full JKF tree (including branches, forks, comments), restore directly!
  if (item.jkfJson) {
    try {
      const parsed = JSON.parse(item.jkfJson);
      if (parsed && Array.isArray(parsed.moves) && parsed.moves.length > 0) {
        cleanJkfFalsyPromotions(parsed.moves);
        if (item.moveComments && item.moveComments.length > 0) {
          for (const c of item.moveComments) {
            if (c.ply >= 0 && c.ply < parsed.moves.length && parsed.moves[c.ply]) {
              parsed.moves[c.ply].comments = c.comment ? [c.comment] : [];
            }
          }
        }
        const player = new JKFPlayer(parsed);
        player.goto(0);
        return player;
      }
    } catch (err) {
      console.warn('[tacticsJkfConverter] Failed to parse jkfJson, falling back to move assembly:', err);
    }
  }

  const header: Record<string, string> = {
    '先手': '先手',
    '後手': '後手',
    '戦型': item.title,
    '手合割': '平手',
  };

  if (item.sourceGame?.tournament) {
    header['棋戦'] = item.sourceGame.tournament;
  }
  if (item.sourceGame?.matchDate) {
    header['対局日'] = item.sourceGame.matchDate;
  }

  // Base JKF structure
  const jkf: Formats.JSONKifuFormat = {
    header,
    moves: [{}],
  };

  const player = new JKFPlayer(jkf);

  if (item.sfen) {
    try {
      player.shogi.initializeFromSFENString(item.sfen);
    } catch (err) {
      console.warn('[tacticsJkfConverter] Failed to initialize from SFEN:', item.sfen, err);
    }
  }

  // 1. Play mainline moves
  const mainMoves = item.moves || [];
  for (let i = 0; i < mainMoves.length; i++) {
    const usi = mainMoves[i];
    if (!usi) continue;
    const parsed = parseUsiMove(usi, player.shogi);
    if (parsed) {
      try {
        player.inputMove({
          from: parsed.from ? { x: parsed.from.x, y: parsed.from.y } : undefined,
          to: { x: parsed.to.x, y: parsed.to.y },
          piece: parsed.piece,
          promote: parsed.promote,
        });
      } catch (err) {
        console.warn('[tacticsJkfConverter] Failed to apply mainline move:', usi, err);
        break;
      }

      // Attach comment if available
      const ply = i + 1;
      const commentObj = item.moveComments?.find((c) => c.ply === ply);
      if (commentObj && commentObj.comment) {
        const moveFormat = player.getMoveFormat(ply);
        if (moveFormat) {
          moveFormat.comments = [commentObj.comment];
        }
      }
    }
  }

  // 2. Add branches as forks
  if (item.branches && item.branches.length > 0) {
    for (const branch of item.branches) {
      if (!branch.moves || branch.moves.length === 0) continue;

      // Find common prefix with mainline to know where this branch starts
      let commonPrefixLen = 0;
      const minLen = Math.min(mainMoves.length, branch.moves.length);
      for (let i = 0; i < minLen; i++) {
        if (mainMoves[i] === branch.moves[i]) {
          commonPrefixLen++;
        } else {
          break;
        }
      }

      // Navigate player to the branch point
      player.goto(commonPrefixLen);

      // Play the diverging moves for this branch
      for (let j = commonPrefixLen; j < branch.moves.length; j++) {
        const usi = branch.moves[j];
        if (!usi) continue;
        const parsed = parseUsiMove(usi, player.shogi);
        if (parsed) {
          try {
            player.inputMove({
              from: parsed.from ? { x: parsed.from.x, y: parsed.from.y } : undefined,
              to: { x: parsed.to.x, y: parsed.to.y },
              piece: parsed.piece,
              promote: parsed.promote,
            });
          } catch (err) {
            console.warn('[tacticsJkfConverter] Failed to apply branch move:', usi, err);
            break;
          }

          const branchPly = j + 1;
          const commentObj = branch.moveComments?.find((c) => c.ply === branchPly);
          if (commentObj && commentObj.comment) {
            const moveFormat = player.getMoveFormat(branchPly);
            if (moveFormat) {
              moveFormat.comments = [commentObj.comment];
            }
          }
        }
      }
    }
  }

  // Rewind to initial ply 0
  player.goto(0);
  return player;
}
