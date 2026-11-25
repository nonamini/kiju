/**
 * Interactive GUI Shogi Move Recorder Component.
 * Allows users to record move sequences (moves) by directly clicking pieces on a mini Shogi board,
 * eliminating the need to manually type USI strings.
 * Strictly English code, comments, identifiers (Rule 1).
 * Strictly TypeScript strict without any (Rule 2).
 */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ShogiBoard, INITIAL_HIRATE_SFEN } from '../../utils/shogiBoard';
import { Square, Color, ShogiMove } from '../../types/shogi';
import {
  getLegalMovesForSquare,
  getLegalDropsForPiece,
  rankToUsiChar,
  parseUsiMove,
} from '../../utils/shogiRules';
import { formatUsiToJapanese } from '../../utils/usiFormatter';
import { ShogiBoardView } from '../board/ShogiBoardView';
import { KomadaiView } from '../board/KomadaiView';

export interface TacticsMoveRecorderProps {
  initialSfen?: string;
  initialMoves?: string[];
  onChange: (moves: string[]) => void;
  className?: string;
}

interface PendingPromotion {
  from: Square;
  to: Square;
  pieceUpper: string;
}

export const TacticsMoveRecorder: React.FC<TacticsMoveRecorderProps> = ({
  initialSfen = INITIAL_HIRATE_SFEN,
  initialMoves = [],
  onChange,
  className = '',
}) => {
  const { t } = useTranslation();
  const [moves, setMoves] = useState<string[]>(initialMoves);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [selectedHandPiece, setSelectedHandPiece] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);

  // Compute active board and ply from initialSfen + applied moves
  const { currentBoard, lastMove, moveHistory } = useMemo(() => {
    let board: ShogiBoard;
    try {
      board = ShogiBoard.fromSfen(initialSfen);
    } catch {
      board = new ShogiBoard();
    }

    let lastAppliedMove: ShogiMove | undefined;
    const history: Array<{ usi: string; label: string }> = [];

    for (let i = 0; i < moves.length; i++) {
      const usi = moves[i];
      if (!usi) continue;
      const turnColor: Color = i % 2 === 0 ? 'b' : 'w';
      const turnNum: 0 | 1 = i % 2 === 0 ? 0 : 1;
      try {
        const parsed = parseUsiMove(usi, board, i + 1, turnColor);
        if (parsed) {
          board.applyMove(parsed);
          lastAppliedMove = parsed;
          const jp = formatUsiToJapanese(usi, turnNum);
          history.push({ usi, label: `${i + 1}. ${jp}` });
        }
      } catch (err) {
        console.warn(`[TacticsMoveRecorder] Failed move ${usi}:`, err);
      }
    }

    return { currentBoard: board, lastMove: lastAppliedMove, moveHistory: history };
  }, [initialSfen, moves]);

  const activeTurn: Color = moves.length % 2 === 0 ? 'b' : 'w';

  // Compute target squares for selected piece on board
  const targetSquares = useMemo<Square[]>(() => {
    if (selectedSquare) {
      const legalTargets = getLegalMovesForSquare(currentBoard, selectedSquare);
      return legalTargets.map((t) => t.to);
    }
    if (selectedHandPiece) {
      return getLegalDropsForPiece(currentBoard, selectedHandPiece.toUpperCase(), activeTurn);
    }
    return [];
  }, [currentBoard, selectedSquare, selectedHandPiece, activeTurn]);

  const handleApplyMove = (usi: string) => {
    const nextMoves = [...moves, usi];
    setMoves(nextMoves);
    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setPendingPromotion(null);
    onChange(nextMoves);
  };

  const handleSquareClick = (square: Square) => {
    if (pendingPromotion) return;

    // 1. If a hand piece is selected and target clicked: drop
    if (selectedHandPiece) {
      const canDrop = targetSquares.some((t) => t.file === square.file && t.rank === square.rank);
      if (canDrop) {
        const pieceUpper = selectedHandPiece.toUpperCase();
        const usi = `${pieceUpper}*${square.file}${rankToUsiChar(square.rank)}`;
        handleApplyMove(usi);
        return;
      }
      setSelectedHandPiece(null);
    }

    // 2. If a board square is selected and a target clicked: move or promote
    if (selectedSquare) {
      const isTarget = targetSquares.some((t) => t.file === square.file && t.rank === square.rank);
      if (isTarget) {
        const legalTargets = getLegalMovesForSquare(currentBoard, selectedSquare);
        const match = legalTargets.find((t) => t.to.file === square.file && t.to.rank === square.rank);
        const piece = currentBoard.getSquare(selectedSquare.file, selectedSquare.rank);
        const pieceUpper = piece ? piece.replace('+', '').toUpperCase() : '';

        if (match?.forcePromote) {
          const usi = `${selectedSquare.file}${rankToUsiChar(selectedSquare.rank)}${square.file}${rankToUsiChar(square.rank)}+`;
          handleApplyMove(usi);
          return;
        }

        if (match?.canPromote) {
          setPendingPromotion({
            from: selectedSquare,
            to: square,
            pieceUpper,
          });
          return;
        }

        const usi = `${selectedSquare.file}${rankToUsiChar(selectedSquare.rank)}${square.file}${rankToUsiChar(square.rank)}`;
        handleApplyMove(usi);
        return;
      }
    }

    // 3. Otherwise select piece on square if it belongs to current turn
    const clickedPiece = currentBoard.getSquare(square.file, square.rank);
    if (clickedPiece) {
      const isBlackPiece = clickedPiece === clickedPiece.toUpperCase();
      const pieceColor: Color = isBlackPiece ? 'b' : 'w';
      if (pieceColor === activeTurn) {
        setSelectedSquare(square);
        setSelectedHandPiece(null);
        return;
      }
    }

    setSelectedSquare(null);
    setSelectedHandPiece(null);
  };

  const handleHandPieceClick = (color: Color, pieceKey: string) => {
    if (pendingPromotion) return;
    if (color !== activeTurn) return;

    if (selectedHandPiece === pieceKey) {
      setSelectedHandPiece(null);
    } else {
      setSelectedHandPiece(pieceKey);
      setSelectedSquare(null);
    }
  };

  const handlePromotionChoice = (promote: boolean) => {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    const usi = `${from.file}${rankToUsiChar(from.rank)}${to.file}${rankToUsiChar(to.rank)}${promote ? '+' : ''}`;
    handleApplyMove(usi);
  };

  const handleUndo = () => {
    if (moves.length === 0) return;
    const nextMoves = moves.slice(0, -1);
    setMoves(nextMoves);
    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setPendingPromotion(null);
    onChange(nextMoves);
  };

  const handleReset = () => {
    setMoves([]);
    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setPendingPromotion(null);
    onChange([]);
  };

  return (
    <div className={`rounded-xl border border-slate-700 bg-slate-900/90 p-4 space-y-3 ${className}`}>
      {/* Instructions header */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-amber-300">
            {activeTurn === 'b' ? '▲ 先手番' : '△ 後手番'}の着手を入力
          </span>
          <span className="text-[11px] text-slate-400">
            （駒をクリックして移動先を指定）
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleUndo}
            disabled={moves.length === 0}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-[11px] text-slate-200 transition font-medium"
          >
            ⌫ 1手戻す
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={moves.length === 0}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-rose-900/50 hover:text-rose-200 disabled:opacity-30 text-[11px] text-slate-400 transition"
          >
            🔄 最初から
          </button>
          <button
            type="button"
            onClick={() => setIsFlipped((v) => !v)}
            className="p-1 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
            title={t('studio.flip_board', '盤面反転')}
          >
            🔄
          </button>
        </div>
      </div>

      {/* Promotion confirmation banner */}
      {pendingPromotion && (
        <div className="p-2.5 rounded-lg border border-amber-500/50 bg-amber-950/60 flex items-center justify-between gap-2 text-xs">
          <span className="font-bold text-amber-300">{t('board.promote_confirm', '成りますか？')}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handlePromotionChoice(true)}
              className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition shadow"
            >
              {t('board.promote', '成る')}
            </button>
            <button
              type="button"
              onClick={() => handlePromotionChoice(false)}
              className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
            >
              {t('board.not_promote', '不成')}
            </button>
          </div>
        </div>
      )}

      {/* Board & Komadai Section */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
        {/* Gote Komadai */}
        <div className="w-full sm:w-20 shrink-0">
          <KomadaiView
            color={isFlipped ? 'b' : 'w'}
            playerName={isFlipped ? '先手' : '後手'}
            isTurn={activeTurn === (isFlipped ? 'b' : 'w')}
            hand={currentBoard.getHand(isFlipped ? 'b' : 'w')}
            selectedPiece={selectedHandPiece}
            onPieceSelect={(p) => handleHandPieceClick(isFlipped ? 'b' : 'w', p)}
            selectable={activeTurn === (isFlipped ? 'b' : 'w')}
          />
        </div>

        {/* 9x9 Board */}
        <div className="w-full max-w-[280px] sm:max-w-[320px] aspect-square shrink-0">
          <ShogiBoardView
            board={currentBoard}
            isFlipped={isFlipped}
            lastMove={lastMove}
            showLastMoveArrow={Boolean(lastMove)}
            selectedSquare={selectedSquare}
            targetSquares={targetSquares}
            onSquareClick={handleSquareClick}
          />
        </div>

        {/* Sente Komadai */}
        <div className="w-full sm:w-20 shrink-0">
          <KomadaiView
            color={isFlipped ? 'w' : 'b'}
            playerName={isFlipped ? '後手' : '先手'}
            isTurn={activeTurn === (isFlipped ? 'w' : 'b')}
            hand={currentBoard.getHand(isFlipped ? 'w' : 'b')}
            selectedPiece={selectedHandPiece}
            onPieceSelect={(p) => handleHandPieceClick(isFlipped ? 'w' : 'b', p)}
            selectable={activeTurn === (isFlipped ? 'w' : 'b')}
          />
        </div>
      </div>

      {/* Recorded Moves Sequence Display */}
      <div className="space-y-1.5 pt-2 border-t border-slate-800 text-xs">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>
            {t('tactics.recorded_moves_count', '記録された手順（全 {{count}} 手）:', {
              count: moves.length,
            })}
          </span>
          {moves.length === 0 && (
            <span className="text-amber-400">
              {t('tactics.moves_empty_initial', '※未入力（平手初期局面のみ）')}
            </span>
          )}
        </div>
        {moves.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px]">
            {moveHistory.map((item, idx) => (
              <span
                key={`${idx}-${item.usi}`}
                className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 font-sans"
              >
                {item.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
