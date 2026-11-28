/**
 * Beginner Assist board overlay calculator & persisted settings (Issue #19).
 * Computes perspective-aware sliding rays (R/B/+R/+B), tactical danger/free-capture alerts
 * (only when enemy attacks actually exceed defenders), territory balance, and raw attack counts.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { Shogi } from 'shogi.js';
import { getSafeStorage } from './matchHistoryStorage';

export const BEGINNER_ASSIST_STORAGE_KEY = 'joseki_tree_beginner_assist_v3';

export type AssistPerspective = 'auto' | 'turn' | 'sente' | 'gote';
export type AssistOverlayMode = 'none' | 'tactical' | 'heatmap';

export interface BeginnerAssistConfig {
  enabled: boolean;
  perspective: AssistPerspective;
  overlayMode: AssistOverlayMode;
  showOpponentSlidingLines: boolean;
  showOwnSlidingLines: boolean;
  showAttackCounts: boolean;
  showMaterialImpasse: boolean;
}

export const DEFAULT_BEGINNER_ASSIST_CONFIG: BeginnerAssistConfig = {
  enabled: false,
  perspective: 'auto',
  overlayMode: 'tactical',
  showOpponentSlidingLines: true,
  showOwnSlidingLines: false,
  showAttackCounts: false,
  showMaterialImpasse: true,
};

export interface AssistPerspectiveContext {
  turn: 0 | 1;
  isMatchActive: boolean;
  matchSenteIsHuman: boolean;
  matchGoteIsHuman: boolean;
}

/**
 * Resolves which player's perspective (0 = Sente, 1 = Gote) the assist overlay adopts:
 * - explicit 'sente'/'gote': fixed to that side
 * - 'turn': always follows board turn
 * - 'auto': locks to the human side in Human vs AI matches, otherwise follows board turn
 */
export function resolveAssistViewerColor(
  perspective: AssistPerspective,
  ctx: AssistPerspectiveContext
): 0 | 1 {
  if (perspective === 'sente') return 0;
  if (perspective === 'gote') return 1;
  if (perspective === 'turn') return ctx.turn;
  if (ctx.isMatchActive) {
    if (ctx.matchSenteIsHuman && !ctx.matchGoteIsHuman) return 0;
    if (ctx.matchGoteIsHuman && !ctx.matchSenteIsHuman) return 1;
  }
  return ctx.turn;
}

export interface SquareAssistInfo {
  x: number;
  y: number;
  pieceColor: 0 | 1 | null;
  pieceKind: string | null;
  senteAttacks: number;
  goteAttacks: number;
  senteSliding: boolean;
  goteSliding: boolean;
  ownAttacks: number;
  enemyAttacks: number;
  ownSliding: boolean;
  enemySliding: boolean;
  /** Own non-King piece currently attacked more times than defended */
  isDangerPiece: boolean;
  /** Enemy piece attacked by viewer side with zero defenders */
  isFreeCapture: boolean;
}

const VALID_PERSPECTIVES: ReadonlySet<string> = new Set(['auto', 'turn', 'sente', 'gote']);
const VALID_OVERLAY_MODES: ReadonlySet<string> = new Set(['none', 'tactical', 'heatmap']);

export function loadBeginnerAssistConfig(): BeginnerAssistConfig {
  try {
    const raw = getSafeStorage().getItem(BEGINNER_ASSIST_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BEGINNER_ASSIST_CONFIG };
    const parsed = JSON.parse(raw) as Partial<BeginnerAssistConfig>;
    return {
      enabled: Boolean(parsed.enabled),
      perspective:
        parsed.perspective && VALID_PERSPECTIVES.has(parsed.perspective)
          ? parsed.perspective
          : DEFAULT_BEGINNER_ASSIST_CONFIG.perspective,
      overlayMode:
        parsed.overlayMode && VALID_OVERLAY_MODES.has(parsed.overlayMode)
          ? parsed.overlayMode
          : DEFAULT_BEGINNER_ASSIST_CONFIG.overlayMode,
      showOpponentSlidingLines:
        parsed.showOpponentSlidingLines ??
        DEFAULT_BEGINNER_ASSIST_CONFIG.showOpponentSlidingLines,
      showOwnSlidingLines:
        parsed.showOwnSlidingLines ??
        DEFAULT_BEGINNER_ASSIST_CONFIG.showOwnSlidingLines,
      showAttackCounts:
        parsed.showAttackCounts ?? DEFAULT_BEGINNER_ASSIST_CONFIG.showAttackCounts,
      showMaterialImpasse:
        parsed.showMaterialImpasse ??
        DEFAULT_BEGINNER_ASSIST_CONFIG.showMaterialImpasse,
    };
  } catch {
    return { ...DEFAULT_BEGINNER_ASSIST_CONFIG };
  }
}

export function saveBeginnerAssistConfig(config: BeginnerAssistConfig): void {
  try {
    getSafeStorage().setItem(
      BEGINNER_ASSIST_STORAGE_KEY,
      JSON.stringify(config)
    );
  } catch {
    // Ignore storage quota / private mode errors
  }
}

const ORTHOGONAL_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

const DIAGONAL_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

const ALL_EIGHT_DIRS: ReadonlyArray<readonly [number, number]> = [
  ...ORTHOGONAL_DIRS,
  ...DIAGONAL_DIRS,
];

function getStepDeltas(
  kind: string,
  color: 0 | 1
): ReadonlyArray<readonly [number, number]> {
  const dir = color === 0 ? -1 : 1;
  switch (kind) {
    case 'FU':
      return [[0, dir]];
    case 'KE':
      return [
        [-1, 2 * dir],
        [1, 2 * dir],
      ];
    case 'GI':
      return [
        [-1, dir],
        [0, dir],
        [1, dir],
        [-1, -dir],
        [1, -dir],
      ];
    case 'KI':
    case 'TO':
    case 'NY':
    case 'NK':
    case 'NG':
      return [
        [-1, dir],
        [0, dir],
        [1, dir],
        [-1, 0],
        [1, 0],
        [0, -dir],
      ];
    case 'OU':
      return ALL_EIGHT_DIRS;
    case 'UM':
      return ORTHOGONAL_DIRS;
    case 'RY':
      return DIAGONAL_DIRS;
    default:
      return [];
  }
}

function getRayDeltas(
  kind: string,
  color: 0 | 1
): {
  rays: ReadonlyArray<readonly [number, number]>;
  isMajorSlider: boolean;
} {
  const dir = color === 0 ? -1 : 1;
  switch (kind) {
    case 'KY':
      return { rays: [[0, dir]], isMajorSlider: false };
    case 'KA':
    case 'UM':
      return { rays: DIAGONAL_DIRS, isMajorSlider: true };
    case 'HI':
    case 'RY':
      return { rays: ORTHOGONAL_DIRS, isMajorSlider: true };
    default:
      return { rays: [], isMajorSlider: false };
  }
}

/**
 * Computes attack counts, major sliding lines, defense strength, hanging pieces,
 * safe empty squares, and undefended capturable pieces independently for Sente and Gote.
 */
export function computeBoardAssistMap(
  shogi: Shogi,
  viewerColor: 0 | 1 = 0
): SquareAssistInfo[] {
  const senteAttacks = Array.from({ length: 10 }, () => new Int16Array(10));
  const goteAttacks = Array.from({ length: 10 }, () => new Int16Array(10));
  const senteSliding = Array.from({ length: 10 }, () => new Uint8Array(10));
  const goteSliding = Array.from({ length: 10 }, () => new Uint8Array(10));

  for (let x = 1; x <= 9; x++) {
    for (let y = 1; y <= 9; y++) {
      const piece = shogi.get(x, y);
      if (!piece) continue;

      const color: 0 | 1 = piece.color === 1 ? 1 : 0;
      const targetAttacks = color === 0 ? senteAttacks : goteAttacks;
      const targetSliding = color === 0 ? senteSliding : goteSliding;

      for (const [dx, dy] of getStepDeltas(piece.kind, color)) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 1 && nx <= 9 && ny >= 1 && ny <= 9) {
          targetAttacks[nx]![ny]! += 1;
        }
      }

      const { rays, isMajorSlider } = getRayDeltas(piece.kind, color);
      for (const [dx, dy] of rays) {
        let nx = x + dx;
        let ny = y + dy;
        while (nx >= 1 && nx <= 9 && ny >= 1 && ny <= 9) {
          targetAttacks[nx]![ny]! += 1;
          if (isMajorSlider) {
            targetSliding[nx]![ny] = 1;
          }
          if (shogi.get(nx, ny)) break;
          nx += dx;
          ny += dy;
        }
      }
    }
  }

  const results: SquareAssistInfo[] = [];
  for (let y = 1; y <= 9; y++) {
    for (let x = 9; x >= 1; x--) {
      const piece = shogi.get(x, y);
      const sCount = senteAttacks[x]![y]!;
      const gCount = goteAttacks[x]![y]!;
      const sSlide = senteSliding[x]![y] === 1;
      const gSlide = goteSliding[x]![y] === 1;
      const pColor: 0 | 1 | null = piece ? (piece.color === 1 ? 1 : 0) : null;

      const ownAttacks = viewerColor === 0 ? sCount : gCount;
      const enemyAttacks = viewerColor === 0 ? gCount : sCount;
      const ownSliding = viewerColor === 0 ? sSlide : gSlide;
      const enemySliding = viewerColor === 0 ? gSlide : sSlide;

      const isDangerPiece =
        pColor === viewerColor &&
        piece?.kind !== 'OU' &&
        enemyAttacks > ownAttacks;
      const isFreeCapture =
        pColor !== null &&
        pColor !== viewerColor &&
        ownAttacks > 0 &&
        enemyAttacks === 0;

      results.push({
        x,
        y,
        pieceColor: pColor,
        pieceKind: piece?.kind ?? null,
        senteAttacks: sCount,
        goteAttacks: gCount,
        senteSliding: sSlide,
        goteSliding: gSlide,
        ownAttacks,
        enemyAttacks,
        ownSliding,
        enemySliding,
        isDangerPiece,
        isFreeCapture,
      });
    }
  }

  return results;
}
