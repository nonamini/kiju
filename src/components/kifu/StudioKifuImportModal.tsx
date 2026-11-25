/**
 * Studio Kifu Import Modal Component.
 * Supports pasting KIF/CSA/KI2/JKF text or uploading/dragging files (Shift-JIS & UTF-8).
 * Provides instant parsing preview with game metadata and plies count.
 * Follows Rule 1: strictly English code, comments, and identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { JKFPlayer } from 'json-kifu-format';
import { decodeKifBuffer } from '../../utils/encoding';

export interface StudioKifuImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (player: JKFPlayer, rawText: string) => void;
  initialText?: string;
}

const SAMPLE_AIGAKARI = `
手合割：平手
先手：藤井聡太 竜王・名人
後手：伊藤匠 叡王
棋戦：第36期竜王戦七番勝負 第1局
戦型：相掛かり
手数----指手---------消費時間--
1 ２六歩(27)   ( 0:01/00:00:01)
2 ８四歩(83)   ( 0:02/00:00:02)
3 ２五歩(26)   ( 0:01/00:00:02)
4 ８五歩(84)   ( 0:01/00:00:03)
5 ７八金(69)   ( 0:05/00:00:07)
6 ３二金(41)   ( 0:02/00:00:05)
7 ２四歩(25)   ( 0:12/00:00:19)
8 同　歩(23)   ( 0:01/00:00:06)
9 同　飛(28)   ( 0:01/00:00:20)
10 ２三歩打     ( 0:03/00:00:09)
11 ２八飛(24)   ( 0:04/00:00:24)
12 ８六歩(85)   ( 0:02/00:00:11)
13 同　歩(87)   ( 0:01/00:00:25)
14 同　飛(82)   ( 0:01/00:00:12)
15 ８七歩打     ( 0:02/00:00:27)
16 ８二飛(86)   ( 0:01/00:00:13)
`.trim();

const SAMPLE_KAKUGAWARI = `
手合割：平手
先手：先手A
後手：後手B
棋戦：サンプル棋戦
戦型：角換わり
手数----指手---------消費時間--
1 ７六歩(77)   ( 0:01/00:00:01)
2 ３四歩(33)   ( 0:02/00:00:02)
3 ２六歩(27)   ( 0:01/00:00:02)
4 ８四歩(83)   ( 0:02/00:00:04)
5 ２五歩(26)   ( 0:01/00:00:03)
6 ８五歩(84)   ( 0:01/00:00:05)
7 ７八金(69)   ( 0:02/00:00:05)
8 ３二金(41)   ( 0:01/00:00:06)
9 ２四歩(25)   ( 0:03/00:00:08)
10 同　歩(23)   ( 0:01/00:00:07)
11 同　飛(28)   ( 0:01/00:00:09)
12 ８六歩(85)   ( 0:02/00:00:09)
13 同　歩(87)   ( 0:01/00:00:10)
14 同　飛(82)   ( 0:01/00:00:10)
15 ３四飛(24)   ( 0:04/00:00:14)
16 ３三角(22)   ( 0:03/00:00:13)
`.trim();

/**
 * Tries parsing a raw string using JKFPlayer parsers in order: KIF, CSA, KI2, JSON.
 */
function tryParseKifu(raw: string): { player: JKFPlayer | null; error: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { player: null, error: null };
  }

  // 1. If starts with JSON bracket
  if (trimmed.startsWith('{')) {
    try {
      const parsedJson = JSON.parse(trimmed);
      return { player: new JKFPlayer(parsedJson), error: null };
    } catch {
      // Fall through
    }
  }

  // 2. Try KIF format
  try {
    return { player: JKFPlayer.parseKIF(trimmed), error: null };
  } catch {
    // Fall through
  }

  // 3. Try CSA format
  try {
    return { player: JKFPlayer.parseCSA(trimmed), error: null };
  } catch {
    // Fall through
  }

  // 4. Try KI2 format
  try {
    return { player: JKFPlayer.parseKI2(trimmed), error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { player: null, error: msg };
  }
}

export const StudioKifuImportModal: React.FC<StudioKifuImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
  initialText = '',
}) => {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<'paste' | 'file'>('paste');
  const [inputText, setInputText] = useState(initialText);
  const [detectedEncoding, setDetectedEncoding] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync initialText when modal opens
  useEffect(() => {
    if (isOpen) {
      setInputText(initialText);
      setDetectedEncoding(null);
      setClipboardError(null);
    }
  }, [isOpen, initialText]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Real-time parse evaluation
  const { player, error } = useMemo(() => {
    return tryParseKifu(inputText);
  }, [inputText]);

  // Game metadata preview
  const metadata = useMemo(() => {
    if (!player) return null;
    return {
      sente: player.kifu.header['先手'] || player.kifu.header['sente'] || '-',
      gote: player.kifu.header['後手'] || player.kifu.header['gote'] || '-',
      opening: player.kifu.header['戦型'] || player.kifu.header['opening'] || t('studio.free_study'),
      totalPlies: player.getMaxTesuu(),
      forkCount: player.kifu.moves.filter((m) => m.forks && m.forks.length > 0).length,
    };
  }, [player, t]);

  // Paste from clipboard
  const handlePasteClipboard = async () => {
    try {
      setClipboardError(null);
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setClipboardError(t('studio.import_modal.err_clipboard'));
        return;
      }
      setInputText(text);
      setActiveTab('paste');
    } catch {
      setClipboardError(t('studio.import_modal.err_clipboard'));
    }
  };

  // Handle file reading
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (result instanceof ArrayBuffer) {
        const decoded = decodeKifBuffer(result);
        setInputText(decoded.text);
        setDetectedEncoding(decoded.encoding.toUpperCase());
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleSubmit = () => {
    if (!player) return;
    onImport(player, inputText);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in font-sans">
      <div
        className="w-full max-w-2xl bg-slate-900 border border-amber-500/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📥</span>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-amber-300">
                {t('studio.import_modal.title')}
              </h3>
              <p className="text-[11px] text-slate-400">
                {t('studio.import_modal.subtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Tab Buttons */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-5 pt-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('paste')}
            className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors border-b-2 ${
              activeTab === 'paste'
                ? 'border-amber-400 text-amber-300 bg-slate-800/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('studio.import_modal.tab_paste')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('file')}
            className={`px-3 py-2 text-xs font-bold rounded-t-lg transition-colors border-b-2 ${
              activeTab === 'file'
                ? 'border-amber-400 text-amber-300 bg-slate-800/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('studio.import_modal.tab_file')}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: Paste Text */}
          {activeTab === 'paste' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-semibold transition flex items-center gap-1.5"
                >
                  {t('studio.import_modal.paste_btn')}
                </button>

                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-slate-500">{t('studio.import_modal.quick_load_label', 'クイック読込:')}</span>
                  <button
                    type="button"
                    onClick={() => setInputText(SAMPLE_AIGAKARI)}
                    className="px-2 py-0.5 rounded bg-slate-800/60 hover:bg-amber-600/30 text-slate-300 hover:text-amber-200 border border-slate-700 transition"
                  >
                    {t('studio.import_modal.sample_aigakari', '相掛かり')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputText(SAMPLE_KAKUGAWARI)}
                    className="px-2 py-0.5 rounded bg-slate-800/60 hover:bg-amber-600/30 text-slate-300 hover:text-amber-200 border border-slate-700 transition"
                  >
                    {t('studio.import_modal.sample_kakugawari', '角換わり')}
                  </button>
                </div>
              </div>

              {clipboardError && (
                <div className="p-2 rounded bg-red-950/40 border border-red-500/50 text-xs text-red-300">
                  {clipboardError}
                </div>
              )}

              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={t('studio.import_modal.paste_placeholder')}
                rows={7}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-amber-500/70 transition resize-none placeholder:text-slate-600"
              />
            </div>
          )}

          {/* TAB 2: File Upload / Drag & Drop */}
          {activeTab === 'file' && (
            <div className="space-y-3">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-amber-400 bg-amber-500/10 scale-[0.99]'
                    : 'border-slate-700 hover:border-amber-500/50 bg-slate-950/40 hover:bg-slate-950/70'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".kif,.kifu,.csa,.ki2,.jkf,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                <span className="text-3xl block mb-2">📄</span>
                <p className="text-xs font-bold text-slate-200">
                  {t('studio.import_modal.drop_lead')}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {t('studio.import_modal.drop_sub')}
                </p>
              </div>

              {detectedEncoding && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{t('studio.import_modal.encoding_label')}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-mono font-bold">
                    {detectedEncoding}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Live Preview Card */}
          {player && metadata && (
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-emerald-500/40 text-xs space-y-2 animate-fade-in shadow-inner">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <span>✓</span> {t('studio.import_modal.preview_title')}
                </span>
                <span className="font-mono font-bold text-amber-300">
                  {t('studio.import_modal.preview_plies', '{{count}} 手', { count: metadata.totalPlies })}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-300">
                <div>
                  <span className="text-slate-500 mr-1">{t('studio.import_modal.preview_sente')}</span>
                  <span className="font-semibold text-slate-100">{metadata.sente}</span>
                </div>
                <div>
                  <span className="text-slate-500 mr-1">{t('studio.import_modal.preview_gote')}</span>
                  <span className="font-semibold text-slate-100">{metadata.gote}</span>
                </div>
                <div>
                  <span className="text-slate-500 mr-1">{t('studio.import_modal.preview_opening')}</span>
                  <span className="font-semibold text-amber-300">{metadata.opening}</span>
                </div>
                <div>
                  <span className="text-slate-500 mr-1">{t('studio.import_modal.preview_forks')}</span>
                  <span className="font-semibold text-slate-200">
                    {t('studio.import_modal.preview_fork_count', '{{count}} 箇所', { count: metadata.forkCount })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Parse Error Notification */}
          {!player && inputText.trim() && (
            <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/40 text-xs text-red-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <span>⚠️</span>
                <span>{t('studio.import_modal.err_parse')}</span>
              </div>
              {error && <div className="font-mono text-[11px] text-red-400/80 pl-5">{error}</div>}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-slate-800 bg-slate-950/60 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition active:scale-95"
          >
            {t('studio.import_modal.cancel_btn')}
          </button>
          <button
            type="button"
            disabled={!player}
            onClick={handleSubmit}
            className={`px-5 py-2 rounded-lg font-bold text-xs shadow-lg transition active:scale-95 flex items-center gap-1.5 ${
              player
                ? 'bg-amber-600 hover:bg-amber-500 text-slate-950 shadow-amber-950/40 cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            <span>✨</span>
            <span>{t('studio.import_modal.submit_btn')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
