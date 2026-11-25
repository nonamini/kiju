/**
 * React Hook for Tactical Quiz Player Session.
 * Manages 3-5 ply quiz progression, strict PV vs engine-tolerant evaluation,
 * interactive board clicking, promotion prompts, 3-choice hints, and SM-2 persistence.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Color, ShogiMove, Square } from '../types/shogi';
import { TacticalQuizCard } from '../types/quiz';
import { ShogiBoard } from '../utils/shogiBoard';
import {
  createInteractiveMove,
  getAllStrictLegalMoves,
  getStrictLegalDropsForPiece,
  getStrictLegalMovesForSquare,
  parseUsiMove,
} from '../utils/shogiRules';
import { UseShogiEngineReturn } from './useShogiEngine';
import {
  hintPenaltyFor,
  judgeByPv,
  pickHintChoices,
  QuizVerdict,
} from '../utils/quizJudge';
import { calculateReviewQuality } from '../utils/sm2Scheduler';
import {
  applyQuizResult,
  loadQuizProgress,
  saveQuizProgress,
} from '../utils/quizProgressStorage';

export interface PunishInfo {
  punishMoveUsi: string;
  punishMove?: ShogiMove;
  scoreBefore: number;
  scoreAfterUser: number;
  lossCp: number;
}

export interface UseQuizSessionReturn {
  initialBoard: ShogiBoard;
  board: ShogiBoard;
  isFlipped: boolean;
  step: number;
  totalSteps: number;
  lastMove?: ShogiMove;
  status:
    | 'awaiting_move'
    | 'ai_replying'
    | 'judging'
    | 'wrong_retry'
    | 'finished';
  verdict: QuizVerdict | null;
  evalLossCp?: number | null;
  punishInfo: PunishInfo | null;
  hintLevel: 0 | 1;
  hintChoices: string[];
  selectedSquare: Square | null;
  targetSquares: Square[];
  selectedHandPiece: string | null;
  pendingPromotion: { from: Square; to: Square } | null;
  onSquareClick: (s: Square) => void;
  onSelectHandPiece: (pieceKey: string) => void;
  onConfirmPromotion: (promote: boolean) => void;
  onRequestHint: () => void;
  onPickChoice: (usi: string) => void;
  onRevealAnswer: () => void;
  onResetCurrentStep: () => void;
  result: { quality: number; explanationKey: string; evalLossCp?: number | null } | null;
  replayBoard: ShogiBoard | null;
  replayLastMove?: ShogiMove;
  replayIndex: number;
  isReplaying: boolean;
  isReplayPaused: boolean;
  onToggleReplay: () => void;
  onPauseResumeReplay: () => void;
  onStepReplay: (delta: number) => void;
  onFlipToggle: () => void;
}

export function useQuizSession(
  card: TacticalQuizCard | null,
  engine: UseShogiEngineReturn
): UseQuizSessionReturn {
  const [board, setBoard] = useState<ShogiBoard>(() => new ShogiBoard());
  const [isFlipped, setIsFlipped] = useState(false);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<
    'awaiting_move' | 'ai_replying' | 'judging' | 'wrong_retry' | 'finished'
  >('awaiting_move');
  const [verdict, setVerdict] = useState<QuizVerdict | null>(null);
  const [evalLossCp, setEvalLossCp] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<ShogiMove | undefined>(card?.opponentLastMove);
  const [hintLevel, setHintLevel] = useState<0 | 1>(0);
  const [hintChoices, setHintChoices] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [hintUsed, setHintUsed] = useState(false);
  const [answerRevealed, setAnswerRevealed] = useState(false);

  // Selection states
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [selectedHandPiece, setSelectedHandPiece] = useState<string | null>(null);
  const [validTargetSquares, setValidTargetSquares] = useState<Square[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);

  const [punishInfo, setPunishInfo] = useState<PunishInfo | null>(null);
  const quizStartBoardRef = useRef<ShogiBoard | null>(null);
  const quizStartLastMoveRef = useRef<ShogiMove | undefined>(undefined);
  const stepStartBoardRef = useRef<ShogiBoard | null>(null);
  const stepStartLastMoveRef = useRef<ShogiMove | undefined>(undefined);

  // Result & replay
  const [result, setResult] = useState<{ quality: number; explanationKey: string; evalLossCp?: number | null } | null>(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [isReplayPaused, setIsReplayPaused] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayBoard, setReplayBoard] = useState<ShogiBoard | null>(null);
  const [replayLastMove, setReplayLastMove] = useState<ShogiMove | undefined>(undefined);

  // Track active unmounted/switched state
  const isActiveRef = useRef(true);
  useEffect(() => {
    isActiveRef.current = true;
    return () => {
      isActiveRef.current = false;
    };
  }, []);

  const totalSteps = useMemo(() => {
    if (!card) return 1;
    return Math.ceil(card.pv.length / 2);
  }, [card]);

  // Construct initial board when card changes
  useEffect(() => {
    if (!card) return;
    try {
      const b = ShogiBoard.fromSfen(card.startSfen);
      let prevTo: Square | undefined = undefined;
      let ply = 1;
      let lastParsedMove: ShogiMove | undefined = undefined;
      for (const usi of card.usiMovesToPosition) {
        const turn = b.getTurn();
        const move = parseUsiMove(usi, b, ply, turn, prevTo);
        if (move) {
          b.applyMove(move);
          prevTo = move.to;
          ply++;
          lastParsedMove = move;
        }
      }
      const initialLastMove = card.opponentLastMove ?? lastParsedMove;
      setBoard(b.clone());
      quizStartBoardRef.current = b.clone();
      quizStartLastMoveRef.current = initialLastMove;
      stepStartBoardRef.current = b.clone();
      setLastMove(initialLastMove);
      stepStartLastMoveRef.current = initialLastMove;
      setIsFlipped(card.sideToMove === 'w');
      setStep(0);
      setStatus('awaiting_move');
      setVerdict(null);
      setEvalLossCp(null);
      setPunishInfo(null);
      setHintLevel(0);
      setHintChoices([]);
      setMistakes(0);
      setHintUsed(false);
      setAnswerRevealed(false);
      setSelectedSquare(null);
      setSelectedHandPiece(null);
      setValidTargetSquares([]);
      setPendingPromotion(null);
      setResult(null);
      setIsReplaying(false);
      setReplayIndex(0);
      setReplayBoard(null);
      setReplayLastMove(undefined);
    } catch (err) {
      console.error('Failed to initialize quiz position:', err);
    }
  }, [card]);

  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setValidTargetSquares([]);
    setPendingPromotion(null);
  }, []);

  const finishSession = useCallback(
    (
      finalVerdict: QuizVerdict,
      revealed: boolean,
      usedHint: boolean,
      mistakeCount: number,
      lossCp?: number | null
    ) => {
      if (!card || !isActiveRef.current) return;
      const penalty = hintPenaltyFor(usedHint, revealed);
      const isCorrect = finalVerdict === 'best' || finalVerdict === 'acceptable';
      let quality = calculateReviewQuality({
        isCorrect,
        mistakeCount,
        hintPenaltyScore: penalty,
      });

      if (revealed) {
        quality = Math.min(quality, 2);
      }

      setResult({
        quality,
        explanationKey: `quiz.explain.${card.type}`,
        evalLossCp: lossCp !== undefined ? lossCp : evalLossCp,
      });
      setStatus('finished');

      // Persist to localStorage
      try {
        const currentProgress = loadQuizProgress();
        const updated = applyQuizResult(currentProgress[card.id], card.id, quality, new Date());
        saveQuizProgress({ ...currentProgress, [card.id]: updated });
      } catch (err) {
        console.error('Failed to persist quiz progress:', err);
      }
    },
    [card, evalLossCp]
  );

  const handleUserMove = useCallback(
    async (userUsi: string) => {
      if (!card || status !== 'awaiting_move' && status !== 'wrong_retry') return;
      clearSelection();
      setStatus('judging');

      const expectedUsi = card.pv[step * 2] ?? card.bestMove;
      const isExactBest = judgeByPv(userUsi, expectedUsi) === 'best';

      if (isExactBest) {
        setVerdict('best');
        setEvalLossCp(0);
        const turn = board.getTurn();
        const cardMovePly = card.ply + step * 2;
        const parsedMove = parseUsiMove(userUsi, board, cardMovePly, turn);
        const nextBoard = board.clone();
        if (parsedMove) {
          nextBoard.applyMove(parsedMove);
          setBoard(nextBoard.clone());
          setLastMove(parsedMove);
        }

        const replyUsi = card.pv[step * 2 + 1];
        if (replyUsi) {
          setStatus('ai_replying');
          setTimeout(() => {
            if (!isActiveRef.current) return;
            const replyTurn = nextBoard.getTurn();
            const replyMove = parseUsiMove(replyUsi, nextBoard, cardMovePly + 1, replyTurn);
            if (replyMove) {
              nextBoard.applyMove(replyMove);
              setBoard(nextBoard.clone());
              setLastMove(replyMove);
            }
            const nextStep = step + 1;
            setStep(nextStep);
            stepStartBoardRef.current = nextBoard.clone();
            stepStartLastMoveRef.current = replyMove ?? undefined;
            setHintLevel(0);
            setHintChoices([]);
            setVerdict(null);
            setEvalLossCp(null);
            setPunishInfo(null);
            clearSelection();
            if (card.pv[nextStep * 2]) {
              setStatus('awaiting_move');
            } else {
              finishSession('best', answerRevealed, hintUsed, mistakes, 0);
            }
          }, 600);
        } else {
          finishSession('best', answerRevealed, hintUsed, mistakes, 0);
        }
        return;
      }

      // Check engine evaluation for alternative tolerant move or punishment calculation
      let isAlternativeAcceptable = false;
      let calculatedLossCp = 350;
      let solverScoreAfter = card.scoreCpBefore - 350;
      let punishMoveUsi: string | undefined = undefined;

      // 1. First priority: Check precomputed choices from card (authoritative batch analysis)
      const matchedChoice = card.choices?.find((c) => c.usi === userUsi);
      if (matchedChoice && matchedChoice.scoreDelta !== undefined) {
        calculatedLossCp = Math.abs(matchedChoice.scoreDelta);
        solverScoreAfter = card.scoreCpBefore - calculatedLossCp;
        if (matchedChoice.isCorrect || calculatedLossCp <= 50) {
          isAlternativeAcceptable = true;
        }
      } else if (engine.isReady) {
        // 2. Secondary fallback: Dynamic engine evaluation if not precomputed
        try {
          const playedMovesSoFar = card.pv.slice(0, step * 2);
          const fullMoveSeq = [...card.usiMovesToPosition, ...playedMovesSoFar, userUsi];
          const searchRes = await engine.searchPosition(card.startSfen, fullMoveSeq, {
            movetime: 400,
          });
          const scoreAfter = searchRes.evaluation?.scoreCp ?? -99999;
          const sign = card.sideToMove === 'b' ? 1 : -1;
          solverScoreAfter = sign * scoreAfter;
          calculatedLossCp = Math.max(0, card.scoreCpBefore - solverScoreAfter);
          punishMoveUsi = searchRes.evaluation?.bestMove && searchRes.evaluation.bestMove !== 'none'
            ? searchRes.evaluation.bestMove
            : undefined;

          // Only acceptable if within strict tolerance (50cp) and loss is small
          if (calculatedLossCp <= 50) {
            isAlternativeAcceptable = true;
          }
        } catch {
          // Rule 6: circuit breaker, do not retry on engine exception
          isAlternativeAcceptable = false;
        }
      }

      setEvalLossCp(calculatedLossCp);

      const turn = board.getTurn();
      const cardMovePly = card.ply + step * 2;
      const parsedUserMove = parseUsiMove(userUsi, board, cardMovePly, turn);

      if (isAlternativeAcceptable) {
        setVerdict('acceptable');
        if (parsedUserMove) {
          const nextBoard = board.clone();
          nextBoard.applyMove(parsedUserMove);
          setBoard(nextBoard);
          setLastMove(parsedUserMove);
        }
        finishSession('acceptable', answerRevealed, hintUsed, mistakes, calculatedLossCp);
        return;
      }

      // Wrong / Suboptimal move: Apply user's move, then play engine's punish reply
      const nextMistakes = mistakes + 1;
      setMistakes(nextMistakes);
      setVerdict('wrong');

      if (parsedUserMove) {
        const boardWithUserMove = board.clone();
        boardWithUserMove.applyMove(parsedUserMove);
        setBoard(boardWithUserMove.clone());
        setLastMove(parsedUserMove);

        // Find punish reply move
        const replyTurn = boardWithUserMove.getTurn();
        const candidatePunishUsi = punishMoveUsi ?? card.pv[step * 2 + 1];
        let parsedPunishMove: ShogiMove | undefined = undefined;
        if (candidatePunishUsi && candidatePunishUsi !== 'none' && candidatePunishUsi !== 'resign') {
          parsedPunishMove =
            parseUsiMove(
              candidatePunishUsi,
              boardWithUserMove,
              cardMovePly + 1,
              replyTurn
            ) ?? undefined;
        }

        if (parsedPunishMove) {
          const boardAfterPunish = boardWithUserMove.clone();
          boardAfterPunish.applyMove(parsedPunishMove);

          // Animate punish reply with brief delay
          setTimeout(() => {
            if (!isActiveRef.current) return;
            setBoard(boardAfterPunish);
            setLastMove(parsedPunishMove);
          }, 450);

          setPunishInfo({
            punishMoveUsi: candidatePunishUsi!,
            punishMove: parsedPunishMove,
            scoreBefore: card.scoreCpBefore,
            scoreAfterUser: solverScoreAfter,
            lossCp: calculatedLossCp,
          });
        } else {
          setPunishInfo({
            punishMoveUsi: '',
            scoreBefore: card.scoreCpBefore,
            scoreAfterUser: solverScoreAfter,
            lossCp: calculatedLossCp,
          });
        }
      }

      if (nextMistakes >= 2) {
        setAnswerRevealed(true);
      }
      setStatus('wrong_retry');
    },
    [
      answerRevealed,
      board,
      card,
      clearSelection,
      engine,
      finishSession,
      hintUsed,
      mistakes,
      status,
      step,
    ]
  );

  const handleResetCurrentStep = useCallback(() => {
    if (!stepStartBoardRef.current) return;
    setBoard(stepStartBoardRef.current.clone());
    setLastMove(stepStartLastMoveRef.current);
    setStatus('awaiting_move');
    setVerdict(null);
    setPunishInfo(null);
    setEvalLossCp(null);
    clearSelection();
  }, [clearSelection]);

  const handleSquareClick = useCallback(
    (square: Square) => {
      if (!card || (status !== 'awaiting_move' && status !== 'wrong_retry')) return;
      if (pendingPromotion) return;

      const pieceOnSquare = board.getSquare(square.file, square.rank);
      const isSentePiece = pieceOnSquare ? pieceOnSquare === pieceOnSquare.toUpperCase() : false;
      const pieceColor: Color = isSentePiece ? 'b' : 'w';
      const solverColor = card.sideToMove;

      // 1. Drop from hand
      if (selectedHandPiece) {
        const isValidDrop = validTargetSquares.some(
          (s) => s.file === square.file && s.rank === square.rank
        );
        if (isValidDrop) {
          const cardMovePly = card.ply + step * 2;
          const dropMove = createInteractiveMove(
            board,
            cardMovePly,
            solverColor,
            undefined,
            square,
            false,
            selectedHandPiece
          );
          handleUserMove(dropMove.sfenMove);
        } else {
          clearSelection();
        }
        return;
      }

      // 2. Square already selected
      if (selectedSquare) {
        if (selectedSquare.file === square.file && selectedSquare.rank === square.rank) {
          clearSelection();
          return;
        }

        if (pieceOnSquare && pieceColor === solverColor) {
          const legalMoves = getStrictLegalMovesForSquare(board, square);
          setSelectedSquare(square);
          setSelectedHandPiece(null);
          setValidTargetSquares(legalMoves.map((m) => m.to));
          return;
        }

        const targetMove = getStrictLegalMovesForSquare(board, selectedSquare).find(
          (m) => m.to.file === square.file && m.to.rank === square.rank
        );

        if (targetMove) {
          if (targetMove.forcePromote) {
            const cardMovePly = card.ply + step * 2;
            const move = createInteractiveMove(
              board,
              cardMovePly,
              solverColor,
              selectedSquare,
              square,
              true
            );
            handleUserMove(move.sfenMove);
          } else if (targetMove.canPromote) {
            setPendingPromotion({ from: selectedSquare, to: square });
          } else {
            const cardMovePly = card.ply + step * 2;
            const move = createInteractiveMove(
              board,
              cardMovePly,
              solverColor,
              selectedSquare,
              square,
              false
            );
            handleUserMove(move.sfenMove);
          }
        } else {
          clearSelection();
        }
        return;
      }

      // 3. Initial piece selection
      if (pieceOnSquare && pieceColor === solverColor) {
        const legalMoves = getStrictLegalMovesForSquare(board, square);
        setSelectedSquare(square);
        setSelectedHandPiece(null);
        setValidTargetSquares(legalMoves.map((m) => m.to));
      }
    },
    [
      board,
      card,
      clearSelection,
      handleUserMove,
      pendingPromotion,
      selectedHandPiece,
      selectedSquare,
      status,
      step,
      validTargetSquares,
    ]
  );

  const handleSelectHandPiece = useCallback(
    (pieceKey: string) => {
      if (!card || (status !== 'awaiting_move' && status !== 'wrong_retry')) return;
      if (selectedHandPiece === pieceKey) {
        clearSelection();
        return;
      }
      const legalDrops = getStrictLegalDropsForPiece(board, pieceKey, card.sideToMove);
      setSelectedHandPiece(pieceKey);
      setSelectedSquare(null);
      setValidTargetSquares(legalDrops);
    },
    [board, card, clearSelection, selectedHandPiece, status]
  );

  const handleConfirmPromotion = useCallback(
    (promote: boolean) => {
      if (!card || !pendingPromotion) return;
      const cardMovePly = card.ply + step * 2;
      const move = createInteractiveMove(
        board,
        cardMovePly,
        card.sideToMove,
        pendingPromotion.from,
        pendingPromotion.to,
        promote
      );
      setPendingPromotion(null);
      handleUserMove(move.sfenMove);
    },
    [board, card, handleUserMove, pendingPromotion, step]
  );

  const handleRequestHint = useCallback(() => {
    if (!card || hintLevel === 1) return;
    const legalUsiMoves = getAllStrictLegalMoves(board, card.sideToMove).map((m) => m.usi);
    const choices = pickHintChoices(card, legalUsiMoves, step);
    setHintChoices(choices);
    setHintLevel(1);
    setHintUsed(true);
  }, [board, card, hintLevel, step]);

  const handlePickChoice = useCallback(
    (usi: string) => {
      handleUserMove(usi);
    },
    [handleUserMove]
  );

  const handleRevealAnswer = useCallback(() => {
    if (!card) return;
    setAnswerRevealed(true);
    setVerdict('best');
    const bestUsi = card.pv[step * 2] ?? card.bestMove;
    const cardMovePly = card.ply + step * 2;
    const turn = board.getTurn();
    const move = parseUsiMove(bestUsi, board, cardMovePly, turn);
    if (move) {
      const nextBoard = board.clone();
      nextBoard.applyMove(move);
      setBoard(nextBoard);
      setLastMove(move);
    }
    finishSession('best', true, hintUsed, mistakes, 0);
  }, [board, card, finishSession, hintUsed, mistakes, step]);

  // Step-by-step PV animation effect (starts at -1 for initial position, then advances 0..pv.length - 1)
  useEffect(() => {
    if (!isReplaying || isReplayPaused || !card || card.pv.length === 0) {
      return;
    }

    const timer = setInterval(() => {
      setReplayIndex((prevIndex) => {
        const nextIndex = prevIndex + 1;
        if (nextIndex >= card.pv.length) {
          setIsReplaying(false);
          setIsReplayPaused(false);
          return prevIndex;
        }
        return nextIndex;
      });
    }, 1500);

    return () => clearInterval(timer);
  }, [isReplaying, isReplayPaused, card]);

  // Update replayBoard and replayLastMove whenever replayIndex or isReplaying changes
  useEffect(() => {
    if (!isReplaying || !card || !quizStartBoardRef.current) {
      setReplayBoard(null);
      setReplayLastMove(undefined);
      return;
    }

    try {
      const b = quizStartBoardRef.current.clone();
      let lastM: ShogiMove | undefined = quizStartLastMoveRef.current;
      let prevTo: Square | undefined = lastM?.to;
      const startPly = card.ply;

      // When replayIndex is -1, show initial position without applying any PV moves
      if (replayIndex >= 0) {
        for (let i = 0; i <= replayIndex && i < card.pv.length; i++) {
          const usi = card.pv[i];
          if (!usi) continue;
          const turn = b.getTurn();
          const movePly = startPly + i;
          const move = parseUsiMove(usi, b, movePly, turn, prevTo);
          if (move) {
            b.applyMove(move);
            prevTo = move.to;
            lastM = move;
          }
        }
      }

      setReplayBoard(b);
      setReplayLastMove(lastM);
    } catch (err) {
      console.error('Failed to replay PV moves:', err);
    }
  }, [isReplaying, replayIndex, card]);

  const handleToggleReplay = useCallback(() => {
    if (!card || card.pv.length === 0) return;
    setIsReplaying((prev) => {
      if (!prev) {
        // Start replay from initial position (-1) so user sees the initial problem position first
        setReplayIndex(-1);
        setIsReplayPaused(false);
        return true;
      }
      setIsReplayPaused(false);
      return false;
    });
  }, [card]);

  const handlePauseResumeReplay = useCallback(() => {
    setIsReplayPaused((prev) => !prev);
  }, []);

  const handleStepReplay = useCallback(
    (delta: number) => {
      if (!card || card.pv.length === 0) return;
      setIsReplayPaused(true); // pause automatic advancing when manually stepping
      setReplayIndex((prev) => {
        const next = prev + delta;
        return Math.max(-1, Math.min(next, card.pv.length - 1));
      });
    },
    [card]
  );

  return {
    initialBoard: quizStartBoardRef.current ?? board,
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
    targetSquares: validTargetSquares,
    selectedHandPiece,
    pendingPromotion,
    onSquareClick: handleSquareClick,
    onSelectHandPiece: handleSelectHandPiece,
    onConfirmPromotion: handleConfirmPromotion,
    onRequestHint: handleRequestHint,
    onPickChoice: handlePickChoice,
    onRevealAnswer: handleRevealAnswer,
    onResetCurrentStep: handleResetCurrentStep,
    result,
    replayBoard,
    replayLastMove,
    replayIndex,
    isReplaying,
    isReplayPaused,
    onToggleReplay: handleToggleReplay,
    onPauseResumeReplay: handlePauseResumeReplay,
    onStepReplay: handleStepReplay,
    onFlipToggle: () => setIsFlipped((prev) => !prev),
  };
}
