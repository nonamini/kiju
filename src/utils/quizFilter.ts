/**
 * Filtering utilities for Quiz / Review mode (Issue #15).
 * Supports narrowing tactical quiz cards by saved Virtual Folders (My Filters),
 * source game tags, tactical category type, and recent date window.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strict TypeScript, zero `any` (Rule 2).
 */

import type { KifuRecord } from '../types/kifuRecord';
import type { TacticalQuizCard, TacticalQuizType } from '../types/quiz';
import { filterKifuRecords } from './kifuLibraryFilter';
import type { KifuMyFilterPreset } from './myFilterStorage';

export interface QuizPoolFilterState {
  myFilterId: string;
  tag: string;
  quizType: 'all' | TacticalQuizType;
  recentDays: 'all' | 7 | 30;
}

export const DEFAULT_QUIZ_POOL_FILTER: QuizPoolFilterState = {
  myFilterId: 'all',
  tag: 'all',
  quizType: 'all',
  recentDays: 'all',
};

export function isQuizFilterActive(filter: QuizPoolFilterState): boolean {
  return (
    filter.myFilterId !== 'all' ||
    filter.tag !== 'all' ||
    filter.quizType !== 'all' ||
    filter.recentDays !== 'all'
  );
}

/**
 * Collects sorted unique tags from source KifuRecords referenced by the given quiz cards.
 */
export function collectQuizAvailableTags(
  cards: TacticalQuizCard[],
  records: KifuRecord[]
): string[] {
  const recordById = new Map<string, KifuRecord>();
  for (const r of records) {
    if (!r.deletedAt) {
      recordById.set(r.id, r);
    }
  }
  const tagSet = new Set<string>();
  for (const card of cards) {
    const rec = recordById.get(card.sourceGameId);
    if (rec?.tags) {
      for (const tag of rec.tags) {
        if (tag && tag.trim()) {
          tagSet.add(tag.trim());
        }
      }
    }
  }
  return Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'ja'));
}

function parseTimestampMs(dateStr?: string): number | null {
  if (!dateStr) return null;
  const ms = Date.parse(dateStr);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Filters enabled tactical quiz cards against Virtual Folder (My Filter), Tag, Category, and Recency.
 */
export function filterQuizCards(
  cards: TacticalQuizCard[],
  filter: QuizPoolFilterState,
  records: KifuRecord[],
  myFilters: KifuMyFilterPreset[],
  nowMs: number = Date.now()
): TacticalQuizCard[] {
  if (!isQuizFilterActive(filter)) {
    return cards;
  }

  const activeRecords = records.filter((r) => !r.deletedAt);
  const recordById = new Map<string, KifuRecord>();
  for (const r of activeRecords) {
    recordById.set(r.id, r);
  }

  let folderMatchedIds: Set<string> | null = null;
  if (filter.myFilterId !== 'all') {
    const preset = myFilters.find((f) => f.id === filter.myFilterId);
    if (preset) {
      const matched = filterKifuRecords(activeRecords, preset.filter);
      folderMatchedIds = new Set(matched.map((r) => r.id));
    }
  }

  const cutoffMs =
    filter.recentDays === 'all'
      ? null
      : nowMs - filter.recentDays * 24 * 60 * 60 * 1000;

  return cards.filter((card) => {
    const sourceRec = recordById.get(card.sourceGameId);

    if (folderMatchedIds !== null && !folderMatchedIds.has(card.sourceGameId)) {
      return false;
    }

    if (filter.tag !== 'all') {
      if (!sourceRec || !sourceRec.tags.includes(filter.tag)) {
        return false;
      }
    }

    if (filter.quizType !== 'all' && card.type !== filter.quizType) {
      return false;
    }

    if (cutoffMs !== null) {
      const refMs =
        parseTimestampMs(sourceRec?.matchDate) ??
        parseTimestampMs(sourceRec?.updatedAt) ??
        parseTimestampMs(card.createdAt);
      if (refMs === null || refMs < cutoffMs) {
        return false;
      }
    }

    return true;
  });
}
