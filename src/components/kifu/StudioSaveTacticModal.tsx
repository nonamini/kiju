/**
 * Studio Modal to save current game moves or a selected ply range into Tactics Notes.
 * Supports:
 *  - 1-to-current ply or custom start/end ply slicing
 *  - Creating a brand new tactic OR appending a branch to an existing tactic
 *  - Linking source game information (pro/community kifu title, ply range, match date)
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TacticsCategory, TacticsNoteItem } from '../../types/tacticsNote';
import { loadTacticsItems, saveTacticsItem } from '../../utils/tacticsStorage';

export interface StudioSaveTacticModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMoves: string[]; // USI move list from Studio
  currentPly: number;
  initialSfen?: string;
  defaultTitle?: string;
  sourceGameInfo?: {
    gameId?: string;
    gameTitle?: string;
    tournament?: string;
    matchDate?: string;
  };
  rangeStartPly?: number;
  rangeEndPly?: number;
  currentEvaluations?: Record<number, { scoreCp: number; isMate?: boolean }>;
  jkfJson?: string;
  moveComments?: Array<{ ply: number; comment: string }>;
  onSuccess?: (created: TacticsNoteItem) => void;
}

export const StudioSaveTacticModal: React.FC<StudioSaveTacticModalProps> = ({
  isOpen,
  onClose,
  currentMoves,
  currentPly,
  initialSfen,
  defaultTitle = '',
  sourceGameInfo,
  rangeStartPly,
  rangeEndPly,
  currentEvaluations,
  jkfJson,
  moveComments,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [saveMode, setSaveMode] = useState<'new' | 'existing'>('new');
  const [existingTactics, setExistingTactics] = useState<TacticsNoteItem[]>([]);
  const [selectedTacticId, setSelectedTacticId] = useState<string>('');

  const [title, setTitle] = useState(defaultTitle || t('tactics.save_modal.default_title', 'スタジオ研究定跡'));
  const [tag, setTag] = useState(t('tactics.save_modal.default_tag', '居飛車'));
  const [category, setCategory] = useState<TacticsCategory>('custom');
  const [summary, setSummary] = useState('');
  const [pros, setPros] = useState('');
  const [cons, setCons] = useState('');
  
  const totalMoves = currentMoves.length;
  // Default start/end plies: if range passed use it, otherwise 1 to currentPly (or totalMoves if currentPly is 0)
  const [startPly, setStartPly] = useState(1);
  const [endPly, setEndPly] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync state when opened
  useEffect(() => {
    if (isOpen) {
      const items = loadTacticsItems();
      setExistingTactics(items);
      if (items.length > 0 && items[0]) {
        setSelectedTacticId(items[0].id);
      }
      const initialStart = rangeStartPly ?? 1;
      const initialEnd = rangeEndPly ?? Math.max(1, currentPly || totalMoves || 1);
      setStartPly(initialStart);
      setEndPly(initialEnd);
      setTitle(defaultTitle || t('tactics.save_modal.default_title', 'スタジオ研究定跡'));
      setErrorMsg(null);
    }
  }, [isOpen, rangeStartPly, rangeEndPly, currentPly, totalMoves, defaultTitle, t]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const s = Math.max(1, Math.min(startPly, totalMoves || 1));
    const ePly = Math.max(s, Math.min(endPly, totalMoves || 1));
    const slicedMoves = currentMoves.slice(s - 1, ePly);

    // Extract sliced evaluation scores if available
    const slicedEvalHistory: TacticsNoteItem['evalHistory'] = [];
    if (currentEvaluations) {
      for (let ply = s; ply <= ePly; ply++) {
        const ev = currentEvaluations[ply];
        if (ev) {
          slicedEvalHistory.push({
            ply: ply - s + 1, // Normalized to 1..N of sliced moves
            scoreCp: ev.scoreCp,
            isMate: ev.isMate,
          });
        }
      }
    }

    const sourceMeta = sourceGameInfo
      ? {
          gameId: sourceGameInfo.gameId,
          gameTitle: sourceGameInfo.gameTitle,
          tournament: sourceGameInfo.tournament,
          matchDate: sourceGameInfo.matchDate,
          startPly: s,
          endPly: ePly,
        }
      : undefined;

    if (saveMode === 'new') {
      if (!title.trim()) {
        setErrorMsg(t('tactics.title_required', 'タイトルを入力してください'));
        return;
      }

      const newItem: TacticsNoteItem = {
        id: `studio_tactic_${Date.now()}`,
        category,
        title: title.trim(),
        tag: tag.trim() || t('tactics.save_modal.default_custom_tag', 'カスタム'),
        summary: summary.trim() || t('tactics.save_modal.summary_sliced_pattern', '{{title}} ({{start}}手目〜{{end}}手目の切り出し手順)', {
          title: title.trim(),
          start: s,
          end: ePly,
        }),
        pros: pros.trim() || undefined,
        cons: cons.trim() || undefined,
        sfen: initialSfen,
        moves: slicedMoves,
        jkfJson: (s === 1 && ePly >= totalMoves) ? jkfJson : undefined,
        moveComments: moveComments && moveComments.length > 0 ? moveComments : undefined,
        evalHistory: slicedEvalHistory.length > 0 ? slicedEvalHistory : undefined,
        sourceGame: sourceMeta,
        isCustom: true,
        updatedAt: new Date().toISOString(),
      };

      saveTacticsItem(newItem);
      if (onSuccess) {
        onSuccess(newItem);
      }
      onClose();
    } else {
      // Append / Branch to existing tactic
      const target = existingTactics.find((tactic) => tactic.id === selectedTacticId);
      if (!target) {
        setErrorMsg(t('tactics.save_modal.target_required', '追加先の定跡を選択してください'));
        return;
      }

      const branchName = title.trim() || t('tactics.save_modal.branch_default_title', '変化 ({{start}}〜{{end}}手目)', {
        start: s,
        end: ePly,
      });
      const newBranch = {
        id: `branch_${Date.now()}`,
        name: branchName,
        comment: summary.trim() || undefined,
        moves: slicedMoves,
        sfen: initialSfen,
        sourceGame: sourceMeta,
      };

      const existingBranches = target.branches ? [...target.branches] : [];
      existingBranches.push(newBranch);

      const updatedItem: TacticsNoteItem = {
        ...target,
        branches: existingBranches,
        isCustom: true,
        updatedAt: new Date().toISOString(),
      };

      saveTacticsItem(updatedItem);
      if (onSuccess) {
        onSuccess(updatedItem);
      }
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 shadow-2xl flex flex-col gap-4 text-slate-100 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">📚</span>
            <div>
              <h3 className="font-bold text-slate-100 text-sm sm:text-base">
                {t('tactics.save_modal.header_title', '定跡コレクションへ保存 / 切り出し')}
              </h3>
              {sourceGameInfo?.gameTitle && (
                <p className="text-[11px] text-amber-400 font-medium truncate max-w-xs sm:max-w-md">
                  {t('tactics.save_modal.source_kifu_prefix', '元棋譜: ')}{sourceGameInfo.gameTitle}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded-lg text-xs bg-rose-950/60 text-rose-300 border border-rose-800">
            {errorMsg}
          </div>
        )}

        {/* Mode Selector: New Tactic vs Append to Existing */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-bold">
          <button
            type="button"
            onClick={() => setSaveMode('new')}
            className={`py-2 rounded-lg transition ${
              saveMode === 'new'
                ? 'bg-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ✨ {t('tactics.save_modal.tab_new', '新規定跡として保存')}
          </button>
          <button
            type="button"
            onClick={() => setSaveMode('existing')}
            className={`py-2 rounded-lg transition ${
              saveMode === 'existing'
                ? 'bg-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🔀 {t('tactics.save_modal.tab_branch', '既存定跡の分岐として追加')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Slicing Range */}
          <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-amber-300 flex items-center gap-1">
                <span>✂️</span>
                <span>{t('tactics.save_modal.range_label', '切り出す手数範囲 (全 {{count}} 手)', { count: totalMoves })}</span>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setStartPly(1);
                    setEndPly(Math.max(1, currentPly || totalMoves));
                  }}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-amber-300 font-bold"
                  title={t('tactics.save_modal.quick_range_current_title', '1手目から現在の局面まで')}
                >
                  {t('tactics.save_modal.quick_range_current_btn', '1〜現局面 ({{ply}}手)', { ply: currentPly })}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStartPly(1);
                    setEndPly(totalMoves || 1);
                  }}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 font-bold"
                  title={t('tactics.save_modal.quick_range_all_title', '最初から最後まで全手順')}
                >
                  {t('tactics.save_modal.quick_range_all_btn', '全手順')}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="number"
                min={1}
                max={totalMoves || 1}
                value={startPly}
                onChange={(e) => setStartPly(parseInt(e.target.value, 10) || 1)}
                className="w-16 bg-slate-900 border border-slate-700 rounded p-1.5 text-center text-xs text-slate-100"
              />
              <span>{t('tactics.save_modal.ply_from', '手目 〜')}</span>
              <input
                type="number"
                min={startPly}
                max={totalMoves || 1}
                value={endPly}
                onChange={(e) => setEndPly(parseInt(e.target.value, 10) || startPly)}
                className="w-16 bg-slate-900 border border-slate-700 rounded p-1.5 text-center text-xs text-slate-100"
              />
              <span>{t('tactics.save_modal.ply_to', '手目まで')}</span>
              <span className="text-[11px] text-slate-400 ml-auto">
                {t('tactics.save_modal.ply_total', '(計 {{count}} 手)', { count: Math.max(0, endPly - startPly + 1) })}
              </span>
            </div>
          </div>

          {saveMode === 'existing' ? (
            /* Select Existing Tactic Target */
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                {t('tactics.save_modal.target_note_label', '追加先の定跡ノート *')}
              </label>
              <select
                value={selectedTacticId}
                onChange={(e) => setSelectedTacticId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              >
                {existingTactics.map((tactic) => (
                  <option key={tactic.id} value={tactic.id}>
                    [{tactic.tag}] {tactic.title} ({tactic.moves?.length ?? 0}手)
                  </option>
                ))}
              </select>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  {t('tactics.save_modal.branch_title_label', '分岐名・変化タイトル')}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('tactics.save_modal.branch_default_title', '変化 ({{start}}〜{{end}}手目)', { start: startPly, end: endPly })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  {t('tactics.save_modal.branch_comment_label', '分岐・変化の解説コメント')}
                </label>
                <textarea
                  rows={2}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder={t('tactics.save_modal.branch_comment_placeholder', 'この分岐の狙いや理由をメモ...')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>
            </div>
          ) : (
            /* New Tactic Form */
            <>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  {t('tactics.save_modal.tactic_title_label', '定跡タイトル *')}
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    {t('tactics.save_modal.tag_label', 'タグ')}
                  </label>
                  <input
                    type="text"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    {t('tactics.save_modal.category_label', '分類')}
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as TacticsCategory)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="castles">{t('tactics.category_castles', '囲い')}</option>
                    <option value="attacks">{t('tactics.category_attacks', '攻め筋・定跡')}</option>
                    <option value="custom">{t('tactics.category_custom', 'カスタムノート')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  {t('tactics.save_modal.summary_label', '概要・狙い')}
                </label>
                <textarea
                  rows={2}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder={t('tactics.save_modal.summary_placeholder', '定跡の狙いや特徴を入力...')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-emerald-400 block mb-1">
                    {t('tactics.pros', '長所')}
                  </label>
                  <input
                    type="text"
                    value={pros}
                    onChange={(e) => setPros(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-rose-400 block mb-1">
                    {t('tactics.cons', '弱点')}
                  </label>
                  <input
                    type="text"
                    value={cons}
                    onChange={(e) => setCons(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100"
                  />
                </div>
              </div>
            </>
          )}

          {/* Source game provenance footer indicator */}
          {sourceGameInfo?.gameTitle && (
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300/90 flex items-center gap-1.5">
              <span>🔗</span>
              <span>
                {t('tactics.save_modal.provenance_info', '棋譜情報連携: {{title}} ({{start}}手目〜{{end}}手目を紐付け保存)', {
                  title: sourceGameInfo.gameTitle,
                  start: startPly,
                  end: endPly,
                })}
              </span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
            >
              {t('common.cancel', 'キャンセル')}
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors"
            >
              {saveMode === 'new'
                ? t('tactics.save_modal.btn_save_new', '保存する')
                : t('tactics.save_modal.btn_save_branch', '分岐として追加保存')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
