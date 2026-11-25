import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { decodeKifBuffer } from '../src/utils/encoding';
import { parseKif } from '../src/utils/kifParser';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/sample_kifs');

describe('decodeKifBuffer', () => {
  it('decodes UTF-8 buffers correctly', () => {
    const originalText = '# KIF sample in UTF-8\n先手：テスト先手\n後手：テスト後手\n';
    const utf8Buffer = new TextEncoder().encode(originalText);
    const result = decodeKifBuffer(utf8Buffer);

    expect(result.encoding).toBe('utf-8');
    expect(result.text).toBe(originalText);
  });

  it('decodes Shift-JIS buffers correctly', () => {
    const filePath = path.join(FIXTURES_DIR, 'sample_kakugawari_eval.kif');
    const buffer = fs.readFileSync(filePath);
    const result = decodeKifBuffer(buffer);

    expect(result.encoding).toBe('shift-jis');
    expect(result.text).toContain('先手：先手A');
    expect(result.text).toContain('後手：後手B');
  });
});

describe('parseKif - Fixture 1: sample_kakugawari_eval.kif', () => {
  const filePath = path.join(FIXTURES_DIR, 'sample_kakugawari_eval.kif');
  const buffer = fs.readFileSync(filePath);
  const result = parseKif(buffer);

  it('extracts metadata headers correctly', () => {
    expect(result.game.senteName).toBe('先手A');
    expect(result.game.goteName).toBe('後手B');
    expect(result.game.tournament).toBe('サンプル棋戦');
    expect(result.game.date).toBe('2026-01-10');
    expect(result.game.winner).toBe('b');
  });

  it('parses mainline move sequences accurately', () => {
    expect(result.moves.length).toBe(31);

    // Move 1: ７六歩(77) -> 7g7f
    const move1 = result.moves[0];
    expect(move1?.ply).toBe(1);
    expect(move1?.color).toBe('b');
    expect(move1?.from).toEqual({ file: 7, rank: 7 });
    expect(move1?.to).toEqual({ file: 7, rank: 6 });
    expect(move1?.piece).toBe('FU');
    expect(move1?.isDrop).toBe(false);
    expect(move1?.sfenMove).toBe('7g7f');

    // Move 2: ８四歩(83) -> 8c8d
    const move2 = result.moves[1];
    expect(move2?.ply).toBe(2);
    expect(move2?.color).toBe('w');
    expect(move2?.from).toEqual({ file: 8, rank: 3 });
    expect(move2?.to).toEqual({ file: 8, rank: 4 });
    expect(move2?.sfenMove).toBe('8c8d');

    // Move 10: ７七角成(22) -> 2b7g+
    const move10 = result.moves[9];
    expect(move10?.ply).toBe(10);
    expect(move10?.from).toEqual({ file: 2, rank: 2 });
    expect(move10?.to).toEqual({ file: 7, rank: 7 });
    expect(move10?.promote).toBe(true);
    expect(move10?.sfenMove).toBe('2b7g+');
  });

  it('parses variations in file', () => {
    expect(result.variations.length).toBeGreaterThan(0);
  });
});

describe('parseKif - Fixture 2: sample_aigakari_plain.kif', () => {
  const filePath = path.join(FIXTURES_DIR, 'sample_aigakari_plain.kif');
  const buffer = fs.readFileSync(filePath);
  const result = parseKif(buffer);

  it('extracts metadata correctly', () => {
    expect(result.game.senteName).toBe('先手C');
    expect(result.game.goteName).toBe('後手D');
    expect(result.game.tournament).toBe('サンプル対局');
    expect(result.game.date).toBe('2026-02-03');
  });

  it('parses all 32 moves without failure', () => {
    expect(result.moves.length).toBe(32);
    expect(result.moves[0]?.sfenMove).toBe('2g2f');
    expect(result.moves[31]?.to).toEqual({ file: 7, rank: 3 });
  });
});

describe('parseKif - Fixture 3: sample_shikenbisha_mate.kif', () => {
  const filePath = path.join(FIXTURES_DIR, 'sample_shikenbisha_mate.kif');
  const buffer = fs.readFileSync(filePath);
  const result = parseKif(buffer);

  it('extracts players and tournament correctly', () => {
    expect(result.game.senteName).toBe('先手E 2級');
    expect(result.game.goteName).toBe('後手F 1級');
    expect(result.game.tournament).toBe('サンプルオンライン戦');
    expect(result.game.date).toBe('2026-05-20');
  });

  it('parses checkmate game result', () => {
    expect(result.moves.length).toBe(32);
    expect(result.game.winner).toBe('w');
  });
});

describe('parseKif - Fixture 4: sample_branches.kif', () => {
  const filePath = path.join(FIXTURES_DIR, 'sample_branches.kif');
  const buffer = fs.readFileSync(filePath);
  const result = parseKif(buffer);

  it('parses mainline moves correctly despite variation markers', () => {
    expect(result.moves.length).toBe(32);
    expect(result.moves[0]?.sfenMove).toBe('2g2f');
    expect(result.moves[1]?.sfenMove).toBe('3c3d');
  });

  it('extracts multiple variation blocks', () => {
    expect(result.variations.length).toBe(3);
    const firstVar = result.variations[0];
    expect(firstVar?.branchPly).toBe(5);
    expect(firstVar?.moves.length).toBeGreaterThan(0);
  });
});
