import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mockTree, mockMatchHistory, mockQuizCards, mockWeaknessPositions, mockMasterySummary } from './mockData';
import { KifuTreeNode } from '../types/tree';
import { Color, MoveEvaluation, ShogiMove, Square } from '../types/shogi';
import { TacticalQuizCard } from '../types/quiz';
import { ShogiBoard } from '../utils/shogiBoard';
import {
  createInteractiveMove,
  getAllStrictLegalMoves,
  getStrictLegalDropsForPiece,
  getStrictLegalMovesForSquare,
  parseUsiMove,
} from '../utils/shogiRules';
import { ShogiBoardPanel } from '../components/board/ShogiBoardPanel';
import { EvaluationChart } from '../components/eval/EvaluationChart';
import { BranchSelector } from '../components/tree/BranchSelector';
import { MoveBreadcrumbBar } from '../components/tree/MoveBreadcrumbBar';
import { MultiBranchTreeExplorer } from '../components/tree/MultiBranchTreeExplorer';
import { SparringArenaPanel } from '../components/sparring/SparringArenaPanel';
import { SrsDrillPanel } from '../components/srs/SrsDrillPanel';
import { QuizPoolManager } from '../components/quiz/QuizPoolManager';
import { QuizPlayerPanel } from '../components/quiz/QuizPlayerPanel';
import { PunishInfo } from '../hooks/useQuizSession';
import { WeaknessAnalysisView } from '../components/quiz/WeaknessAnalysisView';
import { OpeningMasteryDashboard } from '../components/dashboard/OpeningMasteryDashboard';
import { weaknessToQuizCard } from '../utils/weaknessToQuiz';
import { pickHintChoices } from '../utils/quizJudge';
import { buildEvalChartPointsFromPath } from '../utils/evalChartHelper';
import {
  deriveBoardHistoryFromPath,
  extractMovesFromPath,
  findPathToNode,
  getCandidateMovesAtPly,
  getDefaultMainlinePath,
  switchBranchAtPly,
} from '../utils/treeNavigation';
import { useShogiEngine } from '../hooks/useShogiEngine';
import { useBatchAnalysis } from '../hooks/useBatchAnalysis';
import { BatchAnalysisModal } from '../components/eval/BatchAnalysisModal';
import { applyEvaluationsToPath, applyEvaluationsToTree } from '../utils/treeAnalysisEngine';
import { useAuth } from '../hooks/useAuth';
import { ProBroadcastLayout } from './ProBroadcastLayout';
import { JosekiTreeVisualizer } from '../components/tree/JosekiTreeVisualizer';
import { loadSavedStudioGames } from '../utils/studioKifuStorage';

export const MockPage: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'study' | 'srs' | 'sparring' | 'auth' | 'broadcast' | 'quiz' | 'quiz_player' | 'weakness' | 'mastery' | 'tree_visualizer'>('tree_visualizer');
  const [quizCards, setQuizCards] = useState<TacticalQuizCard[]>(mockQuizCards);
  const { user, isLoading: isAuthLoading, isConfigured, signInWithGoogle, signOut, continueAsGuest, error: authError } = useAuth();
  const [isFlipped, setIsFlipped] = useState(false);
  const [currentPly, setCurrentPly] = useState(1);

  const engine = useShogiEngine({ autoInit: false });
  const batchAnalysis = useBatchAnalysis({ engine });
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [currentMockTree, setCurrentMockTree] = useState(mockTree);

  const [activePath, setActivePath] = useState<KifuTreeNode[]>(() => getDefaultMainlinePath(currentMockTree));

  const activeMoves = useMemo(() => extractMovesFromPath(activePath), [activePath]);
  const totalPly = activeMoves.length;

  const evalDataPoints = useMemo(() => {
    return buildEvalChartPointsFromPath(activePath);
  }, [activePath]);

  const boardHistory = useMemo(() => deriveBoardHistoryFromPath(activePath), [activePath]);

  const safePly = Math.min(Math.max(0, currentPly), totalPly);
  const currentBoard = boardHistory[safePly] ?? boardHistory[0]!;
  const currentMove = safePly > 0 ? activeMoves[safePly - 1] : undefined;

  const candidateMoves = useMemo(() => {
    return getCandidateMovesAtPly(currentMockTree, activePath, safePly);
  }, [activePath, currentMockTree, safePly]);

  const handleSelectBranch = (targetNode: KifuTreeNode) => {
    setActivePath((prev) => switchBranchAtPly(prev, targetNode, targetNode.move.ply));
    if (targetNode.move.ply > safePly) {
      setCurrentPly(targetNode.move.ply);
    }
  };

  const handleAnalyzeCurrentPosition = async () => {
    if (safePly === 0 || !activePath[safePly - 1]) return;
    const targetNode = activePath[safePly - 1]!;
    const usiMoves = activeMoves.slice(0, safePly).map((m) => m.sfenMove);
    const sideToMove: Color = safePly % 2 === 0 ? 'b' : 'w';

    const evalResult = await batchAnalysis.analyzeSinglePosition(
      currentBoard,
      usiMoves,
      safePly,
      sideToMove,
      { movetimeMs: 500, depth: 14 }
    );

    if (evalResult) {
      const evalMap = new Map<string, MoveEvaluation>([[targetNode.id, evalResult]]);
      setActivePath((prev) => applyEvaluationsToPath(prev, evalMap));
      setCurrentMockTree((prev) => applyEvaluationsToTree(prev, evalMap));
    }
  };

  const handleStartBatchAnalysis = async (options: {
    scope: 'path' | 'tree';
    movetimeMs: number;
    skipAlreadyAnalyzed: boolean;
  }) => {
    if (options.scope === 'tree') {
      const updated = await batchAnalysis.analyzeTree(currentMockTree, options);
      if (updated) {
        setCurrentMockTree(updated);
        setActivePath((prev) => {
          if (prev.length === 0) return getDefaultMainlinePath(updated);
          const lastId = prev[prev.length - 1]?.id ?? '';
          return findPathToNode(updated.rootNodes, lastId) ?? getDefaultMainlinePath(updated);
        });
      }
    } else if (options.scope === 'path') {
      const updatedPath = await batchAnalysis.analyzePath(activePath, options);
      if (updatedPath) {
        setActivePath(updatedPath);
        const evalMap = new Map<string, MoveEvaluation>();
        for (const node of updatedPath) {
          if (node.evaluation) evalMap.set(node.id, node.evaluation);
        }
        setCurrentMockTree((prev) => applyEvaluationsToTree(prev, evalMap));
      }
    }
  };

  const handleToggleQuizCard = (cardId: string, isEnabled: boolean) => {
    setQuizCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, isEnabled } : c))
    );
  };

  const handleBulkToggleQuizCards = (cardIds: string[], isEnabled: boolean) => {
    setQuizCards((prev) =>
      prev.map((c) => (cardIds.includes(c.id) ? { ...c, isEnabled } : c))
    );
  };

  // Issue #32 Mock Quiz Player State with real click-to-move interaction
  const [mockPlayerCardIndex, setMockPlayerCardIndex] = useState(0);
  const [customQuizCard, setCustomQuizCard] = useState<TacticalQuizCard | null>(null);
  const currentQuizCard = customQuizCard ?? (mockQuizCards[mockPlayerCardIndex % mockQuizCards.length] ?? mockQuizCards[0]!);
  const [mockStep, setMockStep] = useState(0);
  const [mockStatus, setMockStatus] = useState<
    'awaiting_move' | 'ai_replying' | 'judging' | 'wrong_retry' | 'finished'
  >('awaiting_move');
  const [mockVerdict, setMockVerdict] = useState<'best' | 'acceptable' | 'wrong' | null>(null);
  const [mockEvalLossCp, setMockEvalLossCp] = useState<number | null>(null);
  const [mockPunishInfo, setMockPunishInfo] = useState<PunishInfo | null>(null);
  const [mockHintLevel, setMockHintLevel] = useState<0 | 1>(0);
  const [mockPlayerFlipped, setMockPlayerFlipped] = useState(false);
  const [mockReplayIndex, setMockReplayIndex] = useState(0);
  const [isReplaying, setIsReplaying] = useState(false);

  // Interaction selection state
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [selectedHandPiece, setSelectedHandPiece] = useState<string | null>(null);
  const [validTargetSquares, setValidTargetSquares] = useState<Square[]>([]);

  // Construct initial board for current quiz card
  const { initialQuizBoard, initialQuizLastMove } = useMemo(() => {
    try {
      const b = ShogiBoard.fromSfen(currentQuizCard.startSfen);
      let prevTo: Square | undefined = undefined;
      let ply = 1;
      let lastMoveObj: ShogiMove | undefined = undefined;
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
      return {
        initialQuizBoard: b,
        initialQuizLastMove: currentQuizCard.opponentLastMove ?? lastMoveObj,
      };
    } catch {
      return {
        initialQuizBoard: ShogiBoard.fromSfen('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1'),
        initialQuizLastMove: undefined,
      };
    }
  }, [currentQuizCard]);

  // Current working board state
  const [mockPlayBoard, setMockPlayBoard] = useState<ShogiBoard>(initialQuizBoard);
  const [mockLastMove, setMockLastMove] = useState<ShogiMove | undefined>(initialQuizLastMove);

  // Reset play board when card changes
  useEffect(() => {
    setMockPlayBoard(initialQuizBoard);
    setMockLastMove(initialQuizLastMove);
    setMockPlayerFlipped(currentQuizCard.sideToMove === 'w');
    setMockEvalLossCp(null);
    setMockPunishInfo(null);
    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setValidTargetSquares([]);
  }, [initialQuizBoard, initialQuizLastMove, currentQuizCard.sideToMove]);

  const clearSelection = () => {
    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setValidTargetSquares([]);
  };

  const executeQuizMove = (move: ShogiMove) => {
    clearSelection();
    setMockStatus('judging');

    const expectedUsi = currentQuizCard.pv[mockStep * 2] ?? currentQuizCard.bestMove;
    const isBest = move.sfenMove === expectedUsi;

    setTimeout(() => {
      if (isBest) {
        // Correct best move!
        const nextBoard = mockPlayBoard.clone();
        nextBoard.applyMove(move);
        setMockPlayBoard(nextBoard);
        setMockLastMove(move);
        setMockVerdict('best');
        setMockEvalLossCp(0);
        setMockPunishInfo(null);

        // Check if there is an opponent reply in PV
        const replyUsi = currentQuizCard.pv[mockStep * 2 + 1];
        if (replyUsi) {
          setMockStatus('ai_replying');
          setTimeout(() => {
            const replyTurn = nextBoard.getTurn();
            const replyMove = parseUsiMove(replyUsi, nextBoard, cardMovePly + 1, replyTurn, move.to);
            if (replyMove) {
              nextBoard.applyMove(replyMove);
              setMockPlayBoard(nextBoard.clone());
              setMockLastMove(replyMove);
            }
            setMockStep((prev) => prev + 1);
            setMockVerdict(null);
            setMockEvalLossCp(null);
            setMockHintLevel(0);
            clearSelection();
            // If next solver move exists, continue; else finish
            if (currentQuizCard.pv[(mockStep + 1) * 2]) {
              setMockStatus('awaiting_move');
            } else {
              setMockStatus('finished');
            }
          }, 600);
        } else {
          setMockStatus('finished');
        }
      } else {
        // Play user's move first on board
        const boardWithUserMove = mockPlayBoard.clone();
        boardWithUserMove.applyMove(move);
        setMockPlayBoard(boardWithUserMove);
        setMockLastMove(move);

        // Determine loss & punish counter-move
        const choice = currentQuizCard.choices?.find((c) => c.usi === move.sfenMove);
        const loss = choice?.scoreDelta ? Math.abs(choice.scoreDelta) : 380;
        const replyUsi = currentQuizCard.pv[mockStep * 2 + 1];

        let parsedPunish: ShogiMove | undefined = undefined;
        if (replyUsi) {
          const replyTurn = boardWithUserMove.getTurn();
          parsedPunish = parseUsiMove(replyUsi, boardWithUserMove, cardMovePly + 1, replyTurn, move.to) ?? undefined;
          if (parsedPunish) {
            const punishedBoard = boardWithUserMove.clone();
            punishedBoard.applyMove(parsedPunish);
            setTimeout(() => {
              setMockPlayBoard(punishedBoard);
              setMockLastMove(parsedPunish);
            }, 450);
          }
        }

        setMockPunishInfo({
          punishMoveUsi: replyUsi ?? '',
          punishMove: parsedPunish,
          scoreBefore: currentQuizCard.scoreCpBefore,
          scoreAfterUser: currentQuizCard.scoreCpBefore - loss,
          lossCp: loss,
        });

        setMockVerdict('wrong');
        setMockEvalLossCp(loss);
        setMockStatus('wrong_retry');
      }
    }, 400);
  };

  const handleMockResetCurrentStep = () => {
    setMockPlayBoard(initialQuizBoard);
    setMockLastMove(initialQuizLastMove);
    setMockStatus('awaiting_move');
    setMockVerdict(null);
    setMockPunishInfo(null);
    setMockEvalLossCp(null);
    clearSelection();
  };

  const cardMovePly = currentQuizCard.ply + mockStep * 2;
  const solverColor = currentQuizCard.sideToMove;

  const handleMockSquareClick = (square: Square) => {
    if (mockStatus !== 'awaiting_move' && mockStatus !== 'wrong_retry') return;

    const pieceOnSquare = mockPlayBoard.getSquare(square.file, square.rank);
    const isSentePiece = pieceOnSquare ? pieceOnSquare === pieceOnSquare.toUpperCase() : false;
    const pieceColor: Color = isSentePiece ? 'b' : 'w';

    // 1. If dropping from hand
    if (selectedHandPiece) {
      const isValidDrop = validTargetSquares.some(
        (s) => s.file === square.file && s.rank === square.rank
      );
      if (isValidDrop) {
        const dropMove = createInteractiveMove(
          mockPlayBoard,
          cardMovePly,
          solverColor,
          undefined,
          square,
          false,
          selectedHandPiece
        );
        executeQuizMove(dropMove);
      } else {
        clearSelection();
      }
      return;
    }

    // 2. If a board square was already selected
    if (selectedSquare) {
      if (selectedSquare.file === square.file && selectedSquare.rank === square.rank) {
        clearSelection();
        return;
      }

      // Clicking another own piece switches selection
      if (pieceOnSquare && pieceColor === solverColor) {
        const legalMoves = getStrictLegalMovesForSquare(mockPlayBoard, square);
        setSelectedSquare(square);
        setSelectedHandPiece(null);
        setValidTargetSquares(legalMoves.map((m) => m.to));
        return;
      }

      // Check if clicked square is valid target
      const targetMove = getStrictLegalMovesForSquare(mockPlayBoard, selectedSquare).find(
        (m) => m.to.file === square.file && m.to.rank === square.rank
      );

      if (targetMove) {
        const move = createInteractiveMove(
          mockPlayBoard,
          cardMovePly,
          solverColor,
          selectedSquare,
          square,
          targetMove.forcePromote || targetMove.canPromote
        );
        executeQuizMove(move);
      } else {
        clearSelection();
      }
      return;
    }

    // 3. First selection: select friendly piece
    if (pieceOnSquare && pieceColor === solverColor) {
      const legalMoves = getStrictLegalMovesForSquare(mockPlayBoard, square);
      setSelectedSquare(square);
      setSelectedHandPiece(null);
      setValidTargetSquares(legalMoves.map((m) => m.to));
    }
  };

  const handleMockSelectHandPiece = (pieceKey: string) => {
    if (mockStatus !== 'awaiting_move' && mockStatus !== 'wrong_retry') return;
    if (selectedHandPiece === pieceKey) {
      clearSelection();
      return;
    }
    const legalDrops = getStrictLegalDropsForPiece(mockPlayBoard, pieceKey, solverColor);
    setSelectedHandPiece(pieceKey);
    setSelectedSquare(null);
    setValidTargetSquares(legalDrops);
  };

  const handleMockPickChoice = (usi: string) => {
    const turn = mockPlayBoard.getTurn();
    const parsed = parseUsiMove(usi, mockPlayBoard, cardMovePly, turn);
    if (parsed) {
      executeQuizMove(parsed);
    } else {
      // Direct USI execution fallback
      setMockStatus('judging');
      setTimeout(() => {
        if (usi === currentQuizCard.bestMove) {
          setMockVerdict('best');
        } else {
          setMockVerdict('acceptable');
        }
        setMockStatus('finished');
      }, 400);
    }
  };

  const handleMockRevealAnswer = () => {
    setMockVerdict('best');
    const turn = mockPlayBoard.getTurn();
    const move = parseUsiMove(currentQuizCard.bestMove, mockPlayBoard, cardMovePly, turn);
    if (move) {
      const nextBoard = mockPlayBoard.clone();
      nextBoard.applyMove(move);
      setMockPlayBoard(nextBoard);
    }
    setMockStatus('finished');
  };

  const handleMockNextQuiz = () => {
    setMockPlayerCardIndex((prev) => prev + 1);
    setMockStep(0);
    setMockStatus('awaiting_move');
    setMockVerdict(null);
    setMockHintLevel(0);
    setIsReplaying(false);
    clearSelection();
  };

  const handleMockToggleReplay = () => {
    setIsReplaying((prev) => !prev);
    setMockReplayIndex((prev) => (prev + 1) % currentQuizCard.pv.length);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Mock Header Info */}
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-amber-300">
              {t('mock.title')}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('mock.description')}
            </p>
          </div>
          <span className="rounded bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-300 border border-amber-500/30">
            Rule 3: Mock-First
          </span>
        </div>

        {/* View Mode Tabs */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('tree_visualizer')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'tree_visualizer'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold shadow-lg ring-1 ring-amber-400'
                : 'bg-shogi-card text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span>🌳</span>
            <span>棋樹ビジュアライザー (New)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('study')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'study'
                ? 'bg-amber-600 text-slate-950 shadow'
                : 'bg-shogi-card text-slate-300 hover:bg-slate-700'
            }`}
          >
            {t('mock.tab_study')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('srs')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'srs'
                ? 'bg-amber-600 text-slate-950 shadow'
                : 'bg-shogi-card text-slate-300 hover:bg-slate-700'
            }`}
          >
            {t('mock.tab_srs')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sparring')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'sparring'
                ? 'bg-amber-600 text-slate-950 shadow'
                : 'bg-shogi-card text-slate-300 hover:bg-slate-700'
            }`}
          >
            {t('mock.tab_sparring')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('auth')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'auth'
                ? 'bg-amber-600 text-slate-950 shadow'
                : 'bg-shogi-card text-slate-300 hover:bg-slate-700'
            }`}
          >
            👤 {t('auth.user_profile')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('broadcast')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'broadcast'
                ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-lg ring-1 ring-amber-400'
                : 'bg-shogi-card text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span>📺</span>
            <span>{t('mock.tab_broadcast')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('quiz')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'quiz'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg ring-1 ring-emerald-400'
                : 'bg-shogi-card text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span>🎯</span>
            <span>{t('mock.tab_quiz')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('quiz_player')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'quiz_player'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg ring-1 ring-purple-400'
                : 'bg-shogi-card text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span>⚔️</span>
            <span>{t('mock.tab_quiz_player')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('weakness')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'weakness'
                ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-lg ring-1 ring-rose-400'
                : 'bg-shogi-card text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span>⚠️</span>
            <span>{t('weakness.tab_label')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('mastery')}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'mastery'
                ? 'bg-gradient-to-r from-amber-600 to-emerald-600 text-white shadow-lg ring-1 ring-amber-400'
                : 'bg-shogi-card text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span>📊</span>
            <span>{t('mastery.tab_label')}</span>
          </button>
        </div>
      </div>

      {/* Tab: Tree Visualizer Preview (大樹ビジュアライザー) */}
      {activeTab === 'tree_visualizer' && (
        <div className="rounded-2xl overflow-hidden border border-slate-800 shadow-2xl h-[780px] bg-slate-950">
          <JosekiTreeVisualizer
            games={loadSavedStudioGames()}
            maxPlyLimit={30}
            onSelectPosition={(sfen, gameId, ply) => {
              console.log('Selected position from tree:', { sfen, gameId, ply });
            }}
          />
        </div>
      )}

      {/* Tab: Broadcast Pro Layout Preview */}
      {activeTab === 'broadcast' && (
        <ProBroadcastLayout
          board={currentBoard}
          currentPly={safePly}
          totalPly={totalPly}
          currentMove={currentMove}
          isFlipped={isFlipped}
          onFlipToggle={() => setIsFlipped((prev) => !prev)}
          activePath={activePath}
          onSelectPly={(p) => setCurrentPly(p)}
        />
      )}

      {/* Tab 1: Study & Tree Preview */}
      {activeTab === 'study' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Board & Graph Column */}
          <div className="flex flex-col gap-4 lg:col-span-7 xl:col-span-8">
            <div className="rounded-xl border border-shogi-border bg-shogi-panel p-3.5 shadow-lg">
              <div className="flex items-center justify-between pb-2 border-b border-shogi-border/60">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-500">
                  {t('board.title')} - {mockTree.openingName}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {t('board.ply_count', { current: safePly, total: totalPly })}
                </span>
              </div>
              <div className="mt-2">
                <ShogiBoardPanel
                  board={currentBoard}
                  currentPly={safePly}
                  totalPly={totalPly}
                  currentMove={currentMove}
                  isFlipped={isFlipped}
                  senteName="羽生善治"
                  goteName="藤井聡太"
                  onFirstPly={() => setCurrentPly(0)}
                  onPrevPly={() => setCurrentPly((p) => Math.max(0, p - 1))}
                  onNextPly={() => setCurrentPly((p) => Math.min(totalPly, p + 1))}
                  onLastPly={() => setCurrentPly(totalPly)}
                  onFlipToggle={() => setIsFlipped((prev) => !prev)}
                />
              </div>

              {/* Move Breadcrumb Ribbon */}
              {activePath.length > 0 && (
                <div className="mt-3">
                  <MoveBreadcrumbBar
                    currentPly={safePly}
                    activePath={activePath}
                    onSelectPly={(p) => setCurrentPly(p)}
                  />
                </div>
              )}

              {/* Branch Selector Pills */}
              {candidateMoves.length > 1 && (
                <div className="mt-2.5">
                  <BranchSelector
                    currentPly={safePly}
                    candidateMoves={candidateMoves}
                    activeNodeId={activePath[safePly - 1]?.id}
                    totalGames={mockTree.totalGames}
                    onSelectBranch={handleSelectBranch}
                  />
                </div>
              )}
            </div>

            {/* Interactive Evaluation Graph */}
            <EvaluationChart
              evaluations={evalDataPoints}
              currentPly={safePly}
              onSelectPly={(p) => setCurrentPly(p)}
              height={120}
              onOpenBatchAnalysis={() => setIsAnalysisModalOpen(true)}
              onAnalyzeCurrentPosition={safePly > 0 ? handleAnalyzeCurrentPosition : undefined}
              isAnalyzing={batchAnalysis.isAnalyzing}
            />
          </div>

          {/* Right Column: Multi-Branch Tree Explorer */}
          <div className="flex flex-col gap-4 lg:col-span-5 xl:col-span-4">
            <MultiBranchTreeExplorer
              tree={currentMockTree}
              activePath={activePath}
              currentPly={safePly}
              candidateMoves={candidateMoves}
              onSelectBranch={handleSelectBranch}
              onSelectPly={(p) => setCurrentPly(p)}
            />
          </div>
        </div>
      )}

      {/* Tab 2: SRS Memorization Drill Preview */}
      {activeTab === 'srs' && (
        <div className="flex flex-col gap-6">
          <SrsDrillPanel openingTree={mockTree} />
        </div>
      )}

      {/* Tab 3: AI Sparring Match Mode */}
      {activeTab === 'sparring' && (
        <div className="flex flex-col gap-6">
          <SparringArenaPanel
            openingTree={mockTree}
            onMergeSparringGame={(gameInput) => {
              console.log('Sparring game merged into tree in mock mode:', gameInput);
            }}
          />

          {/* Past Match History */}
          <div className="rounded-xl border border-shogi-border bg-shogi-panel p-4 shadow-lg">
            <h2 className="text-xs font-bold uppercase tracking-wider text-amber-500 pb-3 border-b border-shogi-border/60">
              {t('mock.match_history_title')}
            </h2>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {mockMatchHistory.map((m) => (
                <div
                  key={m.id}
                  className="rounded-lg border border-shogi-border bg-shogi-card/70 p-3 text-xs"
                >
                  <div className="flex items-center justify-between font-semibold">
                    <span className={m.result === 'win' ? 'text-emerald-400' : 'text-rose-400'}>
                      {m.result === 'win' ? `✓ ${t('mock.match_win')}` : `✕ ${t('mock.match_loss')}`}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {m.startedAt.slice(0, 10)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{m.aiEngine}</span>
                    <span>Depth {m.aiDepth}</span>
                  </div>
                  {m.isMergedIntoTree && (
                    <span className="mt-2 inline-block rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
                      Merged into Repertoire
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Firebase Auth & User Profile Sandbox */}
      {activeTab === 'auth' && (
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-shogi-border bg-shogi-panel p-6 shadow-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-shogi-border/60 gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>🔐</span>
                  <span>{t('auth.user_profile')} & Cloud Sandbox</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Firebase Authentication (Google SSO) & Local Offline Sandbox Mode
                </p>
              </div>

              {/* Status pill */}
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold flex items-center gap-1.5 border ${
                    isConfigured
                      ? 'bg-emerald-950/70 text-emerald-400 border-emerald-800/60'
                      : 'bg-amber-950/70 text-amber-400 border-amber-800/60'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isConfigured ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <span>
                    {isConfigured ? 'Firebase Configured' : 'Offline Sandbox'}
                  </span>
                </span>
              </div>
            </div>

            {/* Error banner if any */}
            {authError && (
              <div className="mt-4 rounded-lg bg-rose-950/40 border border-rose-800/50 p-3 text-xs text-rose-300">
                {authError}
              </div>
            )}

            {/* User Profile Card */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-lg border border-shogi-border bg-shogi-card p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500 mb-4">
                  Current Session
                </h3>

                {isAuthLoading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="h-3 w-3 rounded-full bg-slate-500 animate-ping" />
                    <span>{t('common.loading')}</span>
                  </div>
                ) : user ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName || 'User'}
                          className="h-12 w-12 rounded-full object-cover border-2 border-amber-500/80 shadow"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-600 text-lg font-bold text-slate-950 shadow">
                          {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {user.displayName || t('auth.anonymous_user')}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                          {user.email || 'No email associated'}
                        </div>
                      </div>
                    </div>

                    <div className="rounded bg-slate-900/60 p-3 text-xs space-y-1.5 font-mono text-slate-300 border border-slate-800">
                      <div className="flex justify-between">
                        <span className="text-slate-500">UID:</span>
                        <span className="text-amber-400 truncate max-w-[200px]">{user.uid}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Provider:</span>
                        <span className="text-slate-300">Google SSO</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Anonymous:</span>
                        <span className="text-slate-300">{user.isAnonymous ? 'Yes' : 'No'}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => signOut()}
                        className="rounded-lg bg-rose-900/40 hover:bg-rose-900/70 border border-rose-800/60 text-rose-300 px-4 py-2 text-xs font-semibold transition"
                      >
                        🚪 {t('auth.sign_out')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-lg bg-slate-900/50 p-4 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                      <p className="font-semibold text-amber-400 mb-1">
                        {t('auth.guest_mode')}
                      </p>
                      <p className="text-slate-400">
                        {t('auth.guest_notice')}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => signInWithGoogle()}
                        className="flex items-center gap-2 rounded-lg bg-white text-slate-900 px-4 py-2 text-xs font-semibold hover:bg-slate-100 transition shadow"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24">
                          <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                          />
                        </svg>
                        <span>{t('auth.sign_in_with_google')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => continueAsGuest()}
                        className="rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-4 py-2 text-xs font-semibold transition"
                      >
                        {t('auth.guest_mode')}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Architecture & Security Guide Card */}
              <div className="rounded-lg border border-shogi-border bg-shogi-card p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-500 mb-4">
                  Cloud Persistence Architecture
                </h3>
                <div className="space-y-3 text-xs text-slate-300">
                  <div className="rounded bg-slate-900/60 p-3 border border-slate-800">
                    <div className="font-semibold text-slate-200 mb-1">
                      1. Offline First (Local Sandbox)
                    </div>
                    <div className="text-slate-400">
                      When unauthenticated, opening trees and SM-2 flashcard logs are stored in IndexedDB and localStorage.
                    </div>
                  </div>

                  <div className="rounded bg-slate-900/60 p-3 border border-slate-800">
                    <div className="font-semibold text-slate-200 mb-1">
                      2. Cloud Firestore Ownership Security
                    </div>
                    <div className="text-slate-400">
                      Firestore security rules restrict all document reads and writes strictly to <code className="text-amber-400">/users/{'{userId}'}/*</code> matching the verified Firebase Auth UID.
                    </div>
                  </div>

                  <div className="rounded bg-slate-900/60 p-3 border border-slate-800">
                    <div className="font-semibold text-slate-200 mb-1">
                      3. Multi-Device Continuity
                    </div>
                    <div className="text-slate-400">
                      Signing in with Google on any device (desktop, phone, tablet) seamlessly loads your custom opening repertoires and review intervals.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Quiz Pool Manager Preview */}
      {activeTab === 'quiz' && (
        <div className="space-y-4">
          <QuizPoolManager
            cards={quizCards}
            openingNames={{
              kakugawari: '角換わり',
              yagura: '矢倉',
            }}
            gameTitles={{
              'game-kaku-01': '第1期 棋樹杯 vs Fairy-Stockfish (角換わり)',
              'game-yagura-01': '第2期 棋樹杯 vs Fairy-Stockfish (矢倉)',
            }}
            unanalyzedGameCount={1}
            onToggleCard={handleToggleQuizCard}
            onBulkToggle={handleBulkToggleQuizCards}
            onRequestAnalysis={() => {
              // Mock no-op or trigger analysis modal
              setIsAnalysisModalOpen(true);
            }}
            onRegenerate={() => {
              // Mock regenerate reset
              setQuizCards(mockQuizCards);
            }}
          />
        </div>
      )}

      {/* Tab: Tactical Quiz Player Preview */}
      {activeTab === 'quiz_player' && (
        <div className="space-y-4">
          <QuizPlayerPanel
            card={currentQuizCard}
            board={mockPlayBoard}
            isFlipped={mockPlayerFlipped}
            step={mockStep}
            totalSteps={Math.ceil(currentQuizCard.pv.length / 2)}
            lastMove={mockLastMove}
            status={mockStatus}
            verdict={mockVerdict}
            evalLossCp={mockEvalLossCp}
            punishInfo={mockPunishInfo}
            hintLevel={mockHintLevel}
            hintChoices={pickHintChoices(
              currentQuizCard,
              getAllStrictLegalMoves(mockPlayBoard, currentQuizCard.sideToMove).map((m) => m.usi),
              mockStep
            )}
            selectedSquare={selectedSquare}
            targetSquares={validTargetSquares}
            selectedHandPiece={selectedHandPiece}
            onSquareClick={handleMockSquareClick}
            onSelectHandPiece={handleMockSelectHandPiece}
            onRequestHint={() => setMockHintLevel(1)}
            onPickChoice={handleMockPickChoice}
            onRevealAnswer={handleMockRevealAnswer}
            onResetCurrentStep={handleMockResetCurrentStep}
            onNext={handleMockNextQuiz}
            result={
              mockStatus === 'finished'
                ? {
                    quality: mockVerdict === 'best' ? 5 : 3,
                    explanationKey: `quiz.explain.${currentQuizCard.type}`,
                  }
                : null
            }
            replayBoard={isReplaying ? mockPlayBoard : null}
            replayIndex={mockReplayIndex}
            onToggleReplay={handleMockToggleReplay}
            onFlipToggle={() => setMockPlayerFlipped((prev) => !prev)}
          />
        </div>
      )}

      {/* Tab: Weakness Analysis Preview */}
      {activeTab === 'weakness' && (
        <div className="space-y-6">
          <WeaknessAnalysisView
            positions={mockWeaknessPositions}
            onStartDrill={(pos) => {
              const card = weaknessToQuizCard(pos, currentMockTree);
              setCustomQuizCard(card);
              setMockStep(0);
              setMockStatus('awaiting_move');
              setMockVerdict(null);
              setMockHintLevel(0);
              setIsReplaying(false);
              clearSelection();
              setActiveTab('quiz_player');
            }}
          />
        </div>
      )}

      {/* Tab: Opening Mastery Dashboard Preview */}
      {activeTab === 'mastery' && (
        <div className="space-y-6">
          <OpeningMasteryDashboard
            summary={mockMasterySummary}
            onStartSrsDrill={(_openingId) => {
              setActiveTab('srs');
            }}
            onStartSparring={(_openingId) => {
              setActiveTab('sparring');
            }}
          />
        </div>
      )}

      {/* Batch Analysis Modal */}
      <BatchAnalysisModal
        isOpen={isAnalysisModalOpen}
        onClose={() => setIsAnalysisModalOpen(false)}
        isAnalyzing={batchAnalysis.isAnalyzing}
        progress={batchAnalysis.progress}
        tree={currentMockTree}
        activePath={activePath}
        onStartAnalysis={handleStartBatchAnalysis}
        onCancelAnalysis={batchAnalysis.cancelAnalysis}
      />
    </div>
  );
};

export default MockPage;
