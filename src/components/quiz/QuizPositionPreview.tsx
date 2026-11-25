/**
 * Compact Tactical Quiz Position Preview Component.
 * Reconstructs the board position from the start SFEN and USI move sequence,
 * rendering a perspective-aligned Shogi board without answer clues.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React, { useMemo } from 'react';
import { TacticalQuizCard } from '../../types/quiz';
import { Square } from '../../types/shogi';
import { ShogiBoard } from '../../utils/shogiBoard';
import { parseUsiMove } from '../../utils/shogiRules';
import { ShogiBoardView } from '../board/ShogiBoardView';

export interface QuizPositionPreviewProps {
  card: TacticalQuizCard;
  className?: string;
}

export const QuizPositionPreview: React.FC<QuizPositionPreviewProps> = ({
  card,
  className,
}) => {
  const board = useMemo(() => {
    const b = ShogiBoard.fromSfen(card.startSfen);
    let prevTo: Square | undefined;

    card.usiMovesToPosition.forEach((usi, i) => {
      const move = parseUsiMove(usi, b, i + 1, b.getTurn(), prevTo);
      if (move) {
        b.applyMove(move);
        prevTo = move.to;
      }
    });

    return b;
  }, [card.startSfen, card.usiMovesToPosition]);

  return (
    <div className={className ?? 'w-full'}>
      <ShogiBoardView
        board={board}
        isFlipped={card.sideToMove === 'w'}
        className="w-full"
      />
    </div>
  );
};
