import { beforeEach, describe, expect, it } from 'vitest';
import type { ShogiPlayerProfile } from '../types/player';
import {
  inferAutoKifuTags,
  inferGameKind,
  isOwnerProfile,
  migrateCustomTacticsToJosekiRecords,
  reclassifyAndAutoTagAllRecords,
} from './gameKindClassifier';
import {
  DELETED_KIFU_IDS_KEY,
  KIFU_RECORDS_STORAGE_KEY,
  loadKifuRecords,
  saveKifuRecords,
} from './kifuRecordStorage';
import { getSafeStorage } from './matchHistoryStorage';
import { saveTacticsItem, TACTICS_STORAGE_KEY } from './tacticsStorage';
import {
  createTagDefinition,
  loadTagRegistry,
  TAG_REGISTRY_STORAGE_KEY,
} from './tagRegistryStorage';

const now = '2026-11-16T00:00:00.000Z';

const PROFILES: ShogiPlayerProfile[] = [
  {
    id: 'user-main',
    name: 'あなた',
    category: 'user',
    isOwner: true,
    aliases: ['自分'],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'ai-fs',
    name: 'Fairy-Stockfish 14',
    category: 'ai',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'pro-fujii',
    name: '藤井聡太',
    category: 'pro',
    aliases: ['藤井聡太 竜王・名人'],
    createdAt: now,
    updatedAt: now,
  },
];

describe('gameKindClassifier (Issue #71)', () => {
  it('identifies owner profile via isOwner or user category', () => {
    expect(isOwnerProfile(PROFILES[0])).toBe(true);
    expect(isOwnerProfile(PROFILES[1])).toBe(false);
    expect(isOwnerProfile(PROFILES[2])).toBe(false);
  });

  it('infers self when an owner profile is involved (including sparring vs AI)', () => {
    expect(
      inferGameKind(
        {
          sentePlayerId: 'user-main',
          gotePlayerId: 'ai-fs',
          senteName: 'あなた',
          goteName: 'Fairy-Stockfish 14',
          tags: [],
        },
        PROFILES
      )
    ).toBe('self');

    expect(
      inferGameKind(
        {
          senteName: '自分',
          goteName: 'Opponent',
          tags: [],
        },
        PROFILES
      )
    ).toBe('self');
  });

  it('infers pro when a registered pro player or pro tournament/tag is present', () => {
    expect(
      inferGameKind(
        {
          sentePlayerId: 'pro-fujii',
          senteName: '藤井聡太',
          goteName: '伊藤匠',
          tags: [],
        },
        PROFILES
      )
    ).toBe('pro');

    expect(
      inferGameKind(
        {
          senteName: 'Unknown A',
          goteName: 'Unknown B',
          tournament: '第84期名人戦',
          tags: [],
        },
        PROFILES
      )
    ).toBe('pro');

    expect(
      inferGameKind(
        {
          senteName: 'Unknown A',
          goteName: 'Unknown B',
          tags: ['プロ公式'],
        },
        PROFILES
      )
    ).toBe('pro');
  });

  it('defaults to other when neither owner nor pro signals exist', () => {
    expect(
      inferGameKind(
        {
          senteName: 'Amateur A',
          goteName: 'Amateur B',
          tournament: 'Local Club',
          tags: [],
        },
        PROFILES
      )
    ).toBe('other');
  });

  it('infers ladies for women tournaments or two Joryu players', () => {
    expect(
      inferGameKind(
        {
          senteName: '渡部愛',
          goteName: '小野花依',
          tournament: '第7期清麗戦',
          tags: [],
        },
        PROFILES
      )
    ).toBe('ladies');

    expect(
      inferGameKind(
        {
          senteName: '西山朋佳 女流四冠',
          goteName: '福間香奈 女流五冠',
          tags: [],
        },
        PROFILES
      )
    ).toBe('ladies');
  });

  it('infers amateur for Shoreikai and amateur tournaments', () => {
    expect(
      inferGameKind(
        {
          senteName: '田中太郎',
          goteName: '佐藤花子',
          tournament: '第76回奨励会三段リーグ',
          tags: [],
        },
        PROFILES
      )
    ).toBe('amateur');

    expect(
      inferGameKind(
        {
          senteName: '鈴木一郎 アマ',
          goteName: '高橋二郎',
          tags: [],
        },
        PROFILES
      )
    ).toBe('amateur');
  });

  it('generates canonical gameKind and structured tags without custom プロ公式戦', () => {
    const ladiesResult = inferAutoKifuTags(
      {
        senteName: '渡部愛 女流四段',
        goteName: '小野花依 女流2級',
        tournament: '清麗戦',
        openingName: '相掛かり',
      },
      PROFILES
    );
    expect(ladiesResult.gameKind).toBe('ladies');
    expect(ladiesResult.tags).toEqual(['研究', '女流公式', '清麗戦', '相掛かり']);
    expect(ladiesResult.tags).not.toContain('プロ公式戦');

    const proResult = inferAutoKifuTags(
      {
        senteName: '藤井聡太 竜王・名人',
        goteName: '永瀬拓矢 九段',
        tournament: '第84期順位戦A級',
        openingName: '角換わり腰掛け銀',
      },
      PROFILES
    );
    expect(proResult.gameKind).toBe('pro');
    expect(proResult.tags).toContain('プロ公式');
    expect(proResult.tags).toContain('順位戦');
    expect(proResult.tags).toContain('角換わり');
    expect(proResult.tags).not.toContain('プロ公式戦');
  });

  describe('reclassifyAndAutoTagAllRecords', () => {
    beforeEach(() => {
      const storage = getSafeStorage();
      storage.removeItem(KIFU_RECORDS_STORAGE_KEY);
      storage.removeItem(TAG_REGISTRY_STORAGE_KEY);
    });

    it('migrates legacy records with プロ公式戦 / 女流清麗戦 into canonical gameKind & tags', () => {
      const legacyPro = createTagDefinition('プロ公式戦', 'custom');
      const legacySeirei = createTagDefinition('女流清麗戦', 'custom');
      saveKifuRecords([
        {
          id: 'legacy-1',
          title: '渡部愛 女流四段 vs 小野花依 女流2級 (清麗戦・相掛かり)',
          contentHash: 'h-legacy-1',
          source: 'studio',
          senteName: '渡部愛 女流四段',
          goteName: '小野花依 女流2級',
          openingId: 'aigakari',
          openingName: '相掛かり',
          totalPlies: 90,
          jkfJson: '{}',
          gameKind: 'pro',
          tagIds: [legacyPro.id, legacySeirei.id],
          tags: ['プロ公式戦', '女流清麗戦'],
          isIncludedInTree: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'legacy-2',
          title: '藤井聡太 竜王・名人 vs 永瀬拓矢 九段 (第84期順位戦)',
          contentHash: 'h-legacy-2',
          source: 'import',
          senteName: '藤井聡太 竜王・名人',
          goteName: '永瀬拓矢 九段',
          openingId: 'kakugawari',
          openingName: '角換わり',
          totalPlies: 110,
          jkfJson: '{}',
          gameKind: 'other',
          tagIds: [legacyPro.id],
          tags: ['プロ公式戦'],
          isIncludedInTree: false,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const result = reclassifyAndAutoTagAllRecords();
      expect(result.updatedRecords).toBe(2);
      expect(result.mergedTags).toBe(2);

      const records = loadKifuRecords();
      const rec1 = records.find((r) => r.id === 'legacy-1')!;
      expect(rec1.gameKind).toBe('ladies');
      expect(rec1.tags).toContain('女流公式');
      expect(rec1.tags).toContain('清麗戦');
      expect(rec1.tags).toContain('相掛かり');
      expect(rec1.tags).not.toContain('プロ公式戦');
      expect(rec1.tags).not.toContain('プロ公式');

      const rec2 = records.find((r) => r.id === 'legacy-2')!;
      expect(rec2.gameKind).toBe('pro');
      expect(rec2.tags).toContain('プロ公式');
      expect(rec2.tags).toContain('順位戦');
      expect(rec2.tags).toContain('角換わり');
      expect(rec2.tags).not.toContain('プロ公式戦');

      const registryNames = loadTagRegistry().map((d) => d.name);
      expect(registryNames).not.toContain('プロ公式戦');
      expect(registryNames).not.toContain('女流清麗戦');
    });

    it('reclassifies tactic/joseki records to joseki and generic study records to other while clearing placeholder player refs', () => {
      const storage = getSafeStorage();
      storage.removeItem(TACTICS_STORAGE_KEY);
      storage.removeItem(DELETED_KIFU_IDS_KEY);

      saveKifuRecords([
        {
          id: 'tactic_game_hakoiri',
          title: '箱入り娘',
          contentHash: 'h-tactic-1',
          source: 'studio',
          senteName: '先手',
          goteName: '後手',
          sentePlayerId: 'bogus-sente-id',
          gotePlayerId: 'bogus-gote-id',
          openingId: 'tactic',
          openingName: '箱入り娘',
          totalPlies: 28,
          jkfJson: '{}',
          gameKind: 'pro',
          tags: ['プロ公式'],
          isIncludedInTree: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'custom_pos_study_1',
          title: '終盤研究1',
          contentHash: 'h-study-1',
          source: 'studio',
          senteName: '先手',
          goteName: '後手',
          openingId: 'unknown',
          openingName: '',
          totalPlies: 0,
          jkfJson: '{}',
          gameKind: 'other',
          tags: ['登録局面'],
          isIncludedInTree: false,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const result = reclassifyAndAutoTagAllRecords();
      expect(result.updatedRecords).toBe(2);

      const records = loadKifuRecords();
      const tacticRec = records.find((r) => r.id === 'tactic_game_hakoiri')!;
      expect(tacticRec.gameKind).toBe('joseki');
      expect(tacticRec.sentePlayerId).toBeUndefined();
      expect(tacticRec.gotePlayerId).toBeUndefined();
      expect(tacticRec.tags).toContain('定跡');
      expect(tacticRec.tags).not.toContain('プロ公式');

      const studyRec = records.find((r) => r.id === 'custom_pos_study_1')!;
      expect(studyRec.gameKind).toBe('other');
      expect(studyRec.tags).toContain('研究');
    });

    it('migrates custom tactics items with sfen into joseki KifuRecords', () => {
      const storage = getSafeStorage();
      storage.removeItem(TACTICS_STORAGE_KEY);
      storage.removeItem(DELETED_KIFU_IDS_KEY);
      saveKifuRecords([]);

      saveTacticsItem({
        id: 'custom_tactic_12345',
        category: 'custom',
        title: 'Custom Joseki Pos',
        tag: '角換わり',
        summary: 'Test custom tactic',
        sfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
        isCustom: true,
        updatedAt: now,
      });

      const migrated = migrateCustomTacticsToJosekiRecords();
      expect(migrated).toBe(1);
      const records = loadKifuRecords();
      expect(records).toHaveLength(1);
      expect(records[0]!.id).toBe('tactic_game_custom_tactic_12345');
      expect(records[0]!.gameKind).toBe('joseki');
      expect(records[0]!.tags).toContain('定跡');

      // Second call skips duplicate
      expect(migrateCustomTacticsToJosekiRecords()).toBe(0);
    });
  });
});
