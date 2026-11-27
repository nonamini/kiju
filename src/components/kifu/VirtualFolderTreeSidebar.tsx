/**
 * Collapsible Virtual Folder Tree sidebar for KifuLibraryPage (Issue #9).
 * Lets users browse records by hierarchical folderPath alongside filters & tags.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict without any (Rule 2).
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  UNCATEGORIZED_FOLDER_KEY,
  VirtualFolderNode,
} from '../../utils/virtualFolderTree';

export interface VirtualFolderTreeSidebarProps {
  roots: VirtualFolderNode[];
  uncategorizedCount: number;
  totalCount: number;
  selectedFolderPath: string;
  onSelectFolder: (folderPath: string) => void;
  onClose?: () => void;
}

export const VirtualFolderTreeSidebar: React.FC<
  VirtualFolderTreeSidebarProps
> = ({
  roots,
  uncategorizedCount,
  totalCount,
  selectedFolderPath,
  onSelectFolder,
  onClose,
}) => {
  const { t } = useTranslation();
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (selectedFolderPath && selectedFolderPath !== UNCATEGORIZED_FOLDER_KEY) {
      const parts = selectedFolderPath.split('/').filter(Boolean);
      for (let i = 1; i <= parts.length; i++) {
        initial.add(parts.slice(0, i).join('/'));
      }
    }
    return initial;
  });

  const toggleExpand = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const renderNode = (node: VirtualFolderNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedPaths.has(node.path);
    const isSelected = selectedFolderPath === node.path;

    return (
      <div key={node.path}>
        <div
          onClick={() => onSelectFolder(node.path)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectFolder(node.path);
            }
          }}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          className={`flex items-center justify-between gap-1.5 pr-2 py-1.5 rounded-lg text-xs cursor-pointer transition select-none ${
            isSelected
              ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 font-semibold'
              : 'text-slate-300 hover:bg-slate-800/80 border border-transparent'
          }`}
        >
          <div className="flex items-center gap-1 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleExpand(node.path, e)}
                className="w-4 h-4 flex items-center justify-center text-[10px] text-slate-400 hover:text-amber-300 shrink-0"
                aria-label={node.name}
              >
                {isExpanded ? '▾' : '▸'}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            <span className="shrink-0 text-[11px]">📁</span>
            <span className="truncate" title={node.path}>
              {node.name}
            </span>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950/80 text-slate-400 shrink-0">
            {node.totalCount}
          </span>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-0.5 space-y-0.5">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="w-full lg:w-64 shrink-0 rounded-xl border border-slate-800 bg-slate-900/80 p-3 space-y-2 self-start">
      <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-800">
        <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
          <span>🗂️</span>
          <span>{t('library_page.folders.title')}</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-slate-200 px-1"
            title={t('common.close')}
          >
            ✕
          </button>
        )}
      </div>

      <div className="space-y-0.5 max-h-[60vh] overflow-y-auto pr-0.5">
        <button
          type="button"
          onClick={() => onSelectFolder('')}
          className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs transition ${
            !selectedFolderPath
              ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 font-semibold'
              : 'text-slate-300 hover:bg-slate-800/80 border border-transparent'
          }`}
        >
          <span className="flex items-center gap-1.5 truncate">
            <span>📚</span>
            <span>{t('library_page.folders.all')}</span>
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950/80 text-slate-400">
            {totalCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectFolder(UNCATEGORIZED_FOLDER_KEY)}
          className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs transition ${
            selectedFolderPath === UNCATEGORIZED_FOLDER_KEY
              ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 font-semibold'
              : 'text-slate-300 hover:bg-slate-800/80 border border-transparent'
          }`}
        >
          <span className="flex items-center gap-1.5 truncate">
            <span>📄</span>
            <span>{t('library_page.folders.uncategorized')}</span>
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950/80 text-slate-400">
            {uncategorizedCount}
          </span>
        </button>

        {roots.length > 0 ? (
          <div className="pt-1 border-t border-slate-800/60 space-y-0.5">
            {roots.map((root) => renderNode(root, 0))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 px-2 pt-2 leading-relaxed">
            {t('library_page.folders.empty_hint')}
          </p>
        )}
      </div>
    </aside>
  );
};
