/**
 * KIF (Kifu format) Parser Core.
 * Parses KIF text into domain models (IngestedGame, ShogiMove).
 * Follows Rule 1: strictly English identifiers, comments, and types.
 */

import { Color, PieceType, ShogiMove, Square } from '../types/shogi';
import { IngestedGame } from '../types/tree';
import { decodeKifBuffer } from './encoding';
import { isEvalCommentLine, parseEvalComment } from './evalExtractor';
import { classifyOpening } from './openingClassifier';

export interface ParsedVariation {
  branchPly: number;
  moves: ShogiMove[];
}

export interface ParsedKifResult {
  game: IngestedGame;
  moves: ShogiMove[];
  variations: ParsedVariation[];
}

export interface KifParserOptions {
  userId?: string;
  openingId?: string;
}

const FILE_MAP: Record<string, number> = {
  '１': 1, '1': 1,
  '２': 2, '2': 2,
  '３': 3, '3': 3,
  '４': 4, '4': 4,
  '５': 5, '5': 5,
  '６': 6, '6': 6,
  '７': 7, '7': 7,
  '８': 8, '8': 8,
  '９': 9, '9': 9,
};

const RANK_MAP: Record<string, number> = {
  '一': 1, '１': 1, '1': 1,
  '二': 2, '２': 2, '2': 2,
  '三': 3, '３': 3, '3': 3,
  '四': 4, '４': 4, '4': 4,
  '五': 5, '５': 5, '5': 5,
  '六': 6, '６': 6, '6': 6,
  '七': 7, '７': 7, '7': 7,
  '八': 8, '８': 8, '8': 8,
  '九': 9, '９': 9, '9': 9,
};

const PIECE_MAP: Record<string, { type: PieceType; usi: string }> = {
  '歩': { type: 'FU', usi: 'P' },
  '香': { type: 'KY', usi: 'L' },
  '桂': { type: 'KE', usi: 'N' },
  '銀': { type: 'GI', usi: 'S' },
  '金': { type: 'KI', usi: 'G' },
  '角': { type: 'KA', usi: 'B' },
  '飛': { type: 'HI', usi: 'R' },
  '玉': { type: 'OU', usi: 'K' },
  '王': { type: 'OU', usi: 'K' },
  'と': { type: 'TO', usi: '+P' },
  '成香': { type: 'NY', usi: '+L' },
  '杏': { type: 'NY', usi: '+L' },
  '成桂': { type: 'NK', usi: '+N' },
  '圭': { type: 'NK', usi: '+N' },
  '成銀': { type: 'NG', usi: '+S' },
  '全': { type: 'NG', usi: '+S' },
  '馬': { type: 'UM', usi: '+B' },
  '龍': { type: 'RY', usi: '+R' },
  '竜': { type: 'RY', usi: '+R' },
};

const SPECIAL_TERMINAL_MOVES = new Set([
  '投了',
  '詰み',
  '反則勝ち',
  '反則負け',
  '切れ負け',
  '千日手',
  '持将棋',
  '中断',
  '入玉宣言',
]);

/**
 * Converts a 1-based rank number (1-9) to USI letter ('a'-'i').
 */
function rankToUsi(rank: number): string {
  return String.fromCharCode(96 + rank);
}

/**
 * Normalizes date string to YYYY-MM-DD.
 */
function normalizeDate(rawDate?: string): string | undefined {
  if (!rawDate) return undefined;
  const match = rawDate.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match || !match[1] || !match[2] || !match[3]) return undefined;
  const year = match[1];
  const month = match[2].padStart(2, '0');
  const day = match[3].padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Generates a pseudo-unique ID for the parsed game.
 */
function generateGameId(title: string, rawText: string): string {
  let hash = 0;
  for (let i = 0; i < rawText.length; i++) {
    hash = (hash << 5) - hash + rawText.charCodeAt(i);
    hash |= 0;
  }
  const cleanTitle = title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  return `${cleanTitle}_${Math.abs(hash).toString(16)}`;
}

/**
 * Parses raw KIF content into IngestedGame and ShogiMove array.
 *
 * @param input String KIF text or raw byte buffer (Uint8Array / ArrayBuffer)
 * @param options Optional overrides for userId and openingId
 */
export function parseKif(
  input: string | Uint8Array | ArrayBuffer,
  options: KifParserOptions = {}
): ParsedKifResult {
  const rawKif =
    typeof input === 'string'
      ? input
      : decodeKifBuffer(input).text;

  const lines = rawKif.split(/\r?\n/);

  // Metadata headers
  let dateRaw: string | undefined;
  let senteName = 'Sente';
  let goteName = 'Gote';
  let tournament: string | undefined;
  let winner: Color | 'draw' | 'unknown' | undefined;
  let openingName: string | undefined;

  // Track sections
  const mainlineMoves: ShogiMove[] = [];
  const variations: ParsedVariation[] = [];

  let currentVariation: ParsedVariation | null = null;
  let currentTargetList = mainlineMoves;

  let lastDestinationSquare: Square | undefined;

  // Iterate line by line
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]?.trim();
    if (!rawLine) continue;

    // Check for variation header (e.g. 変化：58手)
    const varMatch = rawLine.match(/^変化[:：]\s*(\d+)手/);
    if (varMatch && varMatch[1]) {
      const branchPly = parseInt(varMatch[1], 10);
      currentVariation = { branchPly, moves: [] };
      variations.push(currentVariation);
      currentTargetList = currentVariation.moves;
      lastDestinationSquare = undefined;
      continue;
    }

    // Header metadata extraction
    if (rawLine.startsWith('開始日時：') || rawLine.startsWith('対局日：')) {
      dateRaw = rawLine.replace(/^(開始日時：|対局日：)\s*/, '');
      continue;
    }
    if (rawLine.startsWith('棋戦：')) {
      tournament = rawLine.replace(/^棋戦：\s*/, '');
      continue;
    }
    if (rawLine.startsWith('戦型：')) {
      const form = rawLine.replace(/^戦型：\s*/, '');
      if (form) openingName = form;
      continue;
    }
    if (rawLine.startsWith('先手：') || rawLine.startsWith('下手：')) {
      senteName = rawLine.replace(/^(先手：|下手：)\s*/, '');
      continue;
    }
    if (rawLine.startsWith('後手：') || rawLine.startsWith('上手：')) {
      goteName = rawLine.replace(/^(後手：|上手：)\s*/, '');
      continue;
    }

    // Outcome summary header/footer lines (e.g. まで67手で先手の勝ち)
    if (rawLine.includes('先手の勝ち') || rawLine.includes('先手勝ち') || rawLine.includes('先手の反則勝ち')) {
      winner = 'b';
      continue;
    }
    if (rawLine.includes('後手の勝ち') || rawLine.includes('後手勝ち') || rawLine.includes('後手の反則勝ち')) {
      winner = 'w';
      continue;
    }
    if (rawLine.includes('千日手') || rawLine.includes('持将棋') || rawLine.includes('引き分け')) {
      winner = 'draw';
      continue;
    }

    // Engine analysis evaluation lines (**解析 or *解析)
    if (isEvalCommentLine(rawLine)) {
      const evalData = parseEvalComment(rawLine);
      if (evalData && currentTargetList.length > 0) {
        const lastMove = currentTargetList[currentTargetList.length - 1];
        if (lastMove) {
          lastMove.evaluation = evalData;
        }
      }
      continue;
    }

    // Other comments & headers (e.g. *#定跡手 or # comment)
    if (rawLine.startsWith('*') || rawLine.startsWith('#')) {
      continue;
    }

    // Parse move lines: e.g. "   1 ７六歩(77)   ( 0:00/00:00:00)+" or "  51 同　飛(16) ( 0:00/00:00:00)" or "  68 投了"
    const moveMatch = rawLine.match(
      /^\s*(\d+)\s+([^\s(]+(?:\s+[^\s(]+)?(?:\([^\)]+\))?)(?:\s*\([^)]*\))?(\+)?(?:\s+.*)?$/
    );
    if (!moveMatch || !moveMatch[1] || !moveMatch[2]) {
      continue;
    }

    const ply = parseInt(moveMatch[1], 10);
    const moveToken = moveMatch[2];
    const color: Color = ply % 2 === 1 ? 'b' : 'w';

    // Terminal moves (投了, 詰み, 中断, etc.)
    if (SPECIAL_TERMINAL_MOVES.has(moveToken)) {
      if (!winner) {
        if (moveToken === '投了') {
          // If Black resigned (odd ply), White wins. If White resigned (even ply), Black wins.
          winner = color === 'b' ? 'w' : 'b';
        } else if (moveToken === '詰み') {
          // The player who made the last board move delivered mate.
          winner = color === 'b' ? 'w' : 'b';
        }
      }
      continue;
    }

    // Parse standard move token:
    // Formats:
    // 1) ７六歩(77)
    // 2) 同　歩(23) or 同歩(23)
    // 3) ５二金打 or ５二金(打)
    // 4) ７七角成(22)
    // 5) ２二角不成(88)
    const tokenRegex = /^(同\s*|同|[１-９1-9][一二三四五六七八九1-9])([^\s(]+?)(不成|成)?(?:\((\d\d)\)|\(打\)|打)?$/;
    const tokenMatch = moveToken.match(tokenRegex);

    let toSquare: Square | undefined;
    let fromSquare: Square | undefined;
    let isDrop = false;
    let isPromote = false;
    let pieceName = '';

    if (tokenMatch && tokenMatch[1] && tokenMatch[2]) {
      const posPrefix = tokenMatch[1].trim();
      pieceName = tokenMatch[2];
      const promoteMarker = tokenMatch[3];
      const sourceCoord = tokenMatch[4];

      // Destination resolution
      if (posPrefix === '同') {
        if (lastDestinationSquare) {
          toSquare = { ...lastDestinationSquare };
        }
      } else if (posPrefix.length >= 2) {
        const fileChar = posPrefix[0];
        const rankChar = posPrefix[1];
        if (fileChar && rankChar && FILE_MAP[fileChar] && RANK_MAP[rankChar]) {
          toSquare = {
            file: FILE_MAP[fileChar],
            rank: RANK_MAP[rankChar],
          };
        }
      }

      // Promotion flag
      if (promoteMarker === '成') {
        isPromote = true;
      }

      // Check for drop
      if (moveToken.includes('打') || sourceCoord === '打' || (!sourceCoord && !posPrefix.startsWith('同'))) {
        isDrop = true;
      } else if (sourceCoord && sourceCoord.length === 2) {
        const fromFile = parseInt(sourceCoord[0] ?? '0', 10);
        const fromRank = parseInt(sourceCoord[1] ?? '0', 10);
        if (fromFile >= 1 && fromFile <= 9 && fromRank >= 1 && fromRank <= 9) {
          fromSquare = { file: fromFile, rank: fromRank };
        }
      }
    } else {
      // Fallback extraction
      const srcMatch = moveToken.match(/\((\d\d)\)/);
      if (srcMatch && srcMatch[1]) {
        fromSquare = {
          file: parseInt(srcMatch[1][0] ?? '0', 10),
          rank: parseInt(srcMatch[1][1] ?? '0', 10),
        };
      }
    }

    if (!toSquare) {
      continue;
    }

    lastDestinationSquare = toSquare;

    // Piece mapping
    const pieceInfo = PIECE_MAP[pieceName] ?? { type: 'FU', usi: 'P' };

    // SFEN move coordinate construction
    let sfenMove: string;
    if (isDrop || !fromSquare) {
      sfenMove = `${pieceInfo.usi}*${toSquare.file}${rankToUsi(toSquare.rank)}`;
    } else {
      sfenMove = `${fromSquare.file}${rankToUsi(fromSquare.rank)}${toSquare.file}${rankToUsi(toSquare.rank)}${isPromote ? '+' : ''}`;
    }

    const move: ShogiMove = {
      ply,
      color,
      from: fromSquare,
      to: toSquare,
      piece: pieceInfo.type,
      promote: isPromote,
      isDrop,
      kifString: moveToken,
      sfenMove,
    };

    currentTargetList.push(move);
  }

  const normalizedDate = normalizeDate(dateRaw);
  const title = `${normalizedDate ?? 'unknown'}_${senteName}_vs_${goteName}`;
  const now = new Date().toISOString();

  // Automatic opening classification based on moves and header form
  const classified = classifyOpening(mainlineMoves, openingName);
  const detectedOpeningId = options.openingId ?? (classified.id !== 'unclassified' ? classified.id : (openingName ?? 'unclassified'));

  const game: IngestedGame = {
    id: generateGameId(title, rawKif),
    userId: options.userId ?? 'anonymous',
    openingId: detectedOpeningId,
    title,
    date: normalizedDate,
    senteName,
    goteName,
    tournament,
    winner: winner ?? 'unknown',
    plyCount: mainlineMoves.length,
    rawKif,
    isIncluded: true,
    isAnalyzed: mainlineMoves.some((m) => m.evaluation !== undefined),
    createdAt: now,
    updatedAt: now,
  };

  return {
    game,
    moves: mainlineMoves,
    variations,
  };
}
