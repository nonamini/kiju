/**
 * Beginner Assist Overlay toggle button & concise configurator popover (Issue #19).
 * Organizes perspective selection (Auto / Turn / Sente / Gote), mutually-exclusive
 * board overlay mode (Off / Tactical Alerts / Territory Heatmap), and independent
 * major-piece sliding ray toggles without cluttering pieces with text badges.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AssistOverlayMode,
  AssistPerspective,
  BeginnerAssistConfig,
} from '../../utils/boardAssistOverlay';

export interface BeginnerAssistMenuProps {
  config: BeginnerAssistConfig;
  activeViewerColor?: 0 | 1;
  onChange: (next: BeginnerAssistConfig) => void;
}

const PERSPECTIVE_OPTIONS: ReadonlyArray<{
  value: AssistPerspective;
  labelKey: string;
}> = [
  { value: 'auto', labelKey: 'beginner_assist.perspective_auto' },
  { value: 'turn', labelKey: 'beginner_assist.perspective_turn' },
  { value: 'sente', labelKey: 'beginner_assist.perspective_sente' },
  { value: 'gote', labelKey: 'beginner_assist.perspective_gote' },
];

const OVERLAY_MODE_OPTIONS: ReadonlyArray<{
  value: AssistOverlayMode;
  labelKey: string;
}> = [
  { value: 'tactical', labelKey: 'beginner_assist.mode_tactical' },
  { value: 'heatmap', labelKey: 'beginner_assist.mode_heatmap' },
  { value: 'none', labelKey: 'beginner_assist.mode_none' },
];

type BooleanToggleKey =
  | 'showOpponentSlidingLines'
  | 'showOwnSlidingLines'
  | 'showAttackCounts'
  | 'showMaterialImpasse'
  | 'showOpponentThreat'
  | 'showBlunderWarning'
  | 'showEndgameAlerts';

const INDEPENDENT_TOGGLES: ReadonlyArray<{
  key: BooleanToggleKey;
  labelKey: string;
  dotClass: string;
}> = [
  {
    key: 'showOpponentSlidingLines',
    labelKey: 'beginner_assist.opp_sliding_lines',
    dotClass: 'bg-purple-400',
  },
  {
    key: 'showOpponentThreat',
    labelKey: 'beginner_assist.opponent_threat',
    dotClass: 'bg-rose-500',
  },
  {
    key: 'showBlunderWarning',
    labelKey: 'beginner_assist.blunder_warning',
    dotClass: 'bg-orange-400',
  },
  {
    key: 'showEndgameAlerts',
    labelKey: 'beginner_assist.endgame_alerts',
    dotClass: 'bg-yellow-400',
  },
  {
    key: 'showOwnSlidingLines',
    labelKey: 'beginner_assist.own_sliding_lines',
    dotClass: 'bg-emerald-400',
  },
  {
    key: 'showAttackCounts',
    labelKey: 'beginner_assist.attack_counts',
    dotClass: 'bg-slate-400',
  },
  {
    key: 'showMaterialImpasse',
    labelKey: 'beginner_assist.material_impasse',
    dotClass: 'bg-amber-400',
  },
];

export const BeginnerAssistMenu: React.FC<BeginnerAssistMenuProps> = ({
  config,
  activeViewerColor = 0,
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

  const setPerspective = (perspective: AssistPerspective) => {
    onChange({ ...config, enabled: true, perspective });
  };

  const setOverlayMode = (overlayMode: AssistOverlayMode) => {
    onChange({ ...config, enabled: true, overlayMode });
  };

  const toggleBooleanOption = (key: BooleanToggleKey) => {
    const nextVal = !config[key];
    onChange({
      ...config,
      enabled: nextVal ? true : config.enabled,
      [key]: nextVal,
    });
  };

  const activeSideLabel =
    activeViewerColor === 0
      ? `▲ ${t('beginner_assist.side_sente_short')}`
      : `△ ${t('beginner_assist.side_gote_short')}`;

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
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur-md shadow-2xl p-3 space-y-3 z-50 text-xs text-slate-100">
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

          {/* 1. Perspective selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[10px] font-semibold text-slate-400">
                {t('beginner_assist.perspective_label')}
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  activeViewerColor === 0
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-sky-500/15 text-sky-300'
                }`}
              >
                {activeSideLabel}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {PERSPECTIVE_OPTIONS.map((opt) => {
                const isSelected = config.perspective === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPerspective(opt.value)}
                    className={`px-1.5 py-1.5 rounded-lg border text-[11px] font-bold transition ${
                      isSelected
                        ? 'bg-emerald-500/20 border-emerald-400/70 text-emerald-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t(opt.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Mutually-exclusive overlay mode */}
          <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
            <div className="text-[10px] font-semibold text-slate-400 px-0.5">
              {t('beginner_assist.mode_label')}
            </div>
            <div className="grid grid-cols-3 gap-1">
              {OVERLAY_MODE_OPTIONS.map((opt) => {
                const isSelected = config.enabled && config.overlayMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setOverlayMode(opt.value)}
                    className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold transition ${
                      isSelected
                        ? 'bg-sky-500/20 border-sky-400/70 text-sky-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t(opt.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Independent toggles */}
          <div className="space-y-1 pt-1 border-t border-slate-800/80">
            {INDEPENDENT_TOGGLES.map((opt) => (
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
                  onChange={() => toggleBooleanOption(opt.key)}
                  className="rounded border-slate-600 bg-slate-950 text-emerald-500 focus:ring-0"
                />
              </label>
            ))}
          </div>

          {/* Compact visual legend */}
          <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-1.5 text-[10px] text-slate-400">
            {config.overlayMode === 'heatmap' ? (
              <>
                <span className="text-rose-400">■ ▲ {t('beginner_assist.legend_sente_area')}</span>
                <span className="text-blue-400">■ △ {t('beginner_assist.legend_gote_area')}</span>
              </>
            ) : (
              <>
                <span className="text-rose-300">□ {t('beginner_assist.legend_danger')}</span>
                <span className="text-emerald-300">□ {t('beginner_assist.legend_capture')}</span>
              </>
            )}
            <span className="text-purple-300">■ {t('beginner_assist.legend_opp_sliding')}</span>
          </div>
        </div>
      )}
    </div>
  );
};
