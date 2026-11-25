/**
 * Pure SM-2 Spaced Repetition Scheduling Engine.
 * Implements the SuperMemo-2 (SM-2) algorithm for Shogi joseki memorization.
 * Calculates next intervals, ease factors, and due dates based on active recall quality.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { SRSReviewCard } from '../types/srs';

export interface Sm2CalculationResult {
  intervalDays: number;
  repetitionCount: number;
  easeFactor: number;
  dueDate: string; // ISO date string (YYYY-MM-DD)
  quality: number; // 0-5
}

export interface ReviewPerformanceInput {
  isCorrect: boolean;
  mistakeCount: number;
  hintPenaltyScore: number;
}

/**
 * Minimum allowable Ease Factor in SM-2 standard.
 */
export const MIN_EASE_FACTOR = 1.3;

/**
 * Default initial Ease Factor for newly scheduled cards.
 */
export const DEFAULT_EASE_FACTOR = 2.5;

/**
 * Formats a Date object to YYYY-MM-DD format in local time.
 */
export function formatIsoDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Adds an integer number of days to a base date.
 */
export function addDays(baseDate: Date, days: number): Date {
  const result = new Date(baseDate.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Parses YYYY-MM-DD date string safely, returning a Date at midnight.
 */
export function parseIsoDateOnly(dateStr: string): Date {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0] ?? '1970', 10);
  const month = parseInt(parts[1] ?? '1', 10) - 1;
  const day = parseInt(parts[2] ?? '1', 10);
  return new Date(year, month, day, 0, 0, 0, 0);
}

/**
 * Derives SM-2 recall quality (0 to 5) from performance metrics:
 * - 5: Perfect recall without hesitation or clues.
 * - 4: Correct after a minor clue (1pt penalty, e.g. rank or file only).
 * - 3: Correct after moderate clues (2-4pt penalty, e.g. piece type or multiple clues).
 * - 2: Correct only after answer reveal (5pt penalty) or with 1+ mistakes.
 * - 1: Failed response, but recognizable.
 * - 0: Complete failure.
 */
export function calculateReviewQuality(input: ReviewPerformanceInput): number {
  if (!input.isCorrect) {
    return 0;
  }
  if (input.mistakeCount > 0) {
    return Math.max(1, 2 - Math.min(1, input.mistakeCount - 1));
  }
  if (input.hintPenaltyScore >= 5) {
    return 2; // Answer was revealed
  }
  if (input.hintPenaltyScore >= 2) {
    return 3; // Piece revealed or multiple clues used
  }
  if (input.hintPenaltyScore >= 1) {
    return 4; // Minor clue used
  }
  return 5; // Clean recall
}

/**
 * Computes next SM-2 interval, repetition count, ease factor, and due date.
 *
 * Algorithm Rules:
 * If quality < 3 (failure):
 *   repetitionCount = 0
 *   intervalDays = 1
 * If quality >= 3 (success):
 *   repetitionCount = repetitionCount + 1
 *   intervalDays = 1 if repetitionCount === 1
 *   intervalDays = 6 if repetitionCount === 2
 *   intervalDays = round(intervalDays * easeFactor) if repetitionCount > 2
 *
 * Ease Factor update:
 *   EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
 *   Bounded below by 1.3
 */
export const calculateSm2Update = (
  currentCard: Pick<SRSReviewCard, 'intervalDays' | 'repetitionCount' | 'easeFactor'>,
  quality: number,
  reviewDate: Date = new Date()
): Sm2CalculationResult => {
  const boundedQuality = Math.max(0, Math.min(5, Math.round(quality)));
  const currentEf = Math.max(MIN_EASE_FACTOR, currentCard.easeFactor || DEFAULT_EASE_FACTOR);
  const currentInterval = Math.max(1, currentCard.intervalDays || 1);
  const currentReps = Math.max(0, currentCard.repetitionCount || 0);

  // Calculate new Ease Factor
  const deltaEf =
    0.1 - (5 - boundedQuality) * (0.08 + (5 - boundedQuality) * 0.02);
  const nextEf = Math.max(MIN_EASE_FACTOR, Number((currentEf + deltaEf).toFixed(4)));

  let nextReps: number;
  let nextInterval: number;

  if (boundedQuality < 3) {
    // Failed recall: reset repetitions and repeat in 1 day
    nextReps = 0;
    nextInterval = 1;
  } else {
    // Successful recall: advance repetitions and expand intervals
    nextReps = currentReps + 1;
    if (nextReps === 1) {
      nextInterval = 1;
    } else if (nextReps === 2) {
      nextInterval = 6;
    } else {
      nextInterval = Math.max(1, Math.round(currentInterval * nextEf));
    }
  }

  const nextDueDate = formatIsoDateOnly(addDays(reviewDate, nextInterval));

  return {
    intervalDays: nextInterval,
    repetitionCount: nextReps,
    easeFactor: nextEf,
    dueDate: nextDueDate,
    quality: boundedQuality,
  };
}

/**
 * Updates an SRSReviewCard immutably with the results of a drill session review.
 */
export function applySm2Review(
  card: SRSReviewCard,
  performance: ReviewPerformanceInput,
  reviewDate: Date = new Date()
): SRSReviewCard {
  const quality = calculateReviewQuality(performance);
  const update = calculateSm2Update(card, quality, reviewDate);

  return {
    ...card,
    intervalDays: update.intervalDays,
    repetitionCount: update.repetitionCount,
    easeFactor: update.easeFactor,
    dueDate: update.dueDate,
    totalAttempts: (card.totalAttempts || 0) + 1,
    mistakes: (card.mistakes || 0) + performance.mistakeCount,
    hintsUsedCount: (card.hintsUsedCount || 0) + (performance.hintPenaltyScore > 0 ? 1 : 0),
    lastReviewedAt: reviewDate.toISOString(),
  };
}

/**
 * Checks if a card is due for review on or before the given target date.
 */
export function isCardDue(card: SRSReviewCard, targetDate: Date = new Date()): boolean {
  if (!card.dueDate) return true;
  const targetDateStr = formatIsoDateOnly(targetDate);
  return card.dueDate <= targetDateStr;
}

/**
 * Summarizes cards by spaced repetition maturity brackets.
 */
export function getCardMaturity(card: SRSReviewCard): 'new' | 'learning' | 'review' | 'mastered' {
  if (!card.totalAttempts || card.totalAttempts === 0) return 'new';
  if (card.repetitionCount < 2) return 'learning';
  if (card.intervalDays >= 21 || card.repetitionCount >= 4) return 'mastered';
  return 'review';
}
