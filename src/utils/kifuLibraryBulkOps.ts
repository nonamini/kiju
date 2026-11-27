/**
 * Bulk operations for Unified Kifu Library (Issue #68, spec M4).
 * Performs single-pass writes via saveKifuRecords so tagIds/tags regeneration
 * and updatedAt stay consistent across 50+ records without UI lag.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { KifuRecord } from '../types/kifuRecord';
import { deleteCachedKifuPayload } from './kifuPayloadCache';
import {
  loadKifuRecords,
  markKifuRecordDeleted,
  purgeIdsFromLegacyStorages,
  saveKifuRecords,
} from './kifuRecordStorage';
import { normalizeFolderPath } from './virtualFolderTree';

function updateSelectedRecords(
  ids: string[],
  transform: (rec: KifuRecord, now: string) => KifuRecord | null
): number {
  if (ids.length === 0) return 0;
  const targetSet = new Set(ids);
  const now = new Date().toISOString();
  const records = loadKifuRecords();
  let changed = 0;

  const next = records.map((rec) => {
    if (!targetSet.has(rec.id)) return rec;
    const updated = transform(rec, now);
    if (!updated) return rec;
    changed++;
    return updated;
  });

  if (changed > 0) {
    saveKifuRecords(next);
  }
  return changed;
}

export function bulkAssignTag(ids: string[], tagId: string): number {
  if (!tagId) return 0;
  return updateSelectedRecords(ids, (rec, now) => {
    const current = rec.tagIds ?? [];
    if (current.includes(tagId)) return null;
    return {
      ...rec,
      tagIds: [...current, tagId],
      updatedAt: now,
    };
  });
}

export function bulkRemoveTag(ids: string[], tagId: string): number {
  if (!tagId) return 0;
  return updateSelectedRecords(ids, (rec, now) => {
    const current = rec.tagIds ?? [];
    if (!current.includes(tagId)) return null;
    return {
      ...rec,
      tagIds: current.filter((id) => id !== tagId),
      updatedAt: now,
    };
  });
}

export function bulkSetFavorite(ids: string[], favorite: boolean): number {
  return updateSelectedRecords(ids, (rec, now) => {
    if (Boolean(rec.favorite) === favorite) return null;
    return {
      ...rec,
      favorite,
      updatedAt: now,
    };
  });
}

export function bulkSetIncludedInTree(ids: string[], included: boolean): number {
  return updateSelectedRecords(ids, (rec, now) => {
    if (rec.isIncludedInTree === included) return null;
    return {
      ...rec,
      isIncludedInTree: included,
      updatedAt: now,
    };
  });
}

export function bulkDeleteRecords(ids: string[]): number {
  if (ids.length === 0) return 0;
  const targetSet = new Set(ids);
  const records = loadKifuRecords();
  const remaining = records.filter((rec) => !targetSet.has(rec.id));
  const deletedCount = records.length - remaining.length;
  if (deletedCount === 0) return 0;

  saveKifuRecords(remaining);
  purgeIdsFromLegacyStorages(targetSet);
  for (const id of targetSet) {
    markKifuRecordDeleted(id);
    void deleteCachedKifuPayload(id);
  }
  return deletedCount;
}

export function buildKifuBundleJson(records: KifuRecord[]): string {
  return JSON.stringify(
    {
      format: 'joseki-tree-kifu-bundle',
      version: 1,
      exportedAt: new Date().toISOString(),
      records,
    },
    null,
    2
  );
}

/**
 * Moves all specified records into the given virtual folder path (or clears
 * `folderPath` to undefined when empty) in a single storage write.
 */
export function bulkMoveToFolder(ids: string[], folderPath: string): number {
  const normalizedTarget = normalizeFolderPath(folderPath);
  const nextFolder = normalizedTarget || undefined;
  return updateSelectedRecords(ids, (rec, now) => {
    const currentFolder = normalizeFolderPath(rec.folderPath) || undefined;
    if (currentFolder === nextFolder) return null;
    return {
      ...rec,
      folderPath: nextFolder,
      updatedAt: now,
    };
  });
}

const SEPARATED_TITLE_RANK_SUFFIX_RE = new RegExp(
  '(?:[\\s・/,、]+)' +
    '(?:永世(?:竜王|名人|王位|王座|棋王|王将|棋聖|七冠)|名誉(?:NHK杯|王座)|[一二三四五六七八九十]+世名人|クイーン[王座名人王位王将棋聖白玲清麗]*|' +
    '前?(?:竜王|名人|王位|叡王|王座|棋王|王将|棋聖)|' +
    '白玲|清麗|女王|倉敷藤花|' +
    '女流(?:[一二三四五六七]冠|王座|名人|王位|王将|初段|[一二三四五六七八九1-9]段|[一二三四五六七八九1-9]級)?|' +
    '(?:[一二三四五六七八九]|10|[1-9])冠|' +
    '[一二三四五六七八九十初1-9]段|[一二三四五六七八九1-9]級|' +
    'アマ(?:チュア)?|奨励会(?:[一二三四五六七八九初1-9]段|[一二三四五六七八九1-9]級)?|研修会)$'
);

const UNSEPARATED_TITLE_RANK_SUFFIX_RE =
  /(?:永世(?:竜王|名人|王位|王座|棋王|王将|棋聖|七冠)|[一二三四五六七八九十]+世名人|竜王|名人|王位|叡王|王座|棋王|王将|棋聖|白玲|清麗|倉敷藤花|女流(?:[一二三四五六七]冠|王座|名人|王位|王将|初段|[一二三四五六七八九1-9]段)?|[一二三四五六七八九初1-9]段)$/;

const PAREN_TITLE_SUFFIX_RE =
  /[(（][^()（）]*(?:竜王|名人|王位|叡王|王座|棋王|王将|棋聖|段|級|女流|白玲|清麗|倉敷藤花|アマ)[^()（）]*[)）]$/;

/**
 * Normalizes a Shogi player name by collapsing whitespace and stripping trailing
 * titles, ranks, or bracketed rank annotations (e.g. "藤井聡太 竜王・名人" -> "藤井聡太").
 */
export function normalizeShogiPlayerName(raw: string): string {
  let current = raw.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
  if (!current) return '';

  let prev = '';
  while (current && current !== prev) {
    prev = current;
    current = current
      .replace(PAREN_TITLE_SUFFIX_RE, '')
      .replace(SEPARATED_TITLE_RANK_SUFFIX_RE, '')
      .replace(UNSEPARATED_TITLE_RANK_SUFFIX_RE, '')
      .replace(/[\s・/,、]+$/, '')
      .trim();
  }
  return current;
}

export interface BulkNameUnifyOptions {
  field: 'players' | 'tournament';
  mode: 'strip_titles' | 'replace';
  find?: string;
  replace?: string;
}

function transformMetadataValue(
  raw: string | undefined,
  options: BulkNameUnifyOptions
): string | undefined {
  if (!raw) return raw;
  if (options.field === 'players' && options.mode === 'strip_titles') {
    const normalized = normalizeShogiPlayerName(raw);
    return normalized || raw;
  }
  if (options.mode === 'replace') {
    const find = options.find ?? '';
    if (!find || !raw.includes(find)) return raw;
    return raw
      .split(find)
      .join(options.replace ?? '')
      .trim();
  }
  return raw;
}

/**
 * Computes a dry-run summary (affected record count + sample transformations)
 * for previewing bulk player/tournament name unification.
 */
export function previewNameUnify(
  records: KifuRecord[],
  options: BulkNameUnifyOptions
): { affectedCount: number; samples: Array<{ before: string; after: string }> } {
  let affectedCount = 0;
  const seenSamples = new Set<string>();
  const samples: Array<{ before: string; after: string }> = [];

  const pushSample = (before: string, after: string) => {
    const key = `${before}\u0000${after}`;
    if (seenSamples.has(key) || samples.length >= 5) return;
    seenSamples.add(key);
    samples.push({ before, after });
  };

  for (const rec of records) {
    if (options.field === 'players') {
      const nextSente =
        transformMetadataValue(rec.senteName, options) ?? rec.senteName;
      const nextGote =
        transformMetadataValue(rec.goteName, options) ?? rec.goteName;
      const senteChanged = nextSente !== rec.senteName;
      const goteChanged = nextGote !== rec.goteName;
      if (senteChanged || goteChanged) {
        affectedCount++;
        if (senteChanged) pushSample(rec.senteName, nextSente);
        if (goteChanged) pushSample(rec.goteName, nextGote);
      }
    } else {
      const prevTournament = rec.tournament ?? '';
      const nextTournament =
        transformMetadataValue(rec.tournament, options) ?? '';
      if (prevTournament && nextTournament !== prevTournament) {
        affectedCount++;
        pushSample(prevTournament, nextTournament);
      }
    }
  }

  return { affectedCount, samples };
}

/**
 * Applies player or tournament name unification/replacement across selected records.
 */
export function bulkUnifyMetadataNames(
  ids: string[],
  options: BulkNameUnifyOptions
): number {
  if (options.mode === 'replace' && !(options.find ?? '')) {
    return 0;
  }

  return updateSelectedRecords(ids, (rec, now) => {
    if (options.field === 'players') {
      const nextSente =
        transformMetadataValue(rec.senteName, options) ?? rec.senteName;
      const nextGote =
        transformMetadataValue(rec.goteName, options) ?? rec.goteName;
      if (nextSente === rec.senteName && nextGote === rec.goteName) {
        return null;
      }
      return {
        ...rec,
        senteName: nextSente,
        goteName: nextGote,
        updatedAt: now,
      };
    }

    const prevTournament = rec.tournament ?? '';
    const nextTournament =
      transformMetadataValue(rec.tournament, options) ?? '';
    if (!prevTournament || nextTournament === prevTournament) {
      return null;
    }
    return {
      ...rec,
      tournament: nextTournament || undefined,
      updatedAt: now,
    };
  });
}
