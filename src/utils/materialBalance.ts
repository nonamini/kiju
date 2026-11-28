/**
 * Material Balance (駒割) and Impasse / JSA 27-Point Declaration Law (持将棋点数・入玉宣言法) Calculator (Issue #20).
 * Pure utility computing piece-value differential across board + hands, per-piece-type net surplus,
 * and standard impasse points + declaration conditions for both Sente and Gote.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { Shogi } from 'shogi.js';
import { calculateImpassePoints, ImpasseScoreBreakdown } from './shogiEndgameJudger';

export type MaterialBaseKind = 'HI' | 'KA' | 'KI' | 'GI' | 'KE' | 'KY' | 'FU';

export const MATERIAL_PIECE_VALUES: Record<string, number> = {
  FU: 1,
  KY: 3,
  KE: 4,
  GI: 5,
  KI: 6,
  KA: 8,
  HI: 10,
  TO: 5,
  NY: 5,
  NK: 5,
  NG: 5,
  UM: 10,
  RY: 12,
  OU: 0,
};

export const MATERIAL_DIFF_ORDER: ReadonlyArray<MaterialBaseKind> = [
  'HI',
  'KA',
  'KI',
  'GI',
  'KE',
  'KY',
  'FU',
];

const PROMOTED_TO_BASE: Record<string, MaterialBaseKind> = {
  TO: 'FU',
  NY: 'KY',
  NK: 'KE',
  NG: 'GI',
  UM: 'KA',
  RY: 'HI',
};

export interface MaterialPieceDiff {
  baseKind: MaterialBaseKind;
  /** Positive = Sente has more, Negative = Gote has more */
  diff: number;
}

export interface ImpasseDeclarationCheck {
  kingEntered: boolean;
  enemyTerritoryPieceCount: number;
  piecesOk: boolean;
  notInCheck: boolean;
  totalPoints: number;
  pointsThreshold: number;
  pointsOk: boolean;
  rooksAndBishopsCount: number;
  otherPiecesCount: number;
  canDeclareWin: boolean;
}

export interface MaterialAndImpasseSummary {
  senteScore: number;
  goteScore: number;
  /** Positive = Sente advantage, Negative = Gote advantage */
  diff: number;
  pieceDiffs: MaterialPieceDiff[];
  senteDeclaration: ImpasseDeclarationCheck;
  goteDeclaration: ImpasseDeclarationCheck;
  isImpasseDrawReady: boolean;
}

function normalizeToBaseKind(kind: string): MaterialBaseKind | null {
  if (kind in PROMOTED_TO_BASE) {
    return PROMOTED_TO_BASE[kind]!;
  }
  if (
    kind === 'HI' ||
    kind === 'KA' ||
    kind === 'KI' ||
    kind === 'GI' ||
    kind === 'KE' ||
    kind === 'KY' ||
    kind === 'FU'
  ) {
    return kind;
  }
  return null;
}

function buildDeclarationCheck(
  breakdown: ImpasseScoreBreakdown,
  notInCheck: boolean,
  pointsThreshold: number
): ImpasseDeclarationCheck {
  const piecesOk = breakdown.enemyTerritoryPieceCount >= 10;
  const pointsOk = breakdown.totalPoints >= pointsThreshold;
  return {
    kingEntered: breakdown.kingEntered,
    enemyTerritoryPieceCount: breakdown.enemyTerritoryPieceCount,
    piecesOk,
    notInCheck,
    totalPoints: breakdown.totalPoints,
    pointsThreshold,
    pointsOk,
    rooksAndBishopsCount: breakdown.rooksAndBishopsCount,
    otherPiecesCount: breakdown.otherPiecesCount,
    canDeclareWin: breakdown.kingEntered && piecesOk && notInCheck && pointsOk,
  };
}

/**
 * Computes material value difference and JSA impasse/declaration status for the given Shogi board.
 */
export function computeMaterialAndImpasse(shogi: Shogi): MaterialAndImpasseSummary {
  let senteScore = 0;
  let goteScore = 0;

  const senteCounts: Record<MaterialBaseKind, number> = {
    HI: 0,
    KA: 0,
    KI: 0,
    GI: 0,
    KE: 0,
    KY: 0,
    FU: 0,
  };
  const goteCounts: Record<MaterialBaseKind, number> = {
    HI: 0,
    KA: 0,
    KI: 0,
    GI: 0,
    KE: 0,
    KY: 0,
    FU: 0,
  };

  for (let x = 1; x <= 9; x++) {
    for (let y = 1; y <= 9; y++) {
      const piece = shogi.get(x, y);
      if (!piece) continue;
      const val = MATERIAL_PIECE_VALUES[piece.kind] ?? 0;
      const base = normalizeToBaseKind(piece.kind);
      if (piece.color === 0) {
        senteScore += val;
        if (base) senteCounts[base] += 1;
      } else {
        goteScore += val;
        if (base) goteCounts[base] += 1;
      }
    }
  }

  const rawSenteHand = shogi.getHandsSummary(0);
  const rawGoteHand = shogi.getHandsSummary(1);
  const senteHand: Record<string, number> = { ...rawSenteHand };
  const goteHand: Record<string, number> = { ...rawGoteHand };

  for (const [kind, count] of Object.entries(senteHand)) {
    if (count <= 0) continue;
    senteScore += (MATERIAL_PIECE_VALUES[kind] ?? 0) * count;
    const base = normalizeToBaseKind(kind);
    if (base) senteCounts[base] += count;
  }

  for (const [kind, count] of Object.entries(goteHand)) {
    if (count <= 0) continue;
    goteScore += (MATERIAL_PIECE_VALUES[kind] ?? 0) * count;
    const base = normalizeToBaseKind(kind);
    if (base) goteCounts[base] += count;
  }

  const pieceDiffs: MaterialPieceDiff[] = [];
  for (const baseKind of MATERIAL_DIFF_ORDER) {
    const net = (senteCounts[baseKind] - goteCounts[baseKind]) / 2;
    if (net !== 0) {
      pieceDiffs.push({ baseKind, diff: net });
    }
  }

  const diff = Math.round(((senteScore - goteScore) / 2) * 10) / 10;

  const impasse = calculateImpassePoints(shogi, senteHand, goteHand);
  const senteDeclaration = buildDeclarationCheck(
    impasse.sente,
    !shogi.isCheck(0),
    28
  );
  const goteDeclaration = buildDeclarationCheck(
    impasse.gote,
    !shogi.isCheck(1),
    27
  );

  return {
    senteScore,
    goteScore,
    diff,
    pieceDiffs,
    senteDeclaration,
    goteDeclaration,
    isImpasseDrawReady:
      impasse.sente.kingEntered &&
      impasse.gote.kingEntered &&
      impasse.sente.totalPoints >= 24 &&
      impasse.gote.totalPoints >= 24,
  };
}
