/**
 * Engine Evaluation Comment Extractor.
 * Extracts engine analysis lines (**解析) from ShogiGUI / GPSfish / Shogidokoro KIF files.
 * Maps parsed data to MoveEvaluation according to docs/spec/data_models.md.
 * Strictly English code, comments, and variables (Rule 1).
 */

import { MoveEvaluation } from '../types/shogi';

const FILE_MAP: Record<string, number> = {
  '１': 1, '1': 1, '２': 2, '2': 2, '３': 3, '3': 3, '４': 4, '4': 4, '５': 5, '5': 5,
  '６': 6, '6': 6, '７': 7, '7': 7, '８': 8, '8': 8, '９': 9, '9': 9,
};

const RANK_MAP: Record<string, number> = {
  '一': 1, '１': 1, '1': 1, '二': 2, '２': 2, '2': 2, '三': 3, '３': 3, '3': 3,
  '四': 4, '４': 4, '4': 4, '五': 5, '５': 5, '5': 5, '六': 6, '６': 6, '6': 6,
  '七': 7, '７': 7, '7': 7, '八': 8, '８': 8, '8': 8, '九': 9, '９': 9, '9': 9,
};

const PIECE_USI: Record<string, string> = {
  '歩': 'P', '香': 'L', '桂': 'N', '銀': 'S', '金': 'G', '角': 'B', '飛': 'R', '玉': 'K', '王': 'K',
  'と': '+P', '成香': '+L', '杏': '+L', '成桂': '+N', '圭': '+N', '成銀': '+S', '全': '+S',
  '馬': '+B', '龍': '+R', '竜': '+R',
};

function rankToUsi(rank: number): string {
  return String.fromCharCode(96 + rank);
}

/**
 * Parses principal variation (PV) move text into USI format moves.
 * Example input: "▲６八玉(59) △７三銀(62) ▲同　歩(76)"
 * Output: ["5i6h", "6b7c", "7f7c"]
 */
export function parsePvToUsi(pvString: string): string[] {
  if (!pvString) return [];

  // Match Japanese moves prefixed by ▲ or △
  const moveRegex = /[▲△](?:同\s*[^\s(]+|[１-９1-9][一二三四五六七八九1-9][^\s(]+)(?:\([^\)]+\)|打)?|[▲△]投了|[▲△]詰み/g;
  const matches = pvString.match(moveRegex) || [];

  const usiMoves: string[] = [];
  let lastDestinationSquare: { file: number; rank: number } | null = null;

  for (const token of matches) {
    const rawMove = token.slice(1).trim(); // Remove color prefix
    if (rawMove === '投了' || rawMove === '詰み') break;

    const tokenMatch = rawMove.match(/^(同\s*|同|[１-９1-9][一二三四五六七八九1-9])([^\s(]+?)(不成|成)?(?:\((\d\d)\)|\(打\)|打)?$/);
    if (!tokenMatch || !tokenMatch[1] || !tokenMatch[2]) continue;

    const prefix = tokenMatch[1].trim();
    const pieceName = tokenMatch[2];
    const isPromote = tokenMatch[3] === '成';
    const sourceCoord = tokenMatch[4];

    let toSquare: { file: number; rank: number } | null = null;
    if (prefix === '同') {
      toSquare = lastDestinationSquare;
    } else if (prefix.length >= 2) {
      const f = FILE_MAP[prefix[0] ?? ''];
      const r = RANK_MAP[prefix[1] ?? ''];
      if (f && r) {
        toSquare = { file: f, rank: r };
      }
    }

    if (!toSquare) continue;
    lastDestinationSquare = toSquare;

    const isDrop = rawMove.includes('打') || sourceCoord === '打' || (!sourceCoord && !prefix.startsWith('同'));

    if (isDrop || !sourceCoord || sourceCoord.length !== 2) {
      const usiPiece = PIECE_USI[pieceName] ?? 'P';
      usiMoves.push(`${usiPiece}*${toSquare.file}${rankToUsi(toSquare.rank)}`);
    } else {
      const fromFile = parseInt(sourceCoord[0] ?? '0', 10);
      const fromRank = parseInt(sourceCoord[1] ?? '0', 10);
      usiMoves.push(`${fromFile}${rankToUsi(fromRank)}${toSquare.file}${rankToUsi(toSquare.rank)}${isPromote ? '+' : ''}`);
    }
  }

  return usiMoves;
}

/**
 * Checks if a string line is an engine analysis comment line (**解析 or *解析).
 */
export function isEvalCommentLine(line: string): boolean {
  return /^\*{1,2}解析(?:\s|$)/.test(line.trim());
}

/**
 * Parses an engine evaluation comment line into a MoveEvaluation object.
 * Returns null if the line is not an evaluation comment or lacks score data.
 *
 * @param line Single raw KIF line
 * @param fallbackTimestamp ISO timestamp for evaluatedAt
 */
export function parseEvalComment(
  line: string,
  fallbackTimestamp?: string
): MoveEvaluation | null {
  const trimmed = line.trim();
  if (!isEvalCommentLine(trimmed)) {
    return null;
  }

  // Extract score (評価値)
  // Possible values: "評価値 -17", "評価値 +350", "評価値 -29999", "評価値 詰み", "評価値 +詰み15"
  const scoreMatch = trimmed.match(/評価値\s*([+-]?\d+|[+-]?詰み(?:\d+)?)/);
  if (!scoreMatch || !scoreMatch[1]) {
    return null;
  }

  const rawScore = scoreMatch[1];
  let scoreCp = 0;
  let isMate = false;
  let matePly: number | undefined;

  if (rawScore.includes('詰み')) {
    isMate = true;
    const isNegative = rawScore.startsWith('-');
    const matePlyMatch = rawScore.match(/\d+/);
    if (matePlyMatch && matePlyMatch[0]) {
      matePly = parseInt(matePlyMatch[0], 10);
    }
    scoreCp = isNegative ? -30000 : 30000;
  } else {
    scoreCp = parseInt(rawScore, 10);
    if (Math.abs(scoreCp) >= 29000) {
      isMate = true;
      matePly = 30000 - Math.abs(scoreCp);
    }
  }

  // Extract search depth (深さ)
  // Format: "深さ 18/22" or "深さ 18"
  let depth = 0;
  const depthMatch = trimmed.match(/深さ\s*(\d+)/);
  if (depthMatch && depthMatch[1]) {
    depth = parseInt(depthMatch[1], 10);
  }

  // Extract PV (読み筋)
  let pv: string[] = [];
  let bestMove: string | undefined;
  let bestMoveKif: string | undefined;

  const pvMatch = trimmed.match(/読み筋\s+(.*)$/);
  if (pvMatch && pvMatch[1]) {
    const rawPv = pvMatch[1].trim();
    pv = parsePvToUsi(rawPv);
    bestMove = pv[0];

    // First Japanese move in PV (e.g. "▲４六歩(47)")
    const firstMoveMatch = rawPv.match(/^[▲△](?:同\s*[^\s(]+|[１-９1-9][一二三四五六七八九1-9][^\s(]+)(?:\([^\)]+\)|打)?/);
    if (firstMoveMatch && firstMoveMatch[0]) {
      bestMoveKif = firstMoveMatch[0];
    }
  }

  const evaluation: MoveEvaluation = {
    scoreCp,
    isMate: isMate || undefined,
    matePly,
    depth,
    bestMove,
    bestMoveKif,
    pv,
    evaluatedAt: fallbackTimestamp ?? new Date().toISOString(),
  };

  return evaluation;
}
