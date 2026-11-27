/**
 * KIF / CSA conversion and bulk ZIP archive export utilities (Issue #12).
 * Preserves each record's virtual folder hierarchy (`folderPath`) inside the ZIP.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import { Formats, JKFPlayer } from 'json-kifu-format';
import { Color, kindToString } from 'shogi.js';
import type { KifuRecord } from '../types/kifuRecord';
import { normalizeFolderPath } from './virtualFolderTree';
import { buildZipArchive, ZipEntry } from './zipBuilder';

export type KifuZipExportFormat = 'kif' | 'csa';

const FILE_KANJI: Record<number, string> = {
  1: '１',
  2: '２',
  3: '３',
  4: '４',
  5: '５',
  6: '６',
  7: '７',
  8: '８',
  9: '９',
};

const RANK_KANJI: Record<number, string> = {
  1: '一',
  2: '二',
  3: '三',
  4: '四',
  5: '五',
  6: '六',
  7: '七',
  8: '八',
  9: '九',
};

const PROMOTED_CSA_KIND: Record<string, string> = {
  FU: 'TO',
  KY: 'NY',
  KE: 'NK',
  GI: 'NG',
  KA: 'UM',
  HI: 'RY',
};

const SPECIAL_KIF_LABELS: Record<string, string> = {
  TORYO: '投了',
  CHUDAN: '中断',
  SENNICHITE: '千日手',
  TIME_UP: '切れ負け',
  ILLEGAL_MOVE: '反則負け',
  '+ILLEGAL_ACTION': '反則勝ち',
  '-ILLEGAL_ACTION': '反則勝ち',
  JISHOGI: '持将棋',
  KACHI: '入玉勝ち',
  HIKIWAKE: '引き分け',
  MATTA: '待った',
  TSUMI: '詰み',
  FUZUMI: '不詰',
  ERROR: 'エラー',
};

const KIF_HANDICAP_LABELS: Record<string, string> = {
  HIRATE: '平手',
  KY: '香落ち',
  KY_R: '右香落ち',
  KA: '角落ち',
  HI: '飛車落ち',
  HIKY: '飛香落ち',
  '2': '二枚落ち',
  '3': '三枚落ち',
  '4': '四枚落ち',
  '5': '五枚落ち',
  '5_L': '左五枚落ち',
  '6': '六枚落ち',
  '8': '八枚落ち',
  '10': '十枚落ち',
};

export function sanitizeZipFileName(raw: string): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
  const capped = cleaned.slice(0, 80).trim();
  return capped || 'kifu';
}

function parseRecordToJkf(record: KifuRecord): Formats.JSONKifuFormat | null {
  if (record.jkfJson && record.jkfJson.trim() && record.jkfJson.trim() !== '{}') {
    try {
      const parsed = JSON.parse(record.jkfJson) as Formats.JSONKifuFormat;
      if (parsed && Array.isArray(parsed.moves)) {
        return parsed;
      }
    } catch {
      // Fall through to rawKif parsing
    }
  }
  if (record.rawKif && record.rawKif.trim().length > 0) {
    try {
      const player = JKFPlayer.parse(record.rawKif);
      return player.kifu;
    } catch {
      return null;
    }
  }
  return null;
}

function formatKifTimePart(
  move: Formats.JSONKifuFormat['moves'][number]
): string {
  const now = move.time?.now;
  const total = move.time?.total;
  if (!now || !total) return '';
  const pad2 = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0');
  const nowStr = `${pad2(now.m)}:${pad2(now.s)}`;
  const totH = pad2(total.h ?? 0);
  const totM = pad2(total.m);
  const totS = pad2(total.s);
  return `   (${nowStr}/${totH}:${totM}:${totS})`;
}

/**
 * Converts a KifuRecord into standard UTF-8 KIF text.
 * Uses `record.rawKif` directly when it is already KIF text, otherwise
 * serializes the JKF moves (supporting normal moves, drops, promotions, and endings).
 */
export function recordToKifString(record: KifuRecord): string | null {
  const rawTrimmed = record.rawKif?.trim();
  if (rawTrimmed && !rawTrimmed.startsWith('V2')) {
    return record.rawKif!;
  }

  const jkf = parseRecordToJkf(record);
  if (!jkf) return null;

  const lines: string[] = [];
  lines.push('#KIF version=2.0');

  const startDate =
    jkf.header?.['開始日時'] || record.matchDate || '';
  if (startDate) lines.push(`開始日時：${startDate}`);

  const tournament = jkf.header?.['棋戦'] || record.tournament || '';
  if (tournament) lines.push(`棋戦：${tournament}`);

  const preset = jkf.initial?.preset ?? 'HIRATE';
  const handicap =
    jkf.header?.['手合割'] || KIF_HANDICAP_LABELS[preset] || 'その他';
  lines.push(`手合割：${handicap}`);

  const sente = jkf.header?.['先手'] || record.senteName || '先手';
  const gote = jkf.header?.['後手'] || record.goteName || '後手';
  lines.push(`先手：${sente}`);
  lines.push(`後手：${gote}`);
  lines.push('手数----指手---------消費時間--');

  let prevTo: { x: number; y: number } | undefined;

  for (let i = 1; i < jkf.moves.length; i++) {
    const entry = jkf.moves[i];
    if (!entry) continue;

    if (entry.special) {
      const specialLabel = SPECIAL_KIF_LABELS[entry.special] || entry.special;
      lines.push(`${String(i).padStart(4, ' ')} ${specialLabel}`);
      if (entry.comments) {
        for (const c of entry.comments) {
          lines.push(`*${c}`);
        }
      }
      continue;
    }

    const mv = entry.move;
    if (!mv || !mv.to) continue;

    const isSame =
      Boolean(mv.same) ||
      Boolean(prevTo && prevTo.x === mv.to.x && prevTo.y === mv.to.y);
    const destPart = isSame
      ? '同　'
      : `${FILE_KANJI[mv.to.x] ?? mv.to.x}${RANK_KANJI[mv.to.y] ?? mv.to.y}`;
    const pieceLabel = kindToString(mv.piece) || mv.piece;
    const promotePart = mv.promote ? '成' : '';
    const fromPart = mv.from ? `(${mv.from.x}${mv.from.y})` : '打';
    const timePart = formatKifTimePart(entry);

    lines.push(
      `${String(i).padStart(4, ' ')} ${destPart}${pieceLabel}${promotePart}${fromPart}${timePart}`
    );

    if (entry.comments) {
      for (const c of entry.comments) {
        lines.push(`*${c}`);
      }
    }

    prevTo = mv.to;
  }

  return lines.join('\r\n') + '\r\n';
}

function buildCsaInitialBoardLines(jkf: Formats.JSONKifuFormat): string[] {
  try {
    const player = new JKFPlayer({
      header: jkf.header ?? {},
      initial: jkf.initial,
      moves: [],
    });
    const lines: string[] = [];
    for (let y = 1; y <= 9; y++) {
      let row = `P${y}`;
      for (let x = 9; x >= 1; x--) {
        const piece = player.shogi.get(x, y);
        if (!piece) {
          row += ' * ';
        } else {
          const sign = piece.color === Color.Black ? '+' : '-';
          row += `${sign}${piece.kind}`;
        }
      }
      lines.push(row);
    }

    const formatHand = (color: Color, sign: '+' | '-'): string | null => {
      const hand = player.shogi.hands[color];
      if (!hand) return null;
      const chunks: string[] = [];
      for (const piece of hand) {
        chunks.push(`00${piece.kind}`);
      }
      if (chunks.length === 0) return null;
      return `P${sign}${chunks.join('')}`;
    };

    const blackHand = formatHand(Color.Black, '+');
    if (blackHand) lines.push(blackHand);
    const whiteHand = formatHand(Color.White, '-');
    if (whiteHand) lines.push(whiteHand);

    lines.push(player.shogi.turn === Color.White ? '-' : '+');
    return lines;
  } catch {
    return ['PI', '+'];
  }
}

/**
 * Converts a KifuRecord into standard CSA v2.2 text.
 * Uses `record.rawKif` directly when already in CSA V2 format, otherwise serializes from JKF.
 */
export function recordToCsaString(record: KifuRecord): string | null {
  const rawTrimmed = record.rawKif?.trim();
  if (rawTrimmed && rawTrimmed.startsWith('V2')) {
    return record.rawKif!;
  }

  const jkf = parseRecordToJkf(record);
  if (!jkf) return null;

  const lines: string[] = [];
  lines.push('V2.2');

  const sente = jkf.header?.['先手'] || record.senteName || '先手';
  const gote = jkf.header?.['後手'] || record.goteName || '後手';
  lines.push(`N+${sente}`);
  lines.push(`N-${gote}`);

  const tournament = jkf.header?.['棋戦'] || record.tournament || '';
  if (tournament) lines.push(`$EVENT:${tournament}`);

  const startDate = jkf.header?.['開始日時'] || record.matchDate || '';
  if (startDate) lines.push(`$START_TIME:${startDate}`);

  if (!jkf.initial || jkf.initial.preset === 'HIRATE') {
    lines.push('PI');
    lines.push('+');
  } else {
    lines.push(...buildCsaInitialBoardLines(jkf));
  }

  for (let i = 1; i < jkf.moves.length; i++) {
    const entry = jkf.moves[i];
    if (!entry) continue;

    if (entry.special) {
      lines.push(`%${entry.special}`);
      continue;
    }

    const mv = entry.move;
    if (!mv || !mv.to) continue;

    const sign = mv.color === Color.White ? '-' : '+';
    const fromX = mv.from ? mv.from.x : 0;
    const fromY = mv.from ? mv.from.y : 0;
    const pieceCode = mv.promote
      ? (PROMOTED_CSA_KIND[mv.piece] ?? mv.piece)
      : mv.piece;

    lines.push(`${sign}${fromX}${fromY}${mv.to.x}${mv.to.y}${pieceCode}`);

    if (entry.time?.now) {
      const nowTime = entry.time.now;
      const hours =
        'h' in nowTime && typeof nowTime.h === 'number' ? nowTime.h : 0;
      const seconds = Math.max(0, hours * 3600 + nowTime.m * 60 + nowTime.s);
      lines.push(`T${Math.floor(seconds)}`);
    }

    if (entry.comments) {
      for (const c of entry.comments) {
        lines.push(`'${c}`);
      }
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Exports the given KifuRecords into a ZIP archive in KIF or CSA format,
 * preserving each record's `folderPath` hierarchy as subdirectories.
 */
export async function buildKifuZipArchive(
  records: KifuRecord[],
  format: KifuZipExportFormat,
  resolvePayload?: (record: KifuRecord) => Promise<KifuRecord | null>
): Promise<{
  bytes: Uint8Array;
  exportedCount: number;
  skippedCount: number;
}> {
  const entries: ZipEntry[] = [];
  let skippedCount = 0;

  for (const record of records) {
    const resolved = resolvePayload ? (await resolvePayload(record)) ?? record : record;
    const content =
      format === 'csa'
        ? recordToCsaString(resolved)
        : recordToKifString(resolved);

    if (!content) {
      skippedCount++;
      continue;
    }

    const folder = normalizeFolderPath(record.folderPath);
    const fileName = `${sanitizeZipFileName(record.title || record.id)}.${format}`;
    const entryPath = folder ? `${folder}/${fileName}` : fileName;

    entries.push({ path: entryPath, content });
  }

  return {
    bytes: buildZipArchive(entries),
    exportedCount: entries.length,
    skippedCount,
  };
}
