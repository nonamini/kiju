/**
 * Beginner Assist Overlay toggle button & multi-stage layer configurator popover (Issue #19).
 * Separates Sente / Gote visibility toggles and includes both defense deficiency (<=1)
 * and solid/fortress coverage (2+ / 3+) visual layers.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BeginnerAssistConfig } from '../../utils/boardAssistOverlay';

export interface BeginnerAssistMenuProps {
  config: BeginnerAssistConfig;
  onChange: (next: BeginnerAssistConfig) => void;
}

type LayerKey =
  | 'showSlidingLines'
  | 'showWeakDefense'
  | 'showStrongDefense'
  | 'showAttackCounts'
  | 'showHangingWarnings'
  | 'showSafeEmpty'
  | 'showFreeCaptures';

const LAYER_OPTIONS: ReadonlyArray<{
  key: LayerKey;
  labelKey: string;
  dotClass: string;
}> = [
  {
    key: 'showSlidingLines',
    labelKey: 'beginner_assist.sliding_lines',
    dotClass: 'bg-amber-400',
  },
  {
    key: 'showWeakDefense',
    labelKey: 'beginner_assist.weak_defense',
    dotClass: 'bg-orange-500',
  },
  {
    key: 'showStrongDefense',
    labelKey: 'beginner_assist.strong_defense',
    dotClass: 'bg-emerald-500',
  },
  {
    key: 'showAttackCounts',
    labelKey: 'beginner_assist.attack_counts',
    dotClass: 'bg-sky-400',
  },
  {
    key: 'showHangingWarnings',
    labelKey: 'beginner_assist.hanging_warnings',
    dotClass: 'bg-rose-500',
  },
  {
    key: 'showSafeEmpty',
    labelKey: 'beginner_assist.safe_empty',
    dotClass: 'bg-emerald-400/70',
  },
  {
    key: 'showFreeCaptures',
    labelKey: 'beginner_assist.free_captures',
    dotClass: 'bg-teal-400',
  },
];

export const BeginnerAssistMenu: React.FC<BeginnerAssistMenuProps> = ({
  config,
  onChange,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  const toggleMaster = () => {
    onChange({ ...config, enabled: !config.enabled });
  };

  const toggleSide = (side: 'showSente' | 'showGote') => {
    const nextVal = !config[side];
    onChange({
      ...config,
      enabled: nextVal ? true : config.enabled,
      [side]: nextVal,
    });
  };

  const toggleLayer = (key: LayerKey) => {
    const nextVal = !config[key];
    onChange({
      ...config,
      enabled: nextVal ? true : config.enabled,
      [key]: nextVal,
    });
  };

  return (
    <div ref={rootRef} className="relative flex shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
        title={t('beginner_assist.title')}
        className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 text-xs rounded-lg border font-semibold transition whitespace-nowrap ${
          config.enabled
            ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/60 text-emerald-200'
            : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
        }`}
      >
        <span>🔰</span>
        <span className="hidden xl:inline">{t('beginner_assist.btn_label')}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur-md shadow-2xl p-3 space-y-2.5 z-50 text-xs text-slate-100">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-amber-300 flex items-center gap-1.5">
              <span>🔰</span>
              <span>{t('beginner_assist.title')}</span>
            </span>
            <button
              type="button"
              onClick={toggleMaster}
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition ${
                config.enabled
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {config.enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Separate Sente / Gote Display Toggles */}
          <div className="space-y-1">
            <div className="text-[10px] font-semibold text-slate-400 px-1">
              {t('beginner_assist.side_scope_label')}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => toggleSide('showSente')}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition ${
                  config.enabled && config.showSente
                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                ▲ {t('beginner_assist.side_sente')}
              </button>
              <button
                type="button"
                onClick={() => toggleSide('showGote')}
                className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition ${
                  config.enabled && config.showGote
                    ? 'bg-sky-500/20 border-sky-400/60 text-sky-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                △ {t('beginner_assist.side_gote')}
              </button>
            </div>
          </div>

          <div className="space-y-1 pt-1 border-t border-slate-800/80">
            {LAYER_OPTIONS.map((opt) => (
              <label
                key={opt.key}
                className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg hover:bg-slate-800/70 cursor-pointer select-none"
              >
                <span className="flex items-center gap-2 text-slate-200">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${opt.dotClass}`} />
                  <span>{t(opt.labelKey)}</span>
                </span>
                <input
                  type="checkbox"
                  checked={config.enabled && config[opt.key]}
                  onChange={() => toggleLayer(opt.key)}
                  className="rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-0"
                />
              </label>
            ))}
          </div>

          <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-1.5 text-[10px] text-slate-400">
            <span className="text-orange-300">弱 {t('beginner_assist.legend_weak')}</span>
            <span className="text-sky-300">堅2 {t('beginner_assist.legend_solid2')}</span>
            <span className="text-emerald-300">堅3+ {t('beginner_assist.legend_solid3')}</span>
            <span className="text-rose-300">! {t('beginner_assist.legend_hanging')}</span>
            <span className="text-teal-300">★ {t('beginner_assist.legend_capture')}</span>
          </div>
        </div>
      )}
    </div>
  );
};
