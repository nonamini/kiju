/**
 * Duplicate Kifu Resolution Dialog (Issue #44).
 * Shown when a save/import candidate's contentHash matches existing
 * KifuRecord(s). Offers: open existing / save as separate record /
 * merge tags into existing / cancel.
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { KifuRecord, KifuRecordSource } from '../../types/kifuRecord';

export interface DuplicateKifuDialogProps {
  duplicates: KifuRecord[];
  candidateTitle?: string;
  onOpenExisting: (record: KifuRecord) => void;
  onSaveAnyway: () => void;
  onMerge: () => void;
  onCancel: () => void;
}

const SOURCE_LABEL_KEYS: Record<KifuRecordSource, string> = {
  studio: 'duplicate.source_studio',
  tree: 'duplicate.source_tree',
  import: 'duplicate.source_import',
};

export const DuplicateKifuDialog: React.FC<DuplicateKifuDialogProps> = ({
  duplicates,
  candidateTitle,
  onOpenExisting,
  onSaveAnyway,
  onMerge,
  onCancel,
}) => {
  const { t } = useTranslation();
  if (duplicates.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-amber-700/60 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 bg-amber-950/30">
          <h3 className="text-base font-bold text-amber-200 flex items-center gap-2">
            <span>⚠️</span>
            {t('duplicate.title')}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {t('duplicate.desc', { count: duplicates.length })}
            {candidateTitle ? ` — ${candidateTitle}` : ''}
          </p>
        </div>

        <div className="max-h-56 overflow-y-auto divide-y divide-slate-800">
          {duplicates.map((rec) => (
            <div
              key={rec.id}
              className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-800/40"
            >
              <div className="min-w-0">
                <p className="text-sm text-slate-200 truncate">{rec.title || rec.id}</p>
                <p className="text-xs text-slate-400 truncate">
                  ☗ {rec.senteName} vs ☖ {rec.goteName}
                  {rec.matchDate ? ` · ${rec.matchDate}` : ''}
                  {` · ${rec.totalPlies}${t('duplicate.plies_unit')}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                  {t(SOURCE_LABEL_KEYS[rec.source] ?? 'duplicate.source_import')}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenExisting(rec)}
                  className="px-2.5 py-1 text-xs font-medium rounded bg-sky-700/80 hover:bg-sky-600 text-white transition-colors"
                >
                  {t('duplicate.open_existing')}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-slate-800 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            {t('duplicate.cancel')}
          </button>
          <button
            type="button"
            onClick={onMerge}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
          >
            {t('duplicate.merge')}
          </button>
          <button
            type="button"
            onClick={onSaveAnyway}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-colors"
          >
            {t('duplicate.save_anyway')}
          </button>
        </div>
      </div>
    </div>
  );
};
