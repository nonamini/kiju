/**
 * Multi-Branch KIF Serializer.
 * Serializes a MergedKifuTree back into standard KIF text with 変化：〇手 blocks.
 * Conforms to KIF version 2.0 specifications.
 * Strictly English identifiers, types, and comments (Rule 1).
 */

import { ShogiMove, Square } from '../types/shogi';
import { KifuTreeNode, MergedKifuTree } from '../types/tree';

export interface KifSerializerOptions {
  maxPly?: number;
  includeStatsComments?: boolean;
  includeEngineEval?: boolean;
  senteName?: string;
  goteName?: string;
  tournament?: string;
}

const FILE_KANJI: Record<number, string> = {
  1: '１', 2: '２', 3: '３', 4: '４', 5: '５', 6: '６', 7: '７', 8: '８', 9: '９',
};

const RANK_KANJI: Record<number, string> = {
  1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九',
};

const PIECE_KANJI: Record<string, string> = {
  FU: '歩',
  KY: '香',
  KE: '桂',
  GI: '銀',
  KI: '金',
  KA: '角',
  HI: '飛',
  OU: '玉',
  TO: 'と',
  NY: '成香',
  NK: '成桂',
  NG: '成銀',
  UM: '馬',
  RY: '龍',
};

/**
 * Formats a single ShogiMove into standard KIF move notation.
 * e.g. "７六歩(77)", "同　銀(87)", "５二金打"
 */
export function formatKifMove(move: ShogiMove, prevDest?: Square): string {
  let destPart = '';
  if (prevDest && prevDest.file === move.to.file && prevDest.rank === move.to.rank) {
    destPart = '同　';
  } else {
    destPart = `${FILE_KANJI[move.to.file] ?? '?'}${RANK_KANJI[move.to.rank] ?? '?'}`;
  }

  const pieceName = PIECE_KANJI[move.piece] ?? '歩';
  const promotePart = move.promote ? '成' : '';
  const fromPart =
    move.isDrop || !move.from
      ? '打'
      : `(${move.from.file}${move.from.rank})`;

  return `${destPart}${pieceName}${promotePart}${fromPart}`;
}

interface QueuedBranch {
  branchPly: number;
  startNode: KifuTreeNode;
  prevDest?: Square;
}

/**
 * Serializes a MergedKifuTree into standard KIF text with 変化:〇手 variation blocks.
 *
 * @param tree Merged opening repertoire tree
 * @param options Export options (maxPly, includeStatsComments, etc.)
 * @returns KIF formatted text string
 */
export function serializeTreeToKif(
  tree: MergedKifuTree,
  options: KifSerializerOptions = {}
): string {
  const maxPly = options.maxPly ?? 999;
  const includeStats = options.includeStatsComments ?? true;
  const includeEval = options.includeEngineEval ?? true;

  const lines: string[] = [];

  // Header metadata
  lines.push('#KIF version=2.0');
  lines.push('手合割：平手');
  if (options.senteName) lines.push(`先手：${options.senteName}`);
  if (options.goteName) lines.push(`後手：${options.goteName}`);
  lines.push(`棋戦：${options.tournament ?? tree.openingName}`);
  lines.push('手数----指手---------消費時間--');

  const branchQueue: QueuedBranch[] = [];

  // 1. Process Mainline
  let currentNode: KifuTreeNode | undefined = tree.rootNodes[0];
  let prevDest: Square | undefined;

  // Queue any alternative initial moves at move 1
  for (let i = 1; i < tree.rootNodes.length; i++) {
    const altRoot = tree.rootNodes[i];
    if (altRoot) {
      branchQueue.push({ branchPly: 1, startNode: altRoot });
    }
  }

  while (currentNode && currentNode.move.ply <= maxPly) {
    const move = currentNode.move;
    const moveStr = formatKifMove(move, prevDest);
    const hasBranches = currentNode.children.length > 1;

    // Queue alternative variation branches at next ply
    for (let i = 1; i < currentNode.children.length; i++) {
      const altChild = currentNode.children[i];
      if (altChild && altChild.move.ply <= maxPly) {
        branchQueue.push({
          branchPly: altChild.move.ply,
          startNode: altChild,
          prevDest: currentNode.move.to,
        });
      }
    }

    const plyStr = move.ply.toString().padStart(4, ' ');
    const paddedMove = moveStr.padEnd(12, ' ');
    const branchMark = hasBranches ? '+' : '';
    lines.push(`${plyStr} ${paddedMove}   ( 0:00/00:00:00)${branchMark}`);

    if (includeStats && currentNode.comment) {
      lines.push(`*#${currentNode.comment}`);
    }

    if (includeEval && currentNode.evaluation) {
      const ev = currentNode.evaluation;
      lines.push(`**解析 0 候補1 深さ ${ev.depth} 評価値 ${ev.scoreCp}`);
    }

    prevDest = move.to;
    // Follow the primary mainline child
    currentNode = currentNode.children.find((c) => c.isMainline) ?? currentNode.children[0];
  }

  // 2. Process Variations (変化：〇手)
  while (branchQueue.length > 0) {
    const branch = branchQueue.shift();
    if (!branch) continue;

    lines.push('');
    lines.push(`変化：${branch.branchPly}手`);

    let branchCurrent: KifuTreeNode | undefined = branch.startNode;
    let branchPrevDest: Square | undefined = branch.prevDest;

    while (branchCurrent && branchCurrent.move.ply <= maxPly) {
      const move = branchCurrent.move;
      const moveStr = formatKifMove(move, branchPrevDest);
      const hasBranches = branchCurrent.children.length > 1;

      for (let i = 1; i < branchCurrent.children.length; i++) {
        const subAlt = branchCurrent.children[i];
        if (subAlt && subAlt.move.ply <= maxPly) {
          branchQueue.push({
            branchPly: subAlt.move.ply,
            startNode: subAlt,
            prevDest: branchCurrent.move.to,
          });
        }
      }

      const plyStr = move.ply.toString().padStart(4, ' ');
      const paddedMove = moveStr.padEnd(12, ' ');
      const branchMark = hasBranches ? '+' : '';
      lines.push(`${plyStr} ${paddedMove}   ( 0:00/00:00:00)${branchMark}`);

      if (includeStats && branchCurrent.comment) {
        lines.push(`*#${branchCurrent.comment}`);
      }

      if (includeEval && branchCurrent.evaluation) {
        const ev = branchCurrent.evaluation;
        lines.push(`**解析 0 候補1 深さ ${ev.depth} 評価値 ${ev.scoreCp}`);
      }

      branchPrevDest = move.to;
      branchCurrent = branchCurrent.children.find((c) => c.isMainline) ?? branchCurrent.children[0];
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Serializes a single linear sequence of ShogiMoves into standard KIF text.
 */
export function serializeMovesToKif(
  moves: ShogiMove[],
  options: {
    senteName?: string;
    goteName?: string;
    title?: string;
    date?: string;
    result?: string;
  } = {}
): string {
  const lines: string[] = [];
  lines.push('# --- KIF format created by joseki-tree ---');
  if (options.date) lines.push(`対局日：${options.date}`);
  if (options.title) lines.push(`棋戦：${options.title}`);
  lines.push(`先手：${options.senteName ?? '先手'}`);
  lines.push(`後手：${options.goteName ?? '後手'}`);
  lines.push('手合割：平手');
  lines.push('手数----指手---------消費時間--');

  let prevDest: Square | undefined;

  for (const move of moves) {
    const plyStr = move.ply.toString().padStart(4, ' ');
    const moveStr = formatKifMove(move, prevDest);
    const paddedMove = moveStr.padEnd(12, ' ');
    lines.push(`${plyStr} ${paddedMove}   ( 0:00/00:00:00)`);

    if (move.evaluation) {
      const ev = move.evaluation;
      lines.push(`**解析 0 候補1 深さ ${ev.depth} 評価値 ${ev.scoreCp}`);
    }

    prevDest = move.to;
  }

  if (options.result) {
    const lastPly = (moves.length + 1).toString().padStart(4, ' ');
    lines.push(`${lastPly} ${options.result.padEnd(12, ' ')}   ( 0:00/00:00:00)`);
  }

  return lines.join('\n') + '\n';
}

