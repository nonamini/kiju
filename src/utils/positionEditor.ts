/**
 * ShogiGUI / PiyoShogi-style Position Editor utilities.
 * Handles SFEN parsing/serialization, piece-box (駒箱) remaining counts,
 * moving pieces between board, Sente hand, Gote hand, and piece box,
 * promotion/owner toggling, Sente/Gote flipping, and JKF conversion.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import { Kind, Shogi } from 'shogi.js';
import { JKFPlayer } from 'json-kifu-format';
import type { KifuRecord } from '../types/kifuRecord';
import { formatUsiToJapanese, parseUsiMove } from './usiFormatter';

export type PieceBase = 'K' | 'R' | 'B' | 'G' | 'S' | 'N' | 'L' | 'P';

export const PIECE_ORDER: PieceBase[] = ['K', 'R', 'B', 'G', 'S', 'N', 'L', 'P'];
export const HAND_ORDER: Exclude<PieceBase, 'K'>[] = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];

export const TOTAL_PIECE_COUNTS: Record<PieceBase, number> = {
  K: 2,
  R: 2,
  B: 2,
  G: 4,
  S: 4,
  N: 4,
  L: 4,
  P: 18,
};

export const PROMOTABLE_BASES = new Set<PieceBase>(['R', 'B', 'S', 'N', 'L', 'P']);

export const KIND_TO_SFEN_BASE: Record<string, PieceBase> = {
  OU: 'K',
  HI: 'R',
  KA: 'B',
  KI: 'G',
  GI: 'S',
  KE: 'N',
  KY: 'L',
  FU: 'P',
};

export const SFEN_BASE_TO_KIND: Record<PieceBase, string> = {
  K: 'OU',
  R: 'HI',
  B: 'KA',
  G: 'KI',
  S: 'GI',
  N: 'KE',
  L: 'KY',
  P: 'FU',
};

export const HIRATE_SFEN = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
// Tsume-shogi setup: Gote King on 5a, Sente King in piece box, remaining 38 pieces in Gote's hand
export const TSUMEGO_INITIAL_SFEN = '4k4/9/9/9/9/9/9/9/9 b 2r2b4g4s4n4l18p 1';
// Tsume-shogi setup: Gote King on 5a, all remaining 39 pieces in piece box
export const TSUMEGO_BOX_SFEN = '4k4/9/9/9/9/9/9/9/9 b - 1';
export const ALL_TO_BOX_SFEN = '9/9/9/9/9/9/9/9/9 b - 1';

export interface ParsedPosition {
  board: string[][]; // 9x9, '' or e.g. 'P', '+R', 'k'
  turn: 'b' | 'w';
  hand: Record<string, number>; // keys: 'R','B','G','S','N','L','P','r','b','g','s','n','l','p'
}

export type EditSelection =
  | { source: 'board'; x: number; y: number; piece: string }
  | { source: 'hand'; color: 0 | 1; base: Exclude<PieceBase, 'K'> }
  | { source: 'box'; base: PieceBase };

function clonePosition(pos: ParsedPosition): ParsedPosition {
  return {
    board: pos.board.map((row) => [...row]),
    turn: pos.turn,
    hand: { ...pos.hand },
  };
}

export function parsePositionSfen(sfen: string): ParsedPosition {
  const parts = sfen.trim().split(/\s+/);
  const boardPart = parts[0] || HIRATE_SFEN.split(' ')[0]!;
  const turn: 'b' | 'w' = parts[1] === 'w' ? 'w' : 'b';
  const handPart = parts[2] || '-';

  const board: string[][] = Array.from({ length: 9 }, () => Array(9).fill(''));
  const ranks = boardPart.split('/');
  for (let r = 0; r < 9 && r < ranks.length; r++) {
    const row = ranks[r]!;
    let c = 0;
    for (let i = 0; i < row.length && c < 9; i++) {
      const ch = row[i]!;
      if (ch >= '1' && ch <= '9') {
        c += Number(ch);
      } else if (ch === '+' && i + 1 < row.length) {
        board[r]![c++] = '+' + row[++i]!;
      } else {
        board[r]![c++] = ch;
      }
    }
  }

  const hand: Record<string, number> = {};
  if (handPart !== '-') {
    let numStr = '';
    for (let i = 0; i < handPart.length; i++) {
      const ch = handPart[i]!;
      if (ch >= '0' && ch <= '9') {
        numStr += ch;
      } else {
        const cnt = numStr ? Number(numStr) : 1;
        hand[ch] = (hand[ch] ?? 0) + cnt;
        numStr = '';
      }
    }
  }

  return { board, turn, hand };
}

export function serializePositionSfen(pos: ParsedPosition): string {
  const ranks = pos.board.map((row) => {
    let s = '';
    let empty = 0;
    for (const cell of row) {
      if (!cell) {
        empty++;
      } else {
        if (empty > 0) {
          s += String(empty);
          empty = 0;
        }
        s += cell;
      }
    }
    if (empty > 0) s += String(empty);
    return s;
  });

  const keys = ['R', 'B', 'G', 'S', 'N', 'L', 'P', 'r', 'b', 'g', 's', 'n', 'l', 'p'];
  let handStr = '';
  for (const k of keys) {
    const cnt = pos.hand[k] ?? 0;
    if (cnt > 0) handStr += (cnt > 1 ? String(cnt) : '') + k;
  }
  if (!handStr) handStr = '-';
  return `${ranks.join('/')} ${pos.turn} ${handStr} 1`;
}

/**
 * Compute remaining piece counts in the piece box (駒箱).
 */
export function getPieceBoxCounts(pos: ParsedPosition): Record<PieceBase, number> {
  const used: Record<PieceBase, number> = { K: 0, R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 };
  for (const row of pos.board) {
    for (const cell of row) {
      if (!cell) continue;
      const base = (cell.startsWith('+') ? cell.slice(1) : cell).toUpperCase() as PieceBase;
      if (base in used) used[base] += 1;
    }
  }
  for (const [k, cnt] of Object.entries(pos.hand)) {
    const base = k.toUpperCase() as PieceBase;
    if (base in used) used[base] += cnt;
  }
  const box: Record<PieceBase, number> = { K: 0, R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 };
  for (const base of PIECE_ORDER) {
    box[base] = Math.max(0, TOTAL_PIECE_COUNTS[base] - used[base]);
  }
  return box;
}

/**
 * Cycle a board piece through: Sente unpromoted -> Sente promoted (if promotable) -> Gote unpromoted -> Gote promoted (if promotable).
 */
export function cycleBoardPieceState(piece: string): string {
  const isPromoted = piece.startsWith('+');
  const raw = isPromoted ? piece.slice(1) : piece;
  const isSente = raw === raw.toUpperCase();
  const base = raw.toUpperCase() as PieceBase;
  const canPromote = PROMOTABLE_BASES.has(base);

  if (isSente) {
    if (!isPromoted && canPromote) return `+${base}`;
    return base.toLowerCase();
  }
  if (!isPromoted && canPromote) return `+${base.toLowerCase()}`;
  return base;
}

/**
 * Flip Sente and Gote on the entire board, hands, and turn.
 */
export function flipPositionSenteGote(pos: ParsedPosition): ParsedPosition {
  const flipCell = (cell: string): string => {
    if (!cell) return '';
    const promo = cell.startsWith('+') ? '+' : '';
    const ch = promo ? cell.slice(1) : cell;
    const flipped = ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
    return promo + flipped;
  };

  const board = pos.board
    .slice()
    .reverse()
    .map((row) => row.slice().reverse().map(flipCell));

  const hand: Record<string, number> = {};
  for (const [k, cnt] of Object.entries(pos.hand)) {
    const flippedKey = k === k.toUpperCase() ? k.toLowerCase() : k.toUpperCase();
    hand[flippedKey] = cnt;
  }

  return {
    board,
    turn: pos.turn === 'b' ? 'w' : 'b',
    hand,
  };
}

/**
 * Check whether the currently selected piece can be placed into a player's hand (Kings cannot be in hand).
 */
export function canPlaceInHand(selection: EditSelection | null): boolean {
  if (!selection) return false;
  if (selection.source === 'hand') return true;
  if (selection.source === 'box') return selection.base !== 'K';
  const raw = selection.piece.startsWith('+') ? selection.piece.slice(1) : selection.piece;
  return raw.toUpperCase() !== 'K';
}

/**
 * Handle clicking a square on the 9x9 board in Position Edit Mode:
 * - No selection: selects piece if square occupied.
 * - Same selected square: cycles Sente unpromoted -> Sente promoted -> Gote unpromoted -> Gote promoted,
 *   then immediately clears selection to avoid accidental moves onto the next clicked piece.
 * - Different square / hand / box selection: moves piece to target square (displaced piece returns to box).
 */
export function applyEditSquareClick(
  pos: ParsedPosition,
  selection: EditSelection | null,
  x: number,
  y: number
): { pos: ParsedPosition; nextSelection: EditSelection | null; changed: boolean } {
  if (x < 1 || x > 9 || y < 1 || y > 9) {
    return { pos, nextSelection: selection, changed: false };
  }
  const r = y - 1;
  const c = 9 - x;
  const existing = pos.board[r]![c]!;

  if (!selection) {
    if (existing) {
      return {
        pos,
        nextSelection: { source: 'board', x, y, piece: existing },
        changed: false,
      };
    }
    return { pos, nextSelection: null, changed: false };
  }

  if (selection.source === 'board' && selection.x === x && selection.y === y) {
    if (!existing) return { pos, nextSelection: null, changed: false };
    const nextPos = clonePosition(pos);
    const rotated = cycleBoardPieceState(existing);
    nextPos.board[r]![c] = rotated;
    return {
      pos: nextPos,
      nextSelection: null,
      changed: true,
    };
  }

  const nextPos = clonePosition(pos);
  let movingPiece = '';

  if (selection.source === 'board') {
    const origR = selection.y - 1;
    const origC = 9 - selection.x;
    movingPiece = nextPos.board[origR]![origC]!;
    if (!movingPiece) return { pos, nextSelection: null, changed: false };
    nextPos.board[origR]![origC] = '';
  } else if (selection.source === 'hand') {
    const handKey = selection.color === 0 ? selection.base : selection.base.toLowerCase();
    const cnt = nextPos.hand[handKey] ?? 0;
    if (cnt <= 0) return { pos, nextSelection: null, changed: false };
    if (cnt > 1) nextPos.hand[handKey] = cnt - 1;
    else delete nextPos.hand[handKey];
    movingPiece = handKey;
  } else {
    const boxCounts = getPieceBoxCounts(pos);
    if (boxCounts[selection.base] <= 0) return { pos, nextSelection: null, changed: false };
    movingPiece = selection.base;
  }

  nextPos.board[r]![c] = movingPiece;
  return { pos: nextPos, nextSelection: null, changed: true };
}

/**
 * Right-clicking a board square immediately rotates its piece state without changing selection.
 */
export function applyEditSquareRightClick(
  pos: ParsedPosition,
  x: number,
  y: number
): { pos: ParsedPosition; changed: boolean } {
  if (x < 1 || x > 9 || y < 1 || y > 9) return { pos, changed: false };
  const r = y - 1;
  const c = 9 - x;
  const existing = pos.board[r]![c]!;
  if (!existing) return { pos, changed: false };

  const nextPos = clonePosition(pos);
  nextPos.board[r]![c] = cycleBoardPieceState(existing);
  return { pos: nextPos, changed: true };
}

/**
 * Handle clicking a hand piece or Komadai stand area in Position Edit Mode:
 * - With an existing selection: moves piece into `color`'s hand (unless King or same piece toggled off).
 * - With no selection and `clickedKind`: selects that hand piece.
 */
export function applyEditHandClick(
  pos: ParsedPosition,
  selection: EditSelection | null,
  color: 0 | 1,
  clickedKind?: string
): { pos: ParsedPosition; nextSelection: EditSelection | null; changed: boolean } {
  if (selection) {
    if (
      selection.source === 'hand' &&
      selection.color === color &&
      clickedKind &&
      KIND_TO_SFEN_BASE[clickedKind] === selection.base
    ) {
      return { pos, nextSelection: null, changed: false };
    }

    let base: PieceBase;
    const nextPos = clonePosition(pos);

    if (selection.source === 'board') {
      const cell = nextPos.board[selection.y - 1]![9 - selection.x]!;
      if (!cell) return { pos, nextSelection: null, changed: false };
      const raw = cell.startsWith('+') ? cell.slice(1) : cell;
      base = raw.toUpperCase() as PieceBase;
      if (base === 'K') return { pos, nextSelection: null, changed: false };
      nextPos.board[selection.y - 1]![9 - selection.x] = '';
    } else if (selection.source === 'hand') {
      if (selection.color === color) {
        if (clickedKind) {
          const nextBase = KIND_TO_SFEN_BASE[clickedKind];
          if (nextBase && nextBase !== 'K') {
            return { pos, nextSelection: { source: 'hand', color, base: nextBase }, changed: false };
          }
        }
        return { pos, nextSelection: null, changed: false };
      }
      const origKey = selection.color === 0 ? selection.base : selection.base.toLowerCase();
      const origCnt = nextPos.hand[origKey] ?? 0;
      if (origCnt <= 0) return { pos, nextSelection: null, changed: false };
      if (origCnt > 1) nextPos.hand[origKey] = origCnt - 1;
      else delete nextPos.hand[origKey];
      base = selection.base;
    } else {
      base = selection.base;
      if (base === 'K') return { pos, nextSelection: null, changed: false };
      if (getPieceBoxCounts(pos)[base] <= 0) return { pos, nextSelection: null, changed: false };
    }

    const targetKey = color === 0 ? base : base.toLowerCase();
    nextPos.hand[targetKey] = (nextPos.hand[targetKey] ?? 0) + 1;
    return { pos: nextPos, nextSelection: null, changed: true };
  }

  if (clickedKind) {
    const base = KIND_TO_SFEN_BASE[clickedKind];
    if (!base || base === 'K') return { pos, nextSelection: null, changed: false };
    const key = color === 0 ? base : base.toLowerCase();
    if ((pos.hand[key] ?? 0) <= 0) return { pos, nextSelection: null, changed: false };
    return { pos, nextSelection: { source: 'hand', color, base }, changed: false };
  }

  return { pos, nextSelection: null, changed: false };
}

/**
 * Handle clicking the Piece Box area or a piece button inside it in Position Edit Mode:
 * - If a board or hand piece is selected: returns it to the piece box.
 * - Otherwise selects a remaining piece from the piece box.
 */
export function applyEditBoxClick(
  pos: ParsedPosition,
  selection: EditSelection | null,
  clickedBase?: PieceBase
): { pos: ParsedPosition; nextSelection: EditSelection | null; changed: boolean } {
  const boxCounts = getPieceBoxCounts(pos);

  if (selection) {
    if (selection.source === 'board') {
      const nextPos = clonePosition(pos);
      const r = selection.y - 1;
      const c = 9 - selection.x;
      if (!nextPos.board[r]![c]) return { pos, nextSelection: null, changed: false };
      nextPos.board[r]![c] = '';
      return { pos: nextPos, nextSelection: null, changed: true };
    }
    if (selection.source === 'hand') {
      const nextPos = clonePosition(pos);
      const key = selection.color === 0 ? selection.base : selection.base.toLowerCase();
      const cnt = nextPos.hand[key] ?? 0;
      if (cnt <= 0) return { pos, nextSelection: null, changed: false };
      if (cnt > 1) nextPos.hand[key] = cnt - 1;
      else delete nextPos.hand[key];
      return { pos: nextPos, nextSelection: null, changed: true };
    }
    if (!clickedBase || clickedBase === selection.base) {
      return { pos, nextSelection: null, changed: false };
    }
    if (boxCounts[clickedBase] > 0) {
      return { pos, nextSelection: { source: 'box', base: clickedBase }, changed: false };
    }
    return { pos, nextSelection: null, changed: false };
  }

  if (clickedBase && boxCounts[clickedBase] > 0) {
    return { pos, nextSelection: { source: 'box', base: clickedBase }, changed: false };
  }

  return { pos, nextSelection: null, changed: false };
}

/**
 * Construct a JKFPlayer from any SFEN (including Kingless Tsume-shogi positions and Gote-to-move).
 */
export function createJkfPlayerFromSfen(
  sfen: string,
  header?: Record<string, string>
): JKFPlayer {
  const shogi = new Shogi();
  shogi.initializeFromSFENString(sfen);
  const board: Array<Array<{ color?: number; kind?: string }>> = [];
  for (let i = 1; i <= 9; i++) {
    const col: Array<{ color?: number; kind?: string }> = [];
    for (let j = 1; j <= 9; j++) {
      const piece = shogi.get(i, j);
      col.push(piece ? { color: piece.color, kind: piece.kind } : {});
    }
    board.push(col);
  }
  return new JKFPlayer({
    header: header ? { ...header } : {},
    moves: [{}],
    initial: {
      preset: 'OTHER',
      data: {
        color: shogi.turn,
        board,
        hands: [shogi.getHandsSummary(0), shogi.getHandsSummary(1)],
      },
    },
  });
}

/**
 * Safely extract starting position SFEN from a serialized JKF JSON string.
 */
export function extractStartSfenFromJkfJson(jkfJson: string): string | null {
  if (!jkfJson || jkfJson === '{}') return null;
  try {
    const parsed = JSON.parse(jkfJson);
    const p = new JKFPlayer(parsed);
    return p.shogi.toSFENString();
  } catch {
    return null;
  }
}

/**
 * Identifies whether a KifuRecord was registered as a custom edited position.
 */
export function isCustomPositionRecord(
  rec: Pick<KifuRecord, 'id' | 'tags' | 'jkfJson'>
): boolean {
  return (
    rec.id.startsWith('custom_pos_') ||
    rec.tags.includes('登録局面') ||
    rec.jkfJson.includes('"preset":"OTHER"')
  );
}

export interface UsiMoveSnapshot {
  index: number;
  usi: string;
  label: string;
  sfen: string;
  lastMove: { from?: { x: number; y: number }; to: { x: number; y: number } };
}

const DROP_KIND_MAP: Record<string, Extract<Kind, 'FU' | 'KY' | 'KE' | 'GI' | 'KI' | 'KA' | 'HI'>> = {
  FU: 'FU',
  KY: 'KY',
  KE: 'KE',
  GI: 'GI',
  KI: 'KI',
  KA: 'KA',
  HI: 'HI',
};

/**
 * Checks whether both Sente King ('K') and Gote King ('k') are present on the board.
 */
export function hasBothKingsInSfen(sfen: string): boolean {
  const pos = parsePositionSfen(sfen);
  let hasSenteKing = false;
  let hasGoteKing = false;
  for (const row of pos.board) {
    for (const cell of row) {
      if (cell === 'K') hasSenteKing = true;
      else if (cell === 'k') hasGoteKing = true;
    }
  }
  return hasSenteKing && hasGoteKing;
}

/**
 * Steps through a USI PV sequence from `startSfen`, returning formatted Japanese labels,
 * resulting SFEN snapshots, and move highlight coordinates for board previewing.
 */
export function buildUsiSequenceSnapshots(startSfen: string, pv: string[]): UsiMoveSnapshot[] {
  if (!startSfen || pv.length === 0) return [];
  const shogi = new Shogi();
  try {
    shogi.initializeFromSFENString(startSfen);
  } catch {
    return [];
  }

  const snapshots: UsiMoveSnapshot[] = [];
  let prevTo: { x: number; y: number } | null = null;

  for (const usi of pv) {
    const parsed = parseUsiMove(usi, shogi);
    if (!parsed) break;

    const turn = (shogi.turn === 1 ? 1 : 0) as 0 | 1;
    let label = formatUsiToJapanese(usi, turn, shogi);
    if (
      parsed.from &&
      prevTo &&
      parsed.to.x === prevTo.x &&
      parsed.to.y === prevTo.y &&
      label.length >= 3
    ) {
      label = `${label.slice(0, 1)}同${label.slice(3)}`;
    }

    try {
      if (parsed.from) {
        shogi.move(parsed.from.x, parsed.from.y, parsed.to.x, parsed.to.y, Boolean(parsed.promote));
      } else {
        const dropKind = DROP_KIND_MAP[parsed.piece];
        if (!dropKind) break;
        shogi.drop(parsed.to.x, parsed.to.y, dropKind);
      }
    } catch {
      break;
    }

    snapshots.push({
      index: snapshots.length + 1,
      usi,
      label,
      sfen: shogi.toSFENString(),
      lastMove: { from: parsed.from, to: parsed.to },
    });
    prevTo = parsed.to;
  }

  return snapshots;
}
