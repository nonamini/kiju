import { describe, expect, it } from 'vitest';
import {
  isLikelyBodText,
  parseBodOrSfenToSfen,
  parseBodToPosition,
  serializeSfenToBod,
  sfenToFreeBoardDiagramPatch,
} from './bodParser';
import { HIRATE_SFEN } from './positionEditor';

const HIRATE_BOD = `後手の持駒：なし
  ９ ８ ７ ６ ５ ４ ３ ２ １
+---------------------------+
|v香v桂v銀v金v王v金v銀v桂v香|一
| ・v飛 ・ ・ ・ ・ ・v角 ・|二
|v歩v歩v歩v歩v歩v歩v歩v歩v歩|三
| ・ ・ ・ ・ ・ ・ ・ ・ ・|四
| ・ ・ ・ ・ ・ ・ ・ ・ ・|五
| ・ ・ ・ ・ ・ ・ ・ ・ ・|六
| 歩 歩 歩 歩 歩 歩 歩 歩 歩|七
| ・ 角 ・ ・ ・ ・ ・ 飛 ・|八
| 香 桂 銀 金 玉 金 銀 桂 香|九
+---------------------------+
先手の持駒：なし
手数＝0    まで
`;

const TSUME_BOD = `後手の持駒：金二 歩十八
  ９ ８ ７ ６ ５ ４ ３ ２ １
+---------------------------+
| ・ ・ ・ ・v玉 ・ ・ ・ ・|一
| ・ ・ ・ ・ ・ 馬 ・ ・ ・|二
| ・ ・ ・ ・ と ・ ・ ・ ・|三
| ・ ・ ・ ・ ・ ・ ・ ・ ・|四
| ・ ・ ・ ・ ・ ・ ・ ・ ・|五
| ・ ・ ・ ・ ・ ・ ・ ・ ・|六
| ・ ・ ・ ・ ・ ・ ・ ・ ・|七
| ・ ・ ・ ・ ・ ・ ・ ・ ・|八
| ・ ・ ・ ・ ・ ・ ・ ・ ・|九
+---------------------------+
先手の持駒：飛 角 銀
後手番
手数＝3    まで`;

describe('bodParser (Issue #14)', () => {
  it('parses standard hirate BOD text into standard Hirate SFEN', () => {
    expect(isLikelyBodText(HIRATE_BOD)).toBe(true);
    const result = parseBodToPosition(HIRATE_BOD);
    expect(result).not.toBeNull();
    expect(result?.sfen).toBe(HIRATE_SFEN);
  });

  it('parses promoted pieces, kanji hand counts, and turn markers', () => {
    const result = parseBodToPosition(TSUME_BOD);
    expect(result).not.toBeNull();
    expect(result?.sfen).toBe('4k4/5+B3/4+P4/9/9/9/9/9/9 w RBS2g18p 3');
  });

  it('handles both BOD and raw SFEN in parseBodOrSfenToSfen and rejects garbage', () => {
    expect(parseBodOrSfenToSfen(HIRATE_BOD)).toBe(HIRATE_SFEN);
    expect(
      parseBodOrSfenToSfen('4k4/9/9/9/9/9/9/9/9 b - 1')
    ).toBe('4k4/9/9/9/9/9/9/9/9 b - 1');
    expect(parseBodOrSfenToSfen('invalid text not a board')).toBeNull();
  });

  it('converts parsed SFEN into 9x9 FreeBoardDiagram pieces', () => {
    const patch = sfenToFreeBoardDiagramPatch('4k4/5+B3/4+P4/9/9/9/9/9/9 w - 1');
    expect(patch.cols).toBe(9);
    expect(patch.rows).toBe(9);
    expect(patch.startFile).toBe(9);
    expect(patch.startRank).toBe(1);
    expect(patch.pieces).toEqual([
      { col: 4, row: 0, owner: 'w', kind: 'K' },
      { col: 5, row: 1, owner: 'b', kind: '+B' },
      { col: 4, row: 2, owner: 'b', kind: '+P' },
    ]);
  });

  it('roundtrips SFEN to BOD and back for both Hirate and custom positions', () => {
    const hirateBod = serializeSfenToBod(HIRATE_SFEN);
    expect(hirateBod).toContain('後手の持駒：なし');
    expect(hirateBod).toContain('先手の持駒：なし');
    expect(parseBodToPosition(hirateBod)?.sfen).toBe(HIRATE_SFEN);

    const customSfen = '4k4/5+B3/4+P4/9/9/9/9/9/9 w RBS2g18p 3';
    const customBod = serializeSfenToBod(customSfen, { ply: 3 });
    expect(customBod).toContain('後手の持駒：金二 歩十八');
    expect(customBod).toContain('先手の持駒：飛 角 銀');
    expect(customBod).toContain('手数＝3 まで');
    expect(customBod).toContain('後手番');
    expect(parseBodToPosition(customBod)?.sfen).toBe(customSfen);
  });
});
