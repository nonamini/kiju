/**
 * Tactical Quiz Filtering & Aggregation Utilities.
 * Provides pure functions for filtering quiz cards and computing per-opening and per-type statistics.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { TacticalQuizCard, TacticalQuizType } from '../types/quiz';

export interface QuizFilter {
  openingId?: string;
  type?: TacticalQuizType;
  gameId?: string;
  enabledOnly?: boolean;
}

/**
 * Filters quiz cards based on optional criteria.
 */
export function filterQuizCards(cards: TacticalQuizCard[], f: QuizFilter): TacticalQuizCard[] {
  return cards.filter((c) => {
    if (f.openingId && c.openingId !== f.openingId) {
      return false;
    }
    if (f.type && c.type !== f.type) {
      return false;
    }
    if (f.gameId && c.sourceGameId !== f.gameId) {
      return false;
    }
    if (f.enabledOnly && !c.isEnabled) {
      return false;
    }
    return true;
  });
}

/**
 * Counts total and enabled cards per opening classification.
 */
export function countByOpening(
  cards: TacticalQuizCard[]
): Record<string, { total: number; enabled: number }> {
  const result: Record<string, { total: number; enabled: number }> = {};

  for (const c of cards) {
    const entry = result[c.openingId] ?? { total: 0, enabled: 0 };
    entry.total += 1;
    if (c.isEnabled) {
      entry.enabled += 1;
    }
    result[c.openingId] = entry;
  }

  return result;
}

/**
 * Counts cards by tactical quiz category, ensuring all 4 keys are always present.
 */
export function countByType(cards: TacticalQuizCard[]): Record<TacticalQuizType, number> {
  const result: Record<TacticalQuizType, number> = {
    attack: 0,
    defense: 0,
    race: 0,
    mate: 0,
  };

  for (const c of cards) {
    result[c.type] = (result[c.type] ?? 0) + 1;
  }

  return result;
}
