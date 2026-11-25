import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { QuizPlayerPanel } from '../src/components/quiz/QuizPlayerPanel';
import { SettingsProvider } from '../src/contexts/SettingsContext';
import { mockQuizCards } from '../src/mock/mockData';
import { ShogiBoard } from '../src/utils/shogiBoard';
import { parseUsiMove } from '../src/utils/shogiRules';
import '../src/locales/i18n';

describe('QuizPlayerPanel UI tests', () => {
  it('renders opponent last move banner when lastMove is provided', () => {
    const card = mockQuizCards[0]!;
    const board = new ShogiBoard();
    const lastMove = parseUsiMove('B*4e', board, 9, 'b')!;

    const html = renderToString(
      <SettingsProvider>
        <QuizPlayerPanel
          card={card}
          board={board}
          isFlipped={true}
          step={0}
          totalSteps={2}
          lastMove={lastMove}
          status="awaiting_move"
          verdict={null}
          hintLevel={0}
          hintChoices={[]}
          selectedSquare={null}
          targetSquares={[]}
          selectedHandPiece={null}
          onSquareClick={() => {}}
          onSelectHandPiece={() => {}}
          onRequestHint={() => {}}
          onPickChoice={() => {}}
          onRevealAnswer={() => {}}
          onNext={() => {}}
          result={null}
          replayBoard={null}
          replayIndex={0}
          onToggleReplay={() => {}}
        />
      </SettingsProvider>
    );

    expect(html).toContain('直前の相手の手');
    expect(html).toContain('▲４五角打');
    expect(html).toContain('9手目まで');
    expect(html).toContain('あなたの手番 (後手)');
  });

  it('computes initialQuizLastMove from mockQuizCards[0]', () => {
    const currentQuizCard = mockQuizCards[0]!;
    const b = ShogiBoard.fromSfen(currentQuizCard.startSfen);
    let prevTo: import('../src/types/shogi').Square | undefined = undefined;
    let ply = 1;
    let lastMoveObj: import('../src/types/shogi').ShogiMove | undefined = undefined;

    for (const usi of currentQuizCard.usiMovesToPosition) {
      const turn = b.getTurn();
      const move = parseUsiMove(usi, b, ply, turn, prevTo);
      if (move) {
        b.applyMove(move);
        prevTo = move.to;
        ply++;
        lastMoveObj = move;
      }
    }

    expect(lastMoveObj).toBeDefined();
    expect(lastMoveObj?.sfenMove).toBe('B*4e');
    expect(lastMoveObj?.kifString).toBe('▲４五角打');
    expect(lastMoveObj?.ply).toBe(9);
  });
});
