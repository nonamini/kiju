/**
 * Active Recall SRS Drill Engine Hook.
 * Manages memorization training sessions against an opening repertoire tree:
 * user move verification against valid tree variations,
 * automated opponent responses with natural delays,
 * move rejection cues on mistakes, and drill completion stats.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Color, ShogiMove, Square } from '../types/shogi';
import { HintType, SRSReviewCard } from '../types/srs';
import { KifuTreeNode, MergedKifuTree } from '../types/tree';
import { ShogiBoard } from '../utils/shogiBoard';
import { applySm2Review } from '../utils/sm2Scheduler';
import { loadSrsCards, saveSrsCards } from '../utils/srsStorage';
import {
  advanceTreeToStartingPly,
  calculateDrillAccuracy,
  selectOpponentMove,
  validateUserMove,
} from '../utils/srsDrillEngine';
import {
  getAnswerHint,
  getFileHint,
  getPieceHint,
  getRankHint,
  HINT_PENALTY_WEIGHTS,
} from '../utils/srsHintEngine';
import {
  createInteractiveMove,
  getStrictLegalDropsForPiece,
  getStrictLegalMovesForSquare,
} from '../utils/shogiRules';

export type DrillState =
  | 'setup'
  | 'user_turn'
  | 'opponent_thinking'
  | 'completed';

export type DrillMode = 'tree' | 'daily_review';

export interface PendingPromotion {
  from: Square;
  to: Square;
}

export interface DrillFeedback {
  status: 'idle' | 'correct' | 'mistake';
  lastUserMove: ShogiMove | null;
  expectedCandidates: ShogiMove[];
  messageKey: string | null;
}

export interface DrillStats {
  totalQuestions: number;
  correctCount: number;
  mistakeCount: number;
  accuracyPct: number;
  hintsUsedCount: number;
  hintPenaltyScore: number;
}

export interface UseSrsDrillOptions {
  initialTree?: MergedKifuTree | null;
  defaultSide?: Color;
  defaultDrillState?: DrillState;
  defaultStartPly?: number;
  initialPath?: KifuTreeNode[];
}

export interface StartDrillConfig {
  mode?: DrillMode;
  side: Color;
  startPly?: number;
  path?: KifuTreeNode[];
  reviewCards?: SRSReviewCard[];
}

export interface UseSrsDrillReturn {
  drillMode: DrillMode;
  drillState: DrillState;
  userColor: Color;
  board: ShogiBoard;
  currentPly: number;
  startPly: number;
  moveHistory: ShogiMove[];
  currentMove?: ShogiMove;
  currentNode: KifuTreeNode | null;
  expectedCandidates: KifuTreeNode[];
  primaryExpectedMove: ShogiMove | null;
  activeCard: SRSReviewCard | null;
  dailyReviewCards: SRSReviewCard[];
  dailyCardIndex: number;
  reviewedCardsResult: SRSReviewCard[];
  feedback: DrillFeedback;
  stats: DrillStats;
  selectedSquare: Square | null;
  selectedHandPiece: string | null;
  validTargetSquares: Square[];
  pendingPromotion: PendingPromotion | null;
  revealedHints: Record<HintType, boolean>;
  hintSquares: Square[];
  hintRankSquares: Square[];
  hintFileSquares: Square[];
  hintPieceSquares: Square[];
  hintHandPiece: string | null;
  isHintKomadai: boolean;
  hintArrow: { from?: Square; to: Square } | null;
  revealHint: (type: HintType) => void;
  startDrill: (config?: StartDrillConfig) => void;
  startDailyReview: (cards: SRSReviewCard[]) => void;
  resetDrill: () => void;
  handleSquareClick: (square: Square) => void;
  handleHandPieceSelect: (pieceKey: string) => void;
  confirmPromotion: (promote: boolean) => void;
  clearFeedback: () => void;
}

export function useSrsDrill(options: UseSrsDrillOptions = {}): UseSrsDrillReturn {
  const initialStartPly = Math.max(0, options.defaultStartPly ?? 0);
  const [drillState, setDrillState] = useState<DrillState>(
    options.defaultDrillState ?? 'setup'
  );
  const [userColor, setUserColor] = useState<Color>(options.defaultSide ?? 'b');
  const [startPly, setStartPly] = useState<number>(initialStartPly);
  const [currentPly, setCurrentPly] = useState<number>(initialStartPly);

  // Initialize board & history to initial starting position so user sees the board right away
  const [board, setBoard] = useState<ShogiBoard>(() => {
    const { startBoard } = advanceTreeToStartingPly(
      initialStartPly,
      options.initialTree ?? null,
      options.initialPath
    );
    return startBoard;
  });
  const [moveHistory, setMoveHistory] = useState<ShogiMove[]>(() => {
    const { startMoves } = advanceTreeToStartingPly(
      initialStartPly,
      options.initialTree ?? null,
      options.initialPath
    );
    return startMoves;
  });
  const [currentNode, setCurrentNode] = useState<KifuTreeNode | null>(() => {
    const { startNode } = advanceTreeToStartingPly(
      initialStartPly,
      options.initialTree ?? null,
      options.initialPath
    );
    return startNode;
  });

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [selectedHandPiece, setSelectedHandPiece] = useState<string | null>(null);
  const [validTargetSquares, setValidTargetSquares] = useState<Square[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  // Daily Review & SM-2 states
  const [drillMode, setDrillMode] = useState<DrillMode>('tree');
  const [dailyReviewCards, setDailyReviewCards] = useState<SRSReviewCard[]>([]);
  const [dailyCardIndex, setDailyCardIndex] = useState<number>(0);
  const [currentCardMistakes, setCurrentCardMistakes] = useState<number>(0);
  const [currentCardHintPenalty, setCurrentCardHintPenalty] = useState<number>(0);
  const [reviewedCardsResult, setReviewedCardsResult] = useState<SRSReviewCard[]>([]);

  const [feedback, setFeedback] = useState<DrillFeedback>({
    status: 'idle',
    lastUserMove: null,
    expectedCandidates: [],
    messageKey: null,
  });

  const [correctCount, setCorrectCount] = useState<number>(0);
  const [mistakeCount, setMistakeCount] = useState<number>(0);

  // 5-Type Selective Hints State
  const [revealedHints, setRevealedHints] = useState<Record<HintType, boolean>>({
    rank: false,
    file: false,
    piece: false,
    boardOrHand: false,
    answer: false,
  });
  const [hintsUsedCount, setHintsUsedCount] = useState<number>(0);
  const [hintPenaltyScore, setHintPenaltyScore] = useState<number>(0);

  const boardRef = useRef<ShogiBoard>(board);
  boardRef.current = board;

  const moveHistoryRef = useRef<ShogiMove[]>(moveHistory);
  moveHistoryRef.current = moveHistory;

  const activeTree = options.initialTree ?? null;

  // Clear selections on board
  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setValidTargetSquares([]);
    setPendingPromotion(null);
  }, []);

  const clearFeedback = useCallback(() => {
    setFeedback({
      status: 'idle',
      lastUserMove: null,
      expectedCandidates: [],
      messageKey: null,
    });
  }, []);

  const resetRevealedHints = useCallback(() => {
    setRevealedHints({
      rank: false,
      file: false,
      piece: false,
      boardOrHand: false,
      answer: false,
    });
  }, []);

  /**
   * Resets drill back to setup screen.
   */
  const resetDrill = useCallback(() => {
    const { startBoard, startMoves, startNode } = advanceTreeToStartingPly(
      startPly,
      activeTree,
      options.initialPath
    );
    setDrillMode('tree');
    setBoard(startBoard);
    setCurrentPly(startMoves.length);
    setMoveHistory(startMoves);
    setCurrentNode(startNode);
    setCorrectCount(0);
    setMistakeCount(0);
    setHintsUsedCount(0);
    setHintPenaltyScore(0);
    setCurrentCardMistakes(0);
    setCurrentCardHintPenalty(0);
    setReviewedCardsResult([]);
    resetRevealedHints();
    clearSelection();
    clearFeedback();
    setDrillState('setup');
  }, [activeTree, clearFeedback, clearSelection, options.initialPath, resetRevealedHints, startPly]);

  /**
   * Starts a new drill session with specified side and starting ply.
   */
  const startDrill = useCallback(
    (config?: StartDrillConfig) => {
      const chosenSide = config?.side ?? userColor;
      const chosenStartPly = Math.max(0, config?.startPly ?? startPly);
      const chosenPath = config?.path ?? options.initialPath;

      setDrillMode('tree');
      setUserColor(chosenSide);
      setStartPly(chosenStartPly);
      setCorrectCount(0);
      setMistakeCount(0);
      setHintsUsedCount(0);
      setHintPenaltyScore(0);
      setCurrentCardMistakes(0);
      setCurrentCardHintPenalty(0);
      setReviewedCardsResult([]);
      resetRevealedHints();
      clearSelection();
      clearFeedback();

      const { startBoard, startMoves, startNode } = advanceTreeToStartingPly(
        chosenStartPly,
        activeTree,
        chosenPath
      );

      setBoard(startBoard);
      setMoveHistory(startMoves);
      setCurrentPly(startMoves.length);
      setCurrentNode(startNode);

      const initialExpected = !startNode ? activeTree?.rootNodes ?? [] : startNode.children;
      if (initialExpected.length === 0) {
        setDrillState('completed');
        return;
      }

      const turn = startBoard.getTurn();
      if (turn === chosenSide) {
        setDrillState('user_turn');
      } else {
        // Opponent plays first
        setDrillState('opponent_thinking');
      }
    },
    [activeTree, clearFeedback, clearSelection, options.initialPath, startPly, userColor]
  );

  /**
   * Starts a targeted daily review session using due SM-2 cards.
   */
  const startDailyReview = useCallback(
    (cards: SRSReviewCard[]) => {
      if (cards.length === 0) return;

      clearFeedback();
      clearSelection();
      resetRevealedHints();

      setDrillMode('daily_review');
      setDailyReviewCards(cards);
      setDailyCardIndex(0);
      setReviewedCardsResult([]);
      setCurrentCardMistakes(0);
      setCurrentCardHintPenalty(0);
      setCorrectCount(0);
      setMistakeCount(0);
      setHintsUsedCount(0);
      setHintPenaltyScore(0);

      const firstCard = cards[0];
      if (!firstCard) {
        setDrillState('setup');
        return;
      }
      const startBoard = ShogiBoard.fromSfen(firstCard.sfen);
      const turn = startBoard.getTurn();

      setBoard(startBoard);
      setUserColor(turn);
      setCurrentPly(startBoard.getPly());
      setMoveHistory([]);
      setCurrentNode(null);
      setDrillState('user_turn');
    },
    [clearFeedback, clearSelection, resetRevealedHints]
  );

  /**
   * Expected candidate moves at the current node in the opening tree.
   */
  const currentExpectedCandidates = useCallback((): KifuTreeNode[] => {
    if (!activeTree) return [];
    if (!currentNode) {
      return activeTree.rootNodes;
    }
    return currentNode.children;
  }, [activeTree, currentNode]);

  /**
   * Opponent thinking loop: triggers when drillState === 'opponent_thinking' in tree mode.
   */
  useEffect(() => {
    if (drillState !== 'opponent_thinking' || drillMode !== 'tree') return;

    let isCancelled = false;
    const timer = setTimeout(() => {
      if (isCancelled) return;

      const candidates = currentExpectedCandidates();
      if (candidates.length === 0) {
        // Reached end of repertoire tree
        setDrillState('completed');
        return;
      }

      // Choose opponent move (weighted by gameCount or mainline preference)
      const chosen = selectOpponentMove(candidates);
      if (!chosen) {
        setDrillState('completed');
        return;
      }

      const nextBoard = boardRef.current.clone();
      nextBoard.applyMove(chosen.move);

      const nextMoves = [...moveHistoryRef.current, chosen.move];
      setBoard(nextBoard);
      setMoveHistory(nextMoves);
      setCurrentPly(nextMoves.length);
      setCurrentNode(chosen);

      if (chosen.children.length === 0) {
        setDrillState('completed');
      } else {
        resetRevealedHints();
        setDrillState('user_turn');
      }
    }, 380);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [currentExpectedCandidates, drillState, resetRevealedHints]);

  /**
   * Verifies the user's attempted move against valid tree variations.
   */
  const executeUserMove = useCallback(
    (move: ShogiMove) => {
      // === DAILY TARGETED REVIEW MODE ===
      if (drillMode === 'daily_review') {
        const activeCard = dailyReviewCards[dailyCardIndex];
        if (!activeCard) return;

        const isMatch =
          move.sfenMove === activeCard.correctMove.sfenMove ||
          (activeCard.alternativeMoves &&
            activeCard.alternativeMoves.some((m) => m.sfenMove === move.sfenMove));

        if (isMatch) {
          // Calculate SM-2 update and persist
          const updatedCard = applySm2Review(
            activeCard,
            {
              isCorrect: true,
              mistakeCount: currentCardMistakes,
              hintPenaltyScore: currentCardHintPenalty,
            },
            new Date()
          );

          // Update storage immutably
          const allSaved = loadSrsCards();
          const existingIdx = allSaved.findIndex((c) => c.id === updatedCard.id);
          if (existingIdx >= 0) {
            allSaved[existingIdx] = updatedCard;
          } else {
            allSaved.push(updatedCard);
          }
          saveSrsCards(allSaved);

          setReviewedCardsResult((prev) => [...prev, updatedCard]);
          setCorrectCount((prev) => prev + 1);

          setFeedback({
            status: 'correct',
            lastUserMove: move,
            expectedCandidates: [activeCard.correctMove, ...(activeCard.alternativeMoves || [])],
            messageKey: 'srs.feedback_correct',
          });

          clearSelection();
          resetRevealedHints();
          setCurrentCardMistakes(0);
          setCurrentCardHintPenalty(0);

          const nextIndex = dailyCardIndex + 1;
          if (nextIndex >= dailyReviewCards.length) {
            setDrillState('completed');
          } else {
            setDailyCardIndex(nextIndex);
            const nextCard = dailyReviewCards[nextIndex];
            if (!nextCard) {
              setDrillState('completed');
              return;
            }
            const nextBoard = ShogiBoard.fromSfen(nextCard.sfen);
            setBoard(nextBoard);
            setUserColor(nextBoard.getTurn());
            setCurrentPly(nextBoard.getPly());
            setMoveHistory([]);
            setDrillState('user_turn');
          }
        } else {
          // Mistake in daily review
          setCurrentCardMistakes((prev) => prev + 1);
          setMistakeCount((prev) => prev + 1);

          setFeedback({
            status: 'mistake',
            lastUserMove: move,
            expectedCandidates: [activeCard.correctMove, ...(activeCard.alternativeMoves || [])],
            messageKey: 'srs.feedback_incorrect',
          });

          clearSelection();
        }
        return;
      }

      // === TREE TRAVERSAL MODE ===
      const candidates = currentExpectedCandidates();

      // Check if user's move matches any valid tree branch
      const validation = validateUserMove(move, candidates);

      if (validation.isValid && validation.matchedNode) {
        const matchedNode = validation.matchedNode;
        // === CORRECT MOVE ===
        const nextBoard = board.clone();
        nextBoard.applyMove(move);

        const nextMoves = [...moveHistory, move];
        setBoard(nextBoard);
        setMoveHistory(nextMoves);
        setCurrentPly(nextMoves.length);
        setCurrentNode(matchedNode);
        setCorrectCount((prev) => prev + 1);

        setFeedback({
          status: 'correct',
          lastUserMove: move,
          expectedCandidates: candidates.map((c) => c.move),
          messageKey: 'srs.feedback_correct',
        });

        clearSelection();
        resetRevealedHints();

        // Check if leaf node reached
        if (matchedNode.children.length === 0) {
          setDrillState('completed');
        } else {
          setDrillState('opponent_thinking');
        }
      } else {
        // === INCORRECT MOVE (Mistake) ===
        setMistakeCount((prev) => prev + 1);

        setFeedback({
          status: 'mistake',
          lastUserMove: move,
          expectedCandidates: candidates.map((c) => c.move),
          messageKey: 'srs.feedback_incorrect',
        });

        // Rejection cue: clear selection so piece returns to source square
        clearSelection();
      }
    },
    [
      board,
      clearSelection,
      currentCardHintPenalty,
      currentCardMistakes,
      currentExpectedCandidates,
      dailyCardIndex,
      dailyReviewCards,
      drillMode,
      moveHistory,
      resetRevealedHints,
    ]
  );

  /**
   * Handles board square clicks for moving pieces.
   */
  const handleSquareClick = useCallback(
    (square: Square) => {
      if (drillState !== 'user_turn') return;
      if (pendingPromotion) return;

      const pieceOnSquare = board.getSquare(square.file, square.rank);
      const isSentePiece = pieceOnSquare ? pieceOnSquare === pieceOnSquare.toUpperCase() : false;
      const pieceColor: Color = isSentePiece ? 'b' : 'w';

      // 1. Piece in hand was selected for drop
      if (selectedHandPiece) {
        const isValidDrop = validTargetSquares.some(
          (s) => s.file === square.file && s.rank === square.rank
        );
        if (isValidDrop) {
          const ply = board.getPly();
          const lastMove = moveHistory[moveHistory.length - 1];
          const dropMove = createInteractiveMove(
            board,
            ply,
            userColor,
            undefined,
            square,
            false,
            selectedHandPiece,
            lastMove?.to
          );
          executeUserMove(dropMove);
        } else {
          clearSelection();
        }
        return;
      }

      // 2. Board square was already selected
      if (selectedSquare) {
        if (selectedSquare.file === square.file && selectedSquare.rank === square.rank) {
          clearSelection();
          return;
        }

        if (pieceOnSquare && pieceColor === userColor) {
          const legalMoves = getStrictLegalMovesForSquare(board, square);
          setSelectedSquare(square);
          setValidTargetSquares(legalMoves.map((m) => m.to));
          return;
        }

        const targetMove = getStrictLegalMovesForSquare(board, selectedSquare).find(
          (m) => m.to.file === square.file && m.to.rank === square.rank
        );

        if (targetMove) {
          if (targetMove.forcePromote) {
            const ply = board.getPly();
            const lastMove = moveHistory[moveHistory.length - 1];
            const move = createInteractiveMove(
              board,
              ply,
              userColor,
              selectedSquare,
              square,
              true,
              undefined,
              lastMove?.to
            );
            executeUserMove(move);
          } else if (targetMove.canPromote) {
            setPendingPromotion({ from: selectedSquare, to: square });
          } else {
            const ply = board.getPly();
            const lastMove = moveHistory[moveHistory.length - 1];
            const move = createInteractiveMove(
              board,
              ply,
              userColor,
              selectedSquare,
              square,
              false,
              undefined,
              lastMove?.to
            );
            executeUserMove(move);
          }
        } else {
          clearSelection();
        }
        return;
      }

      // 3. Nothing selected yet: select piece if owned by user
      if (pieceOnSquare && pieceColor === userColor) {
        const legalMoves = getStrictLegalMovesForSquare(board, square);
        setSelectedSquare(square);
        setSelectedHandPiece(null);
        setValidTargetSquares(legalMoves.map((m) => m.to));
      }
    },
    [
      board,
      clearSelection,
      drillState,
      executeUserMove,
      moveHistory,
      pendingPromotion,
      selectedHandPiece,
      selectedSquare,
      userColor,
      validTargetSquares,
    ]
  );

  /**
   * Handles clicking a piece in the player's Komadai (piece stand).
   */
  const handleHandPieceSelect = useCallback(
    (pieceKey: string) => {
      if (drillState !== 'user_turn') return;
      if (pendingPromotion) return;

      if (selectedHandPiece === pieceKey) {
        clearSelection();
        return;
      }

      const validDrops = getStrictLegalDropsForPiece(board, pieceKey, userColor);
      setSelectedSquare(null);
      setSelectedHandPiece(pieceKey);
      setValidTargetSquares(validDrops);
    },
    [board, clearSelection, drillState, pendingPromotion, selectedHandPiece, userColor]
  );

  /**
   * Confirms or declines optional promotion.
   */
  const confirmPromotion = useCallback(
    (promote: boolean) => {
      if (!pendingPromotion) return;
      const { from, to } = pendingPromotion;
      const ply = board.getPly();
      const lastMove = moveHistory[moveHistory.length - 1];
      const move = createInteractiveMove(
        board,
        ply,
        userColor,
        from,
        to,
        promote,
        undefined,
        lastMove?.to
      );
      executeUserMove(move);
    },
    [board, executeUserMove, moveHistory, pendingPromotion, userColor]
  );

  const accuracyPct = calculateDrillAccuracy(correctCount, mistakeCount);

  const activeCard: SRSReviewCard | null =
    drillMode === 'daily_review' ? dailyReviewCards[dailyCardIndex] ?? null : null;

  const expectedCandidatesList = currentExpectedCandidates();
  const primaryCandidate =
    expectedCandidatesList.find((c) => c.isMainline) ?? expectedCandidatesList[0] ?? null;

  const primaryExpectedMove =
    drillMode === 'daily_review'
      ? activeCard?.correctMove ?? null
      : primaryCandidate?.move ?? null;

  const rankHint = primaryExpectedMove ? getRankHint(primaryExpectedMove, userColor) : null;
  const fileHint = primaryExpectedMove ? getFileHint(primaryExpectedMove, userColor) : null;
  const pieceHint = primaryExpectedMove ? getPieceHint(primaryExpectedMove, board) : null;
  const answerHint = primaryExpectedMove ? getAnswerHint(primaryExpectedMove) : null;

  const hintRankSquares: Square[] =
    revealedHints?.rank && rankHint ? rankHint.highlightSquares : [];
  const hintFileSquares: Square[] =
    revealedHints?.file && fileHint ? fileHint.highlightSquares : [];
  const hintPieceSquares: Square[] =
    revealedHints?.piece && pieceHint ? pieceHint.candidateSquares : [];
  const hintHandPiece: string | null =
    (revealedHints?.piece && pieceHint?.inHand) || (revealedHints?.boardOrHand && primaryExpectedMove?.isDrop)
      ? primaryExpectedMove?.piece ?? null
      : null;
  const isHintKomadai: boolean =
    Boolean(primaryExpectedMove?.isDrop) &&
    (Boolean(revealedHints?.rank) ||
      Boolean(revealedHints?.file) ||
      Boolean(revealedHints?.boardOrHand));
  const hintSquares: Square[] =
    revealedHints?.answer && answerHint ? answerHint.highlightSquares : [];
  const hintArrow =
    revealedHints?.answer && answerHint?.from && answerHint?.to
      ? { from: answerHint.from, to: answerHint.to }
      : null;

  const revealHint = useCallback(
    (type: HintType) => {
      if (drillState !== 'user_turn') return;
      if (revealedHints?.[type]) return;

      const penalty = HINT_PENALTY_WEIGHTS[type] ?? 1;
      setRevealedHints((prev) => ({ ...prev, [type]: true }));
      setHintsUsedCount((prev) => prev + 1);
      setHintPenaltyScore((prev) => prev + penalty);
      setCurrentCardHintPenalty((prev) => prev + penalty);
    },
    [drillState, revealedHints]
  );

  const currentMove = moveHistory[moveHistory.length - 1];

  return {
    drillMode,
    drillState,
    userColor,
    board,
    currentPly,
    startPly,
    moveHistory,
    currentMove,
    currentNode,
    expectedCandidates: expectedCandidatesList,
    primaryExpectedMove,
    activeCard,
    dailyReviewCards,
    dailyCardIndex,
    reviewedCardsResult,
    feedback,
    stats: {
      totalQuestions: correctCount,
      correctCount,
      mistakeCount,
      accuracyPct,
      hintsUsedCount,
      hintPenaltyScore,
    },
    selectedSquare,
    selectedHandPiece,
    validTargetSquares,
    pendingPromotion,
    revealedHints,
    hintSquares,
    hintRankSquares,
    hintFileSquares,
    hintPieceSquares,
    hintHandPiece,
    isHintKomadai,
    hintArrow,
    revealHint,
    startDrill,
    startDailyReview,
    resetDrill,
    handleSquareClick,
    handleHandPieceSelect,
    confirmPromotion,
    clearFeedback,
  };
}
