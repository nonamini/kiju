import { describe, expect, it } from 'vitest';
import { JKFPlayer } from 'json-kifu-format';
import { extractOpeningLineFromJkf } from './kifuOpeningLine';
import { toMetadataOnlyRecord } from './kifuPayloadCache';
import { KifuRecord } from '../types/kifuRecord';

describe('extractOpeningLineFromJkf', () => {
  it('extracts mainline USI, readable Japanese move, and SFEN up to maxPly', () => {
    const kif = '手合割：平手\n1 ７六歩(77)\n2 ３四歩(33)\n3 ２六歩(27)\n4 ８四歩(83)\n';
    const player = JKFPlayer.parseKIF(kif);
    const jkfJson = JSON.stringify(player.kifu);

    const line = extractOpeningLineFromJkf(jkfJson, 2);
    expect(line).toHaveLength(2);
    expect(line[0]?.usi).toBe('7g7f');
    expect(line[0]?.japaneseMove).toContain('７六歩');
    expect(line[0]?.sfen).toBeTruthy();
    expect(line[1]?.usi).toBe('3c3d');
  });

  it('returns empty array for empty or invalid jkfJson', () => {
    expect(extractOpeningLineFromJkf(undefined)).toEqual([]);
    expect(extractOpeningLineFromJkf('{}')).toEqual([]);
    expect(extractOpeningLineFromJkf('{bad')).toEqual([]);
  });
});

describe('toMetadataOnlyRecord', () => {
  it('strips heavy payload fields while preserving metadata and openingLine', () => {
    const full: KifuRecord = {
      id: 'g1',
      title: 'Sample',
      contentHash: 'abc',
      source: 'studio',
      senteName: 'Sente',
      goteName: 'Gote',
      openingId: 'other',
      openingName: 'Other',
      totalPlies: 2,
      jkfJson: '{"header":{},"moves":[{},{}]}',
      rawKif: '1 ７六歩(77)',
      tags: ['test'],
      evaluations: { 1: { scoreCp: 20, depth: 10, evaluatedAt: '2026-11-14T00:00:00.000Z' } },
      positionSfens: ['sfen0', 'sfen1'],
      openingLine: [{ usi: '7g7f', japaneseMove: '▲７六歩', sfen: 'sfen1' }],
      isIncludedInTree: true,
      createdAt: '2026-11-14T00:00:00.000Z',
      updatedAt: '2026-11-14T00:00:00.000Z',
    };

    const meta = toMetadataOnlyRecord(full);
    expect(meta.jkfJson).toBe('{}');
    expect(meta.rawKif).toBeUndefined();
    expect(meta.evaluations).toBeUndefined();
    expect(meta.positionSfens).toBeUndefined();
    expect(meta.openingLine).toEqual(full.openingLine);
    expect(meta.title).toBe('Sample');
  });
});
