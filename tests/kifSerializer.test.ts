import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { copyKifToClipboard, downloadKifFile } from '../src/utils/exportHelpers';
import { parseKif } from '../src/utils/kifParser';
import { formatKifMove, serializeTreeToKif } from '../src/utils/kifSerializer';
import { mergeGamesIntoTree } from '../src/utils/treeMerger';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/sample_kifs');

describe('formatKifMove unit tests', () => {
  it('formats normal moves correctly', () => {
    const move = {
      ply: 1,
      color: 'b' as const,
      from: { file: 7, rank: 7 },
      to: { file: 7, rank: 6 },
      piece: 'FU' as const,
      isDrop: false,
      kifString: '7g7f',
      sfenMove: '7g7f',
    };
    expect(formatKifMove(move)).toBe('７六歩(77)');
  });

  it('formats consecutive moves to the same square with 同', () => {
    const move = {
      ply: 2,
      color: 'w' as const,
      from: { file: 8, rank: 7 },
      to: { file: 7, rank: 6 },
      piece: 'GI' as const,
      isDrop: false,
      kifString: '8g7f',
      sfenMove: '8g7f',
    };
    const prevDest = { file: 7, rank: 6 };
    expect(formatKifMove(move, prevDest)).toBe('同　銀(87)');
  });

  it('formats piece drops correctly', () => {
    const move = {
      ply: 3,
      color: 'b' as const,
      to: { file: 5, rank: 2 },
      piece: 'KI' as const,
      isDrop: true,
      kifString: 'G*5b',
      sfenMove: 'G*5b',
    };
    expect(formatKifMove(move)).toBe('５二金打');
  });

  it('formats promotion moves correctly', () => {
    const move = {
      ply: 10,
      color: 'w' as const,
      from: { file: 2, rank: 2 },
      to: { file: 7, rank: 7 },
      piece: 'KA' as const,
      promote: true,
      isDrop: false,
      kifString: '2b7g+',
      sfenMove: '2b7g+',
    };
    expect(formatKifMove(move)).toBe('７七角成(22)');
  });
});

describe('serializeTreeToKif & Roundtrip tests', () => {
  const plainKif = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_aigakari_plain.kif'));
  const shikenKif = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_shikenbisha_mate.kif'));
  const kakuKif = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_kakugawari_eval.kif'));

  it('serializes a merged tree with headers, mainline, and variations', () => {
    const plain = parseKif(plainKif);
    const kaku = parseKif(kakuKif);
    const tree = mergeGamesIntoTree([plain, kaku], {
      openingName: 'Repertoire Test Tree',
    });

    const kifOutput = serializeTreeToKif(tree);

    expect(kifOutput).toContain('#KIF version=2.0');
    expect(kifOutput).toContain('手合割：平手');
    expect(kifOutput).toContain('棋戦：Repertoire Test Tree');
    expect(kifOutput).toContain('   1 ２六歩(27)');
    expect(kifOutput).toContain('変化：1手');
    expect(kifOutput).toContain('   1 ７六歩(77)');
  });

  it('successfully round-trips: serializes tree to KIF and parses it back cleanly', () => {
    const shiken = parseKif(shikenKif);
    const kaku = parseKif(kakuKif);
    const tree = mergeGamesIntoTree([shiken, kaku], {
      openingName: 'Roundtrip Opening',
    });

    const serializedKif = serializeTreeToKif(tree, {
      maxPly: 30,
      includeStatsComments: true,
      includeEngineEval: true,
    });

    // Re-parse the generated KIF string
    const reparsed = parseKif(serializedKif);

    expect(reparsed.moves.length).toBe(30);
    expect(reparsed.game.tournament).toBe('Roundtrip Opening');
    expect(reparsed.moves[0]?.sfenMove).toBe('2g2f');
    expect(reparsed.variations.length).toBeGreaterThan(0);
    expect(reparsed.variations[0]?.branchPly).toBe(1);
    expect(reparsed.variations[0]?.moves[0]?.sfenMove).toBe('7g7f');
  });

  it('respects maxPly limit strictly', () => {
    const plain = parseKif(plainKif);
    const tree = mergeGamesIntoTree([plain]);

    const serialized = serializeTreeToKif(tree, { maxPly: 10 });
    const lines = serialized.split('\n').filter((l) => /^\s*\d+\s+/.test(l));

    const maxObservedPly = Math.max(...lines.map((l) => parseInt(l.trim().split(/\s+/)[0] ?? '0', 10)));
    expect(maxObservedPly).toBe(10);
  });

  it('omits stats and engine evaluations when disabled', () => {
    const shiken = parseKif(shikenKif);
    const tree = mergeGamesIntoTree([shiken]);

    const serialized = serializeTreeToKif(tree, {
      includeStatsComments: false,
      includeEngineEval: false,
    });

    expect(serialized).not.toContain('*#Games:');
    expect(serialized).not.toContain('**解析');
  });
});

describe('exportHelpers unit tests', () => {
  it('handles non-browser environments gracefully without crashing', async () => {
    const copyResult = await copyKifToClipboard('test kif');
    expect(typeof copyResult).toBe('boolean');

    const downloadResult = downloadKifFile('test kif', 'test.kif');
    expect(typeof downloadResult).toBe('boolean');
  });
});
