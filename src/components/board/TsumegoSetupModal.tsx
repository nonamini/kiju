/**
 * Modal dialog for Tsume-shogi Initial Setup preset.
 * Prompts whether to place the remaining non-King pieces into the Piece Box
 * or the defender's (Gote) hand without causing any layout shift.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

export interface TsumegoSetupModalProps {
  isOpen: boolean;
  onSelectToBox: () => void;
  onSelectToHand: () => void;
  onCancel: () => void;
}

export const TsumegoSetupModal: React.FC<TsumegoSetupModalProps> = ({
  isOpen,
  onSelectToBox,
  onSelectToHand,
  onCancel,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-2xl border border-amber-500/40 bg-slate-900 p-5 shadow-2xl space-y-4">
        <div className="space-y-1.5">
          <h3 className="text-base font-bold text-amber-300 flex items-center gap-2">
            <span>🧩</span>
            <span>{t('position_editor.tsumego_setup_title')}</span>
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            {t('position_editor.tsumego_setup_desc')}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
          >
            {t('position_editor.cancel')}
          </button>
          <button
            type="button"
            onClick={onSelectToBox}
            className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 text-xs font-bold transition"
          >
            {t('position_editor.tsumego_setup_to_box')}
          </button>
          <button
            type="button"
            onClick={onSelectToHand}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow"
          >
            {t('position_editor.tsumego_setup_to_hand')}
          </button>
        </div>
      </div>
    </div>
  );
};
