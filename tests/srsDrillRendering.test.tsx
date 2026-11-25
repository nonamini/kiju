import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SrsDrillPanel } from '../src/components/srs/SrsDrillPanel';
import { SettingsProvider } from '../src/contexts/SettingsContext';
import { KomadaiView } from '../src/components/board/KomadaiView';
import { DailyReviewDashboard } from '../src/components/srs/DailyReviewDashboard';
import { SelectiveHintsPanel } from '../src/components/srs/SelectiveHintsPanel';
import { mockTree } from '../src/mock/mockData';
import '../src/locales/i18n';

describe('SrsDrillPanel & SelectiveHintsPanel rendering safety', () => {
  it('renders active drill safely with null openingTree', () => {
    const html = renderToString(
      <SettingsProvider>
        <SrsDrillPanel openingTree={null} defaultDrillState="user_turn" />
      </SettingsProvider>
    );
    expect(html).toBeDefined();
    expect(html.length).toBeGreaterThan(0);
  });

  it('renders active drill safely with mockTree', () => {
    const html = renderToString(
      <SettingsProvider>
        <SrsDrillPanel openingTree={mockTree} defaultDrillState="user_turn" />
      </SettingsProvider>
    );
    expect(html).toBeDefined();
    expect(html.length).toBeGreaterThan(0);
  });

  it('renders SelectiveHintsPanel safely when hints state is uninitialized', () => {
    const html = renderToString(
      <SelectiveHintsPanel
        expectedMove={null}
        onRevealHint={() => {}}
        isInteractive={false}
      />
    );
    expect(html).toBeDefined();
    expect(html).toContain('pt');
  });

  it('renders KomadaiView with glowing border and indicator when isHinted is true', () => {
    const html = renderToString(
      <KomadaiView
        color="b"
        playerName="Sente"
        isTurn={true}
        hand={{ P: 1, G: 1 }}
        isHinted={true}
      />
    );
    expect(html).toContain('border-purple-400');
    expect(html).toContain('駒台');
  });

  it('renders DailyReviewDashboard with due cards count and action triggers', () => {
    const html = renderToString(
      <DailyReviewDashboard
        cards={[]}
        summary={{
          totalCount: 12,
          dueCount: 5,
          newCount: 2,
          learningCount: 7,
          reviewCount: 0,
          masteredCount: 3,
          overdueCount: 1,
          totalAttempts: 20,
          totalMistakes: 3,
          accuracyRatePct: 85,
        }}
        dueCards={[
          {
            id: 'card-1',
            userId: 'u1',
            openingId: 'kaku',
            sfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
            correctMove: {
              from: { file: 7, rank: 7 },
              to: { file: 7, rank: 6 },
              piece: 'P',
              color: 'b',
              isDrop: false,
              isPromote: false,
              sfenMove: '7g7f',
              kifString: '７六歩',
              ply: 1,
            },
            intervalDays: 1,
            repetitionCount: 1,
            easeFactor: 2.5,
            dueDate: '2026-10-19',
            totalAttempts: 1,
            mistakes: 0,
            hintsUsedCount: 0,
          },
        ]}
        selectedSide="both"
        onSelectSide={() => {}}
        onStartDailyReview={() => {}}
        onStartTreeDrill={() => {}}
      />
    );
    expect(html).toContain('5');
    expect(html).toMatch(/85.*%/);
  });
});
