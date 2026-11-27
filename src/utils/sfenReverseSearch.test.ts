import { describe, expect, it } from 'vitest';
import { JKFPlayer } from 'json-kifu-format';
import type { KifuRecord } from '../types/kifuRecord';
import { extractOpeningLineFromJkf } from './kifuOpeningLine';
import {
  normalizePositionSfenKey,
  searchLibraryByPositionSfen,
} from './sfenReverseSearch';

const KIF_EXACT = `#KIF version=2.0
手合割：平手
先手：A
後手：B
手数----指手---------消費時間--
   1 ７六歩(77)
   2 ３四歩(33)
   3 ２六歩(27)
   4 ８四歩(83)
`;

const KIF_TRANSPOSITION = `#KIF version=2.0
手合割：平手
先手：C
後手：D
手数----指手---------消費時間--
   1 ２六歩(27)
   2 ８四歩(83)
   3 ７六歩(77)
   4 ３四歩(33)
   5 ２五歩(26)
`;

function makeRecord(id: string, rawKif: string, deletedAt?: string): KifuRecord {
  const player = JKFPlayer.parseKIF(rawKif);
  return {
    id,
    title: id,
    contentHash: id,
    source: 'import',
    senteName: 'A',
    goteName: 'B',
    openingId: 'other',
    openingName: 'Other',
    totalPlies: player.getMaxTesuu(),
    jkfJson: JSON.stringify(player.kifu),
    rawKif,
    tags: [],
    isIncludedInTree: false,
    deletedAt,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('sfenReverseSearch (Issue #10)', () => {
  it('normalizes SFEN keys by ignoring sfen prefix and move count', () => {
    expect(
      normalizePositionSfenKey(
        'sfen lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1'
      )
    ).toBe('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b -');

    expect(
      normalizePositionSfenKey(
        'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 42'
      )
    ).toBe('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b -');
  });

  it('finds matching positions including move-order transpositions and next move label', () => {
    const exact = makeRecord('exact', KIF_EXACT);
    const trans = makeRecord('trans', KIF_TRANSPOSITION);
    const deleted = makeRecord('deleted', KIF_TRANSPOSITION, '2026-02-01T00:00:00Z');

    const p = JKFPlayer.parseKIF(KIF_EXACT);
    p.goto(4);
    const targetSfen = p.shogi.toSFENString();

    const results = searchLibraryByPositionSfen(targetSfen, [
      exact,
      trans,
      deleted,
    ]);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.record.id).sort()).toEqual(['exact', 'trans']);

    const transMatch = results.find((r) => r.record.id === 'trans');
    expect(transMatch?.matchedPly).toBe(4);
    expect(transMatch?.nextMoveLabel).toContain('２五歩');
  });

  it('matches stripped metadata records using openingLine for ply 0 and plies 1..30', () => {
    const p = JKFPlayer.parseKIF(KIF_TRANSPOSITION);
    const jkfJson = JSON.stringify(p.kifu);
    const openingLine = extractOpeningLineFromJkf(jkfJson, 30);

    const stripped: KifuRecord = {
      ...makeRecord('stripped', KIF_TRANSPOSITION),
      jkfJson: '{}',
      rawKif: undefined,
      openingLine,
    };

    p.goto(4);
    const ply4Sfen = p.shogi.toSFENString();
    const res4 = searchLibraryByPositionSfen(ply4Sfen, [stripped]);
    expect(res4).toHaveLength(1);
    expect(res4[0]?.matchedPly).toBe(4);
    expect(res4[0]?.nextMoveLabel).toContain('２五歩');

    p.goto(0);
    const ply0Sfen = p.shogi.toSFENString();
    const res0 = searchLibraryByPositionSfen(ply0Sfen, [stripped]);
    expect(res0).toHaveLength(1);
    expect(res0[0]?.matchedPly).toBe(0);
    expect(res0[0]?.nextMoveLabel).toContain('２六歩');
  });
});
