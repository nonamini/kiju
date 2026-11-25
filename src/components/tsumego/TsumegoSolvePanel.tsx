/**
 * Tsumego Solving Panel Component.
 *
 * Provides an interactive, distraction-free board interface for solving checkmate puzzles:
 * - Ply countdown display
 * - Promote / Do Not Promote confirmation dialog when entering/leaving the promotion zone
 * - Animated defender escape/capture refutation on wrong checks with 1-click Undo & Retry
 * - Automatic opponent defensive reply along the solution line
 * - Win celebratory banner with retry / next controls
 * - Hint reveal (formatted using board piece state)
 *
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShogiMove, Square } from '../../types/shogi';
import { TsumegoProblem } from '../../types/tsumego';
import { buildUsiSequenceSnapshots } from '../../utils/positionEditor';
import { ShogiBoard } from '../../utils/shogiBoard';
import {
  TargetSquare,
  getStrictLegalDropsForPiece,
  getStrictLegalMovesForSquare,
  parseUsiMove,
  rankToUsiChar,
} from '../../utils/shogiRules';
import { judgeTsumegoMove } from '../../utils/tsumegoJudge';
import { recordTsumegoAttempt } from '../../utils/tsumegoStorage';
import { trackEvent } from '../../utils/analytics';
import { formatUsiToJapanese } from '../../utils/usiFormatter';
import { KomadaiView } from '../board/KomadaiView';
import { ShogiBoardView } from '../board/ShogiBoardView';

export interface TsumegoSolvePanelProps {
  problem: TsumegoProblem;
  isMasked?: boolean;
  onNextProblem?: () => void;
  onProblemSelect?: (id: string) => void;
  className?: string;
}

interface PendingTsumegoPromotion {
  from: Square;
  to: Square;
  fromUsi: string;
  toUsi: string;
}

interface RefutedBoardState {
  prevSfen: string;
  prevPly: number;
  prevLastMove?: ShogiMove;
  refutationLabel: string;
  errorCode: 'refuted' | 'off_pv';
}

export const TsumegoSolvePanel: React.FC<TsumegoSolvePanelProps> = ({
  problem,
  isMasked = false,
  onNextProblem,
  className = '',
}) => {
  const { t } = useTranslation();

  // Current problem session state
  const [board, setBoard] = useState<ShogiBoard>(() => ShogiBoard.fromSfen(problem.startSfen));
  const [currentPly, setCurrentPly] = useState<number>(0);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [selectedHandPiece, setSelectedHandPiece] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingTsumegoPromotion | null>(null);
  const [lastMove, setLastMove] = useState<ShogiMove | undefined>(undefined);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [isAnimatingReply, setIsAnimatingReply] = useState<boolean>(false);
  const [refutedState, setRefutedState] = useState<RefutedBoardState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hintsUsed, setHintsUsed] = useState<number>(0);
  const [hintMoveUsi, setHintMoveUsi] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [isFlipped, setIsFlipped] = useState<boolean>(problem.sideToMove === 'w');

  const replyTimerRef = useRef<number | null>(null);

  const clearReplyTimer = useCallback(() => {
    if (replyTimerRef.current !== null) {
      window.clearTimeout(replyTimerRef.current);
      replyTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearReplyTimer();
    };
  }, [clearReplyTimer]);

  // Reset when problem changes
  useEffect(() => {
    clearReplyTimer();
    setBoard(ShogiBoard.fromSfen(problem.startSfen));
    setCurrentPly(0);
    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setPendingPromotion(null);
    setLastMove(undefined);
    setIsCompleted(false);
    setIsAnimatingReply(false);
    setRefutedState(null);
    setErrorMessage(null);
    setHintsUsed(0);
    setHintMoveUsi(null);
    setStartTime(Date.now());
    setIsFlipped(problem.sideToMove === 'w');
  }, [problem.id, problem.startSfen, problem.sideToMove, clearReplyTimer]);

  const interactionLocked =
    isCompleted || isAnimatingReply || refutedState !== null || pendingPromotion !== null;

  // Remaining moves countdown
  const remainingPlies = useMemo(() => {
    return Math.max(0, problem.moveLimit - currentPly);
  }, [problem.moveLimit, currentPly]);

  // Strict legal moves for selected square (keeps promotion flags intact)
  const legalMovesForSelected = useMemo<TargetSquare[]>(() => {
    if (interactionLocked || !selectedSquare) return [];
    return getStrictLegalMovesForSquare(board, selectedSquare);
  }, [board, selectedSquare, interactionLocked]);

  // Compute legal target squares for highlighted dots
  const targetSquares = useMemo<Square[]>(() => {
    if (interactionLocked) return [];
    if (selectedSquare) {
      return legalMovesForSelected.map((m) => m.to);
    }
    if (selectedHandPiece) {
      return getStrictLegalDropsForPiece(board, selectedHandPiece, problem.sideToMove);
    }
    return [];
  }, [
    board,
    selectedSquare,
    legalMovesForSelected,
    selectedHandPiece,
    problem.sideToMove,
    interactionLocked,
  ]);

  // Execute a player's move (after any promotion choice is resolved)
  const handleExecuteMove = useCallback(
    (usiMove: string) => {
      clearReplyTimer();
      setErrorMessage(null);
      setHintMoveUsi(null);
      setPendingPromotion(null);

      const prevSfen = board.toSfen();
      const prevPly = currentPly;
      const prevLastMove = lastMove;
      const defendingSide = problem.sideToMove === 'b' ? 'w' : 'b';

      const judge = judgeTsumegoMove(problem, prevPly, board, usiMove);

      // Legal check that fails (no mate within limit or off-PV): animate defender escape & allow undo
      if (!judge.isCorrect && judge.isRefuted && judge.boardAfterPlayerSfen && judge.refutationMove) {
        const boardAfterPlayer = ShogiBoard.fromSfen(judge.boardAfterPlayerSfen);
        const parsedPlayer = parseUsiMove(
          usiMove,
          board,
          board.getPly(),
          problem.sideToMove,
          prevLastMove?.to
        );
        const snapshots = buildUsiSequenceSnapshots(prevSfen, [usiMove, judge.refutationMove]);
        const refutationLabel =
          snapshots[1]?.label ??
          formatUsiToJapanese(judge.refutationMove, defendingSide === 'b' ? 0 : 1);

        setBoard(boardAfterPlayer);
        if (parsedPlayer) {
          setLastMove(parsedPlayer);
        }
        setIsAnimatingReply(true);

        const nextBoardAfterRefutation = ShogiBoard.fromSfen(judge.nextBoardSfen);
        const parsedRefutation = parseUsiMove(
          judge.refutationMove,
          boardAfterPlayer,
          boardAfterPlayer.getPly(),
          defendingSide,
          parsedPlayer?.to
        );

        replyTimerRef.current = window.setTimeout(() => {
          replyTimerRef.current = null;
          setBoard(nextBoardAfterRefutation);
          if (parsedRefutation) {
            setLastMove(parsedRefutation);
          }
          setRefutedState({
            prevSfen,
            prevPly,
            prevLastMove,
            refutationLabel,
            errorCode: judge.errorCode === 'off_pv' ? 'off_pv' : 'refuted',
          });
          setIsAnimatingReply(false);
          recordTsumegoAttempt({
            problemId: problem.id,
            solved: false,
            movesCount: prevPly + 1,
            hintsUsed,
            elapsedMs: Date.now() - startTime,
            timestamp: Date.now(),
          });
        }, 420);
        return;
      }

      // Non-check or illegal move: show immediate localized error without advancing board
      if (!judge.isCorrect) {
        if (judge.errorCode === 'not_check') {
          setErrorMessage(t('tsumego_solver.err_must_be_check'));
        } else if (judge.errorCode === 'illegal') {
          setErrorMessage(t('tsumego_solver.err_illegal'));
        } else if (judge.errorCode === 'parse_failed') {
          setErrorMessage(t('tsumego_solver.err_parse_failed'));
        } else {
          setErrorMessage(judge.errorMessage ?? t('tsumego_solver.err_refuted_generic'));
        }
        return;
      }

      const parsedMove = parseUsiMove(
        usiMove,
        board,
        board.getPly(),
        problem.sideToMove,
        prevLastMove?.to
      );

      if (judge.isCompleted) {
        setBoard(ShogiBoard.fromSfen(judge.nextBoardSfen));
        if (parsedMove) {
          setLastMove(parsedMove);
        }
        setIsCompleted(true);
        recordTsumegoAttempt({
          problemId: problem.id,
          solved: true,
          movesCount: prevPly + 1,
          hintsUsed,
          elapsedMs: Date.now() - startTime,
          timestamp: Date.now(),
        });
        trackEvent('tsumego_solve');
        return;
      }

      if (judge.opponentReply && judge.boardAfterPlayerSfen) {
        const boardAfterPlayer = ShogiBoard.fromSfen(judge.boardAfterPlayerSfen);
        const boardAfterOpponent = ShogiBoard.fromSfen(judge.nextBoardSfen);
        const parsedOpponent = parseUsiMove(
          judge.opponentReply,
          boardAfterPlayer,
          boardAfterPlayer.getPly(),
          defendingSide,
          parsedMove?.to
        );

        setBoard(boardAfterPlayer);
        if (parsedMove) {
          setLastMove(parsedMove);
        }
        setIsAnimatingReply(true);

        replyTimerRef.current = window.setTimeout(() => {
          replyTimerRef.current = null;
          setBoard(boardAfterOpponent);
          setCurrentPly((prev) => prev + 2);
          if (parsedOpponent) {
            setLastMove(parsedOpponent);
          }
          setIsAnimatingReply(false);
        }, 320);
      }
    },
    [problem, currentPly, board, lastMove, hintsUsed, startTime, t, clearReplyTimer]
  );

  // Undo wrong check & defender escape so user can retry immediately from that ply
  const handleUndoRefuted = useCallback(() => {
    if (!refutedState) return;
    clearReplyTimer();
    setBoard(ShogiBoard.fromSfen(refutedState.prevSfen));
    setCurrentPly(refutedState.prevPly);
    setLastMove(refutedState.prevLastMove);
    setRefutedState(null);
    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setPendingPromotion(null);
    setErrorMessage(null);
  }, [refutedState, clearReplyTimer]);

  // Handle board square click
  const handleSquareClick = useCallback(
    (sq: Square) => {
      if (interactionLocked) return;

      const clickedPiece = board.getSquare(sq.file, sq.rank);
      const isFriendly =
        clickedPiece &&
        (problem.sideToMove === 'b'
          ? clickedPiece === clickedPiece.toUpperCase()
          : clickedPiece === clickedPiece.toLowerCase());

      // If clicking destination square while a piece is selected
      if (selectedSquare) {
        const matchedTarget = legalMovesForSelected.find(
          (m) => m.to.file === sq.file && m.to.rank === sq.rank
        );
        if (matchedTarget) {
          const fromUsi = `${selectedSquare.file}${rankToUsiChar(selectedSquare.rank)}`;
          const toUsi = `${sq.file}${rankToUsiChar(sq.rank)}`;
          if (matchedTarget.forcePromote) {
            handleExecuteMove(`${fromUsi}${toUsi}+`);
            setSelectedSquare(null);
          } else if (matchedTarget.canPromote) {
            setPendingPromotion({ from: selectedSquare, to: sq, fromUsi, toUsi });
          } else {
            handleExecuteMove(`${fromUsi}${toUsi}`);
            setSelectedSquare(null);
          }
          return;
        }
      }

      // If clicking destination square while hand piece is selected
      if (selectedHandPiece) {
        const isTarget = targetSquares.some((tgt) => tgt.file === sq.file && tgt.rank === sq.rank);
        if (isTarget) {
          const usiDrop = `${selectedHandPiece.toUpperCase()}*${sq.file}${rankToUsiChar(sq.rank)}`;
          handleExecuteMove(usiDrop);
          setSelectedHandPiece(null);
          return;
        }
      }

      // Otherwise select or deselect friendly piece on board
      setErrorMessage(null);
      if (isFriendly) {
        setSelectedSquare((prev) =>
          prev?.file === sq.file && prev?.rank === sq.rank ? null : sq
        );
        setSelectedHandPiece(null);
      } else {
        setSelectedSquare(null);
      }
    },
    [
      interactionLocked,
      board,
      selectedSquare,
      legalMovesForSelected,
      selectedHandPiece,
      targetSquares,
      problem.sideToMove,
      handleExecuteMove,
    ]
  );

  // Handle hand piece selection
  const handleSelectHandPiece = useCallback(
    (pieceKey: string) => {
      if (interactionLocked) return;
      setErrorMessage(null);
      setSelectedSquare(null);
      setSelectedHandPiece((prev) => (prev === pieceKey ? null : pieceKey));
    },
    [interactionLocked]
  );

  // Restart current problem
  const handleRetry = useCallback(() => {
    clearReplyTimer();
    setBoard(ShogiBoard.fromSfen(problem.startSfen));
    setCurrentPly(0);
    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setPendingPromotion(null);
    setLastMove(undefined);
    setIsCompleted(false);
    setIsAnimatingReply(false);
    setRefutedState(null);
    setErrorMessage(null);
    setHintMoveUsi(null);
  }, [problem.startSfen, clearReplyTimer]);

  // Reveal next move hint
  const handleRevealHint = useCallback(() => {
    if (interactionLocked) return;
    const nextMove = problem.solutionPv[currentPly];
    if (nextMove) {
      setHintMoveUsi(nextMove);
      setHintsUsed((prev) => prev + 1);
    }
  }, [problem.solutionPv, currentPly, interactionLocked]);

  const hintLabel = useMemo(() => {
    if (!hintMoveUsi) return null;
    return (
      buildUsiSequenceSnapshots(board.toSfen(), [hintMoveUsi])[0]?.label ??
      formatUsiToJapanese(hintMoveUsi, problem.sideToMove === 'b' ? 0 : 1)
    );
  }, [hintMoveUsi, board, problem.sideToMove]);

  const hideHints = Boolean(isMasked && !isCompleted);

  return (
    <div className={`flex flex-col items-center justify-between w-full h-full max-w-[560px] mx-auto select-none ${className}`}>
      {/* Top Header Card */}
      <div className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2.5 mb-1.5 flex items-center justify-between shadow-lg shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🧩</span>
            <h2 className="text-sm sm:text-base font-bold text-slate-100">
              {hideHints
                ? t('tsumego_solver.masked_title')
                : problem.title ?? t('studio.tsumego.default_title')}
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {hideHints
                ? t('tsumego_solver.masked_ply_badge')
                : t('position_editor.move_limit_fmt', { count: problem.moveLimit })}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
            <span>
              {problem.sideToMove === 'b' ? t('board.sente') : t('board.gote')}
              {t('tsumego_solver.turn_suffix')}
            </span>
            <span>•</span>
            <span className="text-amber-400 font-medium">
              {isCompleted
                ? t('tsumego_solver.cleared_badge')
                : hideHints
                  ? t('tsumego_solver.masked_solving_status')
                  : t('tsumego_solver.remaining_plies', { count: remainingPlies })}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsFlipped((prev) => !prev)}
            title={t('board.flip')}
            className="p-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs transition"
          >
            🔄
          </button>
          <button
            type="button"
            onClick={handleRetry}
            title={t('tsumego_solver.retry_title')}
            className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          >
            {t('studio.tsumego.retry_btn')}
          </button>
          <button
            type="button"
            onClick={handleRevealHint}
            disabled={interactionLocked}
            className="px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold transition disabled:opacity-50"
          >
            {t('studio.tsumego.hint_btn')}
          </button>
        </div>
      </div>

      {/* Refuted Wrong-Check Banner with Undo */}
      {refutedState && (
        <div className="w-full mb-1 px-3 py-2 rounded-lg bg-rose-950/90 border border-rose-500/60 text-rose-200 text-xs flex items-center justify-between gap-2 shadow-lg shrink-0">
          <span className="font-semibold">
            ✕{' '}
            {refutedState.errorCode === 'off_pv'
              ? t('tsumego_solver.err_not_solution_line', {
                  move: refutedState.refutationLabel,
                })
              : t('tsumego_solver.err_refuted_with_move', {
                  move: refutedState.refutationLabel,
                })}
          </span>
          <button
            type="button"
            onClick={handleUndoRefuted}
            className="px-2.5 py-1 rounded-md bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold text-[11px] shrink-0 transition shadow"
          >
            ↩ {t('tsumego_solver.undo_retry_btn')}
          </button>
        </div>
      )}

      {/* Immediate Error / Hint Banner */}
      {errorMessage && !refutedState && (
        <div className="w-full mb-1 px-3 py-1.5 rounded-lg bg-red-950/80 border border-red-500/40 text-red-300 text-xs flex items-center justify-between animate-shake shrink-0">
          <span>⚠️ {errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-400 hover:text-red-200"
          >
            ✕
          </button>
        </div>
      )}

      {hintLabel && (
        <div className="w-full mb-1 px-3 py-1.5 rounded-lg bg-amber-950/80 border border-amber-500/40 text-amber-300 text-xs flex items-center justify-between shrink-0">
          <span>
            💡 {t('tsumego_solver.hint_prefix')} <strong>{hintLabel}</strong> {t('tsumego_solver.hint_suffix')}
          </span>
          <button
            type="button"
            onClick={() => setHintMoveUsi(null)}
            className="text-amber-400 hover:text-amber-200"
          >
            ✕
          </button>
        </div>
      )}

      {/* Opponent Komadai (Top) */}
      <div className="w-full mb-1 shrink-0">
        <KomadaiView
          color={isFlipped ? 'b' : 'w'}
          playerName={
            (isFlipped ? 'b' : 'w') === problem.sideToMove
              ? t('tsumego_solver.side_attacker')
              : t('tsumego_solver.side_defender')
          }
          isTurn={board.getTurn() === (isFlipped ? 'b' : 'w')}
          hand={board.getHand(isFlipped ? 'b' : 'w')}
        />
      </div>

      {/* Shogi Board Area (Fills vertical space dynamically) */}
      <div className="relative w-full flex-1 min-h-[300px] flex items-center justify-center overflow-hidden">
        <ShogiBoardView
          board={board}
          isFlipped={isFlipped}
          lastMove={lastMove}
          showLastMoveArrow={true}
          selectedSquare={selectedSquare}
          targetSquares={targetSquares}
          onSquareClick={handleSquareClick}
          className="h-full w-auto max-w-full"
        />

        {/* Subtle Defender Response Overlay Pill (Zero Layout Shift) */}
        {isAnimatingReply && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-slate-900/90 border border-amber-500/50 text-amber-300 text-xs font-bold shadow-lg pointer-events-none">
            ⏳ {t('tsumego_solver.thinking_reply')}
          </div>
        )}

        {/* Promote / Do Not Promote Confirmation Overlay */}
        {pendingPromotion && (
          <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-20 rounded-xl animate-fadeIn p-4">
            <div className="bg-slate-900 border border-amber-500/60 rounded-xl p-5 shadow-2xl text-center space-y-4 max-w-xs w-full">
              <h4 className="text-sm font-bold text-amber-300">
                {t('tsumego_solver.promote_title')}
              </h4>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const { fromUsi, toUsi } = pendingPromotion;
                    setPendingPromotion(null);
                    setSelectedSquare(null);
                    handleExecuteMove(`${fromUsi}${toUsi}+`);
                  }}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow transition active:scale-95"
                >
                  {t('tsumego_solver.promote_yes')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const { fromUsi, toUsi } = pendingPromotion;
                    setPendingPromotion(null);
                    setSelectedSquare(null);
                    handleExecuteMove(`${fromUsi}${toUsi}`);
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-600 font-semibold text-sm transition active:scale-95"
                >
                  {t('tsumego_solver.promote_no')}
                </button>
                <button
                  type="button"
                  onClick={() => setPendingPromotion(null)}
                  className="px-3 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800 text-xs font-semibold transition"
                >
                  {t('tsumego_solver.promote_cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Clear Celebration Overlay */}
        {isCompleted && (
          <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs rounded-xl flex flex-col items-center justify-center p-4 animate-fadeIn z-10">
            <span className="text-4xl mb-2">🎉</span>
            <h3 className="text-xl font-black text-amber-400 tracking-wide mb-1">
              {t('tsumego_solver.mate_success_title')}
            </h3>
            {isMasked && problem.title && (
              <p className="text-xs font-bold text-amber-200 mb-1">
                {problem.title}
              </p>
            )}
            <p className="text-xs text-slate-300 mb-4">
              {t('tsumego_solver.mate_success_desc', { count: problem.moveLimit })}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRetry}
                className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
              >
                {t('tsumego_solver.replay_retry_btn')}
              </button>
              {onNextProblem && (
                <button
                  type="button"
                  onClick={onNextProblem}
                  className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-bold shadow-lg transition"
                >
                  {t('tsumego_solver.next_problem_btn')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Player Komadai (Bottom) */}
      <div className="w-full mt-1 shrink-0">
        <KomadaiView
          color={isFlipped ? 'w' : 'b'}
          playerName={
            (isFlipped ? 'w' : 'b') === problem.sideToMove
              ? t('tsumego_solver.side_attacker')
              : t('tsumego_solver.side_defender')
          }
          isTurn={board.getTurn() === (isFlipped ? 'w' : 'b')}
          hand={board.getHand(isFlipped ? 'w' : 'b')}
          selectedPiece={selectedHandPiece}
          onPieceSelect={handleSelectHandPiece}
          selectable={!interactionLocked}
        />
      </div>
    </div>
  );
};
