/**
 * Tactics Study Notebook Portal & Index Page (/tactics).
 * Dedicated page for multi-branch Shogi opening tree manager & tactics collection.
 * Features:
 * 1. Compact Tactics Cards matching user specification (title, tags, summary, pros, cons, move counts).
 * 2. 1-click navigation to detail view (/tactics/:id).
 * 3. Handoff to Studio to create or record moves.
 * 4. KIF Snippet import modal & Community share bundle modal.
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSmartBack } from '../hooks/useSmartBack';
import { TacticsCategory, TacticsNoteItem } from '../types/tacticsNote';
import {
  loadTacticsItems,
  saveTacticsItem,
  deleteTacticsItem,
  resetTacticsToDefault,
} from '../utils/tacticsStorage';
import { auth } from '../services/firebase';
import { useAuth } from '../hooks/useAuth';
import {
  deleteTacticFromFirestore,
  syncTacticsWithCloud,
  uploadTacticToFirestore,
} from '../services/firestoreKifuSync';
import { ConfirmModal } from '../components/common/ConfirmModal';
import { TacticsIndexCard } from '../components/tactics/TacticsIndexCard';
import { TacticsSnippetImportModal } from '../components/tactics/TacticsSnippetImportModal';
import { TacticsShareModal } from '../components/tactics/TacticsShareModal';
import {
  DEFAULT_TACTICS_HIERARCHY_GROUPS,
  groupTacticsByHierarchy,
} from '../utils/tacticsHierarchyAndLinks';

type TacticsTab = 'all' | 'castles' | 'attacks' | 'custom';

export const TacticsIndexPage: React.FC = () => {
  const navigate = useNavigate();
  const handleGoBack = useSmartBack('/');
  const { t } = useTranslation();
  const { user } = useAuth();
  const activeUid = user?.uid ?? auth?.currentUser?.uid;
  const [activeTab, setActiveTab] = useState<TacticsTab>('all');
  const [tacticsList, setTacticsList] = useState<TacticsNoteItem[]>(() => loadTacticsItems());
  const [isNewNoteModalOpen, setIsNewNoteModalOpen] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteCategory, setNewNoteCategory] = useState<TacticsCategory>('custom');
  const [newNoteHierarchyGroup, setNewNoteHierarchyGroup] = useState('');
  const [newNoteTag, setNewNoteTag] = useState('');
  const [newNoteSummary, setNewNoteSummary] = useState('');
  const [newNoteError, setNewNoteError] = useState<string | null>(null);
  const [isGroupedView, setIsGroupedView] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [isSnippetModalOpen, setIsSnippetModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<
    | { type: 'delete'; item: TacticsNoteItem }
    | { type: 'reset' }
    | null
  >(null);

  useEffect(() => {
    if (!activeUid) return;
    let cancelled = false;
    void syncTacticsWithCloud(activeUid, { mode: 'auto' })
      .then(({ pulled }) => {
        if (!cancelled && pulled > 0) {
          setTacticsList(loadTacticsItems());
        }
      })
      .catch(() => {
        // Best-effort initial sync
      });
    return () => {
      cancelled = true;
    };
  }, [activeUid]);

  const handleCloudSync = async () => {
    const uid = activeUid;
    if (!uid) {
      setTacticsList(loadTacticsItems());
      setSyncNotice(t('library_page.refreshed_local_only', 'ローカルの定跡ノートを再読み込みしました（Googleログインでクラウド同期が有効になります）'));
      setTimeout(() => setSyncNotice(null), 3500);
      return;
    }
    setIsCloudSyncing(true);
    setSyncNotice(t('studio.kifu_mgmt.cloud_syncing', 'Firestoreと同期中...'));
    try {
      const { pulled, pushed } = await syncTacticsWithCloud(uid, { mode: 'manual' });
      setTacticsList(loadTacticsItems());
      setSyncNotice(`クラウド同期完了 (受信: ${pulled}件, 送信: ${pushed}件)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncNotice(`同期に失敗しました: ${msg}`);
    } finally {
      setIsCloudSyncing(false);
      setTimeout(() => setSyncNotice(null), 3500);
    }
  };

  const filteredItems = useMemo(() => {
    if (activeTab === 'all') return tacticsList;
    if (activeTab === 'castles') return tacticsList.filter((it) => it.category === 'castles');
    if (activeTab === 'attacks') return tacticsList.filter((it) => it.category === 'attacks');
    if (activeTab === 'custom') return tacticsList.filter((it) => it.category === 'custom' || it.isCustom);
    return tacticsList;
  }, [tacticsList, activeTab]);

  const groupedHierarchy = useMemo(
    () => groupTacticsByHierarchy(filteredItems),
    [filteredItems]
  );

  const toggleGroupCollapsed = (groupName: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  };

  const handleDeleteItem = (item: TacticsNoteItem) => {
    setConfirmState({ type: 'delete', item });
  };

  const handleResetDefaults = () => {
    setConfirmState({ type: 'reset' });
  };

  const handleConfirmAction = () => {
    if (!confirmState) return;
    if (confirmState.type === 'delete') {
      const targetId = confirmState.item.id;
      const updated = deleteTacticsItem(targetId);
      setTacticsList(updated);
      const uid = auth?.currentUser?.uid;
      if (uid) {
        void deleteTacticFromFirestore(uid, targetId);
      }
      setConfirmState(null);
      return;
    }
    const reset = resetTacticsToDefault();
    setTacticsList(reset);
    setConfirmState(null);
  };

  const handleOpenStudioForNewTactic = () => {
    navigate('/studio');
  };

  const handleOpenNewNoteModal = () => {
    setNewNoteTitle('');
    setNewNoteCategory(
      activeTab === 'castles' || activeTab === 'attacks' ? activeTab : 'custom'
    );
    setNewNoteHierarchyGroup('');
    setNewNoteTag('');
    setNewNoteSummary('');
    setNewNoteError(null);
    setIsNewNoteModalOpen(true);
  };

  const handleCreateBlankNote = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = newNoteTitle.trim();
    if (!trimmedTitle) {
      setNewNoteError(t('tactics.title_required'));
      return;
    }
    const nowIso = new Date().toISOString();
    const newItem: TacticsNoteItem = {
      id: `tactic_${Date.now()}`,
      category: newNoteCategory,
      hierarchyGroup: newNoteHierarchyGroup.trim() || undefined,
      title: trimmedTitle,
      tag: newNoteTag.trim() || t('tactics.save_modal.default_custom_tag'),
      summary: newNoteSummary.trim(),
      freeBlocks: [],
      isCustom: true,
      updatedAt: nowIso,
    };
    const nextList = saveTacticsItem(newItem);
    setTacticsList(nextList);
    if (activeUid) {
      void uploadTacticToFirestore(activeUid, newItem);
    }
    setIsNewNoteModalOpen(false);
    navigate(`/tactics/${newItem.id}`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-12">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-950/85 backdrop-blur border-b border-slate-800 px-4 sm:px-6 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleGoBack}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition text-xs flex items-center gap-1"
              >
                ← <span>{t('common.back')}</span>
              </button>
              <Link
                to="/"
                title={t('common.home')}
                aria-label={t('common.home')}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition text-xs"
              >
                🏠
              </Link>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-amber-300">
                {t('tactics.title', '定跡・手筋研究ノート')}
              </h1>
              <p className="text-[11px] text-slate-400">
                多分岐ツリー・囲い・攻め筋のコレクションと手筋解説ノート
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <Link
              to="/studio"
              className="px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold border border-slate-700 transition flex items-center gap-1"
            >
              ✨ <span>{t('nav.studio', '検討盤面')}</span>
            </Link>
            <Link
              to="/library"
              className="px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center gap-1"
            >
              📚 <span>{t('library_page.nav_label', 'ライブラリ')}</span>
            </Link>
            <Link
              to="/players"
              className="px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center gap-1"
            >
              🏯 <span>{t('player_analysis.title', '棋士図鑑')}</span>
            </Link>
            <button
              type="button"
              onClick={() => void handleCloudSync()}
              disabled={isCloudSyncing}
              className="px-2 sm:px-2.5 py-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-600/40 text-emerald-300 text-xs font-semibold flex items-center gap-1 transition disabled:opacity-50"
              title={t('studio.kifu_mgmt.cloud_sync_title', 'クラウド同期')}
            >
              <span className={isCloudSyncing ? 'animate-spin' : ''}>🔄</span>
              <span className="hidden sm:inline">{t('studio.kifu_mgmt.cloud_sync_btn', 'クラウド同期')}</span>
            </button>
            <span className="h-4 w-px bg-slate-800 mx-0.5 hidden sm:inline" />
            <button
              type="button"
              onClick={handleOpenNewNoteModal}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold transition flex items-center gap-1 shadow-sm"
            >
              ＋ {t('tactics.btn_new_note')}
            </button>
            <button
              type="button"
              onClick={() => setIsSnippetModalOpen(true)}
              className="px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1 border border-slate-700"
            >
              📋 {t('tactics.btn_kif_snippet', 'KIF取込')}
            </button>
            <button
              type="button"
              onClick={() => setIsShareModalOpen(true)}
              className="px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1 border border-slate-700"
            >
              🌐 {t('tactics.share_btn', '共有')}
            </button>
            <button
              type="button"
              onClick={handleResetDefaults}
              className="px-2 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition"
              title={t('rulebook.btn_reset_samples', '初期化')}
            >
              ⚙️
            </button>
            <Link
              to="/guide/tactics"
              className="px-2 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
              title={t('guide.title')}
              aria-label={t('guide.title')}
            >
              ❓
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {syncNotice && (
          <div className="rounded-xl border border-sky-500/40 bg-sky-950/30 px-4 py-2.5 flex items-center justify-between gap-2 text-xs text-sky-200">
            <span>{syncNotice}</span>
            <button
              type="button"
              onClick={() => setSyncNotice(null)}
              className="text-sky-400 hover:text-sky-200"
            >
              ✕
            </button>
          </div>
        )}
        {/* Banner */}
        <div className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-slate-900/60 to-slate-900/40 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                💡 検討画面連携 & コレクション
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              定跡の作成・手順記録・棋譜切り出しはすべて「検討盤面（スタジオ）」で行えます。登録された定跡は一覧から選択して詳細ノート・1手ごとの解説をいつでも確認・編集できます。
            </p>
          </div>
        </div>

        {/* Tab Navigation & Hierarchy View Toggle */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-800 gap-2 pb-1 text-xs">
          <div className="flex gap-1 overflow-x-auto">
          {(
            [
              { id: 'all', label: 'すべて', count: tacticsList.length },
              { id: 'castles', label: '囲い', count: tacticsList.filter((i) => i.category === 'castles').length },
              { id: 'attacks', label: '攻め筋・戦型', count: tacticsList.filter((i) => i.category === 'attacks').length },
              { id: 'custom', label: 'マイ研究ノート', count: tacticsList.filter((i) => i.category === 'custom' || i.isCustom).length },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-t-lg font-semibold transition whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'bg-slate-900 text-amber-300 border-t-2 border-amber-400 border-x border-slate-800'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-400">
                {tab.count}
              </span>
            </button>
          ))}
          </div>

          <button
            type="button"
            onClick={() => setIsGroupedView((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition ${
              isGroupedView
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            {isGroupedView
              ? `📂 ${t('tactics.hierarchy_view_grouped')}`
              : `▦ ${t('tactics.hierarchy_view_flat')}`}
          </button>
        </div>

        {/* Cards Grid */}
        {filteredItems.length === 0 ? (
          <div className="p-8 rounded-xl bg-slate-900/50 border border-slate-800 text-center space-y-3">
            <p className="text-sm text-slate-400">
              {t('tactics.empty_tactics_notes', '該当する定跡ノートがありません。')}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleOpenNewNoteModal}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold transition inline-flex items-center gap-1"
              >
                ＋ {t('tactics.btn_new_note')}
              </button>
              <button
                type="button"
                onClick={handleOpenStudioForNewTactic}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition inline-flex items-center gap-1"
              >
                🎯 {t('tactics.open_studio_for_new', '検討盤面を開いて定跡を登録する')}
              </button>
            </div>
          </div>
        ) : isGroupedView ? (
          <div className="space-y-4">
            {groupedHierarchy.map(({ group, items: groupItems }) => {
              const isCollapsed = collapsedGroups.has(group);
              return (
                <section
                  key={group}
                  className="rounded-xl border border-slate-800/80 bg-slate-900/40 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleGroupCollapsed(group)}
                    className="w-full px-4 py-2.5 flex items-center justify-between bg-slate-900/90 hover:bg-slate-800/80 transition text-left"
                  >
                    <span className="flex items-center gap-2 text-xs sm:text-sm font-bold text-amber-200">
                      <span className="text-slate-400">{isCollapsed ? '▸' : '▾'}</span>
                      <span>📂</span>
                      <span>{group}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[11px] font-mono text-slate-300 border border-slate-700">
                      {groupItems.length}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {groupItems.map((item) => (
                        <TacticsIndexCard
                          key={item.id}
                          item={item}
                          onDelete={handleDeleteItem}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredItems.map((item) => (
              <TacticsIndexCard
                key={item.id}
                item={item}
                onDelete={handleDeleteItem}
              />
            ))}
          </div>
        )}
      </main>

      {/* New Blank Tactics Note Modal */}
      {isNewNoteModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleCreateBlankNote}
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 text-xs text-slate-100"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-amber-300 text-sm">
                📝 {t('tactics.new_note_modal_title')}
              </h3>
              <button
                type="button"
                onClick={() => setIsNewNoteModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {t('tactics.new_note_title_label')}
                </label>
                <input
                  type="text"
                  value={newNoteTitle}
                  onChange={(e) => {
                    setNewNoteTitle(e.target.value);
                    if (newNoteError) setNewNoteError(null);
                  }}
                  placeholder={t('tactics.new_note_title_placeholder')}
                  autoFocus
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {t('tactics.new_note_category_label')}
                  </label>
                  <select
                    value={newNoteCategory}
                    onChange={(e) =>
                      setNewNoteCategory(e.target.value as TacticsCategory)
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    <option value="custom">{t('tactics.category_custom')}</option>
                    <option value="castles">{t('tactics.category_castles')}</option>
                    <option value="attacks">{t('tactics.category_attacks')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {t('tactics.new_note_tag_label')}
                  </label>
                  <input
                    type="text"
                    value={newNoteTag}
                    onChange={(e) => setNewNoteTag(e.target.value)}
                    placeholder={t('tactics.new_note_tag_placeholder')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {t('tactics.hierarchy_group_label')}
                </label>
                <input
                  type="text"
                  list="tactics-hierarchy-datalist"
                  value={newNoteHierarchyGroup}
                  onChange={(e) => setNewNoteHierarchyGroup(e.target.value)}
                  placeholder={t('tactics.hierarchy_group_placeholder')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <datalist id="tactics-hierarchy-datalist">
                  {DEFAULT_TACTICS_HIERARCHY_GROUPS.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {t('tactics.new_note_summary_label')}
                </label>
                <textarea
                  rows={3}
                  value={newNoteSummary}
                  onChange={(e) => setNewNoteSummary(e.target.value)}
                  placeholder={t('tactics.new_note_summary_placeholder')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                />
              </div>

              {newNoteError && (
                <p className="text-rose-400 font-semibold">{newNoteError}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsNewNoteModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold shadow"
              >
                {t('tactics.new_note_create_btn')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Snippet / Direct KIF Input Modal */}
      <TacticsSnippetImportModal
        isOpen={isSnippetModalOpen}
        onClose={() => setIsSnippetModalOpen(false)}
        onSuccess={(created) => {
          setTacticsList(loadTacticsItems());
          const uid = auth?.currentUser?.uid;
          if (uid) {
            void uploadTacticToFirestore(uid, created);
          }
          navigate(`/tactics/${created.id}`);
        }}
      />

      {/* Community Share & Import/Export Modal */}
      <TacticsShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        onImportSuccess={() => {
          setTacticsList(loadTacticsItems());
          const uid = auth?.currentUser?.uid;
          if (uid) {
            void syncTacticsWithCloud(uid, { mode: 'auto' });
          }
        }}
      />

      <ConfirmModal
        isOpen={confirmState !== null}
        title={
          confirmState?.type === 'delete'
            ? t('common.delete', '削除')
            : t('rulebook.btn_reset_samples', '初期化')
        }
        message={
          confirmState?.type === 'delete'
            ? t('rulebook.delete_confirm', { title: confirmState.item.title })
            : t('rulebook.reset_confirm', 'すべての定跡ノートを初期状態に戻しますか？')
        }
        isDestructive={true}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
};

export default TacticsIndexPage;
