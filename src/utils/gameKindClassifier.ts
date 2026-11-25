/**
 * Game Kind Classification & Auto-Tagging Utility (Issue #71 / #139).
 * Infers `'pro' | 'ladies' | 'amateur' | 'self' | 'other'` from player profiles,
 * tournament names, and tags, and generates canonical structured auto-tags.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { KifuGameKind, KifuRecord } from '../types/kifuRecord';
import type { ShogiPlayerProfile } from '../types/player';
import {
  AMATEUR_TOURNAMENT_TAGS,
  LADIES_TOURNAMENT_TAGS,
  PRO_GENERAL_TOURNAMENT_TAGS,
  PRO_TITLE_TOURNAMENT_TAGS,
  STRUCTURED_TAG_GROUPS,
} from '../types/tagRegistry';
import {
  loadDeletedKifuIds,
  loadKifuRecords,
  saveKifuRecords,
} from './kifuRecordStorage';
import { getSafeStorage } from './matchHistoryStorage';
import { loadTacticsItems } from './tacticsStorage';
import { createJkfPlayerFromTactic } from './tacticsJkfConverter';
import {
  DEFAULT_APP_USER_ID,
  inferPlayerCategoryFromName,
  isGenericPlaceholderPlayerName,
  loadPlayerProfiles,
  purgeGenericPlaceholderPlayers,
  savePlayerProfiles,
} from './playerStorage';
import {
  deleteTagDefinition,
  loadTagRegistry,
  resolveTagIdsFromNames,
  resolveTagNamesFromIds,
} from './tagRegistryStorage';

export const PRO_TOURNAMENT_KEYWORDS: readonly string[] = [
  '竜王戦',
  '名人戦',
  '順位戦',
  '王位戦',
  '王座戦',
  '棋王戦',
  '王将戦',
  '棋聖戦',
  '叡王戦',
  '朝日杯',
  '銀河戦',
  'NHK杯',
  'JT杯',
  '新人王戦',
  '加古川青流戦',
  '達人戦',
  'ABEMAトーナメント',
  '棋戦',
];

export const LADIES_TOURNAMENT_KEYWORDS: readonly string[] = [
  '白玲',
  '清麗',
  'マイナビ女子',
  '女流',
  '倉敷藤花',
];

export const AMATEUR_TOURNAMENT_KEYWORDS: readonly string[] = [
  '三段リーグ',
  '奨励会',
  '研修会',
  'アマ',
  '学生大会',
  '支部対抗',
  '朝日アマ',
  '赤旗',
];

export const SELF_PLATFORM_KEYWORDS: readonly string[] = [
  '将棋ウォーズ',
  '将棋倶楽部24',
  '将棋クエスト',
  '81Dojo',
  'ぴよ将棋',
  '個人対局',
  '実戦対局',
];

export const PRO_TAG_NAMES: ReadonlySet<string> = new Set([
  'プロ公式',
  'プロ公式戦',
]);

export const LADIES_TAG_NAMES: ReadonlySet<string> = new Set([
  '女流公式',
  '女流公式戦',
  '女流清麗戦',
  ...LADIES_TOURNAMENT_TAGS,
]);

export const AMATEUR_TAG_NAMES: ReadonlySet<string> = new Set([
  'アマ公式',
  ...AMATEUR_TOURNAMENT_TAGS,
]);

export function isOwnerProfile(profile?: ShogiPlayerProfile | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.isOwner ||
      profile.id === DEFAULT_APP_USER_ID ||
      profile.category === 'user'
  );
}

function findProfileByIdOrName(
  profiles: ShogiPlayerProfile[],
  playerId?: string,
  rawName?: string
): ShogiPlayerProfile | undefined {
  if (playerId) {
    const byId = profiles.find((p) => p.id === playerId);
    if (byId) return byId;
  }
  const normalized = rawName?.trim();
  if (!normalized) return undefined;
  return profiles.find(
    (p) =>
      p.name === normalized ||
      (Array.isArray(p.aliases) && p.aliases.includes(normalized))
  );
}

function hasLadiesMarker(
  rawName?: string,
  profile?: ShogiPlayerProfile
): boolean {
  const nameHas = Boolean(rawName && rawName.includes('女流'));
  const titleHas = Boolean(profile?.title && profile.title.includes('女流'));
  const tagHas = Boolean(profile?.tags?.some((t) => t.includes('女流')));
  return nameHas || titleHas || tagHas;
}

function hasAmateurMarker(
  rawName?: string,
  profile?: ShogiPlayerProfile
): boolean {
  const text = `${rawName ?? ''} ${profile?.title ?? ''} ${(profile?.tags ?? []).join(' ')}`;
  return (
    text.includes('アマ') ||
    text.includes('奨励会') ||
    text.includes('三段リーグ')
  );
}

/**
 * Infers the default KifuGameKind for a record based on owner/pro/ladies/amateur profiles,
 * tournament name, and tags.
 */
export function inferGameKind(
  record: Pick<
    KifuRecord,
    | 'sentePlayerId'
    | 'gotePlayerId'
    | 'senteName'
    | 'goteName'
    | 'tournament'
    | 'tags'
  > & { id?: string },
  profiles: ShogiPlayerProfile[] = loadPlayerProfiles()
): KifuGameKind {
  const rawSenteProf = findProfileByIdOrName(
    profiles,
    record.sentePlayerId,
    record.senteName
  );
  const rawGoteProf = findProfileByIdOrName(
    profiles,
    record.gotePlayerId,
    record.goteName
  );
  const senteProf =
    rawSenteProf && isGenericPlaceholderPlayerName(rawSenteProf.name)
      ? undefined
      : rawSenteProf;
  const goteProf =
    rawGoteProf && isGenericPlaceholderPlayerName(rawGoteProf.name)
      ? undefined
      : rawGoteProf;
  const tournament = record.tournament?.trim() ?? '';
  const tags = Array.isArray(record.tags) ? record.tags : [];

  // 0. Tactic notes -> 'joseki'; generic study boards without real players or tournament -> 'other'
  if (record.id?.startsWith('tactic_')) {
    return 'joseki';
  }
  if (
    isGenericPlaceholderPlayerName(record.senteName) &&
    isGenericPlaceholderPlayerName(record.goteName) &&
    !tournament
  ) {
    return 'other';
  }

  // 1. Owner / user games or personal app platforms take priority -> 'self'
  if (
    isOwnerProfile(senteProf) ||
    isOwnerProfile(goteProf) ||
    tags.some((t) => SELF_PLATFORM_KEYWORDS.includes(t)) ||
    SELF_PLATFORM_KEYWORDS.some((kw) => tournament.includes(kw))
  ) {
    return 'self';
  }

  // 2. Ladies pro official tournaments / games -> 'ladies'
  if (
    (tournament && LADIES_TOURNAMENT_KEYWORDS.some((kw) => tournament.includes(kw))) ||
    tags.some((t) => LADIES_TAG_NAMES.has(t)) ||
    (hasLadiesMarker(record.senteName, senteProf) &&
      hasLadiesMarker(record.goteName, goteProf))
  ) {
    return 'ladies';
  }

  // 3. Amateur / Shoreikai tournaments or players -> 'amateur'
  if (
    (tournament && AMATEUR_TOURNAMENT_KEYWORDS.some((kw) => tournament.includes(kw))) ||
    tags.some((t) => AMATEUR_TAG_NAMES.has(t)) ||
    hasAmateurMarker(record.senteName, senteProf) ||
    hasAmateurMarker(record.goteName, goteProf)
  ) {
    return 'amateur';
  }

  // 4. Registered pro player or pro tournament/tag -> 'pro'
  if (senteProf?.category === 'pro' || goteProf?.category === 'pro') {
    return 'pro';
  }

  if (
    tournament &&
    PRO_TOURNAMENT_KEYWORDS.some((kw) => tournament.includes(kw))
  ) {
    return 'pro';
  }

  if (tags.some((t) => PRO_TAG_NAMES.has(t))) {
    return 'pro';
  }

  return 'other';
}

const ORDERED_TOURNAMENT_MATCHERS: Array<{ keyword: string; tag: string }> = [
  // Ladies specific (check before general pro keywords so 女流順位戦 does not match 順位戦)
  { keyword: '女流順位戦', tag: '女流順位戦' },
  { keyword: '白玲戦', tag: '白玲戦' },
  { keyword: '女流清麗戦', tag: '清麗戦' },
  { keyword: '清麗戦', tag: '清麗戦' },
  { keyword: 'マイナビ女子', tag: 'マイナビ女子オープン' },
  { keyword: '女流王座戦', tag: '女流王座戦' },
  { keyword: '女流名人戦', tag: '女流名人戦' },
  { keyword: '女流王位戦', tag: '女流王位戦' },
  { keyword: '女流王将戦', tag: '女流王将戦' },
  { keyword: '倉敷藤花戦', tag: '倉敷藤花戦' },
  { keyword: 'YAMADA女流', tag: 'YAMADA女流チャレンジ杯' },
  // Amateur / Shoreikai specific (check before general pro keywords)
  { keyword: 'アマ竜王戦', tag: 'アマ竜王戦' },
  { keyword: '朝日アマ', tag: '朝日アマ名人戦' },
  { keyword: 'アマ名人戦', tag: 'アマ名人戦' },
  { keyword: '赤旗名人戦', tag: '赤旗名人戦' },
  { keyword: '三段リーグ', tag: '三段リーグ' },
  { keyword: '奨励会', tag: '奨励会' },
  { keyword: '支部対抗', tag: '支部対抗戦' },
  { keyword: '学生大会', tag: '学生大会' },
  { keyword: '研修会', tag: '研修会' },
  // Pro titles & general tournaments (keep full 戦 suffix so player titles like 竜王・名人 do not false-match)
  ...PRO_TITLE_TOURNAMENT_TAGS.map((tag) => ({
    keyword: tag,
    tag,
  })),
  ...PRO_GENERAL_TOURNAMENT_TAGS.map((tag) => ({
    keyword: tag === 'ABEMAトーナメント' ? 'ABEMA' : tag,
    tag,
  })),
  // Fallback amateur / ladies exact match
  ...AMATEUR_TOURNAMENT_TAGS.map((tag) => ({ keyword: tag, tag })),
  ...LADIES_TOURNAMENT_TAGS.map((tag) => ({ keyword: tag, tag })),
];

/**
 * Infers both `KifuGameKind` and canonical structured tags (study/source/tournament/opening)
 * for newly imported or created kifu records, replacing legacy `'プロ公式戦'` tagging.
 */
export function inferAutoKifuTags(
  input: {
    senteName?: string;
    goteName?: string;
    tournament?: string;
    openingName?: string;
    sentePlayerId?: string;
    gotePlayerId?: string;
  },
  profiles: ShogiPlayerProfile[] = loadPlayerProfiles()
): { gameKind: KifuGameKind; tags: string[] } {
  const tournament = input.tournament?.trim() ?? '';
  const openingName = input.openingName?.trim() ?? '';
  const senteName = input.senteName?.trim() ?? '';
  const goteName = input.goteName?.trim() ?? '';

  const tags: string[] = ['研究'];

  // Check for pro rank markers in raw names if no profile yet
  const inferred = inferGameKind(
    {
      sentePlayerId: input.sentePlayerId,
      gotePlayerId: input.gotePlayerId,
      senteName,
      goteName,
      tournament: tournament || undefined,
      tags: [],
    },
    profiles
  );

  let gameKind: KifuGameKind = inferred;
  if (gameKind === 'other') {
    const rawCombined = `${senteName} ${goteName}`;
    if (rawCombined.includes('女流')) {
      gameKind = 'ladies';
    } else if (
      rawCombined.includes('竜王') ||
      rawCombined.includes('名人') ||
      rawCombined.includes('段')
    ) {
      gameKind = 'pro';
    }
  }

  if (gameKind === 'pro') {
    tags.push('プロ公式');
  } else if (gameKind === 'ladies') {
    tags.push('女流公式');
  } else if (gameKind === 'amateur') {
    tags.push('アマ公式');
  }

  // Match platform keywords in tournament / location header
  if (tournament) {
    for (const kw of SELF_PLATFORM_KEYWORDS) {
      if (tournament.includes(kw) && !tags.includes(kw)) {
        tags.push(kw);
      }
    }

    // Match canonical tournament tag
    for (const matcher of ORDERED_TOURNAMENT_MATCHERS) {
      if (tournament.includes(matcher.keyword)) {
        if (!tags.includes(matcher.tag)) {
          tags.push(matcher.tag);
        }
        break;
      }
    }
  }

  // Match canonical opening tag
  if (openingName) {
    const openingGroup = STRUCTURED_TAG_GROUPS.find((g) => g.id === 'opening');
    if (openingGroup) {
      for (const opTag of openingGroup.tags) {
        if (openingName.includes(opTag) && !tags.includes(opTag)) {
          tags.push(opTag);
        }
      }
    }
  }

  return { gameKind, tags };
}

/**
 * Returns the explicit `gameKind` when set, or falls back to inference.
 */
export function resolveGameKind(
  record: KifuRecord,
  profiles?: ShogiPlayerProfile[]
): KifuGameKind {
  return record.gameKind ?? inferGameKind(record, profiles);
}

/**
 * Re-infers `gameKind` for all KifuRecords referencing the given playerId.
 */
export function reclassifyRecordsForPlayer(playerId: string): number {
  if (!playerId) return 0;
  const profiles = loadPlayerProfiles();
  const records = loadKifuRecords();
  const now = new Date().toISOString();
  let updated = 0;

  const next = records.map((rec) => {
    if (rec.sentePlayerId !== playerId && rec.gotePlayerId !== playerId) {
      return rec;
    }
    const inferred = inferGameKind(rec, profiles);
    if (rec.gameKind === inferred) return rec;
    updated += 1;
    return { ...rec, gameKind: inferred, updatedAt: now };
  });

  if (updated > 0) {
    saveKifuRecords(next);
  }
  return updated;
}

/**
 * Reclassifies mis-categorized AI/PiyoShogi CPU profiles from `'pro'` to `'ai'`
 * and re-infers `gameKind` on affected KifuRecords.
 */
export function reclassifyAiPlayersAndSyncRecords(): {
  updatedPlayers: number;
  updatedRecords: number;
} {
  const profiles = loadPlayerProfiles();
  const now = new Date().toISOString();
  const changedIds = new Set<string>();

  const nextProfiles = profiles.map((p) => {
    if (p.category !== 'pro') return p;
    const candidates = [p.name, ...(p.aliases ?? [])];
    const isAi = candidates.some(
      (c) => inferPlayerCategoryFromName(c, 'pro') === 'ai'
    );
    if (!isAi) return p;
    changedIds.add(p.id);
    return { ...p, category: 'ai' as const, updatedAt: now };
  });

  if (changedIds.size > 0) {
    savePlayerProfiles(nextProfiles);
  }

  const records = loadKifuRecords();
  let updatedRecords = 0;
  const nextRecords = records.map((rec) => {
    const touchesChanged =
      (rec.sentePlayerId && changedIds.has(rec.sentePlayerId)) ||
      (rec.gotePlayerId && changedIds.has(rec.gotePlayerId));
    if (!touchesChanged) return rec;
    const inferred = inferGameKind(rec, nextProfiles);
    if (rec.gameKind === inferred) return rec;
    updatedRecords += 1;
    return { ...rec, gameKind: inferred, updatedAt: now };
  });

  if (updatedRecords > 0) {
    saveKifuRecords(nextRecords);
  }

  return { updatedPlayers: changedIds.size, updatedRecords };
}

const KIFU_CLASSIFICATION_V4_FLAG_KEY = 'joseki_tree_kifu_classification_v4_migrated';

function extractMetaFromTitle(title: string): string {
  const m = title.match(/\(([^)]+)\)\s*$/);
  return m?.[1] ?? '';
}

/**
 * Re-evaluates `gameKind` and canonical structured tags across ALL existing KifuRecords,
 * purges bogus placeholder players (`先手`/`後手`), and cleans up legacy custom tags.
 */
export function reclassifyAndAutoTagAllRecords(): {
  updatedRecords: number;
  mergedTags: number;
} {
  purgeGenericPlaceholderPlayers();

  // 1. Clean up duplicate/legacy custom tag definitions in TagRegistry
  const registry = loadTagRegistry();
  let mergedTags = 0;
  for (const def of registry) {
    if (
      def.name === 'プロ公式戦' ||
      def.name === '女流清麗戦' ||
      def.name === '女流公式戦'
    ) {
      if (deleteTagDefinition(def.id)) {
        mergedTags += 1;
      }
    }
  }

  const profiles = loadPlayerProfiles();
  const profileIds = new Set(profiles.map((p) => p.id));
  const records = loadKifuRecords();
  const now = new Date().toISOString();
  let updatedRecords = 0;

  const nextRecords = records.map((rec) => {
    const isTactic = rec.id.startsWith('tactic_');
    const isGenericStudy =
      isGenericPlaceholderPlayerName(rec.senteName) &&
      isGenericPlaceholderPlayerName(rec.goteName) &&
      !rec.tournament?.trim();

    const titleMeta = extractMetaFromTitle(rec.title);
    const auto = isTactic
      ? { gameKind: 'joseki' as const, tags: ['定跡'] }
      : isGenericStudy
        ? {
            gameKind: (rec.gameKind === 'joseki' ? 'joseki' : 'other') as KifuGameKind,
            tags: [rec.gameKind === 'joseki' ? '定跡' : '研究'],
          }
        : inferAutoKifuTags(
            {
              senteName: rec.senteName,
              goteName: rec.goteName,
              tournament: rec.tournament?.trim() || titleMeta || undefined,
              openingName: rec.openingName || titleMeta || undefined,
              sentePlayerId: rec.sentePlayerId,
              gotePlayerId: rec.gotePlayerId,
            },
            profiles
          );

    let nextGameKind: KifuGameKind;
    if (isTactic || rec.gameKind === 'joseki') {
      nextGameKind = 'joseki';
    } else if (isGenericStudy) {
      nextGameKind = 'other';
    } else if (rec.gameKind === 'self') {
      nextGameKind = 'self';
    } else if (auto.gameKind !== 'other') {
      nextGameKind = auto.gameKind;
    } else {
      nextGameKind = rec.gameKind ?? 'other';
    }

    const clearInvalidPlayers = isTactic || isGenericStudy;
    const nextSentePlayerId =
      clearInvalidPlayers || (rec.sentePlayerId && !profileIds.has(rec.sentePlayerId))
        ? undefined
        : rec.sentePlayerId;
    const nextGotePlayerId =
      clearInvalidPlayers || (rec.gotePlayerId && !profileIds.has(rec.gotePlayerId))
        ? undefined
        : rec.gotePlayerId;

    // Rebuild tags cleanly from existing tags + inferred canonical tags
    const baseTags: string[] = [];
    for (const t of rec.tags ?? []) {
      const normalized =
        t === '女流清麗戦'
          ? '清麗戦'
          : t === 'プロ公式戦'
            ? ''
            : t === '女流公式戦'
              ? '女流公式'
              : t;
      if (normalized && !baseTags.includes(normalized)) {
        baseTags.push(normalized);
      }
    }

    // Ensure division tag aligns with resolved gameKind
    let workingTags = [...baseTags];
    if (nextGameKind === 'ladies') {
      workingTags = workingTags.filter((t) => t !== 'プロ公式');
      if (!workingTags.includes('女流公式')) workingTags.push('女流公式');
    } else if (nextGameKind === 'amateur') {
      workingTags = workingTags.filter((t) => t !== 'プロ公式');
      if (!workingTags.includes('アマ公式')) workingTags.push('アマ公式');
    } else if (
      nextGameKind === 'self' ||
      nextGameKind === 'joseki' ||
      nextGameKind === 'other'
    ) {
      workingTags = workingTags.filter(
        (t) => t !== 'プロ公式' && t !== '女流公式' && t !== 'アマ公式'
      );
    }

    for (const autoTag of auto.tags) {
      if (!workingTags.includes(autoTag)) {
        workingTags.push(autoTag);
      }
    }

    const nextTagIds = resolveTagIdsFromNames(workingTags);
    const finalTags = resolveTagNamesFromIds(nextTagIds);

    const gameKindChanged = rec.gameKind !== nextGameKind;
    const playerRefChanged =
      rec.sentePlayerId !== nextSentePlayerId ||
      rec.gotePlayerId !== nextGotePlayerId;
    const tagsChanged =
      finalTags.length !== rec.tags.length ||
      finalTags.some((t, i) => t !== rec.tags[i]);
    const idsChanged =
      nextTagIds.length !== (rec.tagIds?.length ?? 0) ||
      nextTagIds.some((id, i) => id !== rec.tagIds?.[i]);

    if (!gameKindChanged && !playerRefChanged && !tagsChanged && !idsChanged) {
      return rec;
    }

    updatedRecords += 1;
    return {
      ...rec,
      gameKind: nextGameKind,
      sentePlayerId: nextSentePlayerId,
      gotePlayerId: nextGotePlayerId,
      tagIds: nextTagIds,
      tags: finalTags,
      updatedAt: now,
    };
  });

  if (updatedRecords > 0) {
    saveKifuRecords(nextRecords);
  }

  return { updatedRecords, mergedTags };
}

/**
 * Migrates custom TacticsNoteItems (with sfen or jkfJson) into KifuRecords with gameKind 'joseki'.
 * Skips items whose canonical `tactic_game_<id>` record already exists or was deleted.
 */
export function migrateCustomTacticsToJosekiRecords(): number {
  const tacticItems = loadTacticsItems().filter(
    (item) => Boolean(item.isCustom) && (Boolean(item.sfen) || Boolean(item.jkfJson))
  );
  if (tacticItems.length === 0) return 0;

  const existingRecords = loadKifuRecords();
  const existingIds = new Set(existingRecords.map((r) => r.id));
  const deletedIds = new Set(loadDeletedKifuIds());
  const now = new Date().toISOString();
  const additions: KifuRecord[] = [];

  for (const item of tacticItems) {
    const targetId = `tactic_game_${item.id}`;
    if (existingIds.has(targetId) || deletedIds.has(targetId)) continue;

    const player = createJkfPlayerFromTactic(item);
    const totalPlies = player.getMaxTesuu();
    const evaluations: KifuRecord['evaluations'] = {};
    if (item.evalHistory) {
      for (const ev of item.evalHistory) {
        evaluations[ev.ply] = {
          scoreCp: ev.scoreCp,
          isMate: ev.isMate,
          depth: 10,
          evaluatedAt: item.updatedAt || now,
        };
      }
    }

    const rawTags = Array.from(
      new Set(
        [
          '定跡',
          item.tag,
          ...(item.id.startsWith('custom_tactic_') ? ['登録局面'] : []),
        ].filter(Boolean)
      )
    );
    const tagIds = resolveTagIdsFromNames(rawTags);
    const tags = resolveTagNamesFromIds(tagIds);

    additions.push({
      id: targetId,
      title: item.title,
      contentHash: targetId,
      source: 'studio',
      senteName: '先手',
      goteName: '後手',
      openingId: item.tag || 'tactic',
      openingName: item.title,
      totalPlies,
      jkfJson: JSON.stringify(player.kifu),
      ...(Object.keys(evaluations).length > 0 ? { evaluations } : {}),
      tagIds,
      tags,
      gameKind: 'joseki',
      isIncludedInTree: false,
      createdAt: item.updatedAt || now,
      updatedAt: item.updatedAt || now,
      reviewStatus: 'read',
    });
    existingIds.add(targetId);
  }

  if (additions.length > 0) {
    saveKifuRecords([...existingRecords, ...additions]);
  }
  return additions.length;
}

/**
 * Runs a one-time classification & canonical tag migration for existing local data.
 */
export function runOneTimeKifuClassificationMigration(): boolean {
  try {
    const storage = getSafeStorage();
    if (storage.getItem(KIFU_CLASSIFICATION_V4_FLAG_KEY) === '1') {
      return false;
    }
    const migratedCustom = migrateCustomTacticsToJosekiRecords();
    const result = reclassifyAndAutoTagAllRecords();
    storage.setItem(KIFU_CLASSIFICATION_V4_FLAG_KEY, '1');
    return migratedCustom > 0 || result.updatedRecords > 0 || result.mergedTags > 0;
  } catch (err) {
    console.warn('[GameKindClassifier] Failed one-time classification migration:', err);
    return false;
  }
}
