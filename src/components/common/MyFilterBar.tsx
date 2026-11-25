/**
 * Quick-access My Filter Preset Bar Component (Issue #161).
 * Renders saved search/filter presets as clickable pills with delete action
 * and an inline form to save the active search/filter criteria.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface MyFilterBarItem {
  id: string;
  name: string;
}

export interface MyFilterBarProps {
  presets: MyFilterBarItem[];
  activePresetId: string | null;
  onSelectPreset: (id: string) => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (id: string) => void;
}

export const MyFilterBar: React.FC<MyFilterBarProps> = ({
  presets,
  activePresetId,
  onSelectPreset,
  onSavePreset,
  onDeletePreset,
}) => {
  const { t } = useTranslation();
  const [isAdding, setIsAdding] = useState(false);
  const [draftName, setDraftName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) return;
    onSavePreset(trimmed);
    setDraftName('');
    setIsAdding(false);
  };

  return (
    <div className="rounded-xl border border-slate-800/90 bg-slate-900/65 px-3 py-2 flex flex-wrap items-center gap-2 text-xs">
      <span className="font-bold text-amber-300/90 flex items-center gap-1 shrink-0">
        <span>⭐</span>
        <span>{t('my_filter.label')}</span>
      </span>

      {presets.map((preset) => {
        const isActive = activePresetId === preset.id;
        return (
          <div
            key={preset.id}
            className={`inline-flex items-center rounded-lg border transition ${
              isActive
                ? 'bg-amber-500/20 border-amber-500/60 text-amber-200 shadow-xs'
                : 'bg-slate-950/70 border-slate-700/80 text-slate-300 hover:border-slate-600'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectPreset(preset.id)}
              className="px-2.5 py-1 font-semibold truncate max-w-[180px]"
            >
              {preset.name}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeletePreset(preset.id);
              }}
              className="pr-2 pl-0.5 py-1 text-slate-500 hover:text-rose-400 transition"
              title={t('my_filter.delete_title')}
              aria-label={t('my_filter.delete_title')}
            >
              ✕
            </button>
          </div>
        );
      })}

      {presets.length === 0 && !isAdding && (
        <span className="text-[11px] text-slate-500">
          {t('my_filter.empty_hint')}
        </span>
      )}

      {isAdding ? (
        <form
          onSubmit={handleSubmit}
          className="inline-flex flex-wrap items-center gap-1.5 ml-auto sm:ml-0"
        >
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={t('my_filter.name_placeholder')}
            autoFocus
            className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 w-44"
          />
          <button
            type="submit"
            disabled={!draftName.trim()}
            className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 font-bold transition"
          >
            {t('my_filter.save_btn')}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsAdding(false);
              setDraftName('');
            }}
            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          >
            {t('common.cancel')}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-semibold transition ml-auto sm:ml-0"
        >
          ＋ {t('my_filter.save_current_btn')}
        </button>
      )}
    </div>
  );
};
