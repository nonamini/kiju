/**
 * Full-Screen 3-Pane Studio Editor for TacticalQuizCard (Issue #41).
 * Uses the Studio's Left (move sequences & step inspection), Center (interactive board & komadai),
 * and Right (metadata, Japanese-only choice selectors, Base MultiPV 5-10 & Distractor Refutation AI)
 * instead of a cramped popup modal. Always opens at ply 0 (the quiz base position).
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
import {
  FormattedUsiStep,
  formatUsiLineFromSfen,
  resolveQuizPositionSfen,
} from '../../utils/quizMoveFormatter';
import { saveQuizCard } from '../../utils/quizPoolStorage';
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

export interface QuizStudioEditViewProps {
  card: TacticalQuizCard;
  onSaved: () => void;
  onCancel: () => void;
  onEditPiecePlacement: (card: TacticalQuizCard) => void;
}

type LineKey = 'best' | 'd1' | 'd2';
type PreviewLineKey = 'base' | LineKey;

interface PendingQuizPromotion {
  from: StudioBoardSquare;
  to: StudioBoardSquare;
}

const QUIZ_TYPES: readonly TacticalQuizType[] = ['attack', 'defense', 'race', 'mate'];
const MAX_BEST_PV_LENGTH = 6;
const MAX_REFUTATION_LENGTH = 5;
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

function getInitialDistractorPv(
  card: TacticalQuizCard,
  index: 0 | 1
): string[] {
  const distractors = (card.choices ?? []).filter(
    (c) => !c.isCorrect && c.usi !== card.bestMove
  );
  const choice = distractors[index];
  if (!choice) return [];
  if (choice.continuationPv && choice.continuationPv.length > 0) {
    return choice.continuationPv.slice(0, MAX_REFUTATION_LENGTH);
  }
  return choice.usi ? [choice.usi] : [];
}

export const QuizStudioEditView: React.FC<QuizStudioEditViewProps> = ({
  card,
  onSaved,
  onCancel,
  onEditPiecePlacement,
}) => {
  const { t } = useTranslation();
  const engine = useShogiEngine({ autoInit: false });

  const [title, setTitle] = useState<string>(card.title ?? '');
  const [type, setType] = useState<TacticalQuizType>(card.type);
  const [isEnabled, setIsEnabled] = useState<boolean>(card.isEnabled);
  const [explanation, setExplanation] = useState<string>(() => {
    const correctChoice = card.choices?.find((c) => c.isCorrect);
    return card.explanation ?? correctChoice?.explanation ?? '';
  });

  const [bestPv, setBestPv] = useState<string[]>(() =>
    card.pv && card.pv.length > 0
      ? card.pv.slice(0, MAX_BEST_PV_LENGTH)
      : card.bestMove
        ? [card.bestMove]
        : []
  );
  const [d1Pv, setD1Pv] = useState<string[]>(() => getInitialDistractorPv(card, 0));
  const [d2Pv, setD2Pv] = useState<string[]>(() => getInitialDistractorPv(card, 1));

  // Always start on the exact quiz base position (ply 0)
  const [inputTarget, setInputTarget] = useState<LineKey>('best');
  const [previewLine, setPreviewLine] = useState<PreviewLineKey>('base');
  const [previewStep, setPreviewStep] = useState<number>(0);

  const [selectedSquare, setSelectedSquare] = useState<StudioBoardSquare | null>(null);
  const [selectedHandPiece, setSelectedHandPiece] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingQuizPromotion | null>(null);

  const [aiMultiPv, setAiMultiPv] = useState<5 | 8 | 10>(5);
  const [aiDepth, setAiDepth] = useState<8 | 10 | 12>(10);
  const [aiCandidates, setAiCandidates] = useState<MultiPvCandidate[]>([]);
  const [aiSearchMode, setAiSearchMode] = useState<'none' | 'base' | 'd1' | 'd2'>('none');

  const bestMove = bestPv[0] ?? '';
  const distractor1 = d1Pv[0] ?? '';
  const distractor2 = d2Pv[0] ?? '';

  useEffect(() => {
    const correctChoice = card.choices?.find((c) => c.isCorrect);
    setTitle(card.title ?? '');
    setType(card.type);
    setIsEnabled(card.isEnabled);
    setExplanation(card.explanation ?? correctChoice?.explanation ?? '');
    setBestPv(
      card.pv && card.pv.length > 0
        ? card.pv.slice(0, MAX_BEST_PV_LENGTH)
        : card.bestMove
          ? [card.bestMove]
          : []
    );
    setD1Pv(getInitialDistractorPv(card, 0));
    setD2Pv(getInitialDistractorPv(card, 1));
    setInputTarget('best');
    setPreviewLine('base');
    setPreviewStep(0);
    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setPendingPromotion(null);
    setAiCandidates([]);
    setAiSearchMode('none');

    return () => {
      engine.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);

  const resolvedBaseSfen = useMemo(() => resolveQuizPositionSfen(card), [card]);

  const baseMoveLabels = useMemo(() => {
    const map = new Map<string, string>();
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
  }, [card.sideToMove, resolvedBaseSfen]);

  const legalMoveOptions = useMemo(
    () => Array.from(baseMoveLabels.entries()).map(([usi, label]) => ({ usi, label })),
    [baseMoveLabels]
  );

  const bestSteps = useMemo(
    () => formatUsiLineFromSfen(resolvedBaseSfen, bestPv, MAX_BEST_PV_LENGTH),
    [resolvedBaseSfen, bestPv]
  );
  const d1Steps = useMemo(
    () => formatUsiLineFromSfen(resolvedBaseSfen, d1Pv, MAX_REFUTATION_LENGTH),
    [resolvedBaseSfen, d1Pv]
  );
  const d2Steps = useMemo(
    () => formatUsiLineFromSfen(resolvedBaseSfen, d2Pv, MAX_REFUTATION_LENGTH),
    [resolvedBaseSfen, d2Pv]
  );

  const activeSteps: FormattedUsiStep[] =
    previewLine === 'best'
      ? bestSteps
      : previewLine === 'd1'
        ? d1Steps
        : previewLine === 'd2'
          ? d2Steps
          : [];

  const activeSnap =
    previewLine !== 'base' && previewStep > 0
      ? activeSteps[previewStep - 1] ?? null
      : null;

  const activeBoardSfen = activeSnap ? activeSnap.sfenAfter : resolvedBaseSfen;

  const activeBoardState = useMemo(() => {
    const shogi = new Shogi();
    const board = ShogiBoard.fromSfen(activeBoardSfen);
    try {
      shogi.initializeFromSFENString(activeBoardSfen);
    } catch {
      // Fallback
    }
    return { shogi, board };
  }, [activeBoardSfen]);

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

  const boardCandidateArrows = useMemo<StudioCandidateArrow[]>(() => {
    if (previewLine !== 'base') return [];
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
  }, [activeBoardState, bestMove, distractor1, distractor2, previewLine, t]);

  const displayedAiCandidates = useMemo(() => {
    const raw =
      aiSearchMode === 'base' &&
      engine.candidatesSfen === resolvedBaseSfen &&
      engine.candidates.length > 0
        ? engine.candidates
        : aiCandidates;
    return [...raw].sort((a, b) => a.multipv - b.multipv).slice(0, aiMultiPv);
  }, [aiCandidates, aiMultiPv, aiSearchMode, engine.candidates, engine.candidatesSfen, resolvedBaseSfen]);

  const legalSet = new Set(legalMoveOptions.map((o) => o.usi));
  const { shogi: displayShogi, board: displayBoard } = activeBoardState;
  const activeTurnColor: 0 | 1 = displayShogi.turn === 1 ? 1 : 0;
  const isFlipped = card.sideToMove === 'w';
  const senteHands = extractShogiHands(displayShogi, 0);
  const goteHands = extractShogiHands(displayShogi, 1);

  const jumpToBase = () => {
    setPreviewLine('base');
    setPreviewStep(0);
    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setPendingPromotion(null);
  };

  const jumpToStep = (line: LineKey, step: number) => {
    if (step <= 0) {
      jumpToBase();
      return;
    }
    setInputTarget(line);
    setPreviewLine(line);
    setPreviewStep(step);
    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setPendingPromotion(null);
  };

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

    const effectiveTarget: LineKey =
      previewLine === 'best' || previewLine === 'd1' || previewLine === 'd2'
        ? previewLine
        : inputTarget;

    const isContinuation =
      previewLine === effectiveTarget && previewStep > 0;

    if (effectiveTarget === 'best') {
      if (!isContinuation) {
        setBestPv([moveUsi]);
        setPreviewLine('best');
        setPreviewStep(1);
      } else if (previewStep < MAX_BEST_PV_LENGTH) {
        const nextPv = [...bestPv.slice(0, previewStep), moveUsi].slice(
          0,
          MAX_BEST_PV_LENGTH
        );
        setBestPv(nextPv);
        setPreviewLine('best');
        setPreviewStep(nextPv.length);
      }
      if (distractor1 === moveUsi && !isContinuation) setD1Pv([]);
      if (distractor2 === moveUsi && !isContinuation) setD2Pv([]);
    } else if (effectiveTarget === 'd1') {
      if (!isContinuation) {
        if (moveUsi !== bestMove && moveUsi !== distractor2) {
          setD1Pv([moveUsi]);
          setPreviewLine('d1');
          setPreviewStep(1);
        }
      } else if (previewStep < MAX_REFUTATION_LENGTH) {
        const nextPv = [...d1Pv.slice(0, previewStep), moveUsi].slice(
          0,
          MAX_REFUTATION_LENGTH
        );
        setD1Pv(nextPv);
        setPreviewLine('d1');
        setPreviewStep(nextPv.length);
      }
    } else {
      if (!isContinuation) {
        if (moveUsi !== bestMove && moveUsi !== distractor1) {
          setD2Pv([moveUsi]);
          setPreviewLine('d2');
          setPreviewStep(1);
        }
      } else if (previewStep < MAX_REFUTATION_LENGTH) {
        const nextPv = [...d2Pv.slice(0, previewStep), moveUsi].slice(
          0,
          MAX_REFUTATION_LENGTH
        );
        setD2Pv(nextPv);
        setPreviewLine('d2');
        setPreviewStep(nextPv.length);
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
          setPendingPromotion({ from: selectedSquare, to: sq });
        } else {
          commitBoardMove(selectedSquare, sq, false);
        }
        return;
      }
    }

    const clickedPiece = displayShogi.get(sq.x, sq.y);
    if (clickedPiece && clickedPiece.color === turnColor) {
      setSelectedSquare(sq);
      setSelectedHandPiece(null);
    } else {
      setSelectedSquare(null);
    }
  };

  const handleHandPieceSelect = (color: 0 | 1, pieceKind: string) => {
    if (pendingPromotion || color !== activeTurnColor) return;
    setSelectedSquare(null);
    setSelectedHandPiece((prev) => (prev === pieceKind ? null : pieceKind));
  };

  const handleSwitchInputTarget = (nextTarget: LineKey) => {
    setInputTarget(nextTarget);
    if (previewLine !== nextTarget) {
      jumpToBase();
    }
  };

  const handleRunBaseAiAnalysis = async () => {
    if (aiSearchMode === 'base') {
      engine.stop();
      setAiSearchMode('none');
      return;
    }
    engine.stop();
    setAiSearchMode('base');
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
      console.warn('Quiz editor base MultiPV search failed:', err);
    } finally {
      setAiSearchMode('none');
    }
  };

  const handleAnalyzeDistractorRefutation = async (slot: 1 | 2) => {
    const firstMoveUsi = slot === 1 ? distractor1 : distractor2;
    if (!firstMoveUsi) return;
    const targetMode = slot === 1 ? 'd1' : 'd2';
    if (aiSearchMode === targetMode) {
      engine.stop();
      setAiSearchMode('none');
      return;
    }

    const stepsAfterFirst = formatUsiLineFromSfen(resolvedBaseSfen, [firstMoveUsi], 1);
    const sfenAfterFirst = stepsAfterFirst[0]?.sfenAfter;
    if (!sfenAfterFirst) return;

    engine.stop();
    setAiSearchMode(targetMode);
    try {
      if (!engine.isReady) {
        await engine.init();
      }
      engine.setOption('MultiPV', 1);
      const res = await engine.searchPosition(sfenAfterFirst, undefined, {
        depth: aiDepth,
        movetime: 2000,
      });
      const replyPv =
        res.evaluation?.pv && res.evaluation.pv.length > 0
          ? res.evaluation.pv
          : res.bestMove
            ? [res.bestMove]
            : [];
      const fullLine = [firstMoveUsi, ...replyPv.slice(0, MAX_REFUTATION_LENGTH - 1)];
      if (slot === 1) {
        setD1Pv(fullLine);
        setInputTarget('d1');
        setPreviewLine('d1');
        setPreviewStep(1);
      } else {
        setD2Pv(fullLine);
        setInputTarget('d2');
        setPreviewLine('d2');
        setPreviewStep(1);
      }
    } catch (err) {
      console.warn('Quiz editor distractor refutation search failed:', err);
    } finally {
      setAiSearchMode('none');
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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedBest = bestMove.trim() || card.bestMove;
    const trimmedTitle = title.trim();
    const trimmedExplanation = explanation.trim();

    const prevBestChoice = card.choices?.find(
      (c) => c.usi === resolvedBest || c.isCorrect
    );
    const updatedBestPv =
      bestPv.length > 0 && bestPv[0] === resolvedBest
        ? bestPv
        : resolvedBest === card.bestMove && card.pv.length > 0
          ? card.pv
          : [resolvedBest];

    const nextChoices: QuizChoice[] = [
      {
        usi: resolvedBest,
        isCorrect: true,
        role: 'best',
        scoreDelta: 0,
        continuationPv: updatedBestPv,
        explanation:
          trimmedExplanation ||
          prevBestChoice?.explanation ||
          t('position_editor.quiz_default_best_explanation'),
      },
    ];

    const seen = new Set<string>([resolvedBest]);
    for (const line of [d1Pv, d2Pv]) {
      const d = line[0] ?? '';
      if (!d || seen.has(d)) continue;
      seen.add(d);
      const oldChoice = card.choices?.find((c) => c.usi === d);
      const cont = line.length > 0 ? line : [d];
      nextChoices.push(
        oldChoice
          ? { ...oldChoice, isCorrect: false, continuationPv: cont }
          : {
              usi: d,
              isCorrect: false,
              role: 'blunder',
              scoreDelta: -300,
              continuationPv: cont,
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
      pv: updatedBestPv,
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
  };

  const renderLineSection = (
    lineKey: LineKey,
    label: string,
    steps: FormattedUsiStep[],
    pvArray: string[],
    setPvArray: React.Dispatch<React.SetStateAction<string[]>>,
    accentClass: string,
    refutationSlot?: 1 | 2
  ) => {
    const isRefutationSearching =
      refutationSlot === 1 ? aiSearchMode === 'd1' : refutationSlot === 2 ? aiSearchMode === 'd2' : false;
    return (
      <div className="rounded-lg bg-slate-950/75 border border-slate-800 p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-1.5">
          <span className={`text-[11px] font-bold ${accentClass}`}>{label}</span>
          <div className="flex items-center gap-1">
            {refutationSlot && pvArray.length > 0 && (
              <button
                type="button"
                onClick={() => void handleAnalyzeDistractorRefutation(refutationSlot)}
                disabled={aiSearchMode !== 'none' && !isRefutationSearching}
                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                  isRefutationSearching
                    ? 'bg-rose-600 text-white border-rose-400'
                    : 'bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                }`}
              >
                {isRefutationSearching
                  ? `⏹ ${t('quiz_editor.refutation_analyzing')}`
                  : `⚡ ${t('quiz_editor.refutation_analyze_btn')}`}
              </button>
            )}
            {pvArray.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const nextLen = Math.max(0, pvArray.length - 1);
                    setPvArray(pvArray.slice(0, nextLen));
                    if (previewLine === lineKey && previewStep > nextLen) {
                      if (nextLen === 0) jumpToBase();
                      else setPreviewStep(nextLen);
                    }
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px]"
                  title={t('quiz_editor.pv_undo_btn')}
                >
                  ↩
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPvArray([]);
                    if (previewLine === lineKey) jumpToBase();
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-200 border border-slate-700 text-[10px]"
                >
                  ✕
                </button>
              </>
            )}
          </div>
        </div>
        {steps.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {steps.map((step, idx) => {
              const stepNum = idx + 1;
              const isCurrent = previewLine === lineKey && previewStep === stepNum;
              return (
                <button
                  key={`${lineKey}-${step.usi}-${idx}`}
                  type="button"
                  onClick={() => jumpToStep(lineKey, stepNum)}
                  className={`px-2 py-0.5 rounded border text-[11px] font-semibold transition ${
                    isCurrent
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                  }`}
                >
                  {stepNum}. {step.label}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">
            {refutationSlot ? t('quiz_editor.d_line_empty') : t('quiz_editor.pv_empty')}
          </p>
        )}
      </div>
    );
  };

  return (
    <form
      onSubmit={handleSave}
      className="flex flex-col h-screen w-screen pb-14 md:pb-0 bg-slate-950 text-slate-100 overflow-hidden font-sans"
    >
      {/* Top Quiz Edit Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-5 py-2 bg-violet-950/90 text-slate-100 border-b border-violet-500/40 shrink-0 z-30 shadow-md">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base">🎯</span>
          <span className="font-extrabold text-xs sm:text-sm text-violet-200 whitespace-nowrap">
            {t('quiz_editor.banner_title')}
          </span>
          {title && (
            <span className="text-xs text-slate-300 truncate max-w-[160px] sm:max-w-[320px]">
              — {title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs font-bold shrink-0">
          {card.usiMovesToPosition.length === 0 && (
            <button
              type="button"
              onClick={() => {
                engine.stop();
                onEditPiecePlacement(card);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/40 transition"
            >
              🛠️ {t('quiz_editor.edit_board_btn')}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              engine.stop();
              onCancel();
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow transition"
          >
            💾 {t('quiz_editor.save_and_back_btn')}
          </button>
        </div>
      </div>

      {/* Main 3-Pane Studio Body */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
        {/* Left Pane: Quiz Line Trees & Step Preview */}
        <aside className="w-full lg:w-[290px] bg-slate-900/70 border-b lg:border-b-0 lg:border-r border-slate-800 p-3 space-y-3 lg:overflow-y-auto shrink-0">
          <button
            type="button"
            onClick={jumpToBase}
            className={`w-full px-3 py-2 rounded-lg border text-xs font-bold flex items-center justify-between transition ${
              previewLine === 'base'
                ? 'bg-amber-500 text-slate-950 border-amber-300 shadow'
                : 'bg-slate-950/70 hover:bg-slate-800 text-slate-200 border-slate-700'
            }`}
          >
            <span>📍 {t('quiz_editor.base_position_btn')}</span>
            <span className="text-[10px] font-mono">0</span>
          </button>

          {renderLineSection(
            'best',
            t('quiz_editor.pv_sequence_label'),
            bestSteps,
            bestPv,
            setBestPv,
            'text-emerald-300'
          )}

          {renderLineSection(
            'd1',
            t('quiz_editor.d1_line_label'),
            d1Steps,
            d1Pv,
            setD1Pv,
            'text-amber-300',
            1
          )}

          {renderLineSection(
            'd2',
            t('quiz_editor.d2_line_label'),
            d2Steps,
            d2Pv,
            setD2Pv,
            'text-violet-300',
            2
          )}
        </aside>

        {/* Center Pane: Interactive Shogi Board */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col items-center justify-center p-3 sm:p-4 bg-slate-950 gap-2.5 lg:overflow-y-auto">
          {/* Input Mode Switcher & Base Reset */}
          <div className="w-full max-w-[460px] flex flex-wrap items-center justify-between gap-2">
            <div className="grid grid-cols-3 flex-1 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => handleSwitchInputTarget('best')}
                className={`py-1.5 px-2 rounded-lg transition truncate ${
                  inputTarget === 'best'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ✓ {t('quiz_editor.input_target_best')}
              </button>
              <button
                type="button"
                onClick={() => handleSwitchInputTarget('d1')}
                className={`py-1.5 px-2 rounded-lg transition truncate ${
                  inputTarget === 'd1'
                    ? 'bg-amber-600 text-slate-950 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ✕ {t('quiz_editor.input_target_d1')}
              </button>
              <button
                type="button"
                onClick={() => handleSwitchInputTarget('d2')}
                className={`py-1.5 px-2 rounded-lg transition truncate ${
                  inputTarget === 'd2'
                    ? 'bg-violet-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ✕ {t('quiz_editor.input_target_d2')}
              </button>
            </div>
            {previewLine !== 'base' && (
              <button
                type="button"
                onClick={jumpToBase}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-bold shrink-0 transition"
              >
                📍 {t('quiz_editor.base_position_btn')}
              </button>
            )}
          </div>

          <p className="text-[11px] text-slate-400 text-center max-w-[460px]">
            {inputTarget === 'best'
              ? t('quiz_editor.board_hint_best')
              : t('quiz_editor.board_hint_distractor')}
          </p>

          {/* Komadai Top */}
          <StudioKomadaiView
            color={isFlipped ? 0 : 1}
            playerName={isFlipped ? t('board.sente') : t('board.gote')}
            isTurn={activeTurnColor === (isFlipped ? 0 : 1)}
            hands={isFlipped ? senteHands : goteHands}
            selectedPiece={
              activeTurnColor === (isFlipped ? 0 : 1) ? selectedHandPiece : null
            }
            onPieceSelect={(kind) => handleHandPieceSelect(isFlipped ? 0 : 1, kind)}
            selectable={activeTurnColor === (isFlipped ? 0 : 1)}
            isFlippedBoard={isFlipped}
            className="w-full max-w-[420px]"
          />

          {/* Main Kaya Board */}
          <div className="w-full max-w-[420px] aspect-[9/9.6] relative">
            <StudioShogiBoardView
              shogi={displayShogi}
              isFlipped={isFlipped}
              selectedSquare={selectedSquare}
              targetSquares={targetSquares}
              lastMove={activeSnap?.lastMove ?? null}
              candidateArrows={boardCandidateArrows}
              onSquareClick={handleSquareClick}
              className="w-full h-full"
            />
          </div>

          {/* Komadai Bottom */}
          <StudioKomadaiView
            color={isFlipped ? 1 : 0}
            playerName={isFlipped ? t('board.gote') : t('board.sente')}
            isTurn={activeTurnColor === (isFlipped ? 1 : 0)}
            hands={isFlipped ? goteHands : senteHands}
            selectedPiece={
              activeTurnColor === (isFlipped ? 1 : 0) ? selectedHandPiece : null
            }
            onPieceSelect={(kind) => handleHandPieceSelect(isFlipped ? 1 : 0, kind)}
            selectable={activeTurnColor === (isFlipped ? 1 : 0)}
            isFlippedBoard={isFlipped}
            className="w-full max-w-[420px]"
          />

          {pendingPromotion && (
            <div className="w-full max-w-[420px] rounded-lg border border-amber-500/60 bg-amber-950/70 p-2.5 flex items-center justify-between gap-2 text-xs">
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
        </main>

        {/* Right Pane: Quiz Metadata, Choice Selectors & AI MultiPV Assist */}
        <aside className="w-full lg:w-[370px] bg-slate-900/70 border-t lg:border-t-0 lg:border-l border-slate-800 p-3.5 space-y-3.5 lg:overflow-y-auto shrink-0 text-xs">
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-400">
                {t('position_editor.quiz_type_label')}
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-[11px]">
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

          {/* Correct Move Select (Japanese only) */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-400">
              {t('position_editor.quiz_best_move_label')}
            </label>
            <select
              value={bestMove}
              onChange={(e) => {
                setBestPv(e.target.value ? [e.target.value] : []);
                if (e.target.value) jumpToStep('best', 1);
              }}
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

          {/* Distractor 1 + Refutation AI */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] text-slate-400">
                {t('position_editor.quiz_distractor1_label')}
              </label>
              {distractor1 && (
                <button
                  type="button"
                  onClick={() => void handleAnalyzeDistractorRefutation(1)}
                  disabled={aiSearchMode !== 'none' && aiSearchMode !== 'd1'}
                  className="text-[10px] font-bold text-amber-300 hover:underline disabled:opacity-40"
                >
                  {aiSearchMode === 'd1'
                    ? `⏹ ${t('quiz_editor.refutation_analyzing')}`
                    : `⚡ ${t('quiz_editor.refutation_analyze_btn')}`}
                </button>
              )}
            </div>
            <select
              value={distractor1}
              onChange={(e) => {
                setD1Pv(e.target.value ? [e.target.value] : []);
                if (e.target.value) jumpToStep('d1', 1);
                else jumpToBase();
              }}
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

          {/* Distractor 2 + Refutation AI */}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] text-slate-400">
                {t('position_editor.quiz_distractor2_label')}
              </label>
              {distractor2 && (
                <button
                  type="button"
                  onClick={() => void handleAnalyzeDistractorRefutation(2)}
                  disabled={aiSearchMode !== 'none' && aiSearchMode !== 'd2'}
                  className="text-[10px] font-bold text-amber-300 hover:underline disabled:opacity-40"
                >
                  {aiSearchMode === 'd2'
                    ? `⏹ ${t('quiz_editor.refutation_analyzing')}`
                    : `⚡ ${t('quiz_editor.refutation_analyze_btn')}`}
                </button>
              )}
            </div>
            <select
              value={distractor2}
              onChange={(e) => {
                setD2Pv(e.target.value ? [e.target.value] : []);
                if (e.target.value) jumpToStep('d2', 1);
                else jumpToBase();
              }}
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

          {/* Base Position AI MultiPV Assist */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="font-bold text-slate-200 flex items-center gap-1">
                <span>🤖</span>
                <span>{t('quiz_editor.ai_assist_title')}</span>
              </div>
              <button
                type="button"
                onClick={() => void handleRunBaseAiAnalysis()}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                  aiSearchMode === 'base'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                }`}
              >
                {aiSearchMode === 'base'
                  ? `⏹ ${t('quiz_editor.ai_assist_stop')}`
                  : `🔍 ${t('quiz_editor.ai_assist_run')}`}
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <select
                value={aiMultiPv}
                onChange={(e) => setAiMultiPv(Number(e.target.value) as 5 | 8 | 10)}
                disabled={aiSearchMode !== 'none'}
                aria-label={t('quiz_editor.ai_multipv_label')}
                className="flex-1 rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-200"
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
                disabled={aiSearchMode !== 'none'}
                aria-label={t('quiz_editor.ai_depth_label')}
                className="flex-1 rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-200"
              >
                {DEPTH_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {t('quiz_editor.ai_depth_label')} {d}
                  </option>
                ))}
              </select>
            </div>

            {displayedAiCandidates.length > 0 ? (
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-0.5">
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
                      <div className="flex items-center justify-between gap-1.5">
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
                            onClick={() => {
                              const line =
                                cand.pv && cand.pv.length > 0
                                  ? cand.pv.slice(0, MAX_BEST_PV_LENGTH)
                                  : [cand.usi];
                              setBestPv(line);
                              if (distractor1 === cand.usi) setD1Pv([]);
                              if (distractor2 === cand.usi) setD2Pv([]);
                            }}
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
                            onClick={() => {
                              const line =
                                cand.pv && cand.pv.length > 0
                                  ? cand.pv.slice(0, MAX_REFUTATION_LENGTH)
                                  : [cand.usi];
                              setD1Pv(line);
                              if (distractor2 === cand.usi) setD2Pv([]);
                            }}
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
                            onClick={() => {
                              const line =
                                cand.pv && cand.pv.length > 0
                                  ? cand.pv.slice(0, MAX_REFUTATION_LENGTH)
                                  : [cand.usi];
                              setD2Pv(line);
                              if (distractor1 === cand.usi) setD1Pv([]);
                            }}
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
                {aiSearchMode === 'base'
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
              rows={3}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder={t('position_editor.quiz_explanation_placeholder')}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100"
            />
          </div>
        </aside>
      </div>
    </form>
  );
};
