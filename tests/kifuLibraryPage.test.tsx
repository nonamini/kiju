import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import '../src/locales/i18n';
import { KifuLibraryPage, sortKifuRecords } from '../src/pages/KifuLibraryPage';
import { RecordTagEditorModal } from '../src/components/kifu/RecordTagEditorModal';
import { KifuRecord } from '../src/types/kifuRecord';
import {
  KIFU_RECORDS_STORAGE_KEY,
  saveKifuRecords,
} from '../src/utils/kifuRecordStorage';
import { getSafeStorage } from '../src/utils/matchHistoryStorage';
import { clearQuizPool, saveQuizCard } from '../src/utils/quizPoolStorage';
import { clearTsumegoStorage, saveTsumegoProblems } from '../src/utils/tsumegoStorage';

function makeRecord(id: string, overrides: Partial<KifuRecord> = {}): KifuRecord {
  return {
    id,
    title: `Game ${id}`,
    contentHash: `hash-${id}`,
    source: 'studio',
    senteName: '藤井聡太',
    goteName: '永瀬拓矢',
    gameKind: 'pro',
    openingId: 'kakugawari',
    openingName: '角換わり',
    totalPlies: 50,
    jkfJson: '{}',
    tags: ['角換わり'],
    isIncludedInTree: false,
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('KifuLibraryPage', () => {
  beforeEach(() => {
    getSafeStorage().removeItem(KIFU_RECORDS_STORAGE_KEY);
    clearTsumegoStorage();
    clearQuizPool();
  });

  it('sortKifuRecords sorts by updatedAt desc and totalPlies asc', () => {
    const records = [
      makeRecord('a', { updatedAt: '2026-11-01T00:00:00.000Z', totalPlies: 120 }),
      makeRecord('b', { updatedAt: '2026-11-15T00:00:00.000Z', totalPlies: 40 }),
      makeRecord('c', { updatedAt: '2026-11-10T00:00:00.000Z', totalPlies: 80 }),
    ];

    expect(sortKifuRecords(records, 'updatedAt', 'desc').map((r) => r.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
    expect(sortKifuRecords(records, 'totalPlies', 'asc').map((r) => r.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('renders records from studio, tree, and import sources in one list', () => {
    saveKifuRecords([
      makeRecord('r1', { title: 'Studio Game', source: 'studio' }),
      makeRecord('r2', { title: 'Tree Game', source: 'tree' }),
      makeRecord('r3', { title: 'Imported Game', source: 'import' }),
    ]);

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <KifuLibraryPage />
      </MemoryRouter>
    );

    expect(html).toContain('Studio Game');
    expect(html).toContain('Tree Game');
    expect(html).toContain('Imported Game');
  });

  it('excludes both joseki and study/other records from the default all-matches tab and renders grouped tabs', () => {
    saveKifuRecords([
      makeRecord('match-1', { title: 'Match Game', gameKind: 'pro' }),
      makeRecord('tactic_game_1', {
        title: '箱入り娘',
        senteName: '先手',
        goteName: '後手',
        gameKind: 'joseki',
      }),
      makeRecord('custom_pos_1', {
        title: 'カスタム研究局面',
        senteName: '先手',
        goteName: '後手',
        gameKind: 'other',
      }),
    ]);

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <KifuLibraryPage />
      </MemoryRouter>
    );

    expect(html).toContain('Match Game');
    expect(html).not.toContain('箱入り娘');
    expect(html).not.toContain('カスタム研究局面');
    expect(html).toContain('定跡');
    expect(html).toContain('研究');
    expect(html).toContain('詰将棋');
    expect(html).toContain('次の一手クイズ');
  });

  it('RecordTagEditorModal renders grouped tags from TagRegistry', () => {
    const rec = makeRecord('r-tag', {
      title: 'Tag Test Game',
      tagIds: ['builtin:opening:角換わり'],
      tags: ['角換わり'],
    });
    const html = renderToStaticMarkup(
      <RecordTagEditorModal
        record={rec}
        isOpen={true}
        onClose={() => {}}
        onUpdated={() => {}}
      />
    );
    expect(html).toContain('Tag Test Game');
    expect(html).toContain('#角換わり');
    expect(html).toContain('#相掛かり');
  });

  it('defaults tsumego and next-move quiz tabs to table view', () => {
    saveTsumegoProblems([
      {
        id: 'ts-table-1',
        title: 'Sample 3-Ply Mate',
        source: 'manual',
        kind: 'attack',
        startSfen: '4k4/9/4P4/9/9/9/9/9/9 b G 1',
        sideToMove: 'b',
        moveLimit: 3,
        solutionPv: ['G*5b'],
        tags: ['3手詰'],
        createdAt: 1000,
      },
    ]);
    saveQuizCard({
      id: 'qz-table-1',
      title: 'Sample Next Move Quiz',
      source: 'manual',
      sourceGameId: 'manual',
      openingId: 'manual',
      type: 'attack',
      ply: 0,
      startSfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
      usiMovesToPosition: [],
      sideToMove: 'b',
      bestMove: '7g7f',
      pv: ['7g7f'],
      scoreCpBefore: 0,
      isEnabled: true,
      createdAt: '2026-11-22T00:00:00.000Z',
    });

    const tsumegoHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/library?tab=tsumego']}>
        <KifuLibraryPage />
      </MemoryRouter>
    );
    expect(tsumegoHtml).toContain('<table');
    expect(tsumegoHtml).toContain('Sample 3-Ply Mate');

    const quizHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/library?tab=quiz']}>
        <KifuLibraryPage />
      </MemoryRouter>
    );
    expect(quizHtml).toContain('<table');
    expect(quizHtml).toContain('Sample Next Move Quiz');
    expect(quizHtml).toContain('7g7f');
  });
});
