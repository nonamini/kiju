/**
 * Tactical Quiz Pool Manager Dashboard Component.
 * Allows filtering, inspecting, batch toggling, and regenerating extracted tactical quizzes.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TacticalQuizCard, TacticalQuizType } from '../../types/quiz';
import {
  countByOpening,
  filterQuizCards,
  QuizFilter,
} from '../../utils/quizPoolFilter';
import { QuizPositionPreview } from './QuizPositionPreview';

export interface QuizPoolManagerProps {
  cards: TacticalQuizCard[];
  gameTitles?: Record<string, string>; // gameId -> title
  openingNames?: Record<string, string>; // openingId -> display name
  availableGames?: Array<{ id: string; title: string; movesCount: number; isAnalyzed: boolean }>;
  unanalyzedGameCount?: number;
  onToggleCard: (id: string, enabled: boolean) => void;
  onBulkToggle: (ids: string[], enabled: boolean) => void;
  onRequestAnalysis: () => void; // opens batch analysis modal
  onRegenerate: () => void;
  onClearAll?: () => void;
  onGenerateFromGame?: (gameId: string) => void;
  onStartPractice?: () => void;
  className?: string;
}

const TYPE_CONFIG: Record<
  TacticalQuizType,
  { icon: string; labelKey: string; badgeClass: string }
> = {
  attack: {
    icon: '🔥',
    labelKey: 'quiz.type.attack',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  defense: {
    icon: '🛡️',
    labelKey: 'quiz.type.defense',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  },
  race: {
    icon: '⚖️',
    labelKey: 'quiz.type.race',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  },
  mate: {
    icon: '👑',
    labelKey: 'quiz.type.mate',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
};

export const QuizPoolManager: React.FC<QuizPoolManagerProps> = ({
  cards,
  gameTitles = {},
  openingNames = {},
  availableGames = [],
  unanalyzedGameCount = 0,
  onToggleCard,
  onBulkToggle,
  onRequestAnalysis,
  onRegenerate,
  onClearAll,
  onGenerateFromGame,
  onStartPractice,
  className,
}) => {
  const { t } = useTranslation();

  // Local state for target game to generate quiz from
  const [targetGenerateGameId, setTargetGenerateGameId] = useState<string>('');

  // Local filter states
  const [selectedOpening, setSelectedOpening] = useState<string>('');
  const [selectedType, setSelectedType] = useState<TacticalQuizType | ''>('');
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [enabledOnly, setEnabledOnly] = useState<boolean>(false);

  // Distinct opening IDs & game IDs present in cards
  const distinctOpenings = useMemo(() => {
    return Array.from(new Set(cards.map((c) => c.openingId)));
  }, [cards]);

  const distinctGames = useMemo(() => {
    return Array.from(new Set(cards.map((c) => c.sourceGameId)));
  }, [cards]);

  // Per-opening counts
  const openingCounts = useMemo(() => {
    return countByOpening(cards);
  }, [cards]);

  // Filter application
  const filter: QuizFilter = useMemo(
    () => ({
      openingId: selectedOpening || undefined,
      type: (selectedType || undefined) as TacticalQuizType | undefined,
      gameId: selectedGameId || undefined,
      enabledOnly: enabledOnly || undefined,
    }),
    [selectedOpening, selectedType, selectedGameId, enabledOnly]
  );

  const filteredCards = useMemo(() => {
    return filterQuizCards(cards, filter);
  }, [cards, filter]);

  const totalEnabled = useMemo(() => {
    return cards.filter((c) => c.isEnabled).length;
  }, [cards]);

  const filteredIds = useMemo(() => {
    return filteredCards.map((c) => c.id);
  }, [filteredCards]);

  return (
    <div className={`space-y-4 text-slate-200 ${className ?? ''}`}>
      {/* 1. Header with title, summary and regenerate action */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎯</span>
            <h2 className="text-base font-bold text-slate-100">
              {t('quiz.pool.title')}
            </h2>
          </div>
          <p className="font-mono text-xs text-slate-400">
            {t('quiz.pool.summary', {
              enabled: totalEnabled,
              total: cards.length,
            })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onStartPractice && (
            <button
              type="button"
              onClick={onStartPractice}
              disabled={totalEnabled === 0}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-bold text-white shadow-md transition hover:from-emerald-500 hover:to-teal-500 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            >
              <span>⚔️</span>
              <span>{t('quiz.player.start_btn')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRegenerate}
            className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-950/70 to-slate-900 px-3.5 py-2 text-xs font-bold text-amber-300 shadow-sm transition hover:from-amber-900/80 hover:to-slate-800 active:scale-95"
          >
            <span>🔄</span>
            <span>{t('quiz.pool.regenerate')}</span>
          </button>

          {onClearAll && cards.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-900/60 active:scale-95 shadow-sm"
              title={t('quiz.pool.clear_all')}
            >
              <span>🗑️</span>
              <span>{t('quiz.pool.clear_all')}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Explicit Quiz Extraction from Imported Games */}
      {availableGames && availableGames.length > 0 && onGenerateFromGame && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 shadow-sm">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
              <span>📥</span>
              <span>{t('quiz.pool.generate_from_game')}</span>
            </div>
            <p className="text-[11px] text-slate-400">
              {t('quiz.pool.generate_from_game_desc')}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={targetGenerateGameId}
              onChange={(e) => setTargetGenerateGameId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 font-medium max-w-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="">{t('quiz.pool.select_game_placeholder')}</option>
              {availableGames.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title} ({g.movesCount}手) {g.isAnalyzed ? '✓' : '⚡'}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                if (targetGenerateGameId) {
                  onGenerateFromGame(targetGenerateGameId);
                }
              }}
              disabled={!targetGenerateGameId}
              className="flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 px-3.5 py-1.5 text-xs font-bold transition shadow disabled:opacity-40 disabled:pointer-events-none active:scale-95"
            >
              <span>🎯</span>
              <span>{t('quiz.pool.generate_btn')}</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. Unanalyzed games prompt banner */}
      {unanalyzedGameCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <span className="text-base">⚡</span>
            <span>
              {t('quiz.pool.unanalyzed_prompt', { count: unanalyzedGameCount })}
            </span>
          </div>
          <button
            type="button"
            onClick={onRequestAnalysis}
            className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-bold text-slate-950 transition hover:bg-amber-500 active:scale-95"
          >
            {t('quiz.pool.analyze_btn')}
          </button>
        </div>
      )}

      {/* 3. Filter Bar */}
      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/80 p-3.5 shadow-md">
        <div className="flex flex-wrap items-center gap-2">
          {/* Type chips */}
          <button
            type="button"
            onClick={() => setSelectedType('')}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
              selectedType === ''
                ? 'bg-slate-700 text-white'
                : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('quiz.pool.filter_all')}
          </button>

          {(['attack', 'defense', 'race', 'mate'] as TacticalQuizType[]).map(
            (typeKey) => {
              const info = TYPE_CONFIG[typeKey];
              const isSelected = selectedType === typeKey;
              return (
                <button
                  key={typeKey}
                  type="button"
                  onClick={() => setSelectedType(isSelected ? '' : typeKey)}
                  className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                    isSelected
                      ? `${info.badgeClass} ring-1 ring-amber-400/50 shadow-sm`
                      : 'border-slate-800 bg-slate-800/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span>{info.icon}</span>
                  <span>{t(info.labelKey)}</span>
                </button>
              );
            }
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
          {/* Opening dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">📁</span>
            <select
              value={selectedOpening}
              onChange={(e) => setSelectedOpening(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="">
                📁 {t('quiz.pool.filter_all')} ({cards.length})
              </option>
              {distinctOpenings.map((opId) => (
                <option key={opId} value={opId}>
                  {openingNames[opId] || opId}
                </option>
              ))}
            </select>
          </div>

          {/* Game dropdown */}
          {distinctGames.length > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">📜</span>
              <select
                value={selectedGameId}
                onChange={(e) => setSelectedGameId(e.target.value)}
                className="max-w-[200px] truncate rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="">📜 {t('quiz.pool.filter_all')}</option>
                {distinctGames.map((gId) => (
                  <option key={gId} value={gId}>
                    {gameTitles[gId] || gId}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Enabled only toggle */}
          <label className="flex cursor-pointer items-center gap-1.5 select-none">
            <input
              type="checkbox"
              checked={enabledOnly}
              onChange={(e) => setEnabledOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-0"
            />
            <span className="text-slate-300">{t('quiz.pool.enabled_only')}</span>
          </label>
        </div>

        {/* 4. Per-opening counts strip */}
        {distinctOpenings.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/80 pt-2 text-[11px] text-slate-400">
            {distinctOpenings.map((opId) => {
              const stats = openingCounts[opId] ?? { total: 0, enabled: 0 };
              return (
                <span
                  key={opId}
                  className="rounded bg-slate-800/70 px-2 py-0.5 font-mono text-slate-300"
                >
                  {openingNames[opId] || opId}:{' '}
                  <span className="text-amber-400">{stats.enabled}</span>/
                  {stats.total}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Card Grid */}
      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 py-12 text-center text-xs text-slate-500">
          <p>{t('quiz.pool.empty')}</p>
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 py-12 text-center text-xs text-slate-500">
          <p>{t('quiz.pool.no_match')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredCards.map((card) => {
            const info = TYPE_CONFIG[card.type];
            return (
              <div
                key={card.id}
                className={`flex flex-col gap-3 rounded-xl border p-3.5 transition shadow-sm ${
                  card.isEnabled
                    ? 'border-slate-800 bg-slate-900/90 hover:border-slate-700'
                    : 'border-slate-850 bg-slate-950/70 opacity-60'
                }`}
              >
                {/* Card Top: Type badge, ply, game title, and enable toggle */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold ${info.badgeClass}`}
                    >
                      <span>{info.icon}</span>
                      <span>{t(info.labelKey)}</span>
                    </span>
                    <span className="font-mono text-xs font-semibold text-slate-300 shrink-0">
                      {t('quiz.card.ply', { ply: card.ply })}
                    </span>
                    <span
                      className="truncate text-xs text-slate-400"
                      title={gameTitles[card.sourceGameId] || card.sourceGameId}
                    >
                      {gameTitles[card.sourceGameId] || card.sourceGameId}
                    </span>
                  </div>

                  {/* Switch Toggle */}
                  <label className="relative inline-flex cursor-pointer items-center shrink-0">
                    <input
                      type="checkbox"
                      checked={card.isEnabled}
                      onChange={(e) => onToggleCard(card.id, e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="h-5 w-9 rounded-full bg-slate-800 peer-checked:bg-amber-600 peer-focus:outline-none after:absolute after:top-[2px] after:left-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                  </label>
                </div>

                {/* Card Middle: Compact Board Preview */}
                <div className="mx-auto w-full max-w-[280px]">
                  <QuizPositionPreview card={card} />
                </div>

                {/* Card Bottom: Solver info */}
                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                  <span className="font-semibold">
                    {card.sideToMove === 'b' ? '▲ 先手の手番' : '△ 後手の手番'}
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">
                    {card.id}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. Footer Bulk Actions */}
      {filteredCards.length > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => onBulkToggle(filteredIds, true)}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-slate-700 hover:text-white"
          >
            {t('quiz.pool.enable_all')}
          </button>
          <button
            type="button"
            onClick={() => onBulkToggle(filteredIds, false)}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
          >
            {t('quiz.pool.disable_all')}
          </button>
        </div>
      )}
    </div>
  );
};
