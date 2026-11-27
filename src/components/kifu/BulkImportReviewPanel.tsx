/**
 * Review panel for bulk kifu imports (#51/#52 follow-up).
 * After files are decoded and parsed, each game is listed so the user can
 * pick player profile links, edit tags, and choose which games to analyze
 * before anything is persisted.
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { SavedStudioGame, TagCategoryGroup } from '../../utils/studioKifuStorage';
import { ShogiPlayerProfile } from '../../types/player';
import { CategorizedTagCombobox } from './CategorizedTagCombobox';

export interface BulkReviewItem {
  key: string;
  fileName: string;
  /** Unsaved draft game built from the parsed kifu. */
  game: SavedStudioGame;
  /** Whether this game will be imported on confirm. */
  selected: boolean;
  /** Whether batch analysis runs for this game after import. */
  analyze: boolean;
  /** Linked player profile id; null = auto-register by header name. */
  sentePlayerId: string | null;
  gotePlayerId: string | null;
  tags: string[];
  tagsOpen: boolean;
  /** Extracted relative virtual folder path when imported from a directory (Issue #9). */
  folderPath?: string;
}

export type BulkAnalysisTarget = 'local' | 'cloud';

export interface BulkImportReviewPanelProps {
  items: BulkReviewItem[];
  playerProfiles: ShogiPlayerProfile[];
  tagGroups: TagCategoryGroup[];
  confirmLabel: string;
  analysisTarget: BulkAnalysisTarget;
  isCloudEnabled: boolean;
  isSubmitting?: boolean;
  preserveFolderHierarchy?: boolean;
  onPreserveFolderHierarchyChange?: (value: boolean) => void;
  autoInferFromFolder?: boolean;
  onAutoInferFromFolderChange?: (value: boolean) => void;
  onAnalysisTargetChange: (target: BulkAnalysisTarget) => void;
  onChange: (items: BulkReviewItem[]) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const selectClass =
  'bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-[11px] text-slate-200 max-w-[140px]';

export const BulkImportReviewPanel: React.FC<BulkImportReviewPanelProps> = ({
  items,
  playerProfiles,
  tagGroups,
  confirmLabel,
  analysisTarget,
  isCloudEnabled,
  isSubmitting = false,
  preserveFolderHierarchy = true,
  onPreserveFolderHierarchyChange,
  autoInferFromFolder = true,
  onAutoInferFromFolderChange,
  onAnalysisTargetChange,
  onChange,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const selectedCount = items.filter((i) => i.selected).length;
  const analyzeCount = items.filter((i) => i.selected && i.analyze).length;
  const hasAnyFolderPath = items.some((i) => Boolean(i.folderPath));

  const update = (key: string, patch: Partial<BulkReviewItem>) => {
    onChange(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  };

  const setAll = (patch: Partial<BulkReviewItem>) => {
    onChange(items.map((i) => ({ ...i, ...patch })));
  };

  const playerOptions = (current: string | null) => (
    <>
      <option value="">{t('kifu.bulk_player_auto_option', '自動（名前で登録/解決）')}</option>
      {playerProfiles.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
          {p.category === 'pro' ? '（プロ）' : p.category === 'ai' ? '（AI）' : ''}
        </option>
      ))}
      {/* Keep a dangling id selectable so nothing is silently reset */}
      {current && !playerProfiles.some((p) => p.id === current) && (
        <option value={current}>{current}</option>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100">
              📋 {t('kifu.bulk_preview_heading', { count: items.length, defaultValue: `取込プレビュー — ${items.length} 件` })}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              取込 {selectedCount} 件 / 解析対象 {analyzeCount} 件
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <button type="button" onClick={() => setAll({ selected: true })} className="hover:text-slate-200">
              全選択
            </button>
            <span>|</span>
            <button type="button" onClick={() => setAll({ selected: false })} className="hover:text-slate-200">
              全解除
            </button>
            <span>|</span>
            <button type="button" onClick={() => setAll({ analyze: true })} className="hover:text-slate-200">
              全て解析
            </button>
            <span>|</span>
            <button type="button" onClick={() => setAll({ analyze: false })} className="hover:text-slate-200">
              解析なし
            </button>
          </div>
        </div>

        {hasAnyFolderPath && (
          <div className="px-4 py-2 border-b border-slate-800 bg-slate-950/50 flex flex-wrap items-center gap-4 text-[11px] text-slate-300">
            {onPreserveFolderHierarchyChange && (
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preserveFolderHierarchy}
                  onChange={(e) => onPreserveFolderHierarchyChange(e.target.checked)}
                  className="accent-amber-500"
                />
                <span>📁 {t('kifu.bulk_folder_preserve')}</span>
              </label>
            )}
            {onAutoInferFromFolderChange && (
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoInferFromFolder}
                  onChange={(e) => onAutoInferFromFolderChange(e.target.checked)}
                  className="accent-sky-500"
                />
                <span>🏷️ {t('kifu.bulk_folder_infer')}</span>
              </label>
            )}
          </div>
        )}

        <div className="overflow-y-auto flex-1 divide-y divide-slate-800/60">
          {items.map((item) => (
            <div key={item.key} className="px-4 py-2.5">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={(e) => update(item.key, { selected: e.target.checked })}
                  className="accent-emerald-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-200 truncate" title={item.game.title}>
                    {item.game.title}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate flex items-center gap-2" title={item.fileName}>
                    <span>{item.fileName} · {item.game.totalPlies}手</span>
                    {item.folderPath && (
                      <span className="text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded px-1 py-0.2 truncate">
                        📁 {item.folderPath}
                      </span>
                    )}
                  </div>
                </div>
                <label className="flex items-center gap-1 text-[10px] text-slate-400 shrink-0">
                  <input
                    type="checkbox"
                    checked={item.analyze}
                    disabled={!item.selected}
                    onChange={(e) => update(item.key, { analyze: e.target.checked })}
                    className="accent-sky-500"
                  />
                  解析
                </label>
                <button
                  type="button"
                  onClick={() => update(item.key, { tagsOpen: !item.tagsOpen })}
                  className={`px-2 py-1 text-[10px] rounded border shrink-0 ${
                    item.tagsOpen
                      ? 'border-amber-600 text-amber-300 bg-amber-950/40'
                      : 'border-slate-700 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  🏷 {item.tags.length > 0 ? `${item.tags.length}件` : 'タグ'}
                </button>
              </div>

              <div className="flex items-center gap-2 mt-2 pl-6">
                <span className="text-[10px] text-slate-500 w-8">{t('srs.side_sente', '先手')}</span>
                <select
                  className={selectClass}
                  value={item.sentePlayerId ?? ''}
                  onChange={(e) => update(item.key, { sentePlayerId: e.target.value || null })}
                >
                  {playerOptions(item.sentePlayerId)}
                </select>
                <span className="text-[10px] text-slate-500 w-8">{t('srs.side_gote', '後手')}</span>
                <select
                  className={selectClass}
                  value={item.gotePlayerId ?? ''}
                  onChange={(e) => update(item.key, { gotePlayerId: e.target.value || null })}
                >
                  {playerOptions(item.gotePlayerId)}
                </select>
                {item.tags.length > 0 && !item.tagsOpen && (
                  <span className="text-[10px] text-amber-400/80 truncate">
                    {item.tags.map((t) => `#${t}`).join(' ')}
                  </span>
                )}
              </div>

              {item.tagsOpen && (
                <div className="mt-2 pl-6">
                  <CategorizedTagCombobox
                    tagGroups={tagGroups}
                    selectedTags={item.tags}
                    onChange={(tags) => update(item.key, { tags })}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-slate-400">{t('kifu.analysis_target_label', '解析先:')}</span>
            <label
              className={`flex items-center gap-1 px-2 py-1 rounded border cursor-pointer ${
                analysisTarget === 'local'
                  ? 'border-sky-500/70 bg-sky-950/40 text-sky-300'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <input
                type="radio"
                name="bulk-analysis-target"
                checked={analysisTarget === 'local'}
                disabled={isSubmitting}
                onChange={() => onAnalysisTargetChange('local')}
                className="accent-sky-500"
              />
              <span>{t('kifu.analysis_target_local', 'ローカル解析 (Wasm)')}</span>
            </label>
            <label
              className={`flex items-center gap-1 px-2 py-1 rounded border ${
                !isCloudEnabled
                  ? 'border-slate-800 text-slate-600 cursor-not-allowed'
                  : analysisTarget === 'cloud'
                    ? 'border-indigo-500/70 bg-indigo-950/40 text-indigo-300 cursor-pointer'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600 cursor-pointer'
              }`}
              title={isCloudEnabled ? 'GitHub Actions ワーカーへ解析キューを送信します' : 'クラウド解析を利用するにはログインが必要です'}
            >
              <input
                type="radio"
                name="bulk-analysis-target"
                checked={analysisTarget === 'cloud'}
                disabled={!isCloudEnabled || isSubmitting}
                onChange={() => onAnalysisTargetChange('cloud')}
                className="accent-indigo-500"
              />
              <span>
                ☁️ {t('kifu.analysis_target_cloud', 'クラウド解析')}
                {!isCloudEnabled ? t('kifu.cloud_login_required_badge', '（要ログイン）') : ''}
              </span>
            </label>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={selectedCount === 0 || isSubmitting}
              className="px-4 py-1.5 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white"
            >
              {isSubmitting
                ? '処理中...'
                : `${confirmLabel}（${selectedCount}件${
                    analyzeCount > 0
                      ? analysisTarget === 'cloud'
                        ? ` / ☁️キュー${analyzeCount}件`
                        : ` / 解析${analyzeCount}件`
                      : ''
                  }）`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
