/**
 * Unit tests for ShogiGUI / PiyoShogi-style Position Editor utilities.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { describe, expect, it } from 'vitest';
import {
  ALL_TO_BOX_SFEN,
  HIRATE_SFEN,
  TSUMEGO_BOX_SFEN,
  TSUMEGO_INITIAL_SFEN,
  applyEditBoxClick,
  applyEditHandClick,
  applyEditSquareClick,
  applyEditSquareRightClick,
  buildUsiSequenceSnapshots,
  canPlaceInHand,
  createJkfPlayerFromSfen,
  getPieceBoxCounts,
  hasBothKingsInSfen,
  parsePositionSfen,
  serializePositionSfen,
} from './positionEditor';

describe('positionEditor', () => {
  it('computes piece-box counts for HIRATE, TSUMEGO_INITIAL, TSUMEGO_BOX, and ALL_TO_BOX', () => {
    const hirateBox = getPieceBoxCounts(parsePositionSfen(HIRATE_SFEN));
    expect(Object.values(hirateBox).every((n) => n === 0)).toBe(true);

    const tsumegoHandPos = parsePositionSfen(TSUMEGO_INITIAL_SFEN);
    const tsumegoHandBox = getPieceBoxCounts(tsumegoHandPos);
    expect(tsumegoHandBox).toEqual({ K: 1, R: 0, B: 0, G: 0, S: 0, N: 0, L: 0, P: 0 });
    expect(tsumegoHandPos.board[0]![4]).toBe('k');

    const tsumegoBox = getPieceBoxCounts(parsePositionSfen(TSUMEGO_BOX_SFEN));
    expect(tsumegoBox).toEqual({ K: 1, R: 2, B: 2, G: 4, S: 4, N: 4, L: 4, P: 18 });

    const allBox = getPieceBoxCounts(parsePositionSfen(ALL_TO_BOX_SFEN));
    expect(allBox).toEqual({ K: 2, R: 2, B: 2, G: 4, S: 4, N: 4, L: 4, P: 18 });
  });

  it('cycles piece orientation/promotion and auto-deselects, and supports right-click rotation', () => {
    // 5e Pawn ('P') & 4e Gold ('G')
    let pos = parsePositionSfen('4k4/9/9/9/4PG3/9/9/9/4K4 b - 1');

    // First click selects 5,5; second click rotates -> '+P' and immediately clears selection
    const s1 = applyEditSquareClick(pos, null, 5, 5);
    expect(s1.changed).toBe(false);
    expect(s1.nextSelection).toEqual({ source: 'board', x: 5, y: 5, piece: 'P' });

    const c1 = applyEditSquareClick(s1.pos, s1.nextSelection, 5, 5);
    expect(c1.changed).toBe(true);
    expect(c1.pos.board[4]![4]).toBe('+P');
    expect(c1.nextSelection).toBeNull();

    // Immediately clicking another occupied piece (4,5) after rotating 5,5 selects it instead of moving
    const nextClick = applyEditSquareClick(c1.pos, c1.nextSelection, 4, 5);
    expect(nextClick.changed).toBe(false);
    expect(nextClick.nextSelection).toEqual({ source: 'board', x: 4, y: 5, piece: 'G' });
    expect(nextClick.pos.board[4]![4]).toBe('+P');

    // Re-selecting and rotating cycles cleanly: '+P' -> 'p' -> '+p' -> 'P'
    const s2 = applyEditSquareClick(c1.pos, null, 5, 5);
    const c2 = applyEditSquareClick(s2.pos, s2.nextSelection, 5, 5);
    expect(c2.pos.board[4]![4]).toBe('p');
    expect(c2.nextSelection).toBeNull();

    const s3 = applyEditSquareClick(c2.pos, null, 5, 5);
    const c3 = applyEditSquareClick(s3.pos, s3.nextSelection, 5, 5);
    expect(c3.pos.board[4]![4]).toBe('+p');
    expect(c3.nextSelection).toBeNull();

    const s4 = applyEditSquareClick(c3.pos, null, 5, 5);
    const c4 = applyEditSquareClick(s4.pos, s4.nextSelection, 5, 5);
    expect(c4.pos.board[4]![4]).toBe('P');
    expect(c4.nextSelection).toBeNull();

    // Right-click Gold ('G' on 4e -> file 4, rank 5) toggles Sente <-> Gote directly
    pos = parsePositionSfen('4k4/9/9/9/4PG3/9/9/9/4K4 b - 1');
    const r1 = applyEditSquareRightClick(pos, 4, 5);
    expect(r1.changed).toBe(true);
    expect(r1.pos.board[4]![5]).toBe('g');
    const r2 = applyEditSquareRightClick(r1.pos, 4, 5);
    expect(r2.pos.board[4]![5]).toBe('G');
  });

  it('moves pieces freely across board, Sente/Gote Komadai, and piece box while guarding Kings from hands', () => {
    let pos = parsePositionSfen(TSUMEGO_BOX_SFEN);

    // 1. Box 'R' -> board 5c (x=5, y=3)
    const b1 = applyEditBoxClick(pos, null, 'R');
    expect(b1.nextSelection).toEqual({ source: 'box', base: 'R' });
    const m1 = applyEditSquareClick(pos, b1.nextSelection, 5, 3);
    expect(m1.changed).toBe(true);
    expect(m1.pos.board[2]![4]).toBe('R');
    expect(getPieceBoxCounts(m1.pos).R).toBe(1);
    pos = m1.pos;

    // 2. Board 5c 'R' -> Sente hand
    const sel5c = applyEditSquareClick(pos, null, 5, 3);
    const toSenteHand = applyEditHandClick(pos, sel5c.nextSelection, 0);
    expect(toSenteHand.changed).toBe(true);
    expect(toSenteHand.pos.board[2]![4]).toBe('');
    expect(toSenteHand.pos.hand.R).toBe(1);
    pos = toSenteHand.pos;

    // 3. Sente hand 'HI' -> Gote hand
    const selHand = applyEditHandClick(pos, null, 0, 'HI');
    expect(selHand.nextSelection).toEqual({ source: 'hand', color: 0, base: 'R' });
    const toGoteHand = applyEditHandClick(pos, selHand.nextSelection, 1);
    expect(toGoteHand.pos.hand.R).toBeUndefined();
    expect(toGoteHand.pos.hand.r).toBe(1);
    pos = toGoteHand.pos;

    // 4. Gote hand 'HI' -> Piece Box
    const selGoteHand = applyEditHandClick(pos, null, 1, 'HI');
    const toBox = applyEditBoxClick(pos, selGoteHand.nextSelection);
    expect(toBox.changed).toBe(true);
    expect(toBox.pos.hand.r).toBeUndefined();
    expect(getPieceBoxCounts(toBox.pos).R).toBe(2);

    // 5. King cannot be moved into hand
    const kingSel = applyEditSquareClick(toBox.pos, null, 5, 1);
    expect(canPlaceInHand(kingSel.nextSelection)).toBe(false);
    const kingHandAttempt = applyEditHandClick(toBox.pos, kingSel.nextSelection, 0);
    expect(kingHandAttempt.changed).toBe(false);
    expect(kingHandAttempt.pos.board[0]![4]).toBe('k');

    // 6. Displacing an existing board piece returns it cleanly to piece box
    const gBox = applyEditBoxClick(toBox.pos, null, 'G');
    const placeGold = applyEditSquareClick(toBox.pos, gBox.nextSelection, 5, 5);
    const sBox = applyEditBoxClick(placeGold.pos, null, 'S');
    const replaceWithSilver = applyEditSquareClick(placeGold.pos, sBox.nextSelection, 5, 5);
    expect(replaceWithSilver.pos.board[4]![4]).toBe('S');
    expect(getPieceBoxCounts(replaceWithSilver.pos).G).toBe(4);
    expect(getPieceBoxCounts(replaceWithSilver.pos).S).toBe(3);
  });

  it('round-trips Kingless Tsume-shogi SFENs and Gote-to-move SFENs through JKFPlayer', () => {
    const p1 = createJkfPlayerFromSfen(TSUMEGO_INITIAL_SFEN, { '先手': '攻め方', '後手': '玉方' });
    expect(serializePositionSfen(parsePositionSfen(p1.shogi.toSFENString()))).toBe(TSUMEGO_INITIAL_SFEN);

    const goteTurnSfen = '4k4/9/4G4/9/9/9/9/9/9 w r 1';
    const p2 = createJkfPlayerFromSfen(goteTurnSfen);
    expect(p2.shogi.toSFENString()).toBe(goteTurnSfen);

    const asymmetricSfen = '1n6k/9/9/9/9/9/9/1B5R1/L8 b G 1';
    const p3 = createJkfPlayerFromSfen(asymmetricSfen);
    expect(p3.shogi.toSFENString()).toBe(asymmetricSfen);
  });

  it('checks presence of both Kings and builds USI sequence snapshots with 同 notation', () => {
    expect(hasBothKingsInSfen(HIRATE_SFEN)).toBe(true);
    expect(hasBothKingsInSfen(TSUMEGO_INITIAL_SFEN)).toBe(false);
    expect(hasBothKingsInSfen(ALL_TO_BOX_SFEN)).toBe(false);

    const tsumeSfen = '7nk/7p1/6+RsP/9/9/9/9/9/7L1 b G 1';
    const snaps = buildUsiSequenceSnapshots(tsumeSfen, ['G*1b', '2c1b', '3c2b']);
    expect(snaps).toHaveLength(3);
    expect(snaps[0]!.label).toBe('▲１二金打');
    expect(snaps[0]!.lastMove).toEqual({ from: undefined, to: { x: 1, y: 2 } });
    expect(snaps[1]!.label).toBe('△同銀');
    expect(snaps[1]!.lastMove).toEqual({ from: { x: 2, y: 3 }, to: { x: 1, y: 2 } });
    expect(snaps[2]!.label).toBe('▲２二龍');
    expect(snaps[2]!.sfen).toBe('7nk/7+Rs/8P/9/9/9/9/9/7L1 w Pg 1');
  });
});
