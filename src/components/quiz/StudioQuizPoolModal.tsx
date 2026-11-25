/**
 * Studio Tactical Quiz Pool Management Modal.
 * Specialized modal dedicated exclusively to managing, filtering, toggling,
 * and regenerating extracted tactical quiz cards (replaces heavy pop-up practice modal).
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript typed without 'any' (Rule 2).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TacticalQuizCard } from '../../types/quiz';
import { loadQuizPool, saveQuizPool, setQuizEnabled, clearQuizPool } from '../../utils/quizPoolStorage';
import { clearQuizProgress } from '../../utils/quizProgressStorage';
import { QuizPoolManager } from './QuizPoolManager';
import { SavedStudioGame } from '../../utils/studioKifuStorage';
import { regenerateAllStudioQuizzes } from '../../utils/studioQuizExtractor';
import {
  deleteQuizCardFromFirestore,
  ensureKifuRecordPayload,
  uploadQuizBatchToFirestore,
  uploadQuizCardToFirestore,
} from '../../services/firestoreKifuSync';
import { kifuRecordToStudioGame } from '../../utils/kifuRecordCodec';
import { useAuth } from '../../contexts/AuthContext';

import { UseShogiEngineReturn } from '../../hooks/useShogiEngine';
import { EngineProfile, resolveEngineDisplayName } from '../../engine/engineConfig';

export interface StudioQuizPoolModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedGames: SavedStudioGame[];
  engine?: UseShogiEngineReturn;
  onSelectCardForPractice?: (cardId: string) => void;
  onPoolChanged?: () => void;
}

export const StudioQuizPoolModal: React.FC<StudioQuizPoolModalProps> = ({
  isOpen,
  onClose,
  savedGames,
  engine,
  onSelectCardForPractice,
  onPoolChanged,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [cards, setCards] = useState<TacticalQuizCard[]>(() => loadQuizPool());
  const [regenerateToast, setRegenerateToast] = useState<string | null>(null);

  // Sync cards whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setCards(loadQuizPool());
    }
  }, [isOpen]);

  // Map gameId -> title and openingId -> name for labels
  const gameTitles = useMemo(() => {
    const map: Record<string, string> = {};
    savedGames.forEach((g) => {
      map[g.id] = g.title;
    });
    return map;
  }, [savedGames]);

  const openingNames = useMemo(() => {
    const map: Record<string, string> = {};
    savedGames.forEach((g) => {
      if (g.openingId && g.openingName) {
        map[g.openingId] = g.openingName;
      }
    });
    return map;
  }, [savedGames]);

  const handleToggleCard = (id: string, enabled: boolean) => {
    const updated = setQuizEnabled(cards, [id], enabled);
    setCards(updated);
    saveQuizPool(updated);
    const updatedCard = updated.find((c) => c.id === id);
    if (user?.uid && updatedCard) {
      void uploadQuizCardToFirestore(user.uid, updatedCard);
    }
    onPoolChanged?.();
  };

  const handleBulkToggle = (ids: string[], enabled: boolean) => {
    const updated = setQuizEnabled(cards, ids, enabled);
    setCards(updated);
    saveQuizPool(updated);
    if (user?.uid) {
      const idSet = new Set(ids);
      void uploadQuizBatchToFirestore(
        user.uid,
        updated.filter((c) => idSet.has(c.id))
      );
    }
    onPoolChanged?.();
  };

  const handleRegeneratePool = async () => {
    const hydratedGames = await Promise.all(
      savedGames.map(async (g) => {
        if (g.evaluations && Object.keys(g.evaluations).length > 0 && g.jkfJson && g.jkfJson !== '{}') {
          return g;
        }
        const full = await ensureKifuRecordPayload(user?.uid, g.id);
        return full ? kifuRecordToStudioGame(full) : g;
      })
    );
    const count = regenerateAllStudioQuizzes(hydratedGames);
    const fresh = loadQuizPool();
    setCards(fresh);
    if (user?.uid && fresh.length > 0) {
      void uploadQuizBatchToFirestore(user.uid, fresh);
    }
    onPoolChanged?.();
    setRegenerateToast(t('quiz.pool.regenerate_success_toast', { count }));
    setTimeout(() => {
      setRegenerateToast(null);
    }, 4000);
  };

  const handleClearPool = () => {
    if (!window.confirm(t('quiz.pool.clear_all_confirm'))) return;
    const prevIds = cards.map((c) => c.id);
    clearQuizPool();
    clearQuizProgress();
    setCards([]);
    if (user?.uid && prevIds.length > 0) {
      void Promise.all(
        prevIds.map((id) => deleteQuizCardFromFirestore(user.uid, id))
      );
    }
    onPoolChanged?.();
    setRegenerateToast(t('quiz.pool.clear_success_toast'));
    setTimeout(() => {
      setRegenerateToast(null);
    }, 4000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in font-sans">
      {/* Toast Notification */}
      {regenerateToast !== null && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs shadow-2xl border border-emerald-300 animate-bounce flex items-center gap-2">
          <span>🔄</span>
          <span>{regenerateToast}</span>
        </div>
      )}

      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden">
        {/* Modal Top Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-3.5 bg-slate-950/90 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-xl">🗂️</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
                  {t('quiz.pool.title')} ({cards.length}問)
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                  {t('quiz.pool.enabled_count_badge', '{{count}}問 有効', { count: cards.filter((c) => c.isEnabled).length })}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                {t('quiz.pool.header_desc', '保存済み棋譜の形勢急変点・悪手・妙手から抽出されたクイズ問題の管理')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            title={t('common.close')}
          >
            ✕
          </button>
        </div>

        {/* Engine Selection Bar for Quiz Generation */}
        {engine && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-2.5 bg-slate-900 border-b border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-bold flex items-center gap-1.5">
                <span>⚙️</span>
                <span>{t('quiz.pool.engine_select_label', 'クイズ生成・検証AI:')}</span>
              </span>
              <select
                value={engine.activeEngineId}
                onChange={(e) => engine.switchEngine(e.target.value as any)}
                className="bg-slate-950 border border-slate-700 text-amber-300 font-bold rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-amber-500 shadow-inner"
              >
                {engine.availableEngines.map((eng: EngineProfile) => (
                  <option key={eng.id} value={eng.id}>
                    {resolveEngineDisplayName(eng, t)}
                  </option>
                ))}
              </select>
            </div>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              {t('quiz.pool.engine_verify_desc', '選択中のエンジンで悪手・継続手を厳密検証します')}
            </span>
          </div>
        )}

        {/* Modal Body: Quiz Pool Manager */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 bg-slate-950/60">
          <QuizPoolManager
            cards={cards}
            gameTitles={gameTitles}
            openingNames={openingNames}
            onToggleCard={handleToggleCard}
            onBulkToggle={handleBulkToggle}
            onRequestAnalysis={() => {}}
            onRegenerate={handleRegeneratePool}
            onClearAll={handleClearPool}
            onStartPractice={() => {
              const firstCard = cards.find((c) => c.isEnabled);
              if (firstCard && onSelectCardForPractice) {
                onSelectCardForPractice(firstCard.id);
              }
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
};
