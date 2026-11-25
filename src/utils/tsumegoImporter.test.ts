import { beforeEach, describe, expect, it } from 'vitest';
import type { TsumegoProblem } from '../types/tsumego';
import {
  getImportedTsumegoSourceName,
  hashTsumegoSfen,
  importSfenTsumegoFile,
  isSfenImportedTsumego,
  shouldReplaceImportedTsumego,
} from './tsumegoImporter';
import {
  clearTsumegoStorage,
  loadImportedTsumegoHashes,
  recordImportedTsumegoHashes,
} from './tsumegoStorage';

function createSfenFile(lines: string[], filename = '3te.sfen'): File {
  const bytes = new TextEncoder().encode(lines.join('\n'));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return {
    name: filename,
    stream: () => stream,
  } as unknown as File;
}

describe('hashTsumegoSfen & isSfenImportedTsumego', () => {
  it('ignores trailing move counter while distinguishing different boards and hands', () => {
    const s1a = '4k4/9/4P4/9/9/9/9/9/9 b G 1';
    const s1b = '4k4/9/4P4/9/9/9/9/9/9 b G 42';
    const s2 = '4k4/9/4P4/9/9/9/9/9/9 b S 1';
    const s3 = '4k4/9/4P4/9/9/9/9/9/9 w G 1';

    expect(hashTsumegoSfen(s1a)).toBe(hashTsumegoSfen(s1b));
    expect(hashTsumegoSfen(s1a)).toHaveLength(16);
    expect(hashTsumegoSfen(s1a)).not.toBe(hashTsumegoSfen(s2));
    expect(hashTsumegoSfen(s1a)).not.toBe(hashTsumegoSfen(s3));
  });

  it('distinguishes SFEN-imported tsumego from manual or kifu-extracted ones', () => {
    const base: TsumegoProblem = {
      id: 'custom-tsume-1',
      title: 'Manual',
      source: 'manual',
      kind: 'attack',
      startSfen: '4k4/9/4P4/9/9/9/9/9/9 b G 1',
      sideToMove: 'b',
      moveLimit: 1,
      solutionPv: ['G*5b'],
      tags: ['1手詰'],
      createdAt: 1000,
    };
    expect(isSfenImportedTsumego(base)).toBe(false);
    expect(isSfenImportedTsumego({ ...base, id: 'import-sfen-1-0' })).toBe(true);
    expect(isSfenImportedTsumego({ ...base, source: 'tanuki-import' })).toBe(true);
    expect(isSfenImportedTsumego({ ...base, tags: ['3手詰', 'SFENインポート'] })).toBe(true);
  });
});

describe('importSfenTsumegoFile unseen-only filtering & hash history storage', () => {
  beforeEach(() => {
    clearTsumegoStorage();
  });

  it('skips excluded SFEN hashes across repeated imports and returns empty when exhausted', async () => {
    const sfen1 = '4k4/9/4P4/9/9/9/9/9/9 b G 1';
    const sfen2 = '8k/7p1/7P1/9/9/9/9/9/9 b G 1';
    const sfen3 = '6pkn/6p2/6S2/9/9/9/9/9/7R1 b G 1';

    const file1 = createSfenFile([sfen1, sfen2, sfen3], '3te_sample.sfen');
    const firstBatch = await importSfenTsumegoFile(file1, { maxProblems: 2 });
    expect(firstBatch).toHaveLength(2);
    expect(firstBatch[0]?.source).toBe('tanuki-import');

    recordImportedTsumegoHashes(firstBatch.map((p) => p.startSfen));
    const excluded = new Set(loadImportedTsumegoHashes());
    expect(excluded.size).toBe(2);

    const file2 = createSfenFile([sfen1, sfen2, sfen3], '3te_sample.sfen');
    const secondBatch = await importSfenTsumegoFile(file2, {
      maxProblems: 2,
      excludeSfenHashes: excluded,
    });
    expect(secondBatch).toHaveLength(1);
    expect(excluded.has(hashTsumegoSfen(secondBatch[0]!.startSfen))).toBe(false);

    recordImportedTsumegoHashes(secondBatch.map((p) => p.startSfen));
    const allExcluded = new Set(loadImportedTsumegoHashes());
    expect(allExcluded.size).toBe(3);

    const file3 = createSfenFile([sfen1, sfen2, sfen3], '3te_sample.sfen');
    const thirdBatch = await importSfenTsumegoFile(file3, {
      maxProblems: 2,
      excludeSfenHashes: allExcluded,
    });
    expect(thirdBatch).toEqual([]);
  });
});

describe('getImportedTsumegoSourceName & shouldReplaceImportedTsumego', () => {
  it('sets importSourceName when importing SFEN files and extracts legacy titles', () => {
    expect(
      getImportedTsumegoSourceName({
        id: 'import-sfen-1',
        title: 'mate3 #12 (3手詰)',
        source: 'tanuki-import',
        kind: 'attack',
        startSfen: '4k4/9/4P4/9/9/9/9/9/9 b G 1',
        sideToMove: 'b',
        moveLimit: 3,
        solutionPv: [],
        tags: ['3手詰', 'SFENインポート'],
        createdAt: 1000,
      })
    ).toBe('mate3');

    expect(
      getImportedTsumegoSourceName({
        id: 'import-sfen-2',
        title: 'Custom Renamed Title',
        importSourceName: 'yaneura_5te',
        source: 'tanuki-import',
        kind: 'attack',
        startSfen: '4k4/9/4P4/9/9/9/9/9/9 b G 1',
        sideToMove: 'b',
        moveLimit: 5,
        solutionPv: [],
        tags: ['5手詰', 'SFENインポート'],
        createdAt: 1000,
      })
    ).toBe('yaneura_5te');
  });

  it('replaces only SFEN imports from the matching source file and keeps all others intact', async () => {
    const incomingBatch = await importSfenTsumegoFile(
      createSfenFile(['4k4/9/4P4/9/9/9/9/9/9 b G 1'], 'mate3.sfen'),
      { maxProblems: 50 }
    );
    expect(incomingBatch[0]?.importSourceName).toBe('mate3');

    const existingSameFileExplicit: TsumegoProblem = {
      id: 'import-sfen-old-mate3-a',
      title: 'mate3 #1 (3手詰)',
      importSourceName: 'mate3',
      source: 'tanuki-import',
      kind: 'attack',
      startSfen: '8k/7p1/7P1/9/9/9/9/9/9 b G 1',
      sideToMove: 'b',
      moveLimit: 3,
      solutionPv: [],
      tags: ['3手詰', 'SFENインポート'],
      createdAt: 100,
    };
    const existingSameFileLegacy: TsumegoProblem = {
      id: 'import-sfen-old-mate3-b',
      title: 'mate3 #99 (3手詰)',
      source: 'manual',
      kind: 'attack',
      startSfen: '8k/7p1/7P1/9/9/9/9/9/9 b S 1',
      sideToMove: 'b',
      moveLimit: 3,
      solutionPv: [],
      tags: ['3手詰', 'SFENインポート'],
      createdAt: 100,
    };
    const existingFivePlyOtherFile: TsumegoProblem = {
      id: 'import-sfen-old-mate5',
      title: 'mate5 #5 (5手詰)',
      importSourceName: 'mate5',
      source: 'tanuki-import',
      kind: 'attack',
      startSfen: '6pkn/6p2/6S2/9/9/9/9/9/7R1 b G 1',
      sideToMove: 'b',
      moveLimit: 5,
      solutionPv: [],
      tags: ['5手詰', 'SFENインポート'],
      createdAt: 100,
    };
    const existingOtherThreePlyFile: TsumegoProblem = {
      id: 'import-sfen-old-other3',
      title: 'other_3te #3 (3手詰)',
      importSourceName: 'other_3te',
      source: 'tanuki-import',
      kind: 'attack',
      startSfen: '6pkn/6p2/6S2/9/9/9/9/9/7R1 b G 2',
      sideToMove: 'b',
      moveLimit: 3,
      solutionPv: [],
      tags: ['3手詰', 'SFENインポート'],
      createdAt: 100,
    };
    const existingManual: TsumegoProblem = {
      id: 'custom-tsume-1',
      title: 'My 3-ply',
      source: 'manual',
      kind: 'attack',
      startSfen: '4k4/9/4P4/9/9/9/9/9/9 b G 1',
      sideToMove: 'b',
      moveLimit: 3,
      solutionPv: ['G*5b'],
      tags: ['3手詰'],
      createdAt: 100,
    };

    expect(shouldReplaceImportedTsumego(existingSameFileExplicit, incomingBatch)).toBe(true);
    expect(shouldReplaceImportedTsumego(existingSameFileLegacy, incomingBatch)).toBe(true);
    expect(shouldReplaceImportedTsumego(existingFivePlyOtherFile, incomingBatch)).toBe(false);
    expect(shouldReplaceImportedTsumego(existingOtherThreePlyFile, incomingBatch)).toBe(false);
    expect(shouldReplaceImportedTsumego(existingManual, incomingBatch)).toBe(false);
  });
});
