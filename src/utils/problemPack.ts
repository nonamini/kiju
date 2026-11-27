/**
 * Problem Pack management, JSON export serialization, and import merge utilities
 * for TsumegoProblem and TacticalQuizCard collections (Issue #13).
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { TacticalQuizCard } from '../types/quiz';
import type { TsumegoProblem } from '../types/tsumego';

export const UNCATEGORIZED_PACK_KEY = '__uncategorized__';
export const PROBLEM_PACK_FORMAT = 'kiju-problem-pack' as const;

export type ProblemPackKind = 'tsumego' | 'quiz';

export interface ProblemPackFile {
  format: typeof PROBLEM_PACK_FORMAT;
  version: 1;
  kind: ProblemPackKind;
  name: string;
  description?: string;
  exportedAt: string;
  tsumegoProblems?: TsumegoProblem[];
  quizCards?: TacticalQuizCard[];
}

export interface PackSummary {
  name: string;
  count: number;
}

export function normalizePackName(raw?: string | null): string {
  if (!raw) return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, 64);
}

/**
 * Summarizes pack names and counts across a collection of Tsumego or Quiz items.
 */
export function listPackSummaries(
  items: ReadonlyArray<{ packName?: string }>
): { packs: PackSummary[]; uncategorizedCount: number } {
  const counts = new Map<string, number>();
  let uncategorizedCount = 0;

  for (const item of items) {
    const pack = normalizePackName(item.packName);
    if (!pack) {
      uncategorizedCount++;
      continue;
    }
    counts.set(pack, (counts.get(pack) ?? 0) + 1);
  }

  const packs = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  return { packs, uncategorizedCount };
}

export function itemMatchesPackFilter(
  packName: string | undefined,
  packFilter: string
): boolean {
  if (!packFilter) return true;
  const normalized = normalizePackName(packName);
  if (packFilter === UNCATEGORIZED_PACK_KEY) {
    return normalized === '';
  }
  return normalized === normalizePackName(packFilter);
}

export function serializeTsumegoPack(
  name: string,
  problems: TsumegoProblem[],
  description?: string
): string {
  const cleanName = normalizePackName(name) || 'tsumego-pack';
  const payload: ProblemPackFile = {
    format: PROBLEM_PACK_FORMAT,
    version: 1,
    kind: 'tsumego',
    name: cleanName,
    description: description?.trim() || undefined,
    exportedAt: new Date().toISOString(),
    tsumegoProblems: problems.map((p) => ({
      ...p,
      packName: normalizePackName(p.packName) || cleanName,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function serializeQuizPack(
  name: string,
  cards: TacticalQuizCard[],
  description?: string
): string {
  const cleanName = normalizePackName(name) || 'quiz-pack';
  const payload: ProblemPackFile = {
    format: PROBLEM_PACK_FORMAT,
    version: 1,
    kind: 'quiz',
    name: cleanName,
    description: description?.trim() || undefined,
    exportedAt: new Date().toISOString(),
    quizCards: cards.map((c) => ({
      ...c,
      packName: normalizePackName(c.packName) || cleanName,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function parseProblemPackJson(raw: string): ProblemPackFile | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ProblemPackFile>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.format !== PROBLEM_PACK_FORMAT) return null;
    if (parsed.version !== 1) return null;
    if (parsed.kind !== 'tsumego' && parsed.kind !== 'quiz') return null;
    if (typeof parsed.name !== 'string' || !parsed.name.trim()) return null;

    if (parsed.kind === 'tsumego' && !Array.isArray(parsed.tsumegoProblems)) {
      return null;
    }
    if (parsed.kind === 'quiz' && !Array.isArray(parsed.quizCards)) {
      return null;
    }

    return parsed as ProblemPackFile;
  } catch {
    return null;
  }
}

export function mergeImportedTsumegoPack(
  existing: TsumegoProblem[],
  pack: ProblemPackFile
): {
  next: TsumegoProblem[];
  addedCount: number;
  updatedCount: number;
  touchedItems: TsumegoProblem[];
} {
  const incoming = pack.tsumegoProblems ?? [];
  const defaultPack = normalizePackName(pack.name);
  const byId = new Map(existing.map((p) => [p.id, p]));
  const nowIso = new Date().toISOString();

  let addedCount = 0;
  let updatedCount = 0;
  const touchedItems: TsumegoProblem[] = [];

  for (const item of incoming) {
    if (!item || typeof item.id !== 'string' || !item.startSfen) continue;
    const normalizedItem: TsumegoProblem = {
      ...item,
      packName: normalizePackName(item.packName) || defaultPack || undefined,
      tags: Array.isArray(item.tags) ? item.tags : [],
      solutionPv: Array.isArray(item.solutionPv) ? item.solutionPv : [],
      updatedAt: nowIso,
    };
    if (byId.has(normalizedItem.id)) {
      updatedCount++;
    } else {
      addedCount++;
    }
    byId.set(normalizedItem.id, normalizedItem);
    touchedItems.push(normalizedItem);
  }

  return {
    next: Array.from(byId.values()),
    addedCount,
    updatedCount,
    touchedItems,
  };
}

export function mergeImportedQuizPack(
  existing: TacticalQuizCard[],
  pack: ProblemPackFile
): {
  next: TacticalQuizCard[];
  addedCount: number;
  updatedCount: number;
  touchedItems: TacticalQuizCard[];
} {
  const incoming = pack.quizCards ?? [];
  const defaultPack = normalizePackName(pack.name);
  const byId = new Map(existing.map((c) => [c.id, c]));
  const nowIso = new Date().toISOString();

  let addedCount = 0;
  let updatedCount = 0;
  const touchedItems: TacticalQuizCard[] = [];

  for (const item of incoming) {
    if (!item || typeof item.id !== 'string' || !item.startSfen || !item.bestMove) {
      continue;
    }
    const normalizedItem: TacticalQuizCard = {
      ...item,
      packName: normalizePackName(item.packName) || defaultPack || undefined,
      usiMovesToPosition: Array.isArray(item.usiMovesToPosition)
        ? item.usiMovesToPosition
        : [],
      pv: Array.isArray(item.pv) ? item.pv : [item.bestMove],
      updatedAt: nowIso,
    };
    if (byId.has(normalizedItem.id)) {
      updatedCount++;
    } else {
      addedCount++;
    }
    byId.set(normalizedItem.id, normalizedItem);
    touchedItems.push(normalizedItem);
  }

  return {
    next: Array.from(byId.values()),
    addedCount,
    updatedCount,
    touchedItems,
  };
}
