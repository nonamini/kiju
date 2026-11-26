/**
 * Interactive 2-Pane Modal Editor for TacticalQuizCard (Issue #41).
 * Left pane: Interactive Shogi board + Komadai supporting direct move/drop entry
 * for both the correct move (+ optional follow-up sequence up to 6 plies) and distractors.
 * Right pane: Metadata, Japanese-only choice selectors, and AI MultiPV (5-10 lines) assist.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Shogi } from 'shogi.js';
import { useTranslation } from 'react-i18next';
import { useShogiEngine } from '../../hooks/useShogiEngine';
import { auth } from '../../services/firebase';
import { uploadQuizCardToFirestore } from '../../services/firestoreKifuSync';
import type {
  QuizChoice,
  TacticalQuizCard,
  TacticalQuizType,
} from '../../types/quiz';
import type { MultiPvCandidate } from '../../types/shogi';
import { formatEvalScore } from '../../utils/evalChartHelper';
import { saveQuizCard } from '../../utils/quizPoolStorage';
import {
  formatUsiLineFromSfen,
  resolveQuizPositionSfen,
} from '../../utils/quizMoveFormatter';
import { ShogiBoard } from '../../utils/shogiBoard';
import {
  checkPromotion,
  createInteractiveMove,
  getAllStrictLegalMoves,
  getStrictLegalDropsForPiece,
  getStrictLegalMovesForSquare,
} from '../../utils/shogiRules';
import { formatUsiToJapanese, parseUsiMove } from '../../utils/usiFormatter';
import { StudioKomadaiView } from '../board/StudioKomadaiView';
import {
  StudioBoardSquare,
  StudioCandidateArrow,
  StudioShogiBoardView,
} from '../board/StudioShogiBoardView';

export interface QuizCardEditModalProps {
  card: TacticalQuizCard | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  onEditBoardPosition: (card: TacticalQuizCard) => void;
}

type BoardInputTarget = 'best' | 'distractor1' | 'distractor2';

interface PendingQuizPromotion {
  from: StudioBoardSquare;
  to: StudioBoardSquare;
  pieceKind: string;
}

const QUIZ_TYPES: readonly TacticalQuizType[] = ['attack', 'defense', 'race', 'mate'];
const MAX_QUIZ_PV_LENGTH = 6;
const MULTIPV_OPTIONS = [5, 8, 10] as const;
const DEPTH_OPTIONS = [8, 10, 12] as const;

const KIND_TO_SFEN_UPPER: Record<string, string> = {
  FU: 'P',
  KY: 'L',
  KE: 'N',
  GI: 'S',
  KI: 'G',
  KA: 'B',
  HI: 'R',
};

const DROP_KANJI_MAP: Record<string, string> = {
  P: '歩',
  L: '香',
  N: '桂',
  S: '銀',
  G: '金',
  B: '角',
  R: '飛',
};

function extractShogiHands(shogi: Shogi, color: 0 | 1): Record<string, number> {
  const counts: Record<string, number> = {};
  const list = shogi.hands[color];
  if (!list) return counts;
  for (const piece of list) {
    counts[piece.kind] = (counts[piece.kind] ?? 0) + 1;
  }
  return counts;
}

export const QuizCardEditModal: React.FC<QuizCardEditModalProps> = ({
  card,
  isOpen,
  onClose,
  onSaved,
  onEditBoardPosition,
}) => {
  const { t } = useTranslation();
  const engine = useShogiEngine({ autoInit: false });

  const [title, setTitle] = useState<string>('');
  const [type, setType] = useState<TacticalQuizType>('attack');
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [pvMoves, setPvMoves] = useState<string[]>([]);
  const [distractor1, setDistractor1] = useState<string>('');
  const [distractor2, setDistractor2] = useState<string>('');
  const [explanation, setExplanation] = useState<string>('');

  const [boardInputTarget, setBoardInputTarget] = useState<BoardInputTarget>('best');
  const [selectedSquare, setSelectedSquare] = useState<StudioBoardSquare | null>(null);
  const [selectedHandPiece, setSelectedHandPiece] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingQuizPromotion | null>(null);

  const [aiMultiPv, setAiMultiPv] = useState<5 | 8 | 10>(5);
  const [aiDepth, setAiDepth] = useState<8 | 10 | 12>(10);
  const [aiCandidates, setAiCandidates] = useState<MultiPvCandidate[]>([]);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState<boolean>(false);

  const bestMove = pvMoves[0] ?? '';

  useEffect(() => {
    if (!isOpen || !card) {
      engine.stop();
      setIsAnalyzingAi(false);
      return;
    }
    const correctChoice = card.choices?.find((c) => c.isCorrect);
    const distractors = (card.choices ?? []).filter(
      (c) => !c.isCorrect && c.usi !== card.bestMove
    );
    const initialPv =
      card.pv && card.pv.length > 0
        ? card.pv.slice(0, MAX_QUIZ_PV_LENGTH)
        : card.bestMove
          ? [card.bestMove]
          : [];
    setTitle(card.title ?? '');
    setType(card.type);
    setIsEnabled(card.isEnabled);
    setPvMoves(initialPv);
    setDistractor1(distractors[0]?.usi ?? '');
    setDistractor2(distractors[1]?.usi ?? '');
    setExplanation(card.explanation ?? correctChoice?.explanation ?? '');
    setBoardInputTarget('best');
    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setPendingPromotion(null);
    setAiCandidates([]);
    setIsAnalyzingAi(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, card]);

  const resolvedBaseSfen = useMemo(() => {
    if (!card) return '';
    return resolveQuizPositionSfen(card);
  }, [card]);

  const baseMoveLabels = useMemo(() => {
    const map = new Map<string, string>();
    if (!resolvedBaseSfen || !card) return map;
    try {
      const board = ShogiBoard.fromSfen(resolvedBaseSfen);
      const legalMoves = getAllStrictLegalMoves(board, card.sideToMove);
      const shogi = new Shogi();
      shogi.initializeFromSFENString(resolvedBaseSfen);
      const turnColor: 0 | 1 = card.sideToMove === 'w' ? 1 : 0;
      for (const m of legalMoves) {
        map.set(m.usi, formatUsiToJapanese(m.usi, turnColor, shogi) || m.usi);
      }
    } catch {
      // Ignore fallback
    }
    return map;
  }, [card, resolvedBaseSfen]);

  const legalMoveOptions = useMemo(() => {
    return Array.from(baseMoveLabels.entries()).map(([usi, label]) => ({ usi, label }));
  }, [baseMoveLabels]);

  const pvSteps = useMemo(() => {
    if (!resolvedBaseSfen) return [];
    return formatUsiLineFromSfen(resolvedBaseSfen, pvMoves, MAX_QUIZ_PV_LENGTH);
  }, [resolvedBaseSfen, pvMoves]);

  // Active SFEN on the interactive left board:
  // when editing 'best', show position after replaying pvMoves so follow-up plies can be played;
  // when editing distractor1 / distractor2, always show base quiz position.
  const activeBoardSfen = useMemo(() => {
    if (boardInputTarget === 'best' && pvSteps.length > 0) {
      return pvSteps[pvSteps.length - 1]?.sfenAfter ?? resolvedBaseSfen;
    }
    return resolvedBaseSfen;
  }, [boardInputTarget, pvSteps, resolvedBaseSfen]);

  const activeBoardState = useMemo(() => {
    const shogi = new Shogi();
    const board = ShogiBoard.fromSfen(activeBoardSfen || resolvedBaseSfen);
    try {
      shogi.initializeFromSFENString(activeBoardSfen || resolvedBaseSfen);
    } catch {
      // fallback empty shogi
    }
    return { shogi, board };
  }, [activeBoardSfen, resolvedBaseSfen]);

  const targetSquares = useMemo<StudioBoardSquare[]>(() => {
    if (pendingPromotion) return [];
    const { board } = activeBoardState;
    const turn = board.getTurn();
    if (selectedSquare) {
      return getStrictLegalMovesForSquare(board, {
        file: selectedSquare.x,
        rank: selectedSquare.y,
      }).map((m) => ({ x: m.to.file, y: m.to.rank }));
    }
    if (selectedHandPiece) {
      const pieceUpper = KIND_TO_SFEN_UPPER[selectedHandPiece];
      if (!pieceUpper) return [];
      return getStrictLegalDropsForPiece(board, pieceUpper, turn).map((sq) => ({
        x: sq.file,
        y: sq.rank,
      }));
    }
    return [];
  }, [activeBoardState, pendingPromotion, selectedSquare, selectedHandPiece]);

  // Overlay arrows on the base board for best move (1) and distractors (2, 3)
  const boardCandidateArrows = useMemo<StudioCandidateArrow[]>(() => {
    if (boardInputTarget === 'best' && pvSteps.length > 0) return [];
    const arrows: StudioCandidateArrow[] = [];
    const { shogi } = activeBoardState;
    const turnColor: 0 | 1 = shogi.turn === 1 ? 1 : 0;

    const pushChoiceArrow = (usi: string, rank: number, label: string) => {
      if (!usi) return;
      const parsed = parseUsiMove(usi, shogi);
      if (!parsed) return;
      const dropPrefix =
        !parsed.from && usi.length >= 2 && usi[1] === '*'
          ? DROP_KANJI_MAP[usi[0]?.toUpperCase() ?? '']
          : undefined;
      arrows.push({
        from: parsed.from,
        to: parsed.to,
        rank,
        label,
        dropPieceLabel: dropPrefix,
        dropPieceColor: turnColor,
      });
    };

    pushChoiceArrow(bestMove, 1, t('quiz_editor.assign_best_btn'));
    pushChoiceArrow(distractor1, 2, '1');
    pushChoiceArrow(distractor2, 3, '2');
    return arrows;
  }, [activeBoardState, bestMove, boardInputTarget, distractor1, distractor2, pvSteps.length, t]);

  // Live MultiPV candidates while engine is searching, or finalized results
  const displayedAiCandidates = useMemo(() => {
    const raw =
      isAnalyzingAi && engine.candidatesSfen === resolvedBaseSfen && engine.candidates.length > 0
        ? engine.candidates
        : aiCandidates;
    return [...raw].sort((a, b) => a.multipv - b.multipv).slice(0, aiMultiPv);
  }, [aiCandidates, aiMultiPv, engine.candidates, engine.candidatesSfen, isAnalyzingAi, resolvedBaseSfen]);

  if (!isOpen || !card) return null;

  const legalSet = new Set(legalMoveOptions.map((o) => o.usi));
  const { shogi: displayShogi, board: displayBoard } = activeBoardState;
  const activeTurnColor: 0 | 1 = displayShogi.turn === 1 ? 1 : 0;
  const isFlipped = card.sideToMove === 'w';
  const senteHands = extractShogiHands(displayShogi, 0);
  const goteHands = extractShogiHands(displayShogi, 1);

  const lastMoveHighlight =
    boardInputTarget === 'best' && pvSteps.length > 0
      ? pvSteps[pvSteps.length - 1]?.lastMove ?? null
      : null;

  const commitBoardMove = (
    from: StudioBoardSquare | undefined,
    to: StudioBoardSquare,
    promote: boolean,
    dropPieceKind?: string
  ) => {
    const turn = displayBoard.getTurn();
    const dropUpper = dropPieceKind ? KIND_TO_SFEN_UPPER[dropPieceKind] : undefined;
    const interactiveMove = createInteractiveMove(
      displayBoard,
      1,
      turn,
      from ? { file: from.x, rank: from.y } : undefined,
      { file: to.x, rank: to.y },
      promote,
      dropUpper
    );
    const moveUsi = interactiveMove.sfenMove;

    if (boardInputTarget === 'best') {
      if (pvMoves.length < MAX_QUIZ_PV_LENGTH) {
        setPvMoves((prev) => [...prev, moveUsi]);
      } else {
        setPvMoves([moveUsi]);
      }
    } else if (boardInputTarget === 'distractor1') {
      if (moveUsi !== bestMove && moveUsi !== distractor2) {
        setDistractor1(moveUsi);
      }
    } else if (boardInputTarget === 'distractor2') {
      if (moveUsi !== bestMove && moveUsi !== distractor1) {
        setDistractor2(moveUsi);
      }
    }

    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setPendingPromotion(null);
  };

  const handleSquareClick = (sq: StudioBoardSquare) => {
    if (pendingPromotion) return;
    const turn = displayBoard.getTurn();
    const turnColor: 0 | 1 = turn === 'w' ? 1 : 0;

    if (selectedHandPiece) {
      const pieceUpper = KIND_TO_SFEN_UPPER[selectedHandPiece];
      if (pieceUpper) {
        const drops = getStrictLegalDropsForPiece(displayBoard, pieceUpper, turn);
        if (drops.some((d) => d.file === sq.x && d.rank === sq.y)) {
          commitBoardMove(undefined, sq, false, selectedHandPiece);
          return;
        }
      }
      setSelectedHandPiece(null);
    }

    if (selectedSquare) {
      if (selectedSquare.x === sq.x && selectedSquare.y === sq.y) {
        setSelectedSquare(null);
        return;
      }
      const legalTargets = getStrictLegalMovesForSquare(displayBoard, {
        file: selectedSquare.x,
        rank: selectedSquare.y,
      });
      const matchedTarget = legalTargets.find(
        (m) => m.to.file === sq.x && m.to.rank === sq.y
      );
      if (matchedTarget) {
        const pieceChar = displayBoard.getSquare(selectedSquare.x, selectedSquare.y) ?? '';
        const { canPromote, forcePromote } = checkPromotion(
          pieceChar,
          selectedSquare.y,
          sq.y,
          turn
        );
        if (forcePromote) {
          commitBoardMove(selectedSquare, sq, true);
        } else if (canPromote) {
          setPendingPromotion({
            from: selectedSquare,
            to: sq,
            pieceKind: pieceChar,
          });
        } else {
          commitBoardMove(selectedSquare, sq, false);
        }
        return;
      }
    }

    const clickedPiece = displayShogi.get(sq.x, sq.y);
    if (clickedPiece && clickedPiece.color === turnColor) {
      if (boardInputTarget === 'best' && pvMoves.length >= MAX_QUIZ_PV_LENGTH) {
        return;
      }
      setSelectedSquare(sq);
      setSelectedHandPiece(null);
    } else {
      setSelectedSquare(null);
    }
  };

  const handleHandPieceSelect = (color: 0 | 1, pieceKind: string) => {
    if (pendingPromotion) return;
    if (color !== activeTurnColor) return;
    if (boardInputTarget === 'best' && pvMoves.length >= MAX_QUIZ_PV_LENGTH) return;
    setSelectedSquare(null);
    setSelectedHandPiece((prev) => (prev === pieceKind ? null : pieceKind));
  };

  const handleSwitchInputTarget = (nextTarget: BoardInputTarget) => {
    setBoardInputTarget(nextTarget);
    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setPendingPromotion(null);
  };

  const handleRunAiAnalysis = async () => {
    if (!resolvedBaseSfen) return;
    if (isAnalyzingAi) {
      engine.stop();
      setIsAnalyzingAi(false);
      return;
    }
    setIsAnalyzingAi(true);
    try {
      if (!engine.isReady) {
        await engine.init();
      }
      engine.setOption('MultiPV', aiMultiPv);
      const res = await engine.searchPosition(resolvedBaseSfen, undefined, {
        depth: aiDepth,
        movetime: 2500,
      });
      const finalCands =
        res.evaluation?.candidates && res.evaluation.candidates.length > 0
          ? res.evaluation.candidates
          : engine.candidates;
      if (finalCands.length > 0) {
        setAiCandidates(finalCands);
      }
    } catch (err) {
      console.warn('Quiz editor AI MultiPV search failed:', err);
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  const handleAssignBestFromCandidate = (cand: MultiPvCandidate) => {
    const line =
      cand.pv && cand.pv.length > 0
        ? cand.pv.slice(0, MAX_QUIZ_PV_LENGTH)
        : [cand.usi];
    setPvMoves(line);
    if (distractor1 === cand.usi) setDistractor1('');
    if (distractor2 === cand.usi) setDistractor2('');
    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setPendingPromotion(null);
  };

  const handleAssignDistractor = (slot: 1 | 2, usi: string) => {
    if (!usi || usi === bestMove) return;
    if (slot === 1) {
      setDistractor1(usi);
      if (distractor2 === usi) setDistractor2('');
    } else {
      setDistractor2(usi);
      if (distractor1 === usi) setDistractor1('');
    }
  };

  const formatChoiceLabel = (usi: string): string => {
    if (!usi) return '';
    if (baseMoveLabels.has(usi)) {
      return baseMoveLabels.get(usi) ?? usi;
    }
    try {
      const shogi = new Shogi();
      shogi.initializeFromSFENString(resolvedBaseSfen);
      const turnColor: 0 | 1 = card.sideToMove === 'w' ? 1 : 0;
      return formatUsiToJapanese(usi, turnColor, shogi) || usi;
    } catch {
      return usi;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedBest = bestMove.trim() || card.bestMove;
    const trimmedTitle = title.trim();
    const trimmedExplanation = explanation.trim();

    const prevBestChoice = card.choices?.find(
      (c) => c.usi === resolvedBest || c.isCorrect
    );
    const updatedPv =
      pvMoves.length > 0 && pvMoves[0] === resolvedBest
        ? pvMoves
        : resolvedBest === card.bestMove && card.pv.length > 0
          ? card.pv
          : [resolvedBest];

    const nextChoices: QuizChoice[] = [
      {
        usi: resolvedBest,
        isCorrect: true,
        role: 'best',
        scoreDelta: 0,
        continuationPv: updatedPv,
        explanation:
          trimmedExplanation ||
          prevBestChoice?.explanation ||
          t('position_editor.quiz_default_best_explanation'),
      },
    ];

    const seen = new Set<string>([resolvedBest]);
    for (const d of [distractor1, distractor2]) {
      if (!d || seen.has(d)) continue;
      seen.add(d);
      const oldChoice = card.choices?.find((c) => c.usi === d);
      nextChoices.push(
        oldChoice
          ? { ...oldChoice, isCorrect: false }
          : {
              usi: d,
              isCorrect: false,
              role: 'blunder',
              scoreDelta: -300,
              continuationPv: [d],
              explanation: t('position_editor.quiz_default_distractor_explanation'),
            }
      );
    }

    for (const opt of legalMoveOptions) {
      if (nextChoices.length >= 3) break;
      if (seen.has(opt.usi)) continue;
      seen.add(opt.usi);
      nextChoices.push({
        usi: opt.usi,
        isCorrect: false,
        role: 'blunder',
        scoreDelta: -300,
        continuationPv: [opt.usi],
        explanation: t('position_editor.quiz_default_distractor_explanation'),
      });
    }
    nextChoices.sort((a, b) => a.usi.localeCompare(b.usi));

    const updatedCard: TacticalQuizCard = {
      ...card,
      title: trimmedTitle || undefined,
      type,
      isEnabled,
      bestMove: resolvedBest,
      pv: updatedPv,
      explanation: trimmedExplanation || undefined,
      choices: nextChoices,
      updatedAt: new Date().toISOString(),
    };

    saveQuizCard(updatedCard);
    const uid = auth?.currentUser?.uid;
    if (uid) {
      void uploadQuizCardToFirestore(uid, updatedCard);
    }
    engine.stop();
    onSaved();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-5xl rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:p-5 shadow-2xl flex flex-col gap-4 max-h-[94vh] overflow-y-auto text-xs"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <span>🎯</span>
            <span>{t('quiz_editor.modal_title')}</span>
          </h3>
          <button
            type="button"
            onClick={() => {
              engine.stop();
              onClose();
            }}
            className="p-1 rounded text-slate-400 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>

        {/* 2-Pane Body */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] gap-4 items-start">
          {/* Left Pane: Interactive Board & PV Sequence */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2.5">
            {/* Target Switch Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => handleSwitchInputTarget('best')}
                className={`py-1.5 px-2 rounded-md transition truncate ${
                  boardInputTarget === 'best'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ✓ {t('quiz_editor.input_target_best')}
              </button>
              <button
                type="button"
                onClick={() => handleSwitchInputTarget('distractor1')}
                className={`py-1.5 px-2 rounded-md transition truncate ${
                  boardInputTarget === 'distractor1'
                    ? 'bg-amber-600 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ✕ {t('quiz_editor.input_target_d1')}
              </button>
              <button
                type="button"
                onClick={() => handleSwitchInputTarget('distractor2')}
                className={`py-1.5 px-2 rounded-md transition truncate ${
                  boardInputTarget === 'distractor2'
                    ? 'bg-violet-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ✕ {t('quiz_editor.input_target_d2')}
              </button>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              {boardInputTarget === 'best'
                ? t('quiz_editor.board_hint_best')
                : t('quiz_editor.board_hint_distractor')}
            </p>

            {/* Interactive Komadai + Board */}
            <div className="flex flex-col items-center gap-1.5">
              <StudioKomadaiView
                color={isFlipped ? 0 : 1}
                playerName={isFlipped ? t('board.sente') : t('board.gote')}
                isTurn={activeTurnColor === (isFlipped ? 0 : 1)}
                hands={isFlipped ? senteHands : goteHands}
                selectedPiece={
                  activeTurnColor === (isFlipped ? 0 : 1) ? selectedHandPiece : null
                }
                onPieceSelect={(kind) =>
                  handleHandPieceSelect(isFlipped ? 0 : 1, kind)
                }
                selectable={activeTurnColor === (isFlipped ? 0 : 1)}
                isFlippedBoard={isFlipped}
                className="w-full max-w-[360px]"
              />

              <div className="w-full max-w-[360px] aspect-[9/9.6] relative">
                <StudioShogiBoardView
                  shogi={displayShogi}
                  isFlipped={isFlipped}
                  selectedSquare={selectedSquare}
                  targetSquares={targetSquares}
                  lastMove={lastMoveHighlight}
                  candidateArrows={boardCandidateArrows}
                  onSquareClick={handleSquareClick}
                  className="w-full h-full"
                />
              </div>

              <StudioKomadaiView
                color={isFlipped ? 1 : 0}
                playerName={isFlipped ? t('board.gote') : t('board.sente')}
                isTurn={activeTurnColor === (isFlipped ? 1 : 0)}
                hands={isFlipped ? goteHands : senteHands}
                selectedPiece={
                  activeTurnColor === (isFlipped ? 1 : 0) ? selectedHandPiece : null
                }
                onPieceSelect={(kind) =>
                  handleHandPieceSelect(isFlipped ? 1 : 0, kind)
                }
                selectable={activeTurnColor === (isFlipped ? 1 : 0)}
                isFlippedBoard={isFlipped}
                className="w-full max-w-[360px]"
              />
            </div>

            {/* Inline Promotion Prompt */}
            {pendingPromotion && (
              <div className="rounded-lg border border-amber-500/60 bg-amber-950/60 p-2.5 flex items-center justify-between gap-2">
                <span className="font-bold text-amber-200">
                  {t('studio.promote_dialog.title')}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      commitBoardMove(pendingPromotion.from, pendingPromotion.to, true)
                    }
                    className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition"
                  >
                    {t('studio.promote_dialog.promote')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      commitBoardMove(pendingPromotion.from, pendingPromotion.to, false)
                    }
                    className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-semibold transition"
                  >
                    {t('studio.promote_dialog.stay')}
                  </button>
                </div>
              </div>
            )}

            {/* PV Sequence Pills & Controls */}
            <div className="rounded-lg bg-slate-900/90 border border-slate-800 p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-300">
                  {t('quiz_editor.pv_sequence_label')}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={pvMoves.length === 0}
                    onClick={() => setPvMoves((prev) => prev.slice(0, -1))}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 text-[10px] font-semibold transition"
                  >
                    ↩ {t('quiz_editor.pv_undo_btn')}
                  </button>
                  <button
                    type="button"
                    disabled={pvMoves.length === 0}
                    onClick={() => setPvMoves([])}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-rose-950/60 disabled:opacity-40 text-slate-300 hover:text-rose-200 border border-slate-700 text-[10px] font-semibold transition"
                  >
                    {t('quiz_editor.pv_clear_btn')}
                  </button>
                </div>
              </div>
              {pvSteps.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {pvSteps.map((step, idx) => (
                    <button
                      key={`${step.usi}-${idx}`}
                      type="button"
                      onClick={() => setPvMoves((prev) => prev.slice(0, idx + 1))}
                      className={`px-2 py-0.5 rounded border text-[11px] font-semibold transition ${
                        idx === 0
                          ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/50'
                          : 'bg-slate-950 text-slate-200 border-slate-700 hover:border-amber-500/50'
                      }`}
                    >
                      {idx + 1}. {step.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">{t('quiz_editor.pv_empty')}</p>
              )}
            </div>
          </div>

          {/* Right Pane: Form Fields + AI MultiPV Assist */}
          <div className="space-y-3">
            {/* Title */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-400">
                {t('quiz_editor.title_label')}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('quiz_editor.title_placeholder')}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>

            {/* Type + Enabled */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1 flex-1">
                <label className="block text-[11px] font-bold text-slate-400">
                  {t('position_editor.quiz_type_label')}
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {QUIZ_TYPES.map((qt) => (
                    <button
                      key={qt}
                      type="button"
                      onClick={() => setType(qt)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition ${
                        type === qt
                          ? 'bg-violet-500/25 border-violet-400/70 text-violet-200'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t(`quiz.type.${qt}`)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="inline-flex items-center gap-2 cursor-pointer select-none pt-4">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-950 text-amber-500"
                />
                <span className="font-semibold text-slate-200">
                  {t('quiz_editor.enabled_label')}
                </span>
              </label>
            </div>

            {/* Best Move Selector (Japanese only, no USI suffix) */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-400">
                {t('position_editor.quiz_best_move_label')}
              </label>
              <select
                value={bestMove}
                onChange={(e) => setPvMoves(e.target.value ? [e.target.value] : [])}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-100"
              >
                {!legalSet.has(bestMove) && bestMove && (
                  <option value={bestMove}>{formatChoiceLabel(bestMove)}</option>
                )}
                {legalMoveOptions.map((opt) => (
                  <option key={`edit-best-${opt.usi}`} value={opt.usi}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Distractors (Japanese only, no USI suffix) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-400">
                  {t('position_editor.quiz_distractor1_label')}
                </label>
                <select
                  value={distractor1}
                  onChange={(e) => setDistractor1(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs text-slate-200"
                >
                  <option value="">{t('position_editor.quiz_distractor_auto')}</option>
                  {!legalSet.has(distractor1) && distractor1 && (
                    <option value={distractor1}>{formatChoiceLabel(distractor1)}</option>
                  )}
                  {legalMoveOptions
                    .filter((m) => m.usi !== bestMove && m.usi !== distractor2)
                    .map((m) => (
                      <option key={`edit-d1-${m.usi}`} value={m.usi}>
                        {m.label}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] text-slate-400">
                  {t('position_editor.quiz_distractor2_label')}
                </label>
                <select
                  value={distractor2}
                  onChange={(e) => setDistractor2(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs text-slate-200"
                >
                  <option value="">{t('position_editor.quiz_distractor_auto')}</option>
                  {!legalSet.has(distractor2) && distractor2 && (
                    <option value={distractor2}>{formatChoiceLabel(distractor2)}</option>
                  )}
                  {legalMoveOptions
                    .filter((m) => m.usi !== bestMove && m.usi !== distractor1)
                    .map((m) => (
                      <option key={`edit-d2-${m.usi}`} value={m.usi}>
                        {m.label}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* AI MultiPV Candidates Assist */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <span>🤖</span>
                  <span>{t('quiz_editor.ai_assist_title')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <select
                    value={aiMultiPv}
                    onChange={(e) => setAiMultiPv(Number(e.target.value) as 5 | 8 | 10)}
                    disabled={isAnalyzingAi}
                    aria-label={t('quiz_editor.ai_multipv_label')}
                    className="rounded bg-slate-900 border border-slate-700 px-1.5 py-1 text-[11px] text-slate-200"
                  >
                    {MULTIPV_OPTIONS.map((cnt) => (
                      <option key={cnt} value={cnt}>
                        {t('quiz_editor.ai_multipv_label')}: {cnt}
                      </option>
                    ))}
                  </select>
                  <select
                    value={aiDepth}
                    onChange={(e) => setAiDepth(Number(e.target.value) as 8 | 10 | 12)}
                    disabled={isAnalyzingAi}
                    aria-label={t('quiz_editor.ai_depth_label')}
                    className="rounded bg-slate-900 border border-slate-700 px-1.5 py-1 text-[11px] text-slate-200"
                  >
                    {DEPTH_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {t('quiz_editor.ai_depth_label')} {d}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleRunAiAnalysis()}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                      isAnalyzingAi
                        ? 'bg-rose-600 hover:bg-rose-500 text-white'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                    }`}
                  >
                    {isAnalyzingAi
                      ? `⏹ ${t('quiz_editor.ai_assist_stop')}`
                      : `🔍 ${t('quiz_editor.ai_assist_run')}`}
                  </button>
                </div>
              </div>

              {displayedAiCandidates.length > 0 ? (
                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-0.5">
                  {displayedAiCandidates.map((cand, idx) => {
                    const rank = cand.multipv >= 1 ? cand.multipv : idx + 1;
                    const moveLabel = formatChoiceLabel(cand.usi);
                    const candLine = formatUsiLineFromSfen(
                      resolvedBaseSfen,
                      cand.pv && cand.pv.length > 0 ? cand.pv : [cand.usi],
                      5
                    );
                    const isBest = cand.usi === bestMove;
                    const isD1 = cand.usi === distractor1;
                    const isD2 = cand.usi === distractor2;

                    return (
                      <div
                        key={`ai-cand-${rank}-${cand.usi}`}
                        className="rounded-lg border border-slate-800 bg-slate-900/90 px-2.5 py-1.5 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-black shrink-0 ${
                                rank === 1
                                  ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40'
                                  : rank <= 3
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {rank}
                            </span>
                            <span className="font-bold text-slate-100 truncate">
                              {moveLabel}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400 shrink-0">
                              {formatEvalScore(cand.scoreCp, cand.isMate, cand.matePly)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 text-[10px] font-bold">
                            <button
                              type="button"
                              onClick={() => handleAssignBestFromCandidate(cand)}
                              className={`px-1.5 py-0.5 rounded border transition ${
                                isBest
                                  ? 'bg-emerald-600 text-white border-emerald-400'
                                  : 'bg-slate-800 hover:bg-emerald-600/30 text-emerald-300 border-slate-700'
                              }`}
                            >
                              {t('quiz_editor.assign_best_btn')}
                            </button>
                            <button
                              type="button"
                              disabled={isBest}
                              onClick={() => handleAssignDistractor(1, cand.usi)}
                              className={`px-1.5 py-0.5 rounded border disabled:opacity-40 transition ${
                                isD1
                                  ? 'bg-amber-600 text-slate-950 border-amber-400'
                                  : 'bg-slate-800 hover:bg-amber-600/30 text-amber-300 border-slate-700'
                              }`}
                            >
                              {t('quiz_editor.assign_d1_btn')}
                            </button>
                            <button
                              type="button"
                              disabled={isBest}
                              onClick={() => handleAssignDistractor(2, cand.usi)}
                              className={`px-1.5 py-0.5 rounded border disabled:opacity-40 transition ${
                                isD2
                                  ? 'bg-violet-600 text-white border-violet-400'
                                  : 'bg-slate-800 hover:bg-violet-600/30 text-violet-300 border-slate-700'
                              }`}
                            >
                              {t('quiz_editor.assign_d2_btn')}
                            </button>
                          </div>
                        </div>
                        {candLine.length > 1 && (
                          <div className="text-[10px] text-slate-400 truncate">
                            {candLine.map((s) => s.label).join(' → ')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  {isAnalyzingAi
                    ? t('quiz_editor.ai_assist_analyzing')
                    : t('quiz_editor.ai_assist_empty')}
                </p>
              )}
            </div>

            {/* Explanation */}
            <div className="space-y-1">
              <label className="block text-[11px] text-slate-400">
                {t('position_editor.quiz_explanation_label')}
              </label>
              <textarea
                rows={2}
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder={t('position_editor.quiz_explanation_placeholder')}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800 shrink-0">
          {card.usiMovesToPosition.length === 0 ? (
            <button
              type="button"
              onClick={() => {
                engine.stop();
                onClose();
                onEditBoardPosition(card);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-semibold transition"
            >
              🛠️ {t('quiz_editor.edit_board_btn')}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                engine.stop();
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow"
            >
              {t('quiz_editor.save_btn')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
