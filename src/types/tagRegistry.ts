/**
 * Tag ID Registry domain types and built-in tag presets (Issue #64 / #139).
 * Provides stable tag IDs so renaming a tag preserves all KifuRecord links,
 * plus gameKind-aware dynamic filtering for tournament/venue tags.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { KifuGameKind } from './kifuRecord';

export type TagGroupId = 'source' | 'tournament' | 'opening' | 'study' | 'custom';

export interface TagDefinition {
  id: string;
  name: string;
  groupId: TagGroupId;
  isBuiltin?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TagCategoryGroup {
  id: TagGroupId;
  label: string;
  icon: string;
  tags: string[];
}

export const PRO_TITLE_TOURNAMENT_TAGS: readonly string[] = [
  '竜王戦',
  '名人戦',
  '順位戦',
  '王位戦',
  '王座戦',
  '棋王戦',
  '王将戦',
  '棋聖戦',
  '叡王戦',
];

export const PRO_GENERAL_TOURNAMENT_TAGS: readonly string[] = [
  '朝日杯',
  '銀河戦',
  'NHK杯',
  'JT杯',
  '新人王戦',
  '加古川青流戦',
  '達人戦',
  'ABEMAトーナメント',
  'SUNTORYオールスター',
];

export const LADIES_TOURNAMENT_TAGS: readonly string[] = [
  '白玲戦',
  '女流順位戦',
  '清麗戦',
  'マイナビ女子オープン',
  '女流王座戦',
  '女流名人戦',
  '女流王位戦',
  '女流王将戦',
  '倉敷藤花戦',
  'YAMADA女流チャレンジ杯',
];

export const AMATEUR_TOURNAMENT_TAGS: readonly string[] = [
  '三段リーグ',
  '奨励会',
  'アマ竜王戦',
  'アマ名人戦',
  '朝日アマ名人戦',
  '赤旗名人戦',
  '支部対抗戦',
  '学生大会',
  '研修会',
];

export const SELF_PLATFORM_TAGS: readonly string[] = [
  '将棋ウォーズ',
  '将棋倶楽部24',
  '将棋クエスト',
  '81Dojo',
  'ぴよ将棋',
  'AI対局',
  '実戦対局',
  '個人対局',
  '道場・大会',
  '研究会',
  'オンライン対局',
  '早指し対局',
  'クラブ対局',
  '切れ負け',
  '秒読み',
  'プロ公式',
  '女流公式',
  'アマ公式',
];

const SOURCE_TAGS_BY_GAME_KIND: Partial<Record<KifuGameKind, readonly string[]>> = {
  pro: ['プロ公式', '早指し対局', '切れ負け', '秒読み', 'AI対局'],
  ladies: ['女流公式', 'プロ公式', '早指し対局', '切れ負け', '秒読み'],
  amateur: ['アマ公式', '道場・大会', '研究会', '切れ負け', '秒読み', '早指し対局'],
  self: [
    '将棋ウォーズ',
    '将棋倶楽部24',
    '将棋クエスト',
    '81Dojo',
    'ぴよ将棋',
    'AI対局',
    '実戦対局',
    '個人対局',
    '道場・大会',
    '研究会',
    'オンライン対局',
    '早指し対局',
    'クラブ対局',
    '切れ負け',
    '秒読み',
  ],
};

const TOURNAMENT_TAGS_BY_GAME_KIND: Partial<Record<KifuGameKind, readonly string[]>> = {
  pro: [...PRO_TITLE_TOURNAMENT_TAGS, ...PRO_GENERAL_TOURNAMENT_TAGS],
  ladies: [
    ...LADIES_TOURNAMENT_TAGS,
    ...PRO_TITLE_TOURNAMENT_TAGS,
    ...PRO_GENERAL_TOURNAMENT_TAGS,
  ],
  amateur: [...AMATEUR_TOURNAMENT_TAGS, '新人王戦', '銀河戦', '朝日杯'],
  self: [...AMATEUR_TOURNAMENT_TAGS],
};

export const STRUCTURED_TAG_GROUPS: TagCategoryGroup[] = [
  {
    id: 'source',
    label: '対局場・形式',
    icon: '🏛️',
    tags: [...SELF_PLATFORM_TAGS],
  },
  {
    id: 'tournament',
    label: '棋戦種別',
    icon: '🏆',
    tags: [
      ...PRO_TITLE_TOURNAMENT_TAGS,
      ...PRO_GENERAL_TOURNAMENT_TAGS,
      ...LADIES_TOURNAMENT_TAGS,
      ...AMATEUR_TOURNAMENT_TAGS,
    ],
  },
  {
    id: 'opening',
    label: '戦型',
    icon: '⚔️',
    tags: [
      '相居飛車', '対抗形', '相振り飛車',
      '矢倉', '角換わり', '相掛かり', '横歩取り', '雁木',
      '四間飛車', '三間飛車', '中飛車', 'ゴキゲン中飛車', '向かい飛車',
      '右玉', '棒銀', '早繰り銀', 'エルモ急戦', '地下鉄飛車',
      '相入玉', '腰掛け銀',
    ],
  },
  {
    id: 'study',
    label: '研究・目的',
    icon: '📖',
    tags: ['研究', 'マイ定跡', '詰み研究', '序盤研究', '終盤の妙手', '愛用定跡', '反省対局', '要復習'],
  },
];

/**
 * Tailors `source` and `tournament` tag groups for a specific `KifuGameKind`,
 * while always preserving any user-added custom tags or currently selected tags.
 */
export function filterTagGroupsByGameKind(
  groups: TagCategoryGroup[],
  gameKind?: 'all' | KifuGameKind,
  selectedTags: string[] = []
): TagCategoryGroup[] {
  if (!gameKind || gameKind === 'all' || gameKind === 'joseki' || gameKind === 'other') {
    return groups;
  }

  const allBuiltinSet = new Set(STRUCTURED_TAG_GROUPS.flatMap((g) => g.tags));
  const selectedSet = new Set(selectedTags);

  return groups.map((group) => {
    const allowedPreset =
      group.id === 'source'
        ? SOURCE_TAGS_BY_GAME_KIND[gameKind]
        : group.id === 'tournament'
          ? TOURNAMENT_TAGS_BY_GAME_KIND[gameKind]
          : undefined;

    if (!allowedPreset) {
      return group;
    }

    const presetSet = new Set(allowedPreset);
    const filtered = group.tags.filter(
      (tag) =>
        presetSet.has(tag) ||
        selectedSet.has(tag) ||
        !allBuiltinSet.has(tag)
    );

    // Ensure every preset tag for the chosen gameKind is present in preferred order
    const existingSet = new Set(filtered);
    const orderedPresets = allowedPreset.filter((tag) => existingSet.has(tag));
    const extras = filtered.filter((tag) => !presetSet.has(tag));

    return {
      ...group,
      tags: [...orderedPresets, ...extras],
    };
  });
}
