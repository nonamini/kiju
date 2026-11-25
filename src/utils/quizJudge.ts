/**
 * Tactical Quiz Judge & Hint Helpers.
 * Implements strict PV matching, score-tolerant evaluation (within 50cp),
 * deterministic 3-choice hint generation, and hint penalty scoring for SM-2.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { Color } from '../types/shogi';
import { TacticalQuizCard } from '../types/quiz';

export type QuizVerdict = 'best' | 'acceptable' | 'wrong';

export const ACCEPTABLE_TOLERANCE_CP = 50;

/**
 * Checks if user's move exactly matches the expected PV move string.
 */
export function judgeByPv(userUsi: string, expectedUsi: string): 'best' | null {
  return userUsi.trim() === expectedUsi.trim() ? 'best' : null;
}

/**
 * Compares engine search evaluation after the user's move against the benchmark score.
 * scoreCpAfterUserMove is Sente-view (+ is Sente advantage, - is Gote advantage).
 * scoreCpBefore is already solver-view from the quiz card.
 */
export function judgeByScore(
  solverColor: Color,
  scoreCpAfterUserMove: number,
  scoreCpBefore: number
): 'acceptable' | 'wrong' {
  const solverScore = solverColor === 'b' ? scoreCpAfterUserMove : -scoreCpAfterUserMove;
  return solverScore >= scoreCpBefore - ACCEPTABLE_TOLERANCE_CP ? 'acceptable' : 'wrong';
}

/**
 * Simple deterministic 32-bit FNV-1a hash for string keys.
 */
function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Selects exactly 3 distinct move choices including the correct move.
 * Uses a deterministic hash of card.id and candidate move to order distractors.
 */
export function pickHintChoices(
  card: TacticalQuizCard,
  legalUsiMoves: string[],
  step = 0
): string[] {
  const currentBestUsi = (card.pv[step * 2] ?? card.bestMove).trim();

  // If step 0 and card has pre-generated choices, verify they are legal AND that bestMove is strictly included
  if (step === 0 && card.choices && card.choices.length >= 2) {
    const precomputedLegal = card.choices
      .map((c) => c.usi.trim())
      .filter((usi) => legalUsiMoves.includes(usi) || usi === currentBestUsi);
    // Guarantee that currentBestUsi is included among the returned choices!
    if (precomputedLegal.includes(currentBestUsi) && precomputedLegal.length >= 2) {
      return precomputedLegal;
    }
  }

  // Collect legal distractors strictly excluding targetMove
  const distractors = legalUsiMoves
    .map((m) => m.trim())
    .filter((m) => m.length > 0 && m !== currentBestUsi && m !== 'none' && m !== 'resign');

  const uniqueDistractors = Array.from(new Set(distractors));

  // Deterministically sort distractors based on hash with card.id and step
  uniqueDistractors.sort((a, b) => {
    const hashA = hashString(`${card.id}:${step}:${a}`);
    const hashB = hashString(`${card.id}:${step}:${b}`);
    if (hashA !== hashB) return hashA - hashB;
    return a.localeCompare(b);
  });

  // MUST always include currentBestUsi in the choices! Never produce a 3-choice without the correct answer.
  const chosenDistractors = uniqueDistractors.slice(0, 2);
  const choices = [currentBestUsi, ...chosenDistractors];

  // Deterministically shuffle choices so correct move isn't always in first slot
  choices.sort((a, b) => {
    const hashA = hashString(`${card.id}:${step}:pos:${a}`);
    const hashB = hashString(`${card.id}:${step}:pos:${b}`);
    if (hashA !== hashB) return hashA - hashB;
    return a.localeCompare(b);
  });

  return choices;
}

/**
 * Computes hint penalty score for SM-2 review quality calculation.
 * 0 = no hint, 2 = 3-choice hint used, 5 = answer revealed.
 */
export function hintPenaltyFor(hintUsed: boolean, answerRevealed: boolean): number {
  if (answerRevealed) return 5;
  if (hintUsed) return 2;
  return 0;
}
