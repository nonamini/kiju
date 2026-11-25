/**
 * Multi-Branch Shogi Tree Navigation Utilities.
 * Handles active branch path derivation, candidate move selection at junction plies,
 * timeline branching, and breadcrumb path tracking.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { KifuTreeNode, MergedKifuTree } from '../types/tree';
import { ShogiMove } from '../types/shogi';
import { ShogiBoard } from './shogiBoard';

/**
 * Derives the default mainline path from root nodes to the deepest mainline leaf.
 */
export function getDefaultMainlinePath(tree: MergedKifuTree | null): KifuTreeNode[] {
  if (!tree || tree.rootNodes.length === 0) return [];

  const path: KifuTreeNode[] = [];
  let current: KifuTreeNode | undefined =
    tree.rootNodes.find((n) => n.isMainline) ?? tree.rootNodes[0];

  while (current) {
    path.push(current);
    if (!current.children || current.children.length === 0) break;
    current = current.children.find((c) => c.isMainline) ?? current.children[0];
  }

  return path;
}

/**
 * Extends from a given node down to the leaf following the highest adoption mainline.
 */
export function extendPathWithMainline(startNode: KifuTreeNode): KifuTreeNode[] {
  const extension: KifuTreeNode[] = [];
  let current: KifuTreeNode | undefined =
    startNode.children?.find((c) => c.isMainline) ?? startNode.children?.[0];

  while (current) {
    extension.push(current);
    if (!current.children || current.children.length === 0) break;
    current = current.children.find((c) => c.isMainline) ?? current.children[0];
  }

  return extension;
}

/**
 * Finds the full path from root nodes to a specific target node by ID.
 */
export function findPathToNode(
  nodes: KifuTreeNode[],
  targetId: string,
  prefix: KifuTreeNode[] = []
): KifuTreeNode[] | null {
  for (const node of nodes) {
    const currentPath = [...prefix, node];
    if (node.id === targetId) {
      return currentPath;
    }
    if (node.children && node.children.length > 0) {
      const childResult = findPathToNode(node.children, targetId, currentPath);
      if (childResult) return childResult;
    }
  }
  return null;
}

/**
 * Derives the active path in the tree that follows a specific game's moves.
 */
export function findPathForGame(
  tree: MergedKifuTree | null,
  gameId: string
): KifuTreeNode[] {
  if (!tree || tree.rootNodes.length === 0) return [];

  const path: KifuTreeNode[] = [];
  let currentList = tree.rootNodes;

  while (currentList && currentList.length > 0) {
    // Find node that contains this game in gameRefs
    const matchingNode =
      currentList.find((n) => n.gameRefs.some((ref) => ref.gameId === gameId)) ??
      currentList.find((n) => n.isMainline) ??
      currentList[0];

    if (!matchingNode) break;
    path.push(matchingNode);

    // If matchingNode does not have this game, stop or follow mainline
    const hasGame = matchingNode.gameRefs.some((ref) => ref.gameId === gameId);
    if (!hasGame || !matchingNode.children || matchingNode.children.length === 0) {
      break;
    }
    currentList = matchingNode.children;
  }

  return path;
}


/**
 * Returns the candidate branching moves available at a given ply.
 * - At ply 1: returns all rootNodes (e.g. 7g7f, 2g2f).
 * - At ply k (k > 1): returns the children of the node at ply k - 1.
 */
export function getCandidateMovesAtPly(
  tree: MergedKifuTree | null,
  activePath: KifuTreeNode[],
  ply: number
): KifuTreeNode[] {
  if (!tree || ply < 1) return [];

  if (ply === 1) {
    return tree.rootNodes;
  }

  const parentIndex = ply - 2;
  const parentNode = activePath[parentIndex];
  return parentNode?.children ?? [];
}

/**
 * Switches the active branch at a specified ply to a new target node,
 * automatically completing the remaining downstream path following that branch's mainline.
 */
export function switchBranchAtPly(
  currentPath: KifuTreeNode[],
  targetNode: KifuTreeNode,
  ply: number
): KifuTreeNode[] {
  // Retain nodes up to ply - 1
  const preservedPath = currentPath.slice(0, Math.max(0, ply - 1));
  const downstreamExtension = extendPathWithMainline(targetNode);
  return [...preservedPath, targetNode, ...downstreamExtension];
}

/**
 * Derives an array of ShogiBoard states from an active path of tree nodes.
 * Index 0 is the starting Hirate board (ply 0), index k is the board after move k.
 */
export function deriveBoardHistoryFromPath(path: KifuTreeNode[]): ShogiBoard[] {
  const history: ShogiBoard[] = [new ShogiBoard()];
  let current = history[0]!;

  for (const node of path) {
    const next = current.clone();
    next.applyMove(node.move);
    history.push(next);
    current = next;
  }

  return history;
}

/**
 * Extracts ShogiMove[] from active path of tree nodes.
 */
export function extractMovesFromPath(path: KifuTreeNode[]): ShogiMove[] {
  return path.map((node) => node.move);
}

/**
 * Immutably updates the comment of a specific node in a MergedKifuTree.
 */
export function updateNodeCommentInTree(
  tree: MergedKifuTree,
  nodeId: string,
  newComment: string
): MergedKifuTree {
  function mapNode(node: KifuTreeNode): KifuTreeNode {
    const isTarget = node.id === nodeId;
    return {
      ...node,
      comment: isTarget ? newComment : node.comment,
      children: node.children.map(mapNode),
    };
  }

  return {
    ...tree,
    rootNodes: tree.rootNodes.map(mapNode),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Immutably updates the comment of a specific node in an active path array.
 */
export function updateNodeCommentInPath(
  path: KifuTreeNode[],
  nodeId: string,
  newComment: string
): KifuTreeNode[] {
  return path.map((node) => (node.id === nodeId ? { ...node, comment: newComment } : node));
}
