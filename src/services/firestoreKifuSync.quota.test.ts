import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase/firestore/lite';
import type { KifuRecord } from '../types/kifuRecord';

interface MockConstraint {
  field: string;
  op: string;
  value: string;
}

interface MockCollectionTarget {
  kind: 'col';
  colName: string;
}

interface MockQueryTarget {
  kind: 'query';
  colName: string;
  constraints: MockConstraint[];
}

type MockTarget = MockCollectionTarget | MockQueryTarget;

interface RecordedGetDocsCall {
  colName: string;
  isIncremental: boolean;
  cursorValue?: string;
}

const getDocsCalls: RecordedGetDocsCall[] = [];
const batchSetCalls: Array<{ path: string; data: unknown }> = [];
const cloudGamesDocs = new Map<string, Record<string, unknown>>();

vi.mock('./firebase', () => ({
  getDb: (): Firestore => ({}) as Firestore,
}));

vi.mock('firebase/firestore/lite', () => {
  return {
    collection: (
      _db: unknown,
      _users: string,
      _uid: string,
      colName: string
    ): MockCollectionTarget => ({
      kind: 'col',
      colName,
    }),
    where: (field: string, op: string, value: string): MockConstraint => ({
      field,
      op,
      value,
    }),
    query: (
      target: MockCollectionTarget,
      ...constraints: MockConstraint[]
    ): MockQueryTarget => ({
      kind: 'query',
      colName: target.colName,
      constraints,
    }),
    doc: (_db: unknown, ...segments: string[]): { path: string } => ({
      path: segments.join('/'),
    }),
    getDoc: vi.fn().mockResolvedValue({
      exists: () => false,
      data: () => undefined,
    }),
    setDoc: vi.fn().mockResolvedValue(undefined),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    writeBatch: vi.fn(() => ({
      set: vi.fn((ref: { path: string }, data: unknown) => {
        batchSetCalls.push({ path: ref.path, data });
      }),
      commit: vi.fn().mockResolvedValue(undefined),
    })),
    getDocs: vi.fn(async (target: MockTarget) => {
      const constraints = target.kind === 'query' ? target.constraints : [];
      const updatedConstraint = constraints.find(
        (c) => c.field === 'updatedAt' && c.op === '>'
      );
      getDocsCalls.push({
        colName: target.colName,
        isIncremental: Boolean(updatedConstraint),
        cursorValue: updatedConstraint?.value,
      });

      const docs: Array<{ id: string; data: () => Record<string, unknown> }> = [];
      if (target.colName === 'games') {
        cloudGamesDocs.forEach((docData, id) => {
          const updatedAt =
            typeof docData.updatedAt === 'string' ? docData.updatedAt : '';
          if (updatedConstraint && updatedAt <= updatedConstraint.value) {
            return;
          }
          docs.push({
            id,
            data: () => docData,
          });
        });
      }
      return {
        forEach: (
          cb: (doc: { id: string; data: () => Record<string, unknown> }) => void
        ) => {
          docs.forEach(cb);
        },
      };
    }),
  };
});

import {
  clearSyncCursors,
  syncKifuRecordsWithCloud,
  syncTacticsWithCloud,
} from './firestoreKifuSync';
import { saveKifuRecord, saveKifuRecords } from '../utils/kifuRecordStorage';
import { saveAllTacticsItems, saveTacticsItem } from '../utils/tacticsStorage';
import { getSafeStorage } from '../utils/matchHistoryStorage';

function makeSampleRecord(id: string, updatedAt: string): KifuRecord {
  return {
    id,
    title: `Game ${id}`,
    contentHash: `hash-${id}`,
    source: 'studio',
    senteName: 'Sente',
    goteName: 'Gote',
    openingId: 'other',
    openingName: 'Other',
    winner: 'sente',
    totalPlies: 20,
    jkfJson: '{"header":{},"moves":[{}]}',
    tags: [],
    isIncludedInTree: true,
    createdAt: '2026-11-23T08:00:00.000Z',
    updatedAt,
  };
}

describe('firestoreKifuSync read-quota optimizations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-23T09:00:00.000Z'));
    getSafeStorage().clear();
    saveKifuRecords([]);
    clearSyncCursors();
    getDocsCalls.length = 0;
    batchSetCalls.length = 0;
    cloudGamesDocs.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('queries games only once per sync instead of performing a duplicate push scan', async () => {
    const rec = makeSampleRecord('g1', '2026-11-23T08:00:00.000Z');
    cloudGamesDocs.set('g1', {
      ...rec,
      recordSchema: 1,
    });

    const res = await syncKifuRecordsWithCloud('user-1', { mode: 'manual' });
    expect(res.pulled).toBe(1);

    const gamesCalls = getDocsCalls.filter((c) => c.colName === 'games');
    expect(gamesCalls).toHaveLength(1);
    expect(gamesCalls[0]?.isIncremental).toBe(false);
    expect(getDocsCalls).toHaveLength(6);
  });

  it('skips Firestore reads in auto mode during cooldown windows', async () => {
    await syncKifuRecordsWithCloud('user-1', { mode: 'auto' });
    expect(getDocsCalls).toHaveLength(6);

    getDocsCalls.length = 0;
    vi.advanceTimersByTime(60_000); // 1 minute later (within 5m full & 2m tactics cooldown)

    const skippedFull = await syncKifuRecordsWithCloud('user-1', { mode: 'auto' });
    expect(skippedFull).toEqual({ pulled: 0, pushed: 0, migrated: 0 });
    expect(getDocsCalls).toHaveLength(0);

    const skippedTactics = await syncTacticsWithCloud('user-1', { mode: 'auto' });
    expect(skippedTactics).toEqual({ pulled: 0, pushed: 0 });
    expect(getDocsCalls).toHaveLength(0);
  });

  it('uses incremental updatedAt cursor queries and avoids re-uploading unchanged local records', async () => {
    const g1 = makeSampleRecord('g1', '2026-11-23T08:00:00.000Z');
    cloudGamesDocs.set('g1', {
      ...g1,
      recordSchema: 1,
    });

    await syncKifuRecordsWithCloud('user-1', { mode: 'manual' });

    getDocsCalls.length = 0;
    batchSetCalls.length = 0;
    vi.advanceTimersByTime(6 * 60_000); // 09:06:00Z

    const incrementalIdle = await syncKifuRecordsWithCloud('user-1', {
      mode: 'manual',
    });
    expect(incrementalIdle).toEqual({ pulled: 0, pushed: 0, migrated: 0 });
    expect(getDocsCalls).toHaveLength(6);
    expect(getDocsCalls.every((c) => c.isIncremental)).toBe(true);
    expect(batchSetCalls.filter((b) => b.path.includes('/games/'))).toHaveLength(0);

    // Create a brand new local record at 09:07:00Z -> incremental sync must push only g2
    vi.advanceTimersByTime(60_000); // 09:07:00Z
    saveKifuRecord(makeSampleRecord('g2', '2026-11-23T09:07:00.000Z'));

    getDocsCalls.length = 0;
    batchSetCalls.length = 0;
    vi.advanceTimersByTime(60_000); // 09:08:00Z

    const incrementalPush = await syncKifuRecordsWithCloud('user-1', {
      mode: 'manual',
    });
    expect(incrementalPush.pushed).toBe(1);
    const pushedGamePaths = batchSetCalls
      .filter((b) => b.path.includes('/games/'))
      .map((b) => b.path);
    expect(pushedGamePaths).toEqual(['users/user-1/games/g2']);
  });

  it('deduplicates concurrent in-flight sync calls for the same user', async () => {
    const [r1, r2] = await Promise.all([
      syncKifuRecordsWithCloud('user-1', { mode: 'manual' }),
      syncKifuRecordsWithCloud('user-1', { mode: 'manual' }),
    ]);

    expect(r1).toEqual(r2);
    expect(getDocsCalls.filter((c) => c.colName === 'games')).toHaveLength(1);
  });

  it('pushes only newly updated custom tactics items during incremental sync', async () => {
    saveAllTacticsItems([
      {
        id: 'tactic-old',
        category: 'custom',
        title: 'Old Tactic',
        tag: 'Test',
        summary: 'Old summary',
        isCustom: true,
        updatedAt: '2026-11-23T08:00:00.000Z',
      },
    ]);

    const first = await syncTacticsWithCloud('user-1', { mode: 'manual' });
    expect(first.pushed).toBe(1);

    getDocsCalls.length = 0;
    batchSetCalls.length = 0;
    vi.advanceTimersByTime(3 * 60_000); // 09:03:00Z

    const idle = await syncTacticsWithCloud('user-1', { mode: 'manual' });
    expect(idle.pushed).toBe(0);
    expect(getDocsCalls).toHaveLength(1);
    expect(getDocsCalls[0]?.isIncremental).toBe(true);

    vi.advanceTimersByTime(60_000); // 09:04:00Z
    saveTacticsItem({
      id: 'tactic-new',
      category: 'custom',
      title: 'New Tactic',
      tag: 'Test',
      summary: 'New summary',
    });

    batchSetCalls.length = 0;
    vi.advanceTimersByTime(60_000); // 09:05:00Z
    const second = await syncTacticsWithCloud('user-1', { mode: 'manual' });
    expect(second.pushed).toBe(1);
    expect(batchSetCalls.map((b) => b.path)).toEqual([
      'users/user-1/tactics/tactic-new',
    ]);
  });
});
