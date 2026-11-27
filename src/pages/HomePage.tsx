/**
 * Portal / Welcome Home Screen for 棋樹 (joseki-tree).
 * Clean landing screen with:
 *  1. One-click "Resume last session" banner
 *  2. 4 Primary action cards (Study, Sparring, Quiz, Library)
 *  3. Recent games & studies quick list
 * Follows Rule 1: strictly English code, comments, identifiers; UI strings via t().
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  loadLastStudioSession,
  loadRecentlyOpenedGames,
  loadSavedStudioGames,
  SavedStudioGame,
  StudioLastSession,
} from '../utils/studioKifuStorage';
import { loadQuizPool } from '../utils/quizPoolStorage';
import { ShogiRulebookModal } from '../components/common/ShogiRulebookModal';
import { useSettings } from '../contexts/SettingsContext';
import {
  buildMainlineTreeFromGames,
  compressTreeToBranchPoints,
  layoutOrganicTree,
} from '../components/tree/JosekiTreeVisualizer';
import { MotivationDashboardSection } from '../components/dashboard/MotivationDashboardSection';
import { aggregateMotivationActivity } from '../utils/activityAggregator';
import {
  buildMaintenanceSummary,
  pickRandomMaintenanceTasks,
} from '../utils/maintenanceTasks';
import {
  initKifuRecordStorage,
  loadKifuRecords,
} from '../utils/kifuRecordStorage';
import { loadMatchRecords } from '../utils/matchHistoryStorage';
import { loadSrsCards } from '../utils/srsStorage';
import { loadPlayerProfiles } from '../utils/playerStorage';
import type { KifuRecord } from '../types/kifuRecord';
import type { MatchRecord } from '../types/match';
import type { ShogiPlayerProfile } from '../types/player';
import type { SRSReviewCard } from '../types/srs';

export const HomePage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { openSettings, updateSettings } = useSettings();

  const [lastSession, setLastSession] = useState<StudioLastSession | null>(null);
  const [allGames, setAllGames] = useState<SavedStudioGame[]>([]);
  const [recentGames, setRecentGames] = useState<SavedStudioGame[]>([]);
  const [openedAtById, setOpenedAtById] = useState<Map<string, string>>(() => new Map());
  const [quizPoolCount, setQuizPoolCount] = useState<number>(0);
  const [kifuRecords, setKifuRecords] = useState<KifuRecord[]>(() =>
    loadKifuRecords()
  );
  const [matchRecords, setMatchRecords] = useState<MatchRecord[]>(() =>
    loadMatchRecords()
  );
  const [srsCards, setSrsCards] = useState<SRSReviewCard[]>(() =>
    loadSrsCards()
  );
  const [playerProfiles, setPlayerProfiles] = useState<ShogiPlayerProfile[]>(() =>
    loadPlayerProfiles()
  );
  const [isRulebookOpen, setIsRulebookOpen] = useState(false);
  const [maintenanceSeed, setMaintenanceSeed] = useState(0);

  useEffect(() => {
    const refreshFromLocal = () => {
      const session = loadLastStudioSession();
      // Ignore legacy hardcoded demo game (第36期竜王戦七番勝負 第1局) if lingering in localStorage
      if (session && session.gameTitle?.includes('第36期竜王戦七番勝負')) {
        // Clear out the demo game residue
        try {
          localStorage.removeItem('joseki_tree_last_session');
        } catch {
          // ignore
        }
        setLastSession(null);
      } else {
        setLastSession(session);
      }

      const games = loadSavedStudioGames();
      setAllGames(games);
      const openedMap = new Map(
        loadRecentlyOpenedGames().map((entry) => [entry.id, entry.openedAt])
      );
      setOpenedAtById(openedMap);
      // Prioritize recently opened games, then fall back to updatedAt descending
      const sorted = [...games].sort((a, b) => {
        const aOpened = openedMap.get(a.id);
        const bOpened = openedMap.get(b.id);
        if (aOpened && bOpened) {
          return new Date(bOpened).getTime() - new Date(aOpened).getTime();
        }
        if (aOpened) return -1;
        if (bOpened) return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      setRecentGames(sorted.slice(0, 5));
      setQuizPoolCount(loadQuizPool().length);
      setKifuRecords(loadKifuRecords());
      setMatchRecords(loadMatchRecords());
      setSrsCards(loadSrsCards());
      setPlayerProfiles(loadPlayerProfiles());
    };

    refreshFromLocal();
    let cancelled = false;
    void initKifuRecordStorage().then(() => {
      if (!cancelled) {
        refreshFromLocal();
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activityStats = useMemo(
    () =>
      aggregateMotivationActivity({
        kifuRecords,
        matchRecords,
        srsCards,
        playerProfiles,
      }),
    [kifuRecords, matchRecords, srsCards, playerProfiles]
  );

  const maintenanceSummary = useMemo(
    () => buildMaintenanceSummary(kifuRecords, playerProfiles),
    [kifuRecords, playerProfiles]
  );

  const dailyTasks = useMemo(
    () => pickRandomMaintenanceTasks(maintenanceSummary.pendingTasks, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [maintenanceSummary.pendingTasks, maintenanceSeed]
  );

  const treePreview = useMemo(() => {
    const proCount = allGames.filter((g) => (g.gameKind ?? 'other') === 'pro').length;
    const selfCount = allGames.filter((g) => (g.gameKind ?? 'other') === 'self').length;
    const fullStatsTree = buildMainlineTreeFromGames(allGames, 30);
    const compressedStats = compressTreeToBranchPoints(fullStatsTree);
    const statsLayout = layoutOrganicTree(compressedStats, 600, 360);
    const branchCount = statsLayout.nodes.filter((n) => n.isBranchPoint).length;
    const maxPly = statsLayout.nodes.reduce((m, n) => Math.max(m, n.ply), 0);

    // Zoomed-in 5-ply opening tree for the HomePage preview (aspect matched to container)
    const miniTree = buildMainlineTreeFromGames(allGames, 5);
    const miniCompressed = compressTreeToBranchPoints(miniTree);
    const miniLayout = layoutOrganicTree(miniCompressed, 720, 420);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of miniLayout.nodes) {
      const nx = n.x ?? 0;
      const ny = n.y ?? 0;
      if (nx < minX) minX = nx;
      if (nx > maxX) maxX = nx;
      if (ny < minY) minY = ny;
      if (ny > maxY) maxY = ny;
    }
    const padX = 42;
    const padTop = 20;
    const padBottom = 24;
    const viewBox =
      miniLayout.nodes.length > 0 && Number.isFinite(minX)
        ? `${minX - padX} ${minY - padTop} ${Math.max(120, maxX - minX + padX * 2)} ${Math.max(120, maxY - minY + padTop + padBottom)}`
        : '0 0 720 420';

    return {
      proCount,
      selfCount,
      branchCount,
      maxPly,
      viewBox,
      nodes: miniLayout.nodes,
      links: miniLayout.links,
    };
  }, [allGames]);

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'ja' ? 'en' : 'ja';
    updateSettings({ language: nextLang });
    void i18n.changeLanguage(nextLang);
  };

  const getRelativeTime = (isoString: string): string => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      const diffMin = Math.floor(diffMs / (1000 * 60));
      if (diffMin < 1) return i18n.language === 'ja' ? 'たった今' : 'just now';
      if (diffMin < 60) return i18n.language === 'ja' ? `${diffMin}分前` : `${diffMin}m ago`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return i18n.language === 'ja' ? `${diffHours}時間前` : `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return i18n.language === 'ja' ? `${diffDays}日前` : `${diffDays}d ago`;
    } catch {
      return '';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500/30">
      {/* Top Navigation Bar */}
      <header className="border-b border-amber-950/40 bg-slate-900/80 backdrop-blur sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-slate-950 font-black text-xl shadow-md shadow-amber-900/30">
            樹
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500 bg-clip-text text-transparent tracking-wide">
                棋樹
              </h1>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                v0.1
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              {t('home.badge')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => navigate('/tactics')}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-600/90 hover:bg-amber-500 text-slate-950 font-bold transition flex items-center gap-1.5 shadow"
          >
            <span>📚</span>
            <span className="hidden sm:inline">{t('home.tactics_notebook_btn', '定跡ノート')}</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/rulebook')}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 transition flex items-center gap-1.5 shadow"
          >
            <span>📖</span>
            <span className="hidden sm:inline">{t('home.open_rulebook')}</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/guide')}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 transition flex items-center gap-1.5 shadow"
            title={t('guide.title')}
          >
            <span>❓</span>
            <span className="hidden sm:inline">{t('home.open_guide')}</span>
          </button>

          <div
            className="inline-flex items-center rounded-lg bg-slate-900 border border-slate-700 p-0.5 text-[11px] font-bold"
            role="group"
            aria-label={t('common.language')}
          >
            <button
              type="button"
              onClick={() => {
                if (!i18n.language?.startsWith('ja')) toggleLanguage();
              }}
              className={`px-2 py-1 rounded-md transition ${
                i18n.language?.startsWith('ja')
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              日本語
            </button>
            <button
              type="button"
              onClick={() => {
                if (i18n.language?.startsWith('ja')) toggleLanguage();
              }}
              className={`px-2 py-1 rounded-md font-mono transition ${
                !i18n.language?.startsWith('ja')
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              EN
            </button>
          </div>

          <button
            type="button"
            onClick={openSettings}
            className="px-2.5 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title={t('settings.title')}
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* Hero Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-8">
        {/* Hero Title */}
        <div className="text-center space-y-2">
          <span className="inline-block text-xs font-bold tracking-widest text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
            {t('home.badge')}
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-100 tracking-tight">
            {t('home.title')}
          </h2>
          <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto">
            {t('home.subtitle')}
          </p>
        </div>

        {/* 1. Resume Last Session Banner (If available) */}
        {lastSession && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900 border border-amber-500/40 p-5 sm:p-6 shadow-2xl shadow-amber-950/20 transition hover:border-amber-500/60 group">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    {t('home.resume_card_title')}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    ({getRelativeTime(lastSession.updatedAt)})
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-100 group-hover:text-amber-200 transition">
                  {lastSession.gameTitle}
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-mono font-semibold border border-slate-700">
                    {t('home.ply_count', { ply: lastSession.currentPly })} / {lastSession.totalPlies}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {t(`home.mode_label.${lastSession.activeMode}`)}
                  </span>
                  {lastSession.senteName && lastSession.goteName && (
                    <span className="text-slate-400">
                      ☗ {lastSession.senteName} vs ☖ {lastSession.goteName}
                    </span>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate('/studio?resume=true')}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-sm shadow-lg shadow-amber-600/30 transition active:scale-95 flex items-center justify-center gap-2 shrink-0"
              >
                <span>⚡</span>
                <span>{t('home.resume_btn')}</span>
                <span>▶</span>
              </button>
            </div>
            {/* Subtle glow effect background */}
            <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          </div>
        )}

        {/* 1.2 First-Time Onboarding Card (shown when no session or games exist yet) */}
        {!lastSession && allGames.length === 0 && (
          <section className="rounded-2xl bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/40 p-5 sm:p-6 shadow-xl space-y-4">
            <div className="space-y-1">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {t('home.onboarding.badge')}
              </span>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-100">
                {t('home.onboarding.title')}
              </h3>
              <p className="text-xs text-slate-400">
                {t('home.onboarding.subtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-amber-500/30 bg-slate-950/60 p-3.5 flex flex-col justify-between gap-2.5">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-amber-300">
                    📥 {t('home.onboarding.step1_title')}
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {t('home.onboarding.step1_desc')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/studio?modal=import')}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
                >
                  {t('home.onboarding.step1_cta')} →
                </button>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-slate-950/60 p-3.5 flex flex-col justify-between gap-2.5">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-emerald-300">
                    ♟️ {t('home.onboarding.step2_title')}
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {t('home.onboarding.step2_desc')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/studio')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold text-xs transition"
                >
                  {t('home.onboarding.step2_cta')} →
                </button>
              </div>

              <div className="rounded-xl border border-sky-500/30 bg-slate-950/60 p-3.5 flex flex-col justify-between gap-2.5">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-sky-300">
                    📘 {t('home.onboarding.step3_title')}
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {t('home.onboarding.step3_desc')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/guide/quickstart')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 font-bold text-xs transition"
                >
                  {t('home.onboarding.step3_cta')} →
                </button>
              </div>
            </div>
          </section>
        )}

        {/* 1.5 Core Joseki Tree Growth Showcase */}
        <section className="rounded-2xl bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-emerald-950/30 border border-emerald-500/30 p-5 sm:p-6 shadow-xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
            <div className="lg:col-span-5 space-y-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold">
                <span>🌳</span>
                <span>{t('home.tree_preview.badge')}</span>
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-slate-100">
                {t('home.tree_preview.title')}
              </h3>
              <p className="text-xs leading-relaxed text-slate-400">
                {t('home.tree_preview.desc')}
              </p>

              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="rounded-xl bg-slate-950/70 border border-slate-800 px-2 py-2">
                  <div className="text-base font-extrabold font-mono text-amber-300">
                    {allGames.length}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {t('home.tree_preview.stat_games')}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-950/70 border border-slate-800 px-2 py-2">
                  <div className="text-base font-extrabold font-mono text-emerald-300">
                    {treePreview.branchCount}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {t('home.tree_preview.stat_branches')}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-950/70 border border-slate-800 px-2 py-2">
                  <div className="text-base font-extrabold font-mono text-sky-300">
                    {treePreview.maxPly}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {t('home.tree_preview.stat_depth')}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  {t('library_page.game_kind_pro')}: {treePreview.proCount}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  {t('library_page.game_kind_self')}: {treePreview.selfCount}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  {t('home.tree_preview.legend_shared')}
                </span>
              </div>

              <button
                type="button"
                onClick={() => navigate('/tree')}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-900/30 transition active:scale-95 inline-flex items-center justify-center gap-2"
              >
                <span>🌳</span>
                <span>{t('home.tree_preview.open_btn')}</span>
              </button>
            </div>

            <div
              onClick={() => navigate('/tree')}
              className="lg:col-span-7 rounded-xl bg-slate-950/80 border border-slate-800/90 p-2 cursor-pointer hover:border-emerald-500/40 transition overflow-hidden"
              title={t('home.tree_preview.open_btn')}
            >
              <svg
                viewBox={treePreview.viewBox}
                preserveAspectRatio="xMidYMid meet"
                className="w-full h-56 sm:h-64 block"
              >
                {treePreview.links.map((link, idx) => {
                  const sx = link.source.x ?? 0;
                  const sy = link.source.y ?? 0;
                  const tx = link.target.x ?? 0;
                  const ty = link.target.y ?? 0;
                  const midY = (sy + ty) / 2;
                  const d = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
                  const hasPro = link.target.proCount > 0;
                  const hasSelf = link.target.selfCount > 0;
                  const stroke =
                    hasPro && hasSelf
                      ? '#10b981'
                      : hasPro
                        ? '#38bdf8'
                        : hasSelf
                          ? '#f59e0b'
                          : '#475569';
                  return (
                    <path
                      key={`mini-link-${idx}`}
                      d={d}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={Math.max(1.5, Math.min(6, (link.target.gameCount / Math.max(1, allGames.length)) * 10))}
                      strokeLinecap="round"
                      opacity={0.85}
                    />
                  );
                })}
                {treePreview.nodes.map((node) => {
                  const nx = node.x ?? 0;
                  const ny = node.y ?? 0;
                  const isRoot = node.ply === 0;
                  const ratio = node.gameCount / Math.max(1, allGames.length);
                  const pct = Math.round(ratio * 100);
                  const hasPro = node.proCount > 0;
                  const hasSelf = node.selfCount > 0;
                  const fill = isRoot
                    ? '#d97706'
                    : hasPro && hasSelf
                      ? '#10b981'
                      : hasPro
                        ? '#38bdf8'
                        : hasSelf
                          ? '#f59e0b'
                          : '#64748b';
                  const r = isRoot ? 10.5 : Math.max(5.5, Math.min(13, 5 + ratio * 12));
                  const showLabel =
                    isRoot ||
                    (node.ply === 1 && ratio >= 0.1) ||
                    (node.ply === 2 && ratio >= 0.1);
                  return (
                    <g key={`mini-node-${node.id}`} transform={`translate(${nx}, ${ny})`}>
                      <circle r={r} fill={fill} stroke="#0f172a" strokeWidth={1.5} />
                      {showLabel && (
                        <text
                          y={isRoot ? 22 : -r - 6}
                          textAnchor="middle"
                          className="text-[13px] font-bold fill-slate-100 select-none"
                        >
                          {isRoot ? '◇ 平手' : `${node.japaneseMove} (${pct}%)`}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </section>

        {/* 1.8 Motivation & Match Analytics Dashboard (Epic 13) */}
        <MotivationDashboardSection stats={activityStats} />

        {/* 1.9 Daily Maintenance Tasks */}
        {maintenanceSummary.pendingTasks.length > 0 && (
          <section className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                  <span>🧹</span>
                  <span>{t('home.daily_maintenance_tasks_title', '今日のメンテタスク')}</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  {t('home.daily_maintenance_tasks_desc', '未整理の棋士リンク・タグ・通し確認を少しずつ片付けましょう')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMaintenanceSeed((s) => s + 1)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 transition"
              >
                🎲 別のを引く
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono">
              {[
                { label: '🏯 棋士リンク', p: maintenanceSummary.playerLinks },
                { label: '🏷️ タグ・戦型', p: maintenanceSummary.kifuTags },
                { label: '👀 通し確認', p: maintenanceSummary.kifuReview },
              ].map((stat) => {
                const pct = stat.p.total > 0 ? Math.round((stat.p.done / stat.p.total) * 100) : 100;
                return (
                  <div key={stat.label} className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>{stat.label}</span>
                      <span>
                        {stat.p.done}/{stat.p.total} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {dailyTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => navigate(task.route)}
                  className="text-left p-3 rounded-xl bg-slate-950/70 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/50 transition space-y-1"
                >
                  <div className="text-xs font-bold text-slate-100 truncate">
                    {task.kind === 'player_link' ? '🏯 ' : task.kind === 'kifu_tag' ? '🏷️ ' : '👀 '}
                    {task.title}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">{task.subtitle}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 2. Primary 4 Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {/* Card 1: Tree Study */}
          <div className="group relative rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 p-6 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-amber-950/20">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                🌲
              </div>
              <h3 className="text-lg font-bold text-slate-100 group-hover:text-amber-300 transition">
                {t('home.cards.study_title')}
              </h3>
              <p className="text-xs leading-relaxed text-slate-400">
                {t('home.cards.study_desc')}
              </p>
            </div>
            <div className="pt-6">
              <button
                type="button"
                onClick={() => navigate('/studio?new=true')}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-amber-600 hover:text-slate-950 text-slate-200 text-xs font-bold transition flex items-center justify-center gap-2 border border-slate-700 hover:border-amber-500 shadow"
              >
                <span>➕</span>
                <span>{t('home.cards.study_btn')}</span>
              </button>
            </div>
          </div>

          {/* Card 2: AI Sparring Match */}
          <div className="group relative rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-rose-500/50 p-6 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-rose-950/20">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                ⚔️
              </div>
              <h3 className="text-lg font-bold text-slate-100 group-hover:text-rose-300 transition">
                {t('home.cards.match_title')}
              </h3>
              <p className="text-xs leading-relaxed text-slate-400">
                {t('home.cards.match_desc')}
              </p>
            </div>
            <div className="pt-6">
              <button
                type="button"
                onClick={() => navigate('/studio?mode=match')}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-rose-600 hover:text-white text-slate-200 text-xs font-bold transition flex items-center justify-center gap-2 border border-slate-700 hover:border-rose-500 shadow"
              >
                <span>⚔️</span>
                <span>{t('home.cards.match_btn')}</span>
              </button>
            </div>
          </div>

          {/* Card 3: Tactical Quizzes */}
          <div className="group relative rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-indigo-500/50 p-6 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-indigo-950/20">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  🎯
                </div>
                {quizPoolCount > 0 && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold font-mono">
                    {t('home.cards.quiz_count', { count: quizPoolCount })}
                  </span>
                )}
              </div>
              <h3 className="text-lg font-bold text-slate-100 group-hover:text-indigo-300 transition">
                {t('home.cards.quiz_title')}
              </h3>
              <p className="text-xs leading-relaxed text-slate-400">
                {t('home.cards.quiz_desc')}
              </p>
            </div>
            <div className="pt-6 space-y-2">
              <button
                type="button"
                onClick={() => navigate('/studio?quiz=true')}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-200 text-xs font-bold transition flex items-center justify-center gap-2 border border-slate-700 hover:border-indigo-500 shadow"
              >
                <span>🎯</span>
                <span>{t('home.cards.quiz_btn')}</span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/studio?mode=tsumego')}
                  className="py-2 px-3 bg-slate-800/80 hover:bg-slate-700 text-amber-300 text-xs font-bold rounded-xl border border-amber-500/30 transition flex items-center justify-center gap-1"
                >
                  <span>👑</span>
                  <span>{t('home.cards.tsumego_btn')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/studio?mode=trace')}
                  className="py-2 px-3 bg-slate-800/80 hover:bg-slate-700 text-indigo-300 text-xs font-bold rounded-xl border border-indigo-500/30 transition flex items-center justify-center gap-1"
                >
                  <span>✍️</span>
                  <span>{t('home.cards.trace_btn')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Card 4: Kifu Library & Management */}
          <div className="group relative rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 p-6 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-amber-950/20">
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                📚
              </div>
              <h3 className="text-lg font-bold text-slate-100 group-hover:text-amber-300 transition">
                {t('home.cards.library_title')}
              </h3>
              <p className="text-xs leading-relaxed text-slate-400">
                {t('home.cards.library_desc')}
              </p>
            </div>
            <div className="pt-6 space-y-2">
              <button
                type="button"
                onClick={() => navigate('/library')}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-amber-600 hover:text-slate-950 text-slate-200 text-xs font-bold transition flex items-center justify-center gap-2 border border-slate-700 hover:border-amber-500 shadow"
              >
                <span>📚</span>
                <span>{t('library_page.open_page_btn')}</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/players')}
                className="w-full py-2 px-3 bg-slate-800/80 hover:bg-slate-700 text-amber-300 text-xs font-bold rounded-xl border border-amber-500/30 transition-all cursor-pointer flex items-center justify-center gap-1"
                title={t('players_page.subtitle')}
              >
                🏯 {t('players_page.nav_label')}
              </button>
            </div>
          </div>
        </div>

        {/* 3. Recent Games List */}
        <section className="rounded-2xl bg-slate-900/70 border border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <span>🕒</span>
              <span>{t('home.recent_games_title')}</span>
            </h3>
            {recentGames.length > 0 && (
              <button
                type="button"
                onClick={() => navigate('/library')}
                className="text-xs text-amber-400 hover:text-amber-300 transition"
              >
                {t('library_page.open_page_btn')}
              </button>
            )}
          </div>

          {recentGames.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              {t('home.no_recent_games')}
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {recentGames.map((game) => (
                <div
                  key={game.id}
                  className="py-3 flex items-center justify-between gap-4 hover:bg-slate-800/40 px-3 rounded-lg transition"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-200 truncate">
                        {game.title}
                      </span>
                      {game.tags && game.tags.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 border border-slate-700 shrink-0">
                          {game.tags[0]}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                      <span>{t('library_page.plies_count', { count: game.totalPlies, defaultValue: `${game.totalPlies}手` })}</span>
                      <span>•</span>
                      <span>{game.openingName || t('kifu.hirate', '平手')}</span>
                      <span>•</span>
                      <span>{getRelativeTime(openedAtById.get(game.id) ?? game.updatedAt)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(`/studio?gameId=${encodeURIComponent(game.id)}`)}
                    className="px-3 py-1 rounded bg-slate-800 hover:bg-amber-600 hover:text-slate-950 text-slate-300 text-xs font-semibold border border-slate-700 transition shrink-0"
                  >
                    {t('home.open_game')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 px-6 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 max-w-6xl w-full mx-auto">
        <div>{t('app.copyright')}</div>
        <div className="flex items-center gap-4 text-[11px]">
          <span>{t('app.powered_by')}</span>
        </div>
      </footer>

      {/* Shogi Rulebook Modal */}
      {isRulebookOpen && (
        <ShogiRulebookModal
          isOpen={isRulebookOpen}
          initialTopic="sanyata"
          onClose={() => setIsRulebookOpen(false)}
        />
      )}
    </div>
  );
};
export default HomePage;
