/**
 * Legacy Study Tree & Portal Page (/legacy, dev-only).
 * Extracted from App.tsx so production startup stays fast and code-split.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KifuUploader } from '../components/kifu/KifuUploader';
import { KifuLibraryTable } from '../components/kifu/KifuLibraryTable';
import { KifuManagementModal } from '../components/kifu/KifuManagementModal';
import { ShogiBoardPanel } from '../components/board/ShogiBoardPanel';
import { EvaluationChart } from '../components/eval/EvaluationChart';
import { BranchSelector } from '../components/tree/BranchSelector';
import { MoveBreadcrumbBar } from '../components/tree/MoveBreadcrumbBar';
import { MultiBranchTreeExplorer } from '../components/tree/MultiBranchTreeExplorer';
import { ShogiBoard } from '../utils/shogiBoard';
import { Color, ShogiMove } from '../types/shogi';
import { KifuTreeNode, MergedKifuTree } from '../types/tree';
import { buildEvalChartPointsFromMoves, buildEvalChartPointsFromPath } from '../utils/evalChartHelper';
import { ParsedKifResult } from '../utils/kifParser';
import { GameMergeInput, mergeGamesIntoTree } from '../utils/treeMerger';
import { OPENING_CATEGORIES } from '../utils/openingClassifier';
import {
  deriveBoardHistoryFromPath,
  extractMovesFromPath,
  findPathForGame,
  findPathToNode,
  getCandidateMovesAtPly,
  getDefaultMainlinePath,
  switchBranchAtPly,
  updateNodeCommentInTree,
  updateNodeCommentInPath,
} from '../utils/treeNavigation';
import { serializeTreeToKif } from '../utils/kifSerializer';
import { copyKifToClipboard, downloadKifFile } from '../utils/exportHelpers';
import { SparringArenaPanel } from '../components/sparring/SparringArenaPanel';
import { SrsDrillPanel } from '../components/srs/SrsDrillPanel';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { useShogiEngine } from '../hooks/useShogiEngine';
import { useBatchAnalysis } from '../hooks/useBatchAnalysis';
import { BatchAnalysisModal } from '../components/eval/BatchAnalysisModal';
import { applyEvaluationsToPath, applyEvaluationsToTree } from '../utils/treeAnalysisEngine';
import { MoveEvaluation } from '../types/shogi';
import { QuizPoolManager } from '../components/quiz/QuizPoolManager';
import { QuizPlayerPanel } from '../components/quiz/QuizPlayerPanel';
import { useQuizPool } from '../hooks/useQuizPool';
import { useQuizSession } from '../hooks/useQuizSession';
import { UseShogiEngineReturn } from '../hooks/useShogiEngine';
import { TacticalQuizCard } from '../types/quiz';
import { formatIsoDateOnly } from '../utils/sm2Scheduler';
import { loadQuizProgress, pickNextQuiz } from '../utils/quizProgressStorage';
import { extractQuizCards } from '../utils/quizExtractor';
import { matchRecordToQuizSource, gameMergeInputToQuizSource } from '../utils/quizSources';
import { loadMatchRecords } from '../utils/matchHistoryStorage';
import { WeaknessPosition } from '../types/weakness';
import { weaknessToQuizCard } from '../utils/weaknessToQuiz';
import { OpeningMasteryDashboard } from '../components/dashboard/OpeningMasteryDashboard';
import { aggregateOpeningMastery } from '../utils/masteryAggregator';
import { loadSrsCards } from '../utils/srsStorage';
import { loadIngestedGames, saveIngestedGames } from '../utils/ingestedGamesStorage';
import { consumeStudioToTreeHandoff } from '../utils/studioTreeHandoff';
import { syncTreeEvaluationsToRecords } from '../utils/treeEvalSync';
import { KifuRecord } from '../types/kifuRecord';
import {
  findDuplicateKifuRecords,
  mergeTagsIntoExistingRecord,
} from '../utils/kifuDuplicateDetector';
import { DuplicateKifuDialog } from '../components/kifu/DuplicateKifuDialog';

interface PracticeQuizRunnerProps {
  card: TacticalQuizCard;
  engine: UseShogiEngineReturn;
  onExit: () => void;
  onNext: () => void;
}

const PracticeQuizRunner: React.FC<PracticeQuizRunnerProps> = ({
  card,
  engine,
  onExit,
  onNext,
}) => {
  const { t } = useTranslation();
  const session = useQuizSession(card, engine);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onExit}
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 transition active:scale-95"
        >
          <span>←</span>
          <span>{t('quiz.pool.title')}</span>
        </button>
      </div>

      <QuizPlayerPanel
        card={card}
        board={session.board}
        isFlipped={session.isFlipped}
        step={session.step}
        totalSteps={session.totalSteps}
        lastMove={session.lastMove}
        status={session.status}
        verdict={session.verdict}
        evalLossCp={session.evalLossCp}
        punishInfo={session.punishInfo}
        hintLevel={session.hintLevel}
        hintChoices={session.hintChoices}
        selectedSquare={session.selectedSquare}
        targetSquares={session.targetSquares}
        selectedHandPiece={session.selectedHandPiece}
        onSquareClick={session.onSquareClick}
        onSelectHandPiece={session.onSelectHandPiece}
        onRequestHint={session.onRequestHint}
        onPickChoice={session.onPickChoice}
        onRevealAnswer={session.onRevealAnswer}
        onResetCurrentStep={session.onResetCurrentStep}
        onNext={onNext}
        result={session.result}
        replayBoard={session.replayBoard}
        replayIndex={session.replayIndex}
        onToggleReplay={session.onToggleReplay}
        onFlipToggle={session.onFlipToggle}
      />
    </div>
  );
};

const MainStudyView: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'tree' | 'srs' | 'sparring' | 'quiz' | 'mastery'>('tree');
  const quizPool = useQuizPool();
  const srsCards = useMemo(() => loadSrsCards(), [activeTab]);
  const matchRecords = useMemo(() => loadMatchRecords(), [activeTab]);
  const masterySummary = useMemo(
    () => aggregateOpeningMastery({ srsCards, matchRecords }),
    [srsCards, matchRecords]
  );
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [currentPly, setCurrentPly] = useState<number>(0);
  const [srsInitialPly, setSrsInitialPly] = useState<number>(0);
  const [srsInitialSide, setSrsInitialSide] = useState<Color>('b');
  const [sparringInitialMoves, setSparringInitialMoves] = useState<ShogiMove[] | undefined>(undefined);
  const [sparringInitialSide, setSparringInitialSide] = useState<Color | undefined>(undefined);

  // Tactical Quiz practice session state
  const [practiceCard, setPracticeCard] = useState<TacticalQuizCard | null>(null);
  const [isPracticeMode, setIsPracticeMode] = useState<boolean>(false);

  const handleStartPractice = () => {
    if (!engine.isReady) {
      void engine.init();
    }
    const progress = loadQuizProgress();
    const today = formatIsoDateOnly(new Date());
    const next = pickNextQuiz(quizPool.cards, progress, today);
    setPracticeCard(next);
    setIsPracticeMode(true);
  };

  const handleNextPracticeQuiz = () => {
    const progress = loadQuizProgress();
    const today = formatIsoDateOnly(new Date());
    const next = pickNextQuiz(quizPool.cards, progress, today, practiceCard?.id);
    setPracticeCard(next);
  };

  const handleStartWeaknessDrill = (pos: WeaknessPosition) => {
    if (!engine.isReady) {
      void engine.init();
    }
    const card = weaknessToQuizCard(pos, displayTree ?? undefined);
    setPracticeCard(card);
    setIsPracticeMode(true);
    setActiveTab('quiz');
  };

  // Quick Kifu Management Modal state
  const [isKifuModalOpen, setIsKifuModalOpen] = useState<boolean>(false);

  // Wasm AI Engine & Batch Analysis
  const engine = useShogiEngine({ autoInit: false });
  const batchAnalysis = useBatchAnalysis({ engine });
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analyzedTree, setAnalyzedTree] = useState<MergedKifuTree | null>(null);

  // Ingested games state (restored from localStorage on load)
  const navigate = useNavigate();
  const [gameInputs, setGameInputs] = useState<GameMergeInput[]>(() => loadIngestedGames());
  const [pendingTreeHandoff, setPendingTreeHandoff] = useState(() => consumeStudioToTreeHandoff());

  // Pending ingest blocked by duplicate detection dialog (Issue #44)
  const [pendingDuplicate, setPendingDuplicate] = useState<{
    parsed: ParsedKifResult;
    duplicates: KifuRecord[];
  } | null>(null);

  // Persist ingested games to localStorage whenever updated
  useEffect(() => {
    saveIngestedGames(gameInputs);
  }, [gameInputs]);

  // Reset analyzed tree when ingested games change
  useEffect(() => {
    setAnalyzedTree(null);
  }, [gameInputs]);

  // Callback to merge sparring match game input into tree
  const handleMergeSparringGame = (gameInput: GameMergeInput) => {
    setGameInputs((prev) => [gameInput, ...prev.filter((g) => g.game.id !== gameInput.game.id)]);
  };

  // Automatically recalculate merged tree whenever game inputs change
  const mergedTree = useMemo(() => {
    if (gameInputs.length === 0) return null;
    return mergeGamesIntoTree(gameInputs, {
      openingName: t('app.sample_opening'),
    });
  }, [gameInputs, t]);

  const displayTree = analyzedTree ?? mergedTree;

  const existingGameIds = useMemo(
    () => new Set(gameInputs.map((item) => item.game.id)),
    [gameInputs]
  );

  const games = useMemo(() => gameInputs.map((item) => item.game), [gameInputs]);

  // Active branch path from root to current leaf in the merged tree
  const [activePath, setActivePath] = useState<KifuTreeNode[]>([]);

  // Sync activePath when displayTree updates
  useEffect(() => {
    if (displayTree && displayTree.rootNodes.length > 0) {
      if (pendingTreeHandoff) {
        const handoffPath = findPathForGame(displayTree, pendingTreeHandoff.gameId);
        if (handoffPath && handoffPath.length > 0) {
          setActivePath(handoffPath);
          setCurrentPly(Math.min(pendingTreeHandoff.ply, handoffPath.length));
          setPendingTreeHandoff(null);
          return;
        }
        setPendingTreeHandoff(null);
      }
      setActivePath((prev) => {
        if (prev.length > 0) {
          const lastId = prev[prev.length - 1]?.id ?? '';
          const revalidated = findPathToNode(displayTree.rootNodes, lastId);
          if (revalidated) return revalidated;
        }
        return getDefaultMainlinePath(displayTree);
      });
    } else {
      setActivePath([]);
    }
  }, [displayTree, pendingTreeHandoff]);

  // Active moves along the currently selected tree branch
  const activeMoves: ShogiMove[] = useMemo(() => {
    if (activePath.length > 0) {
      return extractMovesFromPath(activePath);
    }
    return gameInputs[0]?.moves ?? [];
  }, [activePath, gameInputs]);

  const totalPly = activeMoves.length;

  // Derive board history: index 0 is Hirate starting board, index k is after move k
  const boardHistory: ShogiBoard[] = useMemo(() => {
    if (activePath.length > 0) {
      return deriveBoardHistoryFromPath(activePath);
    }
    const history: ShogiBoard[] = [new ShogiBoard()];
    let current = history[0]!;
    for (const move of activeMoves) {
      const next = current.clone();
      next.applyMove(move);
      history.push(next);
      current = next;
    }
    return history;
  }, [activePath, activeMoves]);

  const safePly = Math.min(Math.max(0, currentPly), totalPly);
  const currentBoard = boardHistory[safePly] ?? boardHistory[0]!;
  const currentMove = safePly > 0 ? activeMoves[safePly - 1] : undefined;

  // Candidate branching moves at current ply
  const candidateMoves = useMemo(() => {
    return getCandidateMovesAtPly(displayTree, activePath, safePly);
  }, [displayTree, activePath, safePly]);

  const evalDataPoints = useMemo(() => {
    if (activePath.length > 0) {
      return buildEvalChartPointsFromPath(activePath);
    }
    return buildEvalChartPointsFromMoves(activeMoves);
  }, [activePath, activeMoves]);

  const [selectedGameId, setSelectedGameId] = useState<string>('');

  const activeGame = useMemo(() => {
    if (selectedGameId) {
      const found = gameInputs.find((g) => g.game.id === selectedGameId);
      if (found) return found;
    }
    return gameInputs[0];
  }, [gameInputs, selectedGameId]);

  // Group games by their opening category for hierarchical selection (戦型 → 棋譜)
  const groupedGames = useMemo(() => {
    const groups: Array<{
      categoryId: string;
      categoryName: string;
      games: GameMergeInput[];
    }> = [];

    const categoryMap = new Map<string, GameMergeInput[]>();
    for (const item of gameInputs) {
      const catId = item.game.openingId || 'unclassified';
      const list = categoryMap.get(catId) ?? [];
      list.push(item);
      categoryMap.set(catId, list);
    }

    for (const cat of OPENING_CATEGORIES) {
      const gamesInCat = categoryMap.get(cat.id);
      if (gamesInCat && gamesInCat.length > 0) {
        groups.push({
          categoryId: cat.id,
          categoryName: t(cat.nameKey),
          games: gamesInCat,
        });
        categoryMap.delete(cat.id);
      }
    }

    // Remaining custom/unmapped categories
    for (const [catId, gamesInCat] of categoryMap.entries()) {
      if (gamesInCat.length > 0) {
        groups.push({
          categoryId: catId,
          categoryName: catId,
          games: gamesInCat,
        });
      }
    }

    return groups;
  }, [gameInputs, t]);

  const handleSelectGame = (gameId: string) => {
    setSelectedGameId(gameId);
    if (displayTree) {
      const path = findPathForGame(displayTree, gameId);
      if (path.length > 0) {
        setActivePath(path);
        setCurrentPly(0);
      }
    }
  };

  const commitGameIngest = (parsed: ParsedKifResult) => {
    setGameInputs((prev) => [...prev, parsed]);
    if (!selectedGameId) {
      setSelectedGameId(parsed.game.id);
    }
  };

  const handleGameIngested = (parsed: ParsedKifResult) => {
    // contentHash-based duplicate detection across all KifuRecords (#44)
    const duplicates = findDuplicateKifuRecords({ rawKif: parsed.game.rawKif });
    if (duplicates.length > 0) {
      setPendingDuplicate({ parsed, duplicates });
      return;
    }
    commitGameIngest(parsed);
  };

  const handleDuplicateOpenExisting = (record: KifuRecord) => {
    setPendingDuplicate(null);
    // Only tree-source records exist in the ingested game list; other
    // sources are reachable via the studio/library views instead.
    if (gameInputs.some((item) => item.game.id === record.id)) {
      handleSelectGame(record.id);
    }
  };

  const handleDuplicateSaveAnyway = () => {
    if (!pendingDuplicate) return;
    const { parsed } = pendingDuplicate;
    setPendingDuplicate(null);
    commitGameIngest(parsed);
  };

  const handleDuplicateMerge = () => {
    if (!pendingDuplicate) return;
    const { duplicates } = pendingDuplicate;
    setPendingDuplicate(null);
    // Keep the existing record(s); union any candidate tags into the first
    // duplicate. Tree ingest carries no tags, so this resolves to "keep
    // existing, discard the new ingest" for identical move sequences.
    const first = duplicates[0];
    if (first) mergeTagsIntoExistingRecord(first, []);
  };

  const handleDuplicateCancel = () => {
    setPendingDuplicate(null);
  };

  // Bulk import (#51/#52): the processor already filtered duplicates via
  // contentHash, so successes commit directly without the per-game dialog.
  const handleBulkGamesIngested = (results: ParsedKifResult[]) => {
    for (const parsed of results) {
      commitGameIngest(parsed);
    }
  };

  const handleToggleInclude = (gameId: string) => {
    setGameInputs((prev) =>
      prev.map((item) =>
        item.game.id === gameId
          ? { ...item, game: { ...item.game, isIncluded: !item.game.isIncluded } }
          : item
      )
    );
  };

  const handleCategoryChange = (gameId: string, newCategoryId: string) => {
    setGameInputs((prev) =>
      prev.map((item) =>
        item.game.id === gameId
          ? { ...item, game: { ...item.game, openingId: newCategoryId } }
          : item
      )
    );
  };

  const handleUpdateGameTitle = (gameId: string, newTitle: string) => {
    setGameInputs((prev) =>
      prev.map((item) =>
        item.game.id === gameId
          ? { ...item, game: { ...item.game, title: newTitle } }
          : item
      )
    );
  };

  const handleDeleteGame = (gameId: string) => {
    setGameInputs((prev) => prev.filter((item) => item.game.id !== gameId));
  };

  const handleIncludeAll = () => {
    setGameInputs((prev) =>
      prev.map((item) => ({
        ...item,
        game: { ...item.game, isIncluded: true },
      }))
    );
  };

  const handleExcludeAll = () => {
    setGameInputs((prev) =>
      prev.map((item) => ({
        ...item,
        game: { ...item.game, isIncluded: false },
      }))
    );
  };

  const handleIncludeCategoryOnly = (categoryId: string) => {
    setGameInputs((prev) =>
      prev.map((item) => ({
        ...item,
        game: { ...item.game, isIncluded: item.game.openingId === categoryId },
      }))
    );
  };

  const handleClearAll = () => {
    setGameInputs([]);
    setCurrentPly(0);
    setActivePath([]);
  };

  const handleExportKif = () => {
    if (!displayTree) return;
    const kifText = serializeTreeToKif(displayTree);
    downloadKifFile(kifText, `${displayTree.openingId || 'repertoire'}_tree.kif`);
  };

  const handleCopyKif = async (): Promise<boolean> => {
    if (!displayTree) return false;
    const kifText = serializeTreeToKif(displayTree);
    return await copyKifToClipboard(kifText);
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
      { movetimeMs: 500 }
    );

    if (evalResult) {
      const evalMap = new Map<string, MoveEvaluation>([[targetNode.id, evalResult]]);
      setActivePath((prev) => applyEvaluationsToPath(prev, evalMap));
      if (displayTree) {
        const nextTree = applyEvaluationsToTree(displayTree, evalMap);
        setAnalyzedTree(nextTree);
        syncTreeEvaluationsToRecords(nextTree, engine.activeEngineId);
      }
    }
  };

  const handleUpdateNodeComment = (nodeId: string, comment: string) => {
    setActivePath((prev) => updateNodeCommentInPath(prev, nodeId, comment));
    if (displayTree) {
      setAnalyzedTree(updateNodeCommentInTree(displayTree, nodeId, comment));
    }
  };

  const handleStartBatchAnalysis = async (options: {
    scope: 'path' | 'tree';
    movetimeMs: number;
    skipAlreadyAnalyzed: boolean;
  }) => {
    if (options.scope === 'tree' && displayTree) {
      const updated = await batchAnalysis.analyzeTree(displayTree, options);
      if (updated) {
        setAnalyzedTree(updated);
        syncTreeEvaluationsToRecords(updated, engine.activeEngineId);
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
        if (displayTree) {
          const evalMap = new Map<string, MoveEvaluation>();
          for (const node of updatedPath) {
            if (node.evaluation) evalMap.set(node.id, node.evaluation);
          }
          const nextTree = applyEvaluationsToTree(displayTree, evalMap);
          setAnalyzedTree(nextTree);
          syncTreeEvaluationsToRecords(nextTree, engine.activeEngineId);
        }
      }
    }
  };

  const handleFirstPly = () => setCurrentPly(0);
  const handlePrevPly = () => setCurrentPly((prev) => Math.max(0, prev - 1));
  const handleNextPly = () => setCurrentPly((prev) => Math.min(totalPly, prev + 1));
  const handleLastPly = () => setCurrentPly(totalPly);
  const handleFlipToggle = () => setIsFlipped((prev) => !prev);

  // Seamlessly switch active branch and sync board history
  const handleSelectBranch = (targetNode: KifuTreeNode) => {
    setActivePath((prev) => switchBranchAtPly(prev, targetNode, targetNode.move.ply));
    if (targetNode.move.ply > safePly) {
      setCurrentPly(targetNode.move.ply);
    }
  };

  const handleStartSrsFromCurrent = () => {
    setSrsInitialPly(safePly);
    const nextSide: Color = safePly % 2 === 0 ? 'b' : 'w';
    setSrsInitialSide(nextSide);
    setActiveTab('srs');
  };

  const handleStartSparringFromCurrent = () => {
    const movesUpToPly = activeMoves.slice(0, safePly);
    const nextSide: Color = safePly % 2 === 0 ? 'b' : 'w';
    setSparringInitialMoves(movesUpToPly);
    setSparringInitialSide(nextSide);
    setActiveTab('sparring');
  };

  const gameTitlesMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of games) {
      map[g.id] = g.title || `${g.senteName} vs ${g.goteName}`;
    }
    const matchRecords = loadMatchRecords();
    for (const m of matchRecords) {
      if (!map[m.id]) {
        map[m.id] = `Sparring Match (${m.result}) - ${new Date(m.startedAt).toLocaleDateString()}`;
      }
    }
    return map;
  }, [games]);

  const openingNamesMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const cat of OPENING_CATEGORIES) {
      map[cat.id] = t(cat.nameKey);
    }
    return map;
  }, [t]);

  const unanalyzedGameCount = useMemo(() => {
    return games.filter((g) => !g.isAnalyzed).length;
  }, [games]);

  const handleRegenerateQuizzes = () => {
    const matchRecords = loadMatchRecords();
    const freshCards = matchRecords
      .map(matchRecordToQuizSource)
      .flatMap((g) => extractQuizCards(g));
    quizPool.addGenerated(freshCards);
  };

  const availableGamesForQuiz = useMemo(() => {
    const list: Array<{ id: string; title: string; movesCount: number; isAnalyzed: boolean }> = [];
    for (const g of gameInputs) {
      list.push({
        id: g.game.id,
        title: g.game.title || `${g.game.senteName} vs ${g.game.goteName}`,
        movesCount: g.moves.length,
        isAnalyzed: g.game.isAnalyzed,
      });
    }
    const matchRecords = loadMatchRecords();
    for (const m of matchRecords) {
      list.push({
        id: m.id,
        title: `Sparring (${m.result}) - ${new Date(m.startedAt).toLocaleDateString()}`,
        movesCount: m.moves.length,
        isAnalyzed: true,
      });
    }
    return list;
  }, [gameInputs]);

  const handleGenerateQuizFromSpecificGame = (gameId: string) => {
    console.log('[Quiz Generation] Starting for game:', gameId);

    let source: ReturnType<typeof gameMergeInputToQuizSource> | null = null;

    // First try to get moves with evaluations from analyzedTree
    if (analyzedTree) {
      const gamePath = findPathForGame(analyzedTree, gameId);
      if (gamePath.length > 0) {
        const movesWithEval = extractMovesFromPath(gamePath);
        const matchedInput = gameInputs.find((g) => g.game.id === gameId);
        if (matchedInput) {
          console.log('[Quiz Generation] Using analyzedTree with evaluations:', matchedInput.game.title);
          source = {
            gameId: matchedInput.game.id,
            openingId: matchedInput.game.openingId || 'other',
            startSfen: 'startpos',
            moves: movesWithEval,
          };
        }
      }
    }

    // Fallback to gameInputs (without evaluations)
    if (!source) {
      const matchedInput = gameInputs.find((g) => g.game.id === gameId);
      if (matchedInput) {
        console.log('[Quiz Generation] Using gameInputs (no evaluations):', matchedInput.game.title);
        source = gameMergeInputToQuizSource(matchedInput);
      }
    }

    // Fallback to matchRecords (sparring matches with evaluations)
    if (!source) {
      const matchRecords = loadMatchRecords();
      const matchedRecord = matchRecords.find((m) => m.id === gameId);
      if (matchedRecord) {
        console.log('[Quiz Generation] Found in matchRecords:', matchedRecord.id);
        source = matchRecordToQuizSource(matchedRecord);
      }
    }

    if (!source) {
      console.error('[Quiz Generation] Source not found for game:', gameId);
      alert('棋譜が見つかりません');
      return;
    }

    console.log('[Quiz Generation] Source game:', {
      gameId: source.gameId,
      openingId: source.openingId,
      movesCount: source.moves.length,
      hasEvaluations: source.moves.some(m => m.evaluation !== undefined),
    });

    const freshCards = extractQuizCards(source);
    console.log('[Quiz Generation] Extracted cards:', freshCards.length);

    if (freshCards.length > 0) {
      quizPool.addGenerated(freshCards);
      alert(`${freshCards.length}問のクイズを生成しました`);
    } else {
      alert('クイズを生成できませんでした（評価データがないか、変化点が見つかりませんでした）');
    }
  };


  return (
    <div className="space-y-6">
      {/* Top Main Mode Navigation Tabs with Quick Kifu Manager */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('tree')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
              activeTab === 'tree'
                ? 'bg-amber-600 text-slate-950 shadow-amber-950/40'
                : 'bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <span>🌳</span>
            <span>{t('nav.study_tree')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('srs')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
              activeTab === 'srs'
                ? 'bg-emerald-600 text-white shadow-emerald-950/40'
                : 'bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <span>🎯</span>
            <span>{t('nav.srs_memorize')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sparring')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
              activeTab === 'sparring'
                ? 'bg-sky-600 text-white shadow-sky-950/40'
                : 'bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <span>⚔️</span>
            <span>{t('nav.ai_sparring')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('quiz')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
              activeTab === 'quiz'
                ? 'bg-purple-600 text-white shadow-purple-950/40'
                : 'bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <span>🧩</span>
            <span>{t('quiz.pool.title')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('mastery')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm ${
              activeTab === 'mastery'
                ? 'bg-gradient-to-r from-amber-600 to-emerald-600 text-white shadow-amber-950/40'
                : 'bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <span>📊</span>
            <span>{t('mastery.tab_label')}</span>
          </button>
        </div>

        {/* Quick Kifu Ingestion & Management Modal Launcher */}
        <button
          type="button"
          onClick={() => setIsKifuModalOpen(true)}
          className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-950/60 to-slate-900 hover:from-amber-900/70 hover:to-slate-800 text-amber-300 px-3 py-2 text-xs font-bold transition shadow-md active:scale-95 shrink-0"
        >
          <span>📂</span>
          <span className="hidden sm:inline">{t('ingestion.quick_manage')}</span>
          <span className="rounded-full bg-amber-500/25 px-1.5 py-0.2 font-mono text-[10px] text-amber-200 border border-amber-500/30">
            {games.length}
          </span>
        </button>
      </div>

      {/* Mode Tab Contents */}
      {activeTab === 'quiz' ? (
        <ErrorBoundary fallbackTitle="Quiz Pool Error">
          {isPracticeMode ? (
            practiceCard ? (
              <PracticeQuizRunner
                card={practiceCard}
                engine={engine}
                onExit={() => setIsPracticeMode(false)}
                onNext={handleNextPracticeQuiz}
              />
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-8 text-center space-y-4 max-w-lg mx-auto shadow-xl">
                <div className="text-3xl">🎉</div>
                <div className="text-sm font-bold text-slate-200">
                  {t('quiz.player.no_quiz')}
                </div>
                <button
                  type="button"
                  onClick={() => setIsPracticeMode(false)}
                  className="rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 text-xs font-semibold transition"
                >
                  ← {t('quiz.pool.title')}
                </button>
              </div>
            )
          ) : (
            <QuizPoolManager
              cards={quizPool.cards}
              gameTitles={gameTitlesMap}
              openingNames={openingNamesMap}
              availableGames={availableGamesForQuiz}
              unanalyzedGameCount={unanalyzedGameCount}
              onToggleCard={quizPool.toggle}
              onBulkToggle={quizPool.bulkToggle}
              onRequestAnalysis={() => setIsAnalysisModalOpen(true)}
              onRegenerate={handleRegenerateQuizzes}
              onGenerateFromGame={handleGenerateQuizFromSpecificGame}
              onStartPractice={handleStartPractice}
            />
          )}
        </ErrorBoundary>
      ) : activeTab === 'srs' ? (
        <ErrorBoundary fallbackTitle="SRS Drill Error">
          <SrsDrillPanel
            openingTree={displayTree}
            initialStartPly={srsInitialPly}
            initialSide={srsInitialSide}
            initialPath={activePath}
            onExitDrill={() => setActiveTab('tree')}
          />
        </ErrorBoundary>
      ) : activeTab === 'sparring' ? (
        <ErrorBoundary fallbackTitle="Sparring Arena Error">
          <SparringArenaPanel
            openingTree={displayTree}
            initialMoves={sparringInitialMoves}
            initialSide={sparringInitialSide}
            onMergeSparringGame={handleMergeSparringGame}
            onExitToTree={() => {
              setActiveTab('tree');
              setSparringInitialMoves(undefined);
              setSparringInitialSide(undefined);
            }}
            onStartWeaknessDrill={handleStartWeaknessDrill}
          />
        </ErrorBoundary>
      ) : activeTab === 'mastery' ? (
        <ErrorBoundary fallbackTitle="Mastery Dashboard Error">
          <OpeningMasteryDashboard
            summary={masterySummary}
            onStartSrsDrill={(_openingId) => {
              setActiveTab('srs');
            }}
            onStartSparring={(_openingId) => {
              setActiveTab('sparring');
            }}
          />
        </ErrorBoundary>
      ) : (
        <>
          {/* Top Grid: Board Viewer & Tree Summary */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
            {/* Left Column: Board & Graph */}
            <div className="flex flex-col gap-4 lg:col-span-7 xl:col-span-8">
              {/* Board Container Card */}
              <div className="rounded-xl border border-shogi-border bg-shogi-panel p-3 sm:p-3.5 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-shogi-border/60">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-500 shrink-0">
                  {t('board.title')}
                </span>
                {gameInputs.length > 1 ? (
                  <select
                    value={activeGame?.game?.id ?? ''}
                    onChange={(e) => handleSelectGame(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-200 font-medium truncate max-w-[200px] sm:max-w-[280px] focus:outline-none focus:ring-1 focus:ring-amber-500"
                    title={activeGame?.game?.title ?? ''}
                  >
                    {groupedGames.map((group) => (
                      <optgroup
                        key={group.categoryId}
                        label={`📁 ${group.categoryName} (${group.games.length})`}
                        className="bg-slate-950 text-slate-400 font-bold"
                      >
                        {group.games.map((item) => (
                          <option
                            key={item.game.id}
                            value={item.game.id}
                            className="bg-slate-900 text-slate-200 font-normal"
                          >
                            {item.game.title || `${item.game.senteName} vs ${item.game.goteName}`}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                ) : activeGame?.game?.title ? (
                  <span className="text-xs text-slate-300 font-medium truncate max-w-[180px] sm:max-w-[260px]" title={activeGame.game.title}>
                    {activeGame.game.title}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleStartSrsFromCurrent}
                  className="rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white px-2 py-1 text-xs font-bold transition flex items-center gap-1 shadow-sm active:scale-95 shrink-0 whitespace-nowrap"
                  title={t('srs.start_drill_from_current')}
                >
                  <span>🎯</span>
                  <span className="whitespace-nowrap">{t('srs.drill_short_btn')}</span>
                  <span className="font-mono text-[11px] opacity-90">({t('srs.ply_indicator', { ply: safePly })})</span>
                </button>
                <button
                  type="button"
                  onClick={handleStartSparringFromCurrent}
                  className="rounded-lg bg-sky-600/90 hover:bg-sky-500 text-white px-2 py-1 text-xs font-bold transition flex items-center gap-1 shadow-sm active:scale-95 shrink-0 whitespace-nowrap"
                  title={t('srs.start_sparring_from_current')}
                >
                  <span>⚔️</span>
                  <span className="whitespace-nowrap">{t('srs.sparring_short_btn')}</span>
                  <span className="font-mono text-[11px] opacity-90">({t('srs.ply_indicator', { ply: safePly })})</span>
                </button>
                <span className="text-xs text-slate-400 font-mono hidden md:inline shrink-0">
                  {t('board.ply_count', { current: safePly, total: totalPly })}
                </span>
              </div>
            </div>

            {/* Interactive SVG Shogi Board Panel */}
            <div className="mt-2">
              <ShogiBoardPanel
                board={currentBoard}
                currentPly={safePly}
                totalPly={totalPly}
                currentMove={currentMove}
                isFlipped={isFlipped}
                senteName={activeGame?.game?.senteName || t('board.sente')}
                goteName={activeGame?.game?.goteName || t('board.gote')}
                onFirstPly={handleFirstPly}
                onPrevPly={handlePrevPly}
                onNextPly={handleNextPly}
                onLastPly={handleLastPly}
                onFlipToggle={handleFlipToggle}
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

            {/* Branch Selector Pills (when alternative variations exist) */}
            {candidateMoves.length > 1 && (
              <div className="mt-2.5">
                <BranchSelector
                  currentPly={safePly}
                  candidateMoves={candidateMoves}
                  activeNodeId={activePath[safePly - 1]?.id}
                  totalGames={displayTree?.totalGames ?? 0}
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
            height={130}
            onOpenBatchAnalysis={() => setIsAnalysisModalOpen(true)}
            onAnalyzeCurrentPosition={safePly > 0 ? handleAnalyzeCurrentPosition : undefined}
            isAnalyzing={batchAnalysis.isAnalyzing}
          />
        </div>

        {/* Right Column: Multi-Branch Tree Explorer */}
        <div className="flex flex-col gap-4 lg:col-span-5 xl:col-span-4">
          <MultiBranchTreeExplorer
            tree={displayTree}
            activePath={activePath}
            currentPly={safePly}
            candidateMoves={candidateMoves}
            onSelectBranch={handleSelectBranch}
            onSelectPly={(p) => setCurrentPly(p)}
            onUpdateNodeComment={handleUpdateNodeComment}
          />
        </div>
      </div>

      {/* Bottom Section: KIF Uploader & Library Management Table */}
      <div className="space-y-6">
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-amber-200/90">
            ℹ️ {t('library_page.legacy_modal_notice')}
          </span>
          <Link
            to="/library"
            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold border border-amber-500/40 transition"
          >
            {t('library_page.legacy_modal_open_new')}
          </Link>
        </div>

        <KifuUploader
          onGameIngested={handleGameIngested}
          onBulkIngested={handleBulkGamesIngested}
          existingGameIds={existingGameIds}
        />

        <KifuLibraryTable
          games={games}
          onToggleInclude={handleToggleInclude}
          onCategoryChange={handleCategoryChange}
          onOpenInStudio={(gameId) => navigate(`/studio?gameId=${encodeURIComponent(gameId)}`)}
          onDeleteGame={handleDeleteGame}
          onIncludeAll={handleIncludeAll}
          onExcludeAll={handleExcludeAll}
          onClearAll={handleClearAll}
          onExportKif={handleExportKif}
          onCopyKif={handleCopyKif}
        />
      </div>
        </>
      )}

      {/* Batch Analysis Modal */}
      <BatchAnalysisModal
        isOpen={isAnalysisModalOpen}
        onClose={() => setIsAnalysisModalOpen(false)}
        isAnalyzing={batchAnalysis.isAnalyzing}
        progress={batchAnalysis.progress}
        tree={displayTree}
        activePath={activePath}
        activeEngineId={engine.activeEngineId}
        onSwitchEngine={engine.switchEngine}
        onStartAnalysis={handleStartBatchAnalysis}
        onCancelAnalysis={batchAnalysis.cancelAnalysis}
      />

      {/* Quick Kifu Management Modal */}
      <KifuManagementModal
        isOpen={isKifuModalOpen}
        onClose={() => setIsKifuModalOpen(false)}
        games={games}
        existingGameIds={existingGameIds}
        onGameIngested={handleGameIngested}
        onToggleInclude={handleToggleInclude}
        onCategoryChange={handleCategoryChange}
        onUpdateTitle={handleUpdateGameTitle}
        onDeleteGame={handleDeleteGame}
        onIncludeAll={handleIncludeAll}
        onExcludeAll={handleExcludeAll}
        onIncludeCategoryOnly={handleIncludeCategoryOnly}
        onClearAll={handleClearAll}
        onExportKif={handleExportKif}
        onCopyKif={handleCopyKif}
      />

      {/* Duplicate Kifu Resolution Dialog (#44) */}
      {pendingDuplicate && (
        <DuplicateKifuDialog
          duplicates={pendingDuplicate.duplicates}
          candidateTitle={pendingDuplicate.parsed.game.title}
          onOpenExisting={handleDuplicateOpenExisting}
          onSaveAnyway={handleDuplicateSaveAnyway}
          onMerge={handleDuplicateMerge}
          onCancel={handleDuplicateCancel}
        />
      )}
    </div>
  );
};

export default MainStudyView;
