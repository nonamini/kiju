/**
 * Shared Problem Pack Bar for LibraryTsumegoTab & LibraryQuizTab (Issue #13).
 * Provides pack filter pills, bulk pack assignment for filtered items,
 * and JSON pack export/import sharing controls.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PackSummary,
  UNCATEGORIZED_PACK_KEY,
} from '../../utils/problemPack';

export interface ProblemPackBarProps {
  packs: PackSummary[];
  uncategorizedCount: number;
  totalCount: number;
  filteredCount: number;
  packFilter: string;
  onChangePackFilter: (packFilter: string) => void;
  onAssignFilteredPack: (packName: string) => void;
  onExportFilteredPack: (packName: string) => void;
  onImportPackFile: (file: File) => void;
  accent?: 'emerald' | 'violet';
  datalistId: string;
}

export const ProblemPackBar: React.FC<ProblemPackBarProps> = ({
  packs,
  uncategorizedCount,
  totalCount,
  filteredCount,
  packFilter,
  onChangePackFilter,
  onAssignFilteredPack,
  onExportFilteredPack,
  onImportPackFile,
  accent = 'emerald',
  datalistId,
}) => {
  const { t } = useTranslation();
  const [packInput, setPackInput] = useState<string>('');
  const packFileInputRef = useRef<HTMLInputElement | null>(null);

  const activePillCls =
    accent === 'violet'
      ? 'bg-violet-500/20 border-violet-400/60 text-violet-200'
      : 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200';

  const resolveExportName = () =>
    packInput.trim() ||
    (packFilter && packFilter !== UNCATEGORIZED_PACK_KEY ? packFilter : '');

  return (
    <div className="pt-2 border-t border-slate-800/80 space-y-2 text-xs">
      {/* Pack Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-slate-400 mr-1">
          📦 {t('library_page.pack_label')}:
        </span>
        <button
          type="button"
          onClick={() => onChangePackFilter('')}
          className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold transition ${
            packFilter === ''
              ? activePillCls
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          {t('library_page.pack_all')} ({totalCount})
        </button>
        {packs.map((pack) => (
          <button
            key={pack.name}
            type="button"
            onClick={() =>
              onChangePackFilter(packFilter === pack.name ? '' : pack.name)
            }
            className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold transition ${
              packFilter === pack.name
                ? activePillCls
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            📦 {pack.name} ({pack.count})
          </button>
        ))}
        {packs.length > 0 && uncategorizedCount > 0 && (
          <button
            type="button"
            onClick={() =>
              onChangePackFilter(
                packFilter === UNCATEGORIZED_PACK_KEY
                  ? ''
                  : UNCATEGORIZED_PACK_KEY
              )
            }
            className={`px-2 py-0.5 rounded-full border text-[11px] transition ${
              packFilter === UNCATEGORIZED_PACK_KEY
                ? activePillCls
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('library_page.pack_uncategorized')} ({uncategorizedCount})
          </button>
        )}
      </div>

      {/* Pack Assignment & Share Export/Import Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="text"
            list={datalistId}
            value={packInput}
            onChange={(e) => setPackInput(e.target.value)}
            placeholder={t('library_page.pack_assign_placeholder')}
            aria-label={t('library_page.pack_assign_placeholder')}
            className="w-48 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <datalist id={datalistId}>
            {packs.map((p) => (
              <option key={p.name} value={p.name} />
            ))}
          </datalist>
          <button
            type="button"
            disabled={filteredCount === 0 || !packInput.trim()}
            onClick={() => {
              const name = packInput.trim();
              if (!name) return;
              onAssignFilteredPack(name);
              setPackInput('');
            }}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-amber-200 border border-amber-500/30 font-semibold transition"
          >
            📦 {t('library_page.pack_assign_btn', { count: filteredCount })}
          </button>
          {packFilter && packFilter !== UNCATEGORIZED_PACK_KEY && (
            <button
              type="button"
              disabled={filteredCount === 0}
              onClick={() => onAssignFilteredPack('')}
              className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-400 border border-slate-800 transition"
            >
              {t('library_page.pack_clear_btn')}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="file"
            ref={packFileInputRef}
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImportPackFile(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={filteredCount === 0}
            onClick={() => onExportFilteredPack(resolveExportName())}
            className="px-2.5 py-1 rounded-lg bg-indigo-600/25 hover:bg-indigo-600/40 disabled:opacity-40 text-indigo-200 border border-indigo-500/40 font-semibold transition"
          >
            📤 {t('library_page.pack_export_btn')}
          </button>
          <button
            type="button"
            onClick={() => packFileInputRef.current?.click()}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold transition"
          >
            📥 {t('library_page.pack_import_btn')}
          </button>
        </div>
      </div>
    </div>
  );
};
