/**
 * Tag Dictionary Manager Modal (Issue #69).
 * Lists tags grouped by TagGroupId, supports adding, ID-stable renaming,
 * deleting with referencing-record count confirmation, legacy custom tag
 * migration, and JSON export/import.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KifuRecord } from '../../types/kifuRecord';
import type { TagDefinition, TagGroupId } from '../../types/tagRegistry';
import { downloadKifFile } from '../../utils/exportHelpers';
import {
  buildTagDictionaryExportJson,
  changeTagGroupAndSync,
  countRecordsReferencingTag,
  deleteTagAndCleanupRecords,
  mergeTagIntoTarget,
  migrateLegacyCustomTagGroups,
  parseAndImportTagDictionaryJson,
  renameTagAndSyncRecords,
} from '../../utils/tagDictionaryIo';
import {
  createTagDefinition,
  loadTagRegistry,
} from '../../utils/tagRegistryStorage';
import { reclassifyAndAutoTagAllRecords } from '../../utils/gameKindClassifier';
import { ConfirmModal } from '../common/ConfirmModal';

interface TagDictionaryModalProps {
  records: KifuRecord[];
  onClose: () => void;
  onChanged: () => void;
}

const GROUP_ORDER: TagGroupId[] = [
  'source',
  'tournament',
  'opening',
  'study',
  'custom',
];

export const TagDictionaryModal: React.FC<TagDictionaryModalProps> = ({
  records,
  onClose,
  onChanged,
}) => {
  const { t } = useTranslation();
  const [tags, setTags] = useState<TagDefinition[]>(() => loadTagRegistry());
  const [newTagName, setNewTagName] = useState('');
  const [newTagGroup, setNewTagGroup] = useState<TagGroupId>('custom');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [mergingSourceId, setMergingSourceId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [confirmState, setConfirmState] = useState<
    | { type: 'delete'; tag: TagDefinition; count: number }
    | { type: 'merge'; source: TagDefinition; target: TagDefinition; count: number }
    | null
  >(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const groupedTags = useMemo(() => {
    const map = new Map<TagGroupId, TagDefinition[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const tag of tags) {
      const list = map.get(tag.groupId);
      if (list) {
        list.push(tag);
      } else {
        map.get('custom')?.push(tag);
      }
    }
    return map;
  }, [tags]);

  const reloadAll = () => {
    setTags(loadTagRegistry());
    onChanged();
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    createTagDefinition(trimmed, newTagGroup);
    setNewTagName('');
    setErrorMessage(null);
    reloadAll();
  };

  const handleStartRename = (tag: TagDefinition) => {
    setEditingId(tag.id);
    setEditingName(tag.name);
  };

  const handleCommitRename = (tagId: string) => {
    const trimmed = editingName.trim();
    if (trimmed) {
      renameTagAndSyncRecords(tagId, trimmed);
      reloadAll();
    }
    setEditingId(null);
  };

  const handleDeleteTag = (tag: TagDefinition) => {
    const count = countRecordsReferencingTag(tag.id, records);
    setConfirmState({ type: 'delete', tag, count });
  };

  const handleChangeGroup = (tagId: string, groupId: TagGroupId) => {
    changeTagGroupAndSync(tagId, groupId);
    setErrorMessage(null);
    reloadAll();
  };

  const handleStartMerge = (tag: TagDefinition) => {
    setMergingSourceId(tag.id);
    const firstCandidate = tags.find((tItem) => tItem.id !== tag.id);
    setMergeTargetId(firstCandidate?.id ?? '');
  };

  const handleRequestMergeConfirm = (sourceTag: TagDefinition) => {
    const targetTag = tags.find((tItem) => tItem.id === mergeTargetId);
    if (!targetTag || targetTag.id === sourceTag.id) return;
    const count = countRecordsReferencingTag(sourceTag.id, records);
    setConfirmState({
      type: 'merge',
      source: sourceTag,
      target: targetTag,
      count,
    });
  };

  const handleConfirmAction = () => {
    if (!confirmState) return;
    if (confirmState.type === 'delete') {
      deleteTagAndCleanupRecords(confirmState.tag.id);
      setErrorMessage(null);
      setConfirmState(null);
      reloadAll();
      return;
    }
    if (confirmState.type === 'merge') {
      const res = mergeTagIntoTarget(confirmState.source.id, confirmState.target.id);
      setConfirmState(null);
      setMergingSourceId(null);
      if (res.merged) {
        setStatusMessage(
          t('library_page.tag_dict_merge_done', {
            source: confirmState.source.name,
            target: confirmState.target.name,
            count: res.affectedRecords,
          })
        );
      }
      reloadAll();
    }
  };

  const handleExport = () => {
    const json = buildTagDictionaryExportJson(tags);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadKifFile(json, `joseki-tree-tags-${dateStamp}.json`);
    setErrorMessage(null);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const result = parseAndImportTagDictionaryJson(text);
      setErrorMessage(null);
      setStatusMessage(
        t('library_page.tag_dict_import_done', {
          added: result.added,
          updated: result.updated,
          adopted: result.adopted,
        })
      );
      reloadAll();
    } catch {
      setStatusMessage(null);
      setErrorMessage(t('library_page.tag_dict_import_error'));
    }
  };

  const handleMigrateLegacy = () => {
    const count = migrateLegacyCustomTagGroups();
    setErrorMessage(null);
    if (count > 0) {
      setStatusMessage(t('library_page.tag_dict_migrate_done', { count }));
      reloadAll();
    } else {
      setStatusMessage(t('library_page.tag_dict_migrate_none'));
    }
  };

  const handleReclassifyAll = () => {
    const res = reclassifyAndAutoTagAllRecords();
    setErrorMessage(null);
    setStatusMessage(
      t('library_page.tag_dict_reclassify_done', {
        count: res.updatedRecords,
      })
    );
    reloadAll();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('library_page.tag_dict_title')}
    >
      <div className="w-full max-w-3xl max-h-[85vh] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>🏷️</span>
              <span>{t('library_page.tag_dict_title')}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t('library_page.tag_dict_subtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
          >
            ✕
          </button>
        </div>

        {/* Toolbar: Export / Import / Legacy Migration + Add Tag */}
        <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/40 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={handleExport}
              className="px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white font-semibold transition"
            >
              {t('library_page.tag_dict_export')}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold transition"
            >
              {t('library_page.tag_dict_import')}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => void handleImportFile(e)}
              className="hidden"
            />
            <button
              type="button"
              onClick={handleMigrateLegacy}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 transition"
            >
              {t('library_page.tag_dict_migrate_legacy')}
            </button>
            <button
              type="button"
              onClick={handleReclassifyAll}
              className="px-3 py-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-600/40 font-semibold transition"
            >
              🔄 {t('library_page.tag_dict_reclassify_all')}
            </button>
          </div>

          <form
            onSubmit={handleAddTag}
            className="flex flex-wrap items-center gap-2 text-xs"
          >
            <select
              value={newTagGroup}
              onChange={(e) => setNewTagGroup(e.target.value as TagGroupId)}
              className="rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-slate-200"
            >
              {GROUP_ORDER.map((g) => (
                <option key={g} value={g}>
                  {t(`library_page.tag_group_${g}`)}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder={t('library_page.tag_dict_new_placeholder')}
              className="flex-1 min-w-[160px] rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-slate-100 placeholder-slate-500"
            />
            <button
              type="submit"
              disabled={!newTagName.trim()}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-semibold transition"
            >
              + {t('library_page.tag_dict_add')}
            </button>
          </form>

          {statusMessage && (
            <div className="text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-800/60 rounded-lg px-3 py-1.5">
              {statusMessage}
            </div>
          )}
          {errorMessage && (
            <div className="text-xs text-rose-300 bg-rose-950/40 border border-rose-800/60 rounded-lg px-3 py-1.5">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Grouped Tag List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {GROUP_ORDER.map((groupId) => {
            const list = groupedTags.get(groupId) ?? [];
            return (
              <div key={groupId} className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {t(`library_page.tag_group_${groupId}`)} ({list.length})
                </h3>
                {list.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    {t('library_page.tag_dict_empty_group')}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {list.map((tag) => {
                      const refCount = countRecordsReferencingTag(
                        tag.id,
                        records
                      );
                      return (
                        <div
                          key={tag.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs"
                        >
                          {editingId === tag.id ? (
                            <div className="flex items-center gap-1 flex-1">
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleCommitRename(tag.id);
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingId(null);
                                  }
                                }}
                                className="flex-1 rounded bg-slate-900 border border-amber-500 px-2 py-0.5 text-slate-100"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleCommitRename(tag.id)}
                                className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 font-bold"
                              >
                                ✓
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-slate-100 font-medium truncate">
                                #{tag.name}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                                {t('library_page.tag_dict_ref_count', {
                                  count: refCount,
                                })}
                              </span>
                            </div>
                          )}

                          {editingId !== tag.id && mergingSourceId !== tag.id && (
                            <div className="flex items-center gap-1 shrink-0">
                              <select
                                value={tag.groupId}
                                onChange={(e) =>
                                  handleChangeGroup(
                                    tag.id,
                                    e.target.value as TagGroupId
                                  )
                                }
                                title={t('library_page.tag_dict_move_group')}
                                aria-label={t('library_page.tag_dict_move_group')}
                                className="rounded bg-slate-900 border border-slate-800 px-1 py-0.5 text-[10px] text-slate-300 max-w-[92px]"
                              >
                                {GROUP_ORDER.map((g) => (
                                  <option key={`${tag.id}-g-${g}`} value={g}>
                                    {t(`library_page.tag_group_${g}`)}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => handleStartMerge(tag)}
                                className="px-1.5 py-0.5 rounded text-slate-400 hover:text-sky-300 hover:bg-slate-800 transition"
                                title={t('library_page.tag_dict_merge')}
                              >
                                🔗
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStartRename(tag)}
                                className="px-1.5 py-0.5 rounded text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition"
                                title={t('library_page.tag_dict_rename')}
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTag(tag)}
                                className="px-1.5 py-0.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 transition"
                                title={t('library_page.tag_dict_delete')}
                              >
                                🗑
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Inline Merge Target Bar when user clicks 🔗 */}
        {mergingSourceId && (() => {
          const sourceTag = tags.find((tItem) => tItem.id === mergingSourceId);
          if (!sourceTag) return null;
          return (
            <div className="px-5 py-3 border-t border-slate-800 bg-sky-950/30 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-sky-200 font-semibold">
                🔗 #{sourceTag.name} →
              </span>
              <select
                value={mergeTargetId}
                onChange={(e) => setMergeTargetId(e.target.value)}
                className="flex-1 min-w-[160px] rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1 text-slate-100"
              >
                {tags
                  .filter((tItem) => tItem.id !== sourceTag.id)
                  .map((tItem) => (
                    <option key={`mt-${tItem.id}`} value={tItem.id}>
                      #{tItem.name} ({t(`library_page.tag_group_${tItem.groupId}`)})
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={!mergeTargetId}
                onClick={() => handleRequestMergeConfirm(sourceTag)}
                className="px-3 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white font-semibold"
              >
                {t('library_page.tag_dict_merge')}
              </button>
              <button
                type="button"
                onClick={() => setMergingSourceId(null)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                {t('common.cancel')}
              </button>
            </div>
          );
        })()}
      </div>

      <ConfirmModal
        isOpen={confirmState !== null}
        title={
          confirmState?.type === 'merge'
            ? t('library_page.tag_dict_merge')
            : t('library_page.tag_dict_delete')
        }
        message={
          confirmState?.type === 'delete'
            ? t('library_page.tag_dict_delete_confirm', {
                name: confirmState.tag.name,
                count: confirmState.count,
              })
            : confirmState?.type === 'merge'
              ? t('library_page.tag_dict_merge_confirm', {
                  source: confirmState.source.name,
                  target: confirmState.target.name,
                  count: confirmState.count,
                })
              : ''
        }
        isDestructive={true}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
};
