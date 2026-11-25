/**
 * Multi-Branch Shogi Tree Merger Algorithm.
 * Merges multiple IngestedGame records into a single MergedKifuTree.
 * Automatically marks highest adoption moves as isMainline: true.
 * Strictly English code, comments, and variables (Rule 1).
 */

import { Color, ShogiMove } from '../types/shogi';
import { IngestedGame, KifuTreeNode, MergedKifuTree } from '../types/tree';
import { ParsedVariation } from './kifParser';
import { INITIAL_HIRATE_SFEN, ShogiBoard } from './shogiBoard';

export interface GameMergeInput {
  game: IngestedGame;
  moves: ShogiMove[];
  variations?: ParsedVariation[];
}

export interface TreeMergeOptions {
  openingId?: string;
  openingName?: string;
  rootSfen?: string;
}

/**
 * Generates a unique, deterministic ID for a tree node.
 */
function generateNodeId(ply: number, sfenMove: string, sfen: string): string {
  let hash = 0;
  for (let i = 0; i < sfen.length; i++) {
    hash = (hash << 5) - hash + sfen.charCodeAt(i);
    hash |= 0;
  }
  return `node_${ply}_${sfenMove}_${Math.abs(hash).toString(16)}`;
}

/**
 * Formats aggregated win statistics into node comment.
 */
function formatStatsComment(gameCount: number, wins: { sente: number; gote: number; draw: number }): string {
  const sentePct = gameCount > 0 ? ((wins.sente / gameCount) * 100).toFixed(1) : '0.0';
  const gotePct = gameCount > 0 ? ((wins.gote / gameCount) * 100).toFixed(1) : '0.0';
  return `Games: ${gameCount} | Sente: ${wins.sente} (${sentePct}%) | Gote: ${wins.gote} (${gotePct}%) | Draw: ${wins.draw}`;
}

/**
 * Recursively sorts child nodes by adoption frequency and determines mainline branches.
 */
function finalizeTreeHierarchy(nodes: KifuTreeNode[]): void {
  if (nodes.length === 0) return;

  // Sort descending by adoption count
  nodes.sort((a, b) => b.gameCount - a.gameCount);

  // Highest frequency move becomes the mainline
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;

    node.isMainline = i === 0;
    const baseComment = formatStatsComment(node.gameCount, node.wins);
    const hasSparring = node.gameRefs.some((r) => r.gameId.startsWith('sparring_') || r.title.includes('Sparring'));
    node.comment = hasSparring ? `${baseComment} | [Sparring]` : baseComment;
    finalizeTreeHierarchy(node.children);
  }
}

/**
 * Finds a node at a given ply along the mainline or branch path.
 */
function findNodeAtPly(nodes: KifuTreeNode[], targetPly: number): { node: KifuTreeNode; board: ShogiBoard } | null {
  const board = new ShogiBoard();

  function dfs(currentNodes: KifuTreeNode[], currentBoard: ShogiBoard): { node: KifuTreeNode; board: ShogiBoard } | null {
    for (const n of currentNodes) {
      const nextBoard = currentBoard.clone();
      nextBoard.applyMove(n.move);

      if (n.move.ply === targetPly) {
        return { node: n, board: nextBoard };
      }
      if (n.move.ply < targetPly) {
        const found = dfs(n.children, nextBoard);
        if (found) return found;
      }
    }
    return null;
  }

  return dfs(nodes, board);
}

/**
 * Merges an array of parsed games into a single multi-branch tree.
 *
 * @param inputs Array of parsed games with their moves and optional variations
 * @param options Optional configuration overrides
 * @returns Fully populated MergedKifuTree
 */
export function mergeGamesIntoTree(
  inputs: GameMergeInput[],
  options: TreeMergeOptions = {}
): MergedKifuTree {
  const validInputs = inputs.filter((input) => input.game.isIncluded !== false);
  const firstInput = validInputs[0];

  const openingId = options.openingId ?? firstInput?.game.openingId ?? 'unclassified';
  const openingName = options.openingName ?? firstInput?.game.title ?? 'Opening Repertoire Tree';
  const rootSfen = options.rootSfen ?? INITIAL_HIRATE_SFEN;

  const rootNodes: KifuTreeNode[] = [];
  let totalGames = 0;

  for (const item of validInputs) {
    const { game, moves, variations } = item;
    totalGames++;

    const winner: Color | 'draw' =
      game.winner === 'b' || game.winner === 'w' || game.winner === 'draw'
        ? game.winner
        : 'draw';

    const gameRef = {
      gameId: game.id,
      title: game.title,
      date: game.date ?? '',
      winner,
    };

    // 1. Merge mainline moves
    const board = new ShogiBoard();
    let currentChildren = rootNodes;

    for (const move of moves) {
      board.applyMove(move);
      const sfen = board.toSfen();

      let targetNode = currentChildren.find((n) => n.move.sfenMove === move.sfenMove);

      if (!targetNode) {
        targetNode = {
          id: generateNodeId(move.ply, move.sfenMove, sfen),
          sfen,
          move,
          comment: '',
          evaluation: move.evaluation,
          gameCount: 1,
          wins: {
            sente: winner === 'b' ? 1 : 0,
            gote: winner === 'w' ? 1 : 0,
            draw: winner === 'draw' ? 1 : 0,
          },
          gameRefs: [{ ...gameRef }],
          children: [],
          isMainline: false,
        };
        currentChildren.push(targetNode);
      } else {
        targetNode.gameCount++;
        if (winner === 'b') targetNode.wins.sente++;
        else if (winner === 'w') targetNode.wins.gote++;
        else targetNode.wins.draw++;

        if (!targetNode.gameRefs.some((r) => r.gameId === game.id)) {
          targetNode.gameRefs.push({ ...gameRef });
        }

        // Attach or update engine evaluation if incoming has higher search depth
        if (move.evaluation) {
          if (!targetNode.evaluation || (move.evaluation.depth > (targetNode.evaluation.depth ?? 0))) {
            targetNode.evaluation = move.evaluation;
          }
        }
      }

      currentChildren = targetNode.children;
    }

    // 2. Merge variations if present (e.g. from KIF variation blocks)
    if (variations && variations.length > 0) {
      for (const variation of variations) {
        if (variation.moves.length === 0) continue;

        let varChildren: KifuTreeNode[];
        let varBoard: ShogiBoard;

        if (variation.branchPly <= 1) {
          varChildren = rootNodes;
          varBoard = new ShogiBoard();
        } else {
          const parent = findNodeAtPly(rootNodes, variation.branchPly - 1);
          if (!parent) continue;
          varChildren = parent.node.children;
          varBoard = parent.board.clone();
        }

        for (const varMove of variation.moves) {
          varBoard.applyMove(varMove);
          const varSfen = varBoard.toSfen();

          let node = varChildren.find((n) => n.move.sfenMove === varMove.sfenMove);
          if (!node) {
            node = {
              id: generateNodeId(varMove.ply, varMove.sfenMove, varSfen),
              sfen: varSfen,
              move: varMove,
              comment: '',
              evaluation: varMove.evaluation,
              gameCount: 1,
              wins: {
                sente: winner === 'b' ? 1 : 0,
                gote: winner === 'w' ? 1 : 0,
                draw: winner === 'draw' ? 1 : 0,
              },
              gameRefs: [{ ...gameRef }],
              children: [],
              isMainline: false,
            };
            varChildren.push(node);
          } else {
            node.gameCount++;
            if (!node.gameRefs.some((r) => r.gameId === game.id)) {
              node.gameRefs.push({ ...gameRef });
            }
          }

          varChildren = node.children;
        }
      }
    }
  }

  // Finalize hierarchy: sort by popularity and assign mainline markers
  finalizeTreeHierarchy(rootNodes);

  return {
    openingId,
    openingName,
    rootSfen,
    rootNodes,
    totalGames,
    updatedAt: new Date().toISOString(),
  };
}
