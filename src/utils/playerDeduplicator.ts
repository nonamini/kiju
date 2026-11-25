/**
 * Player Profile Deduplication and Merge Utility.
 * Detects duplicate profiles by normalized name or aliases,
 * and merges them cleanly while re-pointing KifuRecords.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strict TypeScript without any (Rule 2).
 */

import { ShogiPlayerProfile } from '../types/player';
import { loadKifuRecords, updateKifuRecord } from './kifuRecordStorage';
import { loadPlayerProfiles, savePlayerProfiles, normalizePlayerName } from './playerStorage';

export interface DuplicatePlayerCandidate {
  profile: ShogiPlayerProfile;
  gameCount: number;
}

export interface DuplicatePlayerGroup {
  key: string; // Clean normalized name
  canonicalName: string;
  candidates: DuplicatePlayerCandidate[];
}

/**
 * Scans all registered player profiles and returns duplicate groups
 * where 2 or more profiles share the same normalized name.
 */
export function findDuplicatePlayerGroups(
  profiles: ShogiPlayerProfile[] = loadPlayerProfiles()
): DuplicatePlayerGroup[] {
  const records = loadKifuRecords();
  
  // Count games per player profile
  const gameCounts = new Map<string, number>();
  for (const rec of records) {
    if (rec.sentePlayerId) {
      gameCounts.set(rec.sentePlayerId, (gameCounts.get(rec.sentePlayerId) || 0) + 1);
    }
    if (rec.gotePlayerId) {
      gameCounts.set(rec.gotePlayerId, (gameCounts.get(rec.gotePlayerId) || 0) + 1);
    }
  }

  const groupMap = new Map<string, DuplicatePlayerCandidate[]>();

  for (const p of profiles) {
    if (p.deletedAt) continue; // Skip trash items
    const { normalized } = normalizePlayerName(p.name);
    const key = normalized.replace(/[\s\u3000]+/g, '').toLowerCase();
    if (!key) continue;

    const count = gameCounts.get(p.id) || 0;
    const existing = groupMap.get(key) || [];
    existing.push({ profile: p, gameCount: count });
    groupMap.set(key, existing);
  }

  const duplicates: DuplicatePlayerGroup[] = [];
  for (const [key, candidates] of groupMap.entries()) {
    if (candidates.length > 1) {
      // Sort candidates descending by gameCount, then createdAt
      candidates.sort((a, b) => {
        if (b.gameCount !== a.gameCount) return b.gameCount - a.gameCount;
        return (a.profile.createdAt || '').localeCompare(b.profile.createdAt || '');
      });

      duplicates.push({
        key,
        canonicalName: candidates[0]?.profile.name || key,
        candidates,
      });
    }
  }

  return duplicates;
}

/**
 * Merges source player profiles into a target primary profile.
 * - Re-points all KifuRecords from source player IDs to target primary ID.
 * - Merges aliases, titles, and notes into the primary profile.
 * - Removes or soft-deletes source profiles.
 */
export function mergePlayerProfiles(
  targetPrimaryId: string,
  sourceProfileIds: string[]
): { updatedRecordCount: number; mergedProfile: ShogiPlayerProfile | null } {
  const allProfiles = loadPlayerProfiles();
  const primary = allProfiles.find((p) => p.id === targetPrimaryId);
  if (!primary) return { updatedRecordCount: 0, mergedProfile: null };

  const sources = allProfiles.filter(
    (p) => sourceProfileIds.includes(p.id) && p.id !== targetPrimaryId
  );
  if (sources.length === 0) return { updatedRecordCount: 0, mergedProfile: primary };

  // 1. Gather all aliases and notes
  const combinedAliases = new Set<string>(primary.aliases || []);
  if (primary.name) combinedAliases.add(primary.name);
  for (const s of sources) {
    if (s.name) combinedAliases.add(s.name);
    for (const a of s.aliases || []) {
      combinedAliases.add(a);
    }
  }
  combinedAliases.delete(primary.name); // Primary name doesn't need to be in its own aliases

  const mergedTitle =
    primary.title ||
    sources.find((s) => Boolean(s.title))?.title;

  const mergedProfile: ShogiPlayerProfile = {
    ...primary,
    aliases: Array.from(combinedAliases),
    title: mergedTitle,
    updatedAt: new Date().toISOString(),
  };

  // 2. Re-point KifuRecords
  const sourceIdSet = new Set(sources.map((s) => s.id));
  const records = loadKifuRecords();
  let updatedRecordCount = 0;

  for (const rec of records) {
    let needsUpdate = false;
    let newSente = rec.sentePlayerId;
    let newGote = rec.gotePlayerId;
    let newSenteName = rec.senteName;
    let newGoteName = rec.goteName;

    if (rec.sentePlayerId && sourceIdSet.has(rec.sentePlayerId)) {
      newSente = primary.id;
      newSenteName = primary.name;
      needsUpdate = true;
    }
    if (rec.gotePlayerId && sourceIdSet.has(rec.gotePlayerId)) {
      newGote = primary.id;
      newGoteName = primary.name;
      needsUpdate = true;
    }

    if (needsUpdate) {
      updateKifuRecord(rec.id, {
        sentePlayerId: newSente,
        gotePlayerId: newGote,
        senteName: newSenteName,
        goteName: newGoteName,
      });
      updatedRecordCount += 1;
    }
  }

  // 3. Save merged primary profile and delete source profiles
  let remainingProfiles = allProfiles.map((p) => (p.id === primary.id ? mergedProfile : p));
  for (const s of sources) {
    remainingProfiles = remainingProfiles.filter((p) => p.id !== s.id);
  }
  savePlayerProfiles(remainingProfiles);

  return { updatedRecordCount, mergedProfile };
}
