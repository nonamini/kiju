/**
 * Pure filter & pagination pipeline for KifuLibraryPage (Issue #66, spec S1-S5).
 * Designed to filter and paginate 500+ KifuRecords in single-digit milliseconds.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type {
  KifuGameKind,
  KifuRecord,
  KifuReviewStatus,
  KifuWinner,
} from '../types/kifuRecord';
import { resolveGameKind } from './gameKindClassifier';

export type LibraryAnalysisFilter =
  | 'all'
  | 'analyzed'
  | 'unanalyzed'
  | 'queued'
  | 'processing'
  | 'failed';

export type TagMatchMode = 'group_or_and' | 'and' | 'or';

export type FilterRuleField =
  | 'tag'
  | 'analysisStatus'
  | 'opening'
  | 'winner'
  | 'reviewStatus'
  | 'source'
  | 'gameKind'
  | 'dateFrom'
  | 'dateTo';

export type FilterRuleOperator = 'in' | 'not_in' | 'all';
export type FilterRuleCombinator = 'and' | 'or';

export interface KifuFilterRule {
  id: string;
  field: FilterRuleField;
  operator: FilterRuleOperator;
  values: string[];
}

export interface KifuLibraryFilterState {
  query: string;
  gameKind: 'all' | KifuGameKind;
  playerId: string;
  dateFrom: string;
  dateTo: string;
  winner: 'all' | KifuWinner;
  openingId: string;
  tagId: string;
  tagIds?: string[];
  tagMatchMode?: TagMatchMode;
  rules?: KifuFilterRule[];
  ruleCombinator?: FilterRuleCombinator;
  analysisStatus: LibraryAnalysisFilter;
  reviewStatus: 'all' | KifuReviewStatus;
  source: 'all' | KifuRecord['source'];
  favoriteOnly: boolean;
}

export const DEFAULT_KIFU_LIBRARY_FILTER: KifuLibraryFilterState = {
  query: '',
  gameKind: 'all',
  playerId: 'all',
  dateFrom: '',
  dateTo: '',
  winner: 'all',
  openingId: 'all',
  tagId: 'all',
  tagIds: [],
  tagMatchMode: 'group_or_and',
  rules: [],
  ruleCombinator: 'and',
  analysisStatus: 'all',
  reviewStatus: 'all',
  source: 'all',
  favoriteOnly: false,
};

/**
 * Normalizes multi-tag selection (`tagIds`) and legacy single `tagId` into a deduplicated ID list.
 */
export function getEffectiveSelectedTagIds(
  filter: KifuLibraryFilterState
): string[] {
  if (Array.isArray(filter.tagIds) && filter.tagIds.length > 0) {
    return Array.from(
      new Set(filter.tagIds.filter((id) => typeof id === 'string' && id.length > 0 && id !== 'all'))
    );
  }
  if (filter.tagId && filter.tagId !== 'all') {
    return [filter.tagId];
  }
  return [];
}

function recordMatchesTagId(
  rec: KifuRecord,
  tagId: string,
  tagNameById?: Map<string, string>
): boolean {
  if (rec.tagIds?.includes(tagId)) return true;
  const tagName = tagNameById?.get(tagId);
  if (tagName && rec.tags.includes(tagName)) return true;
  return false;
}

function matchesTagSelection(
  rec: KifuRecord,
  selectedTagIds: readonly string[],
  mode: TagMatchMode,
  tagNameById?: Map<string, string>,
  tagGroupById?: Map<string, string>
): boolean {
  if (selectedTagIds.length === 0) return true;
  if (mode === 'and') {
    return selectedTagIds.every((id) => recordMatchesTagId(rec, id, tagNameById));
  }
  if (mode === 'or') {
    return selectedTagIds.some((id) => recordMatchesTagId(rec, id, tagNameById));
  }
  const grouped = new Map<string, string[]>();
  for (const id of selectedTagIds) {
    const groupKey = tagGroupById?.get(id) ?? 'custom';
    const bucket = grouped.get(groupKey);
    if (bucket) {
      bucket.push(id);
    } else {
      grouped.set(groupKey, [id]);
    }
  }
  for (const groupIds of grouped.values()) {
    if (!groupIds.some((id) => recordMatchesTagId(rec, id, tagNameById))) {
      return false;
    }
  }
  return true;
}

function matchesAnalysisFilter(
  rec: KifuRecord,
  filterValue: LibraryAnalysisFilter
): boolean {
  if (filterValue === 'all') return true;
  const hasEvals =
    rec.evaluations != null && Object.keys(rec.evaluations).length > 0;
  const status = rec.analysisStatus ?? (hasEvals ? 'completed' : 'unanalyzed');

  if (filterValue === 'analyzed') {
    return status === 'completed' || hasEvals;
  }
  if (filterValue === 'unanalyzed') {
    return status === 'unanalyzed' && !hasEvals;
  }
  if (filterValue === 'processing') {
    return status === 'processing' || status === 'analyzing';
  }
  return status === filterValue;
}

function getComparableDate(rec: KifuRecord): string {
  const raw = rec.matchDate || rec.createdAt || '';
  return raw.slice(0, 10);
}

function getActiveFilterRules(filter: KifuLibraryFilterState): KifuFilterRule[] {
  return (filter.rules ?? []).filter((r) =>
    r.values.some((v) => typeof v === 'string' && v.length > 0)
  );
}

/**
 * Evaluates a single structured rule against a KifuRecord.
 * Empty values always evaluate to true (no-op while composing a rule).
 */
export function evaluateFilterRule(
  rec: KifuRecord,
  rule: KifuFilterRule,
  tagNameById?: Map<string, string>
): boolean {
  const nonEmptyValues = rule.values.filter((v) => v.length > 0);
  if (nonEmptyValues.length === 0) return true;

  if (rule.field === 'dateFrom') {
    const dateStr = getComparableDate(rec);
    return Boolean(dateStr) && dateStr >= nonEmptyValues[0]!;
  }
  if (rule.field === 'dateTo') {
    const dateStr = getComparableDate(rec);
    return Boolean(dateStr) && dateStr <= nonEmptyValues[0]!;
  }

  if (rule.field === 'tag') {
    if (rule.operator === 'all') {
      return nonEmptyValues.every((id) => recordMatchesTagId(rec, id, tagNameById));
    }
    const anyMatched = nonEmptyValues.some((id) =>
      recordMatchesTagId(rec, id, tagNameById)
    );
    return rule.operator === 'not_in' ? !anyMatched : anyMatched;
  }

  let matched = false;
  switch (rule.field) {
    case 'analysisStatus':
      matched = nonEmptyValues.some((v) =>
        matchesAnalysisFilter(rec, v as LibraryAnalysisFilter)
      );
      break;
    case 'opening':
      matched = nonEmptyValues.includes(rec.openingId);
      break;
    case 'winner':
      matched = nonEmptyValues.includes(rec.winner ?? 'unknown');
      break;
    case 'reviewStatus':
      matched = nonEmptyValues.includes(rec.reviewStatus ?? 'unread');
      break;
    case 'source':
      matched = nonEmptyValues.includes(rec.source);
      break;
    case 'gameKind':
      matched = nonEmptyValues.includes(resolveGameKind(rec));
      break;
  }

  return rule.operator === 'not_in' ? !matched : matched;
}

/**
 * Filters KifuRecords according to S1 (text search), structured rules, and S2 filters.
 */
export function filterKifuRecords(
  records: KifuRecord[],
  filter: KifuLibraryFilterState,
  tagNameById?: Map<string, string>,
  tagGroupById?: Map<string, string>
): KifuRecord[] {
  const normalizedQuery = filter.query.trim().toLowerCase();
  const selectedTagIds = getEffectiveSelectedTagIds(filter);
  const tagMode: TagMatchMode = filter.tagMatchMode ?? 'group_or_and';
  const activeRules = getActiveFilterRules(filter);
  const hasActiveGameKindRule = activeRules.some((r) => r.field === 'gameKind');
  const ruleCombinator: FilterRuleCombinator = filter.ruleCombinator ?? 'and';

  return records.filter((rec) => {
    const resolvedKind = resolveGameKind(rec);
    if (!hasActiveGameKindRule) {
      if (filter.gameKind === 'all') {
        if (resolvedKind === 'other' || resolvedKind === 'joseki') return false;
      } else if (resolvedKind !== filter.gameKind) {
        return false;
      }
    }
    if (
      filter.playerId !== 'all' &&
      rec.sentePlayerId !== filter.playerId &&
      rec.gotePlayerId !== filter.playerId
    ) {
      return false;
    }
    if (filter.favoriteOnly && !rec.favorite) return false;
    if (filter.source !== 'all' && rec.source !== filter.source) return false;
    if (filter.winner !== 'all' && (rec.winner ?? 'unknown') !== filter.winner) {
      return false;
    }
    if (filter.openingId !== 'all' && rec.openingId !== filter.openingId) {
      return false;
    }
    if (
      filter.reviewStatus !== 'all' &&
      (rec.reviewStatus ?? 'unread') !== filter.reviewStatus
    ) {
      return false;
    }
    if (!matchesAnalysisFilter(rec, filter.analysisStatus)) return false;

    if (
      !matchesTagSelection(
        rec,
        selectedTagIds,
        tagMode,
        tagNameById,
        tagGroupById
      )
    ) {
      return false;
    }

    if (filter.dateFrom || filter.dateTo) {
      const dateStr = getComparableDate(rec);
      if (!dateStr) return false;
      if (filter.dateFrom && dateStr < filter.dateFrom) return false;
      if (filter.dateTo && dateStr > filter.dateTo) return false;
    }

    if (activeRules.length > 0) {
      const rulesMatched =
        ruleCombinator === 'or'
          ? activeRules.some((rule) => evaluateFilterRule(rec, rule, tagNameById))
          : activeRules.every((rule) => evaluateFilterRule(rec, rule, tagNameById));
      if (!rulesMatched) return false;
    }

    if (normalizedQuery) {
      const haystack = [
        rec.title,
        rec.senteName,
        rec.goteName,
        rec.tournament ?? '',
        rec.openingName ?? '',
        rec.notes ?? '',
        ...rec.tags,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(normalizedQuery)) return false;
    }

    return true;
  });
}

export function countActiveFilters(filter: KifuLibraryFilterState): number {
  let count = 0;
  if (filter.query.trim()) count++;
  if (filter.gameKind !== 'all') count++;
  if (filter.playerId !== 'all') count++;
  if (filter.dateFrom) count++;
  if (filter.dateTo) count++;
  if (filter.winner !== 'all') count++;
  if (filter.openingId !== 'all') count++;
  if (getEffectiveSelectedTagIds(filter).length > 0) count++;
  if (filter.analysisStatus !== 'all') count++;
  if (filter.reviewStatus !== 'all') count++;
  if (filter.source !== 'all') count++;
  if (filter.favoriteOnly) count++;
  count += getActiveFilterRules(filter).length;
  return count;
}

export function paginateKifuRecords(
  records: KifuRecord[],
  page: number,
  pageSize: number
): { items: KifuRecord[]; totalPages: number; currentPage: number } {
  const safeSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(records.length / safeSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * safeSize;
  return {
    items: records.slice(start, start + safeSize),
    totalPages,
    currentPage,
  };
}
