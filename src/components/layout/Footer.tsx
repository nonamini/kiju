import React from 'react';
import { useTranslation } from 'react-i18next';

export const Footer: React.FC = () => {
  const { t } = useTranslation();

  return (
    <>
      {/* Desktop Footer */}
      <footer className="hidden border-t border-shogi-border bg-shogi-panel/50 py-4 text-center text-xs text-slate-500 sm:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
          <p>{t('app.copyright')}</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>{t('app.powered_by')}</span>
            <span>•</span>
            <span>{t('app.spark_plan')}</span>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-14 items-center justify-around border-t border-shogi-border bg-shogi-panel/95 backdrop-blur sm:hidden">
        <button
          type="button"
          className="flex flex-col items-center gap-0.5 text-amber-500"
        >
          <span className="text-base">🌲</span>
          <span className="text-[10px] font-medium">{t('nav.tree_short')}</span>
        </button>
        <button
          type="button"
          className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-slate-200"
        >
          <span className="text-base">🧠</span>
          <span className="text-[10px] font-medium">{t('nav.drill_short')}</span>
        </button>
        <button
          type="button"
          className="flex flex-col items-center gap-0.5 text-slate-400 hover:text-slate-200"
        >
          <span className="text-base">⚔️</span>
          <span className="text-[10px] font-medium">{t('nav.sparring_short')}</span>
        </button>
      </nav>
    </>
  );
};

export default Footer;
