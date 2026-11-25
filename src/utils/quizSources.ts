/**
 * Converters for quiz source extraction inputs.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { MatchRecord } from '../types/match';
import { QuizSourceGame } from '../types/quiz';
import { ParsedKifResult } from './kifParser';
import { GameMergeInput } from './treeMerger';

/**
 * Converts a MatchRecord into a QuizSourceGame for tactical quiz extraction.
 */
export function matchRecordToQuizSource(rec: MatchRecord): QuizSourceGame {
  return {
    gameId: rec.id,
    openingId: rec.openingId,
    startSfen: rec.startSfen,
    moves: rec.moves,
  };
}

/**
 * Converts a ParsedKifResult (imported game) into a QuizSourceGame.
 */
export function parsedKifToQuizSource(kif: ParsedKifResult): QuizSourceGame {
  return {
    gameId: kif.game.id,
    openingId: kif.game.openingId || 'other',
    startSfen: 'startpos',
    moves: kif.moves,
  };
}

/**
 * Converts a GameMergeInput (ingested game in memory) into a QuizSourceGame.
 */
export function gameMergeInputToQuizSource(input: GameMergeInput): QuizSourceGame {
  return {
    gameId: input.game.id,
    openingId: input.game.openingId || 'other',
    startSfen: 'startpos',
    moves: input.moves,
  };
}
