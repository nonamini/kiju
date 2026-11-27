import { describe, expect, it } from 'vitest';
import type { TacticalQuizCard } from '../types/quiz';
import type { TsumegoProblem } from '../types/tsumego';
import {
  itemMatchesPackFilter,
  listPackSummaries,
  mergeImportedQuizPack,
  mergeImportedTsumegoPack,
  parseProblemPackJson,
  serializeQuizPack,
  serializeTsumegoPack,
  UNCATEGORIZED_PACK_KEY,
} from './problemPack';

function makeTsumego(id: string, packName?: string): TsumegoProblem {
  return {
    id,
    title: `Tsumego ${id}`,
    source: 'manual',
    kind: 'attack',
    startSfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
    sideToMove: 'b',
    moveLimit: 3,
    solutionPv: ['2g2f', '3c3d', '2f2e'],
    tags: ['3手詰'],
    packName,
    createdAt: 1700000000000,
  };
}

function makeQuiz(id: string, packName?: string): TacticalQuizCard {
  return {
    id,
    title: `Quiz ${id}`,
    source: 'manual',
    sourceGameId: 'manual',
    openingId: 'yagura',
    type: 'attack',
    ply: 0,
    startSfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
    usiMovesToPosition: [],
    sideToMove: 'b',
    bestMove: '2g2f',
    pv: ['2g2f'],
    scoreCpBefore: 120,
    isEnabled: true,
    packName,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

describe('problemPack (Issue #13)', () => {
  it('summarizes and filters items by pack name and uncategorized', () => {
    const items = [
      makeTsumego('1', '3手詰パック'),
      makeTsumego('2', ' 3手詰パック '),
      makeTsumego('3', '矢倉崩し手筋集'),
      makeTsumego('4'),
    ];

    const summary = listPackSummaries(items);
    expect(summary.uncategorizedCount).toBe(1);
    expect(summary.packs).toEqual([
      { name: '3手詰パック', count: 2 },
      { name: '矢倉崩し手筋集', count: 1 },
    ]);

    expect(itemMatchesPackFilter(items[0]?.packName, '3手詰パック')).toBe(true);
    expect(itemMatchesPackFilter(items[3]?.packName, UNCATEGORIZED_PACK_KEY)).toBe(
      true
    );
    expect(itemMatchesPackFilter(items[0]?.packName, UNCATEGORIZED_PACK_KEY)).toBe(
      false
    );
  });

  it('roundtrips tsumego pack export and import merge without duplicates', () => {
    const t1 = makeTsumego('t1');
    const json = serializeTsumegoPack('3手詰パック', [t1]);
    const parsed = parseProblemPackJson(json);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe('tsumego');
    expect(parsed?.tsumegoProblems?.[0]?.packName).toBe('3手詰パック');

    const existing = [makeTsumego('existing-1', '別パック')];
    const firstMerge = mergeImportedTsumegoPack(existing, parsed!);
    expect(firstMerge.addedCount).toBe(1);
    expect(firstMerge.updatedCount).toBe(0);
    expect(firstMerge.next).toHaveLength(2);

    const secondMerge = mergeImportedTsumegoPack(firstMerge.next, parsed!);
    expect(secondMerge.addedCount).toBe(0);
    expect(secondMerge.updatedCount).toBe(1);
    expect(secondMerge.next).toHaveLength(2);
  });

  it('roundtrips quiz pack export and import merge and rejects invalid JSON', () => {
    const q1 = makeQuiz('q1', '矢倉崩し手筋集');
    const json = serializeQuizPack('矢倉崩し手筋集', [q1]);
    const parsed = parseProblemPackJson(json);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe('quiz');

    const merged = mergeImportedQuizPack([], parsed!);
    expect(merged.addedCount).toBe(1);
    expect(merged.next[0]?.packName).toBe('矢倉崩し手筋集');

    expect(parseProblemPackJson('{"foo":"bar"}')).toBeNull();
    expect(parseProblemPackJson('not-json')).toBeNull();
  });
});
