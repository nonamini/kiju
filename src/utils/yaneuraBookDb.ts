/**
 * YaneuraOu / ShogiHome compatible Opening Book (.db) parser, serializer, and lookup utility.
 * Supports `#YANEURAOU-DB2016 1.00` text format:
 *   sfen <SFEN>
 *   <bestMove> <nextMove> <score> <depth> <count>
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict without any (Rule 2).
 */

import { idbGet, idbSet } from './idbKeyVal';

export const YANEURA_BOOK_IDB_KEY = 'joseki_tree_yaneura_book_db_v1';
export const YANEURA_BOOK_HANDLE_IDB_KEY = 'joseki_tree_yaneura_book_file_handle_v1';
export const YANEURA_BOOK_PROFILES_KEY = 'joseki_tree_yaneura_book_profiles_v1';

export interface BookProfile {
  id: string;
  name: string;
  fileName: string;
}

export function loadBookProfiles(): BookProfile[] {
  try {
    const raw = localStorage.getItem(YANEURA_BOOK_PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BookProfile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveBookProfiles(profiles: BookProfile[]): void {
  try {
    localStorage.setItem(YANEURA_BOOK_PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    // ignore
  }
}

export async function pickBookFileHandleOnly(): Promise<BookFileHandleLike | null> {
  if (!isBookFilePickerSupported()) return null;
  const picker = (
    window as unknown as {
      showOpenFilePicker: (opts?: {
        multiple?: boolean;
        types?: Array<{ description?: string; accept: Record<string, string[]> }>;
      }) => Promise<BookFileHandleLike[]>;
    }
  ).showOpenFilePicker;
  const handles = await picker({
    multiple: false,
    types: [{ description: 'Opening Book (.db, .sbk)', accept: { 'text/plain': ['.db', '.sbk', '.txt'] } }],
  });
  return handles[0] ?? null;
}

export async function saveRegisteredBookProfile(
  handle: BookFileHandleLike,
  customName?: string
): Promise<BookProfile> {
  const id = `book_${Date.now()}`;
  const profile: BookProfile = {
    id,
    name: customName?.trim() || handle.name.replace(/\.(db|sbk|txt)$/i, ''),
    fileName: handle.name,
  };
  await idbSet(`${YANEURA_BOOK_HANDLE_IDB_KEY}_${id}`, handle);
  const next = [...loadBookProfiles(), profile];
  saveBookProfiles(next);
  return profile;
}

export async function registerBookProfile(customName?: string): Promise<BookProfile | null> {
  if (!isBookFilePickerSupported()) return null;
  const picker = (
    window as unknown as {
      showOpenFilePicker: (opts?: {
        multiple?: boolean;
        types?: Array<{ description?: string; accept: Record<string, string[]> }>;
      }) => Promise<BookFileHandleLike[]>;
    }
  ).showOpenFilePicker;
  const handles = await picker({
    multiple: false,
    types: [{ description: 'Opening Book (.db, .sbk)', accept: { 'text/plain': ['.db', '.sbk', '.txt'] } }],
  });
  const handle = handles[0];
  if (!handle) return null;
  const id = `book_${Date.now()}`;
  const profile: BookProfile = {
    id,
    name: customName?.trim() || handle.name.replace(/\.(db|sbk|txt)$/i, ''),
    fileName: handle.name,
  };
  await idbSet(`${YANEURA_BOOK_HANDLE_IDB_KEY}_${id}`, handle);
  const next = [...loadBookProfiles(), profile];
  saveBookProfiles(next);
  return profile;
}

export async function removeBookProfile(id: string): Promise<void> {
  const next = loadBookProfiles().filter((p) => p.id !== id);
  saveBookProfiles(next);
  await idbSet(`${YANEURA_BOOK_HANDLE_IDB_KEY}_${id}`, null);
}

export async function loadBookByProfileId(
  id: string
): Promise<{ fileName: string; book: Map<string, YaneuraBookEntry[]> } | null> {
  const profile = loadBookProfiles().find((p) => p.id === id);
  if (!profile) return null;
  const handle = await idbGet<BookFileHandleLike>(`${YANEURA_BOOK_HANDLE_IDB_KEY}_${id}`);
  if (!handle) return null;
  if (handle.queryPermission && handle.requestPermission) {
    const status = await handle.queryPermission({ mode: 'read' });
    if (status !== 'granted') {
      const req = await handle.requestPermission({ mode: 'read' });
      if (req !== 'granted') return null;
    }
  }
  const file = await handle.getFile();
  const book = await parseYaneuraBookDbFile(file);
  setInMemoryYaneuraBook(profile.name, book);
  return { fileName: profile.name, book };
}

interface BookFileHandleLike {
  name: string;
  getFile: () => Promise<File>;
  queryPermission?: (desc: { mode: 'read' }) => Promise<string>;
  requestPermission?: (desc: { mode: 'read' }) => Promise<string>;
}

export function isBookFilePickerSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker ===
      'function'
  );
}

export async function pickAndLoadYaneuraBookWithHandle(): Promise<{
  fileName: string;
  book: Map<string, YaneuraBookEntry[]>;
} | null> {
  if (!isBookFilePickerSupported()) return null;
  const picker = (
    window as unknown as {
      showOpenFilePicker: (opts?: {
        multiple?: boolean;
        types?: Array<{ description?: string; accept: Record<string, string[]> }>;
      }) => Promise<BookFileHandleLike[]>;
    }
  ).showOpenFilePicker;
  const handles = await picker({
    multiple: false,
    types: [{ description: 'Opening Book (.db, .sbk)', accept: { 'text/plain': ['.db', '.sbk', '.txt'] } }],
  });
  const handle = handles[0];
  if (!handle) return null;
  await idbSet(YANEURA_BOOK_HANDLE_IDB_KEY, handle);
  const file = await handle.getFile();
  const book = await parseYaneuraBookDbFile(file);
  setInMemoryYaneuraBook(handle.name, book);
  return { fileName: handle.name, book };
}

export async function getSavedYaneuraBookFileName(): Promise<string | null> {
  try {
    const handle = await idbGet<BookFileHandleLike>(YANEURA_BOOK_HANDLE_IDB_KEY);
    return handle?.name ?? null;
  } catch {
    return null;
  }
}

export async function reloadSavedYaneuraBookFile(): Promise<{
  fileName: string;
  book: Map<string, YaneuraBookEntry[]>;
} | null> {
  const handle = await idbGet<BookFileHandleLike>(YANEURA_BOOK_HANDLE_IDB_KEY);
  if (!handle) return null;
  if (handle.queryPermission && handle.requestPermission) {
    const status = await handle.queryPermission({ mode: 'read' });
    if (status !== 'granted') {
      const req = await handle.requestPermission({ mode: 'read' });
      if (req !== 'granted') return null;
    }
  }
  const file = await handle.getFile();
  const book = await parseYaneuraBookDbFile(file);
  setInMemoryYaneuraBook(handle.name, book);
  return { fileName: handle.name, book };
}

export async function clearSavedYaneuraBookFileHandle(): Promise<void> {
  await idbSet(YANEURA_BOOK_HANDLE_IDB_KEY, null);
}

let inMemoryBookFileName: string | null = null;
let inMemoryBookMap: Map<string, YaneuraBookEntry[]> | null = null;

export function getInMemoryYaneuraBook(): {
  fileName: string;
  book: Map<string, YaneuraBookEntry[]>;
} | null {
  if (!inMemoryBookFileName || !inMemoryBookMap) return null;
  return { fileName: inMemoryBookFileName, book: inMemoryBookMap };
}

export function setInMemoryYaneuraBook(
  fileName: string | null,
  book: Map<string, YaneuraBookEntry[]> | null
): void {
  inMemoryBookFileName = fileName;
  inMemoryBookMap = book;
}

/**
 * Parses a ShogiGUI (.sbk) text book into a Map keyed by normalized SFEN.
 * Supports lines of `sfen <SFEN>` or bare 4-field SFEN lines followed by
 * `<usiMove> <score_or_count> ...` entries.
 */
export function parseSbkBookText(text: string): Map<string, YaneuraBookEntry[]> {
  const book = new Map<string, YaneuraBookEntry[]>();
  const lines = text.split(/\r?\n/);
  let currentKey: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    if (line.startsWith('sfen ')) {
      currentKey = normalizeSfenKey(line.slice(5));
      if (!book.has(currentKey)) book.set(currentKey, []);
      continue;
    }

    // Bare SFEN line detection (contains '/' and ' b ' or ' w ')
    if (line.includes('/') && (line.includes(' b ') || line.includes(' w '))) {
      currentKey = normalizeSfenKey(line);
      if (!book.has(currentKey)) book.set(currentKey, []);
      continue;
    }

    if (!currentKey) continue;
    const cols = line.split(/\s+/);
    const bestMove = cols[0] ?? '';
    if (!bestMove || !/^[1-9A-Za-z*+]+$/.test(bestMove)) continue;

    const col1 = Number.parseInt(cols[1] ?? '0', 10) || 0;
    const col2 = Number.parseInt(cols[2] ?? '0', 10) || 0;
    const col3 = Number.parseInt(cols[3] ?? '1', 10) || 1;
    book.get(currentKey)!.push({
      bestMove,
      nextMove: 'none',
      score: col1,
      depth: col2,
      count: col3,
    });
  }

  return book;
}

/**
 * Decode a binary ShogiGUI `.sbk` (Protocol Buffers `ShogiLib.SBook`) file.
 * Schema reference: ai5/BookConv `BookConv/Book/book.proto`.
 */
export function parseSbkProtobuf(buffer: ArrayBuffer): Map<string, YaneuraBookEntry[]> {
  const bytes = new Uint8Array(buffer);
  const book = new Map<string, YaneuraBookEntry[]>();
  const decoder = new TextDecoder('utf-8');

  const readVarint = (pos: number): [number, number] => {
    let val = 0;
    let shift = 0;
    let p = pos;
    while (p < bytes.length) {
      const b = bytes[p++]!;
      if (shift < 32) {
        val |= (b & 0x7f) << shift;
      }
      if ((b & 0x80) === 0) break;
      shift += 7;
      if (shift >= 70) break;
    }
    return [val >>> 0, p];
  };

  const skipField = (wireType: number, pos: number): number => {
    if (wireType === 0) {
      const [, next] = readVarint(pos);
      return next;
    }
    if (wireType === 1) return pos + 8;
    if (wireType === 2) {
      const [len, start] = readVarint(pos);
      return start + len;
    }
    if (wireType === 5) return pos + 4;
    return bytes.length;
  };

  const DROP_PIECE_CHARS = ['', 'P', 'L', 'N', 'S', 'G', 'B', 'R'];

  const decodeSbkMoveInt = (moveInt: number): string | null => {
    const fromDan = moveInt & 0x0f;
    const fromSuji = (moveInt >> 4) & 0x0f;
    const toDan = (moveInt >> 8) & 0x0f;
    const toSuji = (moveInt >> 12) & 0x0f;
    if (toDan < 1 || toDan > 9 || toSuji < 1 || toSuji > 9) return null;
    const toStr = `${toSuji}${String.fromCharCode(96 + toDan)}`;
    if (fromDan === 0 && fromSuji === 0) {
      const piece = (moveInt >> 24) & 0x07;
      const pieceChar = DROP_PIECE_CHARS[piece];
      if (!pieceChar) return null;
      return `${pieceChar}*${toStr}`;
    }
    if (fromDan < 1 || fromDan > 9 || fromSuji < 1 || fromSuji > 9) return null;
    const fromStr = `${fromSuji}${String.fromCharCode(96 + fromDan)}`;
    const promo = ((moveInt >> 19) & 1) !== 0 ? '+' : '';
    return `${fromStr}${toStr}${promo}`;
  };

  interface RawSbkMove {
    bestMove: string;
    weight: number;
    nextStateId: number;
  }

  interface RawSbkState {
    id: number;
    sfenKey: string | null;
    moves: RawSbkMove[];
    score: number;
    depth: number;
  }

  const decodeMoveSubmessage = (start: number, end: number): RawSbkMove | null => {
    let p = start;
    let moveInt = 0;
    let weight = 1;
    let nextStateId = 0;
    while (p < end) {
      const [tag, afterTag] = readVarint(p);
      const fieldNum = tag >>> 3;
      const wireType = tag & 0x07;
      p = afterTag;
      if (wireType === 0) {
        const [v, next] = readVarint(p);
        const signed = v | 0;
        if (fieldNum === 1) moveInt = signed;
        else if (fieldNum === 3) weight = signed > 0 ? signed : 1;
        else if (fieldNum === 4) nextStateId = signed;
        p = next;
      } else {
        p = skipField(wireType, p);
      }
    }
    const bestMove = decodeSbkMoveInt(moveInt);
    if (!bestMove) return null;
    return { bestMove, weight, nextStateId };
  };

  const decodeEvalSubmessage = (start: number, end: number): { score: number; depth: number } => {
    let p = start;
    let score = 0;
    let depth = 0;
    while (p < end) {
      const [tag, afterTag] = readVarint(p);
      const fieldNum = tag >>> 3;
      const wireType = tag & 0x07;
      p = afterTag;
      if (wireType === 0) {
        const [v, next] = readVarint(p);
        const signed = v | 0;
        if (fieldNum === 1) score = signed;
        else if (fieldNum === 2) depth = signed;
        p = next;
      } else {
        p = skipField(wireType, p);
      }
    }
    return { score, depth };
  };

  const decodeStateSubmessage = (start: number, end: number): RawSbkState => {
    let p = start;
    let id = 0;
    let sfenKey: string | null = null;
    const moves: RawSbkMove[] = [];
    let score = 0;
    let depth = 0;
    let hasEval = false;
    while (p < end) {
      const [tag, afterTag] = readVarint(p);
      const fieldNum = tag >>> 3;
      const wireType = tag & 0x07;
      p = afterTag;
      if (wireType === 0) {
        const [v, next] = readVarint(p);
        if (fieldNum === 1) id = v | 0;
        p = next;
      } else if (wireType === 2) {
        const [len, s] = readVarint(p);
        const sliceEnd = Math.min(end, s + len);
        if (fieldNum === 7) {
          const sfenText = decoder.decode(bytes.subarray(s, sliceEnd));
          if (sfenText.includes('/')) {
            sfenKey = normalizeSfenKey(sfenText);
          }
        } else if (fieldNum === 9) {
          const mv = decodeMoveSubmessage(s, sliceEnd);
          if (mv) moves.push(mv);
        } else if (fieldNum === 10 && !hasEval) {
          const ev = decodeEvalSubmessage(s, sliceEnd);
          score = ev.score;
          depth = ev.depth;
          hasEval = true;
        }
        p = sliceEnd;
      } else {
        p = skipField(wireType, p);
      }
    }
    return { id, sfenKey, moves, score, depth };
  };

  const statesById = new Map<number, RawSbkState>();
  const states: RawSbkState[] = [];

  const applyUsiMoveToSfen = (sfen: string, usiMove: string): string | null => {
    const parts = sfen.trim().split(/\s+/);
    if (parts.length < 3) return null;
    const [boardPart, turn, handPart] = parts;
    if (!boardPart || (turn !== 'b' && turn !== 'w') || !handPart) return null;

    const ranks = boardPart.split('/');
    if (ranks.length !== 9) return null;
    const board: string[][] = Array.from({ length: 9 }, () => Array(9).fill(''));
    for (let r = 0; r < 9; r++) {
      const rowStr = ranks[r]!;
      let c = 0;
      for (let i = 0; i < rowStr.length && c < 9; i++) {
        const ch = rowStr[i]!;
        if (ch >= '1' && ch <= '9') {
          c += Number(ch);
        } else if (ch === '+' && i + 1 < rowStr.length) {
          board[r]![c++] = '+' + rowStr[++i]!;
        } else {
          board[r]![c++] = ch;
        }
      }
    }

    const hand = new Map<string, number>();
    if (handPart !== '-') {
      let numStr = '';
      for (let i = 0; i < handPart.length; i++) {
        const ch = handPart[i]!;
        if (ch >= '0' && ch <= '9') {
          numStr += ch;
        } else {
          const count = numStr ? Number(numStr) : 1;
          hand.set(ch, (hand.get(ch) ?? 0) + count);
          numStr = '';
        }
      }
    }

    const isOwnPiece = (cell: string): boolean => {
      const base = cell.startsWith('+') ? cell[1]! : cell[0]!;
      return turn === 'b' ? base === base.toUpperCase() : base === base.toLowerCase();
    };

    if (usiMove[1] === '*') {
      const toSuji = Number(usiMove[2]);
      const toDan = usiMove.charCodeAt(3) - 96;
      if (toSuji < 1 || toSuji > 9 || toDan < 1 || toDan > 9) return null;
      if (board[toDan - 1]![9 - toSuji] !== '') return null;
      const piece = turn === 'b' ? usiMove[0]!.toUpperCase() : usiMove[0]!.toLowerCase();
      const cur = hand.get(piece) ?? 0;
      if (cur <= 0) return null;
      if (cur > 1) hand.set(piece, cur - 1);
      else hand.delete(piece);
      board[toDan - 1]![9 - toSuji] = piece;
    } else {
      const fromSuji = Number(usiMove[0]);
      const fromDan = usiMove.charCodeAt(1) - 96;
      const toSuji = Number(usiMove[2]);
      const toDan = usiMove.charCodeAt(3) - 96;
      if (
        fromSuji < 1 ||
        fromSuji > 9 ||
        fromDan < 1 ||
        fromDan > 9 ||
        toSuji < 1 ||
        toSuji > 9 ||
        toDan < 1 ||
        toDan > 9
      ) {
        return null;
      }
      const fr = fromDan - 1;
      const fc = 9 - fromSuji;
      const tr = toDan - 1;
      const tc = 9 - toSuji;
      let moving = board[fr]![fc]!;
      if (!moving || !isOwnPiece(moving)) return null;
      const captured = board[tr]![tc]!;
      if (captured && isOwnPiece(captured)) return null;
      board[fr]![fc] = '';
      if (captured) {
        const base = captured.startsWith('+') ? captured[1]! : captured[0]!;
        const own = turn === 'b' ? base.toUpperCase() : base.toLowerCase();
        hand.set(own, (hand.get(own) ?? 0) + 1);
      }
      if (usiMove[4] === '+' && !moving.startsWith('+')) {
        moving = '+' + moving;
      }
      board[tr]![tc] = moving;
    }

    const outRanks = board.map((row) => {
      let s = '';
      let empty = 0;
      for (const cell of row) {
        if (!cell) {
          empty++;
        } else {
          if (empty > 0) {
            s += String(empty);
            empty = 0;
          }
          s += cell;
        }
      }
      if (empty > 0) s += String(empty);
      return s;
    });

    const HAND_ORDER = ['R', 'B', 'G', 'S', 'N', 'L', 'P', 'r', 'b', 'g', 's', 'n', 'l', 'p'];
    let outHand = '';
    for (const p of HAND_ORDER) {
      const cnt = hand.get(p) ?? 0;
      if (cnt > 0) outHand += (cnt > 1 ? String(cnt) : '') + p;
    }
    if (!outHand) outHand = '-';
    const nextTurn = turn === 'b' ? 'w' : 'b';
    return `${outRanks.join('/')} ${nextTurn} ${outHand} 1`;
  };

  let pos = 0;
  while (pos < bytes.length) {
    const [tag, afterTag] = readVarint(pos);
    const fieldNum = tag >>> 3;
    const wireType = tag & 0x07;
    pos = afterTag;
    if (wireType === 2) {
      const [len, s] = readVarint(pos);
      const end = Math.min(bytes.length, s + len);
      if (fieldNum === 3) {
        const st = decodeStateSubmessage(s, end);
        states.push(st);
        statesById.set(st.id, st);
      }
      pos = end;
    } else {
      pos = skipField(wireType, pos);
    }
  }

  const INITIAL_SFEN_KEY = normalizeSfenKey(
    'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1'
  );
  const referencedIds = new Set<number>();
  for (const st of states) {
    for (const mv of st.moves) {
      if (mv.nextStateId !== 0) referencedIds.add(mv.nextStateId);
    }
  }

  const standardRoot = statesById.get(0) ?? statesById.get(1) ?? states[0];
  if (standardRoot && !standardRoot.sfenKey && standardRoot.moves.length > 0) {
    standardRoot.sfenKey = INITIAL_SFEN_KEY;
  } else if (!states.some((st) => Boolean(st.sfenKey) && st.moves.length > 0)) {
    const unreferenced = states.filter(
      (st) => !st.sfenKey && st.moves.length > 0 && !referencedIds.has(st.id)
    );
    const pool =
      unreferenced.length > 0
        ? unreferenced
        : states.filter((st) => !st.sfenKey && st.moves.length > 0);
    const validCandidates = pool.filter((st) =>
      st.moves.some((mv) => applyUsiMoveToSfen(INITIAL_SFEN_KEY, mv.bestMove) !== null)
    );
    for (const root of validCandidates) {
      root.sfenKey = INITIAL_SFEN_KEY;
    }
  }
  const queue: RawSbkState[] = states.filter((st) => Boolean(st.sfenKey));
  for (let qi = 0; qi < queue.length; qi++) {
    const st = queue[qi]!;
    if (!st.sfenKey) continue;
    for (const mv of st.moves) {
      if (mv.nextStateId === 0) continue;
      const nextSt = statesById.get(mv.nextStateId);
      if (nextSt && !nextSt.sfenKey) {
        const nextSfen = applyUsiMoveToSfen(st.sfenKey, mv.bestMove);
        if (nextSfen) {
          nextSt.sfenKey = normalizeSfenKey(nextSfen);
          queue.push(nextSt);
        }
      }
    }
  }

  for (const st of states) {
    if (!st.sfenKey || st.moves.length === 0) continue;
    const entries: YaneuraBookEntry[] = st.moves.map((mv) => {
      const nextSt = mv.nextStateId !== 0 ? statesById.get(mv.nextStateId) : undefined;
      return {
        bestMove: mv.bestMove,
        nextMove: 'none',
        score: nextSt?.score ?? 0,
        depth: nextSt?.depth ?? 0,
        count: mv.weight,
      };
    });
    const existing = book.get(st.sfenKey) ?? [];
    book.set(st.sfenKey, [...existing, ...entries]);
  }

  console.info('[sbk] parseSbkProtobuf summary:', {
    byteLength: bytes.length,
    totalStates: states.length,
    statesWithSfen: states.filter((s) => Boolean(s.sfenKey)).length,
    statesWithMoves: states.filter((s) => s.moves.length > 0).length,
    decodedPositions: book.size,
    firstState: states[0] ? { id: states[0].id, moves: states[0].moves.length, nextId: states[0].moves[0]?.nextStateId } : null,
    firstWithMoves: (() => {
      const s = states.find((x) => x.moves.length > 0);
      return s ? { id: s.id, moves: s.moves.length, nextId: s.moves[0]?.nextStateId, move: s.moves[0]?.bestMove } : null;
    })(),
    sampleKeys: Array.from(book.keys()).slice(0, 3),
  });

  return book;
}

/**
 * Streams and parses a large .db or .sbk file in chunks, yielding to the event loop
 * periodically so the UI stays responsive and does not freeze.
 */
export async function parseYaneuraBookDbFile(
  file: File
): Promise<Map<string, YaneuraBookEntry[]>> {
  if (file.name.toLowerCase().endsWith('.sbk')) {
    const buffer = await file.arrayBuffer();
    const headBytes = new Uint8Array(buffer.slice(0, 128));
    const isBinary = headBytes.some((b) => b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d);
    const head = new TextDecoder('utf-8').decode(headBytes);
    console.info('[sbk] parseYaneuraBookDbFile:', { name: file.name, size: file.size, isBinary });
    if (!isBinary && head.includes('/') && (head.includes(' b ') || head.includes(' w '))) {
      return parseSbkBookText(new TextDecoder('utf-8').decode(buffer));
    }
    return parseSbkProtobuf(buffer);
  }
  const book = new Map<string, YaneuraBookEntry[]>();
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let leftover = '';
  let currentKey: string | null = null;
  let lineCount = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = leftover + value;
    const lines = chunk.split(/\r?\n/);
    leftover = lines.pop() ?? '';

    for (const rawLine of lines) {
      lineCount += 1;
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('sfen ')) {
        currentKey = normalizeSfenKey(line.slice(5));
        if (!book.has(currentKey)) {
          book.set(currentKey, []);
        }
        continue;
      }
      if (!currentKey) continue;
      const cols = line.split(/\s+/);
      if (cols.length < 2) continue;
      const bestMove = cols[0] ?? '';
      if (!bestMove) continue;
      const nextMove = cols[1] ?? 'none';
      const score = Number.parseInt(cols[2] ?? '0', 10) || 0;
      const depth = Number.parseInt(cols[3] ?? '0', 10) || 0;
      const count = Number.parseInt(cols[4] ?? '1', 10) || 1;
      book.get(currentKey)!.push({ bestMove, nextMove, score, depth, count });
    }

    if (lineCount % 50000 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  if (leftover.trim() && currentKey) {
    const cols = leftover.trim().split(/\s+/);
    if (cols.length >= 2 && cols[0]) {
      book.get(currentKey)!.push({
        bestMove: cols[0],
        nextMove: cols[1] ?? 'none',
        score: Number.parseInt(cols[2] ?? '0', 10) || 0,
        depth: Number.parseInt(cols[3] ?? '0', 10) || 0,
        count: Number.parseInt(cols[4] ?? '1', 10) || 1,
      });
    }
  }

  return book;
}

export interface YaneuraBookEntry {
  bestMove: string;
  nextMove: string;
  score: number;
  depth: number;
  count: number;
}

export interface StoredYaneuraBook {
  fileName: string;
  loadedAt: string;
  positionCount: number;
  entries: Array<[string, YaneuraBookEntry[]]>;
}

/**
 * Normalizes a SFEN string to its 3-field position key (board + turn + hand)
 * so book lookups match regardless of ply counter.
 */
export function normalizeSfenKey(sfen: string): string {
  const parts = sfen.trim().split(/\s+/);
  if (parts.length >= 3) {
    return `${parts[0]} ${parts[1]} ${parts[2]}`;
  }
  return sfen.trim();
}

/**
 * Parses a YaneuraOu-DB2016 text book into a Map keyed by normalized SFEN.
 */
export function parseYaneuraBookDb(text: string): Map<string, YaneuraBookEntry[]> {
  const book = new Map<string, YaneuraBookEntry[]>();
  const lines = text.split(/\r?\n/);
  let currentKey: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('sfen ')) {
      currentKey = normalizeSfenKey(line.slice(5));
      if (!book.has(currentKey)) {
        book.set(currentKey, []);
      }
      continue;
    }

    if (!currentKey) continue;
    const cols = line.split(/\s+/);
    if (cols.length < 2) continue;

    const bestMove = cols[0] ?? '';
    const nextMove = cols[1] ?? 'none';
    const score = Number.parseInt(cols[2] ?? '0', 10) || 0;
    const depth = Number.parseInt(cols[3] ?? '0', 10) || 0;
    const count = Number.parseInt(cols[4] ?? '1', 10) || 1;

    if (!bestMove) continue;
    book.get(currentKey)!.push({ bestMove, nextMove, score, depth, count });
  }

  return book;
}

/**
 * Serializes a book Map back to `#YANEURAOU-DB2016 1.00` text format.
 */
export function serializeYaneuraBookDb(book: Map<string, YaneuraBookEntry[]>): string {
  const out: string[] = ['#YANEURAOU-DB2016 1.00'];
  for (const [key, entries] of book.entries()) {
    if (entries.length === 0) continue;
    out.push(`sfen ${key} 1`);
    for (const e of entries) {
      out.push(`${e.bestMove} ${e.nextMove} ${e.score} ${e.depth} ${e.count}`);
    }
  }
  return out.join('\n') + '\n';
}

/**
 * Flips a 3-field SFEN 180 degrees (reverses ranks, swaps piece case, swaps turn and hand case).
 */
export function flipSfen(sfen: string): string {
  const parts = sfen.trim().split(/\s+/);
  if (parts.length < 3) return sfen.trim();
  const [board, turn, hand] = parts;
  if (!board || !turn || !hand) return sfen.trim();

  const swapCase = (s: string) =>
    s.replace(/[A-Za-z]/g, (c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()));

  const ranks = board.split('/').reverse().map((rank) => {
    // Reverse tokens in rank (keeping '+X' together)
    const tokens: string[] = [];
    for (let i = 0; i < rank.length; i++) {
      if (rank[i] === '+' && i + 1 < rank.length) {
        tokens.push('+' + rank[i + 1]);
        i += 1;
      } else {
        tokens.push(rank[i]!);
      }
    }
    return swapCase(tokens.reverse().join(''));
  });

  const flippedTurn = turn === 'b' ? 'w' : 'b';
  const flippedHand = hand === '-' ? '-' : swapCase(hand);
  return `${ranks.join('/')} ${flippedTurn} ${flippedHand}`;
}

/**
 * Flips a USI move 180 degrees (e.g. "2g2f" <-> "8c8d", "P*5e" <-> "P*5e").
 */
export function flipUsiMove(usi: string): string {
  if (!usi || usi === 'none' || usi === 'resign') return usi;
  const flipCoord = (x: string, y: string) => {
    const nx = String(10 - Number(x));
    const ny = String.fromCharCode('a'.charCodeAt(0) + ('i'.charCodeAt(0) - y.charCodeAt(0)));
    return `${nx}${ny}`;
  };
  const dropMatch = usi.match(/^([A-Za-z]\*)([1-9])([a-i])$/);
  if (dropMatch && dropMatch[1] && dropMatch[2] && dropMatch[3]) {
    return `${dropMatch[1]}${flipCoord(dropMatch[2], dropMatch[3])}`;
  }
  const moveMatch = usi.match(/^([1-9])([a-i])([1-9])([a-i])(\+?)$/);
  if (moveMatch && moveMatch[1] && moveMatch[2] && moveMatch[3] && moveMatch[4]) {
    return `${flipCoord(moveMatch[1], moveMatch[2])}${flipCoord(moveMatch[3], moveMatch[4])}${moveMatch[5] ?? ''}`;
  }
  return usi;
}

/**
 * Looks up candidate book moves for a given SFEN, sorted by count desc then score desc.
 * If not found and turn is 'w' (Gote), falls back to 180-degree flipped Sente lookup.
 */
export function lookupBookMoves(
  book: Map<string, YaneuraBookEntry[]>,
  sfen: string
): YaneuraBookEntry[] {
  const key = normalizeSfenKey(sfen);
  const direct = book.get(key);
  if (direct && direct.length > 0) {
    return [...direct].sort((a, b) => b.count - a.count || b.score - a.score);
  }
  const parts = key.split(' ');
  if (parts[1] === 'w') {
    const flippedKey = flipSfen(key);
    const flippedList = book.get(flippedKey);
    if (flippedList && flippedList.length > 0) {
      return flippedList
        .map((e) => ({
          ...e,
          bestMove: flipUsiMove(e.bestMove),
          nextMove: flipUsiMove(e.nextMove),
        }))
        .sort((a, b) => b.count - a.count || b.score - a.score);
    }
  }
  return [];
}

export async function saveYaneuraBookToIdb(
  fileName: string,
  book: Map<string, YaneuraBookEntry[]>
): Promise<void> {
  const payload: StoredYaneuraBook = {
    fileName,
    loadedAt: new Date().toISOString(),
    positionCount: book.size,
    entries: Array.from(book.entries()),
  };
  await idbSet(YANEURA_BOOK_IDB_KEY, payload);
}

export async function loadYaneuraBookFromIdb(): Promise<{
  fileName: string;
  book: Map<string, YaneuraBookEntry[]>;
} | null> {
  try {
    const stored = await idbGet<StoredYaneuraBook>(YANEURA_BOOK_IDB_KEY);
    if (!stored || !Array.isArray(stored.entries)) return null;
    return {
      fileName: stored.fileName,
      book: new Map(stored.entries),
    };
  } catch {
    return null;
  }
}

export async function clearYaneuraBookFromIdb(): Promise<void> {
  await idbSet(YANEURA_BOOK_IDB_KEY, null);
}
