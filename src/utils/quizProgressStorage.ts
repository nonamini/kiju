/**
 * Quiz Progress Storage & Scheduling Helper.
 * Handles localStorage persistence of TacticalQuiz SM-2 progress,
 * calculates updated review intervals, and selects the next prioritized drill card.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { TacticalQuizCard } from '../types/quiz';
import { calculateSm2Update, DEFAULT_EASE_FACTOR } from './sm2Scheduler';
import { getSafeStorage } from './matchHistoryStorage';

export const QUIZ_PROGRESS_STORAGE_KEY = 'joseki_tree_quiz_progress';

export interface QuizProgress {
  cardId: string;
  attempts: number;
  correctCount: number;
  intervalDays: number;
  repetitionCount: number;
  easeFactor: number;
  dueDate: string; // YYYY-MM-DD
  lastQuality: number;
  lastAttemptAt: string; // ISO string
}

/**
 * Loads all quiz card progress records from localStorage.
 * Returns an empty record dictionary if data is missing or corrupted.
 */
export function loadQuizProgress(): Record<string, QuizProgress> {
  const storage = getSafeStorage();
  try {
    const raw = storage.getItem(QUIZ_PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as Record<string, QuizProgress>;
  } catch {
    return {};
  }
}

/**
 * Persists all quiz card progress records to localStorage.
 */
export function saveQuizProgress(progress: Record<string, QuizProgress>): void {
  const storage = getSafeStorage();
  try {
    storage.setItem(QUIZ_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch (err) {
    console.error('Failed to save quiz progress to storage:', err);
  }
}

/**
 * Completely clears all quiz progress and review history from localStorage.
 */
export function clearQuizProgress(): void {
  const storage = getSafeStorage();
  try {
    storage.removeItem(QUIZ_PROGRESS_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear quiz progress from storage:', err);
  }
}

/**
 * Applies an SM-2 review outcome to a quiz card and computes the updated progress.
 */
export function applyQuizResult(
  prev: QuizProgress | undefined,
  cardId: string,
  quality: number,
  now: Date = new Date()
): QuizProgress {
  const currentEf = prev?.easeFactor ?? DEFAULT_EASE_FACTOR;
  const currentInterval = prev?.intervalDays ?? 1;
  const currentReps = prev?.repetitionCount ?? 0;

  const sm2Result = calculateSm2Update(
    {
      intervalDays: currentInterval,
      repetitionCount: currentReps,
      easeFactor: currentEf,
    },
    quality,
    now
  );

  const prevAttempts = prev?.attempts ?? 0;
  const prevCorrect = prev?.correctCount ?? 0;
  const isSuccessful = quality >= 3;

  return {
    cardId,
    attempts: prevAttempts + 1,
    correctCount: prevCorrect + (isSuccessful ? 1 : 0),
    intervalDays: sm2Result.intervalDays,
    repetitionCount: sm2Result.repetitionCount,
    easeFactor: sm2Result.easeFactor,
    dueDate: sm2Result.dueDate,
    lastQuality: quality,
    lastAttemptAt: now.toISOString(),
  };
}

/**
 * Prioritizes and selects the next quiz card to present to the user:
 * 1. Enabled due cards (dueDate <= today), sorted by earliest dueDate.
 * 2. Enabled unseen cards (no progress record), sorted by lowest ply.
 * 3. Returns null if all enabled cards are done for the day or none exist.
 */
export function pickNextQuiz(
  cards: TacticalQuizCard[],
  progress: Record<string, QuizProgress>,
  today: string,
  excludeId?: string
): TacticalQuizCard | null {
  const eligibleCards = cards.filter(
    (card) => card.isEnabled && (!excludeId || card.id !== excludeId)
  );

  if (eligibleCards.length === 0) return null;

  // 1. Due cards
  const dueCards = eligibleCards.filter((card) => {
    const item = progress[card.id];
    return item && item.dueDate <= today;
  });

  if (dueCards.length > 0) {
    dueCards.sort((a, b) => {
      const dueA = progress[a.id]!.dueDate;
      const dueB = progress[b.id]!.dueDate;
      if (dueA !== dueB) return dueA.localeCompare(dueB);
      return a.ply - b.ply;
    });
    return dueCards[0]!;
  }

  // 2. Unseen cards
  const unseenCards = eligibleCards.filter((card) => !progress[card.id]);
  if (unseenCards.length > 0) {
    unseenCards.sort((a, b) => a.ply - b.ply);
    return unseenCards[0]!;
  }

  return null;
}
