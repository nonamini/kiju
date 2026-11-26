/**
 * Unified Studio Quick-Access Toolbar & Menu Component (Issue #29).
 * Uses a single category -> actions model rendered as:
 * - Compact icon-only quick-access buttons + pinned category mini-dropdowns in the header
 * - 2-column mega-menu on desktop (sm and up) with per-category and per-action pin toggles
 * - Slide-up bottom sheet with accordions on mobile (< sm) with pin toggles
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const MAX_STUDIO_QUICK_PINS = 8;
const MAX_MOBILE_QUICK_PINS = 4;

export interface StudioMenuAction {
  id: string;
  icon: string;
  label: string;
  tooltip?: string;
  disabled?: boolean;
  active?: boolean;
  onClick: () => void;
}

export interface StudioMenuCategory {
  id: string;
  icon: string;
  label: string;
  actions: StudioMenuAction[];
}

export interface StudioQuickAccessMenuProps {
  categories: StudioMenuCategory[];
  pins: string[];
  onTogglePin: (pinId: string) => void;
  onResetPins?: () => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  statusText?: string;
}

export const StudioQuickAccessMenu: React.FC<StudioQuickAccessMenuProps> = ({
  categories,
  pins,
  onTogglePin,
  onResetPins,
  isOpen,
  onOpenChange,
  statusText = '',
}) => {
  const { t } = useTranslation();
  const [activeDesktopCatId, setActiveDesktopCatId] = useState<string>(
    () => categories[0]?.id ?? ''
  );
  const [expandedMobileCatId, setExpandedMobileCatId] = useState<string>(
    () => categories[0]?.id ?? ''
  );
  const [openPinnedCatId, setOpenPinnedCatId] = useState<string | null>(null);

  useEffect(() => {
    if (categories.length === 0) return;
    if (!categories.some((c) => c.id === activeDesktopCatId)) {
      setActiveDesktopCatId(categories[0]?.id ?? '');
    }
  }, [categories, activeDesktopCatId]);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  const actionMap = useMemo(() => {
    const map = new Map<string, StudioMenuAction>();
    for (const cat of categories) {
      for (const act of cat.actions) {
        map.set(act.id, act);
      }
    }
    return map;
  }, [categories]);

  const pinSet = useMemo(() => new Set(pins), [pins]);
  const isAtPinLimit = pins.length >= MAX_STUDIO_QUICK_PINS;

  const activeDesktopCategory =
    categoryMap.get(activeDesktopCatId) ?? categories[0];

  const renderPinButton = (pinId: string) => {
    const isPinned = pinSet.has(pinId);
    const disabled = !isPinned && isAtPinLimit;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(pinId);
        }}
        title={
          isPinned
            ? t('studio_menu.unpin_tooltip')
            : disabled
              ? t('studio_menu.pin_limit_tooltip', { max: MAX_STUDIO_QUICK_PINS })
              : t('studio_menu.pin_tooltip')
        }
        aria-label={
          isPinned ? t('studio_menu.unpin_tooltip') : t('studio_menu.pin_tooltip')
        }
        className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-xs transition ${
          isPinned
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 hover:bg-amber-500/30'
            : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800 border border-transparent disabled:opacity-30 disabled:cursor-not-allowed'
        }`}
      >
        📌
      </button>
    );
  };

  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      {/* Compact Icon-Only Quick-Access Pins */}
      {pins.length > 0 && (
        <div className="flex items-center gap-1">
          {pins.map((pinId, idx) => {
            const visibilityClass =
              idx >= MAX_MOBILE_QUICK_PINS ? 'hidden sm:inline-flex' : 'inline-flex';

            if (pinId.startsWith('act:')) {
              const actId = pinId.slice(4);
              const act = actionMap.get(actId);
              if (!act) return null;
              return (
                <button
                  key={pinId}
                  type="button"
                  disabled={act.disabled}
                  onClick={() => {
                    setOpenPinnedCatId(null);
                    onOpenChange(false);
                    act.onClick();
                  }}
                  title={act.tooltip || act.label}
                  aria-label={act.label}
                  className={`${visibilityClass} items-center justify-center w-8 h-8 text-sm rounded-lg border transition disabled:opacity-35 disabled:cursor-not-allowed ${
                    act.active
                      ? 'bg-amber-600/20 border-amber-500/60 text-amber-300'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 hover:text-amber-300'
                  }`}
                >
                  <span>{act.icon}</span>
                </button>
              );
            }

            if (pinId.startsWith('cat:')) {
              const catId = pinId.slice(4);
              const cat = categoryMap.get(catId);
              if (!cat || cat.actions.length === 0) return null;
              const isCatOpen = openPinnedCatId === cat.id;
              return (
                <div key={pinId} className={`relative ${visibilityClass}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      setOpenPinnedCatId((prev) => (prev === cat.id ? null : cat.id));
                    }}
                    title={cat.label}
                    aria-label={cat.label}
                    aria-expanded={isCatOpen}
                    className={`inline-flex items-center justify-center gap-0.5 px-2 h-8 text-sm rounded-lg border transition ${
                      isCatOpen
                        ? 'bg-amber-600/20 border-amber-500/60 text-amber-300'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 hover:text-amber-300'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span className="text-[9px] text-slate-400">▾</span>
                  </button>
                  {isCatOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setOpenPinnedCatId(null)}
                      />
                      <div className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-1.5 text-xs space-y-0.5">
                        <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 border-b border-slate-800 mb-1 flex items-center gap-1.5">
                          <span>{cat.icon}</span>
                          <span>{cat.label}</span>
                        </div>
                        {cat.actions.map((act) => (
                          <button
                            key={act.id}
                            type="button"
                            disabled={act.disabled}
                            onClick={() => {
                              setOpenPinnedCatId(null);
                              act.onClick();
                            }}
                            title={act.tooltip || act.label}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed font-semibold flex items-center gap-2 transition ${
                              act.active ? 'text-amber-300' : 'text-slate-100 hover:text-amber-300'
                            }`}
                          >
                            <span>{act.icon}</span>
                            <span className="truncate">{act.label}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            }

            return null;
          })}
          <div className="hidden sm:block h-4 w-px bg-slate-800 mx-0.5" />
        </div>
      )}

      {/* Unified Menu Trigger Button */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setOpenPinnedCatId(null);
            onOpenChange(!isOpen);
          }}
          className="px-2 sm:px-2.5 py-1.5 h-8 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold transition flex items-center gap-1 whitespace-nowrap"
          aria-expanded={isOpen}
        >
          <span>☰</span>
          <span className="hidden sm:inline">
            {statusText || t('position_editor.menu_btn')}
          </span>
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-slate-950/50 sm:bg-transparent"
              onClick={() => onOpenChange(false)}
            />

            {/* Desktop (sm+): 2-Column Mega-Menu */}
            <div className="hidden sm:flex flex-col absolute right-0 top-full mt-1.5 z-50 w-[440px] max-w-[92vw] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden text-xs">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-950/60">
                <span className="font-bold text-slate-200">{t('studio_menu.title')}</span>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span>
                    📌 {pins.length}/{MAX_STUDIO_QUICK_PINS}
                  </span>
                  {onResetPins && (
                    <button
                      type="button"
                      onClick={onResetPins}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                    >
                      {t('studio_menu.reset_pins')}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex min-h-[240px]">
                {/* Left Column: Categories */}
                <div className="w-48 shrink-0 border-r border-slate-800 bg-slate-950/40 p-1.5 space-y-1">
                  {categories.map((cat) => {
                    const isSelected = activeDesktopCategory?.id === cat.id;
                    return (
                      <div
                        key={cat.id}
                        onMouseEnter={() => setActiveDesktopCatId(cat.id)}
                        className={`flex items-center gap-1 rounded-lg px-2 py-1.5 transition cursor-pointer ${
                          isSelected
                            ? 'bg-slate-800 text-amber-300'
                            : 'text-slate-300 hover:bg-slate-800/60'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveDesktopCatId(cat.id)}
                          className="flex-1 text-left font-semibold flex items-center gap-2 min-w-0"
                        >
                          <span>{cat.icon}</span>
                          <span className="truncate">{cat.label}</span>
                        </button>
                        {renderPinButton(`cat:${cat.id}`)}
                      </div>
                    );
                  })}
                </div>

                {/* Right Column: Actions of Selected Category */}
                <div className="flex-1 p-2 space-y-1">
                  {activeDesktopCategory && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {activeDesktopCategory.label}
                      </div>
                      {activeDesktopCategory.actions.map((act) => (
                        <div
                          key={act.id}
                          className="flex items-center gap-1 rounded-lg hover:bg-slate-800/70 px-1.5 py-0.5 transition"
                        >
                          <button
                            type="button"
                            disabled={act.disabled}
                            onClick={() => {
                              onOpenChange(false);
                              act.onClick();
                            }}
                            title={act.tooltip || act.label}
                            className={`flex-1 text-left px-1.5 py-1.5 rounded-md font-semibold flex items-center gap-2 min-w-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                              act.active
                                ? 'text-amber-300'
                                : 'text-slate-100 hover:text-amber-300'
                            }`}
                          >
                            <span>{act.icon}</span>
                            <span className="truncate">{act.label}</span>
                          </button>
                          {renderPinButton(`act:${act.id}`)}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile (< sm): Slide-up Bottom Sheet with Accordions */}
            <div className="sm:hidden fixed inset-x-0 bottom-0 z-50 max-h-[80vh] rounded-t-2xl border-t border-slate-700 bg-slate-900 shadow-2xl flex flex-col text-xs">
              <div className="flex flex-col items-center pt-2 pb-2 px-4 border-b border-slate-800 shrink-0">
                <div className="w-10 h-1 rounded-full bg-slate-700 mb-2" />
                <div className="w-full flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-100">
                    {t('studio_menu.title')}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">
                      📌 {pins.length}/{MAX_STUDIO_QUICK_PINS}
                    </span>
                    {onResetPins && (
                      <button
                        type="button"
                        onClick={onResetPins}
                        className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[11px]"
                      >
                        {t('studio_menu.reset_pins')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenChange(false)}
                      className="p-1 rounded-lg bg-slate-800 text-slate-300"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-y-auto p-3 space-y-2 pb-6">
                {categories.map((cat) => {
                  const isExpanded = expandedMobileCatId === cat.id;
                  return (
                    <div
                      key={cat.id}
                      className="rounded-xl border border-slate-800 bg-slate-950/50 overflow-hidden"
                    >
                      <div className="flex items-center gap-1 px-3 py-2 bg-slate-900/80">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedMobileCatId((prev) => (prev === cat.id ? '' : cat.id))
                          }
                          className="flex-1 text-left font-bold text-slate-200 flex items-center justify-between"
                        >
                          <span className="flex items-center gap-2">
                            <span>{cat.icon}</span>
                            <span>{cat.label}</span>
                          </span>
                          <span className="text-[10px] text-slate-400 pr-2">
                            {isExpanded ? '▾' : '▸'}
                          </span>
                        </button>
                        {renderPinButton(`cat:${cat.id}`)}
                      </div>

                      {isExpanded && (
                        <div className="p-1.5 space-y-1 border-t border-slate-800/80">
                          {cat.actions.map((act) => (
                            <div
                              key={act.id}
                              className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-slate-800/70"
                            >
                              <button
                                type="button"
                                disabled={act.disabled}
                                onClick={() => {
                                  onOpenChange(false);
                                  act.onClick();
                                }}
                                className={`flex-1 text-left py-1.5 font-semibold flex items-center gap-2.5 disabled:opacity-40 ${
                                  act.active ? 'text-amber-300' : 'text-slate-100'
                                }`}
                              >
                                <span>{act.icon}</span>
                                <span>{act.label}</span>
                              </button>
                              {renderPinButton(`act:${act.id}`)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
