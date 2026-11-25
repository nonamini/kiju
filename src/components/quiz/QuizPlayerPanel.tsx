/**
 * Tactical Quiz Player Panel Component.
 * Interactive player for 3-5 ply tactical quizzes with hybrid 3-choice hints,
 * tolerant verdict toasts, and post-answer principal variation replay.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShogiMove, Square } from '../../types/shogi';
import { TacticalQuizCard, TacticalQuizType } from '../../types/quiz';
import { PunishInfo } from '../../hooks/useQuizSession';
import { ShogiBoard } from '../../utils/shogiBoard';
import { formatShogiMove, parseUsiMove, getAllStrictLegalMoves } from '../../utils/shogiRules';
import { ShogiBoardView } from '../board/ShogiBoardView';
import { KomadaiView } from '../board/KomadaiView';

export interface QuizPlayerPanelProps {
  card: TacticalQuizCard;
  initialBoard?: ShogiBoard; // clean question-start board
  board: ShogiBoard; // current display board
  isFlipped: boolean;
  step: number; // solver step index (0-based)
  totalSteps: number; // ceil(pv.length / 2)
  lastMove?: ShogiMove;
  status:
    | 'awaiting_move'
    | 'ai_replying'
    | 'judging'
    | 'wrong_retry'
    | 'finished';
  verdict: 'best' | 'acceptable' | 'wrong' | null; // last verdict
  evalLossCp?: number | null; // Centipawn loss compared to best move
  punishInfo?: PunishInfo | null;
  hintLevel: 0 | 1; // 1 = three-choice shown
  hintChoices: string[]; // USI x3 when hintLevel=1
  selectedSquare: Square | null;
  targetSquares: Square[];
  selectedHandPiece?: string | null;
  onSquareClick: (s: Square) => void;
  onSelectHandPiece?: (pieceKey: string) => void;
  onRequestHint: () => void; // 3-choice
  onPickChoice: (usi: string) => void;
  onRevealAnswer: () => void;
  onResetCurrentStep?: () => void;
  onNext: () => void; // load next quiz
  formatChoiceLabel?: (usi: string) => string;
  result: { quality: number; explanationKey: string } | null;
  replayBoard: ShogiBoard | null;
  replayLastMove?: ShogiMove;
  replayIndex: number; // PV animation state
  isReplaying?: boolean;
  isReplayPaused?: boolean;
  onToggleReplay?: () => void;
  onPauseResumeReplay?: () => void;
  onStepReplay?: (delta: number) => void;
  onFlipToggle?: () => void;
  className?: string;
}

const TYPE_BADGES: Record<
  TacticalQuizType,
  { icon: string; labelKey: string; classNames: string }
> = {
  attack: {
    icon: '🔥',
    labelKey: 'quiz.type.attack',
    classNames: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  defense: {
    icon: '🛡️',
    labelKey: 'quiz.type.defense',
    classNames: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  },
  race: {
    icon: '⚖️',
    labelKey: 'quiz.type.race',
    classNames: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  },
  mate: {
    icon: '👑',
    labelKey: 'quiz.type.mate',
    classNames: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
};

export const QuizPlayerPanel: React.FC<QuizPlayerPanelProps> = ({
  card,
  initialBoard,
  board,
  isFlipped,
  step,
  totalSteps,
  lastMove,
  status,
  verdict,
  evalLossCp,
  punishInfo,
  hintLevel,
  hintChoices,
  selectedSquare,
  targetSquares,
  selectedHandPiece,
  onSquareClick,
  onSelectHandPiece,
  onRequestHint,
  onPickChoice,
  onRevealAnswer,
  onResetCurrentStep,
  onNext,
  formatChoiceLabel,
  result,
  replayBoard,
  replayLastMove,
  replayIndex,
  isReplaying = false,
  isReplayPaused = false,
  onToggleReplay,
  onPauseResumeReplay,
  onStepReplay,
  onFlipToggle,
  className = '',
}) => {
  const { t } = useTranslation();
  const typeConfig = TYPE_BADGES[card.type] ?? TYPE_BADGES.attack;
  const isFinished = status === 'finished';
  const isWrongState = status === 'wrong_retry' || verdict === 'wrong';
  // If the user made a mistake and we are in wrong_retry, render initialBoard so the position is clean and exactly matches the best move hint!
  const displayBoard = replayBoard ?? (isWrongState && initialBoard ? initialBoard : board);

  const topColor = isFlipped ? 'b' : 'w';
  const bottomColor = isFlipped ? 'w' : 'b';

  // Last move to highlight on the board
  // When in wrong state and showing initialBoard, use opponent's last move that led to the quiz position (not the user's blunder/punish)
  const effectiveLastMove: ShogiMove | undefined = replayBoard && replayLastMove
    ? replayLastMove
    : (isWrongState && initialBoard ? card.opponentLastMove : lastMove) ?? card.opponentLastMove;
  const currentStepBestUsi = card.pv[step * 2] ?? card.bestMove;

  const currentStepBestMove = React.useMemo(() => {
    try {
      const solverTurn = card.sideToMove;
      const cardMovePly = card.ply + step * 2;
      const targetBoard = initialBoard ?? board;
      return parseUsiMove(currentStepBestUsi, targetBoard, cardMovePly, solverTurn);
    } catch {
      return null;
    }
  }, [currentStepBestUsi, initialBoard, board, card.ply, step, card.sideToMove]);

  // When replaying PV, do not show currentStepBestMove highlight arrow/squares
  const showMoveHighlight =
    !isReplaying && (status === 'wrong_retry' || verdict === 'wrong' || isFinished);
  const boardHintPieceSquares = showMoveHighlight && currentStepBestMove?.from
    ? [currentStepBestMove.from]
    : undefined;
  const boardHintSquares = showMoveHighlight && currentStepBestMove?.to
    ? [currentStepBestMove.to]
    : undefined;
  const boardHintArrow = showMoveHighlight && currentStepBestMove?.to
    ? { from: currentStepBestMove.from, to: currentStepBestMove.to }
    : null;

  // Pre-calculate parsed PV moves with Japanese strings and position boards along the simulation line
  const pvStepsData = React.useMemo(() => {
    if (!card || !card.pv || card.pv.length === 0 || !initialBoard) {
      return [];
    }
    try {
      const b = initialBoard.clone();
      let prevTo: Square | undefined = effectiveLastMove?.to;
      const startPly = card.ply;
      const stepsList: {
        usi: string;
        label: string;
        ply: number;
        turn: 'b' | 'w';
        boardBefore: ShogiBoard;
        choices: { usi: string; label: string; isCorrect: boolean; delta: number }[];
      }[] = [];

      for (let i = 0; i < card.pv.length; i++) {
        const usi = card.pv[i];
        if (!usi) continue;
        const turn = b.getTurn();
        const movePly = startPly + i;
        const boardBeforeThisMove = b.clone();
        const move = parseUsiMove(usi, b, movePly, turn, prevTo);

        let formattedLabel = usi;
        if (move) {
          formattedLabel = formatShogiMove(move).replace(/\(\d{2}\)$/, '');
          b.applyMove(move);
          prevTo = move.to;
        }

        // Generate 3 choices for this step position
        let stepChoices: { usi: string; label: string; isCorrect: boolean; delta: number }[] = [];
        if (i === 0 && card.choices && card.choices.length > 0) {
          stepChoices = card.choices.map((c) => {
            let choiceText = c.usi;
            const parsedC = parseUsiMove(c.usi, boardBeforeThisMove, movePly, turn);
            if (parsedC) choiceText = formatShogiMove(parsedC).replace(/\(\d{2}\)$/, '');
            const isBest = c.isCorrect || c.usi === usi;
            return {
              usi: c.usi,
              label: choiceText,
              isCorrect: isBest,
              delta: c.scoreDelta ?? (isBest ? 0 : -250),
            };
          });
        } else {
          // For subsequent PV moves (e.g. step 2, step 3...): Best move + 2 plausible legal distractors
          const legalMoves = getAllStrictLegalMoves(boardBeforeThisMove, turn);
          const legalUsis = legalMoves.map((m) => m.usi);
          const pickedDistractors = legalUsis.filter((u) => u !== usi).slice(0, 2);
          const rawChoices = [usi, ...pickedDistractors];
          // Deterministic sort
          rawChoices.sort((a, b) => a.localeCompare(b));

          stepChoices = rawChoices.map((choiceUsi) => {
            let choiceText = choiceUsi;
            const parsedC = parseUsiMove(choiceUsi, boardBeforeThisMove, movePly, turn);
            if (parsedC) choiceText = formatShogiMove(parsedC).replace(/\(\d{2}\)$/, '');
            const isBest = choiceUsi === usi;
            return {
              usi: choiceUsi,
              label: choiceText,
              isCorrect: isBest,
              delta: isBest ? 0 : -250,
            };
          });
        }

        stepsList.push({
          usi,
          label: formattedLabel,
          ply: movePly,
          turn,
          boardBefore: boardBeforeThisMove,
          choices: stepChoices,
        });
      }
      return stepsList;
    } catch {
      return [];
    }
  }, [card, initialBoard, effectiveLastMove]);

  // Backward-compatible formatted list for PV timeline
  const pvMovesFormatted = React.useMemo(() => {
    return pvStepsData.map((item) => ({ usi: item.usi, label: item.label }));
  }, [pvStepsData]);

  const formatChoiceText = (usi: string, overrideSide?: 'b' | 'w'): string => {
    if (formatChoiceLabel) {
      return formatChoiceLabel(usi);
    }
    try {
      const turn = overrideSide ?? card.sideToMove;
      const cardMovePly = card.ply + step * 2;
      // Strictly use initialBoard (pre-move state) to accurately identify moving piece
      const parseTargetBoard = initialBoard ?? displayBoard;
      const move = parseUsiMove(usi, parseTargetBoard, cardMovePly, turn);
      if (move) {
        const fullStr = formatShogiMove(move);
        // Clean format without from-square suffix e.g. "▲２六歩" or "△８四歩"
        return fullStr.replace(/\(\d{2}\)$/, '');
      }
    } catch {
      // fallback
    }
    return usi;
  };

  // Choice list to render (uses card.choices or dynamically picked hintChoices)
  const choicesToRender = React.useMemo(() => {
    if (hintChoices.length > 0) {
      return hintChoices.map((usi) => {
        const meta = card.choices?.find((c) => c.usi === usi);
        return {
          usi,
          isCorrect: meta?.isCorrect ?? (usi === currentStepBestUsi),
          scoreDelta: meta?.scoreDelta,
        };
      });
    }
    if (card.choices && card.choices.length > 0) {
      return card.choices.map((c) => ({
        usi: c.usi,
        isCorrect: c.isCorrect,
        scoreDelta: c.scoreDelta,
      }));
    }
    return [];
  }, [card.choices, hintChoices, currentStepBestUsi]);
  // Helper to format evaluation score with polarity (solver's POV)
  const formatEvalText = (scoreCp: number): { text: string; colorClass: string } => {
    const signStr = scoreCp > 0 ? `+${scoreCp}` : `${scoreCp}`;
    if (Math.abs(scoreCp) <= 150) {
      return { text: `互角 (${signStr})`, colorClass: 'text-amber-300 border-amber-500/30 bg-amber-500/10' };
    }
    if (scoreCp > 150) {
      // Solver is winning
      const solverLabel = card.sideToMove === 'b' ? t('board.sente') + '有利' : t('board.gote') + '有利';
      return { text: `${solverLabel} (${signStr})`, colorClass: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' };
    }
    // Solver is losing
    const solverLabel = card.sideToMove === 'b' ? t('board.gote') + '有利' : t('board.sente') + '有利';
    return { text: `${solverLabel} (${signStr})`, colorClass: 'text-sky-300 border-sky-500/30 bg-sky-500/30' };
  };

  const initialEval = formatEvalText(card.scoreCpBefore);

  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl backdrop-blur-md max-w-2xl mx-auto w-full ${className}`}
    >
      {/* Top Header: Badge, Step Indicator, Current Eval & Flip */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold border ${typeConfig.classNames}`}
          >
            <span>{typeConfig.icon}</span>
            <span>{t(typeConfig.labelKey)}</span>
          </span>

          <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300 border border-slate-700">
            {t('quiz.card.ply', { ply: card.ply })}
          </span>

          <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-400 border border-amber-500/20">
            {t('quiz.player.step', { current: Math.min(step + 1, totalSteps), total: totalSteps })}
          </span>

          {/* Current Evaluation Score Badge */}
          <span
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold border font-mono ${initialEval.colorClass}`}
            title={t('quiz.player.eval_tooltip', '出題局面の評価値')}
          >
            <span>⚖️ {t('quiz.player.eval_label', '形勢:')}</span>
            <span>{initialEval.text}</span>
          </span>

          {/* Solver Side Badge */}
          <span
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold border ${
              card.sideToMove === 'b'
                ? 'bg-slate-800 text-slate-300 border-slate-700'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
            title={t('quiz.player.turn_tooltip', '解答者の手番')}
          >
            <span>🎯</span>
            <span>
              {t('quiz.player.turn_badge', '{{side}}の手番', {
                side: card.sideToMove === 'b' ? t('board.sente') : t('board.gote'),
              })}
            </span>
          </span>
        </div>

        {onFlipToggle && (
          <button
            type="button"
            onClick={onFlipToggle}
            className="rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700 hover:text-white transition active:scale-95 flex items-center gap-1"
            title={t('board.flip')}
          >
            <span>⟲</span>
            <span className="hidden sm:inline">{t('board.flip')}</span>
          </button>
        )}
      </div>

      {/* Opponent's Last Move Context Banner */}
      {effectiveLastMove && (
        <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700/80 text-xs shadow-md flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400 font-semibold flex items-center gap-1">
              <span>🎯</span>
              <span>{t('quiz.player.opponent_last_move')}:</span>
            </span>
            <span className="font-extrabold text-cyan-300 font-mono text-base bg-slate-950 px-3 py-1 rounded-lg border border-cyan-500/40 shadow-inner tracking-wide">
              {effectiveLastMove.kifString || `${effectiveLastMove.sfenMove}`}
            </span>
            <span className="text-slate-500 text-[11px] font-mono">
              ({t('quiz.player.until_ply', { ply: effectiveLastMove.ply })})
            </span>
          </div>

          <div className="flex items-center gap-2 font-bold text-slate-200 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-700">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
            <span>
              {t('quiz.player.your_turn_prompt', {
                side: card.sideToMove === 'b' ? t('board.sente') : t('board.gote'),
              })}
            </span>
          </div>
        </div>
      )}

      {/* Opponent Komadai (Top) */}
      <div className="flex justify-start">
        <KomadaiView
          color={topColor}
          playerName={topColor === 'b' ? t('board.sente') : t('board.gote')}
          isTurn={displayBoard.getTurn() === topColor}
          hand={displayBoard.getHand(topColor)}
          selectable={false}
        />
      </div>

      {/* Main Shogi Board with Move Highlights */}
      <div className="relative mx-auto w-full max-w-[420px] aspect-square rounded-xl overflow-hidden border border-slate-800 shadow-2xl bg-amber-950/20">
        <ShogiBoardView
          board={displayBoard}
          isFlipped={isFlipped}
          lastMove={effectiveLastMove}
          showLastMoveArrow={true}
          selectedSquare={selectedSquare}
          targetSquares={targetSquares}
          hintSquares={boardHintSquares}
          hintPieceSquares={boardHintPieceSquares}
          hintArrow={boardHintArrow}
          onSquareClick={!isFinished && status === 'awaiting_move' ? onSquareClick : undefined}
        />

        {/* Status Overlays */}
        {status === 'judging' && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-xl bg-slate-900 border border-amber-500/40 px-4 py-2.5 text-xs font-bold text-amber-300 shadow-2xl animate-pulse">
              <span className="animate-spin text-sm">⏳</span>
              <span>{t('quiz.player.judging')}</span>
            </div>
          </div>
        )}

        {status === 'ai_replying' && (
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-xl bg-slate-900 border border-sky-500/40 px-4 py-2.5 text-xs font-bold text-sky-300 shadow-2xl">
              <span className="animate-bounce text-sm">🤖</span>
              <span>{t('quiz.player.ai_replying')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Solver Komadai (Bottom) */}
      <div className="flex justify-start">
        <KomadaiView
          color={bottomColor}
          playerName={bottomColor === 'b' ? t('board.sente') : t('board.gote')}
          isTurn={displayBoard.getTurn() === bottomColor}
          hand={displayBoard.getHand(bottomColor)}
          selectedPiece={selectedHandPiece}
          onPieceSelect={onSelectHandPiece}
          selectable={!isFinished && status === 'awaiting_move'}
        />
      </div>

      {/* Verdict Alert Banners */}
      {verdict === 'best' && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-500/15 p-3 text-emerald-300 text-xs font-bold shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-base">🎉</span>
            <span>{t('quiz.player.verdict_best')}</span>
          </div>
          <span className="font-mono bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-200 text-[11px]">
            {t('quiz.player.eval_no_loss')}
          </span>
        </div>
      )}

      {verdict === 'acceptable' && (
        <div className="flex items-center justify-between rounded-xl border border-sky-500/40 bg-sky-500/15 p-3 text-sky-300 text-xs font-bold shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-base">✨</span>
            <span>{t('quiz.player.verdict_acceptable')}</span>
          </div>
          {evalLossCp !== undefined && evalLossCp !== null && (
            <span className="font-mono bg-sky-950/80 px-2 py-0.5 rounded border border-sky-500/30 text-sky-200 text-[11px]">
              {evalLossCp === 0
                ? t('quiz.player.eval_no_loss')
                : t('quiz.player.eval_loss_cp', { loss: evalLossCp })}
            </span>
          )}
        </div>
      )}

      {verdict === 'wrong' && (
        <div className="flex flex-col gap-2.5 rounded-xl border border-rose-500/40 bg-rose-500/15 p-3.5 text-rose-300 text-xs font-bold shadow-md animate-shake">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">❌</span>
              <span className="text-sm">{t('quiz.player.verdict_wrong')}</span>
            </div>
            {evalLossCp !== undefined && evalLossCp !== null && (
              <span className="font-mono bg-rose-950 px-2.5 py-1 rounded-lg border border-rose-500/30 text-rose-200 text-xs font-bold">
                {t('quiz.player.eval_loss_cp', { loss: evalLossCp })}
              </span>
            )}
          </div>

          {/* Opponent's Punish Move Counter-attack Details */}
          {punishInfo && (
            <div className="rounded-lg bg-slate-950/80 p-2.5 border border-rose-500/20 space-y-1.5 text-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-rose-400 font-semibold flex items-center gap-1">
                  <span>⚡</span>
                  <span>{t('quiz.player.opponent_punish_label', '相手の咎める手 (最善応手):')}</span>
                </span>
                <span className="font-mono text-cyan-300 font-extrabold text-sm bg-slate-900 px-2 py-0.5 rounded border border-cyan-500/30">
                  {punishInfo.punishMove?.kifString || punishInfo.punishMoveUsi}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between font-mono">
                <span>{t('quiz.player.eval_swing_label', '形勢の変化:')}</span>
                <span className="text-rose-300 font-semibold">
                  {punishInfo.scoreBefore > 0 ? `+${punishInfo.scoreBefore}` : punishInfo.scoreBefore} ➔{' '}
                  {punishInfo.scoreAfterUser > 0 ? `+${punishInfo.scoreAfterUser}` : punishInfo.scoreAfterUser}{' '}
                  (-{punishInfo.lossCp}点)
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-amber-300/90 font-normal border-t border-rose-500/20 pt-1.5">
            <span className="flex items-center gap-1">
              <span>🎯</span>
              <span>{t('quiz.player.best_move_highlight')}</span>
            </span>
            <span className="font-bold text-amber-200 font-mono text-xs">
              {t('quiz.player.best_move_label', {
                move: formatChoiceText(currentStepBestUsi, card.sideToMove),
              })}
            </span>
          </div>

          {onResetCurrentStep && (
            <button
              type="button"
              onClick={onResetCurrentStep}
              className="mt-1 w-full flex items-center justify-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 py-2 text-xs font-bold transition active:scale-95 shadow-sm"
            >
              <span>🔄</span>
              <span>{t('quiz.player.reset_to_question_btn', '出題局面に戻してもう一度解く')}</span>
            </button>
          )}
        </div>
      )}

      {/* Active Control Bar: 3-Choice Hint & Answer Reveal */}
      {!isFinished && (
        <div className="flex flex-col gap-3 pt-1">
          {/* 3-Choice Expansion Buttons with Score Deltas */}
          {hintLevel === 1 && hintChoices.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
              <div className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
                <span>💡</span>
                <span>{t('quiz.player.hint_btn')} (三択)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {hintChoices.map((usi) => {
                  const choiceMeta = card.choices?.find((c) => c.usi === usi);
                  const isChoiceCorrect = choiceMeta?.isCorrect ?? (usi === currentStepBestUsi);
                  const delta = choiceMeta?.scoreDelta;

                  return (
                    <button
                      key={usi}
                      type="button"
                      onClick={() => onPickChoice(usi)}
                      disabled={status !== 'awaiting_move' && status !== 'wrong_retry'}
                      className="flex flex-col items-center justify-center gap-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-amber-600 hover:text-slate-950 hover:border-amber-500 py-2.5 px-2 text-xs font-bold text-slate-200 transition active:scale-95 disabled:opacity-50 disabled:pointer-events-none shadow text-center group"
                    >
                      <span className="text-sm font-bold font-mono group-hover:text-slate-950">
                        {formatChoiceText(usi)}
                      </span>
                      {isFinished && delta !== undefined && (
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            isChoiceCorrect
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-950/80 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {isChoiceCorrect ? '最善 0' : (Math.abs(delta) >= 20000 ? '詰み・悪手' : `${delta} 悪手`)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onRequestHint}
              disabled={hintLevel === 1 || status !== 'awaiting_move'}
              className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 px-3.5 py-2 text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              <span>💡</span>
              <span>{t('quiz.player.hint_btn')}</span>
            </button>

            <button
              type="button"
              onClick={onRevealAnswer}
              disabled={status === 'judging' || status === 'ai_replying'}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3.5 py-2 text-xs font-semibold transition active:scale-95"
            >
              <span>👁️</span>
              <span>{t('quiz.player.reveal_btn')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Finished Summary Panel */}
      {isFinished && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs font-semibold text-slate-200">
              {result?.explanationKey ? (
                t(result.explanationKey, { move: formatChoiceText(currentStepBestUsi, card.sideToMove) })
              ) : (
                t(`quiz.explain.${card.type}`, { move: formatChoiceText(currentStepBestUsi, card.sideToMove) })
              )}
            </div>
            {evalLossCp !== undefined && evalLossCp !== null && (
              <span className="font-mono text-[11px] px-2 py-0.5 rounded border border-slate-700 bg-slate-900 text-amber-300">
                {evalLossCp === 0
                  ? t('quiz.player.eval_no_loss')
                  : t('quiz.player.eval_loss_cp', { loss: evalLossCp })}
              </span>
            )}
          </div>

          {/* Post-answer alternative choices review (Evaluation breakdown for each choice) */}
          {(() => {
            // If replaying a specific PV move (replayIndex >= 0), display that step's choices & alternatives!
            const isReplayingStep = isReplaying && replayIndex >= 0 && pvStepsData[replayIndex];
            const currentStepData = isReplayingStep ? pvStepsData[replayIndex] : null;

            const headerTitle = currentStepData
              ? `第 ${replayIndex + 1} 手目の分岐・候補手評価比較:`
              : '各選択肢の評価値比較:';
            const subTitle = currentStepData
              ? `(${currentStepData.turn === 'b' ? '先手' : '後手'}の手番での候補手シミュレーション)`
              : '(出題局面での分岐シミュレーション)';

            const listToRender = currentStepData
              ? currentStepData.choices
              : choicesToRender.map((c) => ({
                  usi: c.usi,
                  label: formatChoiceText(c.usi, card.sideToMove),
                  isCorrect: c.isCorrect || c.usi === currentStepBestUsi,
                  delta: c.scoreDelta ?? (c.isCorrect || c.usi === currentStepBestUsi ? 0 : -250),
                }));

            if (listToRender.length === 0) return null;

            return (
              <div className="rounded-lg bg-slate-900/90 border border-slate-700/80 p-3 space-y-2">
                <div className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span>📊</span>
                    <span>{headerTitle}</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {subTitle}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {listToRender.map((item) => (
                    <div
                      key={item.usi}
                      className={`flex flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center transition ${
                        item.isCorrect
                          ? 'border-emerald-500/40 bg-emerald-950/30 shadow-sm'
                          : 'border-slate-700 bg-slate-800/50'
                      }`}
                    >
                      <span className="text-xs font-bold font-mono text-slate-200">
                        {item.label}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                          item.isCorrect
                            ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-950/90 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {item.isCorrect ? '最善 0' : (Math.abs(item.delta) >= 20000 ? '詰み・悪手' : `${item.delta} 悪手`)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Step-by-Step Replay Progress & Current Move Information */}
          {isReplaying && (
            <div className="rounded-lg bg-slate-900/90 border border-amber-500/30 p-3 space-y-2">
              <div className="text-[11px] font-bold text-amber-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span>🎬</span>
                  <span>
                    手順再生中: {replayIndex === -1 ? '【出題局面 (開始)】' : `${replayIndex + 1} 手目 / ${card.pv.length} 手`}
                  </span>
                </span>
                <span className="text-[10px] text-slate-400 font-normal font-mono">
                  {replayIndex === -1 ? '相手の手の着手後' : `PV[${replayIndex}]`}
                </span>
              </div>

              {replayIndex === -1 ? (
                <div className="rounded bg-slate-800/60 p-2 text-xs text-slate-300 flex items-center justify-between">
                  <span>
                    {t('studio.position_summary.last_move', '直前の手: {{move}}', {
                      move: effectiveLastMove ? formatShogiMove(effectiveLastMove) : t('common.none', 'なし'),
                    })}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {t('quiz.player.question_origin_hint', 'ここから次の一手が出題されました')}
                  </span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="rounded bg-slate-800/60 p-2 text-xs text-slate-300 flex items-center justify-between">
                    <span>
                      {t('quiz.player.move_label', '指し手:')}{' '}
                      <span className="font-mono text-cyan-300 font-extrabold text-sm ml-1">
                        {replayLastMove ? formatShogiMove(replayLastMove) : (card.pv[replayIndex] ?? '')}
                      </span>
                    </span>
                    <span className="text-[11px] font-mono text-emerald-400 font-semibold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                      {t('quiz.player.pv_badge', 'AI最善手順 (PV)')}
                    </span>
                  </div>

                  {/* Show PV timeline up to current step */}
                  <div className="flex items-center gap-1.5 overflow-x-auto py-1 text-[11px] font-mono text-slate-400">
                    {pvMovesFormatted.map((pItem, pIdx) => (
                      <span
                        key={pIdx}
                        className={`px-2 py-0.5 rounded whitespace-nowrap transition ${
                          pIdx === replayIndex
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shadow-sm'
                            : pIdx < replayIndex
                            ? 'text-slate-400 bg-slate-800/40'
                            : 'text-slate-600'
                        }`}
                      >
                        {pIdx + 1}. {pItem.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Replay Controls & Next Button */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-700/60 flex-wrap">
            {onToggleReplay && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={onToggleReplay}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    isReplaying
                      ? 'border-amber-500/60 bg-amber-500/20 text-amber-300 shadow-md'
                      : 'border-slate-600 bg-slate-700/80 hover:bg-slate-600 text-slate-200'
                  }`}
                >
                  <span>🔁</span>
                  <span>{isReplaying ? 'リプレイ終了' : t('quiz.player.replay')}</span>
                  {replayBoard && (
                    <span className="font-mono text-[10px] text-amber-300">
                      ({Math.max(0, replayIndex + 1)}/{card.pv.length})
                    </span>
                  )}
                </button>

                {isReplaying && (
                  <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-lg p-0.5 text-xs">
                    {/* Step Backward */}
                    <button
                      type="button"
                      onClick={() => onStepReplay?.(-1)}
                      disabled={replayIndex <= -1}
                      className="px-2 py-1 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:hover:bg-transparent"
                      title={t('quiz.player.step_backward_title', '1手戻る')}
                    >
                      ⏮️
                    </button>

                    {/* Pause / Resume */}
                    <button
                      type="button"
                      onClick={onPauseResumeReplay}
                      className="px-2 py-1 rounded hover:bg-slate-800 text-amber-300 font-bold"
                      title={
                        isReplayPaused
                          ? t('quiz.player.resume_title', '再生再開')
                          : t('quiz.player.pause_title', '一時停止')
                      }
                    >
                      {isReplayPaused
                        ? `▶️ ${t('quiz.player.resume_btn', '再開')}`
                        : `⏸️ ${t('quiz.player.pause_btn', '一時停止')}`}
                    </button>

                    {/* Step Forward */}
                    <button
                      type="button"
                      onClick={() => onStepReplay?.(1)}
                      disabled={replayIndex >= card.pv.length - 1}
                      className="px-2 py-1 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-40 disabled:hover:bg-transparent"
                      title={t('quiz.player.step_forward_title', '1手進む')}
                    >
                      ⏭️
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={onNext}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 transition shadow-lg shadow-emerald-950/40 ml-auto active:scale-95"
            >
              <span>{t('quiz.player.next_btn')}</span>
              <span>➔</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
