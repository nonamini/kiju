/**
 * KIF Snippet / Fragment Move Parser.
 * Parses partial KIF move sequences, raw move numbers, comments, and USI strings.
 * Used for:
 * 1. Cutting out moves from game kifu records
 * 2. Pasting arbitrary KIF snippet text (e.g. "1 ７六歩(77) 2 ８四歩(83)...")
 * 3. Extracting line comments ("* コメント")
 * Follows Rule 1: strictly English code, comments, and identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import { parseKif } from './kifParser';
import { TacticsMoveComment } from '../types/tacticsNote';

export interface ParsedKifSnippetResult {
  usiMoves: string[];
  kifStrings: string[];
  moveComments: TacticsMoveComment[];
  error?: string;
}

/**
 * Parses a KIF move snippet or raw KIF string and extracts:
 * 1. An array of USI moves (e.g. ["7g7f", "8c8d", "3i4h"])
 * 2. KIF move strings (e.g. ["７六歩(77)", "８四歩(83)"])
 * 3. Any move comments embedded with * or # lines
 */
export function parseKifSnippet(snippetText: string): ParsedKifSnippetResult {
  const trimmed = snippetText.trim();
  if (!trimmed) {
    return { usiMoves: [], kifStrings: [], moveComments: [] };
  }

  // Pre-process: extract comments associated with line numbers
  const lines = trimmed.split(/\r?\n/);
  const moveComments: TacticsMoveComment[] = [];
  let currentPly = 0;

  for (const line of lines) {
    const l = line.trim();
    if (!l) continue;

    // Check move line number
    const moveMatch = l.match(/^\s*(\d+)\s+/);
    if (moveMatch && moveMatch[1]) {
      currentPly = parseInt(moveMatch[1], 10);
    } else if (l.startsWith('*') || l.startsWith('#')) {
      const commentText = l.replace(/^[*#]\s*/, '').trim();
      if (commentText && currentPly > 0) {
        moveComments.push({ ply: currentPly, comment: commentText });
      }
    }
  }

  // Ensure header if not present so parseKif treats it reliably
  let fullText = trimmed;
  if (!fullText.includes('手数----指手---------消費時間--') && !fullText.includes('先手：') && !fullText.includes('後手：')) {
    fullText = `先手：先手\n後手：後手\n手数----指手---------消費時間--\n` + fullText;
  }

  try {
    const res = parseKif(fullText);
    const usiMoves: string[] = [];
    const kifStrings: string[] = [];

    for (const m of res.moves) {
      if (m.sfenMove) {
        usiMoves.push(m.sfenMove);
        kifStrings.push(m.kifString);
      }
    }

    return {
      usiMoves,
      kifStrings,
      moveComments,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      usiMoves: [],
      kifStrings: [],
      moveComments: [],
      error: errorMsg,
    };
  }
}
