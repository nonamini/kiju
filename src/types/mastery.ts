/**
 * Opening Mastery & Performance Dashboard Types.
 * Aggregates spaced repetition retention metrics and sparring game outcomes
 * across standardized Shogi opening categories.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

export interface OpeningMasteryStats {
  openingId: string;
  openingNameKey: string;
  totalCards: number;
  masteredCards: number; // Mature/mastered cards (interval >= 21 days or reps >= 4)
  reviewCards: number; // Intermediate review cards
  learningCards: number; // In-progress learning cards (reps < 2)
  newCards: number; // Unseen cards (totalAttempts === 0)
  masteryPct: number; // (masteredCards / totalCards) * 100
  accuracyPct: number; // (totalAttempts - mistakes) / totalAttempts * 100
  dueCardsCount: number; // Number of cards due for review today
  totalMatches: number; // Total sparring matches in this opening
  matchWins: number;
  matchLosses: number;
  matchDraws: number;
  winRatePct: number; // (wins / (wins + losses)) * 100
  overallScore: number; // Blended rating score (0 - 100)
}

export interface OverallMasterySummary {
  totalOpeningsPracticed: number;
  totalCards: number;
  masteredCards: number;
  overallMasteryPct: number;
  totalMatches: number;
  totalWins: number;
  overallWinRatePct: number;
  dueTodayCount: number;
  openings: OpeningMasteryStats[];
}
