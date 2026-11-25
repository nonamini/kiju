/**
 * Kifu Management Modal Component.
 * Modal providing fast access to KIF upload, paste, drag & drop,
 * and library management table without forcing users to scroll to the bottom.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KifuUploader } from './KifuUploader';
import { KifuLibraryTable } from './KifuLibraryTable';
import { ParsedKifResult } from '../../utils/kifParser';
import { IngestedGame } from '../../types/tree';

export interface KifuManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  games: IngestedGame[];
  existingGameIds?: Set<string>;
  onGameIngested: (result: ParsedKifResult) => void;
  onToggleInclude: (gameId: string) => void;
  onCategoryChange: (gameId: string, newCategoryId: string) => void;
  onUpdateTitle?: (gameId: string, newTitle: string) => void;
  onDeleteGame: (gameId: string) => void;
  onIncludeAll: () => void;
  onExcludeAll: () => void;
  onIncludeCategoryOnly?: (categoryId: string) => void;
  onClearAll: () => void;
  onExportKif: () => void;
  onCopyKif: () => Promise<boolean>;
}

export const KifuManagementModal: React.FC<KifuManagementModalProps> = ({
  isOpen,
  onClose,
  games,
  existingGameIds,
  onGameIngested,
  onToggleInclude,
  onCategoryChange,
  onUpdateTitle,
  onDeleteGame,
  onIncludeAll,
  onExcludeAll,
  onIncludeCategoryOnly,
  onClearAll,
  onExportKif,
  onCopyKif,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kifu-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3 bg-slate-900/60">
          <div className="flex items-center gap-2">
            <span className="text-lg">📂</span>
            <h2 id="kifu-modal-title" className="text-sm sm:text-base font-bold text-white">
              {t('ingestion.title')}
            </h2>
            <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 font-mono text-xs text-amber-300 font-semibold">
              {t('ingestion.total_games', { count: games.length })}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Legacy Deprecation Notice (#70) */}
        <div className="px-4 py-2 bg-amber-950/30 border-b border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-[11px] shrink-0">
          <span className="text-amber-200/90">
            ℹ️ {t('library_page.legacy_modal_notice')}
          </span>
          <Link
            to="/library"
            onClick={onClose}
            className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold border border-amber-500/40 transition"
          >
            {t('library_page.legacy_modal_open_new')}
          </Link>
        </div>

        {/* Modal Content Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
          {/* Uploader Section */}
          <section>
            <KifuUploader
              onGameIngested={onGameIngested}
              existingGameIds={existingGameIds}
            />
          </section>

          {/* Library Table Section */}
          <section className="border-t border-slate-800/80 pt-4">
            <KifuLibraryTable
              games={games}
              onToggleInclude={onToggleInclude}
              onCategoryChange={onCategoryChange}
              onUpdateTitle={onUpdateTitle}
              onDeleteGame={onDeleteGame}
              onIncludeAll={onIncludeAll}
              onExcludeAll={onExcludeAll}
              onIncludeCategoryOnly={onIncludeCategoryOnly}
              onClearAll={onClearAll}
              onExportKif={onExportKif}
              onCopyKif={onCopyKif}
            />
          </section>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-800/80 px-4 py-2.5 bg-slate-900/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-1.5 text-xs font-semibold transition"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
