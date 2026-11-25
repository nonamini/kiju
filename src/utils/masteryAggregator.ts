/**
 * Opening Mastery & Performance Aggregator.
 * Aggregates SRS retention metrics and sparring outcomes grouped by opening category.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { SRSReviewCard } from '../types/srs';
import { MatchRecord } from '../types/match';
import { OpeningMasteryStats, OverallMasterySummary } from '../types/mastery';
import { OPENING_CATEGORIES } from './openingClassifier';
import { getCardMaturity, isCardDue } from './sm2Scheduler';

export interface MasteryAggregationOptions {
  srsCards: SRSReviewCard[];
  matchRecords: MatchRecord[];
  targetDate?: Date;
}

/**
 * Aggregates SRS cards and sparring matches into an OverallMasterySummary.
 */
export function aggregateOpeningMastery(
  options: MasteryAggregationOptions
): OverallMasterySummary {
  const { srsCards, matchRecords, targetDate = new Date() } = options;

  // Build a set of all known opening IDs
  const knownOpeningIds = new Set<string>(OPENING_CATEGORIES.map((c) => c.id));
  const categoryMap = new Map<string, string>(
    OPENING_CATEGORIES.map((c) => [c.id, c.nameKey])
  );

  // Collect any custom opening IDs present in cards or records
  for (const card of srsCards) {
    if (card.openingId && !knownOpeningIds.has(card.openingId)) {
      knownOpeningIds.add(card.openingId);
      categoryMap.set(card.openingId, `openings.${card.openingId}`);
    }
  }
  for (const match of matchRecords) {
    if (match.openingId && !knownOpeningIds.has(match.openingId)) {
      knownOpeningIds.add(match.openingId);
      categoryMap.set(match.openingId, `openings.${match.openingId}`);
    }
  }

  // Pre-group SRS cards by opening
  const cardsByOpening = new Map<string, SRSReviewCard[]>();
  for (const card of srsCards) {
    const list = cardsByOpening.get(card.openingId) ?? [];
    list.push(card);
    cardsByOpening.set(card.openingId, list);
  }

  // Pre-group Match records by opening
  const matchesByOpening = new Map<string, MatchRecord[]>();
  for (const match of matchRecords) {
    const list = matchesByOpening.get(match.openingId) ?? [];
    list.push(match);
    matchesByOpening.set(match.openingId, list);
  }

  const openingStatsList: OpeningMasteryStats[] = [];

  let totalCardsCount = 0;
  let totalMasteredCardsCount = 0;
  let totalMatchesCount = 0;
  let totalWinsCount = 0;
  let totalLossesCount = 0;
  let totalDueToday = 0;
  let activeOpeningsCount = 0;

  for (const openingId of knownOpeningIds) {
    const cards = cardsByOpening.get(openingId) ?? [];
    const matches = matchesByOpening.get(openingId) ?? [];

    const totalCards = cards.length;
    let masteredCards = 0;
    let reviewCards = 0;
    let learningCards = 0;
    let newCards = 0;
    let totalAttempts = 0;
    let totalMistakes = 0;
    let dueCardsCount = 0;

    for (const c of cards) {
      const maturity = getCardMaturity(c);
      if (maturity === 'mastered') masteredCards++;
      else if (maturity === 'review') reviewCards++;
      else if (maturity === 'learning') learningCards++;
      else newCards++;

      totalAttempts += c.totalAttempts || 0;
      totalMistakes += c.mistakes || 0;

      if (isCardDue(c, targetDate)) {
        dueCardsCount++;
      }
    }

    const masteryPct = totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0;
    const accuracyPct =
      totalAttempts > 0
        ? Math.round(((totalAttempts - totalMistakes) / totalAttempts) * 100)
        : 0;

    const totalMatches = matches.length;
    let matchWins = 0;
    let matchLosses = 0;
    let matchDraws = 0;

    for (const m of matches) {
      if (m.result === 'win') matchWins++;
      else if (m.result === 'loss') matchLosses++;
      else if (m.result === 'draw') matchDraws++;
    }

    const finishedMatches = matchWins + matchLosses;
    const winRatePct =
      finishedMatches > 0 ? Math.round((matchWins / finishedMatches) * 100) : 0;

    // Calculate overall blended score (0 - 100)
    let overallScore = 0;
    if (totalCards > 0 && finishedMatches > 0) {
      overallScore = Math.round(masteryPct * 0.6 + winRatePct * 0.4);
    } else if (totalCards > 0) {
      overallScore = masteryPct;
    } else if (finishedMatches > 0) {
      overallScore = winRatePct;
    }

    if (totalCards > 0 || totalMatches > 0) {
      activeOpeningsCount++;
    }

    totalCardsCount += totalCards;
    totalMasteredCardsCount += masteredCards;
    totalMatchesCount += totalMatches;
    totalWinsCount += matchWins;
    totalLossesCount += matchLosses;
    totalDueToday += dueCardsCount;

    openingStatsList.push({
      openingId,
      openingNameKey: categoryMap.get(openingId) ?? `openings.${openingId}`,
      totalCards,
      masteredCards,
      reviewCards,
      learningCards,
      newCards,
      masteryPct,
      accuracyPct,
      dueCardsCount,
      totalMatches,
      matchWins,
      matchLosses,
      matchDraws,
      winRatePct,
      overallScore,
    });
  }

  // Sort: active openings first (by overallScore desc), then inactive
  openingStatsList.sort((a, b) => {
    const aActive = a.totalCards > 0 || a.totalMatches > 0 ? 1 : 0;
    const bActive = b.totalCards > 0 || b.totalMatches > 0 ? 1 : 0;
    if (bActive !== aActive) {
      return bActive - aActive;
    }
    return b.overallScore - a.overallScore;
  });

  const overallMasteryPct =
    totalCardsCount > 0
      ? Math.round((totalMasteredCardsCount / totalCardsCount) * 100)
      : 0;

  const totalFinishedMatches = totalWinsCount + totalLossesCount;
  const overallWinRatePct =
    totalFinishedMatches > 0
      ? Math.round((totalWinsCount / totalFinishedMatches) * 100)
      : 0;

  return {
    totalOpeningsPracticed: activeOpeningsCount,
    totalCards: totalCardsCount,
    masteredCards: totalMasteredCardsCount,
    overallMasteryPct,
    totalMatches: totalMatchesCount,
    totalWins: totalWinsCount,
    overallWinRatePct,
    dueTodayCount: totalDueToday,
    openings: openingStatsList,
  };
}
