/**
 * Pure per-player statistics aggregator over KifuRecords (Issue #57).
 * Computes overall win/loss/rate, Sente vs Gote breakdown, yearly history,
 * top openings, and frequent opponents.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { KifuRecord } from '../types/kifuRecord';
import type { ShogiPlayerProfile } from '../types/player';

export interface PlayerSideRecord {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}

export interface PlayerYearlyStats {
  year: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}

export interface PlayerOpeningStats {
  openingId: string;
  openingName: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface PlayerOpponentStats {
  opponentKey: string;
  opponentId?: string;
  opponentName: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface PlayerAggregatedStats {
  playerId: string;
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  unknown: number;
  winRate: number;
  asSente: PlayerSideRecord;
  asGote: PlayerSideRecord;
  yearly: PlayerYearlyStats[];
  topOpenings: PlayerOpeningStats[];
  topOpponents: PlayerOpponentStats[];
}

function computeWinRate(wins: number, losses: number): number {
  const decided = wins + losses;
  if (decided === 0) return 0;
  return Math.round((wins / decided) * 1000) / 10;
}

function extractYear(matchDate?: string, createdAt?: string): string {
  const raw = (matchDate || createdAt || '').trim();
  const match = raw.match(/(\d{4})/);
  return match?.[1] ?? 'Unknown';
}

export function aggregatePlayerStats(
  playerId: string,
  records: KifuRecord[],
  profiles: ShogiPlayerProfile[] = [],
  topN: number = 5
): PlayerAggregatedStats {
  const profileById = new Map<string, ShogiPlayerProfile>(
    profiles.map((p) => [p.id, p])
  );

  let totalGames = 0;
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let unknown = 0;

  const senteAcc = { games: 0, wins: 0, losses: 0, draws: 0 };
  const goteAcc = { games: 0, wins: 0, losses: 0, draws: 0 };

  const yearlyMap = new Map<
    string,
    { games: number; wins: number; losses: number; draws: number }
  >();
  const openingMap = new Map<
    string,
    { openingId: string; openingName: string; games: number; wins: number; losses: number }
  >();
  const opponentMap = new Map<
    string,
    { opponentKey: string; opponentId?: string; opponentName: string; games: number; wins: number; losses: number }
  >();

  for (const rec of records) {
    const isSente = rec.sentePlayerId === playerId;
    const isGote = rec.gotePlayerId === playerId;
    if (!isSente && !isGote) continue;

    totalGames += 1;

    // Determine outcome from this player's perspective
    let outcome: 'win' | 'loss' | 'draw' | 'unknown' = 'unknown';
    if (rec.winner === 'draw') {
      outcome = 'draw';
      draws += 1;
    } else if (rec.winner === 'sente') {
      if (isSente && !isGote) {
        outcome = 'win';
        wins += 1;
      } else if (isGote && !isSente) {
        outcome = 'loss';
        losses += 1;
      } else {
        unknown += 1;
      }
    } else if (rec.winner === 'gote') {
      if (isGote && !isSente) {
        outcome = 'win';
        wins += 1;
      } else if (isSente && !isGote) {
        outcome = 'loss';
        losses += 1;
      } else {
        unknown += 1;
      }
    } else {
      unknown += 1;
    }

    // Sente / Gote side breakdown
    if (isSente && !isGote) {
      senteAcc.games += 1;
      if (outcome === 'win') senteAcc.wins += 1;
      else if (outcome === 'loss') senteAcc.losses += 1;
      else if (outcome === 'draw') senteAcc.draws += 1;
    } else if (isGote && !isSente) {
      goteAcc.games += 1;
      if (outcome === 'win') goteAcc.wins += 1;
      else if (outcome === 'loss') goteAcc.losses += 1;
      else if (outcome === 'draw') goteAcc.draws += 1;
    }

    // Yearly breakdown
    const year = extractYear(rec.matchDate, rec.createdAt);
    const yEntry = yearlyMap.get(year) ?? {
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    };
    yEntry.games += 1;
    if (outcome === 'win') yEntry.wins += 1;
    else if (outcome === 'loss') yEntry.losses += 1;
    else if (outcome === 'draw') yEntry.draws += 1;
    yearlyMap.set(year, yEntry);

    // Opening breakdown
    const opKey = rec.openingId || 'other';
    const opEntry = openingMap.get(opKey) ?? {
      openingId: opKey,
      openingName: rec.openingName || opKey,
      games: 0,
      wins: 0,
      losses: 0,
    };
    opEntry.games += 1;
    if (outcome === 'win') opEntry.wins += 1;
    else if (outcome === 'loss') opEntry.losses += 1;
    openingMap.set(opKey, opEntry);

    // Opponent breakdown
    const opponentId = isSente ? rec.gotePlayerId : rec.sentePlayerId;
    const rawOppName = isSente ? rec.goteName : rec.senteName;
    const oppProf = opponentId ? profileById.get(opponentId) : undefined;
    const opponentName = oppProf?.name || rawOppName || 'Unknown';
    const oppKey = opponentId ? `id:${opponentId}` : `name:${opponentName}`;
    const oppEntry = opponentMap.get(oppKey) ?? {
      opponentKey: oppKey,
      opponentId,
      opponentName,
      games: 0,
      wins: 0,
      losses: 0,
    };
    oppEntry.games += 1;
    if (outcome === 'win') oppEntry.wins += 1;
    else if (outcome === 'loss') oppEntry.losses += 1;
    opponentMap.set(oppKey, oppEntry);
  }

  const yearly: PlayerYearlyStats[] = Array.from(yearlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, s]) => ({
      year,
      games: s.games,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      winRate: computeWinRate(s.wins, s.losses),
    }));

  const topOpenings: PlayerOpeningStats[] = Array.from(openingMap.values())
    .sort((a, b) => b.games - a.games || b.wins - a.wins)
    .slice(0, topN)
    .map((o) => ({
      ...o,
      winRate: computeWinRate(o.wins, o.losses),
    }));

  const topOpponents: PlayerOpponentStats[] = Array.from(opponentMap.values())
    .sort((a, b) => b.games - a.games || b.wins - a.wins)
    .slice(0, topN)
    .map((o) => ({
      ...o,
      winRate: computeWinRate(o.wins, o.losses),
    }));

  return {
    playerId,
    totalGames,
    wins,
    losses,
    draws,
    unknown,
    winRate: computeWinRate(wins, losses),
    asSente: {
      ...senteAcc,
      winRate: computeWinRate(senteAcc.wins, senteAcc.losses),
    },
    asGote: {
      ...goteAcc,
      winRate: computeWinRate(goteAcc.wins, goteAcc.losses),
    },
    yearly,
    topOpenings,
    topOpponents,
  };
}
