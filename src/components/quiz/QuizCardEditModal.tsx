/**
 * Modal dialog for editing a TacticalQuizCard directly from the Unified Kifu Library.
 * Supports updating title, quiz category, enabled state, correct move, distractors,
 * and explanation note, plus jumping to Position Editor for board edits.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Shogi } from 'shogi.js';
import { useTranslation } from 'react-i18next';
import { auth } from '../../services/firebase';
import { uploadQuizCardToFirestore } from '../../services/firestoreKifuSync';
import type {
  QuizChoice,
  TacticalQuizCard,
  TacticalQuizType,
} from '../../types/quiz';
import type { Square } from '../../types/shogi';
import { saveQuizCard } from '../../utils/quizPoolStorage';
import { ShogiBoard } from '../../utils/shogiBoard';
import { getAllStrictLegalMoves, parseUsiMove as parseBoardUsiMove } from '../../utils/shogiRules';
import { formatUsiToJapanese } from '../../utils/usiFormatter';

export interface QuizCardEditModalProps {
  card: TacticalQuizCard | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  onEditBoardPosition: (card: TacticalQuizCard) => void;
}

const QUIZ_TYPES: readonly TacticalQuizType[] = ['attack', 'defense', 'race', 'mate'];

export const QuizCardEditModal: React.FC<QuizCardEditModalProps> = ({
  card,
  isOpen,
  onClose,
  onSaved,
  onEditBoardPosition,
}) => {
  const { t } = useTranslation();

  const [title, setTitle] = useState<string>('');
  const [type, setType] = useState<TacticalQuizType>('attack');
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [bestMove, setBestMove] = useState<string>('');
  const [distractor1, setDistractor1] = useState<string>('');
  const [distractor2, setDistractor2] = useState<string>('');
  const [explanation, setExplanation] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !card) return;
    const correctChoice = card.choices?.find((c) => c.isCorrect);
    const distractors = (card.choices ?? []).filter(
      (c) => !c.isCorrect && c.usi !== card.bestMove
    );
    setTitle(card.title ?? '');
    setType(card.type);
    setIsEnabled(card.isEnabled);
    setBestMove(card.bestMove);
    setDistractor1(distractors[0]?.usi ?? '');
    setDistractor2(distractors[1]?.usi ?? '');
    setExplanation(card.explanation ?? correctChoice?.explanation ?? '');
  }, [isOpen, card]);

  const legalMoveOptions = useMemo(() => {
    if (!card) return [];
    try {
      const board = ShogiBoard.fromSfen(card.startSfen);
      let prevTo: Square | undefined;
      card.usiMovesToPosition.forEach((usi, idx) => {
        const parsed = parseBoardUsiMove(usi, board, idx + 1, board.getTurn(), prevTo);
        if (parsed) {
          board.applyMove(parsed);
          prevTo = parsed.to;
        }
      });
      const resolvedSfen = board.toSfen();
      const legalMoves = getAllStrictLegalMoves(board, card.sideToMove);
      const shogi = new Shogi();
      shogi.initializeFromSFENString(resolvedSfen);
      const turnColor: 0 | 1 = card.sideToMove === 'w' ? 1 : 0;
      return legalMoves.map((m) => ({
        usi: m.usi,
        label: formatUsiToJapanese(m.usi, turnColor, shogi) || m.usi,
      }));
    } catch {
      return [];
    }
  }, [card]);

  if (!isOpen || !card) return null;

  const legalSet = new Set(legalMoveOptions.map((o) => o.usi));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedBest = bestMove.trim() || card.bestMove;
    const trimmedTitle = title.trim();
    const trimmedExplanation = explanation.trim();

    const prevBestChoice = card.choices?.find(
      (c) => c.usi === resolvedBest || c.isCorrect
    );
    const updatedPv =
      resolvedBest === card.bestMove && card.pv.length > 0
        ? card.pv
        : [resolvedBest];

    const nextChoices: QuizChoice[] = [
      {
        usi: resolvedBest,
        isCorrect: true,
        role: 'best',
        scoreDelta: 0,
        continuationPv:
          prevBestChoice?.usi === resolvedBest &&
          prevBestChoice.continuationPv &&
          prevBestChoice.continuationPv.length > 0
            ? prevBestChoice.continuationPv
            : updatedPv,
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
    onSaved();
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
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-xs"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <span>🎯</span>
            <span>{t('quiz_editor.modal_title')}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>

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

        {/* Best Move */}
        <div className="space-y-1">
          <label className="block text-[11px] font-bold text-slate-400">
            {t('position_editor.quiz_best_move_label')}
          </label>
          <select
            value={bestMove}
            onChange={(e) => setBestMove(e.target.value)}
            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-100"
          >
            {!legalSet.has(bestMove) && bestMove && (
              <option value={bestMove}>{bestMove}</option>
            )}
            {legalMoveOptions.map((opt) => (
              <option key={`edit-best-${opt.usi}`} value={opt.usi}>
                {opt.label} ({opt.usi})
              </option>
            ))}
          </select>
        </div>

        {/* Distractors */}
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
                <option value={distractor1}>{distractor1}</option>
              )}
              {legalMoveOptions
                .filter((m) => m.usi !== bestMove && m.usi !== distractor2)
                .map((m) => (
                  <option key={`edit-d1-${m.usi}`} value={m.usi}>
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
              value={distractor2}
              onChange={(e) => setDistractor2(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs text-slate-200"
            >
              <option value="">{t('position_editor.quiz_distractor_auto')}</option>
              {!legalSet.has(distractor2) && distractor2 && (
                <option value={distractor2}>{distractor2}</option>
              )}
              {legalMoveOptions
                .filter((m) => m.usi !== bestMove && m.usi !== distractor1)
                .map((m) => (
                  <option key={`edit-d2-${m.usi}`} value={m.usi}>
                    {m.label} ({m.usi})
                  </option>
                ))}
            </select>
          </div>
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

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
          {card.usiMovesToPosition.length === 0 ? (
            <button
              type="button"
              onClick={() => {
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
              onClick={onClose}
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
