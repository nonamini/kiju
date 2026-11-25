/**
 * Dedicated Tsumego Library Tab for KifuLibraryPage (Issue #176 Phase 1).
 * Defaults to a lightweight table view with an optional paginated card view,
 * supporting search, fixed ply filters (1..11, 13+), SFEN/KIF import,
 * creation/editing via Position Editor, Firestore sync, and solving launch.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { auth } from '../../services/firebase';
import {
  deleteTsumegoFromFirestore,
  syncTsumegoImportHistoryWithCloud,
  uploadTsumegoBatchToFirestore,
} from '../../services/firestoreKifuSync';
import type { TsumegoProblem } from '../../types/tsumego';
import { loadKifuRecords } from '../../utils/kifuRecordStorage';
import {
  hashTsumegoSfen,
  importKifTsumegoFile,
  importSfenTsumegoFile,
  shouldReplaceImportedTsumego,
} from '../../utils/tsumegoImporter';
import {
  extractTsumegoFromKifuRecords,
  mergeExtractedTsumegoProblems,
} from '../../utils/tsumegoKifuExtractor';
import {
  deleteTsumegoProblem,
  loadImportedTsumegoHashes,
  loadTsumegoProblems,
  markTsumegoDeleted,
  recordImportedTsumegoHashes,
  saveTsumegoProblems,
} from '../../utils/tsumegoStorage';

export interface LibraryTsumegoTabProps {
  problems: TsumegoProblem[];
  onRefresh: () => void;
  onNotice: (msg: string) => void;
}

type PlyFilterValue = 'all' | 1 | 3 | 5 | 7 | 9 | 11 | '13+';
type TabViewMode = 'table' | 'card';

const TABLE_PAGE_SIZE = 50;
const CARD_PAGE_SIZE = 24;

const PLY_FILTERS: ReadonlyArray<{ id: PlyFilterValue; labelKey: string; count?: number }> = [
  { id: 'all', labelKey: 'library_page.tsumego_tab_ply_all' },
  { id: 1, labelKey: 'position_editor.move_limit_fmt', count: 1 },
  { id: 3, labelKey: 'position_editor.move_limit_fmt', count: 3 },
  { id: 5, labelKey: 'position_editor.move_limit_fmt', count: 5 },
  { id: 7, labelKey: 'position_editor.move_limit_fmt', count: 7 },
  { id: 9, labelKey: 'position_editor.move_limit_fmt', count: 9 },
  { id: 11, labelKey: 'position_editor.move_limit_fmt', count: 11 },
  { id: '13+', labelKey: 'library_page.tsumego_tab_ply_13plus' },
];

export const LibraryTsumegoTab: React.FC<LibraryTsumegoTabProps> = ({
  problems,
  onRefresh,
  onNotice,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState<string>('');
  const [plyFilter, setPlyFilter] = useState<PlyFilterValue>('all');
  const [viewMode, setViewMode] = useState<TabViewMode>('table');
  const [page, setPage] = useState<number>(1);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [replaceImported, setReplaceImported] = useState<boolean>(false);

  useEffect(() => {
    setPage(1);
  }, [query, plyFilter, viewMode]);

  const filteredProblems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return problems.filter((p) => {
      if (plyFilter === '13+') {
        if (p.moveLimit < 13) return false;
      } else if (plyFilter !== 'all') {
        if (p.moveLimit !== plyFilter) return false;
      }
      if (!q) return true;
      const haystack = `${p.title ?? ''} ${p.id} ${p.tags.join(' ')}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [problems, plyFilter, query]);

  const pageSize = viewMode === 'card' ? CARD_PAGE_SIZE : TABLE_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filteredProblems.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const pagedProblems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProblems.slice(start, start + pageSize);
  }, [filteredProblems, currentPage, pageSize]);

  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsImporting(true);
    try {
      const nowIso = new Date().toISOString();
      const existing = loadTsumegoProblems();
      const excludeSfenHashes = new Set<string>([
        ...loadImportedTsumegoHashes(),
        ...existing.map((p) => hashTsumegoSfen(p.startSfen)),
      ]);
      const imported: TsumegoProblem[] = [];
      for (const file of Array.from(files)) {
        const lower = file.name.toLowerCase();
        const items =
          lower.endsWith('.kif') || lower.endsWith('.kifu')
            ? await importKifTsumegoFile(file)
            : await importSfenTsumegoFile(file, {
                maxProblems: 50,
                excludeSfenHashes,
              });
        for (const item of items) {
          excludeSfenHashes.add(hashTsumegoSfen(item.startSfen));
          imported.push({ ...item, updatedAt: nowIso });
        }
      }
      if (imported.length === 0) {
        onNotice(t('library_page.tsumego_tab_import_empty'));
        return;
      }
      const uid = auth?.currentUser?.uid;
      const removedIds = replaceImported
        ? existing
            .filter((p) => shouldReplaceImportedTsumego(p, imported))
            .map((p) => p.id)
        : [];
      const kept = replaceImported
        ? existing.filter((p) => !shouldReplaceImportedTsumego(p, imported))
        : existing;

      for (const id of removedIds) {
        markTsumegoDeleted(id);
      }
      saveTsumegoProblems([...imported, ...kept]);
      recordImportedTsumegoHashes(imported.map((p) => p.startSfen));

      if (uid) {
        if (removedIds.length > 0) {
          await Promise.all(
            removedIds.map((id) => deleteTsumegoFromFirestore(uid, id))
          );
        }
        await uploadTsumegoBatchToFirestore(uid, imported);
        void syncTsumegoImportHistoryWithCloud(uid);
      }
      onRefresh();
      onNotice(t('library_page.tsumego_tab_import_done', { count: imported.length }));
    } catch {
      onNotice(t('library_page.tsumego_tab_import_failed'));
    } finally {
      setIsImporting(false);
    }
  };

  const handleDelete = async (prob: TsumegoProblem) => {
    if (
      !window.confirm(
        t('position_editor.confirm_delete', { title: prob.title ?? prob.id })
      )
    ) {
      return;
    }
    deleteTsumegoProblem(prob.id);
    onRefresh();
    const uid = auth?.currentUser?.uid;
    if (uid) {
      await deleteTsumegoFromFirestore(uid, prob.id);
    }
  };

  const handleExtractFromKifu = async () => {
    const records = loadKifuRecords();
    const extracted = extractTsumegoFromKifuRecords(records);
    const existing = loadTsumegoProblems();
    const { merged, added } = mergeExtractedTsumegoProblems(existing, extracted);
    if (added.length === 0) {
      onNotice(t('library_page.tsumego_tab_extract_none'));
      return;
    }
    saveTsumegoProblems(merged);
    const uid = auth?.currentUser?.uid;
    if (uid) {
      await uploadTsumegoBatchToFirestore(uid, added);
    }
    onRefresh();
    onNotice(t('library_page.tsumego_tab_extract_done', { count: added.length }));
  };

  const formatSourceLabel = (source: TsumegoProblem['source']): string => {
    if (source === 'kifu-extract') return t('library_page.tsumego_tab_source_extract');
    if (source === 'tanuki-import') return t('library_page.tsumego_tab_source_import');
    return t('library_page.tsumego_tab_source_manual');
  };

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            {PLY_FILTERS.map((opt) => (
              <button
                key={String(opt.id)}
                type="button"
                onClick={() => setPlyFilter(opt.id)}
                className={`px-2.5 py-1 rounded-lg border transition ${
                  plyFilter === opt.id
                    ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {opt.count !== undefined
                  ? t(opt.labelKey, { count: opt.count })
                  : t(opt.labelKey)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="file"
              ref={fileInputRef}
              accept=".sfen,.txt,.kif,.kifu"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleImportFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <Link
              to="/studio?editPosition=new&defaultCategory=tsumego"
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow transition"
            >
              ＋ {t('library_page.tsumego_tab_create_btn')}
            </Link>
            <button
              type="button"
              onClick={() => void handleExtractFromKifu()}
              className="px-3 py-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-500 text-white font-bold shadow transition"
            >
              ✨ {t('library_page.tsumego_tab_extract_btn')}
            </button>
            <button
              type="button"
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 font-semibold transition"
            >
              📥 {t('library_page.tsumego_tab_import_btn')}
            </button>
            <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-700/80 bg-slate-950/70 text-[11px] text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={replaceImported}
                onChange={(e) => setReplaceImported(e.target.checked)}
                className="rounded border-slate-600 bg-slate-900 text-amber-500 focus:ring-0"
              />
              <span>{t('library_page.tsumego_tab_replace_imported')}</span>
            </label>
            <Link
              to="/studio?mode=tsumego"
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow transition"
            >
              🧩 {t('library_page.tsumego_tab_solve_all_btn')}
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-md">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('library_page.tsumego_tab_search_placeholder')}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-400">
              {filteredProblems.length} / {problems.length}
            </span>
            <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                  viewMode === 'table'
                    ? 'bg-amber-600 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('library_page.view_table')}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('card')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                  viewMode === 'card'
                    ? 'bg-amber-600 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('library_page.view_card')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {filteredProblems.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center space-y-3">
          <p className="text-xs text-slate-400">{t('library_page.tsumego_tab_empty')}</p>
          <Link
            to="/studio?editPosition=new&defaultCategory=tsumego"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition"
          >
            ＋ {t('library_page.tsumego_tab_create_btn')}
          </Link>
        </div>
      ) : viewMode === 'table' ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-x-auto shadow-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2.5 whitespace-nowrap">{t('library_page.col_move_limit')}</th>
                <th className="px-3 py-2.5 whitespace-nowrap">{t('library_page.col_title')}</th>
                <th className="px-2.5 py-2.5 whitespace-nowrap">{t('library_page.col_turn')}</th>
                <th className="px-2.5 py-2.5 whitespace-nowrap">{t('library_page.col_source')}</th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap">{t('library_page.col_actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {pagedProblems.map((prob) => (
                <tr key={prob.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                      🧩 {t('position_editor.move_limit_fmt', { count: prob.moveLimit })}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 max-w-[300px]">
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/studio?mode=tsumego&tsumegoId=${encodeURIComponent(prob.id)}`)
                      }
                      className="font-semibold text-slate-100 hover:text-emerald-300 hover:underline text-left truncate block w-full"
                    >
                      {prob.title ?? prob.id}
                    </button>
                    {prob.tags.length > 0 && (
                      <div className="text-[10px] text-slate-400 truncate">
                        {prob.tags.join(' ・ ')}
                      </div>
                    )}
                  </td>
                  <td className="px-2.5 py-2.5 font-mono text-slate-300 whitespace-nowrap text-[11px]">
                    {prob.sideToMove === 'w'
                      ? t('position_editor.turn_gote')
                      : t('position_editor.turn_sente')}
                  </td>
                  <td className="px-2.5 py-2.5 whitespace-nowrap">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
                      {formatSourceLabel(prob.source)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1 text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/studio?mode=tsumego&tsumegoId=${encodeURIComponent(prob.id)}`)
                        }
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition"
                      >
                        🧩 {t('position_editor.action_solve_tsumego')}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/studio?sfen=${encodeURIComponent(prob.startSfen)}`)
                        }
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                      >
                        🌳 {t('position_editor.action_study')}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/studio?editPosition=1&tsumegoId=${encodeURIComponent(prob.id)}`)
                        }
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                      >
                        🛠️ {t('position_editor.action_edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(prob)}
                        className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60 transition"
                        title={t('position_editor.action_delete')}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {pagedProblems.map((prob) => (
            <div
              key={prob.id}
              className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col justify-between gap-3 hover:border-emerald-500/40 transition"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                      🧩 {t('position_editor.move_limit_fmt', { count: prob.moveLimit })}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {formatSourceLabel(prob.source)}
                    </span>
                  </div>
                  <span className="text-slate-400 font-mono">
                    {prob.sideToMove === 'w'
                      ? t('position_editor.turn_gote')
                      : t('position_editor.turn_sente')}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 truncate">
                  {prob.title ?? prob.id}
                </h3>
                {prob.tags.length > 0 && (
                  <p className="text-[11px] text-slate-400 truncate">
                    {prob.tags.join(' ・ ')}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/studio?mode=tsumego&tsumegoId=${encodeURIComponent(prob.id)}`)
                  }
                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition"
                >
                  🧩 {t('position_editor.action_solve_tsumego')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/studio?sfen=${encodeURIComponent(prob.startSfen)}`)
                  }
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  🌳 {t('position_editor.action_study')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/studio?editPosition=1&tsumegoId=${encodeURIComponent(prob.id)}`)
                  }
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                >
                  🛠️ {t('position_editor.action_edit')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(prob)}
                  className="ml-auto px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60 transition"
                  title={t('position_editor.action_delete')}
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2 text-xs">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
          >
            ← {t('library_page.page_prev')}
          </button>
          <span className="text-slate-400">
            {t('library_page.page_info', {
              current: currentPage,
              total: totalPages,
            })}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200"
          >
            {t('library_page.page_next')} →
          </button>
        </div>
      )}
    </section>
  );
};
