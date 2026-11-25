import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { useShogiEngine } from '../../hooks/useShogiEngine';
import { AuthStatusButton } from '../auth/AuthStatusButton';
import { useSettings } from '../../contexts/SettingsContext';

interface HeaderProps {
  currentOpening?: string;
  onSelectOpening?: () => void;
  onOpenKifuManager?: () => void;
  gameCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentOpening,
  onSelectOpening,
  onOpenKifuManager,
  gameCount = 0,
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const { status } = useShogiEngine({ autoInit: true });
  const { openSettings } = useSettings();

  return (
    <header className="sticky top-0 z-30 w-full border-b border-shogi-border bg-shogi-panel/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-3 sm:px-6">
        {/* Brand & Opening Selector */}
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 hover:opacity-90 transition">
            <span className="flex h-8 w-8 items-center justify-center rounded bg-amber-600 text-base font-bold text-slate-950 shadow">
              {t('app.logo_char')}
            </span>
            <span className="text-lg font-bold tracking-tight text-slate-100">
              {t('app.title')}
            </span>
          </Link>

          <div className="hidden h-4 w-px bg-slate-700 sm:block" />

          {/* Opening Selector Pill */}
          <button
            type="button"
            onClick={onSelectOpening}
            className="hidden items-center gap-1.5 rounded-full border border-shogi-border bg-shogi-card px-3 py-1 text-xs font-medium text-slate-300 hover:border-amber-500/50 hover:text-white sm:flex"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            <span>{currentOpening || t('app.subtitle')}</span>
            <span className="text-slate-400">▼</span>
          </button>
        </div>

        {/* Navigation Tabs (Desktop) */}
        <nav className="hidden items-center gap-1 md:flex">
          <Link
            to="/studio"
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
              location.pathname === '/studio'
                ? 'bg-amber-600/25 text-amber-300 border border-amber-500/50 font-semibold shadow-sm'
                : 'text-amber-300/90 hover:text-amber-200 hover:bg-slate-800/50'
            }`}
          >
            <span>✨</span>
            <span>{t('nav.studio')}</span>
          </Link>
          <Link
            to="/tactics"
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
              location.pathname === '/tactics' || location.pathname.startsWith('/tactics/')
                ? 'bg-amber-600/25 text-amber-300 border border-amber-500/50 font-semibold shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <span>📁</span>
            <span>{t('studio.header.tactics_library', '定跡一覧')}</span>
          </Link>
          <Link
            to="/library"
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
              location.pathname === '/library'
                ? 'bg-amber-600/25 text-amber-300 border border-amber-500/50 font-semibold shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <span>📚</span>
            <span>{t('library_page.nav_label')}</span>
          </Link>
          <Link
            to="/players"
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
              location.pathname === '/players'
                ? 'bg-amber-600/25 text-amber-300 border border-amber-500/50 font-semibold shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <span>🏯</span>
            <span>{t('players_page.nav_label')}</span>
          </Link>

          <Link
            to="/"
            className={`rounded px-3 py-1.5 text-xs font-medium transition ${
              location.pathname === '/'
                ? 'bg-slate-800 text-white font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('nav.study_tree')}
          </Link>
        </nav>

        {/* Right Actions: Kifu Manager, Settings & Status */}
        <div className="flex items-center gap-2">
          {/* Quick Kifu Manager Button */}
          {onOpenKifuManager && (
            <button
              type="button"
              onClick={onOpenKifuManager}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 px-2.5 py-1 text-xs font-semibold transition active:scale-95 shadow-sm"
              title={t('ingestion.title')}
            >
              <span>📂</span>
              <span className="hidden sm:inline">{t('ingestion.quick_manage')}</span>
              <span className="rounded-full bg-amber-500/20 px-1.5 py-0.2 font-mono text-[10px] text-amber-200">
                {gameCount}
              </span>
            </button>
          )}

          {/* Settings Button (#45) */}
          <button
            type="button"
            onClick={openSettings}
            className="flex items-center gap-1.5 rounded border border-shogi-border bg-shogi-card px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-amber-500/60 hover:text-white transition"
            title={t('settings.title')}
          >
            <span>⚙️</span>
          </button>

          {/* Authentication & User Profile */}
          <AuthStatusButton />

          {/* Dynamic Wasm AI Status Badge */}
          <span
            className={`rounded px-2 py-0.5 text-[11px] font-medium border flex items-center gap-1.5 transition-colors ${
              status === 'ready'
                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/50'
                : status === 'searching'
                ? 'bg-sky-950/80 text-sky-400 border-sky-800/50 animate-pulse'
                : status === 'initializing'
                ? 'bg-amber-950/80 text-amber-300 border-amber-800/50 animate-pulse'
                : status === 'error'
                ? 'bg-rose-950/80 text-rose-400 border-rose-800/50'
                : status === 'offline'
                ? 'bg-slate-900/90 text-amber-400/90 border-amber-500/30'
                : 'bg-slate-900/80 text-slate-400 border-slate-700/50'
            }`}
            title="Fairy-Stockfish 14"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                status === 'ready'
                  ? 'bg-emerald-400'
                  : status === 'searching'
                  ? 'bg-sky-400 animate-ping'
                  : status === 'initializing'
                  ? 'bg-amber-400 animate-ping'
                  : status === 'error'
                  ? 'bg-rose-500'
                  : status === 'offline'
                  ? 'bg-amber-500/80'
                  : 'bg-slate-500'
              }`}
            />
            <span>
              {status === 'ready'
                ? t('engine.status_ready')
                : status === 'searching'
                ? t('engine.status_searching')
                : status === 'initializing'
                ? t('engine.status_initializing')
                : status === 'error'
                ? t('engine.status_error')
                : status === 'offline'
                ? t('engine.status_offline')
                : t('engine.status_uninitialized')}
            </span>
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;
