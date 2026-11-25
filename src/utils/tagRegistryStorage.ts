/**
 * Tag ID Registry persistence & KifuRecord tag synchronization (Issue #64).
 * Seeds built-in tags from STRUCTURED_TAG_GROUPS with deterministic IDs
 * (`builtin:{groupId}:{name}`) and migrates legacy name-only `tags` arrays
 * into canonical `tagIds` links.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import { KifuRecord } from '../types/kifuRecord';
import {
  STRUCTURED_TAG_GROUPS,
  TagDefinition,
  TagGroupId,
} from '../types/tagRegistry';
import { getSafeStorage } from './matchHistoryStorage';

export const TAG_REGISTRY_STORAGE_KEY = 'joseki_tree_tag_registry';
const LEGACY_CUSTOM_TAG_GROUPS_KEY = 'joseki_tree_custom_tag_groups';

export function buildBuiltinTagId(groupId: TagGroupId, name: string): string {
  return `builtin:${groupId}:${name}`;
}

function generateCustomTagId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tag-${crypto.randomUUID()}`;
  }
  return `tag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Builds the initial TagDefinition list from STRUCTURED_TAG_GROUPS and any
 * legacy custom tags stored under `joseki_tree_custom_tag_groups`.
 */
export function seedTagRegistry(): TagDefinition[] {
  const now = new Date().toISOString();
  const defs: TagDefinition[] = [];
  const seenKeys = new Set<string>();

  for (const group of STRUCTURED_TAG_GROUPS) {
    for (const rawName of group.tags) {
      const name = rawName.trim();
      if (!name) continue;
      const key = `${group.id}::${name}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      defs.push({
        id: buildBuiltinTagId(group.id, name),
        name,
        groupId: group.id,
        isBuiltin: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  try {
    const rawCustom = getSafeStorage().getItem(LEGACY_CUSTOM_TAG_GROUPS_KEY);
    if (rawCustom) {
      const parsed: unknown = JSON.parse(rawCustom);
      if (parsed && typeof parsed === 'object') {
        const customMap = parsed as Record<string, unknown>;
        for (const [groupKey, list] of Object.entries(customMap)) {
          if (!Array.isArray(list)) continue;
          const groupId: TagGroupId =
            groupKey === 'source' ||
            groupKey === 'tournament' ||
            groupKey === 'opening' ||
            groupKey === 'study'
              ? groupKey
              : 'custom';
          for (const item of list) {
            if (typeof item !== 'string') continue;
            const name = item.trim();
            if (!name) continue;
            const key = `${groupId}::${name}`;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            defs.push({
              id: generateCustomTagId(),
              name,
              groupId,
              isBuiltin: false,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      }
    }
  } catch {
    // Ignore malformed legacy custom tag groups
  }

  return defs;
}

const BUILTIN_GROUP_BY_NAME: ReadonlyMap<string, TagGroupId> = (() => {
  const map = new Map<string, TagGroupId>();
  for (const group of STRUCTURED_TAG_GROUPS) {
    for (const rawName of group.tags) {
      const name = rawName.trim();
      if (name && !map.has(name)) {
        map.set(name, group.id);
      }
    }
  }
  return map;
})();

const LEGACY_CUSTOM_RECLASSIFY_MAP: ReadonlyMap<
  string,
  { targetName: string; targetGroupId: TagGroupId }
> = new Map([
  ['女流清麗戦', { targetName: '清麗戦', targetGroupId: 'tournament' }],
  ['プロ公式戦', { targetName: 'プロ公式', targetGroupId: 'source' }],
]);

/**
 * Reconciles a loaded TagDefinition list with current STRUCTURED_TAG_GROUPS:
 * 1. Promotes legacy `'custom'` tags whose names match built-in tags to their proper group.
 * 2. Normalizes known legacy custom aliases (e.g. `'女流清麗戦'` -> `'清麗戦'` in `'tournament'`,
 *    `'プロ公式戦'` moved to `'source'`).
 * 3. Appends any newly introduced built-in tags not yet present in the registry.
 */
export function reconcileTagRegistryWithBuiltins(
  defs: TagDefinition[]
): { defs: TagDefinition[]; mutated: boolean } {
  const now = new Date().toISOString();
  let mutated = false;
  const occupiedKeys = new Set<string>(defs.map((d) => `${d.groupId}::${d.name}`));

  const upgraded = defs.map((def) => {
    if (def.groupId !== 'custom') {
      return def;
    }

    // Check if this custom tag matches a current built-in name
    const builtinGroup = BUILTIN_GROUP_BY_NAME.get(def.name);
    if (builtinGroup) {
      const targetKey = `${builtinGroup}::${def.name}`;
      if (!occupiedKeys.has(targetKey)) {
        occupiedKeys.delete(`${def.groupId}::${def.name}`);
        occupiedKeys.add(targetKey);
        mutated = true;
        return {
          ...def,
          groupId: builtinGroup,
          updatedAt: now,
        };
      }
    }

    // Check legacy custom aliases (e.g. 女流清麗戦 -> 清麗戦, プロ公式戦 -> source)
    const legacyAlias = LEGACY_CUSTOM_RECLASSIFY_MAP.get(def.name);
    if (legacyAlias) {
      const renamedKey = `${legacyAlias.targetGroupId}::${legacyAlias.targetName}`;
      if (!occupiedKeys.has(renamedKey)) {
        occupiedKeys.delete(`${def.groupId}::${def.name}`);
        occupiedKeys.add(renamedKey);
        mutated = true;
        return {
          ...def,
          name: legacyAlias.targetName,
          groupId: legacyAlias.targetGroupId,
          updatedAt: now,
        };
      }
      // Target name already exists in target group; still move out of 'custom'
      const regroupedKey = `${legacyAlias.targetGroupId}::${def.name}`;
      if (!occupiedKeys.has(regroupedKey)) {
        occupiedKeys.delete(`${def.groupId}::${def.name}`);
        occupiedKeys.add(regroupedKey);
        mutated = true;
        return {
          ...def,
          groupId: legacyAlias.targetGroupId,
          updatedAt: now,
        };
      }
    }

    return def;
  });

  // Ensure every built-in tag from STRUCTURED_TAG_GROUPS exists
  const additions: TagDefinition[] = [];
  for (const group of STRUCTURED_TAG_GROUPS) {
    for (const rawName of group.tags) {
      const name = rawName.trim();
      if (!name) continue;
      const key = `${group.id}::${name}`;
      if (occupiedKeys.has(key)) continue;
      occupiedKeys.add(key);
      mutated = true;
      additions.push({
        id: buildBuiltinTagId(group.id, name),
        name,
        groupId: group.id,
        isBuiltin: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (!mutated) {
    return { defs, mutated: false };
  }
  return { defs: [...upgraded, ...additions], mutated: true };
}

export function loadTagRegistry(): TagDefinition[] {
  try {
    const storage = getSafeStorage();
    const raw = storage.getItem(TAG_REGISTRY_STORAGE_KEY);
    if (!raw) {
      const seeded = seedTagRegistry();
      storage.setItem(TAG_REGISTRY_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      const seeded = seedTagRegistry();
      storage.setItem(TAG_REGISTRY_STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const { defs, mutated } = reconcileTagRegistryWithBuiltins(
      parsed as TagDefinition[]
    );
    if (mutated) {
      storage.setItem(TAG_REGISTRY_STORAGE_KEY, JSON.stringify(defs));
    }
    return defs;
  } catch {
    return seedTagRegistry();
  }
}

export function saveTagRegistry(defs: TagDefinition[]): void {
  try {
    getSafeStorage().setItem(TAG_REGISTRY_STORAGE_KEY, JSON.stringify(defs));
  } catch (err) {
    console.error('Failed to save tag registry:', err);
  }
}

export function getTagById(id: string): TagDefinition | null {
  if (!id) return null;
  return loadTagRegistry().find((t) => t.id === id) ?? null;
}

export function findTagByName(
  name: string,
  groupId?: TagGroupId
): TagDefinition | null {
  const normalized = name.trim();
  if (!normalized) return null;
  const defs = loadTagRegistry();
  if (groupId) {
    return (
      defs.find((t) => t.groupId === groupId && t.name === normalized) ?? null
    );
  }
  return defs.find((t) => t.name === normalized) ?? null;
}

export function createTagDefinition(
  name: string,
  groupId: TagGroupId = 'custom'
): TagDefinition {
  const normalized = name.trim();
  const defs = loadTagRegistry();
  const existing = defs.find(
    (t) => t.groupId === groupId && t.name === normalized
  );
  if (existing) return existing;

  const now = new Date().toISOString();
  const created: TagDefinition = {
    id: generateCustomTagId(),
    name: normalized,
    groupId,
    isBuiltin: false,
    createdAt: now,
    updatedAt: now,
  };
  saveTagRegistry([...defs, created]);
  return created;
}

export function renameTagDefinition(
  id: string,
  newName: string
): TagDefinition | null {
  const normalized = newName.trim();
  if (!normalized) return null;
  const defs = loadTagRegistry();
  const idx = defs.findIndex((t) => t.id === id);
  if (idx < 0) return null;

  const updated: TagDefinition = {
    ...defs[idx]!,
    name: normalized,
    updatedAt: new Date().toISOString(),
  };
  const next = [...defs];
  next[idx] = updated;
  saveTagRegistry(next);
  return updated;
}

export function changeTagDefinitionGroup(
  id: string,
  newGroupId: TagGroupId
): TagDefinition | null {
  const defs = loadTagRegistry();
  const idx = defs.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const current = defs[idx]!;
  if (current.groupId === newGroupId) return current;

  const updated: TagDefinition = {
    ...current,
    groupId: newGroupId,
    updatedAt: new Date().toISOString(),
  };
  const next = [...defs];
  next[idx] = updated;
  saveTagRegistry(next);
  return updated;
}

export function deleteTagDefinition(id: string): boolean {
  const defs = loadTagRegistry();
  const filtered = defs.filter((t) => t.id !== id);
  if (filtered.length === defs.length) return false;
  saveTagRegistry(filtered);
  return true;
}

/**
 * Resolves an array of tag display names to canonical tagIds,
 * auto-registering unknown names into the `'custom'` group.
 */
export function resolveTagIdsFromNames(names: string[]): string[] {
  if (names.length === 0) return [];
  const defs = loadTagRegistry();
  const byName = new Map<string, TagDefinition>();
  for (const def of defs) {
    if (!byName.has(def.name)) {
      byName.set(def.name, def);
    }
  }

  let registryMutated = false;
  const now = new Date().toISOString();
  const ids: string[] = [];
  const seenIds = new Set<string>();

  for (const rawName of names) {
    const name = rawName.trim();
    if (!name) continue;
    let def = byName.get(name);
    if (!def) {
      def = {
        id: generateCustomTagId(),
        name,
        groupId: 'custom',
        isBuiltin: false,
        createdAt: now,
        updatedAt: now,
      };
      defs.push(def);
      byName.set(name, def);
      registryMutated = true;
    }
    if (!seenIds.has(def.id)) {
      seenIds.add(def.id);
      ids.push(def.id);
    }
  }

  if (registryMutated) {
    saveTagRegistry(defs);
  }
  return ids;
}

/**
 * Resolves an array of canonical tagIds to current tag display names.
 */
export function resolveTagNamesFromIds(tagIds: string[]): string[] {
  if (tagIds.length === 0) return [];
  const defs = loadTagRegistry();
  const byId = new Map<string, TagDefinition>(defs.map((d) => [d.id, d]));
  const names: string[] = [];
  const seen = new Set<string>();
  for (const id of tagIds) {
    const def = byId.get(id);
    if (!def) continue;
    if (!seen.has(def.name)) {
      seen.add(def.name);
      names.push(def.name);
    }
  }
  return names;
}

/**
 * Synchronizes a KifuRecord's `tagIds` and derived `tags` name cache.
 * - When `tagIds` is absent, migrates `tags` names into `tagIds`.
 * - When `tagIds` is present, regenerates `tags` from the registry.
 */
export function syncRecordTagsWithRegistry(record: KifuRecord): KifuRecord {
  if (record.tagIds === undefined) {
    const tagIds = resolveTagIdsFromNames(record.tags ?? []);
    const tags = resolveTagNamesFromIds(tagIds);
    return { ...record, tagIds, tags };
  }
  const deduplicatedIds = Array.from(new Set(record.tagIds));
  const tags = resolveTagNamesFromIds(deduplicatedIds);
  return { ...record, tagIds: deduplicatedIds, tags };
}
