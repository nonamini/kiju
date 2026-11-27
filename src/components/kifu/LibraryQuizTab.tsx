/**
 * Dedicated Next-Move Quiz Tab for KifuLibraryPage (Issue #176 Phase 1).
 * Defaults to a lightweight table view to avoid rendering dozens of board SVGs at once,
 * with a paginated card view capped at 12 boards per page.
 * Supports search, type/enabled filtering, bulk enable/disable, auto-extraction
 * from analyzed kifu records, inline modal editing, position editing, Firestore sync,
 * and direct practice launch.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { auth } from '../../services/firebase';
import {
  deleteQuizCardFromFirestore,
  ensureKifuRecordPayload,
  uploadQuizBatchToFirestore,
  uploadQuizCardToFirestore,
} from '../../services/firestoreKifuSync';
import type { KifuRecord } from '../../types/kifuRecord';
import type { TacticalQuizCard, TacticalQuizType } from '../../types/quiz';
import {
  deleteQuizCard,
  loadQuizPool,
  saveQuizPool,
  setQuizEnabled,
} from '../../utils/quizPoolStorage';
import { regenerateAllStudioQuizzes } from '../../utils/studioQuizExtractor';
import { formatQuizBestMoveJapanese } from '../../utils/quizMoveFormatter';
import { downloadJsonFile } from '../../utils/exportHelpers';
import {
  itemMatchesPackFilter,
  listPackSummaries,
  mergeImportedQuizPack,
  normalizePackName,
  parseProblemPackJson,
  serializeQuizPack,
} from '../../utils/problemPack';
import { ProblemPackBar } from './ProblemPackBar';
import { QuizPositionPreview } from '../quiz/QuizPositionPreview';

export interface LibraryQuizTabProps {
  cards: TacticalQuizCard[];
  records: KifuRecord[];
  onRefresh: () => void;
  onNotice: (msg: string) => void;
}

type TabViewMode = 'table' | 'card';

const TABLE_PAGE_SIZE = 50;
const CARD_PAGE_SIZE = 12;

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

export const LibraryQuizTab: React.FC<LibraryQuizTabProps> = ({
  cards,
  records,
  onRefresh,
  onNotice,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [query, setQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<TacticalQuizType | ''>('');
  const [enabledOnly, setEnabledOnly] = useState<boolean>(false);
  const [packFilter, setPackFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<TabViewMode>('table');
  const [page, setPage] = useState<number>(1);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);

  useEffect(() => {
    setPage(1);
  }, [query, selectedType, enabledOnly, packFilter, viewMode]);

  const packSummary = useMemo(() => listPackSummaries(cards), [cards]);

  const gameTitlesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) {
      map.set(r.id, r.title);
    }
    return map;
  }, [records]);

  const bestMoveLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cards) {
      map.set(c.id, formatQuizBestMoveJapanese(c));
    }
    return map;
  }, [cards]);

  const filteredCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter((c) => {
      if (!itemMatchesPackFilter(c.packName, packFilter)) return false;
      if (selectedType && c.type !== selectedType) return false;
      if (enabledOnly && !c.isEnabled) return false;
      if (!q) return true;
      const sourceTitle = gameTitlesById.get(c.sourceGameId) ?? '';
      const bestMoveLabel = bestMoveLabelById.get(c.id) ?? '';
      const haystack = [
        c.title ?? '',
        c.packName ?? '',
        sourceTitle,
        c.explanation ?? '',
        bestMoveLabel,
        c.bestMove,
        c.id,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [
    cards,
    packFilter,
    selectedType,
    enabledOnly,
    query,
    gameTitlesById,
    bestMoveLabelById,
  ]);

  const pageSize = viewMode === 'card' ? CARD_PAGE_SIZE : TABLE_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filteredCards.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const pagedCards = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCards.slice(start, start + pageSize);
  }, [filteredCards, currentPage, pageSize]);

  const enabledCount = useMemo(
    () => cards.filter((c) => c.isEnabled).length,
    [cards]
  );

  const handleToggleEnabled = async (card: TacticalQuizCard, enabled: boolean) => {
    const updatedList = setQuizEnabled(cards, [card.id], enabled);
    saveQuizPool(updatedList);
    onRefresh();
    const uid = auth?.currentUser?.uid;
    const updatedCard = updatedList.find((c) => c.id === card.id);
    if (uid && updatedCard) {
      await uploadQuizCardToFirestore(uid, updatedCard);
    }
  };

  const handleBulkToggle = async (enabled: boolean) => {
    if (filteredCards.length === 0) return;
    const targetIds = filteredCards.map((c) => c.id);
    const updatedList = setQuizEnabled(cards, targetIds, enabled);
    saveQuizPool(updatedList);
    onRefresh();
    const uid = auth?.currentUser?.uid;
    if (uid) {
      const changed = updatedList.filter((c) => targetIds.includes(c.id));
      await uploadQuizBatchToFirestore(uid, changed);
    }
  };

  const handleRegenerateFromAnalyzed = async () => {
    setIsRegenerating(true);
    try {
      const uid = auth?.currentUser?.uid;
      const activeRecords = records.filter((r) => !r.deletedAt);
      const hydrated = await Promise.all(
        activeRecords.map(async (rec) => {
          if (
            rec.evaluations &&
            Object.keys(rec.evaluations).length > 0 &&
            rec.jkfJson &&
            rec.jkfJson !== '{}'
          ) {
            return rec;
          }
          const full = await ensureKifuRecordPayload(uid, rec.id);
          return full ?? rec;
        })
      );

      const count = regenerateAllStudioQuizzes(
        hydrated.map((r) => ({
          id: r.id,
          openingId: r.openingId,
          totalPlies: r.totalPlies,
          jkfJson: r.jkfJson,
          evaluations: r.evaluations,
        }))
      );
      if (uid) {
        await uploadQuizBatchToFirestore(uid, loadQuizPool());
      }
      onRefresh();
      onNotice(t('library_page.quiz_tab_regenerate_done', { count }));
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleDelete = async (card: TacticalQuizCard) => {
    const label =
      card.title || gameTitlesById.get(card.sourceGameId) || card.id;
    if (!window.confirm(t('position_editor.confirm_delete', { title: label }))) {
      return;
    }
    deleteQuizCard(card.id);
    onRefresh();
    const uid = auth?.currentUser?.uid;
    if (uid) {
      await deleteQuizCardFromFirestore(uid, card.id);
    }
  };

  const handleAssignFilteredPack = async (rawPackName: string) => {
    if (filteredCards.length === 0) return;
    const cleanPack = normalizePackName(rawPackName);
    const targetIds = new Set(filteredCards.map((c) => c.id));
    const nowIso = new Date().toISOString();
    const updatedList = cards.map((c) =>
      targetIds.has(c.id)
        ? { ...c, packName: cleanPack || undefined, updatedAt: nowIso }
        : c
    );
    saveQuizPool(updatedList);
    const uid = auth?.currentUser?.uid;
    if (uid) {
      await uploadQuizBatchToFirestore(
        uid,
        updatedList.filter((c) => targetIds.has(c.id))
      );
    }
    if (!cleanPack) {
      setPackFilter('');
    }
    onRefresh();
    onNotice(
      cleanPack
        ? t('library_page.pack_assign_done', {
            count: filteredCards.length,
            pack: cleanPack,
          })
        : t('library_page.pack_clear_done', { count: filteredCards.length })
    );
  };

  const handleExportPack = (explicitName: string) => {
    if (filteredCards.length === 0) {
      onNotice(t('library_page.pack_export_empty'));
      return;
    }
    const packTitle =
      normalizePackName(explicitName) || t('library_page.pack_default_quiz_name');
    const json = serializeQuizPack(packTitle, filteredCards);
    const safeName = packTitle.replace(/[\\/:*?"<>|\s]+/g, '_') || 'quiz-pack';
    downloadJsonFile(json, `${safeName}.kiju-pack.json`);
    onNotice(
      t('library_page.pack_export_done', {
        count: filteredCards.length,
        pack: packTitle,
      })
    );
  };

  const handleImportPackFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseProblemPackJson(text);
      if (!parsed || parsed.kind !== 'quiz') {
        onNotice(t('library_page.pack_import_invalid'));
        return;
      }
      const existing = loadQuizPool();
      const { next, addedCount, updatedCount, touchedItems } =
        mergeImportedQuizPack(existing, parsed);
      saveQuizPool(next);
      const uid = auth?.currentUser?.uid;
      if (uid && touchedItems.length > 0) {
        await uploadQuizBatchToFirestore(uid, touchedItems);
      }
      onRefresh();
      onNotice(
        t('library_page.pack_import_done', {
          pack: parsed.name,
          added: addedCount,
          updated: updatedCount,
        })
      );
    } catch {
      onNotice(t('library_page.pack_import_invalid'));
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSelectedType('')}
              className={`px-2.5 py-1 rounded-lg border transition ${
                selectedType === ''
                  ? 'bg-slate-700 border-slate-600 text-white'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('quiz.pool.filter_all')}
            </button>
            {(['attack', 'defense', 'race', 'mate'] as TacticalQuizType[]).map(
              (qt) => {
                const info = TYPE_CONFIG[qt];
                const selected = selectedType === qt;
                return (
                  <button
                    key={qt}
                    type="button"
                    onClick={() => setSelectedType(selected ? '' : qt)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border transition ${
                      selected
                        ? `${info.badgeClass} ring-1 ring-amber-400/50`
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>{info.icon}</span>
                    <span>{t(info.labelKey)}</span>
                  </button>
                );
              }
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              to="/studio?editQuizId=new"
              className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold shadow transition"
            >
              ＋ {t('library_page.quiz_tab_create_btn')}
            </Link>
            <button
              type="button"
              disabled={isRegenerating}
              onClick={() => void handleRegenerateFromAnalyzed()}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-amber-300 border border-amber-500/40 font-semibold transition"
            >
              🔄 {t('library_page.quiz_tab_regenerate_btn')}
            </button>
            <Link
              to="/studio?mode=quiz"
              className={`px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow transition ${
                enabledCount === 0 ? 'opacity-50 pointer-events-none' : ''
              }`}
            >
              🎯 {t('library_page.quiz_tab_practice_btn')}
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 flex-1 min-w-[220px]">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('library_page.quiz_tab_search_placeholder')}
              className="w-full max-w-md rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={enabledOnly}
                onChange={(e) => setEnabledOnly(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-amber-500"
              />
              <span>{t('quiz.pool.enabled_only')}</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {filteredCards.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => void handleBulkToggle(true)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold"
                >
                  {t('quiz.pool.enable_all')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleBulkToggle(false)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 font-semibold"
                >
                  {t('quiz.pool.disable_all')}
                </button>
              </>
            )}

            <span className="font-mono text-slate-400">
              {filteredCards.length} / {cards.length}
            </span>

            <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                  viewMode === 'table'
                    ? 'bg-amber-600 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('library_page.view_table')}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('card')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                  viewMode === 'card'
                    ? 'bg-amber-600 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('library_page.view_card')}
              </button>
            </div>
          </div>
        </div>

        <ProblemPackBar
          packs={packSummary.packs}
          uncategorizedCount={packSummary.uncategorizedCount}
          totalCount={cards.length}
          filteredCount={filteredCards.length}
          packFilter={packFilter}
          onChangePackFilter={setPackFilter}
          onAssignFilteredPack={(name) => void handleAssignFilteredPack(name)}
          onExportFilteredPack={handleExportPack}
          onImportPackFile={(file) => void handleImportPackFile(file)}
          accent="violet"
          datalistId="quiz-pack-datalist"
        />
      </div>

      {filteredCards.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center space-y-3">
          <p className="text-xs text-slate-400">{t('library_page.quiz_tab_empty')}</p>
          <Link
            to="/studio?editQuizId=new"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow transition"
          >
            ＋ {t('library_page.quiz_tab_create_btn')}
          </Link>
        </div>
      ) : viewMode === 'table' ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-x-auto shadow-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2.5 text-center whitespace-nowrap">{t('library_page.col_enabled')}</th>
                <th className="px-2.5 py-2.5 whitespace-nowrap">{t('library_page.col_quiz_type')}</th>
                <th className="px-3 py-2.5 whitespace-nowrap">{t('library_page.col_title')}</th>
                <th className="px-2.5 py-2.5 text-center whitespace-nowrap">{t('library_page.col_plies')}</th>
                <th className="px-2.5 py-2.5 whitespace-nowrap">{t('library_page.col_turn')}</th>
                <th className="px-2.5 py-2.5 whitespace-nowrap">{t('library_page.col_best_move')}</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap">{t('library_page.col_actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {pagedCards.map((card) => {
                const info = TYPE_CONFIG[card.type];
                const isManual = card.source === 'manual' || card.sourceGameId === 'manual';
                const displayTitle =
                  card.title ||
                  gameTitlesById.get(card.sourceGameId) ||
                  card.id;

                return (
                  <tr
                    key={card.id}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      card.isEnabled ? '' : 'opacity-65'
                    }`}
                  >
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input
                          type="checkbox"
                          checked={card.isEnabled}
                          onChange={(e) => void handleToggleEnabled(card, e.target.checked)}
                          className="peer sr-only"
                        />
                        <div className="h-4 w-8 rounded-full bg-slate-800 peer-checked:bg-amber-500 after:absolute after:top-[2px] after:left-[2px] after:h-3 after:w-3 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
                      </label>
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold ${info.badgeClass}`}
                      >
                        <span>{info.icon}</span>
                        <span>{t(info.labelKey)}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[300px]">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/studio?mode=quiz&quizId=${encodeURIComponent(card.id)}`)
                        }
                        className="font-semibold text-slate-100 hover:text-violet-300 hover:underline text-left truncate block w-full"
                        title={displayTitle}
                      >
                        {displayTitle}
                      </button>
                      {card.packName && (
                        <span className="inline-flex items-center px-1.5 py-0.5 mt-0.5 rounded bg-violet-950/60 text-violet-300 border border-violet-700/40 text-[10px]">
                          📦 {card.packName}
                        </span>
                      )}
                      {card.explanation && (
                        <div className="text-[10px] text-slate-400 truncate">
                          {card.explanation}
                        </div>
                      )}
                    </td>
                    <td className="px-2.5 py-2.5 text-center whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[10px]">
                        {isManual
                          ? t('library_page.quiz_tab_manual_badge')
                          : t('quiz.card.ply', { ply: card.ply })}
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5 font-mono text-slate-300 whitespace-nowrap text-[11px]">
                      {card.sideToMove === 'w'
                        ? t('position_editor.turn_gote')
                        : t('position_editor.turn_sente')}
                    </td>
                    <td className="px-2.5 py-2.5 font-semibold text-amber-300 whitespace-nowrap">
                      {bestMoveLabelById.get(card.id) ?? card.bestMove}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/studio?mode=quiz&quizId=${encodeURIComponent(card.id)}`)
                          }
                          className="px-2.5 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white transition"
                        >
                          🎯 {t('library_page.quiz_tab_solve_btn')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/studio?editQuizId=${encodeURIComponent(card.id)}`)
                          }
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                        >
                          📝 {t('library_page.quiz_tab_edit_btn')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(card)}
                          className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60 transition"
                          title={t('position_editor.action_delete')}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pagedCards.map((card) => {
            const info = TYPE_CONFIG[card.type];
            const isManual = card.source === 'manual' || card.sourceGameId === 'manual';
            const displayTitle =
              card.title ||
              gameTitlesById.get(card.sourceGameId) ||
              card.id;

            return (
              <div
                key={card.id}
                className={`rounded-xl border p-4 flex flex-col justify-between gap-3 transition ${
                  card.isEnabled
                    ? 'border-slate-800 bg-slate-900/85 hover:border-violet-500/40'
                    : 'border-slate-850 bg-slate-950/70 opacity-65'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-bold shrink-0 ${info.badgeClass}`}
                      >
                        <span>{info.icon}</span>
                        <span>{t(info.labelKey)}</span>
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 shrink-0 font-mono">
                        {isManual
                          ? t('library_page.quiz_tab_manual_badge')
                          : t('quiz.card.ply', { ply: card.ply })}
                      </span>
                    </div>

                    <label className="relative inline-flex cursor-pointer items-center shrink-0">
                      <input
                        type="checkbox"
                        checked={card.isEnabled}
                        onChange={(e) => void handleToggleEnabled(card, e.target.checked)}
                        className="peer sr-only"
                      />
                      <div className="h-4 w-8 rounded-full bg-slate-800 peer-checked:bg-amber-500 after:absolute after:top-[2px] after:left-[2px] after:h-3 after:w-3 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
                    </label>
                  </div>

                  <h3 className="text-sm font-bold text-slate-100 truncate" title={displayTitle}>
                    {displayTitle}
                  </h3>
                  {card.packName && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-violet-950/60 text-violet-300 border border-violet-700/40 text-[10px]">
                      📦 {card.packName}
                    </span>
                  )}

                  <div className="mx-auto w-full max-w-[220px]">
                    <QuizPositionPreview card={card} />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      {card.sideToMove === 'w'
                        ? t('position_editor.turn_gote')
                        : t('position_editor.turn_sente')}
                    </span>
                    <span className="font-semibold text-amber-300">
                      {bestMoveLabelById.get(card.id) ?? card.bestMove}
                    </span>
                  </div>

                  {card.explanation && (
                    <p className="text-[11px] text-slate-400 line-clamp-2">
                      {card.explanation}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/studio?mode=quiz&quizId=${encodeURIComponent(card.id)}`)
                    }
                    className="px-2.5 py-1 rounded bg-violet-600 hover:bg-violet-500 text-white transition"
                  >
                    🎯 {t('library_page.quiz_tab_solve_btn')}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/studio?editQuizId=${encodeURIComponent(card.id)}`)
                    }
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                  >
                    📝 {t('library_page.quiz_tab_edit_btn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(card)}
                    className="ml-auto px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60 transition"
                    title={t('position_editor.action_delete')}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2 text-xs">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
          >
            ← {t('library_page.page_prev')}
          </button>
          <span className="text-slate-400">
            {t('library_page.page_info', {
              current: currentPage,
              total: totalPages,
            })}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
          >
            {t('library_page.page_next')} →
          </button>
        </div>
      )}
    </section>
  );
};
