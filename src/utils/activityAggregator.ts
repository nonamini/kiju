/**
 * Motivation Dashboard & Match Performance Aggregator (Epic 13, Issue #53).
 * Pure, deterministic, order-independent aggregation over KifuRecord[],
 * MatchRecord[], SRSReviewCard[], and ShogiPlayerProfile[].
 * Spec: docs/spec/motivation_dashboard.md
 * Follows Rule 1: strictly English code, comments, and identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import type { KifuRecord } from '../types/kifuRecord';
import type { MatchRecord } from '../types/match';
import type { PlayerCategory, ShogiPlayerProfile } from '../types/player';
import type { SRSReviewCard } from '../types/srs';
import { isOwnerProfile } from './gameKindClassifier';
import { classifyOpening, OPENING_CATEGORIES } from './openingClassifier';
import { getCardMaturity, isCardDue } from './sm2Scheduler';

export interface DailyActivityBucket {
  date: string; // YYYY-MM-DD (UTC)
  kifuCount: number;
  matchCount: number;
  reviewCount: number;
  totalActions: number;
}

export interface WinRateTrendPoint {
  index: number; // 1-based chronological game index
  date: string; // YYYY-MM-DD
  result: 'win' | 'loss' | 'draw';
  cumulativeWinRate: number; // 0..100
  opponentName: string;
  openingName: string;
}

export interface OpeningBreakdownItem {
  openingId: string;
  nameKey?: string;
  openingName: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}

export interface OpponentBreakdownItem {
  opponentName: string;
  category: PlayerCategory | 'unknown';
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}

export interface OpeningCoverageItem {
  openingId: string;
  nameKey: string;
  kifuCount: number;
  srsCardCount: number;
  isCovered: boolean;
}

export interface MotivationActivityStats {
  totalKifuCount: number;
  proKifuCount: number;
  selfGameCount: number;
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  totalSrsCards: number;
  masteredSrsCards: number;
  dueSrsCards: number;
  currentStreakDays: number;
  longestStreakDays: number;
  activeToday: boolean;
  weeklyTotalActions: number;
  weeklyKifuCount: number;
  weeklyMatchCount: number;
  weeklyReviewCount: number;
  weeklySeries: DailyActivityBucket[];
  recentForm: Array<'win' | 'loss' | 'draw'>;
  winRateTrend: WinRateTrendPoint[];
  openingBreakdown: OpeningBreakdownItem[];
  opponentBreakdown: OpponentBreakdownItem[];
  openingCoverage: {
    coveredCount: number;
    totalCategories: number;
    coveragePct: number;
    items: OpeningCoverageItem[];
  };
}

export interface AggregateMotivationOptions {
  kifuRecords: KifuRecord[];
  matchRecords?: MatchRecord[];
  srsCards?: SRSReviewCard[];
  playerProfiles?: ShogiPlayerProfile[];
  referenceDate?: Date;
}

interface NormalizedUserMatch {
  sortKey: string;
  date: string;
  result: 'win' | 'loss' | 'draw';
  openingId: string;
  openingName: string;
  opponentName: string;
  opponentCategory: PlayerCategory | 'unknown';
}

const NAMED_OPENING_CATEGORIES = OPENING_CATEGORIES.filter(
  (c) => c.id !== 'unclassified'
);
const NAMED_OPENING_MAP = new Map<string, string>(
  NAMED_OPENING_CATEGORIES.map((c) => [c.id, c.nameKey])
);

function toUtcDateKey(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const ts = Date.parse(trimmed);
  if (Number.isNaN(ts)) return null;
  return new Date(ts).toISOString().slice(0, 10);
}

function shiftUtcDateKey(dateKey: string, deltaDays: number): string {
  const parts = dateKey.split('-').map(Number);
  const year = parts[0] ?? 1970;
  const month = (parts[1] ?? 1) - 1;
  const day = parts[2] ?? 1;
  return new Date(Date.UTC(year, month, day + deltaDays))
    .toISOString()
    .slice(0, 10);
}

function computeWinRatePct(wins: number, losses: number): number {
  const decided = wins + losses;
  if (decided === 0) return 0;
  return Math.round((wins / decided) * 1000) / 10;
}

function resolveOpeningCategoryId(
  openingId?: string,
  openingName?: string
): string {
  if (openingId && NAMED_OPENING_MAP.has(openingId)) {
    return openingId;
  }
  const classified = classifyOpening([], openingName);
  return classified.id;
}

function resolveSelfGameMatch(
  rec: KifuRecord,
  ownerIds: Set<string>,
  profileById: Map<string, ShogiPlayerProfile>
): NormalizedUserMatch | null {
  if (rec.gameKind !== 'self') return null;
  if (rec.winner !== 'sente' && rec.winner !== 'gote' && rec.winner !== 'draw') {
    return null;
  }

  const senteIsOwner =
    Boolean(rec.sentePlayerId && ownerIds.has(rec.sentePlayerId)) ||
    profileById.get(rec.sentePlayerId ?? '')?.category === 'user';
  const goteIsOwner =
    Boolean(rec.gotePlayerId && ownerIds.has(rec.gotePlayerId)) ||
    profileById.get(rec.gotePlayerId ?? '')?.category === 'user';

  let userSide: 'sente' | 'gote' | null = null;
  if (senteIsOwner && !goteIsOwner) {
    userSide = 'sente';
  } else if (goteIsOwner && !senteIsOwner) {
    userSide = 'gote';
  } else if (!senteIsOwner && !goteIsOwner) {
    // Fallback: if one side is AI, treat the non-AI side as the user
    const senteIsAi = profileById.get(rec.sentePlayerId ?? '')?.category === 'ai';
    const goteIsAi = profileById.get(rec.gotePlayerId ?? '')?.category === 'ai';
    if (goteIsAi && !senteIsAi) userSide = 'sente';
    else if (senteIsAi && !goteIsAi) userSide = 'gote';
  }

  if (!userSide) return null;

  let result: 'win' | 'loss' | 'draw' = 'draw';
  if (rec.winner !== 'draw') {
    result = rec.winner === userSide ? 'win' : 'loss';
  }

  const oppId = userSide === 'sente' ? rec.gotePlayerId : rec.sentePlayerId;
  const oppProfile = oppId ? profileById.get(oppId) : undefined;
  const opponentName = (
    oppProfile?.name ||
    (userSide === 'sente' ? rec.goteName : rec.senteName) ||
    'Unknown'
  ).trim();
  const opponentCategory: PlayerCategory | 'unknown' =
    oppProfile?.category ?? 'unknown';

  const dateKey =
    toUtcDateKey(rec.matchDate) ??
    toUtcDateKey(rec.createdAt) ??
    toUtcDateKey(rec.updatedAt) ??
    '1970-01-01';
  const resolvedOpeningId = resolveOpeningCategoryId(
    rec.openingId,
    rec.openingName
  );
  const openingName = (rec.openingName || resolvedOpeningId || 'other').trim();

  return {
    sortKey: `${dateKey}T${(rec.createdAt || '').slice(11, 24)}|kifu|${rec.id}`,
    date: dateKey,
    result,
    openingId: resolvedOpeningId,
    openingName,
    opponentName,
    opponentCategory,
  };
}

function computeStreaks(
  activeDates: Set<string>,
  todayKey: string
): { currentStreakDays: number; longestStreakDays: number; activeToday: boolean } {
  const activeToday = activeDates.has(todayKey);
  if (activeDates.size === 0) {
    return { currentStreakDays: 0, longestStreakDays: 0, activeToday: false };
  }

  // Current streak starts at today if active today, otherwise yesterday (ongoing grace window)
  const yesterdayKey = shiftUtcDateKey(todayKey, -1);
  let cursor = activeToday ? todayKey : activeDates.has(yesterdayKey) ? yesterdayKey : null;
  let currentStreakDays = 0;
  while (cursor && activeDates.has(cursor)) {
    currentStreakDays += 1;
    cursor = shiftUtcDateKey(cursor, -1);
  }

  // Longest historical streak across sorted unique active date keys
  const sortedDates = Array.from(activeDates).sort();
  let longestStreakDays = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sortedDates) {
    if (prev && shiftUtcDateKey(prev, 1) === d) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longestStreakDays) {
      longestStreakDays = run;
    }
    prev = d;
  }

  return { currentStreakDays, longestStreakDays, activeToday };
}

/**
 * Aggregates all motivation, streak, activity, and match analytics metrics
 * in a purely deterministic, input-order-independent manner.
 */
export function aggregateMotivationActivity(
  options: AggregateMotivationOptions
): MotivationActivityStats {
  const {
    kifuRecords,
    matchRecords = [],
    srsCards = [],
    playerProfiles = [],
    referenceDate = new Date(),
  } = options;

  const todayKey = referenceDate.toISOString().slice(0, 10);
  const profileById = new Map<string, ShogiPlayerProfile>(
    playerProfiles.map((p) => [p.id, p])
  );
  const ownerIds = new Set<string>(
    playerProfiles.filter(isOwnerProfile).map((p) => p.id)
  );

  const sortedKifus = [...kifuRecords].sort((a, b) => a.id.localeCompare(b.id));
  const sortedMatches = [...matchRecords].sort((a, b) => a.id.localeCompare(b.id));
  const sortedCards = [...srsCards].sort((a, b) => a.id.localeCompare(b.id));

  // Build 7-day rolling window buckets ending on todayKey
  const weeklySeries: DailyActivityBucket[] = [];
  const weeklyBucketMap = new Map<string, DailyActivityBucket>();
  for (let offset = 6; offset >= 0; offset--) {
    const dateKey = shiftUtcDateKey(todayKey, -offset);
    const bucket: DailyActivityBucket = {
      date: dateKey,
      kifuCount: 0,
      matchCount: 0,
      reviewCount: 0,
      totalActions: 0,
    };
    weeklySeries.push(bucket);
    weeklyBucketMap.set(dateKey, bucket);
  }

  const activeDates = new Set<string>();
  const normalizedMatches: NormalizedUserMatch[] = [];

  let proKifuCount = 0;
  let selfGameCount = 0;

  // 1. Process KifuRecords
  const kifuByOpening = new Map<string, number>();
  for (const rec of sortedKifus) {
    if (rec.gameKind === 'pro') proKifuCount += 1;
    if (rec.gameKind === 'self') selfGameCount += 1;

    const resolvedOpId = resolveOpeningCategoryId(rec.openingId, rec.openingName);
    kifuByOpening.set(resolvedOpId, (kifuByOpening.get(resolvedOpId) ?? 0) + 1);

    const activityDate =
      toUtcDateKey(rec.createdAt) ?? toUtcDateKey(rec.matchDate);
    if (activityDate) {
      activeDates.add(activityDate);
      const bucket = weeklyBucketMap.get(activityDate);
      if (bucket) {
        if (rec.gameKind === 'self') {
          bucket.matchCount += 1;
        } else {
          bucket.kifuCount += 1;
        }
        bucket.totalActions += 1;
      }
    }

    const selfMatch = resolveSelfGameMatch(rec, ownerIds, profileById);
    if (selfMatch) {
      normalizedMatches.push(selfMatch);
    }
  }

  // 2. Process sparring MatchRecords
  for (const m of sortedMatches) {
    const rawTs = m.endedAt || m.startedAt;
    const dateKey = toUtcDateKey(rawTs);
    if (dateKey) {
      activeDates.add(dateKey);
      const bucket = weeklyBucketMap.get(dateKey);
      if (bucket) {
        bucket.matchCount += 1;
        bucket.totalActions += 1;
      }
    }

    if (m.result === 'aborted') continue;
    const resolvedOpId = resolveOpeningCategoryId(m.openingId, m.openingId);
    normalizedMatches.push({
      sortKey: `${rawTs || ''}|sparring|${m.id}`,
      date: dateKey ?? todayKey,
      result: m.result,
      openingId: resolvedOpId,
      openingName: resolvedOpId || 'unclassified',
      opponentName: m.aiEngine || 'AI',
      opponentCategory: 'ai',
    });
  }

  // 3. Process SRSReviewCards
  const srsByOpening = new Map<string, number>();
  let masteredSrsCards = 0;
  let dueSrsCards = 0;
  for (const card of sortedCards) {
    const opId = resolveOpeningCategoryId(card.openingId, card.openingId);
    srsByOpening.set(opId, (srsByOpening.get(opId) ?? 0) + 1);

    if (getCardMaturity(card) === 'mastered') {
      masteredSrsCards += 1;
    }
    if (isCardDue(card, referenceDate)) {
      dueSrsCards += 1;
    }

    const reviewDate = toUtcDateKey(card.lastReviewedAt);
    if (reviewDate) {
      activeDates.add(reviewDate);
      const bucket = weeklyBucketMap.get(reviewDate);
      if (bucket) {
        bucket.reviewCount += 1;
        bucket.totalActions += 1;
      }
    }
  }

  // 4. Streaks & weekly totals
  const { currentStreakDays, longestStreakDays, activeToday } = computeStreaks(
    activeDates,
    todayKey
  );

  let weeklyKifuCount = 0;
  let weeklyMatchCount = 0;
  let weeklyReviewCount = 0;
  let weeklyTotalActions = 0;
  for (const b of weeklySeries) {
    weeklyKifuCount += b.kifuCount;
    weeklyMatchCount += b.matchCount;
    weeklyReviewCount += b.reviewCount;
    weeklyTotalActions += b.totalActions;
  }

  // 5. Match analytics (chronological trend, recent form, opening & opponent breakdown)
  normalizedMatches.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  let wins = 0;
  let losses = 0;
  let draws = 0;
  const winRateTrend: WinRateTrendPoint[] = [];

  const openingAcc = new Map<
    string,
    {
      openingId: string;
      nameKey?: string;
      openingName: string;
      games: number;
      wins: number;
      losses: number;
      draws: number;
    }
  >();

  const opponentAcc = new Map<
    string,
    {
      opponentName: string;
      category: PlayerCategory | 'unknown';
      games: number;
      wins: number;
      losses: number;
      draws: number;
    }
  >();

  normalizedMatches.forEach((m, idx) => {
    if (m.result === 'win') wins += 1;
    else if (m.result === 'loss') losses += 1;
    else draws += 1;

    winRateTrend.push({
      index: idx + 1,
      date: m.date,
      result: m.result,
      cumulativeWinRate: computeWinRatePct(wins, losses),
      opponentName: m.opponentName,
      openingName: m.openingName,
    });

    const opKey = m.openingId || m.openingName;
    const opEntry = openingAcc.get(opKey) ?? {
      openingId: m.openingId,
      nameKey: NAMED_OPENING_MAP.get(m.openingId),
      openingName: m.openingName,
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    };
    opEntry.games += 1;
    if (m.result === 'win') opEntry.wins += 1;
    else if (m.result === 'loss') opEntry.losses += 1;
    else opEntry.draws += 1;
    openingAcc.set(opKey, opEntry);

    const oppKey = `${m.opponentCategory}:${m.opponentName}`;
    const oppEntry = opponentAcc.get(oppKey) ?? {
      opponentName: m.opponentName,
      category: m.opponentCategory,
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    };
    oppEntry.games += 1;
    if (m.result === 'win') oppEntry.wins += 1;
    else if (m.result === 'loss') oppEntry.losses += 1;
    else oppEntry.draws += 1;
    opponentAcc.set(oppKey, oppEntry);
  });

  const openingBreakdown: OpeningBreakdownItem[] = Array.from(openingAcc.values())
    .map((o) => ({
      ...o,
      winRate: computeWinRatePct(o.wins, o.losses),
    }))
    .sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return a.openingName.localeCompare(b.openingName);
    });

  const opponentBreakdown: OpponentBreakdownItem[] = Array.from(opponentAcc.values())
    .map((o) => ({
      ...o,
      winRate: computeWinRatePct(o.wins, o.losses),
    }))
    .sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return a.opponentName.localeCompare(b.opponentName);
    });

  const recentForm = normalizedMatches.slice(-10).map((m) => m.result);

  // 6. Opening Repertoire Coverage across 9 named categories
  const coverageItems: OpeningCoverageItem[] = NAMED_OPENING_CATEGORIES.map((cat) => {
    const kifuCount = kifuByOpening.get(cat.id) ?? 0;
    const srsCardCount = srsByOpening.get(cat.id) ?? 0;
    return {
      openingId: cat.id,
      nameKey: cat.nameKey,
      kifuCount,
      srsCardCount,
      isCovered: kifuCount > 0 || srsCardCount > 0,
    };
  });
  const coveredCount = coverageItems.filter((item) => item.isCovered).length;
  const totalCategories = coverageItems.length;
  const coveragePct =
    totalCategories > 0 ? Math.round((coveredCount / totalCategories) * 100) : 0;

  return {
    totalKifuCount: sortedKifus.length,
    proKifuCount,
    selfGameCount,
    totalMatches: normalizedMatches.length,
    wins,
    losses,
    draws,
    winRate: computeWinRatePct(wins, losses),
    totalSrsCards: sortedCards.length,
    masteredSrsCards,
    dueSrsCards,
    currentStreakDays,
    longestStreakDays,
    activeToday,
    weeklyTotalActions,
    weeklyKifuCount,
    weeklyMatchCount,
    weeklyReviewCount,
    weeklySeries,
    recentForm,
    winRateTrend,
    openingBreakdown,
    opponentBreakdown,
    openingCoverage: {
      coveredCount,
      totalCategories,
      coveragePct,
      items: coverageItems,
    },
  };
}
