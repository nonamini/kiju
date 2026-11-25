/**
 * Modal to create a new Tactics Note from:
 * 1. KIF Text Snippet Paste (e.g. "1 ７六歩(77) 2 ８四歩(83)...")
 * 2. Direct Move Input / Title & summary
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TacticsCategory, TacticsNoteItem } from '../../types/tacticsNote';
import { parseKifSnippet } from '../../utils/kifSnippetParser';
import { saveTacticsItem } from '../../utils/tacticsStorage';

export interface TacticsSnippetImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (created: TacticsNoteItem) => void;
}

export const TacticsSnippetImportModal: React.FC<TacticsSnippetImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [tag, setTag] = useState('居飛車');
  const [category, setCategory] = useState<TacticsCategory>('custom');
  const [summary, setSummary] = useState('');
  const [pros, setPros] = useState('');
  const [cons, setCons] = useState('');
  const [kifSnippet, setKifSnippet] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!title.trim()) {
      setErrorMsg(t('tactics.title_required', 'タイトルを入力してください'));
      return;
    }

    let parsedMoves: string[] = [];
    let moveComments: Array<{ ply: number; comment: string }> = [];

    if (kifSnippet.trim()) {
      const parsed = parseKifSnippet(kifSnippet);
      if (parsed.error) {
        setErrorMsg(t('tactics.kif_parse_failed', `KIF解析エラー: ${parsed.error}`));
        return;
      }
      parsedMoves = parsed.usiMoves;
      moveComments = parsed.moveComments;
    }

    const newItem: TacticsNoteItem = {
      id: `custom_${Date.now()}`,
      category,
      title: title.trim(),
      tag: tag.trim() || 'カスタム',
      summary: summary.trim() || title.trim(),
      pros: pros.trim() || undefined,
      cons: cons.trim() || undefined,
      moves: parsedMoves.length > 0 ? parsedMoves : undefined,
      moveComments: moveComments.length > 0 ? moveComments : undefined,
      isCustom: true,
      updatedAt: new Date().toISOString(),
    };

    saveTacticsItem(newItem);
    onSuccess(newItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 shadow-2xl flex flex-col gap-4 text-slate-100 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">📋</span>
            <h3 className="font-bold text-slate-100 text-base">
              {t('tactics.kif_import_modal_title', '定跡ノート作成 (KIFテキスト反映 / 直接入力)')}
            </h3>
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {t('tactics.title_label', '定跡・手筋名 *')}
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('tactics.title_placeholder', '例: 右四間飛車 棒銀急戦')}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('tactics.tag_label', '戦型・タグ')}
              </label>
              <input
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder={t('tactics.tag_placeholder', '居飛車, 振り飛車, 急戦...')}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                {t('tactics.category_label', '分類')}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TacticsCategory)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              >
                <option value="castles">{t('tactics.category_castles', '囲い (Castles)')}</option>
                <option value="attacks">{t('tactics.category_attacks', '攻め筋・定跡 (Attacks)')}</option>
                <option value="custom">{t('tactics.category_custom', 'カスタムノート')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {t('tactics.kif_snippet_label', 'KIF棋譜テキスト (一部切り出しも対応)')}
            </label>
            <textarea
              rows={5}
              value={kifSnippet}
              onChange={(e) => setKifSnippet(e.target.value)}
              placeholder={`1 ７六歩(77) (00:00/00:00:00)\n2 ８四歩(83) (00:00/00:00:00)\n3 ４八銀(39) (00:00/00:00:00)...`}
              className="w-full bg-slate-950 font-mono text-[11px] text-slate-200 border border-slate-700 rounded-lg p-2.5 focus:outline-none focus:border-amber-500 placeholder-slate-600 resize-none"
            />
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              {t(
                'tactics.kif_comment_hint',
                '※ 行ごとのコメント（* コメント）も手筋解説として自動反映されます。'
              )}
            </span>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {t('tactics.summary_label', '全体解説・概要')}
            </label>
            <textarea
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={t('tactics.summary_placeholder', 'この定跡の狙いや方針などの全体解説...')}
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
                placeholder={t('tactics.pros_placeholder', '例: 上部からの攻めに強い')}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
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
                placeholder={t('tactics.cons_placeholder', '例: 横からの攻めに注意')}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

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
              {t('common.save', '定跡ノートに登録')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
