import { describe, it, expect, beforeEach } from 'vitest';
import { processKifuFiles } from './bulkKifuProcessor';
import { saveKifuRecord } from './kifuRecordStorage';
import { ingestedInputToKifuRecord } from './kifuRecordCodec';
import { parseKif } from './kifParser';
import { getSafeStorage } from './matchHistoryStorage';

const KIF_A = `#KIF version=2.0
棋戦：テスト棋戦
手合割：平手
先手：甲
後手：乙
手数----指手---------消費時間--
   1 ７六歩(77)        ( 0:00/00:00:00)
   2 ３四歩(33)        ( 0:00/00:00:00)
   3 ２六歩(27)        ( 0:00/00:00:00)
   4 ４四歩(43)        ( 0:00/00:00:00)
まで4手で中断`;

const KIF_B = `#KIF version=2.0
棋戦：別の棋戦
手合割：平手
先手：丙
後手：丁
手数----指手---------消費時間--
   1 ７六歩(77)        ( 0:00/00:00:00)
   2 ８四歩(83)        ( 0:00/00:00:00)
   3 ２五歩(26)        ( 0:00/00:00:00)
まで3手で中断`;

function makeFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/plain' });
}

describe('processKifuFiles', () => {
  beforeEach(() => {
    getSafeStorage().clear();
  });

  it('parses multiple valid files into successes', async () => {
    const result = await processKifuFiles([
      makeFile('a.kif', KIF_A),
      makeFile('b.ki2', KIF_B),
    ]);
    expect(result.counts.success).toBe(2);
    expect(result.successes).toHaveLength(2);
    expect(result.fileResults.every((r) => r.status === 'success')).toBe(true);
  });

  it('skips files already stored as KifuRecords (contentHash match)', async () => {
    const parsed = parseKif(KIF_A);
    saveKifuRecord(ingestedInputToKifuRecord(parsed));

    const result = await processKifuFiles([
      makeFile('dup.kif', KIF_A),
      makeFile('new.kif', KIF_B),
    ]);
    expect(result.counts.duplicate).toBe(1);
    expect(result.counts.success).toBe(1);
    expect(result.successes[0]?.game.senteName).toBe('丙');
  });

  it('deduplicates identical files within the same batch', async () => {
    const result = await processKifuFiles([
      makeFile('one.kif', KIF_A),
      makeFile('two.kif', KIF_A),
    ]);
    expect(result.counts.success).toBe(1);
    expect(result.counts.duplicate).toBe(1);
  });

  it('reports failures without aborting the batch', async () => {
    const result = await processKifuFiles([
      makeFile('bad.kif', 'not a kifu at all'),
      makeFile('notes.txt', 'hello'),
      makeFile('ok.kif', KIF_A),
      makeFile('image.png', 'binary'),
    ]);
    expect(result.counts.success).toBe(1);
    expect(result.counts.failed).toBe(3);
    const reasons = result.fileResults
      .filter((r) => r.status === 'failed')
      .map((r) => r.reason);
    // Garbage text parses to zero moves -> 'empty'; non-kifu ext -> 'unsupported'.
    expect(reasons).toEqual(['empty', 'empty', 'unsupported']);
  });

  it('reports progress after each file', async () => {
    const seen: Array<[number, number]> = [];
    await processKifuFiles([makeFile('a.kif', KIF_A), makeFile('b.kif', KIF_B)], {
      onProgress: (done, total) => seen.push([done, total]),
    });
    expect(seen).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });
});
