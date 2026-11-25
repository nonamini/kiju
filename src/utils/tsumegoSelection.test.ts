import { describe, expect, it } from 'vitest';
import type { TsumegoProblem } from '../types/tsumego';
import {
  TSUMEGO_PLY_FILTER_OPTIONS,
  filterTsumegoByPly,
  pickNextTsumegoProblem,
} from './tsumegoSelection';

function makeProblem(id: string, moveLimit: number): TsumegoProblem {
  return {
    id,
    title: `Problem ${id}`,
    source: 'manual',
    kind: 'attack',
    startSfen: '4k4/9/4P4/9/9/9/9/9/9 b G 1',
    sideToMove: 'b',
    moveLimit,
    solutionPv: ['G*5b'],
    tags: [],
    createdAt: 1000,
  };
}

describe('filterTsumegoByPly', () => {
  const sample: TsumegoProblem[] = [
    makeProblem('p1', 1),
    makeProblem('p3', 3),
    makeProblem('p5', 5),
    makeProblem('p7', 7),
    makeProblem('p9', 9),
    makeProblem('p11', 11),
    makeProblem('p13', 13),
    makeProblem('p15', 15),
  ];

  it('exposes the approved fixed ply filter buckets', () => {
    expect(TSUMEGO_PLY_FILTER_OPTIONS).toEqual(['all', 1, 3, 5, 7, 9, 11, '13+']);
  });

  it('returns all problems for "all" and exact matches for numeric plies 1..11', () => {
    expect(filterTsumegoByPly(sample, 'all')).toHaveLength(8);
    expect(filterTsumegoByPly(sample, 1).map((p) => p.id)).toEqual(['p1']);
    expect(filterTsumegoByPly(sample, 3).map((p) => p.id)).toEqual(['p3']);
    expect(filterTsumegoByPly(sample, 5).map((p) => p.id)).toEqual(['p5']);
    expect(filterTsumegoByPly(sample, 7).map((p) => p.id)).toEqual(['p7']);
    expect(filterTsumegoByPly(sample, 9).map((p) => p.id)).toEqual(['p9']);
    expect(filterTsumegoByPly(sample, 11).map((p) => p.id)).toEqual(['p11']);
  });

  it('matches 13 or more plies for "13+"', () => {
    expect(filterTsumegoByPly(sample, '13+').map((p) => p.id)).toEqual([
      'p13',
      'p15',
    ]);
  });
});

describe('pickNextTsumegoProblem', () => {
  const items = [makeProblem('a', 3), makeProblem('b', 3), makeProblem('c', 3)];

  it('returns null on empty filtered list', () => {
    expect(pickNextTsumegoProblem([], 'a', false)).toBeNull();
    expect(pickNextTsumegoProblem([], 'a', true)).toBeNull();
  });

  it('advances sequentially and wraps around when random is false', () => {
    expect(pickNextTsumegoProblem(items, null, false)?.id).toBe('a');
    expect(pickNextTsumegoProblem(items, 'unknown', false)?.id).toBe('a');
    expect(pickNextTsumegoProblem(items, 'a', false)?.id).toBe('b');
    expect(pickNextTsumegoProblem(items, 'c', false)?.id).toBe('a');
  });

  it('excludes currentId in random mode when multiple items exist', () => {
    expect(pickNextTsumegoProblem(items, 'b', true, () => 0)?.id).toBe('a');
    expect(pickNextTsumegoProblem(items, 'b', true, () => 0.99)?.id).toBe('c');
    expect(pickNextTsumegoProblem([items[0]!], 'a', true, () => 0)?.id).toBe('a');
  });
});
