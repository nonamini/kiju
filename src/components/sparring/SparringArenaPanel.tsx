/**
 * AI Sparring Arena Panel Component (Pro Broadcast Edition).
 * Single-screen professional broadcast presentation combining:
 * - Live win-rate percentage dual-color bar & match state banner
 * - Flanked Komadai piece stands (desktop vertical, mobile horizontal)
 * - Interactive move highlights, square clicks, drop handling, promotion prompt
 * - Sub-tabbed telemetry dashboard:
 *   [1] Analysis & Engine (Wasm engine switcher, Multi-PV candidates, out-of-book alert, thinking time)
 *   [2] Move History (full KIF-style move records with out-of-book markers)
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  EngineId,
  EngineProfile,
  getAllEngineProfiles,
  resolveEngineDisplayName,
  subscribeEngineRegistryChange,
} from '../../engine/engineConfig';
import { useSparringMatch } from '../../hooks/useSparringMatch';
import { MatchRecord } from '../../types/match';
import { Color, MoveEvaluation, ShogiMove } from '../../types/shogi';
import { MergedKifuTree } from '../../types/tree';
import {
  convertMatchToGameMergeInput,
  loadMatchRecords,
  updateMatchRecord,
} from '../../utils/matchHistoryStorage';
import { formatShogiMove, parseUsiMove } from '../../utils/shogiRules';
import { ShogiBoard } from '../../utils/shogiBoard';
import { EvaluationChart } from '../eval/EvaluationChart';
import { buildEvalChartPointsFromMoves } from '../../utils/evalChartHelper';
import { GameMergeInput } from '../../utils/treeMerger';
import { ShogiBoardView } from '../board/ShogiBoardView';
import { getPieceSpriteCoords } from '../board/pieceSprites';
import { useBoardAppearance } from '../../hooks/useBoardAppearance';
import { MatchHistoryDashboard } from './MatchHistoryDashboard';
import { PostMatchFeedbackModal } from './PostMatchFeedbackModal';
import { WeaknessPosition } from '../../types/weakness';
import { detectWeaknessPositions } from '../../utils/weaknessDetector';

export interface SparringArenaPanelProps {
  openingTree?: MergedKifuTree | null;
  initialMoves?: ShogiMove[];
  initialSide?: Color;
  onMergeSparringGame?: (gameInput: GameMergeInput) => void;
  onExitToTree?: () => void;
  onStartWeaknessDrill?: (position: WeaknessPosition) => void;
  trees?: Record<string, MergedKifuTree>;
  className?: string;
}

export const SparringArenaPanel: React.FC<SparringArenaPanelProps> = ({
  openingTree,
  initialMoves,
  initialSide,
  onMergeSparringGame,
  onExitToTree,
  onStartWeaknessDrill,
  trees,
  className = '',
}) => {
  const { t } = useTranslation();
  const { pieceSpriteHref } = useBoardAppearance();
  const [isFlipped, setIsFlipped] = useState(false);
  const [matchRecords, setMatchRecords] = useState<MatchRecord[]>(() => loadMatchRecords());
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState<MatchRecord | null>(null);

  // Sub-tab switcher: 'analysis' vs 'chart' vs 'history'
  const [activePanelTab, setActivePanelTab] = useState<'analysis' | 'chart' | 'history'>('analysis');

  // Review mode state (null when showing active/latest position, or ply number 0..totalPly)
  const [reviewPly, setReviewPly] = useState<number | null>(null);

  // Hidden by default best move visibility toggle
  const [isBestMoveRevealed, setIsBestMoveRevealed] = useState<boolean>(false);

  // On-demand review evaluations map (keyed by ply)
  const [reviewAnalysisMap, setReviewAnalysisMap] = useState<Record<number, MoveEvaluation>>({});
  const [isAnalyzingReviewPosition, setIsAnalyzingReviewPosition] = useState(false);

  // Mate search state
  const [isMateSearching, setIsMateSearching] = useState(false);
  const [mateSearchResult, setMateSearchResult] = useState<{
    found: boolean;
    matePly: number;
    pv: string[];
  } | null>(null);
  const [verifiedLineToast, setVerifiedLineToast] = useState(false);

  const [availableEngines, setAvailableEngines] = useState<EngineProfile[]>(() =>
    getAllEngineProfiles()
  );

  useEffect(() => {
    setAvailableEngines(getAllEngineProfiles());
    return subscribeEngineRegistryChange(() => {
      setAvailableEngines(getAllEngineProfiles());
    });
  }, []);

  // Ref array for auto-scrolling move rows in history tab
  const moveRowRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const sparring = useSparringMatch({
    initialTree: openingTree,
    defaultSearchTimeMs: 1000,
  });

  // Auto-start match from custom initial moves if provided (e.g. launched from Study position)
  useEffect(() => {
    if (initialMoves && initialMoves.length > 0) {
      const targetSide = initialSide ?? (initialMoves.length % 2 === 0 ? 'b' : 'w');
      sparring.startMatch({
        playerColor: targetSide,
        openingTree,
        initialMoves,
      });
      setIsFlipped(targetSide === 'w');
    }
  }, [initialMoves, initialSide, openingTree]);

  // Reset review ply when a new move is made in an active game
  useEffect(() => {
    setReviewPly(null);
    setIsBestMoveRevealed(false);
  }, [sparring.moveHistory.length]);

  // Hide best move when jumping to another review ply
  useEffect(() => {
    setIsBestMoveRevealed(false);
  }, [reviewPly]);

  // When a match finishes, trigger feedback modal
  useEffect(() => {
    if (sparring.completedRecord) {
      setActiveRecord(sparring.completedRecord);
      setIsFeedbackOpen(true);
      setMatchRecords(loadMatchRecords());
    }
  }, [sparring.completedRecord]);

  const handleMergeToTree = (rec: MatchRecord) => {
    const mergeInput = convertMatchToGameMergeInput(rec);
    if (onMergeSparringGame) {
      onMergeSparringGame(mergeInput);
    }
    const updated = updateMatchRecord(rec.id, { isMergedIntoTree: true });
    setMatchRecords(updated);
    if (activeRecord && activeRecord.id === rec.id) {
      setActiveRecord({ ...activeRecord, isMergedIntoTree: true });
    }
  };

  const isPlayerSente = sparring.playerColor === 'b';
  const isGameActive =
    sparring.matchState === 'player_turn' || sparring.matchState === 'ai_thinking';

  // Names without leading symbols
  const senteName = isPlayerSente ? `${t('board.sente')} (You)` : `${t('board.sente')} (AI)`;
  const goteName = !isPlayerSente ? `${t('board.gote')} (You)` : `${t('board.gote')} (AI)`;

  // Reconstruct board and moves at review position
  const totalMoves = sparring.moveHistory.length;
  const isReviewing = reviewPly !== null && reviewPly < totalMoves;
  const displayPly = isReviewing ? reviewPly : totalMoves;

  const { displayBoard, displayMove } = useMemo(() => {
    if (!isReviewing) {
      return {
        displayBoard: sparring.board,
        displayMove: sparring.currentMove,
      };
    }
    const b = new ShogiBoard();
    for (let i = 0; i < (reviewPly ?? 0); i++) {
      const m = sparring.moveHistory[i];
      if (m) b.applyMove(m);
    }
    const lastM = (reviewPly ?? 0) > 0 ? sparring.moveHistory[(reviewPly ?? 0) - 1] : undefined;
    return {
      displayBoard: b,
      displayMove: lastM,
    };
  }, [isReviewing, reviewPly, sparring.board, sparring.currentMove, sparring.moveHistory]);

  // Hand counts from display board
  const senteHand = useMemo(
    () => (typeof displayBoard?.getHand === 'function' ? displayBoard.getHand('b') : {}),
    [displayBoard]
  );
  const goteHand = useMemo(
    () => (typeof displayBoard?.getHand === 'function' ? displayBoard.getHand('w') : {}),
    [displayBoard]
  );

  // Auto-scroll move history row when displayPly changes or tab switches to history
  useEffect(() => {
    if (activePanelTab === 'history' && displayPly > 0) {
      const activeEl = moveRowRefs.current[displayPly - 1];
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [activePanelTab, displayPly]);

  // Active evaluation: when reviewing, check on-demand review analysis, then move-recorded eval; otherwise live eval
  const activeEvaluation = useMemo(() => {
    if (!isReviewing) {
      if (sparring.evaluation) return sparring.evaluation;
      // Fallback to the latest move's recorded evaluation if live eval hasn't arrived yet
      if (sparring.moveHistory.length > 0) {
        const lastM = sparring.moveHistory[sparring.moveHistory.length - 1];
        if (lastM?.evaluation) return lastM.evaluation;
      }
      return null;
    }
    if ((reviewPly ?? 0) === 0) {
      return null;
    }
    const targetPly = reviewPly ?? 0;
    if (reviewAnalysisMap[targetPly]) {
      return reviewAnalysisMap[targetPly];
    }
    const targetMove = sparring.moveHistory[targetPly - 1];
    return targetMove?.evaluation ?? null;
  }, [isReviewing, reviewPly, reviewAnalysisMap, sparring.evaluation, sparring.moveHistory]);

  // Handler to analyze the currently reviewed position on demand
  const handleAnalyzeReviewPosition = async () => {
    if (isAnalyzingReviewPosition || sparring.isSearching) return;
    const currentReview = reviewPly ?? totalMoves;
    setIsAnalyzingReviewPosition(true);

    try {
      // Gather moves up to the reviewed ply
      const sfenMoves = sparring.moveHistory
        .slice(0, currentReview)
        .map((m) => m.sfenMove);

      const result = await sparring.searchPosition(undefined, sfenMoves, {
        movetime: sparring.searchTimeMs,
      });

      if (result) {
        const evaluationObj: MoveEvaluation = result.evaluation ?? {
          scoreCp: sparring.engineInfo?.scoreCp ?? 0,
          isMate: sparring.engineInfo?.isMate,
          matePly: sparring.engineInfo?.matePly,
          depth: sparring.engineInfo?.depth ?? 1,
          bestMove: result.bestMove || sparring.engineInfo?.bestMove || 'none',
          pv: sparring.engineInfo?.pv,
          evaluatedAt: new Date().toISOString(),
        };
        setReviewAnalysisMap((prev) => ({
          ...prev,
          [currentReview]: evaluationObj,
        }));
      }
    } catch {
      // Ignore search cancel/error
    } finally {
      setIsAnalyzingReviewPosition(false);
    }
  };

  // Issue #28: Auto-trigger background analysis when stepping through unanalyzed review plies
  useEffect(() => {
    if (!isReviewing && isGameActive) return;
    if (totalMoves === 0) return;
    const currentTarget = reviewPly ?? totalMoves;
    if (currentTarget === 0) return;

    const hasEvaluation =
      reviewAnalysisMap[currentTarget] ||
      (currentTarget <= sparring.moveHistory.length && sparring.moveHistory[currentTarget - 1]?.evaluation);

    if (!hasEvaluation && !isAnalyzingReviewPosition && !sparring.isSearching) {
      handleAnalyzeReviewPosition();
    }
  }, [
    reviewPly,
    isReviewing,
    isGameActive,
    totalMoves,
    reviewAnalysisMap,
    sparring.moveHistory,
    isAnalyzingReviewPosition,
    sparring.isSearching,
  ]);

  // Handler for Mate Search (deep search prioritizing mate sequences)
  const handleMateSearch = async () => {
    if (isMateSearching || sparring.isSearching) return;
    setIsMateSearching(true);
    setMateSearchResult(null);
    const currentReview = reviewPly ?? totalMoves;

    try {
      const sfenMoves = sparring.moveHistory
        .slice(0, currentReview)
        .map((m) => m.sfenMove);

      const result = await sparring.searchPosition(undefined, sfenMoves, {
        movetime: 2500, // Deep search for mate detection
      });

      if (result) {
        const evalObj = result.evaluation;
        if (evalObj && evalObj.isMate) {
          setMateSearchResult({
            found: true,
            matePly: evalObj.matePly ?? 1,
            pv: evalObj.pv ?? (result.bestMove ? [result.bestMove] : []),
          });
        } else {
          setMateSearchResult({
            found: false,
            matePly: 0,
            pv: result.bestMove ? [result.bestMove] : [],
          });
        }
      }
    } catch {
      setMateSearchResult({ found: false, matePly: 0, pv: [] });
    } finally {
      setIsMateSearching(false);
    }
  };

  // Handler to play/step the AI best move or mate move directly onto the sparring board
  const handleStepBestMove = () => {
    const candidateUsi =
      (mateSearchResult?.pv && mateSearchResult.pv[0]) ||
      activeEvaluation?.bestMove;

    if (!candidateUsi || candidateUsi === 'none' || candidateUsi === 'resign') return;

    // Use parseUsiMove on current display board
    const currentTurn = displayBoard.getTurn();
    const nextPly = displayPly + 1;
    const parsed = parseUsiMove(candidateUsi, displayBoard, nextPly, currentTurn, displayMove?.to);

    if (parsed) {
      sparring.stepMove(parsed, isReviewing ? displayPly : undefined);
      setReviewPly(null);
      setMateSearchResult(null);
    }
  };

  // Issue #29: Merge AI verified line or mate sequence into opening tree as a new variation branch
  const handleMergeVerifiedLineToTree = () => {
    if (!onMergeSparringGame) return;
    const pvMoves = mateSearchResult?.pv || activeEvaluation?.pv;
    if (!pvMoves || pvMoves.length === 0) return;

    const currentBoard = displayBoard.clone();
    let prevTo = displayMove?.to;
    const verifiedMoves: ShogiMove[] = [...sparring.moveHistory.slice(0, displayPly)];

    for (let i = 0; i < pvMoves.length; i++) {
      const usi = pvMoves[i];
      if (!usi) continue;
      const turn = currentBoard.getTurn();
      const ply = displayPly + i + 1;
      const parsed = parseUsiMove(usi, currentBoard, ply, turn, prevTo);
      if (parsed) {
        currentBoard.applyMove(parsed);
        verifiedMoves.push(parsed);
        prevTo = parsed.to;
      }
    }

    const syntheticRecord: MatchRecord = {
      id: `verified-line-${Date.now()}`,
      userId: 'local-user',
      openingId: openingTree?.openingId || 'other',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      userColor: sparring.playerColor,
      startPly: 0,
      startSfen: 'startpos',
      moves: verifiedMoves,
      result: sparring.completedRecord?.result ?? 'aborted',
      aiEngine: sparring.completedRecord?.aiEngine ?? 'Fairy-Stockfish 14 Wasm',
      aiDepth: 14,
      isMergedIntoTree: true,
    };

    const mergeInput = convertMatchToGameMergeInput(syntheticRecord);
    onMergeSparringGame(mergeInput);
    setVerifiedLineToast(true);
    setTimeout(() => setVerifiedLineToast(false), 3000);
  };

  // Build evaluation chart points merging recorded move evaluations and on-demand review evaluations
  const chartPoints = useMemo(() => {
    const movesWithReviewEvals = sparring.moveHistory.map((m) => {
      if (reviewAnalysisMap[m.ply]) {
        return {
          ...m,
          evaluation: reviewAnalysisMap[m.ply],
        };
      }
      return m;
    });
    return buildEvalChartPointsFromMoves(movesWithReviewEvals);
  }, [sparring.moveHistory, reviewAnalysisMap]);

  // Evaluation score and win rates
  const evalCp = activeEvaluation?.scoreCp ?? 0;
  const senteWinPct = useMemo(() => {
    if (!activeEvaluation) return 50;
    // Standard logistic win rate conversion
    const pct = Math.round(100 / (1 + Math.exp(-evalCp / 600)));
    return Math.min(99, Math.max(1, pct));
  }, [activeEvaluation, evalCp]);
  const goteWinPct = 100 - senteWinPct;

  // Evaluation summary text
  const evalScoreText = useMemo(() => {
    if (!activeEvaluation) return t('mock.broadcast.eval_unavailable');
    if (Math.abs(evalCp) < 50) return `${t('mock.broadcast.eval_even')} (0)`;
    if (evalCp > 0) return `${t('mock.broadcast.eval_sente_advantage')} (+${evalCp})`;
    return `${t('mock.broadcast.eval_gote_advantage')} (${evalCp})`;
  }, [activeEvaluation, evalCp, t]);

  // Format best move string into standard Japanese notation (e.g. "△２四歩" or "▲７六歩")
  const bestMoveJapanese = useMemo(() => {
    const rawMove = activeEvaluation?.bestMove || activeEvaluation?.pv?.[0];
    if (!rawMove || rawMove === 'none' || rawMove === 'resign') return '-';

    const turnColor = typeof displayBoard?.getTurn === 'function' ? displayBoard.getTurn() : 'b';
    const parsed = parseUsiMove(rawMove, displayBoard, displayPly + 1, turnColor, displayMove?.to);
    if (!parsed) return rawMove;

    return formatShogiMove(parsed, displayMove?.to);
  }, [activeEvaluation, displayBoard, displayMove, displayPly]);

  // Current turn indicator (reflects displayed ply if reviewing)
  const currentTurn: Color =
    typeof displayBoard?.getTurn === 'function' ? displayBoard.getTurn() : 'b';
  const isSenteTurn = currentTurn === 'b';

  // Render authentic interactive hand pieces
  const renderHandPieces = (
    color: Color,
    hand: Record<string, number>,
    isMobileHorizontal = false
  ) => {
    const pieces = ['R', 'B', 'G', 'S', 'N', 'L', 'P'].filter((p) => (hand[p] ?? 0) > 0);
    const isThisColorTurn = currentTurn === color;
    const isPlayerTurnNow =
      !isReviewing && sparring.matchState === 'player_turn' && sparring.playerColor === color;

    if (pieces.length === 0) {
      return <span className="text-[10px] text-slate-500 font-mono py-1">-</span>;
    }

    return (
      <div
        className={`flex ${
          isMobileHorizontal ? 'flex-row flex-wrap gap-1' : 'flex-col gap-1.5 w-full items-center'
        }`}
      >
        {pieces.map((pKey) => {
          const count = hand[pKey] ?? 0;
          const isSelected = isPlayerTurnNow && sparring.selectedHandPiece === pKey;
          const canSelect = isPlayerTurnNow && isThisColorTurn;
          const { col, row } = getPieceSpriteCoords(pKey, false);

          return (
            <button
              type="button"
              key={pKey}
              disabled={!canSelect}
              onClick={() => canSelect && sparring.handleHandPieceSelect(pKey)}
              className={`rounded p-0.5 select-none transition-transform inline-flex items-center justify-center relative ${
                isMobileHorizontal ? 'w-[28px] h-[30px]' : 'w-[34px] h-[36px]'
              } ${
                canSelect
                  ? 'cursor-pointer hover:scale-105 active:scale-95'
                  : 'cursor-default opacity-90'
              } ${
                isSelected
                  ? 'ring-2 ring-emerald-400 scale-110 shadow-lg shadow-emerald-500/40'
                  : ''
              }`}
            >
              <svg
                className="w-full h-full drop-shadow"
                viewBox={`${col * 35} ${row * 37} 35 37`}
              >
                <image
                  href={pieceSpriteHref}
                  x="0"
                  y="0"
                  width="280"
                  height="148"
                />
              </svg>
              {count > 1 && (
                <span className="absolute -top-1 -right-1 bg-rose-600 text-white font-mono text-[9px] min-w-[15px] h-[15px] px-0.5 rounded-full flex items-center justify-center font-bold ring-1 ring-white/60 shadow">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`flex flex-col gap-2 w-full max-w-[1240px] mx-auto select-none font-sans text-slate-100 ${className}`}>
      {/* 1. TOP HEADER: Dual-Color Win Rate Bar & Sparring Status Banner */}
      <div className="rounded-lg border border-slate-700 bg-slate-950/90 shadow-md overflow-hidden backdrop-blur-md">
        <div className="flex items-center justify-between px-3 py-1 border-b border-slate-800 bg-slate-900/60 text-xs">
          <div className="flex items-center gap-2 truncate">
            {/* Live Status Pulse */}
            <span className="flex h-2 w-2 relative">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  sparring.matchState === 'ai_thinking'
                    ? 'bg-sky-400'
                    : isGameActive
                    ? 'bg-emerald-400'
                    : 'bg-rose-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  sparring.matchState === 'ai_thinking'
                    ? 'bg-sky-500'
                    : isGameActive
                    ? 'bg-emerald-500'
                    : 'bg-rose-500'
                }`}
              />
            </span>
            <span
              className={`text-[10px] font-bold tracking-wider uppercase ${
                sparring.matchState === 'ai_thinking'
                  ? 'text-sky-400'
                  : isGameActive
                  ? 'text-emerald-400'
                  : 'text-slate-400'
              }`}
            >
              {sparring.matchState === 'ai_thinking'
                ? t('sparring.status_ai_thinking')
                : isGameActive
                ? 'LIVE SPARRING'
                : t('sparring.status_finished')}
            </span>

            {/* Opening / Tree Title */}
            <span className="font-semibold text-slate-300 truncate">
              {openingTree?.openingName || t('sparring.title')}
            </span>

            {/* Ply Counter / Review Mode Badge */}
            <span className="text-slate-500 font-mono text-[11px]">
              第{displayPly}手目
            </span>
            {isReviewing && (
              <span className="rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-bold px-1.5 py-0.2">
                {t('sparring.review_mode')}
              </span>
            )}
          </div>

          {/* Quick Actions Bar */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isReviewing && (
              <button
                type="button"
                onClick={() => setReviewPly(null)}
                className="text-[11px] px-2 py-0.5 rounded border border-indigo-500/60 bg-indigo-950/60 text-indigo-300 font-bold hover:bg-indigo-900 transition flex items-center gap-1"
              >
                <span>⏩</span>
                <span>{t('sparring.return_to_latest')}</span>
              </button>
            )}

            {activeRecord && (
              <button
                type="button"
                onClick={() => setIsFeedbackOpen(true)}
                className="text-[11px] px-2 py-0.5 rounded border border-amber-500/50 bg-amber-950/40 text-amber-300 font-bold hover:bg-amber-900/50 transition flex items-center gap-1"
              >
                <span>📊</span>
                <span>{t('sparring.match_summary')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsHistoryOpen(true)}
              className="text-[11px] px-2 py-0.5 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1"
            >
              <span>📜</span>
              <span>{t('sparring.view_history')}</span>
              {matchRecords.length > 0 && (
                <span className="font-mono text-[9px] bg-slate-700 px-1 rounded-full text-slate-300">
                  {matchRecords.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsFlipped((prev) => !prev)}
              className="text-[11px] px-2 py-0.5 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1"
              title={t('board.flip')}
            >
              <span>⟲</span>
              <span>{t('board.flip')}</span>
            </button>
          </div>
        </div>

        {/* Win Rate Split Gauge Bar */}
        <div className="relative h-7 w-full flex items-center bg-slate-900 text-xs">
          {/* Gote (White) Side */}
          <div
            className="h-full bg-gradient-to-r from-sky-900 via-sky-700 to-sky-600 flex items-center px-3 transition-all duration-500 justify-start"
            style={{ width: `${goteWinPct}%` }}
          >
            <div className="flex items-center gap-1.5 text-white drop-shadow font-bold text-[11px] truncate">
              <span className="text-sky-200 truncate">△ {goteName}</span>
              <span className="font-mono">{goteWinPct}%</span>
            </div>
          </div>

          {/* Sente (Black) Side */}
          <div
            className="h-full bg-gradient-to-l from-amber-700 via-amber-600 to-amber-500 flex items-center px-3 transition-all duration-500 justify-end"
            style={{ width: `${senteWinPct}%` }}
          >
            <div className="flex items-center gap-1.5 text-white drop-shadow font-bold text-[11px] truncate">
              <span className="font-mono">{senteWinPct}%</span>
              <span className="text-amber-200 truncate">▲ {senteName}</span>
            </div>
          </div>

          {/* Central Split Indicator */}
          <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-white/40 -translate-x-1/2 shadow-lg" />
        </div>
      </div>

      {/* 2. MAIN BATTLE ARENA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-start">
        {/* LEFT COLUMN: Shogi Board (PC: flanked vertical stands, Mobile: stacked horizontal stands) */}
        <div className="lg:col-span-7 xl:col-span-7 rounded-xl border border-slate-800 bg-slate-950/80 p-2.5 shadow-xl flex flex-col items-center relative">
          {/* Promotion Confirmation Prompt Modal */}
          {sparring.pendingPromotion && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/80 rounded-xl backdrop-blur-sm p-4">
              <div className="rounded-xl border border-amber-500/70 bg-slate-900 p-5 shadow-2xl max-w-xs w-full text-center">
                <span className="text-3xl mb-1 block">✨</span>
                <h3 className="text-sm font-bold text-slate-100 mb-1">
                  {t('sparring.promote_prompt')}
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  相手陣（敵陣）に進入しました
                </p>
                <div className="flex gap-2.5 justify-center">
                  <button
                    type="button"
                    onClick={() => sparring.confirmPromotion(true)}
                    className="flex-1 rounded-lg bg-gradient-to-r from-red-600 to-amber-600 px-4 py-2 text-xs font-bold text-white shadow-lg hover:brightness-110 active:scale-95 transition"
                  >
                    {t('sparring.promote_yes')}
                  </button>
                  <button
                    type="button"
                    onClick={() => sparring.confirmPromotion(false)}
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 active:scale-95 transition"
                  >
                    {t('sparring.promote_no')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* MOBILE ONLY: Top Horizontal Komadai (Gote if normal, Sente if flipped) */}
          <div className="w-full lg:hidden flex items-center justify-between px-2.5 py-1 mb-1.5 rounded-lg border border-slate-800 bg-slate-900/90">
            <span className="text-xs font-bold text-sky-300">
              {isFlipped ? `▲ ${senteName}` : `△ ${goteName}`}
            </span>
            <div className="flex items-center gap-1">
              {renderHandPieces(
                isFlipped ? 'b' : 'w',
                isFlipped ? senteHand : goteHand,
                true
              )}
            </div>
          </div>

          {/* Board Center Container */}
          <div className="flex flex-row items-center justify-center gap-2 w-full">
            {/* DESKTOP ONLY: Left Vertical Stand (Gote if normal, Sente if flipped) */}
            <div className="hidden lg:flex w-14 min-h-[340px] flex-col items-center py-2 px-1 rounded-lg border border-slate-800 bg-slate-900/90 shadow-md">
              <div className="text-[11px] font-bold text-sky-300 writing-vertical mb-2 tracking-wider">
                {isFlipped ? `▲ ${senteName}` : `△ ${goteName}`}
              </div>
              {renderHandPieces(isFlipped ? 'b' : 'w', isFlipped ? senteHand : goteHand)}
            </div>

            {/* Interactive SVG Shogi Board */}
            <div className="flex-1 w-full max-w-[360px] sm:max-w-[400px] flex items-center justify-center bg-slate-950 rounded-lg overflow-hidden border border-amber-950/40 shadow-inner p-1">
              <ShogiBoardView
                board={displayBoard}
                isFlipped={isFlipped}
                lastMove={displayMove}
                selectedSquare={!isReviewing ? sparring.selectedSquare : null}
                targetSquares={!isReviewing ? sparring.validTargetSquares : []}
                onSquareClick={!isReviewing ? sparring.handleSquareClick : undefined}
                className="w-full h-auto"
              />
            </div>

            {/* DESKTOP ONLY: Right Vertical Stand (Sente if normal, Gote if flipped) */}
            <div className="hidden lg:flex w-14 min-h-[340px] flex-col items-center py-2 px-1 rounded-lg border border-slate-800 bg-slate-900/90 shadow-md">
              <div className="text-[11px] font-bold text-amber-300 writing-vertical mb-2 tracking-wider">
                {isFlipped ? `△ ${goteName}` : `▲ ${senteName}`}
              </div>
              {renderHandPieces(isFlipped ? 'w' : 'b', isFlipped ? goteHand : senteHand)}
            </div>
          </div>

          {/* MOBILE ONLY: Bottom Horizontal Komadai (Sente if normal, Gote if flipped) */}
          <div className="w-full lg:hidden flex items-center justify-between px-2.5 py-1 mt-1.5 rounded-lg border border-slate-800 bg-slate-900/90">
            <span className="text-xs font-bold text-amber-300">
              {isFlipped ? `△ ${goteName}` : `▲ ${senteName}`}
            </span>
            <div className="flex items-center gap-1">
              {renderHandPieces(
                isFlipped ? 'w' : 'b',
                isFlipped ? goteHand : senteHand,
                true
              )}
            </div>
          </div>

          {/* Board Navigation Stepper & Sparring Control Bar */}
          <div className="w-full mt-2 pt-2 border-t border-slate-800/80 flex flex-col gap-2">
            {/* Step Navigation Bar (enabled when there are moves) */}
            {totalMoves > 0 && (
              <div className="flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setReviewPly(0)}
                    disabled={displayPly === 0}
                    className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30 text-slate-300 font-mono"
                    title="First move"
                  >
                    |◀
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewPly(Math.max(0, displayPly - 1))}
                    disabled={displayPly === 0}
                    className="px-2.5 py-0.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30 text-slate-300 font-mono"
                    title="Previous move"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = displayPly + 1;
                      setReviewPly(next >= totalMoves ? null : next);
                    }}
                    disabled={displayPly >= totalMoves}
                    className="px-2.5 py-0.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30 text-slate-300 font-mono"
                    title="Next move"
                  >
                    ▶
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewPly(null)}
                    disabled={displayPly >= totalMoves}
                    className="px-2.5 py-0.5 rounded bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-30 text-slate-300 font-mono"
                    title="Latest move"
                  >
                    ▶|
                  </button>
                </div>

                <div className="flex items-center gap-2 font-mono text-xs">
                  {sparring.branches.length > 1 && (
                    <span className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      🔀 {sparring.branches.find((b) => b.id === sparring.currentBranchId)?.name ?? t('sparring.branches_label')}
                    </span>
                  )}
                  {isReviewing && (
                    <button
                      type="button"
                      onClick={() => setReviewPly(null)}
                      className="text-[10px] text-amber-400 hover:underline font-sans"
                    >
                      ⏩ {t('sparring.return_to_latest')}
                    </button>
                  )}
                  <span className="text-slate-300">
                    <span className="text-amber-400 font-bold">{displayPly}</span> / {totalMoves} 手
                  </span>
                </div>
              </div>
            )}

            {/* Match Controls (New Game vs Active Game Controls) */}
            {!isGameActive ? (
              <div className="flex flex-col gap-1.5">
                <div className="text-[11px] font-semibold text-slate-300 text-center">
                  {sparring.winner
                    ? sparring.winner === 'player'
                      ? sparring.finishReason === 'checkmate'
                        ? `🏆 ${t('sparring.winner_player_checkmate')}`
                        : `🏆 ${t('sparring.winner_player_resign')}`
                      : sparring.finishReason === 'checkmate'
                      ? `🤖 ${t('sparring.winner_ai_checkmate')}`
                      : `🤖 ${t('sparring.winner_ai_resign')}`
                    : t('sparring.subtitle')}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReviewPly(null);
                      sparring.startMatch({ playerColor: 'b' });
                    }}
                    className="flex-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold py-1.5 px-3 text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <span>▲</span>
                    <span>{t('sparring.play_as_sente')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReviewPly(null);
                      sparring.startMatch({ playerColor: 'w' });
                    }}
                    className="flex-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold py-1.5 px-3 text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <span>△</span>
                    <span>{t('sparring.play_as_gote')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-1.5 text-xs">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={sparring.undoMove}
                    disabled={sparring.moveHistory.length === 0}
                    className="rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 px-2.5 py-1 text-slate-200 font-semibold transition"
                  >
                    ↩ {t('sparring.undo')}
                  </button>
                  <button
                    type="button"
                    onClick={sparring.resignMatch}
                    className="rounded bg-rose-600/90 hover:bg-rose-500 text-white px-2.5 py-1 font-semibold shadow transition"
                  >
                    🏳 {t('sparring.resign')}
                  </button>
                  <button
                    type="button"
                    onClick={sparring.resetMatch}
                    className="rounded border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-2 py-1 transition"
                  >
                    🔄 {t('sparring.reset')}
                  </button>
                </div>

                <div className="font-mono text-slate-400 text-[11px]">
                  {sparring.matchState === 'player_turn'
                    ? t('sparring.status_player_turn')
                    : t('sparring.status_ai_thinking')}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Broadcast Telemetry Dashboard with Switchable Tabs */}
        <div className="lg:col-span-5 xl:col-span-5 flex flex-col gap-2">
          {/* Sub-Tab Navigation (Analysis & AI Engine vs Evaluation Chart vs Move History) */}
          <div className="flex items-center rounded-lg bg-slate-900 p-0.5 border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setActivePanelTab('analysis')}
              className={`flex-1 py-1 px-2 rounded-md font-bold transition flex items-center justify-center gap-1 ${
                activePanelTab === 'analysis'
                  ? 'bg-amber-600 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>📊</span>
              <span className="truncate">{t('mock.broadcast.tab_telemetry')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePanelTab('chart')}
              className={`flex-1 py-1 px-2 rounded-md font-bold transition flex items-center justify-center gap-1 ${
                activePanelTab === 'chart'
                  ? 'bg-amber-600 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>📈</span>
              <span className="truncate">{t('mock.broadcast.tab_chart')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePanelTab('history')}
              className={`flex-1 py-1 px-2 rounded-md font-bold transition flex items-center justify-center gap-1 ${
                activePanelTab === 'history'
                  ? 'bg-amber-600 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>📜</span>
              <span className="truncate">{t('mock.broadcast.tab_history')}</span>
              <span className="font-mono text-[10px] opacity-75">
                ({sparring.moveHistory.length})
              </span>
            </button>
          </div>

          {/* VIEW A: Telemetry & Engine Analysis */}
          {activePanelTab === 'analysis' && (
            <>
              {/* 1. Out-of-Book / Repertoire Status Card */}
              <div
                className={`rounded-xl border p-2.5 transition-all shadow-md ${
                  sparring.isOutOfBook
                    ? 'border-amber-500/60 bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-slate-900 ring-1 ring-amber-500/30'
                    : 'border-emerald-500/40 bg-emerald-950/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{sparring.isOutOfBook ? '⚡' : '📖'}</span>
                    <span
                      className={`text-xs font-bold ${
                        sparring.isOutOfBook ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {sparring.isOutOfBook
                        ? t('sparring.out_of_book')
                        : t('sparring.in_book')}
                    </span>
                  </div>

                  <span className="text-[10px] text-slate-400 font-mono">
                    {sparring.isOutOfBook && sparring.outOfBookPly
                      ? `${sparring.outOfBookPly}手目離脱`
                      : 'ツリー合致'}
                  </span>
                </div>
              </div>

              {/* 2. Evaluation Score Spotlight */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 shadow-md flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold text-white">
                    {evalScoreText}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {sparring.hintsViewedCount > 0 && (
                      <span className="text-[10px] text-amber-400 font-mono bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-500/30">
                        {t('sparring.hint_viewed_count', { count: sparring.hintsViewedCount })}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      {activeEvaluation?.depth
                        ? `depth=${activeEvaluation.depth}`
                        : t('mock.broadcast.eval_unavailable_sub')}
                    </span>
                  </div>
                </div>

                {/* Best Move Spotlight (Hidden by default, reveal on demand with count tracking) */}
                <div className="rounded-lg bg-gradient-to-r from-amber-950/30 via-slate-900 to-slate-900 p-2 border border-amber-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-bold">
                      {t('mock.broadcast.best_move_label')}
                    </span>

                    {(!isGameActive || isReviewing || isBestMoveRevealed) ? (
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-amber-300 font-mono">
                          {bestMoveJapanese}
                        </span>
                        {isGameActive && !isReviewing && (
                          <button
                            type="button"
                            onClick={() => setIsBestMoveRevealed(false)}
                            className="text-[10px] text-slate-400 hover:text-slate-200 border border-slate-700 rounded px-1.5 py-0.5 bg-slate-800 transition"
                          >
                            {t('sparring.hide_best_move')}
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setIsBestMoveRevealed(true);
                          sparring.recordHintViewed();
                        }}
                        className="rounded px-2.5 py-1 text-xs font-bold bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 transition flex items-center gap-1"
                      >
                        <span>👁️</span>
                        <span>{t('sparring.reveal_best_move')}</span>
                      </button>
                    )}
                  </div>

                  <span className="text-[11px] text-slate-400 font-mono">
                    {sparring.engineInfo?.nps
                      ? `${Math.round(sparring.engineInfo.nps / 1000)} kN/s`
                      : ''}
                  </span>
                </div>

                {/* On-demand AI Position Analysis, Mate Check & Step Through */}
                {(isReviewing || !isGameActive) && (
                  <div className="pt-2 border-t border-slate-800/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">
                        {t('sparring.ply_display', { ply: displayPly, kif: displayMove ? formatShogiMove(displayMove) : t('board.first_ply') })}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleAnalyzeReviewPosition}
                          disabled={isAnalyzingReviewPosition || sparring.isSearching}
                          className="px-2.5 py-1 rounded text-xs font-semibold bg-sky-950 hover:bg-sky-900 text-sky-200 border border-sky-500/40 transition disabled:opacity-40 flex items-center gap-1 active:scale-95 shadow-sm"
                        >
                          <span>🎯</span>
                          <span>
                            {isAnalyzingReviewPosition
                              ? t('analysis.analyzing_single')
                              : t('analysis.start_single_btn')}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={handleMateSearch}
                          disabled={isMateSearching || sparring.isSearching}
                          className="px-2.5 py-1 rounded text-xs font-semibold bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-500/40 transition disabled:opacity-40 flex items-center gap-1 active:scale-95 shadow-sm"
                          title={t('sparring.mate_check_btn')}
                        >
                          <span>👑</span>
                          <span>
                            {isMateSearching
                              ? t('sparring.mate_checking')
                              : t('sparring.mate_check_btn')}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Mate Search Outcome Banner */}
                    {mateSearchResult && (
                      <div
                        className={`rounded-lg p-2 text-xs flex items-center justify-between border ${
                          mateSearchResult.found
                            ? 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold">
                          <span>{mateSearchResult.found ? '🔥' : 'ℹ️'}</span>
                          <span>
                            {mateSearchResult.found
                              ? t('sparring.mate_found', { ply: mateSearchResult.matePly })
                              : t('sparring.mate_not_found')}
                          </span>
                        </div>
                        {mateSearchResult.pv.length > 0 && (
                          <button
                            type="button"
                            onClick={handleStepBestMove}
                            className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] transition shadow"
                          >
                            {t('sparring.step_mate_sequence_btn')}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Step Best Move Button when best move is available */}
                    {activeEvaluation?.bestMove && activeEvaluation.bestMove !== 'none' && !mateSearchResult && (
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={handleStepBestMove}
                          className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition flex items-center gap-1"
                        >
                          <span>▶</span>
                          <span>{t('sparring.step_best_move_btn')}</span>
                        </button>
                      </div>
                    )}

                    {/* Merge AI Verified Line to Tree (Issue #29) */}
                    {onMergeSparringGame && (mateSearchResult?.pv?.length || activeEvaluation?.pv?.length) && (
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                        <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                          <span>🌿</span>
                          <span>{t('sparring.resignation_analysis_title')}</span>
                        </span>
                        <button
                          type="button"
                          onClick={handleMergeVerifiedLineToTree}
                          className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1 shadow active:scale-95"
                        >
                          <span>{t('sparring.merge_verified_line_btn')}</span>
                        </button>
                      </div>
                    )}

                    {verifiedLineToast && (
                      <div className="rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 p-2 text-xs font-bold text-center animate-in fade-in">
                        ✓ {t('sparring.verified_line_merged_toast')}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 3. Clean Player Turn Badges (Single symbol, no redundant 待機中) */}
              <div className="grid grid-cols-2 gap-2">
                {/* Gote Box */}
                <div
                  className={`rounded-lg border px-3 py-2 flex items-center justify-between transition-all ${
                    !isSenteTurn
                      ? 'border-sky-500 bg-gradient-to-r from-sky-950/70 to-slate-900 ring-1 ring-sky-500/40 shadow-sm'
                      : 'border-slate-800/90 bg-slate-950/50 opacity-60'
                  }`}
                >
                  <span className="text-xs font-bold text-sky-300 truncate">
                    △ {goteName}
                  </span>
                  {!isSenteTurn && (
                    <span className="rounded bg-sky-500 text-slate-950 text-[10px] font-black px-2 py-0.5 animate-pulse shrink-0">
                      {t('mock.broadcast.turn_badge')}
                    </span>
                  )}
                </div>

                {/* Sente Box */}
                <div
                  className={`rounded-lg border px-3 py-2 flex items-center justify-between transition-all ${
                    isSenteTurn
                      ? 'border-amber-500 bg-gradient-to-r from-amber-950/70 to-slate-900 ring-1 ring-amber-500/40 shadow-sm'
                      : 'border-slate-800/90 bg-slate-950/50 opacity-60'
                  }`}
                >
                  <span className="text-xs font-bold text-amber-300 truncate">
                    ▲ {senteName}
                  </span>
                  {isSenteTurn && (
                    <span className="rounded bg-amber-500 text-slate-950 text-[10px] font-black px-2 py-0.5 animate-pulse shrink-0">
                      {t('mock.broadcast.turn_badge')}
                    </span>
                  )}
                </div>
              </div>

              {/* 4. Engine Selector & Thinking Time Pill Box */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-2.5 shadow-md flex flex-col gap-2">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5 text-xs font-bold text-amber-400">
                  <span className="flex items-center gap-1">
                    <span>🤖</span>
                    <span>{t('engine.title')}</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {sparring.engineStatus.toUpperCase()}
                  </span>
                </div>

                {/* Engine Selector Dropdown */}
                <div className="flex items-center gap-2">
                  <select
                    value={sparring.activeEngineId}
                    onChange={(e) => sparring.switchEngine(e.target.value as EngineId)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 font-medium focus:outline-none focus:border-amber-500 transition cursor-pointer"
                  >
                    {availableEngines.map((prof: EngineProfile) => (
                      <option key={prof.id} value={prof.id} className="bg-slate-950 text-slate-200">
                        {prof.id === 'fairy-stockfish' ? '♟️' : '👑'} {resolveEngineDisplayName(prof, t)} ({prof.sizeFormatted})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Thinking Time Selection */}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-[11px] text-slate-400 font-semibold">
                    {t('sparring.thinking_time', {
                      seconds: (sparring.searchTimeMs / 1000).toFixed(1),
                    })}
                  </span>
                  <div className="flex items-center gap-1 font-mono text-[11px]">
                    {[
                      { label: '0.5s', ms: 500 },
                      { label: '1.0s', ms: 1000 },
                      { label: '2.0s', ms: 2000 },
                    ].map((opt) => (
                      <button
                        key={opt.ms}
                        type="button"
                        onClick={() => sparring.setSearchTimeMs(opt.ms)}
                        className={`px-2 py-0.5 rounded border transition ${
                          sparring.searchTimeMs === opt.ms
                            ? 'bg-amber-600 text-slate-950 font-bold border-amber-500'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* VIEW B: Evaluation Chart */}
          {activePanelTab === 'chart' && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 shadow-md flex flex-col gap-2 min-h-[360px]">
              <EvaluationChart
                evaluations={chartPoints}
                currentPly={displayPly}
                onSelectPly={(p) => setReviewPly(p === totalMoves ? null : p)}
                onAnalyzeCurrentPosition={handleAnalyzeReviewPosition}
                isAnalyzing={isAnalyzingReviewPosition || sparring.isSearching}
                height={200}
              />
            </div>
          )}

          {/* VIEW C: Move History (棋譜) */}
          {activePanelTab === 'history' && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-3 shadow-md flex flex-col gap-2 min-h-[360px]">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5 text-xs font-bold text-amber-400">
                <span className="flex items-center gap-1">
                  <span>📜</span>
                  <span>{t('sparring.move_history')}</span>
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {sparring.moveHistory.length} moves
                </span>
              </div>

              {/* Branch Selector if multiple branches exist */}
              {sparring.branches.length > 1 && (
                <div className="flex items-center gap-1.5 p-1.5 bg-slate-900/90 border border-slate-800 rounded-lg text-xs overflow-x-auto">
                  <span className="text-amber-400 font-bold shrink-0 flex items-center gap-1 pl-1 text-[11px]">
                    <span>🔀</span>
                    <span>{t('sparring.branches_label')}:</span>
                  </span>
                  {sparring.branches.map((b, bIdx) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        sparring.switchBranch(b.id);
                        setReviewPly(null);
                      }}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold shrink-0 transition flex items-center gap-1 ${
                        sparring.currentBranchId === b.id
                          ? 'bg-amber-600 text-slate-950 shadow-md ring-1 ring-amber-400'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      <span>{b.name || t('sparring.branch_tab', { index: bIdx + 1 })}</span>
                      <span className="text-[10px] opacity-75">({t('sparring.moves_count', { count: b.moves.length })})</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-1 max-h-[380px] overflow-y-auto space-y-1 pr-1 font-mono text-xs">
                {sparring.moveHistory.length === 0 ? (
                  <p className="text-slate-500 text-xs py-8 text-center font-sans">
                    {t('sparring.no_moves_yet')}
                  </p>
                ) : (
                  sparring.moveHistory.map((m, idx) => {
                    const isOutOfBookMove =
                      sparring.outOfBookPly !== null && m.ply >= sparring.outOfBookPly;
                    const isFirstOutOfBook = m.ply === sparring.outOfBookPly;
                    const prevDest = idx > 0 ? sparring.moveHistory[idx - 1]?.to : undefined;
                    const movePly = idx + 1;

                    return (
                      <React.Fragment key={`move-${idx}-${m.sfenMove}`}>
                        {isFirstOutOfBook && (
                          <div className="my-1.5 rounded bg-amber-500/20 border border-amber-500/40 px-2 py-1 text-[10px] text-amber-300 font-sans font-bold flex items-center justify-between">
                            <span>⚡ {t('sparring.out_of_book')}</span>
                            <span>{t('sparring.out_of_book_at_ply', { ply: m.ply })}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          ref={(el) => {
                            moveRowRefs.current[idx] = el;
                          }}
                          onClick={() => setReviewPly(movePly === totalMoves ? null : movePly)}
                          className={`w-full text-left flex items-center justify-between px-2.5 py-1 rounded transition cursor-pointer ${
                            movePly === displayPly
                              ? 'bg-amber-500/25 text-amber-200 font-bold border border-amber-500/50 shadow-sm'
                              : isOutOfBookMove
                              ? 'bg-slate-900/40 text-slate-300 hover:bg-slate-800/60 border border-transparent'
                              : 'bg-emerald-950/20 text-emerald-300/90 hover:bg-emerald-900/30 border border-transparent'
                          }`}
                        >
                          <span className="w-8 text-slate-500">{m.ply}.</span>
                          <span className="flex-1 font-sans font-medium">
                            {formatShogiMove(m, prevDest)}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {m.sfenMove}
                          </span>
                        </button>
                      </React.Fragment>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Post Match Feedback Modal */}
      <PostMatchFeedbackModal
        isOpen={isFeedbackOpen}
        record={activeRecord}
        openingTree={openingTree}
        onClose={() => setIsFeedbackOpen(false)}
        onMergeToTree={handleMergeToTree}
        onRematch={() => {
          setIsFeedbackOpen(false);
          sparring.startMatch({ playerColor: sparring.playerColor });
        }}
        onViewHistory={() => {
          setIsFeedbackOpen(false);
          setIsHistoryOpen(true);
        }}
        onViewMergedBranch={() => {
          setIsFeedbackOpen(false);
          if (onExitToTree) {
            onExitToTree();
          }
        }}
        onStartWeaknessDrill={(rec) => {
          setIsFeedbackOpen(false);
          const detected = detectWeaknessPositions([rec], {
            trees: trees ?? (openingTree ? { [openingTree.openingId]: openingTree } : undefined),
          });
          const first = detected[0];
          if (first && onStartWeaknessDrill) {
            onStartWeaknessDrill(first);
          }
        }}
      />

      {/* Match History Dashboard */}
      <MatchHistoryDashboard
        isOpen={isHistoryOpen}
        records={matchRecords}
        onClose={() => setIsHistoryOpen(false)}
        onRecordsChange={(updated) => setMatchRecords(updated)}
        onMergeRecordToTree={handleMergeToTree}
        onStartWeaknessDrill={onStartWeaknessDrill}
        trees={trees ?? (openingTree ? { [openingTree.openingId]: openingTree } : undefined)}
      />
    </div>
  );
};
