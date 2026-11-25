/**
 * Modal dialog for registering or overwriting an edited board position
 * into the Unified Kifu Library, Tactics Notes, or Tsumego problem pool.
 * Overwrite strictly targets only the original opened item (`initialTarget`)
 * after explicit user confirmation; new saves can freely pick any category.
 * Enforces forced-mate verification before saving Tsumego problems.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Shogi } from 'shogi.js';
import { useTranslation } from 'react-i18next';
import { auth } from '../../services/firebase';
import {
  uploadKifuRecordToFirestore,
  uploadQuizCardToFirestore,
  uploadTsumegoToFirestore,
} from '../../services/firestoreKifuSync';
import type { KifuRecord } from '../../types/kifuRecord';
import type { QuizChoice, TacticalQuizCard, TacticalQuizType } from '../../types/quiz';
import type { Color, MultiPvCandidate } from '../../types/shogi';
import { TsumegoProblem } from '../../types/tsumego';
import { ShogiBoard } from '../../utils/shogiBoard';
import { getAllStrictLegalMoves } from '../../utils/shogiRules';
import { formatUsiToJapanese } from '../../utils/usiFormatter';
import {
  loadKifuRecords,
  saveKifuRecord,
  updateKifuRecord,
} from '../../utils/kifuRecordStorage';
import {
  buildUsiSequenceSnapshots,
  createJkfPlayerFromSfen,
  hasBothKingsInSfen,
} from '../../utils/positionEditor';
import { saveQuizCard } from '../../utils/quizPoolStorage';
import { syncKifuRecordToTacticsNote } from '../../utils/tacticsJkfConverter';
import {
  checkTsumeMate,
  EngineMateSearchFn,
  TsumeMateCheckResult,
} from '../../utils/tsumeMateChecker';
import {
  ManualTsumegoPvValidationResult,
  parsePvInputString,
  validateManualTsumegoPv,
} from '../../utils/tsumegoKifuExtractor';
import { loadTsumegoProblems, saveTsumegoProblem } from '../../utils/tsumegoStorage';

export type PositionSaveCategory = 'joseki' | 'study' | 'tsumego' | 'quiz';

export interface PositionSaveInitialTarget {
  category: PositionSaveCategory;
  id: string;
  title: string;
  moveLimit?: number;
  quizCard?: TacticalQuizCard;
}

export interface PositionSaveModalProps {
  isOpen: boolean;
  currentSfen: string;
  initialTarget?: PositionSaveInitialTarget | null;
  defaultCategory?: PositionSaveCategory;
  engineSearchFn?: EngineMateSearchFn;
  onClose: () => void;
  onSaved: (result: {
    category: PositionSaveCategory;
    id: string;
    title: string;
    tsumegoProblem?: TsumegoProblem;
    quizCard?: TacticalQuizCard;
  }) => void;
}

const MOVE_LIMIT_OPTIONS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21] as const;
const QUIZ_TYPES: readonly TacticalQuizType[] = ['attack', 'defense', 'race', 'mate'];

export const PositionSaveModal: React.FC<PositionSaveModalProps> = ({
  isOpen,
  currentSfen,
  initialTarget,
  defaultCategory,
  engineSearchFn,
  onClose,
  onSaved,
}) => {
  const { t } = useTranslation();

  const [saveMode, setSaveMode] = useState<'new' | 'overwrite'>('new');
  const [category, setCategory] = useState<PositionSaveCategory>('study');
  const [title, setTitle] = useState<string>('');
  const [moveLimit, setMoveLimit] = useState<number>(3);
  const [isCheckingMate, setIsCheckingMate] = useState<boolean>(false);
  const [mateResult, setMateResult] = useState<TsumeMateCheckResult | null>(null);
  const [manualPvInput, setManualPvInput] = useState<string>('');
  const [manualPvResult, setManualPvResult] = useState<ManualTsumegoPvValidationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Next-Move Quiz fields
  const [quizType, setQuizType] = useState<TacticalQuizType>('attack');
  const [quizBestMove, setQuizBestMove] = useState<string>('');
  const [quizDistractor1, setQuizDistractor1] = useState<string>('');
  const [quizDistractor2, setQuizDistractor2] = useState<string>('');
  const [quizExplanation, setQuizExplanation] = useState<string>('');
  const [quizPv, setQuizPv] = useState<string[]>([]);
  const [quizScoreCp, setQuizScoreCp] = useState<number>(0);
  const [aiQuizCandidates, setAiQuizCandidates] = useState<MultiPvCandidate[]>([]);
  const [isFetchingQuizAi, setIsFetchingQuizAi] = useState<boolean>(false);

  const sideToMove: Color = currentSfen.trim().split(/\s+/)[1] === 'w' ? 'w' : 'b';
  const turnColor: 0 | 1 = sideToMove === 'w' ? 1 : 0;
  const bothKingsPresent = useMemo(() => hasBothKingsInSfen(currentSfen), [currentSfen]);

  const legalMoveOptions = useMemo(() => {
    try {
      const board = ShogiBoard.fromSfen(currentSfen);
      const moves = getAllStrictLegalMoves(board, sideToMove);
      const shogi = new Shogi();
      shogi.initializeFromSFENString(currentSfen);
      return moves.map((m) => ({
        usi: m.usi,
        label: formatUsiToJapanese(m.usi, turnColor, shogi) || m.usi,
      }));
    } catch {
      return [];
    }
  }, [currentSfen, sideToMove, turnColor]);

  const legalUsiSet = useMemo(
    () => new Set(legalMoveOptions.map((o) => o.usi)),
    [legalMoveOptions]
  );

  useEffect(() => {
    if (!isOpen) return;

    if (initialTarget) {
      setSaveMode('overwrite');
      setCategory(initialTarget.category);
      setTitle(initialTarget.title);
      setMoveLimit(initialTarget.moveLimit ?? 3);

      const q = initialTarget.quizCard;
      if (initialTarget.category === 'quiz' && q) {
        const correctChoice = q.choices?.find((c) => c.isCorrect);
        const distractors = (q.choices ?? []).filter(
          (c) => !c.isCorrect && c.usi !== q.bestMove
        );
        setQuizType(q.type);
        setQuizBestMove(q.bestMove);
        setQuizDistractor1(distractors[0]?.usi ?? '');
        setQuizDistractor2(distractors[1]?.usi ?? '');
        setQuizExplanation(q.explanation ?? correctChoice?.explanation ?? '');
        setQuizPv(q.pv ?? [q.bestMove]);
        setQuizScoreCp(q.scoreCpBefore ?? 0);
      } else {
        setQuizType('attack');
        setQuizBestMove('');
        setQuizDistractor1('');
        setQuizDistractor2('');
        setQuizExplanation('');
        setQuizPv([]);
        setQuizScoreCp(0);
      }
    } else {
      setSaveMode('new');
      setCategory(defaultCategory ?? 'study');
      setTitle('');
      setMoveLimit(3);
      setQuizType('attack');
      setQuizBestMove('');
      setQuizDistractor1('');
      setQuizDistractor2('');
      setQuizExplanation('');
      setQuizPv([]);
      setQuizScoreCp(0);
    }

    setMateResult(null);
    setIsCheckingMate(false);
    const existingSolutionPv =
      initialTarget?.category === 'tsumego'
        ? loadTsumegoProblems().find((p) => p.id === initialTarget.id)?.solutionPv ?? []
        : [];
    setManualPvInput(existingSolutionPv.join(' '));
    setManualPvResult(null);
    setAiQuizCandidates([]);
    setIsFetchingQuizAi(false);
    setErrorMsg(null);
  }, [isOpen, currentSfen, initialTarget, defaultCategory]);

  const hasOriginalTarget = Boolean(initialTarget);

  const handleCategoryChange = (nextCat: PositionSaveCategory) => {
    if (saveMode === 'overwrite') return;
    setCategory(nextCat);
    setMateResult(null);
    setManualPvResult(null);
    setErrorMsg(null);
  };

  const handleSaveModeChange = (nextMode: 'new' | 'overwrite') => {
    if (nextMode === 'overwrite' && !initialTarget) return;
    setSaveMode(nextMode);
    setErrorMsg(null);
    if (nextMode === 'overwrite' && initialTarget) {
      setCategory(initialTarget.category);
      setTitle(initialTarget.title);
      setMoveLimit(initialTarget.moveLimit ?? 3);
      setMateResult(null);
      setManualPvResult(null);
    }
  };

  if (!isOpen) return null;

  const handleRunMateCheck = async () => {
    setIsCheckingMate(true);
    setMateResult(null);
    setErrorMsg(null);
    try {
      const res = await checkTsumeMate(currentSfen, moveLimit, engineSearchFn);
      setMateResult(res);
    } finally {
      setIsCheckingMate(false);
    }
  };

  const handleVerifyManualPv = () => {
    setErrorMsg(null);
    const tokens = parsePvInputString(manualPvInput);
    const validation = validateManualTsumegoPv(currentSfen, tokens);
    setManualPvResult(validation);
  };

  const handleSuggestQuizWithAi = async () => {
    if (!engineSearchFn || !bothKingsPresent) return;
    setIsFetchingQuizAi(true);
    setErrorMsg(null);
    try {
      const res = await engineSearchFn(currentSfen, undefined, {
        depth: 12,
        movetime: 2500,
      });
      const evalData = res.evaluation;
      const rawCandidates = evalData?.candidates ?? [];
      const legalCands = rawCandidates.filter((c) => legalUsiSet.has(c.usi));
      const fallbackBest = evalData?.bestMove || res.bestMove;

      if (legalCands.length > 0) {
        setAiQuizCandidates(legalCands);
        const top = legalCands[0]!;
        setQuizBestMove(top.usi);
        setQuizPv(top.pv && top.pv.length > 0 ? top.pv.slice(0, 5) : [top.usi]);
        setQuizScoreCp(top.scoreCp);
        if (legalCands[1]) setQuizDistractor1(legalCands[1].usi);
        if (legalCands[2]) setQuizDistractor2(legalCands[2].usi);
      } else if (fallbackBest && legalUsiSet.has(fallbackBest)) {
        const synthesized: MultiPvCandidate = {
          multipv: 1,
          usi: fallbackBest,
          scoreCp: evalData?.scoreCp ?? 0,
          pv: evalData?.pv ?? [fallbackBest],
        };
        setAiQuizCandidates([synthesized]);
        setQuizBestMove(fallbackBest);
        setQuizPv(synthesized.pv ?? [fallbackBest]);
        setQuizScoreCp(synthesized.scoreCp);
      }
    } catch (err) {
      console.warn('[PositionSaveModal] AI quiz suggestion failed:', err);
    } finally {
      setIsFetchingQuizAi(false);
    }
  };

  const isOverwrite = saveMode === 'overwrite';
  const canOverwrite = !isOverwrite || hasOriginalTarget;
  const hasVerifiedMate =
    mateResult?.hasMate === true || manualPvResult?.valid === true;
  const canSubmit =
    Boolean(title.trim()) &&
    canOverwrite &&
    (category !== 'tsumego' || hasVerifiedMate) &&
    (category !== 'quiz' || (Boolean(quizBestMove) && legalUsiSet.has(quizBestMove))) &&
    !isCheckingMate &&
    !isFetchingQuizAi;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMsg(t('position_editor.name_required'));
      return;
    }

    if (category === 'tsumego' && !hasVerifiedMate) {
      setErrorMsg(t('position_editor.mate_check_required_hint'));
      return;
    }

    if (category === 'quiz' && (!quizBestMove || !legalUsiSet.has(quizBestMove))) {
      setErrorMsg(t('position_editor.quiz_best_move_required'));
      return;
    }

    if (isOverwrite && initialTarget) {
      if (!window.confirm(t('position_editor.overwrite_confirm', { title: initialTarget.title }))) {
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const uid = auth?.currentUser?.uid;
    const jkfPlayer = createJkfPlayerFromSfen(currentSfen, {
      '先手': t('board.sente'),
      '後手': t('board.gote'),
      '棋戦': trimmedTitle,
    });
    const jkfJson = JSON.stringify(jkfPlayer.kifu);

    if (category === 'joseki' || category === 'study') {
      const targetKind = category === 'joseki' ? 'joseki' : 'other';
      const defaultTag = category === 'joseki' ? '定跡' : '研究';
      const existing =
        isOverwrite && initialTarget
          ? loadKifuRecords().find((r) => r.id === initialTarget.id)
          : undefined;

      if (isOverwrite && initialTarget && existing) {
        const updated = updateKifuRecord(initialTarget.id, {
          title: trimmedTitle,
          jkfJson,
          totalPlies: 0,
          tags: Array.from(new Set([...(existing.tags ?? []), '登録局面', defaultTag])),
          gameKind: targetKind,
        });
        if (updated) {
          if (updated.id.startsWith('tactic_game_')) {
            syncKifuRecordToTacticsNote(updated);
          }
          if (uid) {
            void uploadKifuRecordToFirestore(uid, updated);
          }
        }
        onSaved({ category, id: initialTarget.id, title: trimmedTitle });
      } else {
        const idPrefix = category === 'joseki' ? 'custom_joseki' : 'custom_pos';
        const newId =
          isOverwrite && initialTarget ? initialTarget.id : `${idPrefix}_${Date.now()}`;
        const newRecord: KifuRecord = {
          id: newId,
          title: trimmedTitle,
          contentHash: newId,
          source: 'studio',
          senteName: t('board.sente'),
          goteName: t('board.gote'),
          openingId: 'unknown',
          openingName: category === 'joseki' ? trimmedTitle : '',
          totalPlies: 0,
          jkfJson,
          tags: ['登録局面', defaultTag],
          gameKind: targetKind,
          isIncludedInTree: false,
          createdAt: nowIso,
          updatedAt: nowIso,
          reviewStatus: 'read',
        };
        saveKifuRecord(newRecord);
        if (uid) {
          void uploadKifuRecordToFirestore(uid, newRecord);
        }
        onSaved({ category, id: newId, title: trimmedTitle });
      }
      onClose();
      return;
    }

    if (category === 'quiz') {
      const existingQuiz = isOverwrite ? initialTarget?.quizCard : undefined;
      const trimmedExplanation = quizExplanation.trim();
      const effectivePv =
        quizPv.length > 0 && quizPv[0] === quizBestMove
          ? quizPv
          : [quizBestMove];

      const choices: QuizChoice[] = [
        {
          usi: quizBestMove,
          isCorrect: true,
          role: 'best',
          scoreDelta: 0,
          continuationPv: effectivePv,
          explanation:
            trimmedExplanation || t('position_editor.quiz_default_best_explanation'),
        },
      ];

      const seenUsi = new Set<string>([quizBestMove]);
      for (const d of [quizDistractor1, quizDistractor2]) {
        if (!d || seenUsi.has(d) || !legalUsiSet.has(d)) continue;
        seenUsi.add(d);
        choices.push({
          usi: d,
          isCorrect: false,
          role: 'blunder',
          scoreDelta: -300,
          continuationPv: [d],
          explanation: t('position_editor.quiz_default_distractor_explanation'),
        });
      }

      for (const opt of legalMoveOptions) {
        if (choices.length >= 3) break;
        if (seenUsi.has(opt.usi)) continue;
        seenUsi.add(opt.usi);
        choices.push({
          usi: opt.usi,
          isCorrect: false,
          role: 'blunder',
          scoreDelta: -300,
          continuationPv: [opt.usi],
          explanation: t('position_editor.quiz_default_distractor_explanation'),
        });
      }
      choices.sort((a, b) => a.usi.localeCompare(b.usi));

      const card: TacticalQuizCard = {
        id:
          isOverwrite && initialTarget
            ? initialTarget.id
            : `manual_quiz_${Date.now()}`,
        title: trimmedTitle,
        source: existingQuiz?.source ?? 'manual',
        sourceGameId: existingQuiz?.sourceGameId ?? 'manual',
        openingId: existingQuiz?.openingId ?? 'manual',
        type: quizType,
        ply: existingQuiz?.ply ?? 0,
        startSfen: currentSfen,
        usiMovesToPosition: [],
        sideToMove,
        bestMove: quizBestMove,
        pv: effectivePv,
        scoreCpBefore: quizScoreCp,
        explanation: trimmedExplanation || undefined,
        choices,
        isEnabled: existingQuiz?.isEnabled ?? true,
        createdAt: existingQuiz?.createdAt ?? nowIso,
        updatedAt: nowIso,
      };
      saveQuizCard(card);
      if (uid) {
        void uploadQuizCardToFirestore(uid, card);
      }
      onSaved({
        category: 'quiz',
        id: card.id,
        title: trimmedTitle,
        quizCard: card,
      });
      onClose();
      return;
    }

    // Tsumego category (either engine mateResult or verified manual PV is required above)
    const existingTsume =
      isOverwrite && initialTarget
        ? loadTsumegoProblems().find((p) => p.id === initialTarget.id)
        : undefined;
    const effectiveMoveLimit = mateResult?.hasMate
      ? mateResult.matePly ?? moveLimit
      : manualPvResult?.matePly ?? moveLimit;
    const effectiveSolutionPv = mateResult?.hasMate
      ? mateResult.solutionPv ?? []
      : manualPvResult?.normalizedPv ?? [];
    const problem: TsumegoProblem = {
      id: isOverwrite && initialTarget ? initialTarget.id : `custom-tsume-${Date.now()}`,
      title: trimmedTitle,
      source: 'manual',
      kind: 'attack',
      startSfen: currentSfen,
      sideToMove,
      moveLimit: effectiveMoveLimit,
      solutionPv: effectiveSolutionPv,
      acceptAllMatingMoves: true,
      tags: [t('position_editor.move_limit_fmt', { count: effectiveMoveLimit })],
      createdAt: existingTsume?.createdAt ?? Date.now(),
      updatedAt: nowIso,
    };
    saveTsumegoProblem(problem);
    if (uid) {
      void uploadTsumegoToFirestore(uid, problem);
    }
    onSaved({
      category: 'tsumego',
      id: problem.id,
      title: trimmedTitle,
      tsumegoProblem: problem,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <span>💾</span>
            <span>{t('position_editor.save_modal_title')}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>

        {/* Save Mode: New vs Overwrite (only enabled when editing an existing item) */}
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => handleSaveModeChange('new')}
              className={`py-1.5 rounded-lg transition ${
                saveMode === 'new'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('position_editor.save_mode_new')}
            </button>
            <button
              type="button"
              disabled={!hasOriginalTarget}
              onClick={() => handleSaveModeChange('overwrite')}
              className={`py-1.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed ${
                saveMode === 'overwrite'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('position_editor.save_mode_overwrite')}
            </button>
          </div>
          {!hasOriginalTarget && (
            <p className="text-[11px] text-slate-400">
              {t('position_editor.overwrite_only_when_saved')}
            </p>
          )}
        </div>

        {/* Read-only Overwrite Target Card */}
        {isOverwrite && initialTarget && (
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-400">
              {t('position_editor.overwrite_target_readonly')}
            </label>
            <div className="rounded-lg bg-slate-950/80 border border-amber-500/40 px-3 py-2 text-xs text-amber-100 font-semibold truncate">
              {initialTarget.title}
            </div>
          </div>
        )}

        {/* Category Selector (Locked to original item's category when overwriting) */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold text-slate-400">
            {t('position_editor.category_label')}
          </label>
          <div className="grid grid-cols-1 gap-1.5 text-xs">
            {(
              [
                { id: 'study', label: t('position_editor.category_study'), icon: '🌳' },
                { id: 'joseki', label: t('position_editor.category_joseki'), icon: '📖' },
                { id: 'tsumego', label: t('position_editor.category_tsumego'), icon: '🧩' },
                { id: 'quiz', label: t('position_editor.category_quiz'), icon: '🎯' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={isOverwrite && opt.id !== initialTarget?.category}
                onClick={() => handleCategoryChange(opt.id)}
                className={`text-left px-3 py-2 rounded-lg border font-semibold transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                  category === opt.id
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                    : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <span>{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Position / Problem Name */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold text-slate-400">
            {t('position_editor.name_label')}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('position_editor.name_placeholder')}
            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        {/* Tsumego Mate Verification Section */}
        {category === 'tsumego' && (
          <div className="rounded-xl border border-amber-500/30 bg-slate-950/70 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-bold text-slate-300">
                {t('position_editor.move_limit_label')}
              </label>
              <select
                value={moveLimit}
                onChange={(e) => {
                  setMoveLimit(Number(e.target.value));
                  setMateResult(null);
                }}
                className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1 text-xs text-slate-100"
              >
                {MOVE_LIMIT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {t('position_editor.move_limit_fmt', { count: n })}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              disabled={isCheckingMate}
              onClick={() => void handleRunMateCheck()}
              className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold transition shadow"
            >
              {isCheckingMate
                ? t('position_editor.checking_mate')
                : `🔍 ${t('position_editor.check_mate_btn')}`}
            </button>

            {mateResult ? (
              mateResult.hasMate ? (() => {
                const mateLine =
                  mateResult.solutionPv && mateResult.solutionPv.length > 0
                    ? buildUsiSequenceSnapshots(currentSfen, mateResult.solutionPv)
                    : [];
                return (
                  <div className="rounded-lg bg-emerald-950/60 border border-emerald-500/50 px-3 py-2 text-xs text-emerald-200 font-semibold space-y-1">
                    <div>
                      ✓ {t('position_editor.mate_found', { ply: mateResult.matePly ?? moveLimit })}
                    </div>
                    {mateLine.length > 0 && (
                      <div className="text-[11px] font-normal text-emerald-100/90 leading-relaxed break-words">
                        {mateLine.map((s) => `${s.index}. ${s.label}`).join('  ')}
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="rounded-lg bg-rose-950/60 border border-rose-500/50 px-3 py-2 text-xs text-rose-200 font-semibold">
                  ✕ {t(mateResult.reasonKey ?? 'position_editor.mate_not_found')}
                </div>
              )
            ) : (
              <p className="text-[11px] text-amber-300/80">
                {t('position_editor.mate_check_required_hint')}
              </p>
            )}

            {(moveLimit >= 9 || mateResult?.hasMate === false) && (
              <div className="pt-2.5 mt-2.5 border-t border-slate-800 space-y-2">
                <label className="block text-[11px] font-bold text-slate-300">
                  {t('position_editor.manual_pv_title')}
                </label>
                <textarea
                  rows={2}
                  value={manualPvInput}
                  onChange={(e) => {
                    setManualPvInput(e.target.value);
                    setManualPvResult(null);
                  }}
                  placeholder={t('position_editor.manual_pv_placeholder')}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <button
                  type="button"
                  onClick={handleVerifyManualPv}
                  className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-200 border border-slate-600 text-xs font-bold transition"
                >
                  ✓ {t('position_editor.manual_pv_verify_btn')}
                </button>
                {manualPvResult &&
                  (manualPvResult.valid ? (
                    <div className="rounded-lg bg-emerald-950/60 border border-emerald-500/50 px-3 py-2 text-xs text-emerald-200 font-semibold">
                      ✓ {t('position_editor.manual_pv_valid', { ply: manualPvResult.matePly })}
                    </div>
                  ) : (
                    <div className="rounded-lg bg-rose-950/60 border border-rose-500/50 px-3 py-2 text-xs text-rose-200 font-semibold">
                      ✕{' '}
                      {t(
                        manualPvResult.reasonKey ??
                          'position_editor.manual_pv_invalid_not_mate'
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* Next-Move Quiz Section */}
        {category === 'quiz' && (
          <div className="rounded-xl border border-violet-500/30 bg-slate-950/70 p-3 space-y-3 text-xs">
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-300">
                {t('position_editor.quiz_type_label')}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
                {QUIZ_TYPES.map((qt) => (
                  <button
                    key={qt}
                    type="button"
                    onClick={() => setQuizType(qt)}
                    className={`px-2 py-1 rounded border text-[11px] font-semibold transition ${
                      quizType === qt
                        ? 'bg-violet-500/25 border-violet-400/70 text-violet-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t(`quiz.type.${qt}`)}
                  </button>
                ))}
              </div>
            </div>

            {engineSearchFn && bothKingsPresent ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={isFetchingQuizAi}
                  onClick={() => void handleSuggestQuizWithAi()}
                  className="w-full py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold transition shadow"
                >
                  {isFetchingQuizAi
                    ? t('position_editor.quiz_ai_suggesting')
                    : `🤖 ${t('position_editor.quiz_ai_suggest_btn')}`}
                </button>
                {aiQuizCandidates.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] text-slate-400">
                      {t('position_editor.quiz_ai_candidates_label')}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {aiQuizCandidates.map((cand) => {
                        const opt = legalMoveOptions.find((o) => o.usi === cand.usi);
                        return (
                          <button
                            key={cand.usi}
                            type="button"
                            onClick={() => {
                              setQuizBestMove(cand.usi);
                              setQuizPv(
                                cand.pv && cand.pv.length > 0 ? cand.pv.slice(0, 5) : [cand.usi]
                              );
                              setQuizScoreCp(cand.scoreCp);
                            }}
                            className={`px-2 py-0.5 rounded border text-[11px] font-semibold transition ${
                              quizBestMove === cand.usi
                                ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                                : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-violet-400'
                            }`}
                          >
                            {opt?.label ?? cand.usi} ({cand.scoreCp > 0 ? `+${cand.scoreCp}` : cand.scoreCp})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : !bothKingsPresent ? (
              <p className="text-[11px] text-slate-400">
                {t('position_editor.quiz_ai_needs_both_kings')}
              </p>
            ) : null}

            {legalMoveOptions.length === 0 ? (
              <p className="text-[11px] text-rose-300">
                {t('position_editor.quiz_no_legal_moves')}
              </p>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-300">
                    {t('position_editor.quiz_best_move_label')}
                  </label>
                  <select
                    value={quizBestMove}
                    onChange={(e) => {
                      const nextUsi = e.target.value;
                      setQuizBestMove(nextUsi);
                      if (nextUsi) setQuizPv([nextUsi]);
                    }}
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-100"
                  >
                    <option value="">{t('position_editor.quiz_select_move_placeholder')}</option>
                    {legalMoveOptions.map((m) => (
                      <option key={`best-${m.usi}`} value={m.usi}>
                        {m.label} ({m.usi})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[11px] text-slate-400">
                      {t('position_editor.quiz_distractor1_label')}
                    </label>
                    <select
                      value={quizDistractor1}
                      onChange={(e) => setQuizDistractor1(e.target.value)}
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-200"
                    >
                      <option value="">{t('position_editor.quiz_distractor_auto')}</option>
                      {legalMoveOptions
                        .filter((m) => m.usi !== quizBestMove && m.usi !== quizDistractor2)
                        .map((m) => (
                          <option key={`d1-${m.usi}`} value={m.usi}>
                            {m.label} ({m.usi})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] text-slate-400">
                      {t('position_editor.quiz_distractor2_label')}
                    </label>
                    <select
                      value={quizDistractor2}
                      onChange={(e) => setQuizDistractor2(e.target.value)}
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2 py-1 text-xs text-slate-200"
                    >
                      <option value="">{t('position_editor.quiz_distractor_auto')}</option>
                      {legalMoveOptions
                        .filter((m) => m.usi !== quizBestMove && m.usi !== quizDistractor1)
                        .map((m) => (
                          <option key={`d2-${m.usi}`} value={m.usi}>
                            {m.label} ({m.usi})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-400">
                    {t('position_editor.quiz_explanation_label')}
                  </label>
                  <textarea
                    rows={2}
                    value={quizExplanation}
                    onChange={(e) => setQuizExplanation(e.target.value)}
                    placeholder={t('position_editor.quiz_explanation_placeholder')}
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-100"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="rounded-lg bg-rose-950/60 border border-rose-500/50 px-3 py-2 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
          >
            {t('position_editor.cancel')}
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition shadow"
          >
            {t('position_editor.save_submit_btn')}
          </button>
        </div>
      </form>
    </div>
  );
};
