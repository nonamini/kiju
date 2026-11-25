import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseEvalComment, parsePvToUsi } from '../src/utils/evalExtractor';
import { parseKif } from '../src/utils/kifParser';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures/sample_kifs');

describe('parseEvalComment unit tests', () => {
  it('parses standard engine analysis comment accurately', () => {
    const line = '**解析 0  候補1 時間 00:05.0 深さ 18/22 ノード数 1984594 評価値 -17 読み筋 △３二飛(82) ▲４八銀(39) △４二銀(31)';
    const evalData = parseEvalComment(line, '2026-01-01T00:00:00.000Z');

    expect(evalData).not.toBeNull();
    expect(evalData?.scoreCp).toBe(-17);
    expect(evalData?.depth).toBe(18);
    expect(evalData?.isMate).toBeUndefined();
    expect(evalData?.bestMove).toBe('8b3b');
    expect(evalData?.bestMoveKif).toBe('△３二飛(82)');
    expect(evalData?.pv).toEqual(['8b3b', '3i4h', '3a4b']);
    expect(evalData?.evaluatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('parses mate score evaluations correctly', () => {
    const line = '**解析 0 ○ 評価値 -29999 読み筋 △投了';
    const evalData = parseEvalComment(line);

    expect(evalData).not.toBeNull();
    expect(evalData?.scoreCp).toBe(-29999);
    expect(evalData?.isMate).toBe(true);
    expect(evalData?.matePly).toBe(1);
  });

  it('parses explicit mate string in score', () => {
    const line = '**解析 0 評価値 +詰み15 読み筋 ▲５二金打';
    const evalData = parseEvalComment(line);

    expect(evalData).not.toBeNull();
    expect(evalData?.scoreCp).toBe(30000);
    expect(evalData?.isMate).toBe(true);
    expect(evalData?.matePly).toBe(15);
    expect(evalData?.bestMove).toBe('G*5b');
  });

  it('returns null on non-analysis comments', () => {
    expect(parseEvalComment('*#定跡手')).toBeNull();
    expect(parseEvalComment('   1 ７六歩(77)')).toBeNull();
    expect(parseEvalComment('#KIF version=2.0')).toBeNull();
  });
});

describe('parsePvToUsi unit tests', () => {
  it('converts Japanese PV sequences including drops and consecutive same-square moves', () => {
    const pvStr = '▲６八玉(59) △７三銀(62) ▲同　歩(76) △４四銀(33) ▲５八金打 △投了';
    const usi = parsePvToUsi(pvStr);

    expect(usi).toEqual(['5i6h', '6b7c', '7f7c', '3c4d', 'G*5h']);
  });
});

describe('Evaluation extraction on synthetic KIF fixtures', () => {
  it('extracts evaluations from sample_kakugawari_eval.kif', () => {
    const buffer = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_kakugawari_eval.kif'));
    const result = parseKif(buffer);

    expect(result.game.isAnalyzed).toBe(true);

    // Ply 1 has no evaluation in this fixture
    expect(result.moves[0]?.evaluation).toBeUndefined();

    // Ply 16 (６二銀(71)) has evaluation: 評価値 76, 深さ 18, 読み筋 ▲４六歩(47)...
    const move16 = result.moves[15];
    expect(move16?.ply).toBe(16);
    expect(move16?.evaluation).toBeDefined();
    expect(move16?.evaluation?.scoreCp).toBe(76);
    expect(move16?.evaluation?.depth).toBe(18);
    expect(move16?.evaluation?.bestMove).toBe('4g4f');
  });

  it('extracts evaluations and mate scores from sample_shikenbisha_mate.kif', () => {
    const buffer = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_shikenbisha_mate.kif'));
    const result = parseKif(buffer);

    expect(result.game.isAnalyzed).toBe(true);

    // Ply 7 (７八銀(79)) has evaluation: 評価値 -17, 深さ 18, bestMove 8b3b (△３二飛(82))
    const move7 = result.moves[6];
    expect(move7?.ply).toBe(7);
    expect(move7?.evaluation).toBeDefined();
    expect(move7?.evaluation?.scoreCp).toBe(-17);
    expect(move7?.evaluation?.depth).toBe(18);
    expect(move7?.evaluation?.bestMove).toBe('8b3b');

    // Moves with evaluation should exist across the game
    const evaluatedMoves = result.moves.filter((m) => m.evaluation !== undefined);
    expect(evaluatedMoves.length).toBeGreaterThan(20);
  });

  it('keeps evaluation: undefined on unanalyzed fixtures', () => {
    const bufferPlain = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_aigakari_plain.kif'));
    const resultPlain = parseKif(bufferPlain);
    expect(resultPlain.game.isAnalyzed).toBe(false);
    expect(resultPlain.moves.every((m) => m.evaluation === undefined)).toBe(true);

    const bufferBranch = fs.readFileSync(path.join(FIXTURES_DIR, 'sample_branches.kif'));
    const resultBranch = parseKif(bufferBranch);
    expect(resultBranch.game.isAnalyzed).toBe(false);
    expect(resultBranch.moves.every((m) => m.evaluation === undefined)).toBe(true);
  });
});
