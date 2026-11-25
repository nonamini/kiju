import { describe, it, expect } from 'vitest';
import { computeKifuPositionSfens } from './kifuPositionSfens';
import { KifuRecord } from '../types/kifuRecord';
import { JKFPlayer } from 'json-kifu-format';

const KIF = `#KIF version=2.0
棋戦：テスト
手合割：平手
先手：甲
後手：乙
手数----指手---------消費時間--
   1 ７六歩(77)        ( 0:00/00:00:00)
   2 ３四歩(33)        ( 0:00/00:00:00)
   3 ２六歩(27)        ( 0:00/00:00:00)
   4 ４四歩(43)        ( 0:00/00:00:00)
まで4手で中断`;

function makeRecord(jkfJson: string): KifuRecord {
  return {
    id: 'r1',
    title: 't',
    contentHash: 'h',
    source: 'studio',
    senteName: '甲',
    goteName: '乙',
    openingId: 'other',
    openingName: 'o',
    totalPlies: 4,
    jkfJson,
    tags: [],
    isIncludedInTree: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('computeKifuPositionSfens', () => {
  it('returns initial + one sfen per ply for a 4-move game', () => {
    const jkf = JKFPlayer.parseKIF(KIF).kifu;
    const sfens = computeKifuPositionSfens(makeRecord(JSON.stringify(jkf)));
    expect(sfens).not.toBeNull();
    expect(sfens).toHaveLength(5); // index 0..4
    // Initial position is the standard hirate sfen
    expect(sfens?.[0]).toContain('lnsgkgsnl');
    // After 1 ply (7g7f), turn passes to white (gote) and board changed
    expect(sfens?.[1]).not.toBe(sfens?.[0]);
    expect(sfens?.[1]).toMatch(/\sw\s/);
    // All entries are valid sfen strings with 4 fields
    for (const s of sfens ?? []) {
      expect(s.split(/\s+/).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('falls back to rawKif when jkfJson is empty placeholder', () => {
    const record: KifuRecord = {
      ...makeRecord('{}'),
      rawKif: KIF,
    };
    const sfens = computeKifuPositionSfens(record);
    expect(sfens).not.toBeNull();
    expect(sfens).toHaveLength(5);
    expect(sfens?.[0]).toContain('lnsgkgsnl');
  });

  it('returns null for unparseable jkfJson', () => {
    expect(computeKifuPositionSfens(makeRecord('{"moves":"bad"}'))).toBeNull();
    expect(computeKifuPositionSfens(makeRecord('not json'))).toBeNull();
    expect(computeKifuPositionSfens(makeRecord('{}'))).toBeNull();
  });
});
