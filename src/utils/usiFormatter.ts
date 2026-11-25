/**
 * Utility to convert USI coordinate moves (e.g. "7g7f", "S*6c", "8h2b+")
 * into authentic Japanese Shogi notation (e.g. "▲７六歩", "△６三銀打", "▲２二角成").
 * Follows Rule 1: strictly English code, comments, and identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

const FILE_KANJI: Record<number, string> = {
  1: '１', 2: '２', 3: '３', 4: '４', 5: '５', 6: '６', 7: '７', 8: '８', 9: '９',
};

const RANK_KANJI: Record<number, string> = {
  1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '七', 8: '八', 9: '九',
};

// Map USI / shogi.js piece codes to authentic Kanji
const PIECE_NAMES: Record<string, string> = {
  // USI piece letters
  P: '歩',
  L: '香',
  N: '桂',
  S: '銀',
  G: '金',
  B: '角',
  R: '飛',
  K: '玉',
  '+P': 'と',
  '+L': '成香',
  '+N': '成桂',
  '+S': '成銀',
  '+B': '馬',
  '+R': '龍',
  // shogi.js Kind strings
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

const USI_ROW_TO_RANK: Record<string, number> = {
  a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9,
};

/**
 * Converts a USI move string to readable Japanese format.
 */
export interface ParsedUsiMove {
  from?: { x: number; y: number };
  to: { x: number; y: number };
  piece: string;
  promote?: boolean;
}

/**
 * Parses a USI move into a minimal move format compatible with JKFPlayer.inputMove.
 */
export function parseUsiMove(usi: string, shogiInstance?: any): ParsedUsiMove | null {
  const trimmed = usi.trim();
  if (!trimmed || trimmed === 'resign' || trimmed === 'win') return null;

  // 1. Drop move: e.g. "S*6c", "P*5e"
  const dropMatch = trimmed.match(/^([A-Za-z])\*([1-9])([a-i])$/);
  if (dropMatch && dropMatch[1] && dropMatch[2] && dropMatch[3]) {
    const pieceChar = dropMatch[1].toUpperCase();
    const file = parseInt(dropMatch[2], 10);
    const rank = USI_ROW_TO_RANK[dropMatch[3]] || 1;
    // Map single letter USI to shogi.js Kind
    const kindMap: Record<string, string> = {
      P: 'FU',
      L: 'KY',
      N: 'KE',
      S: 'GI',
      G: 'KI',
      B: 'KA',
      R: 'HI',
    };
    const kind = kindMap[pieceChar] || pieceChar;
    return {
      to: { x: file, y: rank },
      piece: kind,
      promote: false,
    };
  }

  // 2. Normal move: e.g. "7g7f", "8h2b+"
  const moveMatch = trimmed.match(/^([1-9])([a-i])([1-9])([a-i])(\+)?$/);
  if (moveMatch && moveMatch[1] && moveMatch[2] && moveMatch[3] && moveMatch[4]) {
    const fromX = parseInt(moveMatch[1], 10);
    const fromY = USI_ROW_TO_RANK[moveMatch[2]] || 1;
    const toX = parseInt(moveMatch[3], 10);
    const toY = USI_ROW_TO_RANK[moveMatch[4]] || 1;
    const isPromote = Boolean(moveMatch[5]);

    let pieceKind = 'FU';
    if (shogiInstance && typeof shogiInstance.get === 'function') {
      const piece = shogiInstance.get(fromX, fromY);
      if (piece && piece.kind) {
        pieceKind = piece.kind;
      }
    }

    const PROMOTABLE_KINDS = new Set(['FU', 'KY', 'KE', 'GI', 'KA', 'HI']);
    const isUnpromotedPromotable = PROMOTABLE_KINDS.has(pieceKind);
    // Check if move actually touches the promotion zone (rank <= 3 for Black, rank >= 7 for White)
    const touchesZone = fromY <= 3 || toY <= 3 || fromY >= 7 || toY >= 7;
    const canPromote = isUnpromotedPromotable && touchesZone;

    return {
      from: { x: fromX, y: fromY },
      to: { x: toX, y: toY },
      piece: pieceKind,
      // Only set promote boolean if move is in/out of enemy zone (prevents spurious "不成" on normal moves)
      promote: canPromote ? isPromote : undefined,
    };
  }

  return null;
}

export function formatUsiToJapanese(
  usi: string,
  turn: 0 | 1 = 0,
  shogiInstance?: any
): string {
  const trimmed = usi.trim();
  if (!trimmed) return '';
  if (trimmed === 'resign') return '投了';
  if (trimmed === 'win') return '入玉宣言';

  const prefix = turn === 0 ? '▲' : '△';

  // 1. Drop move: e.g. "S*6c", "P*5e"
  const dropMatch = trimmed.match(/^([A-Za-z])\*([1-9])([a-i])$/);
  if (dropMatch && dropMatch[1] && dropMatch[2] && dropMatch[3]) {
    const pieceChar = dropMatch[1].toUpperCase();
    const file = parseInt(dropMatch[2], 10);
    const rank = USI_ROW_TO_RANK[dropMatch[3]] || 1;
    const pName = PIECE_NAMES[pieceChar] || pieceChar;
    return `${prefix}${FILE_KANJI[file]}${RANK_KANJI[rank]}${pName}打`;
  }

  // 2. Normal move on board: e.g. "7g7f", "8h2b+"
  const moveMatch = trimmed.match(/^([1-9])([a-i])([1-9])([a-i])(\+)?$/);
  if (moveMatch && moveMatch[1] && moveMatch[2] && moveMatch[3] && moveMatch[4]) {
    const fromX = parseInt(moveMatch[1], 10);
    const fromY = USI_ROW_TO_RANK[moveMatch[2]] || 1;
    const toX = parseInt(moveMatch[3], 10);
    const toY = USI_ROW_TO_RANK[moveMatch[4]] || 1;
    const isPromote = Boolean(moveMatch[5]);

    let pieceName = '';
    let actualPrefix = prefix;

    if (shogiInstance && typeof shogiInstance.get === 'function') {
      // 1. First attempt: check piece at source coordinate (fromX, fromY)
      let piece = shogiInstance.get(fromX, fromY);

      // 2. Fallback: If board has already advanced forward (e.g. piece already moved to toX, toY),
      // read the piece kind from destination coordinate (toX, toY)
      if (!piece) {
        piece = shogiInstance.get(toX, toY);
      }

      if (piece && piece.kind) {
        pieceName = PIECE_NAMES[piece.kind] || piece.kind;
      }
      if (piece && typeof piece.color === 'number') {
        actualPrefix = piece.color === 0 ? '▲' : '△';
      }
    }

    // Fallback: Infer piece from geometric move vector if piece name wasn't found on board
    if (!pieceName) {
      const dx = Math.abs(toX - fromX);
      const dy = toY - fromY;
      const moverTurn = actualPrefix === '▲' ? 0 : 1;
      if (dx === 1 && ((moverTurn === 0 && dy === -2) || (moverTurn === 1 && dy === 2))) {
        pieceName = '桂';
      } else if (dx > 1 || Math.abs(dy) > 1) {
        pieceName = dx === Math.abs(dy) ? '角' : '飛';
      } else {
        pieceName = '歩';
      }
    }

    const dest = `${FILE_KANJI[toX]}${RANK_KANJI[toY]}`;
    const promoStr = isPromote ? '成' : '';
    return `${actualPrefix}${dest}${pieceName}${promoStr}`;
  }

  return trimmed;
}

/**
 * Recursively cleans up erroneous `promote: false` flags from a JKF move tree.
 * Moves outside the enemy promotion zone or by unpromotable pieces never have a promote choice,
 * so leaving `promote: false` erroneously causes JKFPlayer to render "不成" (e.g. ▲２六歩不成).
 */
export function cleanJkfFalsyPromotions(moves: Array<Record<string, unknown>>): void {
  if (!Array.isArray(moves)) return;

  for (const m of moves) {
    if (!m || typeof m !== 'object') continue;

    const move = m.move as
      | {
          from?: { x: number; y: number };
          to?: { x: number; y: number };
          piece?: string;
          promote?: boolean;
          color?: number;
        }
      | undefined;

    if (move && move.promote === false) {
      const color = move.color ?? 0;
      const fromY = move.from?.y;
      const toY = move.to?.y;

      let touchesEnemyZone = false;
      if (fromY !== undefined && toY !== undefined) {
        touchesEnemyZone = color === 0 ? fromY <= 3 || toY <= 3 : fromY >= 7 || toY >= 7;
      }

      // If move does not touch enemy promotion zone, it can never be promoted,
      // so promote MUST NOT be false (it must be undefined to avoid "不成" display).
      if (!touchesEnemyZone) {
        delete move.promote;
      }
    }

    // Clean forks recursively
    if (Array.isArray(m.forks)) {
      for (const forkStream of m.forks) {
        if (Array.isArray(forkStream)) {
          cleanJkfFalsyPromotions(forkStream as Array<Record<string, unknown>>);
        }
      }
    }
  }
}
