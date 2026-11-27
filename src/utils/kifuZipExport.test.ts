import { describe, expect, it } from 'vitest';
import type { KifuRecord } from '../types/kifuRecord';
import {
  buildKifuZipArchive,
  recordToCsaString,
  recordToKifString,
} from './kifuZipExport';
import { buildZipArchive } from './zipBuilder';

function parseCentralDirectoryNames(zipBytes: Uint8Array): string[] {
  const view = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset,
    zipBytes.byteLength
  );
  const decoder = new TextDecoder();
  const names: string[] = [];

  // Find EOCD signature 0x06054b50 near end
  let eocdOffset = -1;
  for (let i = zipBytes.length - 22; i >= Math.max(0, zipBytes.length - 1024); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  expect(eocdOffset).toBeGreaterThanOrEqual(0);

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  let cursor = view.getUint32(eocdOffset + 16, true);
  for (let i = 0; i < totalEntries; i++) {
    expect(view.getUint32(cursor, true)).toBe(0x02014b50);
    const nameLen = view.getUint16(cursor + 28, true);
    const extraLen = view.getUint16(cursor + 30, true);
    const commentLen = view.getUint16(cursor + 32, true);
    const nameBytes = zipBytes.subarray(cursor + 46, cursor + 46 + nameLen);
    names.push(decoder.decode(nameBytes));
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

function makeSampleRecord(overrides: Partial<KifuRecord> = {}): KifuRecord {
  const jkf = {
    header: {
      先手: '羽生善治',
      後手: '藤井聡太',
      棋戦: '王座戦',
    },
    moves: [
      {},
      { move: { color: 0, from: { x: 2, y: 7 }, to: { x: 2, y: 6 }, piece: 'FU' } },
      { move: { color: 1, from: { x: 3, y: 3 }, to: { x: 3, y: 4 }, piece: 'FU' } },
      {
        move: {
          color: 0,
          from: { x: 8, y: 8 },
          to: { x: 2, y: 2 },
          piece: 'KA',
          promote: true,
        },
      },
      { move: { color: 1, to: { x: 5, y: 5 }, piece: 'KA' } },
      { special: 'TORYO' },
    ],
  };

  return {
    id: 'rec-1',
    title: 'サンプル対局',
    contentHash: 'hash-1',
    source: 'import',
    senteName: '羽生善治',
    goteName: '藤井聡太',
    tournament: '王座戦',
    openingId: 'other',
    openingName: 'Other',
    totalPlies: 4,
    jkfJson: JSON.stringify(jkf),
    tags: [],
    isIncludedInTree: false,
    folderPath: '研究/角換わり',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('zipBuilder and kifuZipExport (Issue #12)', () => {
  it('builds a valid PKZIP archive with UTF-8 paths and deduplicates collisions', () => {
    const bytes = buildZipArchive([
      { path: '研究/角換わり/game.kif', content: 'first' },
      { path: '研究/角換わり/game.kif', content: 'second' },
    ]);

    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);

    const names = parseCentralDirectoryNames(bytes);
    expect(names).toEqual([
      '研究/角換わり/game.kif',
      '研究/角換わり/game (2).kif',
    ]);
  });

  it('converts JKF records to KIF and CSA with promotions, drops, and specials', () => {
    const rec = makeSampleRecord();
    const kif = recordToKifString(rec);
    expect(kif).toContain('#KIF version=2.0');
    expect(kif).toContain('先手：羽生善治');
    expect(kif).toContain('   1 ２六歩(27)');
    expect(kif).toContain('   3 ２二角成(88)');
    expect(kif).toContain('   4 ５五角打');
    expect(kif).toContain('   5 投了');

    const csa = recordToCsaString(rec);
    expect(csa).toContain('V2.2');
    expect(csa).toContain('N+羽生善治');
    expect(csa).toContain('N-藤井聡太');
    expect(csa).toContain('+2726FU');
    expect(csa).toContain('-3334FU');
    expect(csa).toContain('+8822UM');
    expect(csa).toContain('-0055KA');
    expect(csa).toContain('%TORYO');
  });

  it('exports KIF and CSA ZIP archives preserving folderPath hierarchy and skipping empty payloads', async () => {
    const rec1 = makeSampleRecord({
      id: '1',
      title: '角換わり/研究1',
      folderPath: '研究/角換わり',
    });
    const rec2 = makeSampleRecord({
      id: '2',
      title: '空レコード',
      jkfJson: '{}',
      rawKif: undefined,
      folderPath: undefined,
    });

    const kifZip = await buildKifuZipArchive([rec1, rec2], 'kif');
    expect(kifZip.exportedCount).toBe(1);
    expect(kifZip.skippedCount).toBe(1);
    expect(parseCentralDirectoryNames(kifZip.bytes)).toEqual([
      '研究/角換わり/角換わり_研究1.kif',
    ]);

    const csaZip = await buildKifuZipArchive([rec1], 'csa');
    expect(csaZip.exportedCount).toBe(1);
    expect(parseCentralDirectoryNames(csaZip.bytes)).toEqual([
      '研究/角換わり/角換わり_研究1.csa',
    ]);
  });
});
