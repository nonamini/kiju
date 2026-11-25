/**
 * Dedicated Free Board Diagrams Tab for KifuLibraryPage (Issue #176 Phase 3).
 * Defaults to a lightweight table view with an optional paginated card view
 * displaying live arbitrary-size board previews, CRUD editor modal, duplicate, and Firestore sync.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { auth } from '../../services/firebase';
import {
  deleteFreeBoardDiagramFromFirestore,
  uploadFreeBoardDiagramToFirestore,
} from '../../services/firestoreKifuSync';
import type { FreeBoardDiagram } from '../../types/freeBoardDiagram';
import {
  deleteFreeBoardDiagram,
  saveFreeBoardDiagram,
} from '../../utils/freeBoardDiagramStorage';
import { FreeBoardDiagramEditorModal } from '../diagram/FreeBoardDiagramEditorModal';
import { FreeBoardDiagramView } from '../diagram/FreeBoardDiagramView';

export interface LibraryDiagramTabProps {
  diagrams: FreeBoardDiagram[];
  onRefresh: () => void;
  onNotice: (msg: string) => void;
}

type TabViewMode = 'table' | 'card';

const TABLE_PAGE_SIZE = 50;
const CARD_PAGE_SIZE = 12;

export const LibraryDiagramTab: React.FC<LibraryDiagramTabProps> = ({
  diagrams,
  onRefresh,
  onNotice,
}) => {
  const { t } = useTranslation();

  const [query, setQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<TabViewMode>('table');
  const [page, setPage] = useState<number>(1);
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editingDiagram, setEditingDiagram] = useState<FreeBoardDiagram | null>(
    null
  );

  useEffect(() => {
    setPage(1);
  }, [query, viewMode]);

  const filteredDiagrams = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return diagrams;
    return diagrams.filter((d) => {
      const haystack =
        `${d.title} ${d.description ?? ''} ${d.tags.join(' ')} ${d.cols}x${d.rows}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [diagrams, query]);

  const pageSize = viewMode === 'card' ? CARD_PAGE_SIZE : TABLE_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filteredDiagrams.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const pagedDiagrams = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDiagrams.slice(start, start + pageSize);
  }, [filteredDiagrams, currentPage, pageSize]);

  const handleOpenCreate = () => {
    setEditingDiagram(null);
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (diagram: FreeBoardDiagram) => {
    setEditingDiagram(diagram);
    setIsEditorOpen(true);
  };

  const handleDuplicate = (diagram: FreeBoardDiagram) => {
    const now = new Date().toISOString();
    const copy: FreeBoardDiagram = {
      ...diagram,
      id: `diag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: `${diagram.title} (${t('library_page.diagram_tab_copy_suffix')})`,
      pieces: [...diagram.pieces],
      highlights: [...diagram.highlights],
      markers: [...diagram.markers],
      arrows: [...diagram.arrows],
      tags: [...diagram.tags],
      createdAt: now,
      updatedAt: now,
    };
    const saved = saveFreeBoardDiagram(copy);
    const uid = auth?.currentUser?.uid;
    if (uid) {
      void uploadFreeBoardDiagramToFirestore(uid, saved);
    }
    onRefresh();
    onNotice(t('library_page.diagram_tab_duplicated'));
  };

  const handleDelete = async (diagram: FreeBoardDiagram) => {
    if (
      !window.confirm(t('position_editor.confirm_delete', { title: diagram.title }))
    ) {
      return;
    }
    deleteFreeBoardDiagram(diagram.id);
    onRefresh();
    const uid = auth?.currentUser?.uid;
    if (uid) {
      await deleteFreeBoardDiagramFromFirestore(uid, diagram.id);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-md">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('library_page.diagram_tab_search_placeholder')}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[11px] font-mono text-slate-400">
              {filteredDiagrams.length} / {diagrams.length}
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
            <button
              type="button"
              onClick={handleOpenCreate}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow transition"
            >
              ＋ {t('library_page.diagram_tab_create_btn')}
            </button>
          </div>
        </div>
      </div>

      {filteredDiagrams.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-center space-y-3">
          <p className="text-xs text-slate-400">
            {t('library_page.diagram_tab_empty')}
          </p>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition"
          >
            ＋ {t('library_page.diagram_tab_create_btn')}
          </button>
        </div>
      ) : viewMode === 'table' ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-x-auto shadow-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400">
                <th className="px-3 py-2.5 whitespace-nowrap">
                  {t('library_page.diagram_col_size')}
                </th>
                <th className="px-3 py-2.5 whitespace-nowrap">
                  {t('library_page.col_title')}
                </th>
                <th className="px-2.5 py-2.5 whitespace-nowrap">
                  {t('library_page.diagram_col_elements')}
                </th>
                <th className="px-2.5 py-2.5 whitespace-nowrap">
                  {t('library_page.col_updated')}
                </th>
                <th className="px-3 py-2.5 text-right whitespace-nowrap">
                  {t('library_page.col_actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {pagedDiagrams.map((d) => (
                <tr key={d.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40 text-[10px] font-mono font-bold">
                      📐 {d.cols}×{d.rows}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 max-w-[320px]">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(d)}
                      className="font-semibold text-slate-100 hover:text-amber-300 hover:underline text-left truncate block w-full"
                    >
                      {d.title}
                    </button>
                    {d.description && (
                      <div className="text-[11px] text-slate-400 truncate">
                        {d.description}
                      </div>
                    )}
                    {d.tags.length > 0 && (
                      <div className="text-[10px] text-slate-500 truncate">
                        {d.tags.map((tg) => `#${tg}`).join(' ')}
                      </div>
                    )}
                  </td>
                  <td className="px-2.5 py-2.5 whitespace-nowrap text-[11px] text-slate-300 font-mono">
                    {t('diagram_editor.stats_fmt', {
                      pieces: d.pieces.length,
                      marks: d.highlights.length + d.markers.length + d.arrows.length,
                    })}
                  </td>
                  <td className="px-2.5 py-2.5 whitespace-nowrap text-[11px] text-slate-400 font-mono">
                    {d.updatedAt.slice(0, 10)}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1 text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(d)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                      >
                        ✏️ {t('position_editor.action_edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(d)}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                        title={t('library_page.diagram_action_duplicate')}
                      >
                        📋
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(d)}
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
          {pagedDiagrams.map((d) => (
            <div
              key={d.id}
              className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col justify-between gap-3 hover:border-amber-500/40 transition"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40 font-mono font-bold">
                    📐 {d.cols}×{d.rows}
                  </span>
                  <span className="text-slate-400 font-mono">
                    {d.updatedAt.slice(0, 10)}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-100 truncate">
                  {d.title}
                </h3>
                {d.description && (
                  <p className="text-[11px] text-slate-400 line-clamp-2">
                    {d.description}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-center py-2 bg-slate-950/60 rounded-lg border border-slate-800/70 overflow-x-auto">
                <FreeBoardDiagramView
                  diagram={d}
                  cellSizePx={d.cols > 6 || d.rows > 6 ? 22 : 28}
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(d)}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  ✏️ {t('position_editor.action_edit')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDuplicate(d)}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                >
                  📋 {t('library_page.diagram_action_duplicate')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(d)}
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

      <FreeBoardDiagramEditorModal
        isOpen={isEditorOpen}
        initialDiagram={editingDiagram}
        onClose={() => setIsEditorOpen(false)}
        onSaved={() => {
          onRefresh();
          onNotice(t('library_page.diagram_tab_saved'));
        }}
      />
    </section>
  );
};
