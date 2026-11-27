/**
 * Bulk Player & Tournament Name Unification Modal for KifuLibraryPage (Issue #11).
 * Allows stripping Japanese Shogi titles/ranks (e.g. 竜王・名人, 九段) or running
 * custom find-and-replace across selected records with a live dry-run preview.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KifuRecord } from '../../types/kifuRecord';
import {
  BulkNameUnifyOptions,
  previewNameUnify,
} from '../../utils/kifuLibraryBulkOps';

export interface BulkNameUnifyModalProps {
  isOpen: boolean;
  selectedRecords: KifuRecord[];
  onClose: () => void;
  onApply: (options: BulkNameUnifyOptions) => void;
}

export const BulkNameUnifyModal: React.FC<BulkNameUnifyModalProps> = ({
  isOpen,
  selectedRecords,
  onClose,
  onApply,
}) => {
  const { t } = useTranslation();
  const [field, setField] = useState<'players' | 'tournament'>('players');
  const [mode, setMode] = useState<'strip_titles' | 'replace'>('strip_titles');
  const [findText, setFindText] = useState<string>('');
  const [replaceText, setReplaceText] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    setField('players');
    setMode('strip_titles');
    setFindText('');
    setReplaceText('');
  }, [isOpen]);

  const effectiveMode: 'strip_titles' | 'replace' =
    field === 'tournament' ? 'replace' : mode;

  const options = useMemo<BulkNameUnifyOptions>(
    () => ({
      field,
      mode: effectiveMode,
      find: findText,
      replace: replaceText,
    }),
    [field, effectiveMode, findText, replaceText]
  );

  const preview = useMemo(
    () => previewNameUnify(selectedRecords, options),
    [selectedRecords, options]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('library_page.bulk_unify_title')}
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-amber-300 flex items-center gap-2">
              <span>✏️</span>
              <span>{t('library_page.bulk_unify_title')}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('library_page.bulk_unify_subtitle', {
                count: selectedRecords.length,
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 px-2 py-1 rounded-lg hover:bg-slate-800 transition"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {/* Target Field Selector */}
          <div className="space-y-1.5">
            <div className="text-slate-300 font-semibold">
              {t('library_page.bulk_unify_target_label')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setField('players')}
                className={`px-3 py-2 rounded-lg border font-semibold transition ${
                  field === 'players'
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('library_page.bulk_unify_field_players')}
              </button>
              <button
                type="button"
                onClick={() => setField('tournament')}
                className={`px-3 py-2 rounded-lg border font-semibold transition ${
                  field === 'tournament'
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('library_page.bulk_unify_field_tournament')}
              </button>
            </div>
          </div>

          {/* Operation Mode Selector */}
          <div className="space-y-1.5">
            <div className="text-slate-300 font-semibold">
              {t('library_page.bulk_unify_mode_label')}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {field === 'players' && (
                <button
                  type="button"
                  onClick={() => setMode('strip_titles')}
                  className={`px-3 py-2 rounded-lg border text-left font-semibold transition ${
                    effectiveMode === 'strip_titles'
                      ? 'bg-violet-500/20 border-violet-500/60 text-violet-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t('library_page.bulk_unify_mode_strip')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode('replace')}
                className={`px-3 py-2 rounded-lg border text-left font-semibold transition ${
                  effectiveMode === 'replace'
                    ? 'bg-violet-500/20 border-violet-500/60 text-violet-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('library_page.bulk_unify_mode_replace')}
              </button>
            </div>
          </div>

          {/* Find & Replace Inputs */}
          {effectiveMode === 'replace' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <label className="space-y-1">
                <span className="block text-slate-300 font-semibold">
                  {t('library_page.bulk_unify_find_label')}
                </span>
                <input
                  type="text"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  placeholder={t('library_page.bulk_unify_find_placeholder')}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-slate-300 font-semibold">
                  {t('library_page.bulk_unify_replace_label')}
                </span>
                <input
                  type="text"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder={t('library_page.bulk_unify_replace_placeholder')}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
                />
              </label>
            </div>
          )}

          {/* Live Preview */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2">
            <div className="flex items-center justify-between text-slate-300 font-semibold">
              <span>{t('library_page.bulk_unify_preview_title')}</span>
              <span className="text-amber-300">
                {t('library_page.bulk_unify_preview_count', {
                  count: preview.affectedCount,
                })}
              </span>
            </div>
            {preview.samples.length === 0 ? (
              <div className="text-slate-500 py-1">
                {t('library_page.bulk_unify_preview_empty')}
              </div>
            ) : (
              <ul className="space-y-1 text-[11px]">
                {preview.samples.map((sample, idx) => (
                  <li
                    key={`${sample.before}-${idx}`}
                    className="flex items-center gap-2 text-slate-300 truncate"
                  >
                    <span className="text-slate-400 line-through truncate">
                      {sample.before}
                    </span>
                    <span className="text-amber-400 shrink-0">→</span>
                    <span className="text-emerald-300 font-semibold truncate">
                      {sample.after}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={preview.affectedCount === 0}
            onClick={() => onApply(options)}
            className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 text-xs font-bold transition"
          >
            {t('library_page.bulk_unify_apply', {
              count: preview.affectedCount,
            })}
          </button>
        </div>
      </div>
    </div>
  );
};
