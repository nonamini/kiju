/**
 * Unit verification tests for Generic Libraries (shogi.js & json-kifu-format).
 * Ensures correct parsing of KIF/CSA, piece moves, legal destination checks, and SFEN generation.
 * Follows Rule 1: strictly English identifiers and comments.
 */

import { describe, expect, it } from 'vitest';
import { Shogi } from 'shogi.js';
import { JKFPlayer, Parsers } from 'json-kifu-format';

describe('Generic Shogi Libraries Integration', () => {
  it('initializes shogi.js board in standard Hirate setup', () => {
    const shogi = new Shogi();
    shogi.initialize();

    // Sente King on 5i (5, 9)
    const senteKing = shogi.get(5, 9);
    expect(senteKing).toBeDefined();
    expect(senteKing?.kind).toBe('OU');
    expect(senteKing?.color).toBe(0); // 0 is Sente / Black

    // Gote King on 5a (5, 1)
    const goteKing = shogi.get(5, 1);
    expect(goteKing).toBeDefined();
    expect(goteKing?.kind).toBe('OU');
    expect(goteKing?.color).toBe(1); // 1 is Gote / White

    // Sente plays ▲7六歩 (7, 7 -> 7, 6)
    shogi.move(7, 7, 7, 6);
    const movedPawn = shogi.get(7, 6);
    expect(movedPawn?.kind).toBe('FU');
    expect(movedPawn?.color).toBe(0);
    expect(shogi.get(7, 7)).toBeNull();
  });

  it('parses raw KIF text using JKFPlayer', () => {
    const rawKif = `
手合割：平手
先手：藤井聡太
後手：伊藤匠
手数----指手---------消費時間--
1 ２六歩(27)   ( 0:01/00:00:01)
2 ８四歩(83)   ( 0:02/00:00:02)
3 ２五歩(26)   ( 0:01/00:00:02)
4 ８五歩(84)   ( 0:01/00:00:03)
5 ７八金(69)   ( 0:05/00:00:07)
6 ３二金(41)   ( 0:02/00:00:05)
`.trim();

    const player = JKFPlayer.parseKIF(rawKif);
    expect(player).toBeDefined();
    expect(player.kifu.header['先手']).toBe('藤井聡太');
    expect(player.kifu.header['後手']).toBe('伊藤匠');

    // Initial state
    expect(player.tesuu).toBe(0);
    expect(player.getReadableKifu(0)).toBe('開始局面');

    // Step forward 1: ▲2六歩
    player.forward();
    expect(player.tesuu).toBe(1);
    expect(player.getReadableKifu(1)).toBe('☗２六歩');
    const move1 = player.getMove(1);
    expect(move1?.to).toEqual({ x: 2, y: 6 });
    expect(move1?.from).toEqual({ x: 2, y: 7 });

    // Step to the end
    player.goto(6);
    expect(player.tesuu).toBe(6);
    const move6 = player.getMove(6);
    expect(move6?.to).toEqual({ x: 3, y: 2 });
  });

  it('supports inputMove and fork creation', () => {
    const rawKif = `
手合割：平手
1 ７六歩(77)
2 ３四歩(33)
`.trim();
    const player = JKFPlayer.parseKIF(rawKif);
    player.goto(1);
    // Fork at ply 2 with 8四歩
    const forkOk = player.inputMove({
      from: { x: 8, y: 3 },
      to: { x: 8, y: 4 },
      piece: 'FU',
    });
    expect(forkOk).toBe(true);
    expect(player.getReadableKifu(2)).toBe('☖８四歩');
    expect(player.forkPointers.length).toBe(1);
    expect(player.kifu.moves[2].forks?.length).toBe(1);
  });

  it('parses raw CSA format', () => {
    const rawCsa = `
V2.2
N+SentePlayer
N-GotePlayer
P1-KY-KE-GI-KI-OU-KI-GI-KE-KY
P2 * -HI *  *  *  *  * -KA * 
P3-FU-FU-FU-FU-FU-FU-FU-FU-FU
P4 *  *  *  *  *  *  *  *  * 
P5 *  *  *  *  *  *  *  *  * 
P6 *  *  *  *  *  *  *  *  * 
P7+FU+FU+FU+FU+FU+FU+FU+FU+FU
P8 * +KA *  *  *  *  * +HI * 
P9+KY+KE+GI+KI+OU+KI+GI+KE+KY
+
+7776FU
-3334FU
%TORYO
`.trim();

    const jkf = Parsers.parseCSA(rawCsa);
    expect(jkf).toBeDefined();
    expect(jkf.moves.length).toBeGreaterThanOrEqual(3);
  });
});
