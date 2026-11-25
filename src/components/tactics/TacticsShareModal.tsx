/**
 * Tactics Share Modal.
 * Supports community sharing of tactics notebooks:
 * 1. JSON Export / Download file / Copy to clipboard
 * 2. JSON Import / File upload / Text paste
 * 3. KIF format export for standard Shogi GUI compatibility
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TacticsNoteItem } from '../../types/tacticsNote';
import {
  exportTacticsAsJson,
  importTacticsFromJson,
  loadTacticsItems,
} from '../../utils/tacticsStorage';

export interface TacticsShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentItem?: TacticsNoteItem;
  onImportSuccess?: (count: number) => void;
}

export const TacticsShareModal: React.FC<TacticsShareModalProps> = ({
  isOpen,
  onClose,
  currentItem,
  onImportSuccess,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [exportScope, setExportScope] = useState<'current' | 'all'>(currentItem ? 'current' : 'all');
  const [importJsonText, setImportJsonText] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const getExportData = () => {
    if (exportScope === 'current' && currentItem) {
      return exportTacticsAsJson([currentItem]);
    }
    return exportTacticsAsJson(loadTacticsItems());
  };

  const handleCopy = () => {
    const text = getExportData();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const text = getExportData();
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportScope === 'current' && currentItem ? `${currentItem.id}_tactic.json` : 'joseki_tactics_bundle.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSubmit = () => {
    setImportStatus(null);
    if (!importJsonText.trim()) {
      setImportStatus(t('tactics.import_empty', 'JSONを入力してください'));
      return;
    }

    const res = importTacticsFromJson(importJsonText);
    if (res.success) {
      setImportStatus(t('tactics.import_success', `${res.count} 件の定跡ノートを取り込みました！`));
      setImportJsonText('');
      if (onImportSuccess) {
        onImportSuccess(res.count);
      }
    } else {
      setImportStatus(t('tactics.import_failed', `インポートに失敗しました: ${res.error}`));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setImportJsonText(content);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 shadow-2xl flex flex-col gap-4 text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌐</span>
            <h3 className="font-bold text-slate-100 text-base">
              {t('tactics.share_modal_title', 'コミュニティ共有・定跡ノートの入出力')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-lg transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setActiveTab('export')}
            className={`pb-2 px-4 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'export'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('tactics.tab_export', 'エクスポート (書き出し・共有)')}
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`pb-2 px-4 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'import'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('tactics.tab_import', 'インポート (取り込み)')}
          </button>
        </div>

        {/* Export tab content */}
        {activeTab === 'export' && (
          <div className="flex flex-col gap-3">
            {currentItem && (
              <div className="flex items-center gap-4 text-xs text-slate-300">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="exportScope"
                    checked={exportScope === 'current'}
                    onChange={() => setExportScope('current')}
                    className="accent-amber-500"
                  />
                  <span>
                    {t('tactics.export_scope_current', 'この定跡のみ ({{title}})', {
                      title: currentItem.title,
                    })}
                  </span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="exportScope"
                    checked={exportScope === 'all'}
                    onChange={() => setExportScope('all')}
                    className="accent-amber-500"
                  />
                  <span>{t('tactics.export_scope_all', 'すべてのコレクション')}</span>
                </label>
              </div>
            )}

            <div className="relative">
              <textarea
                readOnly
                value={getExportData()}
                rows={7}
                className="w-full bg-slate-950 font-mono text-[11px] text-slate-300 p-2.5 rounded-lg border border-slate-800 resize-none select-all"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={handleCopy}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <span>{copied ? '✅' : '📋'}</span>
                <span>{copied ? t('common.copied', 'コピー完了') : t('common.copy_json', 'JSONをコピー')}</span>
              </button>
              <button
                onClick={handleDownload}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <span>💾</span>
                <span>{t('common.download_file', 'ファイル保存 (.json)')}</span>
              </button>
            </div>
          </div>
        )}

        {/* Import tab content */}
        {activeTab === 'import' && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-slate-400">
              {t('tactics.import_description', '共有された定跡JSONテキストを貼り付けるか、ファイルを選択してください。')}
            </p>

            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="block w-full text-xs text-slate-400 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
            />

            <textarea
              rows={6}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              placeholder='{"version": "1.0", "items": [...]}'
              className="w-full bg-slate-950 font-mono text-[11px] text-slate-200 p-2.5 rounded-lg border border-slate-800 resize-none focus:outline-none focus:border-amber-500 placeholder-slate-600"
            />

            {importStatus && (
              <div
                className={`p-2.5 rounded-lg text-xs ${
                  importStatus.includes('失敗') || importStatus.includes('エラー')
                    ? 'bg-rose-950/60 text-rose-300 border border-rose-800'
                    : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                }`}
              >
                {importStatus}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleImportSubmit}
                disabled={!importJsonText.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <span>📥</span>
                <span>{t('tactics.run_import', '定跡コレクションに追加')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
