/**
 * Kifu Library Table Component.
 * Displays all ingested games, allows toggling inclusion in the merged tree,
 * category selection, game deletion, and exporting merged tree.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IngestedGame } from '../../types/tree';
import { OPENING_CATEGORIES } from '../../utils/openingClassifier';

export interface KifuLibraryTableProps {
  games: IngestedGame[];
  onToggleInclude: (gameId: string) => void;
  onCategoryChange: (gameId: string, newCategoryId: string) => void;
  onUpdateTitle?: (gameId: string, newTitle: string) => void;
  onOpenInStudio?: (gameId: string) => void;
  onDeleteGame: (gameId: string) => void;
  onIncludeAll: () => void;
  onExcludeAll: () => void;
  onIncludeCategoryOnly?: (categoryId: string) => void;
  onClearAll: () => void;
  onExportKif: () => void;
  onCopyKif: () => Promise<boolean>;
}

export const KifuLibraryTable: React.FC<KifuLibraryTableProps> = ({
  games,
  onToggleInclude,
  onCategoryChange,
  onUpdateTitle,
  onOpenInStudio,
  onDeleteGame,
  onIncludeAll,
  onExcludeAll,
  onIncludeCategoryOnly,
  onClearAll,
  onExportKif,
  onCopyKif,
}) => {
  const { t } = useTranslation();
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<string>('all');
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState<string>('');

  const includedCount = games.filter((g) => g.isIncluded).length;

  const handleCopy = async () => {
    const ok = await onCopyKif();
    if (ok) {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  };

  const getWinnerBadge = (winner?: string) => {
    if (winner === 'b') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-950 text-amber-300 border border-amber-800">
          {t('library.sente_win')}
        </span>
      );
    }
    if (winner === 'w') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-950 text-indigo-300 border border-indigo-800">
          {t('library.gote_win')}
        </span>
      );
    }
    if (winner === 'draw') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300">
          {t('library.draw')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-400">
        {t('library.unknown_result')}
      </span>
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      {/* Header and Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
            {t('library.title')}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {t('library.total_games', { count: games.length, included: includedCount })}
          </p>
        </div>

        {/* Global actions */}
        <div className="flex flex-wrap items-center gap-2">
          {games.length > 0 && (
            <>
              <button
                type="button"
                onClick={onIncludeAll}
                className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                {t('library.include_all')}
              </button>
              <button
                type="button"
                onClick={onExcludeAll}
                className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                {t('library.exclude_all')}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(t('library.delete_confirm'))) {
                    onClearAll();
                  }
                }}
                className="px-2.5 py-1 text-xs rounded bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 transition-colors"
              >
                {t('library.clear_all')}
              </button>
            </>
          )}

          {includedCount > 0 && (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-700">
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              >
                {copyFeedback ? t('library.copied') : t('library.copy_kif')}
              </button>
              <button
                type="button"
                onClick={onExportKif}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                {t('library.download_kif')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Opening Category Filter Bar */}
      {games.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setSelectedFilterCategory('all')}
              className={`px-2.5 py-1 rounded-lg border transition ${
                selectedFilterCategory === 'all'
                  ? 'border-amber-500/50 bg-amber-500/20 text-amber-300 font-bold'
                  : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('library.filter_all', { count: games.length })}
            </button>
            {OPENING_CATEGORIES.map((cat) => {
              const count = games.filter((g) => g.openingId === cat.id).length;
              if (count === 0) return null;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedFilterCategory(cat.id)}
                  className={`px-2.5 py-1 rounded-lg border transition ${
                    selectedFilterCategory === cat.id
                      ? 'border-amber-500/50 bg-amber-500/20 text-amber-300 font-bold'
                      : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t(cat.nameKey)} ({count})
                </button>
              );
            })}
          </div>

          {selectedFilterCategory !== 'all' && onIncludeCategoryOnly && (
            <button
              type="button"
              onClick={() => onIncludeCategoryOnly(selectedFilterCategory)}
              className="px-2.5 py-1 text-xs rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold transition flex items-center gap-1 shadow-sm active:scale-95"
            >
              <span>🌳</span>
              <span>{t('library.select_only_opening')}</span>
            </button>
          )}
        </div>
      )}

      {/* Library Table */}
      {games.length === 0 ? (
        <div className="border border-slate-800/80 rounded-lg p-8 text-center text-slate-500 text-sm">
          {t('library.empty_desc')}
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 text-xs uppercase text-slate-400 border-b border-slate-800">
              <tr>
                <th scope="col" className="px-3 py-3 text-center w-12">
                  {t('library.col_include')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('library.col_title')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('library.col_players')}
                </th>
                <th scope="col" className="px-4 py-3">
                  {t('library.col_opening')}
                </th>
                <th scope="col" className="px-3 py-3 text-center">
                  {t('library.col_plies')}
                </th>
                <th scope="col" className="px-3 py-3 text-center">
                  {t('library.col_winner')}
                </th>
                <th scope="col" className="px-3 py-3 text-center">
                  {t('library.col_eval')}
                </th>
                <th scope="col" className="px-3 py-3 text-center w-16">
                  {t('library.col_actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {games
                .filter((g) => selectedFilterCategory === 'all' || g.openingId === selectedFilterCategory)
                .map((g) => (
                <tr
                  key={g.id}
                  className={`hover:bg-slate-800/40 transition-colors ${
                    !g.isIncluded ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={g.isIncluded}
                      onChange={() => onToggleInclude(g.id)}
                      className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 bg-slate-800 border-slate-700 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-100">
                    {editingTitleId === g.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={tempTitle}
                          onChange={(e) => setTempTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (onUpdateTitle && tempTitle.trim()) {
                                onUpdateTitle(g.id, tempTitle.trim());
                              }
                              setEditingTitleId(null);
                            } else if (e.key === 'Escape') {
                              setEditingTitleId(null);
                            }
                          }}
                          className="bg-slate-950 border border-amber-500/60 rounded px-2 py-0.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-400 w-full"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (onUpdateTitle && tempTitle.trim()) {
                              onUpdateTitle(g.id, tempTitle.trim());
                            }
                            setEditingTitleId(null);
                          }}
                          className="text-xs bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold px-1.5 py-0.5 rounded shadow"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingTitleId(null)}
                          className="text-xs text-slate-400 hover:text-slate-200 px-1"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 group">
                        <div className="truncate max-w-xs">{g.title}</div>
                        {onUpdateTitle && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTitleId(g.id);
                              setTempTitle(g.title);
                            }}
                            className="opacity-60 hover:opacity-100 text-slate-400 hover:text-amber-300 transition text-[11px] p-0.5"
                          >
                            ✏️
                          </button>
                        )}
                      </div>
                    )}
                    {g.date && <div className="text-xs text-slate-500">{g.date}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div>▲ {g.senteName}</div>
                    <div className="text-slate-400">△ {g.goteName}</div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={g.openingId}
                      onChange={(e) => onCategoryChange(g.id, e.target.value)}
                      className="bg-slate-950 border border-slate-700 text-xs rounded px-2 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    >
                      {OPENING_CATEGORIES.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {t(cat.nameKey)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-center text-xs text-slate-300 font-mono">
                    {g.plyCount}
                  </td>
                  <td className="px-3 py-3 text-center">{getWinnerBadge(g.winner)}</td>
                  <td className="px-3 py-3 text-center">
                    {g.analysisStatus === 'queued' ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800">
                        {t('library.queued_badge')}
                      </span>
                    ) : g.analysisStatus === 'processing' ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800">
                        {t('library.processing_badge')}
                      </span>
                    ) : g.analysisStatus === 'failed' ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-950 text-rose-300 border border-rose-800">
                        {t('library.failed_badge')}
                      </span>
                    ) : g.isAnalyzed || g.analysisStatus === 'completed' ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                        {g.analysisEngineId === 'yaneuraou'
                          ? t('library.cloud_analyzed_badge')
                          : t('library.analyzed_badge')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] text-slate-500 bg-slate-950">
                        {t('library.unanalyzed_badge')}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="inline-flex items-center gap-1">
                      {onOpenInStudio && (
                        <button
                          type="button"
                          onClick={() => onOpenInStudio(g.id)}
                          className="text-[11px] px-2 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-semibold transition-colors"
                          title={t('library.open_in_studio_title')}
                        >
                          {t('library.open_in_studio')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteGame(g.id)}
                        className="text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 p-1 rounded transition-colors"
                        title={t('library.col_actions')}
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
