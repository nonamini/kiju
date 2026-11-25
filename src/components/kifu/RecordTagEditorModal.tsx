/**
 * Per-record Tag Editor Modal (Issue #67).
 * Renders a grouped checkbox list from TagRegistry, updates KifuRecord.tagIds
 * immediately on toggle (regenerating derived `tags` names), and supports
 * creating new TagDefinitions inline.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KifuGameKind, KifuRecord } from '../../types/kifuRecord';
import {
  filterTagGroupsByGameKind,
  STRUCTURED_TAG_GROUPS,
  TagDefinition,
  TagGroupId,
} from '../../types/tagRegistry';
import { resolveGameKind } from '../../utils/gameKindClassifier';
import { updateKifuRecord } from '../../utils/kifuRecordStorage';
import {
  createTagDefinition,
  loadTagRegistry,
} from '../../utils/tagRegistryStorage';

export interface RecordTagEditorModalProps {
  record: KifuRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onOpenTagDictionary?: () => void;
}

const GROUP_ORDER: TagGroupId[] = [
  'source',
  'tournament',
  'opening',
  'study',
  'custom',
];

export const RecordTagEditorModal: React.FC<RecordTagEditorModalProps> = ({
  record,
  isOpen,
  onClose,
  onUpdated,
  onOpenTagDictionary,
}) => {
  const { t } = useTranslation();
  const [newTagName, setNewTagName] = useState('');
  const [newTagGroup, setNewTagGroup] = useState<TagGroupId>('custom');
  const [registryVersion, setRegistryVersion] = useState(0);
  const [showAllTags, setShowAllTags] = useState(false);

  const registry = useMemo(
    () => loadTagRegistry(),
    // Re-read whenever modal opens or a new tag is created
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOpen, registryVersion]
  );

  const effectiveGameKind: KifuGameKind = useMemo(
    () => (record ? resolveGameKind(record) : 'other'),
    [record]
  );

  const groupedTags = useMemo(() => {
    const map = new Map<TagGroupId, TagDefinition[]>();
    for (const g of GROUP_ORDER) {
      map.set(g, []);
    }
    for (const def of registry) {
      map.get(def.groupId)?.push(def);
    }

    if (showAllTags || !record) {
      return map;
    }

    const baseGroups = STRUCTURED_TAG_GROUPS.map((g) => ({
      ...g,
      tags: (map.get(g.id) ?? []).map((d) => d.name),
    }));
    const filteredGroups = filterTagGroupsByGameKind(
      baseGroups,
      effectiveGameKind,
      record.tags ?? []
    );
    const allowedByGroup = new Map<TagGroupId, Set<string>>(
      filteredGroups.map((g) => [g.id, new Set(g.tags)])
    );
    const checkedIds = new Set(record.tagIds ?? []);

    for (const groupId of GROUP_ORDER) {
      const allowed = allowedByGroup.get(groupId);
      if (!allowed) continue;
      const currentList = map.get(groupId) ?? [];
      map.set(
        groupId,
        currentList.filter((def) => allowed.has(def.name) || checkedIds.has(def.id))
      );
    }

    return map;
  }, [registry, showAllTags, record, effectiveGameKind]);

  if (!isOpen || !record) return null;

  const currentTagIds = new Set(record.tagIds ?? []);

  const groupLabel = (groupId: TagGroupId): string => {
    switch (groupId) {
      case 'source':
        return t('library_page.tag_group_source');
      case 'tournament':
        return t('library_page.tag_group_tournament');
      case 'opening':
        return t('library_page.tag_group_opening');
      case 'study':
        return t('library_page.tag_group_study');
      default:
        return t('library_page.tag_group_custom');
    }
  };

  const handleToggleTag = (tagId: string) => {
    const next = new Set(currentTagIds);
    if (next.has(tagId)) {
      next.delete(tagId);
    } else {
      next.add(tagId);
    }
    updateKifuRecord(record.id, { tagIds: Array.from(next) });
    onUpdated();
  };

  const handleCreateAndAssign = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    const created = createTagDefinition(trimmed, newTagGroup);
    const next = Array.from(new Set([...currentTagIds, created.id]));
    updateKifuRecord(record.id, { tagIds: next });
    setNewTagName('');
    setRegistryVersion((v) => v + 1);
    onUpdated();
  };

  const handleChangeGameKind = (kind: KifuGameKind) => {
    updateKifuRecord(record.id, { gameKind: kind });
    onUpdated();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>🏷️</span>
              <span>{t('library_page.tag_editor_title')}</span>
            </h2>
            <p className="text-xs text-slate-400 truncate">{record.title}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onOpenTagDictionary && (
              <button
                type="button"
                onClick={onOpenTagDictionary}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[11px] font-semibold transition"
              >
                🏷️ {t('library_page.tag_editor_open_dict')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-2 py-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 text-xs"
            >
              ✕
            </button>
          </div>
        </div>

        {/* GameKind Bar + Show All Toggle */}
        <div className="px-5 py-2.5 border-b border-slate-800 bg-slate-950/40 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400 font-semibold mr-1">
              {t('library_page.tag_editor_game_kind')}:
            </span>
            {(
              [
                { id: 'pro', icon: '🏯', labelKey: 'library_page.game_kind_pro' },
                { id: 'ladies', icon: '🌸', labelKey: 'library_page.game_kind_ladies' },
                { id: 'amateur', icon: '🎓', labelKey: 'library_page.game_kind_amateur' },
                { id: 'self', icon: '👤', labelKey: 'library_page.game_kind_self' },
                { id: 'joseki', icon: '📖', labelKey: 'library_page.game_kind_joseki' },
                { id: 'other', icon: '🌳', labelKey: 'library_page.game_kind_other' },
              ] as const
            ).map((opt) => {
              const active = effectiveGameKind === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleChangeGameKind(opt.id)}
                  className={`px-2 py-0.5 rounded-md border text-[11px] transition ${
                    active
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.icon} {t(opt.labelKey)}
                </button>
              );
            })}
          </div>
          <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showAllTags}
              onChange={(e) => setShowAllTags(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 accent-amber-500"
            />
            <span>{t('library_page.tag_editor_show_all_tags')}</span>
          </label>
        </div>

        {/* Quick Create Form */}
        <form
          onSubmit={handleCreateAndAssign}
          className="flex flex-wrap items-center gap-2 px-5 py-3 bg-slate-950/60 border-b border-slate-800"
        >
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder={t('library_page.tag_editor_add_placeholder')}
            className="flex-1 min-w-[160px] rounded-lg bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <select
            value={newTagGroup}
            onChange={(e) => setNewTagGroup(e.target.value as TagGroupId)}
            className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200"
          >
            {GROUP_ORDER.map((g) => (
              <option key={g} value={g}>
                {groupLabel(g)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!newTagName.trim()}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-slate-950 text-xs font-bold transition"
          >
            {t('library_page.tag_editor_add_btn')}
          </button>
        </form>

        {/* Grouped Checkbox List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {GROUP_ORDER.map((groupId) => {
            const items = groupedTags.get(groupId) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={groupId} className="space-y-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {groupLabel(groupId)}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {items.map((def) => {
                    const checked = currentTagIds.has(def.id);
                    return (
                      <label
                        key={def.id}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition select-none ${
                          checked
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-200 font-semibold'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleTag(def.id)}
                          className="accent-amber-500 rounded"
                        />
                        <span>#{def.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-slate-800 bg-slate-950/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
