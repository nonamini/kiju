import { describe, it, expect } from 'vitest';
import {
  aggregatePlayerOpeningTendency,
  classifyOpeningFamily,
} from './playerOpeningTendency';
import type { ShogiPlayerProfile } from '../types/player';
import type { KifuRecord } from '../types/kifuRecord';

function makeRecord(id: string, openingName: string, senteId: string): KifuRecord {
  return {
    id,
    title: id,
    source: 'import',
    senteName: 'PlayerA',
    goteName: 'PlayerB',
    sentePlayerId: senteId,
    gotePlayerId: 'other',
    winner: 'sente',
    totalPlies: 100,
    openingId: openingName,
    openingName,
    contentHash: `hash-${id}`,
    jkfJson: '{}',
    isIncludedInTree: false,
    tags: [],
    favorite: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('playerOpeningTendency', () => {
  it('classifies Ibisha and Furibisha openings accurately', () => {
    expect(classifyOpeningFamily('相掛かり')).toBe('ibisha');
    expect(classifyOpeningFamily('角換わり腰掛け銀')).toBe('ibisha');
    expect(classifyOpeningFamily('対振り飛車')).toBe('ibisha');
    expect(classifyOpeningFamily('四間飛車')).toBe('furibisha');
    expect(classifyOpeningFamily('ゴキゲン中飛車')).toBe('furibisha');
  });

  it('aggregates player opening tendency percentages', () => {
    const player: ShogiPlayerProfile = {
      id: 'p1',
      name: 'PlayerA',
      category: 'pro',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const records = [
      makeRecord('1', '相掛かり', 'p1'),
      makeRecord('2', '相掛かり', 'p1'),
      makeRecord('3', '矢倉', 'p1'),
      makeRecord('4', '四間飛車', 'p1'),
    ];
    const result = aggregatePlayerOpeningTendency(player, records);
    expect(result.ibishaRatio).toBe(75);
    expect(result.furibishaRatio).toBe(25);
    expect(result.ibishaDetails[0]).toEqual({ name: '相掛かり', percentage: 50 });
    expect(result.ibishaDetails[1]).toEqual({ name: '矢倉', percentage: 25 });
    expect(result.furibishaDetails[0]).toEqual({ name: '四間飛車', percentage: 25 });
  });
});
