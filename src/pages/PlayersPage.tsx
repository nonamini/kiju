/**
 * Player Encyclopedia & Management Page (/players, Issue #56).
 * Lists registered ShogiPlayerProfiles (Pro, User, AI) with category tabs,
 * fast text search across names/aliases/titles/notes, sorting by game count,
 * and full create/edit/delete/AI-reclassify management.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSmartBack } from '../hooks/useSmartBack';
import type { PlayerCategory, ShogiPlayerProfile } from '../types/player';
import type { KifuRecord } from '../types/kifuRecord';
import { auth } from '../services/firebase';
import {
  deletePlayerFromFirestore,
  uploadPlayerToFirestore,
} from '../services/firestoreKifuSync';
import {
  reclassifyAiPlayersAndSyncRecords,
  reclassifyRecordsForPlayer,
} from '../utils/gameKindClassifier';
import {
  initKifuRecordStorage,
  loadKifuRecords,
} from '../utils/kifuRecordStorage';
import {
  buildPlayerGameCounts,
  filterAndSortPlayers,
  PlayerSortDirection,
  PlayerSortField,
} from '../utils/playerListFilter';
import {
  aggregatePlayerEvaluation,
  getQualityLevelBadgeMeta,
} from '../utils/playerEvaluationAggregator';
import {
  deletePlayerProfile,
  isProtectedPlayerProfile,
  loadPlayerProfiles,
  upsertPlayerProfile,
} from '../utils/playerStorage';
import { PlayerDetailModal } from '../components/players/PlayerDetailModal';
import { PlayerDeduplicationModal } from '../components/players/PlayerDeduplicationModal';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { MyFilterBar } from '../components/common/MyFilterBar';
import {
  PlayerMyFilterPreset,
  deleteMyFilter,
  loadPlayerMyFilters,
  savePlayerMyFilter,
} from '../utils/myFilterStorage';

export const PlayersPage: React.FC = () => {
  const { t } = useTranslation();
  const handleGoBack = useSmartBack('/');

  const [profiles, setProfiles] = useState<ShogiPlayerProfile[]>(() =>
    loadPlayerProfiles()
  );
  const [records, setRecords] = useState<KifuRecord[]>(() => loadKifuRecords());
  const [categoryTab, setCategoryTab] = useState<'all' | PlayerCategory>('all');
  const [query, setQuery] = useState('');
  const [sortField, setSortField] = useState<PlayerSortField>('gameCount');
  const [sortDirection, setSortDirection] = useState<PlayerSortDirection>('desc');
  const [playerPresets, setPlayerPresets] = useState<PlayerMyFilterPreset[]>(() =>
    loadPlayerMyFilters()
  );
  const [activeMyFilterId, setActiveMyFilterId] = useState<string | null>(null);

  // Add / Edit form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDedupOpen, setIsDedupOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isDestructive: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    isDestructive: false,
    onConfirm: () => {},
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<PlayerCategory>('pro');
  const [formTitle, setFormTitle] = useState('');
  const [formNote, setFormNote] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get('playerId');
    } catch {
      return null;
    }
  });
  const formRef = useRef<HTMLFormElement | null>(null);

  const selectedPlayer = useMemo(
    () => profiles.find((p) => p.id === selectedPlayerId) ?? null,
    [profiles, selectedPlayerId]
  );

  const reloadAll = useCallback(() => {
    setProfiles(loadPlayerProfiles());
    setRecords(loadKifuRecords());
    setPlayerPresets(loadPlayerMyFilters());
  }, []);

  const handleSelectMyFilter = (presetId: string) => {
    const preset = playerPresets.find((p) => p.id === presetId);
    if (!preset) return;
    setShowTrash(false);
    setCategoryTab(preset.filter.category);
    setQuery(preset.filter.query);
    setSortField(preset.filter.sortField);
    setSortDirection(preset.filter.sortDirection);
    setActiveMyFilterId(preset.id);
  };

  const handleSaveMyFilter = (name: string) => {
    const saved = savePlayerMyFilter({
      name,
      filter: {
        category: categoryTab,
        query,
        sortField,
        sortDirection,
      },
    });
    setPlayerPresets(loadPlayerMyFilters());
    setActiveMyFilterId(saved.id);
  };

  const handleDeleteMyFilter = (presetId: string) => {
    deleteMyFilter(presetId);
    setPlayerPresets(loadPlayerMyFilters());
    if (activeMyFilterId === presetId) {
      setActiveMyFilterId(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void initKifuRecordStorage().then(() => {
      if (!cancelled) {
        reloadAll();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reloadAll]);

  const gameCounts = useMemo(() => buildPlayerGameCounts(records), [records]);

  const [showTrash, setShowTrash] = useState(false);

  const trashCount = useMemo(
    () => profiles.filter((p) => Boolean(p.deletedAt)).length,
    [profiles]
  );

  const visibleProfiles = useMemo(
    () => profiles.filter((p) => (showTrash ? Boolean(p.deletedAt) : !p.deletedAt)),
    [profiles, showTrash]
  );

  const categoryCounts = useMemo(() => {
    const counts = { all: visibleProfiles.length, user: 0, ai: 0, pro: 0 };
    for (const p of visibleProfiles) {
      counts[p.category] += 1;
    }
    return counts;
  }, [visibleProfiles]);

  const displayedPlayers = useMemo(
    () =>
      filterAndSortPlayers(visibleProfiles, gameCounts, {
        category: categoryTab,
        query,
        sortField,
        sortDirection,
      }),
    [visibleProfiles, gameCounts, categoryTab, query, sortField, sortDirection]
  );

  const resetForm = () => {
    setEditingId(null);
    setFormName('');
    setFormCategory('pro');
    setFormTitle('');
    setFormNote('');
    setIsFormOpen(false);
  };

  const handleStartEdit = (prof: ShogiPlayerProfile) => {
    setEditingId(prof.id);
    setFormName(prof.name);
    setFormCategory(prof.category);
    setFormTitle(prof.title ?? '');
    setFormNote(prof.note ?? '');
    setIsFormOpen(true);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 0);
  };

  const handleSavePlayer = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = formName.trim();
    if (!trimmed) return;

    const existing = editingId
      ? profiles.find((p) => p.id === editingId)
      : undefined;
    const now = new Date().toISOString();
    const target: ShogiPlayerProfile = {
      id: editingId ?? `player-${Date.now()}`,
      name: trimmed,
      category: formCategory,
      title: formTitle.trim() || undefined,
      aliases: existing?.aliases,
      note: formNote.trim() || undefined,
      isOwner: existing?.isOwner,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    upsertPlayerProfile(target);
    if (editingId) {
      reclassifyRecordsForPlayer(target.id);
    }
    const uid = auth?.currentUser?.uid;
    if (uid) {
      const saved = loadPlayerProfiles().find((p) => p.id === target.id);
      if (saved) void uploadPlayerToFirestore(uid, saved);
    }
    reloadAll();
    resetForm();
  };

  const handleDeletePlayer = (prof: ShogiPlayerProfile) => {
    if (isProtectedPlayerProfile(prof.id)) return;
    if (!showTrash) {
      setConfirmDialog({
        isOpen: true,
        title: t('players_page.confirm_trash_title', 'ゴミ箱への移動確認'),
        message: t('players_page.confirm_trash_msg', {
          name: prof.name,
          defaultValue: `「${prof.name}」をゴミ箱に移動しますか？\n（ゴミ箱からいつでも元に戻せます）`,
        }),
        isDestructive: false,
        onConfirm: () => {
          upsertPlayerProfile({ ...prof, deletedAt: new Date().toISOString() });
          if (editingId === prof.id) {
            resetForm();
          }
          reloadAll();
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        },
      });
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: t('players_page.confirm_delete_title', 'プレイヤーの完全削除'),
      message: t('players_page.confirm_delete_msg', {
        name: prof.name,
        defaultValue: `「${prof.name}」を完全に削除しますか？\nこの操作は取り消せません。`,
      }),
      isDestructive: true,
      onConfirm: () => {
        deletePlayerProfile(prof.id);
        const uid = auth?.currentUser?.uid;
        if (uid) {
          void deletePlayerFromFirestore(uid, prof.id);
        }
        if (editingId === prof.id) {
          resetForm();
        }
        reloadAll();
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === displayedPlayers.length && displayedPlayers.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedPlayers.map((d) => d.profile.id)));
    }
  };

  const handleToggleSelectPlayer = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBatchTrash = () => {
    const targets = profiles.filter(
      (p) => selectedIds.has(p.id) && !isProtectedPlayerProfile(p.id)
    );
    if (targets.length === 0) return;

    setConfirmDialog({
      isOpen: true,
      title: t('players_page.confirm_trash_title', 'ゴミ箱への移動確認'),
      message: t('players_page.confirm_batch_trash_msg', {
        count: targets.length,
        defaultValue: `選択した ${targets.length} 件のプレイヤーをゴミ箱に移動しますか？\n（ゴミ箱からいつでも元に戻せます）`,
      }),
      isDestructive: false,
      onConfirm: () => {
        const now = new Date().toISOString();
        for (const p of targets) {
          upsertPlayerProfile({ ...p, deletedAt: now });
        }
        setSelectedIds(new Set());
        reloadAll();
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleBatchRestore = () => {
    const targets = profiles.filter(
      (p) => selectedIds.has(p.id) && Boolean(p.deletedAt)
    );
    for (const p of targets) {
      upsertPlayerProfile({ ...p, deletedAt: undefined });
    }
    setSelectedIds(new Set());
    reloadAll();
  };

  const handleBatchPermanentDelete = () => {
    const targets = profiles.filter(
      (p) => selectedIds.has(p.id) && !isProtectedPlayerProfile(p.id)
    );
    if (targets.length === 0) return;

    setConfirmDialog({
      isOpen: true,
      title: t('players_page.confirm_delete_title', 'プレイヤーの完全削除'),
      message: t('players_page.confirm_batch_delete_msg', {
        count: targets.length,
        defaultValue: `選択した ${targets.length} 件のプレイヤーを完全に削除しますか？\nこの操作は取り消せません。`,
      }),
      isDestructive: true,
      onConfirm: () => {
        const uid = auth?.currentUser?.uid;
        for (const p of targets) {
          deletePlayerProfile(p.id);
          if (uid) {
            void deletePlayerFromFirestore(uid, p.id);
          }
        }
        setSelectedIds(new Set());
        reloadAll();
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleRestorePlayer = (prof: ShogiPlayerProfile) => {
    upsertPlayerProfile({ ...prof, deletedAt: undefined });
    reloadAll();
  };

  const handleAutoFixAi = () => {
    const res = reclassifyAiPlayersAndSyncRecords();
    reloadAll();
    setNotice(
      t('players_page.ai_fix_done', {
        players: res.updatedPlayers,
        records: res.updatedRecords,
      })
    );
  };

  const getCategoryIcon = (cat: PlayerCategory) => {
    if (cat === 'user') return '👤';
    if (cat === 'ai') return '🤖';
    return '🏯';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900/95 backdrop-blur px-4 sm:px-6 py-3">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleGoBack}
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
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>🏯</span>
                <span>{t('players_page.title')}</span>
                <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-slate-700 font-mono">
                  {displayedPlayers.length} / {profiles.length}
                </span>
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block">
                {t('players_page.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDedupOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900 text-amber-300 text-xs font-semibold border border-amber-600/40 transition flex items-center gap-1"
              title={t('players_page.dedup_btn', '重複整理')}
            >
              <span>🔍</span>
              <span>{t('players_page.dedup_btn', '重複整理')}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowTrash((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                showTrash
                  ? 'bg-rose-900/60 border-rose-500/60 text-rose-200'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
              title={t('players_page.show_trash_title', 'ゴミ箱を表示')}
            >
              🗑️ {t('players_page.trash_btn', { count: trashCount, defaultValue: `ゴミ箱 (${trashCount})` })}
            </button>
            <button
              type="button"
              onClick={handleAutoFixAi}
              className="px-2.5 py-1.5 rounded-lg bg-sky-950/70 hover:bg-sky-900 text-sky-300 text-xs font-semibold border border-sky-500/40 transition"
            >
              🤖 {t('players_page.ai_fix_btn')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (isFormOpen && !editingId) {
                  resetForm();
                } else {
                  setEditingId(null);
                  setFormName('');
                  setFormCategory('pro');
                  setFormTitle('');
                  setFormNote('');
                  setIsFormOpen(true);
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold shadow transition"
            >
              ＋ {t('players_page.add_btn')}
            </button>
            <Link
              to="/studio"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold border border-slate-700 transition"
            >
              ✨ {t('nav.studio', '検討盤面')}
            </Link>
            <Link
              to="/tactics"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
            >
              📁 {t('studio.header.tactics_library', '定跡一覧')}
            </Link>
            <Link
              to="/library"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
            >
              📚 {t('library_page.nav_label')}
            </Link>
            <Link
              to="/guide/library"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition"
              title={t('guide.title')}
              aria-label={t('guide.title')}
            >
              ❓
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 space-y-4">
        {notice && (
          <div className="rounded-xl border border-sky-500/40 bg-sky-950/30 px-4 py-2.5 flex items-center justify-between text-xs text-sky-200">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-sky-400 hover:text-sky-200"
            >
              ✕
            </button>
          </div>
        )}

        {/* Add / Edit Player Form */}
        {isFormOpen && (
          <form
            ref={formRef}
            onSubmit={handleSavePlayer}
            className="rounded-xl border border-amber-500/40 bg-slate-900/90 p-4 space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-amber-300">
                {editingId
                  ? t('players_page.form_edit_title')
                  : t('players_page.form_add_title')}
              </h2>
              <button
                type="button"
                onClick={resetForm}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">
                  {t('players_page.field_name')}
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  {t('players_page.field_category')}
                </label>
                <select
                  value={formCategory}
                  onChange={(e) =>
                    setFormCategory(e.target.value as PlayerCategory)
                  }
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-slate-100"
                >
                  <option value="user">{t('players_page.cat_user')}</option>
                  <option value="ai">{t('players_page.cat_ai')}</option>
                  <option value="pro">{t('players_page.cat_pro')}</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  {t('players_page.field_title')}
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-slate-100"
                />
              </div>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">
                {t('players_page.field_note')}
              </label>
              <input
                type="text"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-slate-100"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
              >
                {t('common.save')}
              </button>
            </div>
          </form>
        )}

        {/* Category Tabs + Search & Sort */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', icon: '📚', label: t('library_page.tab_all'), count: categoryCounts.all },
                { id: 'user', icon: '👤', label: t('players_page.cat_user'), count: categoryCounts.user },
                { id: 'ai', icon: '🤖', label: t('players_page.cat_ai'), count: categoryCounts.ai },
                { id: 'pro', icon: '🏯', label: t('players_page.cat_pro'), count: categoryCounts.pro },
              ] as const
            ).map((tab) => {
              const active = categoryTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setCategoryTab(tab.id);
                    setActiveMyFilterId(null);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    active
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  <span className="text-[10px] font-mono opacity-80">
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveMyFilterId(null);
              }}
              placeholder={t('players_page.search_placeholder')}
              className="flex-1 min-w-[220px] rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <select
              value={sortField}
              onChange={(e) => {
                setSortField(e.target.value as PlayerSortField);
                setActiveMyFilterId(null);
              }}
              className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value="gameCount">{t('players_page.sort_games')}</option>
              <option value="name">{t('players_page.sort_name')}</option>
              <option value="title">{t('players_page.sort_title')}</option>
            </select>
            <button
              type="button"
              onClick={() => {
                setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
                setActiveMyFilterId(null);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-300 hover:text-white"
            >
              {sortDirection === 'desc' ? '▼' : '▲'}
            </button>
          </div>

          <MyFilterBar
            presets={playerPresets}
            activePresetId={activeMyFilterId}
            onSelectPreset={handleSelectMyFilter}
            onSavePreset={handleSaveMyFilter}
            onDeletePreset={handleDeleteMyFilter}
          />

          {/* Batch Selection Bar */}
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={
                    displayedPlayers.length > 0 &&
                    selectedIds.size === displayedPlayers.length
                  }
                  onChange={handleToggleSelectAll}
                  className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500"
                />
                <span className="font-semibold text-[11px]">
                  {selectedIds.size > 0
                    ? t('common.selected_count', { count: selectedIds.size, defaultValue: `${selectedIds.size}件選択中` })
                    : t('common.select_all', 'すべて選択')}
                </span>
              </label>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-slate-400 hover:text-slate-200 text-[11px] underline"
                >
                  {t('common.clear_selection', '選択解除')}
                </button>
              )}
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-1.5">
                {!showTrash ? (
                  <button
                    type="button"
                    onClick={handleBatchTrash}
                    className="px-2.5 py-1 rounded bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-700/60 font-semibold text-[11px] transition"
                  >
                    🗑️ {t('players_page.batch_trash_btn', { count: selectedIds.size })}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleBatchRestore}
                      className="px-2.5 py-1 rounded bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/60 font-semibold text-[11px] transition"
                    >
                      ♻️ {t('players_page.batch_restore_btn', { count: selectedIds.size })}
                    </button>
                    <button
                      type="button"
                      onClick={handleBatchPermanentDelete}
                      className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] transition shadow"
                    >
                      🗑️ {t('players_page.batch_delete_btn', { count: selectedIds.size })}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Player Cards Grid */}
        {displayedPlayers.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center text-sm text-slate-400">
            {t('players_page.empty')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayedPlayers.map(({ profile, gameCount }) => {
              const playerEval = aggregatePlayerEvaluation(profile.id, records);
              const evalBadge = playerEval
                ? getQualityLevelBadgeMeta(playerEval.overallLevel)
                : null;
              const isSelected = selectedIds.has(profile.id);
              return (
              <div
                key={profile.id}
                className={`rounded-xl border p-4 flex flex-col justify-between gap-2.5 transition ${
                  isSelected
                    ? 'border-amber-500/80 bg-slate-900 shadow-md ring-1 ring-amber-500/40'
                    : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectPlayer(profile.id)}
                        className="rounded bg-slate-950 border-slate-700 text-amber-500 focus:ring-amber-500 cursor-pointer"
                        title="選択"
                      />
                      <span className="text-base shrink-0">
                        {getCategoryIcon(profile.category)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedPlayerId(profile.id)}
                        className="font-bold text-sm text-slate-100 hover:text-amber-300 truncate text-left transition"
                      >
                        {profile.name}
                      </button>
                      {profile.title && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-semibold shrink-0">
                          {profile.title}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {evalBadge && (
                        <span
                          className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${evalBadge.badgeClass}`}
                        >
                          {t(evalBadge.labelKey, evalBadge.defaultLabel)}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-sky-300 border border-slate-700 text-[11px] font-mono">
                        {t('players_page.game_count', { count: gameCount })}
                      </span>
                    </div>
                  </div>

                  {profile.aliases && profile.aliases.length > 0 && (
                    <div className="text-[11px] text-slate-500 truncate">
                      {t('players_page.aliases_label')}:{' '}
                      {profile.aliases.join(', ')}
                    </div>
                  )}

                  {profile.tags && profile.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {profile.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-medium"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {profile.note && (
                    <p className="text-xs text-slate-300 line-clamp-2">
                      {profile.note}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedPlayerId(profile.id)}
                      className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-semibold transition"
                    >
                      📊 {t('players_page.detail_btn')}
                    </button>
                    <Link
                      to={`/library?playerId=${encodeURIComponent(profile.id)}`}
                      className="px-2 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-[11px] font-semibold transition"
                    >
                      📚 {t('players_page.games_link_btn')}
                    </Link>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(profile)}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] transition"
                    >
                      ✏️ {t('players_page.edit_btn')}
                    </button>
                    {showTrash && (
                      <button
                        type="button"
                        onClick={() => handleRestorePlayer(profile)}
                        className="px-2 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold transition"
                        title={t('players_page.restore_btn', '元に戻す')}
                      >
                        ♻️ {t('players_page.restore_btn', '元に戻す')}
                      </button>
                    )}
                    {!isProtectedPlayerProfile(profile.id) && (
                      <button
                        type="button"
                        onClick={() => handleDeletePlayer(profile)}
                        className="px-2 py-1 rounded text-rose-400 hover:bg-rose-950/40 text-[11px] transition"
                        title={showTrash ? '完全削除' : t('players_page.delete_btn')}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </main>

      <PlayerDetailModal
        player={selectedPlayer}
        records={records}
        profiles={profiles}
        onClose={() => setSelectedPlayerId(null)}
        onUpdated={reloadAll}
      />

      <PlayerDeduplicationModal
        isOpen={isDedupOpen}
        onClose={() => setIsDedupOpen(false)}
        onMerged={reloadAll}
        profiles={profiles}
      />

      <ConfirmModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        isDestructive={confirmDialog.isDestructive}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
