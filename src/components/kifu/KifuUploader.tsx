/**
 * Kifu Uploader Component.
 * Supports pasting KIF text with Ctrl+Enter, drag & drop file upload,
 * automatic UTF-8 / Shift-JIS decoding, and duplicate detection.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { decodeKifBuffer } from '../../utils/encoding';
import { ParsedKifResult, parseKif } from '../../utils/kifParser';
import { classifyOpening } from '../../utils/openingClassifier';
import {
  BulkKifuProcessResult,
  processKifuFiles,
} from '../../utils/bulkKifuProcessor';

export interface KifuUploaderProps {
  onGameIngested: (result: ParsedKifResult) => void;
  /** Batch ingest path for multi-file/folder imports (#51). When provided,
   *  bulk results bypass the per-game duplicate dialog because the processor
   *  already filtered duplicates via contentHash (#52). */
  onBulkIngested?: (results: ParsedKifResult[]) => void;
  existingGameIds?: Set<string>;
}

// Built-in lightweight sample KIFs for one-click testing
const SAMPLE_KIFS: Record<string, string> = {
  habu: `#KIF version=2.0
開始日時：2026/01/09 9:00:00
棋戦：サンプル早指し戦
戦型：角換わり棒銀
手合割：平手
先手：先手A
後手：後手B
手数----指手---------消費時間--
   1 ７六歩(77)        ( 0:00/00:00:00)
   2 ８四歩(83)        ( 0:00/00:00:00)
   3 ２六歩(27)        ( 0:00/00:00:00)
   4 ８五歩(84)        ( 0:00/00:00:00)
   5 ２五歩(26)        ( 0:00/00:00:00)
   6 ３二金(41)        ( 0:00/00:00:00)
   7 ７七角(88)        ( 0:00/00:00:00)
   8 ３四歩(33)        ( 0:00/00:00:00)
   9 ８八銀(79)        ( 0:00/00:00:00)
  10 ７七角成(22)       ( 0:00/00:00:00)
  11 同　銀(88)        ( 0:00/00:00:00)
  12 ２二銀(31)        ( 0:00/00:00:00)
まで12手で中断`,
  wars: `#KIF version=2.0
棋戦：サンプル早指し戦
開始日時：2026/05/20 20:56:30
手合割：平手
先手：先手C
後手：後手D
手数----指手---------消費時間--
   1 ２六歩(27)        ( 0:00/00:00:00)
   2 ３四歩(33)        ( 0:00/00:00:00)
   3 ７六歩(77)        ( 0:00/00:00:00)
   4 ４四歩(43)        ( 0:00/00:00:00)
   5 ２五歩(26)        ( 0:00/00:00:00)
   6 ３三角(22)        ( 0:00/00:00:00)
   7 ７八銀(79)        ( 0:00/00:00:00)
**解析 0  候補1 時間 00:05.0 深さ 18/22 ノード数 1984594 評価値 -17 読み筋 △３二飛(82)
   8 ４二飛(82)        ( 0:00/00:00:00)
   9 ４八銀(39)        ( 0:00/00:00:00)
  10 ６二玉(51)        ( 0:00/00:00:00)
まで10手で中断`,
  piyo: `#KIF version=2.0
棋戦：サンプルタイトル戦
開始日時：2026/02/03 09:00
手合割：平手
先手：先手E
後手：後手F
手数----指手---------消費時間--
   1 ２六歩(27)   ( 0:00/00:00:00)
   2 ３四歩(33)   ( 0:00/00:00:00)
   3 ７六歩(77)   ( 0:00/00:00:00)
   4 ４四歩(43)   ( 0:00/00:00:00)
   5 ２五歩(26)   ( 0:00/00:00:00)
   6 ３三角(22)   ( 0:00/00:00:00)
   7 ４八銀(39)   ( 0:00/00:00:00)
   8 ３二銀(31)   ( 0:00/00:00:00)
まで8手で中断`,
  branch: `#KIF version=2.0
手合割：平手
棋戦：多分岐定跡サンプル
手数----指手---------消費時間--
   1 ２六歩(27)   ( 0:00/00:00:00)
   2 ３四歩(33)   ( 0:00/00:00:00)
   3 ７六歩(77)   ( 0:00/00:00:00)
   4 ４四歩(43)   ( 0:00/00:00:00)
   5 ４八銀(39)   ( 0:00/00:00:00)+
   6 ３二銀(31)   ( 0:00/00:00:00)

変化：5手
   5 ２五歩(26)   ( 0:00/00:00:00)
   6 ３三角(22)   ( 0:00/00:00:00)
まで6手で中断`,
};

export const KifuUploader: React.FC<KifuUploaderProps> = ({
  onGameIngested,
  onBulkIngested,
  existingGameIds,
}) => {
  const { t } = useTranslation();
  const [inputText, setInputText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'warning';
    text: string;
  } | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkSummary, setBulkSummary] = useState<BulkKifuProcessResult | null>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  const processKifContent = useCallback(
    (kifString: string) => {
      if (!kifString.trim()) return;

      try {
        const parsed = parseKif(kifString);

        if (parsed.moves.length === 0) {
          setStatusMessage({
            type: 'error',
            text: t('kifu_uploader.error_msg'),
          });
          return;
        }

        // Automatic opening classification
        const classified = classifyOpening(parsed.moves, parsed.game.openingId);
        parsed.game.openingId = classified.id;

        // Duplicate check
        if (existingGameIds && existingGameIds.has(parsed.game.id)) {
          setStatusMessage({
            type: 'warning',
            text: t('kifu_uploader.duplicate_alert'),
          });
          return;
        }

        onGameIngested(parsed);
        setInputText('');
        setStatusMessage({
          type: 'success',
          text: t('kifu_uploader.success_msg', {
            title: parsed.game.title,
            ply: parsed.moves.length,
          }),
        });
      } catch (err) {
        console.error('KIF parse error:', err);
        setStatusMessage({
          type: 'error',
          text: t('kifu_uploader.error_msg'),
        });
      }
    },
    [existingGameIds, onGameIngested, t]
  );

  const handleTextSubmit = () => {
    processKifContent(inputText);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleTextSubmit();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  // Bulk import (#51/#52): sequential per-file processing with progress and
  // a success/duplicate/failure summary. Duplicates are skipped by contentHash.
  const runBulkImport = useCallback(
    async (files: Iterable<File>) => {
      const fileList = Array.from(files);
      if (fileList.length === 0) return;
      setBulkSummary(null);
      setStatusMessage(null);
      setBulkProgress({ done: 0, total: fileList.length });
      try {
        const result = await processKifuFiles(fileList, {
          onProgress: (done, total) => setBulkProgress({ done, total }),
        });
        setBulkSummary(result);
        if (result.successes.length > 0) {
          if (onBulkIngested) {
            onBulkIngested(result.successes);
          } else {
            for (const parsed of result.successes) onGameIngested(parsed);
          }
        }
        const { success, duplicate, failed } = result.counts;
        setStatusMessage({
          type: success > 0 ? 'success' : failed > 0 ? 'error' : 'warning',
          text: t('kifu_uploader.bulk_summary', { success, duplicate, failed }),
        });
      } finally {
        setBulkProgress(null);
      }
    },
    [onBulkIngested, onGameIngested, t]
  );

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    // Multi-file drops go through the bulk pipeline; a single file keeps the
    // interactive duplicate-dialog flow for consistency with paste ingest.
    if (files.length === 1) {
      const file = files[0];
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        const decoded = decodeKifBuffer(buffer);
        processKifContent(decoded.text);
      } catch (err) {
        console.error('File read error:', err);
        setStatusMessage({
          type: 'error',
          text: t('kifu_uploader.error_msg'),
        });
      }
      return;
    }
    void runBulkImport(files);
  };

  // Folder import (#51 B2): prefer the File System Access API directory
  // picker; fall back to a hidden webkitdirectory input elsewhere.
  const handleFolderPick = async () => {
    const picker = (
      window as unknown as {
        showDirectoryPicker?: () => Promise<{
          values: () => AsyncIterable<{ kind: string; name: string }>;
        }>;
      }
    ).showDirectoryPicker;
    if (typeof picker === 'function') {
      try {
        const dir = await picker.call(window);
        const collected: File[] = [];
        const walk = async (handle: {
          kind: string;
          name: string;
          values?: () => AsyncIterable<unknown>;
          getFile?: () => Promise<File>;
        }): Promise<void> => {
          if (handle.kind === 'file' && typeof handle.getFile === 'function') {
            const f = await handle.getFile();
            if (f) collected.push(f);
            return;
          }
          if (handle.kind === 'directory' && handle.values) {
            for await (const child of handle.values() as AsyncIterable<typeof handle>) {
              await walk(child);
            }
          }
        };
        await walk(dir as unknown as Parameters<typeof walk>[0]);
        void runBulkImport(collected);
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Fall through to the input fallback on picker failure.
      }
    }
    dirInputRef.current?.click();
  };

  const handleSampleClick = (sampleKey: keyof typeof SAMPLE_KIFS) => {
    const sample = SAMPLE_KIFS[sampleKey];
    if (sample) {
      processKifContent(sample);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
          {t('kifu_uploader.title')}
        </h3>
        <span className="text-xs text-slate-400">Ctrl + Enter</span>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-lg text-sm flex items-center justify-between ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-200'
              : statusMessage.type === 'warning'
                ? 'bg-amber-950/60 border border-amber-800 text-amber-200'
                : 'bg-rose-950/60 border border-rose-800 text-rose-200'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs opacity-75 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Multiline Paste Textarea */}
      <div className="relative">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('kifu_uploader.paste_placeholder')}
          rows={5}
          className="w-full bg-slate-950/80 border border-slate-700/80 rounded-lg p-3 text-sm text-slate-200 font-mono placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-y"
        />
      </div>

      {/* Drag & Drop File Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-emerald-400 bg-emerald-950/20 text-emerald-300'
            : 'border-slate-700/60 bg-slate-950/40 text-slate-400 hover:border-slate-600'
        }`}
      >
        <p className="text-sm font-medium">{t('kifu_uploader.dropzone_title')}</p>
        <p className="text-xs text-slate-500 mt-1">{t('kifu_uploader.dropzone_desc')}</p>
      </div>

      {/* Bulk Import Controls (#51) */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => multiFileInputRef.current?.click()}
          disabled={bulkProgress !== null}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 transition-colors"
        >
          {t('kifu_uploader.bulk_files_btn')}
        </button>
        <button
          type="button"
          onClick={handleFolderPick}
          disabled={bulkProgress !== null}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 transition-colors"
        >
          {t('kifu_uploader.bulk_folder_btn')}
        </button>
        {bulkProgress && (
          <span className="text-xs text-emerald-300">
            {t('kifu_uploader.bulk_progress', {
              done: bulkProgress.done,
              total: bulkProgress.total,
            })}
          </span>
        )}
        <input
          ref={multiFileInputRef}
          type="file"
          multiple
          accept=".kif,.kifu,.ki2,.csa,.txt,.jkf"
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) void runBulkImport(files);
            e.target.value = '';
          }}
        />
        <input
          ref={dirInputRef}
          type="file"
          multiple
          // @ts-expect-error non-standard but widely supported directory attr
          webkitdirectory=""
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) void runBulkImport(files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Bulk Import Summary (#52) */}
      {bulkSummary && (
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-slate-300 font-semibold">
              {t('kifu_uploader.bulk_summary_title')}
            </span>
            <button
              type="button"
              onClick={() => setBulkSummary(null)}
              className="text-slate-500 hover:text-slate-300"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-3 text-slate-400">
            <span className="text-emerald-400">
              {t('kifu_uploader.bulk_success_count', { count: bulkSummary.counts.success })}
            </span>
            <span className="text-amber-400">
              {t('kifu_uploader.bulk_duplicate_count', { count: bulkSummary.counts.duplicate })}
            </span>
            <span className="text-rose-400">
              {t('kifu_uploader.bulk_failed_count', { count: bulkSummary.counts.failed })}
            </span>
          </div>
          {bulkSummary.fileResults
            .filter((r) => r.status !== 'success')
            .slice(0, 20)
            .map((r, i) => (
              <div key={`${r.fileName}-${i}`} className="text-slate-500 truncate" title={r.fileName}>
                {r.status === 'duplicate' ? '⏭' : '✕'} {r.fileName}
                {r.reason ? ` — ${t(`kifu_uploader.bulk_reason_${r.reason}`)}` : ''}
              </div>
            ))}
          {bulkSummary.fileResults.filter((r) => r.status !== 'success').length > 20 && (
            <div className="text-slate-600">
              {t('kifu_uploader.bulk_more_items', {
                count: bulkSummary.fileResults.filter((r) => r.status !== 'success').length - 20,
              })}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons & Quick Sample Presets */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">{t('kifu_uploader.quick_samples')}</span>
          <button
            type="button"
            onClick={() => handleSampleClick('habu')}
            className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            {t('kifu_uploader.sample_habu')}
          </button>
          <button
            type="button"
            onClick={() => handleSampleClick('wars')}
            className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            {t('kifu_uploader.sample_wars')}
          </button>
          <button
            type="button"
            onClick={() => handleSampleClick('piyo')}
            className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            {t('kifu_uploader.sample_piyo')}
          </button>
          <button
            type="button"
            onClick={() => handleSampleClick('branch')}
            className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            {t('kifu_uploader.sample_branch')}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {inputText && (
            <button
              type="button"
              onClick={() => setInputText('')}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
            >
              {t('kifu_uploader.clear_btn')}
            </button>
          )}
          <button
            type="button"
            onClick={handleTextSubmit}
            disabled={!inputText.trim()}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-md transition-colors"
          >
            {t('kifu_uploader.ingest_btn')}
          </button>
        </div>
      </div>
    </div>
  );
};
