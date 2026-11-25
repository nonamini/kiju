/**
 * Dedicated Full-Page Joseki Tree (棋樹) Route (/tree).
 * Promotes JosekiTreeVisualizer from an overlay modal to a first-class page
 * with direct navigation back to Study Board, Library, Tactics, and the /guide/tree help page.
 * Follows Rule 1: strictly English code, comments, and identifiers; UI strings via t().
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSmartBack } from '../hooks/useSmartBack';
import { JosekiTreeVisualizer } from '../components/tree/JosekiTreeVisualizer';
import { loadSavedStudioGames, SavedStudioGame } from '../utils/studioKifuStorage';
import { initKifuRecordStorage } from '../utils/kifuRecordStorage';

export const JosekiTreePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const goBack = useSmartBack('/');
  const [games, setGames] = useState<SavedStudioGame[]>(() => loadSavedStudioGames());

  useEffect(() => {
    let cancelled = false;
    void initKifuRecordStorage().then(() => {
      if (!cancelled) {
        setGames(loadSavedStudioGames());
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNavigateToStudio = (gameId?: string, ply?: number) => {
    if (gameId) {
      const targetPly = typeof ply === 'number' && ply > 0 ? ply : 0;
      navigate(`/studio?gameId=${encodeURIComponent(gameId)}&ply=${targetPly}`);
      return;
    }
    navigate('/studio');
  };

  return (
    <div className="h-screen pb-14 md:pb-0 bg-slate-950 text-slate-100 flex flex-col overflow-hidden font-sans">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900/95 backdrop-blur px-3 sm:px-5 py-2.5 shrink-0">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={goBack}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition"
              >
                ← {t('common.back')}
              </button>
              <Link
                to="/"
                title={t('common.home')}
                aria-label={t('common.home')}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition"
              >
                🏠
              </Link>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-emerald-300 flex items-center gap-1.5 truncate">
                <span>🌳</span>
                <span className="truncate">{t('tree_page.title')}</span>
              </h1>
              <p className="text-[11px] text-slate-400 hidden sm:block truncate">
                {t('tree_page.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Link
              to="/studio"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold border border-slate-700 transition"
            >
              ✨ <span className="hidden sm:inline">{t('nav.studio')}</span>
            </Link>
            <Link
              to="/library"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
            >
              📚 <span className="hidden sm:inline">{t('library_page.nav_label')}</span>
            </Link>
            <Link
              to="/tactics"
              className="hidden sm:inline-flex px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
            >
              📁 {t('studio.header.tactics_library')}
            </Link>
            <Link
              to="/guide/tree"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition"
              title={t('guide.title')}
              aria-label={t('guide.title')}
            >
              ❓
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <JosekiTreeVisualizer
          games={games}
          maxPlyLimit={30}
          onOpenGame={(game, ply) => handleNavigateToStudio(game.id, ply)}
          onSelectPosition={(_sfen, gameId, ply) => handleNavigateToStudio(gameId, ply)}
        />
      </main>
    </div>
  );
};
