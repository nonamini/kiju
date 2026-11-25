/**
 * Modal to display saved tactics library, allowing users to:
 * 1. Browse and quick-load saved tactics / studies directly into Studio
 * 2. Save current studio board as a new named tactic (研究途中の退避) or overwrite
 * 3. Jump to Tactics Notes detail view (/tactics/:id) for full commentary & study
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TacticsNoteItem } from '../../types/tacticsNote';
import {
  loadTacticsItems,
  saveTacticsItem,
  deleteTacticsItem,
} from '../../utils/tacticsStorage';
import { cleanJkfFalsyPromotions } from '../../utils/usiFormatter';
import { auth } from '../../services/firebase';
import { useAuth } from '../../hooks/useAuth';
import {
  deleteTacticFromFirestore,
  syncTacticsWithCloud,
  uploadTacticToFirestore,
} from '../../services/firestoreKifuSync';
import { ConfirmModal } from '../common/ConfirmModal';

/** Helper to compute the effective move count of a tactic item */
function computeTacticMoveCount(item: TacticsNoteItem): number {
  if (item.jkfJson) {
    try {
      const parsed = JSON.parse(item.jkfJson);
      if (parsed && Array.isArray(parsed.moves)) {
        // First move is start position ({}), so plies = moves.length - 1
        return Math.max(0, parsed.moves.length - 1);
      }
    } catch {
      // ignore
    }
  }
  if (item.moves && item.moves.length > 0) {
    return item.moves.length;
  }
  return 0;
}

export interface StudioTacticsLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadTactic: (item: TacticsNoteItem) => void;
  currentBoardJkfJson?: string;
  currentTitle?: string;
  totalPlies?: number;
  evaluations?: Record<number, { scoreCp: number; isMate?: boolean }>;
  moveComments?: Array<{ ply: number; comment: string }>;
}

export const StudioTacticsLibraryModal: React.FC<StudioTacticsLibraryModalProps> = ({
  isOpen,
  onClose,
  onLoadTactic,
  currentBoardJkfJson,
  currentTitle = '',
  totalPlies = 0,
  evaluations,
  moveComments,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const activeUid = user?.uid ?? auth?.currentUser?.uid;
  const [tacticsList, setTacticsList] = useState<TacticsNoteItem[]>(() => loadTacticsItems());
  const [activeTab, setActiveTab] = useState<'browse' | 'save'>('browse');

  // Save new tactic state
  const [newTitle, setNewTitle] = useState(currentTitle || t('tactics.library_modal.default_title', '研究定跡'));
  const [newTag, setNewTag] = useState(t('tactics.library_modal.default_tag', '居飛車'));
  const [newCategory, setNewCategory] = useState<'castles' | 'attacks' | 'custom'>('custom');
  const [newSummary, setNewSummary] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTacticsList(loadTacticsItems());
    if (!activeUid) return;
    let cancelled = false;
    void syncTacticsWithCloud(activeUid, { mode: 'auto' })
      .then(({ pulled }) => {
        if (!cancelled && pulled > 0) {
          setTacticsList(loadTacticsItems());
        }
      })
      .catch(() => {
        // Best-effort sync
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeUid]);

  if (!isOpen) return null;

  const handleSaveAsNew = () => {
    if (!newTitle.trim()) {
      setErrorMsg(t('tactics.title_required', '定跡タイトルを入力してください'));
      return;
    }

    try {
      let cleanedJkfJson = currentBoardJkfJson;
      if (cleanedJkfJson) {
        const parsed = JSON.parse(cleanedJkfJson);
        if (parsed && parsed.moves) {
          cleanJkfFalsyPromotions(parsed.moves);
          cleanedJkfJson = JSON.stringify(parsed);
        }
      }

      const evalHistory = evaluations
        ? Object.entries(evaluations).map(([plyStr, val]) => ({
            ply: parseInt(plyStr, 10),
            scoreCp: val.scoreCp,
            isMate: val.isMate,
          }))
        : undefined;

      const newItem: TacticsNoteItem = {
        id: `tactic_${Date.now()}`,
        category: newCategory,
        title: newTitle.trim(),
        tag: newTag.trim() || t('tactics.library_modal.default_tag_fallback', '研究'),
        summary: newSummary.trim() || t('tactics.library_modal.summary_fallback', '{{title}}（全{{count}}手）', {
          title: newTitle.trim(),
          count: totalPlies,
        }),
        jkfJson: cleanedJkfJson,
        moveComments: moveComments && moveComments.length > 0 ? moveComments : undefined,
        evalHistory: evalHistory && evalHistory.length > 0 ? evalHistory : undefined,
        isCustom: true,
        updatedAt: new Date().toISOString(),
      };

      const updated = saveTacticsItem(newItem);
      setTacticsList(updated);
      const uid = auth?.currentUser?.uid;
      if (uid) {
        void uploadTacticToFirestore(uid, newItem);
      }
      setSuccessMsg(t('tactics.library_modal.save_success', '定跡ライブラリに保存しました！'));
      setTimeout(() => {
        setSuccessMsg(null);
        setActiveTab('browse');
      }, 800);
    } catch (err) {
      console.error('Failed to save tactic:', err);
      setErrorMsg(t('tactics.library_modal.save_failed', '保存に失敗しました'));
    }
  };

  const handleDelete = (id: string, titleStr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteTarget({ id, title: titleStr });
  };

  const handleConfirmDelete = () => {
    if (!confirmDeleteTarget) return;
    const { id } = confirmDeleteTarget;
    const updated = deleteTacticsItem(id);
    setTacticsList(updated);
    const uid = auth?.currentUser?.uid;
    if (uid) {
      void deleteTacticFromFirestore(uid, id);
    }
    setConfirmDeleteTarget(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2">
            <span className="text-lg">📚</span>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-amber-300">
                {t('tactics.library_modal.header_title', '定跡一覧・ライブラリ')}
              </h2>
              <p className="text-[11px] text-slate-400">
                {t('tactics.library_modal.header_subtitle', '研究途中の退避・多分岐ツリーの呼び出し・ノート連携')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap border-b border-slate-800 bg-slate-950/40 text-xs px-3 sm:px-4 pt-2 gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('browse')}
            className={`px-3 sm:px-4 py-2 font-bold rounded-t-lg transition border-t-2 whitespace-nowrap ${
              activeTab === 'browse'
                ? 'bg-slate-900 text-amber-300 border-amber-400 border-x border-slate-800'
                : 'text-slate-400 hover:text-slate-200 border-transparent'
            }`}
          >
            📋 {t('tactics.library_modal.tab_saved', '保存された定跡 ({{count}})', { count: tacticsList.length })}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('save')}
            className={`px-3 sm:px-4 py-2 font-bold rounded-t-lg transition border-t-2 whitespace-nowrap ${
              activeTab === 'save'
                ? 'bg-slate-900 text-amber-300 border-amber-400 border-x border-slate-800'
                : 'text-slate-400 hover:text-slate-200 border-transparent'
            }`}
          >
            💾 {t('tactics.library_modal.tab_save_as', '現在の盤面を保存')}
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 text-xs">
          {activeTab === 'browse' ? (
            <div className="space-y-2.5">
              {tacticsList.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <p className="text-sm">{t('tactics.library_modal.empty_title', '保存された定跡はまだありません。')}</p>
                  <p className="text-[11px] mt-1">{t('tactics.library_modal.empty_desc', '「名前をつけて保存」タブから現在の研究盤面を退避できます。')}</p>
                </div>
              ) : (
                tacticsList.map((item) => {
                  const moveCount = computeTacticMoveCount(item);
                  const isRecorded = moveCount > 0;

                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-slate-950/60 hover:bg-slate-850 border border-slate-800/80 hover:border-amber-500/50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-100 group-hover:text-amber-300 transition text-sm">
                            {item.title}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-300 font-semibold border border-slate-700">
                            {item.tag}
                          </span>
                          {/* Status Badge: Recorded (Move count) vs Empty (No moves) */}
                          {isRecorded ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1">
                              <span>✓</span>
                              <span>{t('tactics.library_modal.badge_recorded', '手順あり ({{count}}手)', { count: moveCount })}</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/60 text-[10px]">
                              {t('tactics.library_modal.badge_empty', '未入力 (0手)')}
                            </span>
                          )}
                          {item.branches && item.branches.length > 0 && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                              {t('tactics.library_modal.badge_branches', '+{{count}} 変化', { count: item.branches.length })}
                            </span>
                          )}
                        </div>
                        <p className="text-slate-400 text-[11px] truncate">
                          {item.summary || t('tactics.library_modal.no_commentary', '解説なし')}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onLoadTactic(item);
                            onClose();
                          }}
                          className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1 shadow ${
                            isRecorded
                              ? 'bg-amber-600 hover:bg-amber-500 text-slate-950'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                          }`}
                          title={isRecorded ? t('tactics.library_modal.load_resume_title', 'この定跡を検討盤面に読み込んで研究を再開') : t('tactics.library_modal.load_new_title', 'この定跡を検討盤面で新規入力・研究開始')}
                        >
                          <span>{isRecorded ? '▶' : '✏️'}</span>
                          <span>{isRecorded ? t('tactics.library_modal.btn_open_board', '盤面で開く') : t('tactics.library_modal.btn_input_board', '盤面で入力')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            navigate(`/tactics/${item.id}`);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                          title={t('tactics.library_modal.open_note_title', '定跡ノートで解説や要点を確認')}
                        >
                          📖 {t('tactics.library_modal.btn_note', 'ノート')}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(item.id, item.title, e)}
                          className="p-1.5 rounded-lg bg-slate-850 hover:bg-rose-950 text-slate-400 hover:text-rose-300 transition border border-slate-750"
                          title={t('tactics.library_modal.delete_title', '削除')}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="space-y-4 max-w-lg mx-auto py-2">
              <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-900/40 text-amber-300 text-[11px]">
                {t('tactics.library_modal.save_tab_hint', '💡 現在の盤面の全手順ツリー（変化・コメント・評価値）をそのまま退避・保存します。')}
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                  {errorMsg}
                </div>
              )}
              {successMsg && (
                <div className="p-2.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs">
                  {successMsg}
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  {t('tactics.library_modal.input_title_label', '定跡タイトル *')}
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => {
                    setNewTitle(e.target.value);
                    setErrorMsg(null);
                  }}
                  placeholder={t('tactics.library_modal.input_title_placeholder', '例: 右四間飛車 vs 四間飛車（急戦研究）')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">{t('tactics.library_modal.input_tag_label', 'タグ / 戦型')}</label>
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder={t('tactics.library_modal.input_tag_placeholder', '例: 居飛車、振り飛車')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">{t('tactics.library_modal.input_category_label', 'カテゴリ')}</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as 'castles' | 'attacks' | 'custom')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="custom">{t('tactics.library_modal.category_custom', 'マイ定跡研究')}</option>
                    <option value="attacks">{t('tactics.library_modal.category_attacks', '攻め筋・戦型')}</option>
                    <option value="castles">{t('tactics.library_modal.category_castles', '囲い・陣形')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">{t('tactics.library_modal.input_summary_label', '研究概要・メモ')}</label>
                <textarea
                  rows={3}
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                  placeholder={t('tactics.library_modal.input_summary_placeholder', 'この定跡・研究の狙いや急所などをメモ...')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('browse')}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  {t('common.cancel', 'キャンセル')}
                </button>
                <button
                  type="button"
                  onClick={handleSaveAsNew}
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow"
                >
                  {t('tactics.library_modal.btn_save', '定跡ライブラリに保存')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmDeleteTarget !== null}
        title={t('common.delete', '削除')}
        message={
          confirmDeleteTarget
            ? t('rulebook.delete_confirm', { title: confirmDeleteTarget.title })
            : ''
        }
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteTarget(null)}
      />
    </div>
  );
};
