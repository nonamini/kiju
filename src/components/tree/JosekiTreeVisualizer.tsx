/**
 * Joseki Tree Visualizer (大樹ビジュアライザー).
 * Displays games branching out upwards like a real organic tree from the initial Hirate root (◇).
 * Strictly mainline only, cut off at maxPly (default 30) or when single-game leaf is reached.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { auth } from '../../services/firebase';
import { ensureKifuRecordPayload } from '../../services/firestoreKifuSync';
import { loadAppSettings } from '../../utils/appSettingsStorage';
import { extractOpeningLineFromJkf } from '../../utils/kifuOpeningLine';
import { updateKifuRecord } from '../../utils/kifuRecordStorage';
import { SavedStudioGame } from '../../utils/studioKifuStorage';
import {
  buildOrSyncOpeningTreeIndex,
  OpeningTreeIndexNode,
} from '../../utils/openingTreeIndex';

export interface VisualTreeNode {
  id: string;
  ply: number;
  usi: string;
  japaneseMove: string;
  sfen: string;
  gameCount: number;
  gameTitles: string[];
  gameIds: string[];
  senteWins: number;
  goteWins: number;
  draws: number;
  proCount: number;
  selfCount: number;
  otherCount: number;
  children: VisualTreeNode[];
  // History flow from root to this node (e.g. ["▲７六歩", "△３四歩", ...])
  moveHistory?: string[];
  // Path sequence between the parent branch node and this node (compressed moves)
  pathSegmentMoves?: string[];
  // Layout coordinates for SVG rendering
  x?: number;
  y?: number;
  isMainline?: boolean;
  // Node categorization
  isBranchPoint?: boolean;
  isLeaf?: boolean;
}

export type TreeGameKindScope = 'pro' | 'self' | 'all';

export function filterGamesByKindScope(
  games: SavedStudioGame[],
  scope: TreeGameKindScope
): SavedStudioGame[] {
  if (scope === 'all') return games;
  return games.filter((g) => (g.gameKind ?? 'other') === scope);
}

export interface JosekiTreeVisualizerProps {
  games: SavedStudioGame[];
  maxPlyLimit?: number;
  onSelectPosition?: (sfen: string, gameId?: string, ply?: number) => void;
  onOpenGame?: (game: SavedStudioGame, initialPly?: number) => void;
  onClose?: () => void;
}

/**
 * Extracts strictly the mainline moves from each saved game and merges them
 * into an organic tree branching upwards from root (ply 0).
 */
export function buildMainlineTreeFromGames(
  games: SavedStudioGame[],
  maxPly: number = 30
): VisualTreeNode {
  const index = buildOrSyncOpeningTreeIndex(games);
  const gamesMap = new Map<string, SavedStudioGame>();
  for (const g of games) {
    gamesMap.set(g.id, g);
  }

  const convertNode = (idxNode: OpeningTreeIndexNode, history: string[]): VisualTreeNode => {
    const scopedGames: SavedStudioGame[] = [];
    for (const gid of idxNode.gameIds) {
      const g = gamesMap.get(gid);
      if (g) scopedGames.push(g);
    }
    const nextHistory = idxNode.ply === 0 ? history : [...history, idxNode.usi];
    const children =
      idxNode.ply >= maxPly
        ? []
        : idxNode.children
            .map((c) => convertNode(c, nextHistory))
            .filter((c) => c.gameCount > 0);

    return {
      id: idxNode.ply === 0 ? 'root-hirate' : `node-${idxNode.ply}-${idxNode.usi}`,
      ply: idxNode.ply,
      usi: idxNode.ply === 0 ? '' : idxNode.usi,
      japaneseMove: idxNode.japaneseMove,
      sfen: idxNode.sfen,
      gameCount: scopedGames.length,
      gameTitles: scopedGames.map((g) => g.title),
      gameIds: scopedGames.map((g) => g.id),
      senteWins: scopedGames.filter((g) => g.winner === 'sente').length,
      goteWins: scopedGames.filter((g) => g.winner === 'gote').length,
      draws: scopedGames.filter((g) => g.winner === 'draw' || g.winner === 'unknown').length,
      proCount: scopedGames.filter((g) => (g.gameKind ?? 'other') === 'pro').length,
      selfCount: scopedGames.filter((g) => (g.gameKind ?? 'other') === 'self').length,
      otherCount: scopedGames.filter((g) => (g.gameKind ?? 'other') === 'other').length,
      moveHistory: nextHistory,
      children,
    };
  };

  return convertNode(index.root, []);
}


/**
 * Compresses the full unbranching linear paths into a Branch-Only Tree (Radix/Patricia style).
 * Only:
 * 1. Root (ply 0)
 * 2. Nodes where children.length > 1 (Actual branch divergence point)
 * 3. Terminal leaf nodes (when a branch ends or reaches depth limit)
 * are kept as visible nodes. All intermediate single-child steps are compressed into the edge/path.
 */
export function compressTreeToBranchPoints(fullRoot: VisualTreeNode): VisualTreeNode {
  function buildCompressedNode(
    rawNode: VisualTreeNode,
    accumulatedSegmentMoves: string[]
  ): VisualTreeNode {
    // If rawNode has exactly 1 child, and it is not the root node,
    // we bypass this node and compress into child until a branch point (children > 1) or leaf (children === 0) is found
    if (rawNode.ply > 0 && rawNode.children.length === 1 && rawNode.children[0]) {
      const singleChild = rawNode.children[0];
      return buildCompressedNode(singleChild, [...accumulatedSegmentMoves, rawNode.japaneseMove]);
    }

    const currentSegmentMoves = rawNode.ply === 0 
      ? [] 
      : [...accumulatedSegmentMoves, rawNode.japaneseMove];

    const compressed: VisualTreeNode = {
      id: rawNode.id,
      ply: rawNode.ply,
      usi: rawNode.usi,
      japaneseMove: rawNode.japaneseMove,
      sfen: rawNode.sfen,
      gameCount: rawNode.gameCount,
      gameTitles: [...rawNode.gameTitles],
      gameIds: [...rawNode.gameIds],
      senteWins: rawNode.senteWins,
      goteWins: rawNode.goteWins,
      draws: rawNode.draws,
      proCount: rawNode.proCount,
      selfCount: rawNode.selfCount,
      otherCount: rawNode.otherCount,
      isMainline: rawNode.isMainline,
      isBranchPoint: rawNode.children.length > 1,
      isLeaf: rawNode.children.length === 0,
      moveHistory: rawNode.moveHistory || [],
      pathSegmentMoves: currentSegmentMoves,
      children: [],
    };

    // Recursively compress children with at least 2 games (omit 1-game leaves to keep tree clean)
    compressed.children = rawNode.children
      .filter((child) => child.gameCount >= 2)
      .map((child) => buildCompressedNode(child, []));
    compressed.isBranchPoint = compressed.children.length > 1;
    compressed.isLeaf = compressed.children.length === 0;

    return compressed;
  }

  return buildCompressedNode(fullRoot, []);
}

/**
 * Computes 2D organic tree coordinates (Root at bottom-center, branches growing upwards)
 * specifically designed for branch-point compressed trees.
 */
export function layoutOrganicTree(
  root: VisualTreeNode,
  viewWidth: number = 1000,
  viewHeight: number = 700
): { nodes: VisualTreeNode[]; links: Array<{ source: VisualTreeNode; target: VisualTreeNode }> } {
  const allNodes: VisualTreeNode[] = [];
  const allLinks: Array<{ source: VisualTreeNode; target: VisualTreeNode }> = [];

  // Bottom root position
  const bottomMargin = 90;
  const topMargin = 70;
  const usableHeight = viewHeight - bottomMargin - topMargin;

  // Max ply actually in compressed tree
  let maxPlyFound = 1;
  const findMaxPly = (n: VisualTreeNode) => {
    if (n.ply > maxPlyFound) maxPlyFound = n.ply;
    n.children.forEach(findMaxPly);
  };
  findMaxPly(root);

  // Assign Y coordinate strictly proportional to ply (bottom = 0, top = maxPly)
  const getY = (ply: number) => {
    if (maxPlyFound === 0) return viewHeight - bottomMargin;
    const progress = ply / Math.max(1, maxPlyFound);
    return viewHeight - bottomMargin - progress * usableHeight;
  };

  // Assign X coordinate using recursive fan-out subtree widths
  const assignX = (node: VisualTreeNode, left: number, right: number) => {
    const x = (left + right) / 2;
    node.x = x;
    node.y = getY(node.ply);
    allNodes.push(node);

    if (node.children.length === 0) return;

    // Distribute children horizontally proportional to their gameCount
    const totalChildGames = node.children.reduce((acc, c) => acc + c.gameCount, 0);
    let currentLeft = left;

    node.children.forEach((child) => {
      const share = totalChildGames > 0 ? child.gameCount / totalChildGames : 1 / node.children.length;
      const childWidth = (right - left) * share;
      const childRight = currentLeft + childWidth;

      allLinks.push({ source: node, target: child });
      assignX(child, currentLeft, childRight);
      currentLeft = childRight;
    });
  };

  assignX(root, 70, viewWidth - 70);

  return { nodes: allNodes, links: allLinks };
}

export const JosekiTreeVisualizer: React.FC<JosekiTreeVisualizerProps> = ({
  games,
  maxPlyLimit = 30,
  onSelectPosition,
  onOpenGame,
  onClose,
}) => {
  const { t } = useTranslation();
  const [depthLimit, setDepthLimit] = useState<number>(maxPlyLimit);
  const [scope, setScope] = useState<TreeGameKindScope>(
    () => loadAppSettings().treeDefaultGameKindScope ?? 'pro'
  );
  const [selectedNode, setSelectedNode] = useState<VisualTreeNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<VisualTreeNode | null>(null);
  const [hydratedGames, setHydratedGames] = useState<SavedStudioGame[]>(games);
  const [isHydrating, setIsHydrating] = useState<boolean>(false);

  useEffect(() => {
    setHydratedGames(games);
    const missing = games.filter(
      (g) =>
        (!g.openingLine || g.openingLine.length === 0) &&
        (!g.jkfJson || g.jkfJson === '{}')
    );
    if (missing.length === 0) {
      setIsHydrating(false);
      return;
    }

    let cancelled = false;
    setIsHydrating(true);
    const uid = auth?.currentUser?.uid;

    void (async () => {
      const updates = new Map<string, SavedStudioGame>();
      for (const g of missing) {
        if (cancelled) break;
        const full = await ensureKifuRecordPayload(uid, g.id);
        if (!full || !full.jkfJson || full.jkfJson === '{}') continue;
        const openingLine =
          full.openingLine && full.openingLine.length > 0
            ? full.openingLine
            : extractOpeningLineFromJkf(full.jkfJson);
        if (openingLine.length > 0 && (!full.openingLine || full.openingLine.length === 0)) {
          updateKifuRecord(g.id, { openingLine });
        }
        updates.set(g.id, {
          ...g,
          jkfJson: full.jkfJson,
          openingLine,
        });
      }
      if (!cancelled && updates.size > 0) {
        setHydratedGames((prev) => prev.map((g) => updates.get(g.id) ?? g));
      }
      if (!cancelled) {
        setIsHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [games]);

  const scopeCounts = useMemo(
    () => ({
      pro: hydratedGames.filter((g) => (g.gameKind ?? 'other') === 'pro').length,
      self: hydratedGames.filter((g) => (g.gameKind ?? 'other') === 'self').length,
      all: hydratedGames.length,
    }),
    [hydratedGames]
  );

  const scopedGames = useMemo(
    () => filterGamesByKindScope(hydratedGames, scope),
    [hydratedGames, scope]
  );

  // Pan and Zoom transform state
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const treeRoot = useMemo(() => {
    const fullTree = buildMainlineTreeFromGames(scopedGames, depthLimit);
    return compressTreeToBranchPoints(fullTree);
  }, [scopedGames, depthLimit]);

  const viewWidth = 1200;
  const viewHeight = 750;

  const { nodes, links } = useMemo(() => {
    return layoutOrganicTree(treeRoot, viewWidth, viewHeight);
  }, [treeRoot, viewWidth, viewHeight]);

  // Handle Drag / Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.min(Math.max(0.4, prev * zoomFactor), 3.0));
  };

  const resetView = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  // Touch event support for mobile drag / pan
  const touchStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchDistanceRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && e.touches[0]) {
      setIsDragging(true);
      touchStartRef.current = {
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y,
      };
      touchDistanceRef.current = null;
    } else if (e.touches.length === 2 && e.touches[0] && e.touches[1]) {
      // Pinch to zoom initialization
      setIsDragging(false);
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchDistanceRef.current = Math.hypot(dx, dy);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging && e.touches[0]) {
      setPan({
        x: e.touches[0].clientX - touchStartRef.current.x,
        y: e.touches[0].clientY - touchStartRef.current.y,
      });
    } else if (e.touches.length === 2 && e.touches[0] && e.touches[1] && touchDistanceRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / touchDistanceRef.current;
      if (Math.abs(factor - 1) > 0.02) {
        setZoom((prev) => Math.min(Math.max(0.4, prev * factor), 3.0));
        touchDistanceRef.current = dist;
      }
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchDistanceRef.current = null;
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-slate-100 select-none overflow-hidden relative font-sans">
      {/* Top Toolbar: Responsive layout for mobile & desktop */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-3 sm:px-4 py-2 sm:py-3 bg-slate-900/95 border-b border-amber-950/40 z-20 shrink-0 gap-2">
        <div className="flex items-center justify-between w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-lg sm:text-xl">🌳</span>
            <div>
              <h2 className="text-xs sm:text-sm font-bold bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent truncate max-w-[200px] sm:max-w-none">
                棋樹 (Joseki Tree) 総合大樹ビジュアライザー
              </h2>
              <p className="text-[10px] sm:text-[11px] text-slate-400">
                {t('tree.visualizer.games_count', '表示中 {{shown}} 局 / 全 {{total}} 局の本譜枝分かれ展開', {
                  shown: scopedGames.length,
                  total: hydratedGames.length,
                })}
                {isHydrating && (
                  <span className="ml-2 text-amber-300">
                    ⏳ {t('tree.visualizer.loading_kifu_data', '棋譜データ読込中...')}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Close button for mobile at header corner */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="sm:hidden px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold transition"
            >
              ✕
            </button>
          )}
        </div>

        {/* Scope Selector, Depth Limit & Zoom Controls */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 text-xs w-full sm:w-auto pb-0.5 sm:pb-0">
          <div
            role="group"
            aria-label="Tree Game Kind Scope"
            className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0"
          >
            {(
              [
                { id: 'pro', label: '🏯 プロのみ', count: scopeCounts.pro },
                { id: 'self', label: '👤 自分のみ', count: scopeCounts.self },
                { id: 'all', label: '🔀 すべて', count: scopeCounts.all },
              ] as const
            ).map((item) => {
              const active = scope === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setScope(item.id);
                    setSelectedNode(null);
                    setHoveredNode(null);
                  }}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition ${
                    active
                      ? 'bg-amber-600 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {item.label} ({item.count})
                </button>
              );
            })}
          </div>

          {scope === 'all' && (
            <div className="flex items-center gap-2 text-[10px] text-slate-300 bg-slate-950/80 px-2.5 py-1 rounded-xl border border-slate-800 shrink-0">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                一致
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                プロ
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                自分
              </span>
            </div>
          )}

          <div className="flex items-center gap-1 sm:gap-2 bg-slate-950 px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-slate-800 shrink-0">
            <span className="text-slate-400 font-semibold text-[11px] sm:text-xs">
              {t('tree.visualizer.display_label', '表示:')}
            </span>
            {[15, 25, 35, 50].map((ply) => (
              <button
                type="button"
                key={`ply-${ply}`}
                onClick={() => setDepthLimit(ply)}
                className={`px-1.5 sm:px-2 py-0.5 rounded text-[11px] sm:text-xs font-bold transition ${
                  depthLimit === ply
                    ? 'bg-amber-600 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                {t('studio.match.plies_count', '{{count}} 手', { count: ply })}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, z * 1.15))}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
              title={t('tree.visualizer.zoom_in_title', '拡大')}
            >
              ＋
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.4, z * 0.85))}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
              title={t('tree.visualizer.zoom_out_title', '縮小')}
            >
              －
            </button>
            <button
              type="button"
              onClick={resetView}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
              title={t('tree.visualizer.reset_view_title', '表示位置リセット')}
            >
              {t('tree.visualizer.reset_btn', 'リセット')}
            </button>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="hidden sm:inline-flex px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-bold transition shrink-0"
            >
              閉じる ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Interactive Canvas / SVG Area */}
      <div
        className="flex-1 relative cursor-grab active:cursor-grabbing overflow-hidden bg-radial from-slate-900 to-slate-950 touch-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <svg
          className="w-full h-full pointer-events-auto"
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          preserveAspectRatio="xMidYMid meet"
          onClick={() => {
            setSelectedNode(null);
            setHoveredNode(null);
          }}
        >
          <defs>
            {/* Linear gradients for tree branch links */}
            <linearGradient id="trunkGrad" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#d97706" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="branchGrad" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#475569" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#64748b" stopOpacity="0.7" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Root Transform Group for Pan & Zoom */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Tree Branch Links (Curved Beziers from bottom to top) */}
            {links.map((link, idx) => {
              const sx = link.source.x ?? 0;
              const sy = link.source.y ?? 0;
              const tx = link.target.x ?? 0;
              const ty = link.target.y ?? 0;
              const isMain = link.target.isMainline;

              // Cubic bezier upward curve
              const midY = (sy + ty) / 2;
              const d = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;

              // Stroke width proportional to gameCount
              const strokeWidth = Math.max(
                1.5,
                Math.min(8, (link.target.gameCount / Math.max(1, scopedGames.length)) * 12)
              );

              const targetHasPro = link.target.proCount > 0;
              const targetHasSelf = link.target.selfCount > 0;
              const linkStroke =
                scope === 'all'
                  ? targetHasPro && targetHasSelf
                    ? '#10b981'
                    : targetHasPro
                      ? '#38bdf8'
                      : targetHasSelf
                        ? '#f59e0b'
                        : '#475569'
                  : isMain
                    ? Math.abs(sx - tx) < 1
                      ? '#f59e0b'
                      : 'url(#trunkGrad)'
                    : '#64748b';

              return (
                <path
                  key={`link-${idx}`}
                  d={d}
                  fill="none"
                  stroke={linkStroke}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  className="transition-all duration-300 hover:stroke-amber-400"
                />
              );
            })}

            {/* Tree Nodes (Circles & Diamonds) */}
            {nodes.map((node) => {
              const nx = node.x ?? 0;
              const ny = node.y ?? 0;
              const isRoot = node.ply === 0;
              const isBranch = node.isBranchPoint;
              const isHovered = hoveredNode?.id === node.id;
              const isSelected = selectedNode?.id === node.id;

              // Size based on adoption frequency & role (branch points are emphasized)
              const ratio = node.gameCount / Math.max(1, scopedGames.length);
              const radius = isRoot
                ? 14
                : isBranch
                ? Math.max(12, Math.min(26, 10 + ratio * 24))
                : Math.max(8, Math.min(18, 6 + ratio * 16));

              // Sente vs Gote win coloring (sente wins = warm amber, gote wins = cool cyan)
              const sentePct = node.gameCount > 0 ? (node.senteWins / node.gameCount) : 0.5;
              const hasPro = node.proCount > 0;
              const hasSelf = node.selfCount > 0;
              const overlayFill =
                hasPro && hasSelf
                  ? '#047857'
                  : hasPro
                    ? '#0369a1'
                    : hasSelf
                      ? '#b45309'
                      : '#64748b';
              const overlayStroke =
                hasPro && hasSelf
                  ? '#34d399'
                  : hasPro
                    ? '#38bdf8'
                    : hasSelf
                      ? '#fbbf24'
                      : '#64748b';

              return (
                <g
                  key={node.id}
                  transform={`translate(${nx}, ${ny})`}
                  className="cursor-pointer transition-transform duration-200"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNode(node);
                    // Single click selects node to view details / select candidate games
                  }}
                  onMouseEnter={() => setHoveredNode(node)}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  {/* Outer pulse circle for selected/hovered */}
                  {(isSelected || isHovered) && (
                    <circle
                      r={radius + 6}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      className="animate-pulse"
                    />
                  )}

                  {/* Node Shape: Root is Diamond (◇), others are Circles (○) */}
                  {isRoot ? (
                    <polygon
                      points="0,-14 14,0 0,14 -14,0"
                      fill="#d97706"
                      stroke="#fef3c7"
                      strokeWidth={2}
                      filter="url(#glow)"
                    />
                  ) : (
                    <circle
                      r={radius}
                      fill={
                        scope === 'all'
                          ? overlayFill
                          : sentePct > 0.6
                            ? '#b45309'
                            : sentePct < 0.4
                              ? '#0369a1'
                              : '#1e293b'
                      }
                      stroke={
                        isSelected
                          ? '#f59e0b'
                          : scope === 'all'
                            ? overlayStroke
                            : isBranch
                              ? '#fbbf24'
                              : '#64748b'
                      }
                      strokeWidth={isHovered || isSelected ? 3 : isBranch ? 2.5 : 1.5}
                      filter={isBranch || node.isMainline ? 'url(#glow)' : undefined}
                    />
                  )}

                  {/* Node Label: Move Kanji Text */}
                  <text
                    y={isRoot ? 24 : radius + 12}
                    textAnchor="middle"
                    className={`text-[10px] font-bold select-none pointer-events-none ${
                      isSelected
                        ? 'fill-amber-300 font-extrabold'
                        : isHovered
                        ? 'fill-white'
                        : isBranch
                        ? 'fill-amber-200 font-bold'
                        : 'fill-slate-400'
                    }`}
                  >
                    {isRoot ? '◇ 平手' : node.japaneseMove}
                  </text>

                  {/* Branch indicator or Game count badge */}
                  {!isRoot && (
                    <text
                      y={3}
                      textAnchor="middle"
                      className="text-[9px] font-mono font-bold fill-white/90 select-none pointer-events-none"
                    >
                      {node.gameCount > 1 ? node.gameCount : isBranch ? '★' : ''}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Floating Detail Tooltip Card (Hover or Selected) */}
        {(hoveredNode || selectedNode) && (
          <div
            onWheel={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="absolute left-2 right-2 sm:right-auto sm:left-4 bottom-2 sm:bottom-4 p-3 sm:p-4 rounded-2xl bg-slate-900/95 border border-amber-900/40 shadow-2xl backdrop-blur-md max-w-none sm:max-w-md w-auto sm:w-full z-30 pointer-events-auto space-y-2.5 sm:space-y-3 animate-fade-in text-xs max-h-[60vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 truncate pr-2">
                <span className="text-base">{hoveredNode?.isBranchPoint ? '🔀' : '📍'}</span>
                <span className="font-bold text-amber-300 text-sm truncate">
                  {hoveredNode?.ply ?? selectedNode?.ply}手目:{' '}
                  {hoveredNode?.japaneseMove ?? selectedNode?.japaneseMove}
                </span>
                {(hoveredNode || selectedNode)?.isBranchPoint && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800 font-bold shrink-0">
                    分岐点
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-mono text-slate-400">
                  {hoveredNode?.gameCount ?? selectedNode?.gameCount} 局通過
                </span>
                {/* Close card button */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNode(null);
                    setHoveredNode(null);
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 hover:text-slate-200 text-xs"
                  title={t('common.close', '閉じる')}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Move trajectory leading up to this point (そこに至る棋譜の流れ) */}
            {(() => {
              const n = hoveredNode || selectedNode;
              if (!n) return null;
              const history = n.moveHistory || [];
              if (history.length === 0) return null;

              return (
                <div className="space-y-1 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
                    <span>📜 {t('tree.visualizer.flow_to_here', 'そこに至る棋譜の流れ:')}</span>
                    <span className="text-[10px] text-amber-500 font-mono">
                      {t('tree.visualizer.total_moves_count', '全 {{count}} 手', { count: history.length })}
                    </span>
                  </div>
                  <div className="max-h-20 overflow-y-auto text-[11px] font-mono leading-relaxed text-amber-100 flex flex-wrap gap-1 pr-1">
                    {history.map((m, idx) => (
                      <span
                        key={idx}
                        className={`px-1 rounded ${
                          idx === history.length - 1
                            ? 'bg-amber-500 text-slate-950 font-bold'
                            : 'bg-slate-900 text-slate-300'
                        }`}
                      >
                        {idx + 1}.{m}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Wins Breakdown Bar */}
            {(() => {
              const n = hoveredNode || selectedNode;
              if (!n || n.gameCount === 0) return null;
              const sPct = Math.round((n.senteWins / n.gameCount) * 100);
              const gPct = Math.round((n.goteWins / n.gameCount) * 100);
              return (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span className="text-amber-400">
                      {t('tree.visualizer.sente_win_stat', '▲ 先手勝: {{count}} ({{pct}}%)', {
                        count: n.senteWins,
                        pct: sPct,
                      })}
                    </span>
                    <span className="text-sky-400">
                      {t('tree.visualizer.gote_win_stat', '△ 後手勝: {{count}} ({{pct}}%)', {
                        count: n.goteWins,
                        pct: gPct,
                      })}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden flex">
                    <div style={{ width: `${sPct}%` }} className="bg-amber-500" />
                    <div style={{ width: `${gPct}%` }} className="bg-sky-500" />
                  </div>
                </div>
              );
            })()}

            {/* Games Passed Through This Node */}
            <div className="space-y-1 pt-1">
              <span className="text-[10px] font-semibold text-slate-400">
                {t('tree.visualizer.target_games_count', '対象対局 ({{count}}局):', {
                  count: (hoveredNode || selectedNode)?.gameIds.length ?? 0,
                })}
              </span>
              <div className="max-h-32 overflow-y-auto space-y-1 text-[11px] font-mono text-slate-300 pr-1">
                {(() => {
                  const n = hoveredNode || selectedNode;
                  if (!n) return null;
                  return n.gameIds.map((gId, i) => {
                    const gameObj = hydratedGames.find((g) => g.id === gId);
                    const rawTitle =
                      gameObj?.title && gameObj.title !== gId
                        ? gameObj.title
                        : gameObj && (gameObj.senteName || gameObj.goteName)
                          ? `${gameObj.senteName} vs ${gameObj.goteName}`
                          : n.gameTitles[i] && n.gameTitles[i] !== gId
                            ? n.gameTitles[i]
                            : gId;
                    return (
                      <div
                        key={gId}
                        className="p-1.5 rounded-lg bg-slate-950/70 border border-slate-800/80 hover:border-amber-500/50 flex items-center justify-between gap-1 group transition"
                      >
                        <span className="truncate text-slate-300 group-hover:text-amber-200">
                          • {rawTitle}
                        </span>
                        {onOpenGame && gameObj && (
                          <button
                            type="button"
                            onClick={() => onOpenGame(gameObj, n.ply)}
                            className="px-2 py-0.5 rounded bg-amber-600/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 text-[10px] font-bold transition shrink-0"
                            title={t('tree.visualizer.open_game_branch_title', 'この棋譜を開き、この分岐局面へジャンプ')}
                          >
                            {t('studio.kifu_mgmt.open_arrow', '開く ➔')}
                          </button>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Jump to Studio Study Button */}
            {onSelectPosition && (
              <button
                type="button"
                onClick={() => {
                  const n = selectedNode || hoveredNode;
                  if (n) {
                    const primaryGameId = n.gameIds[0];
                    onSelectPosition(n.sfen, primaryGameId, n.ply);
                  }
                }}
                className="w-full mt-2 py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
              >
                <span>🔍 {t('tree.visualizer.jump_to_study_btn', 'この局面からStudioで研究・検討する')}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
