/**
 * Tag Dictionary Management & JSON Export/Import (Issue #69).
 * Supports id-stable tag renaming with KifuRecord sync, safe tag deletion
 * with referencing-record cleanup, legacy custom tag group migration, and
 * spec §6.5 JSON export/import round-trip.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { KifuRecord } from '../types/kifuRecord';
import type { TagDefinition, TagGroupId } from '../types/tagRegistry';
import { loadKifuRecords, saveKifuRecords } from './kifuRecordStorage';
import { getSafeStorage } from './matchHistoryStorage';
import {
  changeTagDefinitionGroup,
  deleteTagDefinition,
  getTagById,
  loadTagRegistry,
  renameTagDefinition,
  saveTagRegistry,
  syncRecordTagsWithRegistry,
} from './tagRegistryStorage';

export const TAG_DICTIONARY_FORMAT = 'joseki-tree-tag-dictionary';
export const TAG_DICTIONARY_VERSION = 1;
const LEGACY_CUSTOM_TAG_GROUPS_KEY = 'joseki_tree_custom_tag_groups';

export interface TagDictionaryExportPayload {
  format: typeof TAG_DICTIONARY_FORMAT;
  version: number;
  exportedAt: string;
  tags: TagDefinition[];
}

export interface TagDictionaryImportResult {
  added: number;
  updated: number;
  adopted: number;
  total: number;
}

function isValidTagGroupId(value: unknown): value is TagGroupId {
  return (
    value === 'source' ||
    value === 'tournament' ||
    value === 'opening' ||
    value === 'study' ||
    value === 'custom'
  );
}

/**
 * Counts how many KifuRecords reference a given tagId.
 */
export function countRecordsReferencingTag(
  tagId: string,
  records: KifuRecord[] = loadKifuRecords()
): number {
  if (!tagId) return 0;
  let count = 0;
  for (const rec of records) {
    if (rec.tagIds?.includes(tagId)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Renames a tag in the registry (preserving its ID) and updates derived `tags`
 * on all referencing KifuRecords.
 */
export function renameTagAndSyncRecords(
  tagId: string,
  newName: string
): TagDefinition | null {
  const updatedDef = renameTagDefinition(tagId, newName);
  if (!updatedDef) return null;

  const records = loadKifuRecords();
  const now = new Date().toISOString();
  let mutated = false;
  const nextRecords = records.map((rec) => {
    if (!rec.tagIds?.includes(tagId)) return rec;
    mutated = true;
    const synced = syncRecordTagsWithRegistry(rec);
    return { ...synced, updatedAt: now };
  });
  if (mutated) {
    saveKifuRecords(nextRecords);
  }
  return updatedDef;
}

/**
 * Deletes a tag from the registry and removes its ID from all referencing KifuRecords.
 */
export function deleteTagAndCleanupRecords(tagId: string): {
  deleted: boolean;
  affectedRecords: number;
} {
  const records = loadKifuRecords();
  const now = new Date().toISOString();
  let affectedRecords = 0;
  const nextRecords = records.map((rec) => {
    if (!rec.tagIds?.includes(tagId)) return rec;
    affectedRecords += 1;
    const filteredIds = rec.tagIds.filter((id) => id !== tagId);
    const synced = syncRecordTagsWithRegistry({ ...rec, tagIds: filteredIds });
    return { ...synced, updatedAt: now };
  });
  if (affectedRecords > 0) {
    saveKifuRecords(nextRecords);
  }
  const deleted = deleteTagDefinition(tagId);
  return { deleted, affectedRecords };
}

/**
 * Moves a tag definition to another category (`TagGroupId`).
 * Record `tagIds` remain untouched because IDs are category-independent.
 */
export function changeTagGroupAndSync(
  tagId: string,
  newGroupId: TagGroupId
): TagDefinition | null {
  return changeTagDefinitionGroup(tagId, newGroupId);
}

/**
 * Merges `sourceTagId` into `targetTagId` across all KifuRecords
 * (deduplicating tagIds and refreshing derived `tags`), then deletes `sourceTagId`.
 */
export function mergeTagIntoTarget(
  sourceTagId: string,
  targetTagId: string
): { merged: boolean; affectedRecords: number } {
  if (!sourceTagId || !targetTagId || sourceTagId === targetTagId) {
    return { merged: false, affectedRecords: 0 };
  }
  const source = getTagById(sourceTagId);
  const target = getTagById(targetTagId);
  if (!source || !target) {
    return { merged: false, affectedRecords: 0 };
  }

  const records = loadKifuRecords();
  const now = new Date().toISOString();
  let affectedRecords = 0;

  const nextRecords = records.map((rec) => {
    const hasSource = rec.tagIds?.includes(sourceTagId) || rec.tags.includes(source.name);
    if (!hasSource) return rec;
    affectedRecords += 1;
    const baseIds = rec.tagIds ?? [];
    const replaced = baseIds.map((id) => (id === sourceTagId ? targetTagId : id));
    if (!replaced.includes(targetTagId)) {
      replaced.push(targetTagId);
    }
    const deduplicated = Array.from(new Set(replaced.filter((id) => id !== sourceTagId)));
    const synced = syncRecordTagsWithRegistry({ ...rec, tagIds: deduplicated });
    return { ...synced, updatedAt: now };
  });

  if (affectedRecords > 0) {
    saveKifuRecords(nextRecords);
  }
  const deleted = deleteTagDefinition(sourceTagId);
  return { merged: deleted, affectedRecords };
}

/**
 * Migrates any legacy tags from `joseki_tree_custom_tag_groups` not yet present
 * in TagRegistry into `TagDefinition` entries (defaulting unknown groups to `'custom'`).
 */
export function migrateLegacyCustomTagGroups(): number {
  const storage = getSafeStorage();
  const raw = storage.getItem(LEGACY_CUSTOM_TAG_GROUPS_KEY);
  if (!raw) return 0;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (!parsed || typeof parsed !== 'object') return 0;

  const defs = loadTagRegistry();
  const existingKeys = new Set(defs.map((d) => `${d.groupId}::${d.name}`));
  const now = new Date().toISOString();
  const additions: TagDefinition[] = [];

  for (const [groupKey, list] of Object.entries(
    parsed as Record<string, unknown>
  )) {
    if (!Array.isArray(list)) continue;
    const groupId: TagGroupId = isValidTagGroupId(groupKey)
      ? groupKey
      : 'custom';
    for (const item of list) {
      if (typeof item !== 'string') continue;
      const name = item.trim();
      if (!name) continue;
      const key = `${groupId}::${name}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      additions.push({
        id:
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? `tag-${crypto.randomUUID()}`
            : `tag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        groupId,
        isBuiltin: false,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (additions.length > 0) {
    saveTagRegistry([...defs, ...additions]);
  }
  return additions.length;
}

/**
 * Builds the canonical JSON string for exporting the tag dictionary.
 */
export function buildTagDictionaryExportJson(
  tags: TagDefinition[] = loadTagRegistry()
): string {
  const payload: TagDictionaryExportPayload = {
    format: TAG_DICTIONARY_FORMAT,
    version: TAG_DICTIONARY_VERSION,
    exportedAt: new Date().toISOString(),
    tags,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Parses and merges an exported tag dictionary JSON string into TagRegistry.
 * Merge order per spec §6.5:
 * 1. Match by `id`: update `name`, `groupId`, and `updatedAt`.
 * 2. Match by `name + groupId`: adopt existing `id` without duplicating.
 * 3. Otherwise: insert as a new `TagDefinition`.
 */
export function parseAndImportTagDictionaryJson(
  rawJson: string
): TagDictionaryImportResult {
  const parsed: unknown = JSON.parse(rawJson);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid tag dictionary JSON');
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.format !== TAG_DICTIONARY_FORMAT || !Array.isArray(obj.tags)) {
    throw new Error('Unsupported tag dictionary format');
  }

  const current = loadTagRegistry();
  const byId = new Map<string, number>();
  const byNameGroup = new Map<string, number>();
  const next: TagDefinition[] = current.map((def, idx) => {
    byId.set(def.id, idx);
    byNameGroup.set(`${def.groupId}::${def.name}`, idx);
    return def;
  });

  const now = new Date().toISOString();
  let added = 0;
  let updated = 0;
  let adopted = 0;
  const updatedIds = new Set<string>();

  for (const rawItem of obj.tags) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const item = rawItem as Record<string, unknown>;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!name) continue;
    const groupId: TagGroupId = isValidTagGroupId(item.groupId)
      ? item.groupId
      : 'custom';
    const incomingId = typeof item.id === 'string' ? item.id.trim() : '';

    // 1. Match by id
    if (incomingId && byId.has(incomingId)) {
      const idx = byId.get(incomingId)!;
      const existing = next[idx]!;
      const oldKey = `${existing.groupId}::${existing.name}`;
      const newKey = `${groupId}::${name}`;
      if (existing.name !== name || existing.groupId !== groupId) {
        next[idx] = {
          ...existing,
          name,
          groupId,
          updatedAt: now,
        };
        byNameGroup.delete(oldKey);
        byNameGroup.set(newKey, idx);
        updated += 1;
        updatedIds.add(existing.id);
      } else {
        adopted += 1;
      }
      continue;
    }

    // 2. Match by name + groupId (adopt existing id)
    const key = `${groupId}::${name}`;
    if (byNameGroup.has(key)) {
      adopted += 1;
      continue;
    }

    // 3. Create new definition
    const newId =
      incomingId ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `tag-${crypto.randomUUID()}`
        : `tag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const created: TagDefinition = {
      id: newId,
      name,
      groupId,
      isBuiltin: typeof item.isBuiltin === 'boolean' ? item.isBuiltin : false,
      createdAt:
        typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : now,
      updatedAt:
        typeof item.updatedAt === 'string' && item.updatedAt ? item.updatedAt : now,
    };
    const idx = next.length;
    next.push(created);
    byId.set(created.id, idx);
    byNameGroup.set(key, idx);
    added += 1;
  }

  saveTagRegistry(next);

  // Sync derived `tags` cache on any records whose tagIds were renamed
  if (updatedIds.size > 0) {
    const records = loadKifuRecords();
    let recordsMutated = false;
    const nextRecords = records.map((rec) => {
      if (!rec.tagIds?.some((id) => updatedIds.has(id))) return rec;
      recordsMutated = true;
      return { ...syncRecordTagsWithRegistry(rec), updatedAt: now };
    });
    if (recordsMutated) {
      saveKifuRecords(nextRecords);
    }
  }

  return {
    added,
    updated,
    adopted,
    total: next.length,
  };
}
