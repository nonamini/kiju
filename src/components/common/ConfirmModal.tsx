import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  isDestructive = false,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in font-sans"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl p-5 text-slate-100 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={`p-2.5 rounded-xl shrink-0 text-xl flex items-center justify-center ${
              isDestructive
                ? 'bg-rose-950/70 text-rose-400 border border-rose-800/60'
                : 'bg-amber-950/70 text-amber-300 border border-amber-800/60'
            }`}
          >
            {isDestructive ? '⚠️' : '❓'}
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 id="confirm-modal-title" className="text-sm sm:text-base font-bold text-slate-100">
              {title}
            </h3>
            <div className="mt-1 text-xs sm:text-sm text-slate-300 whitespace-pre-line leading-relaxed">
              {message}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 transition"
          >
            {cancelLabel ?? t('common.cancel', 'キャンセル')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-md active:scale-95 ${
              isDestructive
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30'
                : 'bg-amber-600 hover:bg-amber-500 text-slate-950 shadow-amber-900/30'
            }`}
          >
            {confirmLabel ?? t('common.confirm', '実行する')}
          </button>
        </div>
      </div>
    </div>
  );
};
