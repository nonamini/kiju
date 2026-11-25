import { describe, expect, it } from 'vitest';
import { Parsers } from 'json-kifu-format';
import {
  canonicalizeJsonKifu,
  computeKifuContentHash,
  computeKifuRecordContentHash,
  sha256Hex,
} from './kifuContentHash';

const MINIMAL_KIF = `手合割：平手
先手：テスト一
後手：テスト二
手数----指手---------消費時間--
1 ７六歩(77)
2 ３四歩(33)
3 ２六歩(27)
4 ８四歩(83)
`;

const MINIMAL_KIF_ALT_HEADER = `手合割：平手
先手：別の名前１
後手：別の名前２
棋戦：テスト棋戦
手数----指手---------消費時間--
1 ７六歩(77)
2 ３四歩(33)
3 ２六歩(27)
4 ８四歩(83)
`;

const MINIMAL_KIF_DIFFERENT_MOVES = `手合割：平手
先手：テスト一
後手：テスト二
手数----指手---------消費時間--
1 ７六歩(77)
2 ３四歩(33)
3 ２六歩(27)
4 ４四歩(43)
`;

describe('sha256Hex', () => {
  it('matches known SHA-256 test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('canonicalizeJsonKifu', () => {
  it('produces deterministic tokens for mainline moves only', () => {
    const jkf = Parsers.parseKIF(MINIMAL_KIF);
    const canonical = canonicalizeJsonKifu(jkf);
    expect(canonical).toContain('b:');
    expect(canonical.split('|').length).toBeGreaterThanOrEqual(4);
    expect(canonicalizeJsonKifu(jkf)).toBe(canonical);
  });
});

describe('computeKifuContentHash', () => {
  it('produces identical hash for the same game as KIF and as JKF JSON', () => {
    const jkf = Parsers.parseKIF(MINIMAL_KIF);
    const hashFromKif = computeKifuContentHash({ rawKif: MINIMAL_KIF });
    const hashFromJkf = computeKifuContentHash({ jkfJson: JSON.stringify(jkf) });
    expect(hashFromKif).toBe(hashFromJkf);
    expect(hashFromKif).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is insensitive to header metadata (players, tournament)', () => {
    const h1 = computeKifuContentHash({ rawKif: MINIMAL_KIF });
    const h2 = computeKifuContentHash({ rawKif: MINIMAL_KIF_ALT_HEADER });
    expect(h1).toBe(h2);
  });

  it('is insensitive to comments and whitespace formatting', () => {
    const withComments = `# これはコメントです
${MINIMAL_KIF}# 末尾コメント
`;
    const h1 = computeKifuContentHash({ rawKif: MINIMAL_KIF });
    const h2 = computeKifuContentHash({ rawKif: withComments });
    expect(h1).toBe(h2);
  });

  it('differs for games with different move sequences', () => {
    const h1 = computeKifuContentHash({ rawKif: MINIMAL_KIF });
    const h2 = computeKifuContentHash({ rawKif: MINIMAL_KIF_DIFFERENT_MOVES });
    expect(h1).not.toBe(h2);
  });

  it('falls back to move-line canonicalization for unparseable raw KIF', () => {
    const garbage = `not a kifu at all\n1 ７六歩(77)\n2 ３四歩(33)`;
    const h1 = computeKifuContentHash({ rawKif: garbage });
    const h2 = computeKifuContentHash({ rawKif: garbage });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);

    // Different move lines must produce a different hash even in fallback mode
    const h3 = computeKifuContentHash({ rawKif: 'junk\n1 ２五歩(26)\n2 ８四歩(83)' });
    expect(h1).not.toBe(h3);
  });

  it('returns a deterministic hash for empty input', () => {
    const h = computeKifuContentHash({});
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(computeKifuContentHash({})).toBe(h);
  });

  it('computeKifuRecordContentHash accepts record-shaped input', () => {
    const jkf = Parsers.parseKIF(MINIMAL_KIF);
    const h = computeKifuRecordContentHash({ jkfJson: JSON.stringify(jkf) });
    expect(h).toBe(computeKifuContentHash({ rawKif: MINIMAL_KIF }));
  });
});
