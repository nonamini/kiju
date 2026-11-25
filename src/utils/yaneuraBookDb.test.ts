import { describe, it, expect } from 'vitest';
import {
  parseYaneuraBookDb,
  parseSbkBookText,
  parseSbkProtobuf,
  serializeYaneuraBookDb,
  lookupBookMoves,
  normalizeSfenKey,
} from './yaneuraBookDb';

const SAMPLE_DB = `#YANEURAOU-DB2016 1.00
sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1
7g7f 3c3d 12 20 150
2g2f 8c8d 25 22 300
sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2
3c3d 2g2f -10 18 120
`;

describe('yaneuraBookDb', () => {
  it('normalizes SFEN by stripping ply counter', () => {
    expect(
      normalizeSfenKey('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1')
    ).toBe('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b -');
  });

  it('parses YaneuraOu-DB2016 and looks up moves sorted by count', () => {
    const book = parseYaneuraBookDb(SAMPLE_DB);
    expect(book.size).toBe(2);

    const moves = lookupBookMoves(
      book,
      'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 99'
    );
    expect(moves).toHaveLength(2);
    expect(moves[0]?.bestMove).toBe('2g2f');
    expect(moves[0]?.count).toBe(300);
    expect(moves[1]?.bestMove).toBe('7g7f');
  });

  it('round-trips through serializeYaneuraBookDb', () => {
    const book = parseYaneuraBookDb(SAMPLE_DB);
    const text = serializeYaneuraBookDb(book);
    expect(text.startsWith('#YANEURAOU-DB2016 1.00')).toBe(true);
    const reparsed = parseYaneuraBookDb(text);
    expect(reparsed.size).toBe(2);
  });

  it('parses ShogiGUI .sbk bare SFEN format', () => {
    const sbk = [
      'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
      '7g7f 20 18 100',
      '2g2f 30 20 200',
    ].join('\n');
    const book = parseSbkBookText(sbk);
    expect(book.size).toBe(1);
    const moves = lookupBookMoves(
      book,
      'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1'
    );
    expect(moves[0]?.bestMove).toBe('2g2f');
  });

  const writeVarint = (n: number | bigint): number[] => {
    const out: number[] = [];
    let v = typeof n === 'bigint' ? BigInt.asUintN(64, n) : BigInt.asUintN(64, BigInt(n | 0));
    while (v >= 0x80n) {
      out.push(Number(v & 0x7fn) | 0x80);
      v >>= 7n;
    }
    out.push(Number(v));
    return out;
  };

  const encodeSbkMoveInt = (
    fromSuji: number,
    fromDan: number,
    toSuji: number,
    toDan: number
  ): number => (toSuji << 12) | (toDan << 8) | (fromSuji << 4) | fromDan;

  it('decodes binary Protobuf .sbk ShogiLib.SBook states and bit-packed moves', () => {
    const enc = new TextEncoder();
    const sfenBytes = enc.encode('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1');
    const move7g7f = encodeSbkMoveInt(7, 7, 7, 6);
    // SBookMove: field 1 (varint move7g7f), field 3 (varint weight=10), field 4 (varint nextStateId=2)
    const moveMsg = new Uint8Array([0x08, ...writeVarint(move7g7f), 0x18, 10, 0x20, 2]);
    // SBookState 1: field 1 (id=1), field 7 (Position), field 9 (Moves)
    const state1 = new Uint8Array([
      0x08,
      1,
      0x3a,
      sfenBytes.length,
      ...sfenBytes,
      0x4a,
      moveMsg.length,
      ...moveMsg,
    ]);
    // SBookEval for state 2: field 1 (score=42), field 2 (depth=18)
    const evalMsg = new Uint8Array([0x08, 42, 0x10, 18]);
    // SBookState 2: field 1 (id=2), field 10 (Evals)
    const state2 = new Uint8Array([0x08, 2, 0x52, evalMsg.length, ...evalMsg]);
    // Root SBook: field 3 (BookStates) x 2
    const root = new Uint8Array([
      0x1a,
      state1.length,
      ...state1,
      0x1a,
      state2.length,
      ...state2,
    ]);
    const book = parseSbkProtobuf(root.buffer);
    expect(book.size).toBe(1);
    const moves = lookupBookMoves(
      book,
      'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1'
    );
    expect(moves[0]?.bestMove).toBe('7g7f');
    expect(moves[0]?.count).toBe(10);
    expect(moves[0]?.score).toBe(42);
    expect(moves[0]?.depth).toBe(18);
  });

  it('decodes mid-game-only .sbk where Position is omitted and id:0 root has no direct moves', () => {
    // SBookState 0: root state with id: 0, no Position, no direct Moves
    const state0 = new Uint8Array([0x08, 0]);
    // Unreferenced state 10 starts the move chain: 7g7f -> state 11
    const move7g7fMsg = new Uint8Array([
      0x08,
      ...writeVarint(encodeSbkMoveInt(7, 7, 7, 6)),
      0x18,
      25,
      0x20,
      11,
    ]);
    const state10 = new Uint8Array([
      0x08,
      10,
      0x4a,
      ...writeVarint(move7g7fMsg.length),
      ...move7g7fMsg,
    ]);
    // Child state 11: eval (score=35, depth=20) and follow-up move 3c3d
    const move3c3dMsg = new Uint8Array([
      0x08,
      ...writeVarint(encodeSbkMoveInt(3, 3, 3, 4)),
      0x18,
      15,
    ]);
    const eval11Msg = new Uint8Array([0x08, 35, 0x10, 20]);
    const state11 = new Uint8Array([
      0x08,
      11,
      0x4a,
      ...writeVarint(move3c3dMsg.length),
      ...move3c3dMsg,
      0x52,
      ...writeVarint(eval11Msg.length),
      ...eval11Msg,
    ]);
    const root = new Uint8Array([
      0x1a,
      state0.length,
      ...state0,
      0x1a,
      state10.length,
      ...state10,
      0x1a,
      state11.length,
      ...state11,
    ]);

    const book = parseSbkProtobuf(root.buffer);
    expect(book.size).toBe(2);

    const initialMoves = lookupBookMoves(
      book,
      'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1'
    );
    expect(initialMoves).toHaveLength(1);
    expect(initialMoves[0]?.bestMove).toBe('7g7f');
    expect(initialMoves[0]?.count).toBe(25);
    expect(initialMoves[0]?.score).toBe(35);
    expect(initialMoves[0]?.depth).toBe(20);

    const after7g7fMoves = lookupBookMoves(
      book,
      'lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2'
    );
    expect(after7g7fMoves).toHaveLength(1);
    expect(after7g7fMoves[0]?.bestMove).toBe('3c3d');
    expect(after7g7fMoves[0]?.count).toBe(15);
  });

  it('decodes 64-bit BoardKey, negative White moves, negative evals, and id:0 root', () => {
    const move7g7fMsg = new Uint8Array([
      0x08,
      ...writeVarint(encodeSbkMoveInt(7, 7, 7, 6)),
      0x18,
      30,
      0x20,
      1,
    ]);
    // SBookState 0: field 1 (id=0), field 2 (64-bit BoardKey, 10 bytes), field 9 (Moves)
    const state0 = new Uint8Array([
      0x08,
      0,
      0x10,
      ...writeVarint(0xfedcba9876543210n),
      0x4a,
      ...writeVarint(move7g7fMsg.length),
      ...move7g7fMsg,
    ]);

    // White move has bit 31 = 1 (negative int32 -> 10-byte two's complement varint)
    const whiteMove3c3d = encodeSbkMoveInt(3, 3, 3, 4) | (1 << 31);
    const move3c3dMsg = new Uint8Array([
      0x08,
      ...writeVarint(whiteMove3c3d),
      0x18,
      12,
    ]);
    // Negative EvalutionValue (-120) -> 10-byte varint
    const eval1Msg = new Uint8Array([0x08, ...writeVarint(-120), 0x10, 22]);
    // SBookState 1: field 1 (id=1), field 2 (64-bit BoardKey), field 9 (Moves), field 10 (Evals)
    const state1 = new Uint8Array([
      0x08,
      1,
      0x10,
      ...writeVarint(0x8123456789abcdefn),
      0x4a,
      ...writeVarint(move3c3dMsg.length),
      ...move3c3dMsg,
      0x52,
      ...writeVarint(eval1Msg.length),
      ...eval1Msg,
    ]);

    const root = new Uint8Array([
      0x1a,
      ...writeVarint(state0.length),
      ...state0,
      0x1a,
      ...writeVarint(state1.length),
      ...state1,
    ]);

    const book = parseSbkProtobuf(root.buffer);
    expect(book.size).toBe(2);

    const initialMoves = lookupBookMoves(
      book,
      'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1'
    );
    expect(initialMoves).toHaveLength(1);
    expect(initialMoves[0]?.bestMove).toBe('7g7f');
    expect(initialMoves[0]?.count).toBe(30);
    expect(initialMoves[0]?.score).toBe(-120);
    expect(initialMoves[0]?.depth).toBe(22);

    const after7g7fMoves = lookupBookMoves(
      book,
      'lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2'
    );
    expect(after7g7fMoves).toHaveLength(1);
    expect(after7g7fMoves[0]?.bestMove).toBe('3c3d');
    expect(after7g7fMoves[0]?.count).toBe(12);
  });

  it('does not seed illegal initial-position moves onto the initial SFEN', () => {
    const state0 = new Uint8Array([0x08, 0]);
    // 8h7g captures own pawn on 7g from initial position -> illegal
    const move8h7gMsg = new Uint8Array([
      0x08,
      ...writeVarint(encodeSbkMoveInt(8, 8, 7, 7)),
      0x18,
      10,
    ]);
    const state6 = new Uint8Array([
      0x08,
      6,
      0x4a,
      ...writeVarint(move8h7gMsg.length),
      ...move8h7gMsg,
    ]);
    const root = new Uint8Array([
      0x1a,
      ...writeVarint(state0.length),
      ...state0,
      0x1a,
      ...writeVarint(state6.length),
      ...state6,
    ]);

    const book = parseSbkProtobuf(root.buffer);
    expect(book.size).toBe(0);
    expect(
      lookupBookMoves(
        book,
        'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1'
      )
    ).toEqual([]);
  });

  it('decodes White drop moves whose piece byte includes ShogiLib WhiteFlag (0x10)', () => {
    const enc = new TextEncoder();
    const startSfen = 'lnsgk1snl/1r5g1/pppppp1pp/6p2/9/2P6/PP1PPPPPP/7R1/LNSGKGSNL w Bb 5';
    const sfenBytes = enc.encode(startSfen);
    // White bishop drop B*5e: piece = WKAK (6 | 0x10 = 22), bit 31 = WhiteFlag
    const whiteBishopDrop5e = (5 << 12) | (5 << 8) | ((6 | 0x10) << 24) | (1 << 31);
    const dropMsg = new Uint8Array([
      0x08,
      ...writeVarint(whiteBishopDrop5e),
      0x18,
      20,
      0x20,
      1,
    ]);
    const state0 = new Uint8Array([
      0x08,
      0,
      0x3a,
      ...writeVarint(sfenBytes.length),
      ...sfenBytes,
      0x4a,
      ...writeVarint(dropMsg.length),
      ...dropMsg,
    ]);

    // Child state 1 after B*5e has Black follow-up 5i6h (omitted Position)
    const replyMsg = new Uint8Array([
      0x08,
      ...writeVarint(encodeSbkMoveInt(5, 9, 6, 8)),
      0x18,
      10,
    ]);
    const state1 = new Uint8Array([
      0x08,
      1,
      0x4a,
      ...writeVarint(replyMsg.length),
      ...replyMsg,
    ]);

    const root = new Uint8Array([
      0x1a,
      ...writeVarint(state0.length),
      ...state0,
      0x1a,
      ...writeVarint(state1.length),
      ...state1,
    ]);

    const book = parseSbkProtobuf(root.buffer);
    expect(book.size).toBe(2);

    const dropMoves = lookupBookMoves(book, startSfen);
    expect(dropMoves).toHaveLength(1);
    expect(dropMoves[0]?.bestMove).toBe('B*5e');
    expect(dropMoves[0]?.count).toBe(20);

    const afterDropMoves = lookupBookMoves(
      book,
      'lnsgk1snl/1r5g1/pppppp1pp/6p2/4b4/2P6/PP1PPPPPP/7R1/LNSGKGSNL b B 6'
    );
    expect(afterDropMoves).toHaveLength(1);
    expect(afterDropMoves[0]?.bestMove).toBe('5i6h');
    expect(afterDropMoves[0]?.count).toBe(10);
  });
});
