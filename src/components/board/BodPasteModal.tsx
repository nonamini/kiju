/**
 * Modal dialog for pasting Japanese BOD text board diagrams or SFEN strings
 * to load positions into the Study Board, Tsumego/Position Editor, or Partial Diagram Editor (Issue #14).
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseBodOrSfenToSfen } from '../../utils/bodParser';

export interface BodPasteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (sfen: string, rawText: string) => void;
}

export const BodPasteModal: React.FC<BodPasteModalProps> = ({
  isOpen,
  onClose,
  onApply,
}) => {
  const { t } = useTranslation();
  const [rawText, setRawText] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    setRawText('');
  }, [isOpen]);

  const parsedSfen = useMemo(() => parseBodOrSfenToSfen(rawText), [rawText]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('bod_paste.modal_title')}
        className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-amber-300 flex items-center gap-2">
              <span>📋</span>
              <span>{t('bod_paste.modal_title')}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('bod_paste.modal_subtitle')}
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

        <div className="p-5 space-y-3 text-xs">
          <textarea
            rows={12}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={t('bod_paste.placeholder')}
            autoFocus
            className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
          />

          {rawText.trim().length > 0 && (
            <div
              className={`rounded-lg border px-3 py-2 text-[11px] font-mono break-all ${
                parsedSfen
                  ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
                  : 'border-rose-500/40 bg-rose-950/30 text-rose-200'
              }`}
            >
              {parsedSfen ? (
                <div>
                  <span className="font-sans font-bold text-emerald-300 mr-2">
                    ✓ {t('bod_paste.valid_sfen_label')}:
                  </span>
                  <span>{parsedSfen}</span>
                </div>
              ) : (
                <div className="font-sans">{t('bod_paste.invalid_hint')}</div>
              )}
            </div>
          )}
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
            disabled={!parsedSfen}
            onClick={() => {
              if (!parsedSfen) return;
              onApply(parsedSfen, rawText);
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 text-xs font-bold transition"
          >
            {t('bod_paste.apply_btn')}
          </button>
        </div>
      </div>
    </div>
  );
};
