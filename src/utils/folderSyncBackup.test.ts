import { describe, it, expect, beforeEach } from 'vitest';
import {
  exportFullBackupBundle,
  mergeFullBackupBundle,
  getFolderSyncOptions,
  saveFolderSyncOptions,
} from './folderSyncBackup';
import { saveKifuRecords, loadKifuRecords } from './kifuRecordStorage';
import { clearQuizPool, loadQuizPool, saveQuizPool } from './quizPoolStorage';
import {
  clearTsumegoStorage,
  loadAllTsumegoAttempts,
  loadTsumegoProblems,
  recordTsumegoAttempt,
  saveTsumegoProblems,
} from './tsumegoStorage';
import { KifuRecord } from '../types/kifuRecord';
import { TacticalQuizCard } from '../types/quiz';
import { TsumegoProblem } from '../types/tsumego';

function makeRecord(id: string, title: string, updatedAt: string): KifuRecord {
  return {
    id,
    title,
    contentHash: id,
    source: 'studio',
    senteName: 'Sente',
    goteName: 'Gote',
    openingId: 'unknown',
    openingName: '',
    totalPlies: 1,
    jkfJson: '{}',
    tags: [],
    isIncludedInTree: false,
    createdAt: '2026-11-19T00:00:00.000Z',
    updatedAt,
  };
}

function makeTsumego(id: string, title: string, updatedAt: string): TsumegoProblem {
  return {
    id,
    title,
    source: 'manual',
    kind: 'attack',
    startSfen: '4k4/9/4P4/9/9/9/9/9/9 b G 1',
    sideToMove: 'b',
    moveLimit: 1,
    solutionPv: ['G*5b'],
    tags: ['1手詰'],
    createdAt: 1000,
    updatedAt,
  };
}

function makeQuizCard(id: string, title: string, updatedAt: string): TacticalQuizCard {
  return {
    id,
    title,
    source: 'manual',
    sourceGameId: 'manual',
    openingId: 'manual',
    type: 'attack',
    ply: 0,
    startSfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
    usiMovesToPosition: [],
    sideToMove: 'b',
    bestMove: '7g7f',
    pv: ['7g7f'],
    scoreCpBefore: 0,
    isEnabled: true,
    createdAt: '2026-11-19T00:00:00.000Z',
    updatedAt,
  };
}

describe('folderSyncBackup', () => {
  beforeEach(() => {
    saveKifuRecords([]);
    clearTsumegoStorage();
    clearQuizPool();
  });

  it('merges newer incoming records and preserves newer local records', () => {
    saveKifuRecords([
      makeRecord('k1', 'Local Older', '2026-11-19T01:00:00.000Z'),
      makeRecord('k2', 'Local Newer', '2026-11-19T05:00:00.000Z'),
    ]);

    const res = mergeFullBackupBundle({
      version: 1,
      exportedAt: '2026-11-19T06:00:00.000Z',
      appName: 'joseki-tree',
      kifuRecords: [
        makeRecord('k1', 'Incoming Newer', '2026-11-19T03:00:00.000Z'),
        makeRecord('k2', 'Incoming Older', '2026-11-19T02:00:00.000Z'),
        makeRecord('k3', 'Incoming Brand New', '2026-11-19T04:00:00.000Z'),
      ],
      tacticsItems: [],
    });

    expect(res.addedKifu).toBe(1);
    expect(res.updatedKifu).toBe(1);
    expect(res.addedTsumego).toBe(0);
    expect(res.addedQuiz).toBe(0);
    const all = loadKifuRecords();
    expect(all.find((r) => r.id === 'k1')?.title).toBe('Incoming Newer');
    expect(all.find((r) => r.id === 'k2')?.title).toBe('Local Newer');
    expect(all.find((r) => r.id === 'k3')?.title).toBe('Incoming Brand New');
  });

  it('persists optional folder sync flags', () => {
    saveFolderSyncOptions({ autoBackupOnExit: true, autoSyncOnStartup: false });
    const opts = getFolderSyncOptions();
    expect(opts.autoBackupOnExit).toBe(true);
    expect(opts.autoSyncOnStartup).toBe(false);
  });

  it('exports and merges tsumego problems, attempts, and quiz cards in full bundle', () => {
    saveKifuRecords([makeRecord('k1', 'Test', '2026-11-19T01:00:00.000Z')]);
    saveTsumegoProblems([makeTsumego('ts-1', 'Local Old Tsume', '2026-11-19T01:00:00.000Z')]);
    recordTsumegoAttempt({
      problemId: 'ts-1',
      solved: true,
      movesCount: 1,
      hintsUsed: 0,
      elapsedMs: 1200,
      timestamp: 5000,
    });
    saveQuizPool([makeQuizCard('qz-1', 'Local Quiz', '2026-11-19T04:00:00.000Z')]);

    const bundle = exportFullBackupBundle();
    expect(bundle.version).toBe(1);
    expect(bundle.appName).toBe('joseki-tree');
    expect(bundle.kifuRecords).toHaveLength(1);
    expect(bundle.tsumegoProblems).toHaveLength(1);
    expect(bundle.tsumegoAttempts).toHaveLength(1);
    expect(bundle.quizCards).toHaveLength(1);

    const mergeRes = mergeFullBackupBundle({
      version: 1,
      exportedAt: '2026-11-19T06:00:00.000Z',
      appName: 'joseki-tree',
      kifuRecords: [],
      tacticsItems: [],
      tsumegoProblems: [
        makeTsumego('ts-1', 'Incoming Newer Tsume', '2099-01-01T01:00:00.000Z'),
        makeTsumego('ts-2', 'Incoming New Tsume', '2099-01-01T02:00:00.000Z'),
      ],
      tsumegoAttempts: [
        {
          problemId: 'ts-1',
          solved: true,
          movesCount: 1,
          hintsUsed: 0,
          elapsedMs: 1200,
          timestamp: 5000,
        },
        {
          problemId: 'ts-2',
          solved: false,
          movesCount: 2,
          hintsUsed: 1,
          elapsedMs: 3000,
          timestamp: 6000,
        },
      ],
      quizCards: [
        makeQuizCard('qz-1', 'Incoming Older Quiz', '2026-11-18T00:00:00.000Z'),
        makeQuizCard('qz-2', 'Incoming New Quiz', '2026-11-22T00:00:00.000Z'),
      ],
    });

    expect(mergeRes.addedTsumego).toBe(1);
    expect(mergeRes.updatedTsumego).toBe(1);
    expect(mergeRes.addedQuiz).toBe(1);
    expect(mergeRes.updatedQuiz).toBe(0);
    expect(loadTsumegoProblems().find((p) => p.id === 'ts-1')?.title).toBe('Incoming Newer Tsume');
    expect(loadAllTsumegoAttempts()).toHaveLength(2);
    expect(loadQuizPool().find((c) => c.id === 'qz-1')?.title).toBe('Local Quiz');
    expect(loadQuizPool().find((c) => c.id === 'qz-2')?.title).toBe('Incoming New Quiz');
  });
});
