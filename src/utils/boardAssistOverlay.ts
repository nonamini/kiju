/**
 * Multi-stage Beginner Assist board overlay calculator & persisted settings (Issue #19).
 * Computes per-square sliding lines (R/B/+R/+B), Sente vs Gote attack counts,
 * hanging own pieces, safe empty squares, and risk-free enemy captures directly
 * from a live shogi.js board state.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { Shogi } from 'shogi.js';
import { getSafeStorage } from './matchHistoryStorage';

export const BEGINNER_ASSIST_STORAGE_KEY = 'joseki_tree_beginner_assist_v1';

export interface BeginnerAssistConfig {
  enabled: boolean;
  showSlidingLines: boolean;
  showAttackCounts: boolean;
  showHangingWarnings: boolean;
  showSafeEmpty: boolean;
  showFreeCaptures: boolean;
}

export const DEFAULT_BEGINNER_ASSIST_CONFIG: BeginnerAssistConfig = {
  enabled: false,
  showSlidingLines: true,
  showAttackCounts: true,
  showHangingWarnings: true,
  showSafeEmpty: false,
  showFreeCaptures: true,
};

export interface SquareAssistInfo {
  x: number;
  y: number;
  senteAttacks: number;
  goteAttacks: number;
  senteSliding: boolean;
  goteSliding: boolean;
  isHangingPiece: boolean;
  isSafeEmpty: boolean;
  isFreeCapture: boolean;
}

export function loadBeginnerAssistConfig(): BeginnerAssistConfig {
  try {
    const raw = getSafeStorage().getItem(BEGINNER_ASSIST_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BEGINNER_ASSIST_CONFIG };
    const parsed = JSON.parse(raw) as Partial<BeginnerAssistConfig>;
    return {
      enabled: Boolean(parsed.enabled),
      showSlidingLines:
        parsed.showSlidingLines ?? DEFAULT_BEGINNER_ASSIST_CONFIG.showSlidingLines,
      showAttackCounts:
        parsed.showAttackCounts ?? DEFAULT_BEGINNER_ASSIST_CONFIG.showAttackCounts,
      showHangingWarnings:
        parsed.showHangingWarnings ??
        DEFAULT_BEGINNER_ASSIST_CONFIG.showHangingWarnings,
      showSafeEmpty:
        parsed.showSafeEmpty ?? DEFAULT_BEGINNER_ASSIST_CONFIG.showSafeEmpty,
      showFreeCaptures:
        parsed.showFreeCaptures ?? DEFAULT_BEGINNER_ASSIST_CONFIG.showFreeCaptures,
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
 * Computes attack counts, major sliding lines, hanging own pieces, safe empty
 * squares, and undefended capturable enemy pieces for every square on the board.
 */
export function computeBoardAssistMap(
  shogi: Shogi,
  viewerColor: 0 | 1
): SquareAssistInfo[] {
  const senteAttacks = Array.from({ length: 10 }, () =>
    new Int16Array(10)
  );
  const goteAttacks = Array.from({ length: 10 }, () =>
    new Int16Array(10)
  );
  const senteSliding = Array.from({ length: 10 }, () =>
    new Uint8Array(10)
  );
  const goteSliding = Array.from({ length: 10 }, () =>
    new Uint8Array(10)
  );

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
      const myCount = viewerColor === 0 ? sCount : gCount;
      const enemyCount = viewerColor === 0 ? gCount : sCount;

      const isOwnNonKing =
        piece !== null && piece.color === viewerColor && piece.kind !== 'OU';
      const isEnemyPiece = piece !== null && piece.color !== viewerColor;

      results.push({
        x,
        y,
        senteAttacks: sCount,
        goteAttacks: gCount,
        senteSliding: senteSliding[x]![y] === 1,
        goteSliding: goteSliding[x]![y] === 1,
        isHangingPiece: isOwnNonKing && enemyCount > 0 && myCount === 0,
        isSafeEmpty: piece === null && enemyCount === 0,
        isFreeCapture: isEnemyPiece && myCount > 0 && enemyCount === 0,
      });
    }
  }

  return results;
}
