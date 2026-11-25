/**
 * Rating-page style Opening Tendency Section for PlayerDetailModal.
 * Supports switching between auto-aggregated tendency from imported kifu
 * and manually entered tendency (e.g., from Shogi rating pages).
 *
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strict TypeScript, zero any (Rule 2).
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  OpeningTendencyEntry,
  PlayerOpeningTendencyManual,
} from '../../types/player';

interface PlayerOpeningTendencySectionProps {
  autoTendency: PlayerOpeningTendencyManual;
  manualTendency?: PlayerOpeningTendencyManual;
  onSaveManual: (next: PlayerOpeningTendencyManual) => void;
}

const EMPTY_MANUAL: PlayerOpeningTendencyManual = {
  periodLabel: '過去3年の戦型傾向',
  ibishaRatio: 100,
  furibishaRatio: 0,
  ibishaDetails: [],
  furibishaDetails: [],
};

export const PlayerOpeningTendencySection: React.FC<
  PlayerOpeningTendencySectionProps
> = ({ autoTendency, manualTendency, onSaveManual }) => {
  const { t } = useTranslation();
  const [sourceMode, setSourceMode] = useState<'auto' | 'manual'>(
    manualTendency ? 'manual' : 'auto'
  );
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<PlayerOpeningTendencyManual>(
    manualTendency ?? EMPTY_MANUAL
  );
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setDraft(manualTendency ?? EMPTY_MANUAL);
    setSourceMode(manualTendency ? 'manual' : 'auto');
    setIsEditing(false);
    setSavedNotice(false);
  }, [manualTendency]);

  const activeData =
    sourceMode === 'manual' ? (manualTendency ?? EMPTY_MANUAL) : autoTendency;

  const handleSave = () => {
    onSaveManual({
      ...draft,
      updatedAt: new Date().toISOString(),
    });
    setIsEditing(false);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleAddRow = (family: 'ibisha' | 'furibisha') => {
    const key = family === 'ibisha' ? 'ibishaDetails' : 'furibishaDetails';
    setDraft((prev) => ({
      ...prev,
      [key]: [...prev[key], { name: '', percentage: 0 }],
    }));
  };

  const handleUpdateRow = (
    family: 'ibisha' | 'furibisha',
    idx: number,
    patch: Partial<OpeningTendencyEntry>
  ) => {
    const key = family === 'ibisha' ? 'ibishaDetails' : 'furibishaDetails';
    setDraft((prev) => ({
      ...prev,
      [key]: prev[key].map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    }));
  };

  const handleRemoveRow = (family: 'ibisha' | 'furibisha', idx: number) => {
    const key = family === 'ibisha' ? 'ibishaDetails' : 'furibishaDetails';
    setDraft((prev) => ({
      ...prev,
      [key]: prev[key].filter((_, i) => i !== idx),
    }));
  };

  const ibishaPct = Math.max(0, Math.min(100, activeData.ibishaRatio));
  const furibishaPct = Math.max(0, Math.min(100, activeData.furibishaRatio));

  return (
    <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 space-y-3">
      {/* Header & Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-bold text-slate-200">
            {t('players_page.opening_tendency_title', '戦型傾向（レーティング風）')}
          </h4>
          {savedNotice && (
            <span className="text-[11px] text-emerald-400 font-medium">
              ✓ {t('common.saved', '保存しました')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-lg bg-slate-900 border border-slate-700 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setSourceMode('auto');
                setIsEditing(false);
              }}
              className={`px-2 py-0.5 rounded-md transition ${
                sourceMode === 'auto'
                  ? 'bg-amber-600 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              📊 {t('players_page.tendency_auto', '棋譜自動集計')}
            </button>
            <button
              type="button"
              onClick={() => setSourceMode('manual')}
              className={`px-2 py-0.5 rounded-md transition ${
                sourceMode === 'manual'
                  ? 'bg-amber-600 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ✏️ {t('players_page.tendency_manual', '手動入力')}
            </button>
          </div>

          {sourceMode === 'manual' && !isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[11px] font-semibold transition"
            >
              ✏️ {t('common.edit', '編集')}
            </button>
          )}
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">
                {t('players_page.tendency_period_label', '期間・ラベル')}
              </label>
              <input
                type="text"
                value={draft.periodLabel ?? ''}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, periodLabel: e.target.value }))
                }
                placeholder="過去3年の戦型傾向"
                className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-slate-200"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">
                {t('players_page.tendency_ibisha_pct', '居飛車 (%)')}
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={draft.ibishaRatio}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setDraft((prev) => ({
                    ...prev,
                    ibishaRatio: val,
                    furibishaRatio: Math.round((100 - val) * 10) / 10,
                  }));
                }}
                className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-slate-200"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">
                {t('players_page.tendency_furibisha_pct', '振り飛車 (%)')}
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={draft.furibishaRatio}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    furibishaRatio: Number(e.target.value),
                  }))
                }
                className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {/* Ibisha Details Editor */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-300">居飛車 内訳</span>
                <button
                  type="button"
                  onClick={() => handleAddRow('ibisha')}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]"
                >
                  + 追加
                </button>
              </div>
              {draft.ibishaDetails.map((row, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) =>
                      handleUpdateRow('ibisha', idx, { name: e.target.value })
                    }
                    placeholder="相掛かり"
                    className="flex-1 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-slate-200 text-[11px]"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={row.percentage}
                    onChange={(e) =>
                      handleUpdateRow('ibisha', idx, {
                        percentage: Number(e.target.value),
                      })
                    }
                    className="w-16 rounded bg-slate-950 border border-slate-700 px-1.5 py-1 text-slate-200 text-[11px] text-right"
                  />
                  <span className="text-[10px] text-slate-400">%</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRow('ibisha', idx)}
                    className="text-rose-400 hover:text-rose-300 px-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Furibisha Details Editor */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sky-300">振り飛車 内訳</span>
                <button
                  type="button"
                  onClick={() => handleAddRow('furibisha')}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px]"
                >
                  + 追加
                </button>
              </div>
              {draft.furibishaDetails.map((row, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) =>
                      handleUpdateRow('furibisha', idx, { name: e.target.value })
                    }
                    placeholder="四間飛車"
                    className="flex-1 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-slate-200 text-[11px]"
                  />
                  <input
                    type="number"
                    step="0.1"
                    value={row.percentage}
                    onChange={(e) =>
                      handleUpdateRow('furibisha', idx, {
                        percentage: Number(e.target.value),
                      })
                    }
                    className="w-16 rounded bg-slate-950 border border-slate-700 px-1.5 py-1 text-slate-200 text-[11px] text-right"
                  />
                  <span className="text-[10px] text-slate-400">%</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveRow('furibisha', idx)}
                    className="text-rose-400 hover:text-rose-300 px-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setDraft(manualTendency ?? EMPTY_MANUAL);
                setIsEditing(false);
              }}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
            >
              {t('common.cancel', 'キャンセル')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs"
            >
              💾 {t('common.save', '保存')}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Top Overall Bar (Rating-page style) */}
          <div className="rounded-lg bg-slate-900/80 border border-slate-800 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">
                {activeData.periodLabel || '戦型傾向'}
              </span>
              <span className="font-mono text-[11px] flex items-center gap-2">
                <span className="text-amber-300 font-bold">
                  居飛車 {ibishaPct.toFixed(1)}%
                </span>
                <span className="text-sky-300 font-bold">
                  振り飛車 {furibishaPct.toFixed(1)}%
                </span>
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden flex">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${ibishaPct}%` }}
              />
              <div
                className="h-full bg-sky-500 transition-all"
                style={{ width: `${furibishaPct}%` }}
              />
            </div>
          </div>

          {/* 2-Column Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Ibisha Column */}
            <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold border-b border-slate-800 pb-1.5">
                <span className="text-slate-200">居飛車</span>
                <span className="text-amber-300 font-mono">
                  {ibishaPct.toFixed(1)}%
                </span>
              </div>
              {activeData.ibishaDetails.length === 0 ? (
                <div className="py-4 text-center text-[11px] text-slate-500">
                  現時点では採用なし
                </div>
              ) : (
                <div className="space-y-2">
                  {activeData.ibishaDetails.map((item) => (
                    <div key={item.name} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-200 font-medium truncate">
                          {item.name}
                        </span>
                        <span className="text-slate-400 font-mono">
                          {item.percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-amber-500/85 rounded-full"
                          style={{
                            width: `${Math.max(2, Math.min(100, item.percentage))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Furibisha Column */}
            <div className="rounded-lg bg-slate-900/60 border border-slate-800 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold border-b border-slate-800 pb-1.5">
                <span className="text-slate-200">振り飛車</span>
                <span className="text-sky-300 font-mono">
                  {furibishaPct.toFixed(1)}%
                </span>
              </div>
              {activeData.furibishaDetails.length === 0 ? (
                <div className="py-4 text-center text-[11px] text-slate-500">
                  現時点では採用なし
                </div>
              ) : (
                <div className="space-y-2">
                  {activeData.furibishaDetails.map((item) => (
                    <div key={item.name} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-200 font-medium truncate">
                          {item.name}
                        </span>
                        <span className="text-slate-400 font-mono">
                          {item.percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-sky-500/85 rounded-full"
                          style={{
                            width: `${Math.max(2, Math.min(100, item.percentage))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
