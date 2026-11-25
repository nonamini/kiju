/**
 * Shogi Board Panel Container Component.
 * Integrates ShogiBoardView, Sente/Gote Komadai stands, and BoardController.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React, { useMemo } from 'react';
import { Color, ShogiMove, Square } from '../../types/shogi';
import { ShogiBoard } from '../../utils/shogiBoard';
import { BoardController } from './BoardController';
import { KomadaiView } from './KomadaiView';
import { ShogiBoardView } from './ShogiBoardView';

export interface ShogiBoardPanelProps {
  board: ShogiBoard;
  currentPly: number;
  totalPly: number;
  currentMove?: ShogiMove;
  isFlipped: boolean;
  senteName?: string;
  goteName?: string;
  selectedSquare?: Square | null;
  targetSquares?: Square[];
  hintSquares?: Square[];
  hintRankSquares?: Square[];
  hintFileSquares?: Square[];
  hintPieceSquares?: Square[];
  hintArrow?: { from?: Square; to: Square } | null;
  hintHandPiece?: string | null;
  isHintKomadai?: boolean;
  selectedHandPiece?: string | null;
  onHandPieceSelect?: (pieceKey: string) => void;
  hideController?: boolean;
  onFirstPly: () => void;
  onPrevPly: () => void;
  onNextPly: () => void;
  onLastPly: () => void;
  onFlipToggle: () => void;
  onSquareClick?: (square: Square) => void;
}

export const ShogiBoardPanel: React.FC<ShogiBoardPanelProps> = ({
  board,
  currentPly,
  totalPly,
  currentMove,
  isFlipped,
  senteName = 'Sente',
  goteName = 'Gote',
  selectedSquare,
  targetSquares,
  hintSquares,
  hintRankSquares,
  hintFileSquares,
  hintPieceSquares,
  hintArrow,
  hintHandPiece,
  isHintKomadai = false,
  selectedHandPiece,
  onHandPieceSelect,
  hideController = false,
  onFirstPly,
  onPrevPly,
  onNextPly,
  onLastPly,
  onFlipToggle,
  onSquareClick,
}) => {
  const turn: Color = typeof board?.getTurn === 'function' ? board.getTurn() : 'b';

  const senteHand = useMemo(
    () => (typeof board?.getHand === 'function' ? board.getHand('b') : {}),
    [board]
  );
  const goteHand = useMemo(
    () => (typeof board?.getHand === 'function' ? board.getHand('w') : {}),
    [board]
  );

  const topColor: Color = isFlipped ? 'b' : 'w';
  const bottomColor: Color = isFlipped ? 'w' : 'b';

  const topName = isFlipped ? senteName : goteName;
  const bottomName = isFlipped ? goteName : senteName;

  const topHand = isFlipped ? senteHand : goteHand;
  const bottomHand = isFlipped ? goteHand : senteHand;

  return (
    <div className="flex flex-col gap-1.5 w-full max-w-[410px] mx-auto">
      {/* Top Komadai */}
      <KomadaiView
        color={topColor}
        playerName={topName}
        isTurn={turn === topColor}
        hand={topHand}
        selectable={turn === topColor && Boolean(onHandPieceSelect)}
        selectedPiece={turn === topColor ? selectedHandPiece : null}
        hintPiece={turn === topColor ? hintHandPiece : null}
        isHinted={turn === topColor && isHintKomadai}
        onPieceSelect={onHandPieceSelect}
      />

      {/* SVG Shogi Board */}
      <ShogiBoardView
        board={board}
        isFlipped={isFlipped}
        lastMove={currentMove}
        selectedSquare={selectedSquare}
        targetSquares={targetSquares}
        hintSquares={hintSquares}
        hintRankSquares={hintRankSquares}
        hintFileSquares={hintFileSquares}
        hintPieceSquares={hintPieceSquares}
        hintArrow={hintArrow}
        onSquareClick={onSquareClick}
      />

      {/* Bottom Komadai */}
      <KomadaiView
        color={bottomColor}
        playerName={bottomName}
        isTurn={turn === bottomColor}
        hand={bottomHand}
        selectable={turn === bottomColor && Boolean(onHandPieceSelect)}
        selectedPiece={turn === bottomColor ? selectedHandPiece : null}
        hintPiece={turn === bottomColor ? hintHandPiece : null}
        isHinted={turn === bottomColor && isHintKomadai}
        onPieceSelect={onHandPieceSelect}
      />

      {/* Navigation Controller & Shortcuts */}
      {!hideController && (
        <BoardController
          currentPly={currentPly}
          totalPly={totalPly}
          currentMove={currentMove}
          isFlipped={isFlipped}
          onFirstPly={onFirstPly}
          onPrevPly={onPrevPly}
          onNextPly={onNextPly}
          onLastPly={onLastPly}
          onFlipToggle={onFlipToggle}
        />
      )}
    </div>
  );
};
