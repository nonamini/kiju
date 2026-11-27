/**
 * BOD (Japanese text Shogi board diagram) parser and SFEN / FreeBoardDiagram converter (Issue #14).
 * Parses ShogiGUI / Kifu for Windows / social-media BOD snippets including
 * Sente/Gote hands, 9x9 board rows, turn markers, and move count.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { DiagramPiece, DiagramPieceKind } from '../types/freeBoardDiagram';
import {
  ParsedPosition,
  parsePositionSfen,
  serializePositionSfen,
} from './positionEditor';

const HAND_KANJI_TO_BASE: Record<string, 'R' | 'B' | 'G' | 'S' | 'N' | 'L' | 'P'> = {
  飛: 'R',
  角: 'B',
  金: 'G',
  銀: 'S',
  桂: 'N',
  香: 'L',
  歩: 'P',
};

const BOARD_TWO_CHAR_KANJI: Record<string, string> = {
  成銀: '+S',
  成桂: '+N',
  成香: '+L',
};

const BOARD_ONE_CHAR_KANJI: Record<string, string> = {
  玉: 'K',
  王: 'K',
  飛: 'R',
  龍: '+R',
  竜: '+R',
  角: 'B',
  馬: '+B',
  金: 'G',
  銀: 'S',
  全: '+S',
  桂: 'N',
  圭: '+N',
  香: 'L',
  杏: '+L',
  歩: 'P',
  と: '+P',
};

const KANJI_DIGITS: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

function toHalfWidthAscii(raw: string): string {
  return raw.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
}

function parseBodHandCount(rawCount: string): number {
  const normalized = toHalfWidthAscii(rawCount).trim();
  if (!normalized) return 1;
  if (/^\d+$/.test(normalized)) {
    return Math.max(1, Number(normalized));
  }
  if (normalized === '十') return 10;
  if (normalized.startsWith('十') && normalized.length === 2) {
    return 10 + (KANJI_DIGITS[normalized[1]!] ?? 0);
  }
  if (normalized.length === 1 && normalized in KANJI_DIGITS) {
    return KANJI_DIGITS[normalized]!;
  }
  return 1;
}

function parseHandLine(
  body: string,
  isGote: boolean,
  hand: Record<string, number>
): void {
  const cleaned = toHalfWidthAscii(body).trim();
  if (!cleaned || /^なし$|^無し$|^none$/i.test(cleaned)) return;

  const pattern = /([飛角金銀桂香歩])\s*([一二三四五六七八九十\d]*)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(cleaned)) !== null) {
    const pieceChar = match[1]!;
    const countStr = match[2] ?? '';
    const base = HAND_KANJI_TO_BASE[pieceChar];
    if (!base) continue;
    const key = isGote ? base.toLowerCase() : base;
    hand[key] = (hand[key] ?? 0) + parseBodHandCount(countStr);
  }
}

function toSfenPieceCode(sfenUpper: string, isGote: boolean): string {
  if (!isGote) return sfenUpper;
  if (sfenUpper.startsWith('+')) {
    return `+${sfenUpper.slice(1).toLowerCase()}`;
  }
  return sfenUpper.toLowerCase();
}

function tokenizeBodBoardRow(rowBody: string): string[] | null {
  const cells: string[] = [];
  let i = 0;

  while (i < rowBody.length) {
    const ch = rowBody[i]!;
    if (ch === ' ' || ch === '\t' || ch === '\u3000') {
      i++;
      continue;
    }

    if (ch === '・' || ch === '･' || ch === '.' || ch === '*') {
      cells.push('');
      i++;
      continue;
    }

    let isGote = false;
    if (ch === 'v' || ch === 'ｖ' || ch === 'V' || ch === '△' || ch === '☖' || ch === '-') {
      isGote = true;
      i++;
      while (
        i < rowBody.length &&
        (rowBody[i] === ' ' || rowBody[i] === '\u3000')
      ) {
        i++;
      }
      if (i >= rowBody.length) return null;
    } else if (ch === '▲' || ch === '☗' || ch === '^') {
      i++;
      while (
        i < rowBody.length &&
        (rowBody[i] === ' ' || rowBody[i] === '\u3000')
      ) {
        i++;
      }
      if (i >= rowBody.length) return null;
    }

    const twoChar = rowBody.slice(i, i + 2);
    if (twoChar in BOARD_TWO_CHAR_KANJI) {
      cells.push(toSfenPieceCode(BOARD_TWO_CHAR_KANJI[twoChar]!, isGote));
      i += 2;
      continue;
    }

    const oneChar = rowBody[i]!;
    if (oneChar in BOARD_ONE_CHAR_KANJI) {
      cells.push(toSfenPieceCode(BOARD_ONE_CHAR_KANJI[oneChar]!, isGote));
      i += 1;
      continue;
    }

    return null;
  }

  if (cells.length === 9) {
    return cells;
  }

  // Fallback for fixed-width 18-character rows using spaces instead of dots for empty cells
  if (rowBody.length === 18) {
    const fixedCells: string[] = [];
    for (let c = 0; c < 18; c += 2) {
      const marker = rowBody[c]!;
      const glyph = rowBody[c + 1]!;
      if (
        (glyph === ' ' || glyph === '\u3000' || glyph === '・' || glyph === '･') &&
        (marker === ' ' || marker === '\u3000')
      ) {
        fixedCells.push('');
        continue;
      }
      const gote =
        marker === 'v' || marker === 'ｖ' || marker === 'V' || marker === '△' || marker === '☖';
      const piece = BOARD_ONE_CHAR_KANJI[glyph];
      if (!piece) return null;
      fixedCells.push(toSfenPieceCode(piece, gote));
    }
    if (fixedCells.length === 9) return fixedCells;
  }

  return null;
}

export function isLikelyBodText(raw: string): boolean {
  const normalized = raw.trim();
  if (!normalized) return false;
  return (
    (normalized.includes('|') || normalized.includes('｜')) &&
    /(?:持駒|９\s*８\s*７|\+---)/.test(normalized)
  );
}

/**
 * Parses BOD formatted text into ParsedPosition and normalized SFEN.
 * Returns null if the input does not contain 9 valid board rows.
 */
export function parseBodToPosition(raw: string): {
  position: ParsedPosition;
  sfen: string;
  moveNumber: number;
} | null {
  if (!raw || !raw.trim()) return null;

  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const board: string[][] = [];
  const hand: Record<string, number> = {};
  let turn: 'b' | 'w' = 'b';
  let moveNumber = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const goteHandMatch = trimmed.match(
      /^(?:後手の持駒|上手の持駒|△持駒|☖持駒)\s*[：:]\s*(.*)$/
    );
    if (goteHandMatch) {
      parseHandLine(goteHandMatch[1] ?? '', true, hand);
      continue;
    }

    const senteHandMatch = trimmed.match(
      /^(?:先手の持駒|下手の持駒|▲持駒|☗持駒)\s*[：:]\s*(.*)$/
    );
    if (senteHandMatch) {
      parseHandLine(senteHandMatch[1] ?? '', false, hand);
      continue;
    }

    if (/^(?:後手番|上手番|△番|☖番)/.test(trimmed)) {
      turn = 'w';
      continue;
    }
    if (/^(?:先手番|下手番|▲番|☗番)/.test(trimmed)) {
      turn = 'b';
      continue;
    }

    const plyMatch = toHalfWidthAscii(trimmed).match(/手数[＝:=]\s*(\d+)/);
    if (plyMatch) {
      const ply = Number(plyMatch[1]);
      if (!Number.isNaN(ply) && ply >= 0) {
        moveNumber = Math.max(1, ply);
      }
    }

    const normalizedLine = trimmed.replace(/｜/g, '|');
    const rowMatch = normalizedLine.match(/^\|(.+?)\|/);
    if (rowMatch) {
      const parsedRow = tokenizeBodBoardRow(rowMatch[1]!);
      if (parsedRow) {
        board.push(parsedRow);
      }
    }
  }

  if (board.length !== 9) {
    return null;
  }

  const position: ParsedPosition = { board, turn, hand };
  const baseSfen = serializePositionSfen(position);
  const parts = baseSfen.split(' ');
  const sfen = `${parts[0]} ${parts[1]} ${parts[2]} ${moveNumber}`;
  return { position, sfen, moveNumber };
}

/**
 * Accepts either BOD text or a raw SFEN string and returns a normalized SFEN string,
 * or null if neither format is valid.
 */
export function parseBodOrSfenToSfen(raw: string): string | null {
  const bod = parseBodToPosition(raw);
  if (bod) return bod.sfen;

  const trimmed = raw.trim().replace(/^sfen\s+/i, '');
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  const boardPart = parts[0] ?? '';
  const ranks = boardPart.split('/');
  if (ranks.length !== 9) return null;

  for (const rank of ranks) {
    if (!rank) return null;
    let count = 0;
    for (let i = 0; i < rank.length; i++) {
      const ch = rank[i]!;
      if (ch >= '1' && ch <= '9') {
        count += Number(ch);
      } else if (ch === '+' && i + 1 < rank.length) {
        const next = rank[i + 1]!;
        if (!/^[RBSNLP]$/i.test(next)) return null;
        count += 1;
        i += 1;
      } else if (/^[KRBGSNLP]$/i.test(ch)) {
        count += 1;
      } else {
        return null;
      }
    }
    if (count !== 9) return null;
  }

  const turn = parts[1] === 'w' ? 'w' : 'b';
  const handPart = parts[2] || '-';
  const plyPart = parts[3] && /^\d+$/.test(parts[3]) ? parts[3] : '1';
  const parsed = parsePositionSfen(`${boardPart} ${turn} ${handPart} ${plyPart}`);
  const serialized = serializePositionSfen(parsed).split(' ');
  return `${serialized[0]} ${serialized[1]} ${serialized[2]} ${plyPart}`;
}

/**
 * Converts a normalized SFEN string into 9x9 FreeBoardDiagram patch fields (`pieces` + dimensions).
 */
export function sfenToFreeBoardDiagramPatch(sfen: string): {
  cols: number;
  rows: number;
  startFile: number;
  startRank: number;
  pieces: DiagramPiece[];
} {
  const pos = parsePositionSfen(sfen);
  const pieces: DiagramPiece[] = [];
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const cell = pos.board[row]?.[col];
      if (!cell) continue;
      const isPromoted = cell.startsWith('+');
      const letter = isPromoted ? cell.slice(1) : cell;
      const owner: 'b' | 'w' = letter === letter.toLowerCase() ? 'w' : 'b';
      const kind = (isPromoted ? `+${letter.toUpperCase()}` : letter.toUpperCase()) as DiagramPieceKind;
      pieces.push({ col, row, owner, kind });
    }
  }
  return {
    cols: 9,
    rows: 9,
    startFile: 9,
    startRank: 1,
    pieces,
  };
}
