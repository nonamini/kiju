import { JKFPlayer } from 'json-kifu-format';
import { describe, expect, it } from 'vitest';
import type { KifuRecord } from '../types/kifuRecord';
import type { TsumegoProblem } from '../types/tsumego';
import { createJkfPlayerFromSfen } from './positionEditor';
import {
  extractTsumegoFromKifuRecords,
  mergeExtractedTsumegoProblems,
  parsePvInputString,
  validateManualTsumegoPv,
} from './tsumegoKifuExtractor';

const ONE_PLY_MATE_SFEN = '4k4/9/4P4/9/9/9/8P/9/9 b G 1';
const THREE_PLY_MATE_SFEN = '6pkn/6p2/6S2/9/9/9/9/9/7R1 b G 1';

describe('parsePvInputString', () => {
  it('splits whitespace and comma separated USI tokens', () => {
    expect(parsePvInputString(' G*1b, 2a1b\n 2i2b+ ')).toEqual([
      'G*1b',
      '2a1b',
      '2i2b+',
    ]);
  });
});

describe('validateManualTsumegoPv', () => {
  it('validates a 1-ply mate sequence', () => {
    const res = validateManualTsumegoPv(ONE_PLY_MATE_SFEN, ['G*5b']);
    expect(res).toEqual({
      valid: true,
      matePly: 1,
      normalizedPv: ['G*5b'],
    });
  });

  it('validates a 3-ply checkmate sequence', () => {
    const res = validateManualTsumegoPv(THREE_PLY_MATE_SFEN, [
      'G*1b',
      '2a1b',
      '2i2b+',
    ]);
    expect(res).toEqual({
      valid: true,
      matePly: 3,
      normalizedPv: ['G*1b', '2a1b', '2i2b+'],
    });
  });

  it('rejects empty or even-length PV sequences', () => {
    expect(validateManualTsumegoPv(ONE_PLY_MATE_SFEN, [])).toEqual({
      valid: false,
      reasonKey: 'position_editor.manual_pv_invalid_empty',
    });
    expect(validateManualTsumegoPv(THREE_PLY_MATE_SFEN, ['G*1b', '2a1b'])).toEqual({
      valid: false,
      reasonKey: 'position_editor.manual_pv_invalid_odd',
    });
  });

  it('rejects non-check attacker moves', () => {
    expect(validateManualTsumegoPv(ONE_PLY_MATE_SFEN, ['1g1f'])).toEqual({
      valid: false,
      reasonKey: 'position_editor.manual_pv_invalid_not_check',
    });
  });

  it('rejects illegal moves', () => {
    expect(validateManualTsumegoPv(ONE_PLY_MATE_SFEN, ['R*5b'])).toEqual({
      valid: false,
      reasonKey: 'position_editor.manual_pv_invalid_illegal',
    });
  });

  it('rejects sequences that give check without delivering checkmate', () => {
    const nonMateSfen = '4k4/9/9/9/9/9/9/9/9 b G 1';
    expect(validateManualTsumegoPv(nonMateSfen, ['G*5b'])).toEqual({
      valid: false,
      reasonKey: 'position_editor.manual_pv_invalid_not_mate',
    });
  });
});

describe('extractTsumegoFromKifuRecords & mergeExtractedTsumegoProblems', () => {
  function buildRecordFromSfen(id: string, sfen: string): KifuRecord {
    const player: JKFPlayer = createJkfPlayerFromSfen(sfen, {
      '先手': 'Sente',
      '後手': 'Gote',
    });
    return {
      id,
      title: `Match ${id}`,
      contentHash: id,
      source: 'studio',
      senteName: 'Sente',
      goteName: 'Gote',
      openingId: 'unknown',
      openingName: 'Custom',
      totalPlies: 0,
      jkfJson: JSON.stringify(player.kifu),
      tags: ['実戦対局'],
      gameKind: 'self',
      isIncludedInTree: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      evaluations: {
        0: {
          scoreCp: 30000,
          isMate: true,
          matePly: 3,
          pv: ['G*1b', '2a1b', '2i2b+'],
          depth: 12,
          evaluatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    };
  }

  it('extracts valid mate problems and deduplicates across records', () => {
    const rec1 = buildRecordFromSfen('rec-1', THREE_PLY_MATE_SFEN);
    const rec2 = buildRecordFromSfen('rec-2', THREE_PLY_MATE_SFEN);

    const extracted = extractTsumegoFromKifuRecords([rec1, rec2]);
    expect(extracted).toHaveLength(1);
    expect(extracted[0]).toMatchObject({
      id: 'kifu-tsu-rec-1-0',
      source: 'kifu-extract',
      kind: 'attack',
      moveLimit: 3,
      solutionPv: ['G*1b', '2a1b', '2i2b+'],
      provenance: {
        sourceGameId: 'rec-1',
        sourceGameTitle: 'Match rec-1',
        ply: 0,
      },
    });
  });

  it('preserves existing manual problems during merge when SFEN collides', () => {
    const rec1 = buildRecordFromSfen('rec-1', THREE_PLY_MATE_SFEN);
    const extracted = extractTsumegoFromKifuRecords([rec1]);

    const manualExisting: TsumegoProblem = {
      id: 'manual-1',
      title: 'My Manual Puzzle',
      source: 'manual',
      kind: 'attack',
      startSfen: THREE_PLY_MATE_SFEN,
      sideToMove: 'b',
      moveLimit: 3,
      solutionPv: ['G*1b', '2a1b', '2i2b+'],
      tags: ['3手詰'],
      createdAt: 500,
    };

    const res = mergeExtractedTsumegoProblems([manualExisting], extracted);
    expect(res.added).toHaveLength(0);
    expect(res.merged).toHaveLength(1);
    expect(res.merged[0]!.id).toBe('manual-1');
  });
});
