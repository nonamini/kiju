/**
 * Unified Kifu Library Page (/library, Issues #65 & #66).
 * Displays all KifuRecords across Studio, Tree, and Import sources with:
 * - S1: Full-text search across title, players, tournament, notes, tags
 * - S2: Structured filters (date range, winner, opening, tag, analysis, review, source, favorite)
 * - S3: Multi-column & dropdown sort
 * - S4: Table / Card view toggle
 * - S5: Active-filter chips with individual clear & reset all
 * - S6: Row actions (open Studio/Tree, inline rename, delete, favorite, tree toggle, KIF export)
 * - Pagination (50 per page) for 500+ record scalability
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSmartBack } from '../hooks/useSmartBack';
import type {
  CloudAnalysisLevel,
  KifuGameKind,
  KifuRecord,
  KifuWinner,
} from '../types/kifuRecord';
import type { TagDefinition, TagGroupId } from '../types/tagRegistry';
import { auth } from '../services/firebase';
import {
  deleteKifuRecordFromFirestore,
  ensureKifuRecordPayload,
  isCloudAnalyzedRecord,
  queueKifuRecordForCloudAnalysis,
  syncKifuRecordsWithCloud,
  uploadTacticToFirestore,
} from '../services/firestoreKifuSync';
import type { FreeBoardDiagram } from '../types/freeBoardDiagram';
import type { TacticalQuizCard } from '../types/quiz';
import type { TacticsNoteItem } from '../types/tacticsNote';
import type { TsumegoProblem } from '../types/tsumego';
import {
  getTacticsItemById,
  saveTacticsItem,
} from '../utils/tacticsStorage';
import { loadFreeBoardDiagrams } from '../utils/freeBoardDiagramStorage';
import { loadTsumegoProblems } from '../utils/tsumegoStorage';
import { loadQuizPool } from '../utils/quizPoolStorage';
import { isCustomPositionRecord } from '../utils/positionEditor';
import { syncTacticRecordsFromLibrary } from '../utils/tacticsJkfConverter';
import { LibraryDiagramTab } from '../components/kifu/LibraryDiagramTab';
import { LibraryTsumegoTab } from '../components/kifu/LibraryTsumegoTab';
import { LibraryQuizTab } from '../components/kifu/LibraryQuizTab';
import { downloadKifFile } from '../utils/exportHelpers';
import {
  countActiveFilters,
  DEFAULT_KIFU_LIBRARY_FILTER,
  filterKifuRecords,
  FilterRuleCombinator,
  getEffectiveSelectedTagIds,
  KifuFilterRule,
  KifuLibraryFilterState,
  paginateKifuRecords,
} from '../utils/kifuLibraryFilter';
import {
  getFilterRuleFieldLabel,
  getFilterRuleValueLabel,
  KifuFilterRuleBuilder,
} from '../components/kifu/KifuFilterRuleBuilder';
import {
  buildKifuBundleJson,
  bulkAssignTag,
  bulkDeleteRecords,
  bulkRemoveTag,
  bulkSetFavorite,
} from '../utils/kifuLibraryBulkOps';
import {
  deleteKifuRecord,
  initKifuRecordStorage,
  loadKifuRecords,
  updateKifuRecord,
} from '../utils/kifuRecordStorage';
import { OPENING_CATEGORIES } from '../utils/openingClassifier';
import { loadAppSettings } from '../utils/appSettingsStorage';
import { useSettings } from '../contexts/SettingsContext';
import {
  reclassifyAndAutoTagAllRecords,
  resolveGameKind,
  runOneTimeKifuClassificationMigration,
} from '../utils/gameKindClassifier';
import {
  isGenericPlaceholderPlayerName,
  loadPlayerProfiles,
} from '../utils/playerStorage';
import { loadTagRegistry } from '../utils/tagRegistryStorage';
import { RecordTagEditorModal } from '../components/kifu/RecordTagEditorModal';
import { RecordMetadataEditorModal } from '../components/kifu/RecordMetadataEditorModal';
import { TagDictionaryModal } from '../components/kifu/TagDictionaryModal';
import { VirtualFolderTreeSidebar } from '../components/kifu/VirtualFolderTreeSidebar';
import {
  buildVirtualFolderTree,
  UNCATEGORIZED_FOLDER_KEY,
} from '../utils/virtualFolderTree';
import { MyFilterBar } from '../components/common/MyFilterBar';
import {
  KifuMyFilterPreset,
  deleteMyFilter,
  loadKifuMyFilters,
  saveKifuMyFilter,
} from '../utils/myFilterStorage';
import { useIsMobile } from '../hooks/useIsMobile';

export type LibrarySortField =
  | 'updatedAt'
  | 'title'
  | 'matchDate'
  | 'totalPlies'
  | 'source';

export type SortDirection = 'asc' | 'desc';
export type LibraryViewMode = 'table' | 'card';

const PAGE_SIZE = 50;
const GAME_KIND_TAB_STORAGE_KEY = 'joseki_tree_library_gamekind_tab';

function loadSavedGameKindTab(): 'all' | KifuGameKind {
  return loadAppSettings().libraryDefaultGameKindTab ?? 'all';
}

export function sortKifuRecords(
  records: KifuRecord[],
  field: LibrarySortField,
  direction: SortDirection
): KifuRecord[] {
  const dir = direction === 'asc' ? 1 : -1;
  return [...records].sort((a, b) => {
    let cmp = 0;
    if (field === 'totalPlies') {
      cmp = (a.totalPlies ?? 0) - (b.totalPlies ?? 0);
    } else if (field === 'title') {
      cmp = (a.title || '').localeCompare(b.title || '');
    } else if (field === 'matchDate') {
      cmp = (a.matchDate || a.createdAt || '').localeCompare(
        b.matchDate || b.createdAt || ''
      );
    } else if (field === 'source') {
      cmp = (a.source || '').localeCompare(b.source || '');
    } else {
      cmp = (a.updatedAt || '').localeCompare(b.updatedAt || '');
    }
    if (cmp !== 0) return cmp * dir;
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });
}

function formatDateLabel(isoOrDate?: string): string {
  if (!isoOrDate) return '—';
  return isoOrDate.slice(0, 10);
}

function formatDateTimeLabel(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso.slice(0, 16).replace('T', ' ');
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

const TAG_GROUP_ORDER: TagGroupId[] = [
  'source',
  'tournament',
  'opening',
  'study',
  'custom',
];

const FOLDER_SIDEBAR_STORAGE_KEY = 'joseki_tree_library_folder_sidebar_open';

export const KifuLibraryPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const handleGoBack = useSmartBack('/');
  const { settings } = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const externalKifuDbHref = useMemo(() => {
    const raw = (settings.externalKifuDbUrl ?? '').trim();
    if (!raw) return null;
    if (raw.startsWith('https://') || raw.startsWith('http://')) return raw;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return null;
    return `https://${raw}`;
  }, [settings.externalKifuDbUrl]);

  const [records, setRecords] = useState<KifuRecord[]>(() => loadKifuRecords());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkTagId, setBulkTagId] = useState<string>('');
  const [tagRegistry, setTagRegistry] = useState<TagDefinition[]>(() =>
    loadTagRegistry()
  );
  const [filter, setFilter] = useState<KifuLibraryFilterState>(() => {
    const urlPlayerId = searchParams.get('playerId')?.trim() || '';
    const tab = searchParams.get('tab');
    const urlKind: 'all' | KifuGameKind | null =
      tab === 'joseki' ||
      tab === 'other' ||
      tab === 'pro' ||
      tab === 'ladies' ||
      tab === 'amateur' ||
      tab === 'self'
        ? tab
        : null;
    return {
      ...DEFAULT_KIFU_LIBRARY_FILTER,
      gameKind: urlKind ?? (urlPlayerId ? 'all' : loadSavedGameKindTab()),
      playerId: urlPlayerId || 'all',
    };
  });
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [showFolderSidebar, setShowFolderSidebar] = useState<boolean>(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        window.localStorage?.getItem(FOLDER_SIDEBAR_STORAGE_KEY) === '1'
      );
    } catch {
      return false;
    }
  });
  const toggleFolderSidebar = () => {
    setShowFolderSidebar((prev) => {
      const next = !prev;
      try {
        window.localStorage?.setItem(FOLDER_SIDEBAR_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };
  const [sortField, setSortField] = useState<LibrarySortField>(
    () => loadAppSettings().libraryDefaultSortField ?? 'updatedAt'
  );
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    () => loadAppSettings().libraryDefaultSortDirection ?? 'desc'
  );
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<LibraryViewMode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'card' : 'table'
  );
  const effectiveViewMode: LibraryViewMode = isMobile ? 'card' : viewMode;
  const [page, setPage] = useState<number>(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [tagEditorRecordId, setTagEditorRecordId] = useState<string | null>(null);
  const [metadataEditorRecordId, setMetadataEditorRecordId] = useState<string | null>(null);
  const [cloudLevel, setCloudLevel] = useState<CloudAnalysisLevel>(
    () => loadAppSettings().defaultCloudAnalysisLevel ?? 'standard'
  );
  const [cloudForceReanalyze, setCloudForceReanalyze] = useState<boolean>(false);
  const [isQueuingCloud, setIsQueuingCloud] = useState<boolean>(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState<boolean>(false);
  const [cloudNotice, setCloudNotice] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'kifu' | 'tsumego' | 'quiz' | 'diagrams'>(() => {
    const tab = searchParams.get('tab');
    if (tab === 'tsumego' || tab === 'positions') return 'tsumego';
    if (tab === 'quiz') return 'quiz';
    if (tab === 'diagrams') return 'diagrams';
    return 'kifu';
  });
  const [tsumegoProblems, setTsumegoProblems] = useState<TsumegoProblem[]>(() => loadTsumegoProblems());
  const [quizCards, setQuizCards] = useState<TacticalQuizCard[]>(() => loadQuizPool());
  const [diagrams, setDiagrams] = useState<FreeBoardDiagram[]>(() => loadFreeBoardDiagrams());
  const [tagDictOpen, setTagDictOpen] = useState<boolean>(false);
  const [kifuPresets, setKifuPresets] = useState<KifuMyFilterPreset[]>(() =>
    loadKifuMyFilters()
  );
  const [activeMyFilterId, setActiveMyFilterId] = useState<string | null>(null);

  const tagEditorRecord = useMemo(
    () => records.find((r) => r.id === tagEditorRecordId) ?? null,
    [records, tagEditorRecordId]
  );

  const metadataEditorRecord = useMemo(
    () => records.find((r) => r.id === metadataEditorRecordId) ?? null,
    [records, metadataEditorRecordId]
  );

  const refreshRecords = useCallback(() => {
    setRecords(loadKifuRecords());
    setTagRegistry(loadTagRegistry());
    setTsumegoProblems(loadTsumegoProblems());
    setQuizCards(loadQuizPool());
    setDiagrams(loadFreeBoardDiagrams());
    setKifuPresets(loadKifuMyFilters());
  }, []);

  const showLibraryNotice = useCallback((msg: string) => {
    setCloudNotice(msg);
    window.setTimeout(() => setCloudNotice(null), 4000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void initKifuRecordStorage().then(() => {
      if (!cancelled) {
        runOneTimeKifuClassificationMigration();
        const loaded = loadKifuRecords();
        syncTacticRecordsFromLibrary(loaded);
        setRecords(loaded);
        setTagRegistry(loadTagRegistry());
        setTsumegoProblems(loadTsumegoProblems());
        setQuizCards(loadQuizPool());
        setDiagrams(loadFreeBoardDiagrams());
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const gameKindCounts = useMemo(() => {
    const counts = {
      all: 0,
      pro: 0,
      ladies: 0,
      amateur: 0,
      self: 0,
      joseki: 0,
      other: 0,
    };
    for (const r of records) {
      if (r.deletedAt) continue;
      const kind = resolveGameKind(r);
      counts[kind] += 1;
      if (kind !== 'other' && kind !== 'joseki') {
        counts.all += 1;
      }
    }
    return counts;
  }, [records]);

  const handleSelectGameKindTab = (kind: 'all' | KifuGameKind) => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(GAME_KIND_TAB_STORAGE_KEY, kind);
      }
    } catch {
      // Ignore storage errors
    }
    setActiveSection('kifu');
    setFilter((prev) => ({ ...prev, gameKind: kind }));
    setActiveMyFilterId(null);
    setPage(1);
  };

  const tagNameById = useMemo(
    () => new Map(tagRegistry.map((d) => [d.id, d.name])),
    [tagRegistry]
  );

  const tagGroupById = useMemo(
    () => new Map(tagRegistry.map((d) => [d.id, d.groupId])),
    [tagRegistry]
  );

  const groupedTags = useMemo(() => {
    const groups = new Map<TagGroupId, TagDefinition[]>();
    for (const g of TAG_GROUP_ORDER) {
      groups.set(g, []);
    }
    for (const def of tagRegistry) {
      const list = groups.get(def.groupId);
      if (list) list.push(def);
    }
    return groups;
  }, [tagRegistry]);

  const [showTrash, setShowTrash] = useState(false);

  const trashCount = useMemo(
    () => records.filter((r) => Boolean(r.deletedAt)).length,
    [records]
  );

  const folderTree = useMemo(() => {
    const visibleByTrashAndKind = records.filter((r) => {
      const trashMatch = showTrash ? Boolean(r.deletedAt) : !r.deletedAt;
      if (!trashMatch) return false;
      const kind = resolveGameKind(r);
      if (filter.gameKind === 'all') {
        return kind !== 'other' && kind !== 'joseki';
      }
      return kind === filter.gameKind;
    });
    return buildVirtualFolderTree(visibleByTrashAndKind);
  }, [records, showTrash, filter.gameKind]);

  const folderVisibleTotalCount = useMemo(
    () =>
      folderTree.uncategorizedCount +
      folderTree.roots.reduce((sum, node) => sum + node.totalCount, 0),
    [folderTree]
  );

  const filteredRecords = useMemo(() => {
    const visibleRecords = records.filter((r) =>
      showTrash ? Boolean(r.deletedAt) : !r.deletedAt
    );
    return filterKifuRecords(visibleRecords, filter, tagNameById, tagGroupById);
  }, [records, showTrash, filter, tagNameById, tagGroupById]);

  const sortedRecords = useMemo(
    () => sortKifuRecords(filteredRecords, sortField, sortDirection),
    [filteredRecords, sortField, sortDirection]
  );

  const { items: pagedRecords, totalPages, currentPage } = useMemo(
    () => paginateKifuRecords(sortedRecords, page, PAGE_SIZE),
    [sortedRecords, page]
  );

  const activeFilterCount = useMemo(
    () => countActiveFilters(filter),
    [filter]
  );

  const selectedFilterTagIds = useMemo(
    () => getEffectiveSelectedTagIds(filter),
    [filter]
  );

  const updateFilter = (patch: Partial<KifuLibraryFilterState>) => {
    setFilter((prev) => ({ ...prev, ...patch }));
    setActiveMyFilterId(null);
    setPage(1);
  };

  const clearPlayerFilter = () => {
    updateFilter({ playerId: 'all' });
    if (searchParams.has('playerId')) {
      const next = new URLSearchParams(searchParams);
      next.delete('playerId');
      setSearchParams(next, { replace: true });
    }
  };

  const resetFilters = () => {
    setFilter(DEFAULT_KIFU_LIBRARY_FILTER);
    setActiveMyFilterId(null);
    setPage(1);
    if (searchParams.has('playerId')) {
      const next = new URLSearchParams(searchParams);
      next.delete('playerId');
      setSearchParams(next, { replace: true });
    }
  };

  const handleSort = (field: LibrarySortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'title' || field === 'source' ? 'asc' : 'desc');
    }
    setActiveMyFilterId(null);
    setPage(1);
  };

  const handleSelectMyFilter = (presetId: string) => {
    const preset = kifuPresets.find((p) => p.id === presetId);
    if (!preset) return;
    setActiveSection('kifu');
    setFilter({ ...DEFAULT_KIFU_LIBRARY_FILTER, ...preset.filter });
    if (preset.sortField) setSortField(preset.sortField);
    if (preset.sortDirection) setSortDirection(preset.sortDirection);
    setPage(1);
    setActiveMyFilterId(preset.id);
  };

  const handleSaveMyFilter = (name: string) => {
    const saved = saveKifuMyFilter({
      name,
      filter,
      sortField,
      sortDirection,
    });
    setKifuPresets(loadKifuMyFilters());
    setActiveMyFilterId(saved.id);
  };

  const handleDeleteMyFilter = (presetId: string) => {
    deleteMyFilter(presetId);
    setKifuPresets(loadKifuMyFilters());
    if (activeMyFilterId === presetId) {
      setActiveMyFilterId(null);
    }
  };

  const handleToggleFavorite = (rec: KifuRecord) => {
    updateKifuRecord(rec.id, { favorite: !rec.favorite });
    refreshRecords();
  };

  const handleStartRename = (rec: KifuRecord) => {
    setEditingId(rec.id);
    setEditingTitle(rec.title);
  };

  const handleCommitRename = (recId: string) => {
    const trimmed = editingTitle.trim();
    if (trimmed) {
      updateKifuRecord(recId, { title: trimmed });
      refreshRecords();
    }
    setEditingId(null);
  };

  const handleDelete = async (rec: KifuRecord) => {
    if (!showTrash) {
      updateKifuRecord(rec.id, { deletedAt: new Date().toISOString() });
      setSelectedIds((prev) => {
        if (!prev.has(rec.id)) return prev;
        const next = new Set(prev);
        next.delete(rec.id);
        return next;
      });
      refreshRecords();
      return;
    }
    if (!window.confirm(`「${rec.title}」を完全に削除しますか？この操作は取り消せません。`)) {
      return;
    }
    deleteKifuRecord(rec.id);
    setSelectedIds((prev) => {
      if (!prev.has(rec.id)) return prev;
      const next = new Set(prev);
      next.delete(rec.id);
      return next;
    });
    refreshRecords();
    const uid = auth?.currentUser?.uid;
    if (uid) {
      await deleteKifuRecordFromFirestore(uid, rec.id);
    }
  };

  const handleRestore = (rec: KifuRecord) => {
    updateKifuRecord(rec.id, { deletedAt: undefined });
    refreshRecords();
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const allPageSelected =
    pagedRecords.length > 0 && pagedRecords.every((r) => selectedIds.has(r.id));

  const toggleSelectPage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pagedRecords.forEach((r) => next.delete(r.id));
      } else {
        pagedRecords.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(sortedRecords.map((r) => r.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleBulkAssignTag = () => {
    if (!bulkTagId || selectedIds.size === 0) return;
    bulkAssignTag(Array.from(selectedIds), bulkTagId);
    refreshRecords();
  };

  const handleBulkRemoveTag = () => {
    if (!bulkTagId || selectedIds.size === 0) return;
    bulkRemoveTag(Array.from(selectedIds), bulkTagId);
    refreshRecords();
  };

  const handleBulkFavorite = (favorite: boolean) => {
    if (selectedIds.size === 0) return;
    bulkSetFavorite(Array.from(selectedIds), favorite);
    refreshRecords();
  };

  const handleBulkExportBundle = () => {
    if (selectedIds.size === 0) return;
    const selected = records.filter((r) => selectedIds.has(r.id));
    const json = buildKifuBundleJson(selected);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadKifFile(json, `kifu-bundle-${dateStamp}.json`);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (
      !window.confirm(
        t('library_page.bulk_delete_confirm', { count: selectedIds.size })
      )
    ) {
      return;
    }
    const ids = Array.from(selectedIds);
    bulkDeleteRecords(ids);
    setSelectedIds(new Set());
    refreshRecords();
    const uid = auth?.currentUser?.uid;
    if (uid) {
      await Promise.all(ids.map((id) => deleteKifuRecordFromFirestore(uid, id)));
    }
  };

  const handleBulkCloudAnalyze = async () => {
    if (selectedIds.size === 0 || isQueuingCloud) return;
    const uid = auth?.currentUser?.uid;
    if (!uid) {
      setCloudNotice(t('library_page.cloud_analysis_login_required'));
      return;
    }
    setIsQueuingCloud(true);
    try {
      let queued = 0;
      for (const id of selectedIds) {
        const ok = await queueKifuRecordForCloudAnalysis(uid, id, {
          level: cloudLevel,
          forceReanalyze: cloudForceReanalyze,
        });
        if (ok) queued += 1;
      }
      refreshRecords();
      setCloudNotice(
        queued > 0
          ? t('library_page.cloud_analysis_queued', { count: queued })
          : t('library_page.cloud_analysis_none')
      );
    } finally {
      setIsQueuingCloud(false);
    }
  };

  const handleSingleCloudAnalyze = async (rec: KifuRecord) => {
    if (isQueuingCloud) return;
    const uid = auth?.currentUser?.uid;
    if (!uid) {
      setCloudNotice(t('library_page.cloud_analysis_login_required'));
      return;
    }
    setIsQueuingCloud(true);
    try {
      const ok = await queueKifuRecordForCloudAnalysis(uid, rec.id, {
        level: cloudLevel,
        forceReanalyze: isCloudAnalyzedRecord(rec),
      });
      refreshRecords();
      setCloudNotice(
        ok
          ? t('library_page.cloud_analysis_queued', { count: 1 })
          : t('library_page.cloud_analysis_none')
      );
    } finally {
      setIsQueuingCloud(false);
    }
  };

  const handleCloudSyncAndRefresh = async () => {
    const uid = auth?.currentUser?.uid;
    if (!uid) {
      refreshRecords();
      setCloudNotice(t('library_page.refreshed_local_only', 'ローカルの棋譜一覧を再読み込みしました（Googleログインでクラウド同期が有効になります）'));
      setTimeout(() => setCloudNotice(null), 3500);
      return;
    }

    setIsCloudSyncing(true);
    setCloudNotice(t('studio.kifu_mgmt.cloud_syncing', 'Firestoreと同期中...'));
    try {
      const { pulled, pushed, migrated } = await syncKifuRecordsWithCloud(uid);
      reclassifyAndAutoTagAllRecords();
      syncTacticRecordsFromLibrary(loadKifuRecords());
      refreshRecords();
      setCloudNotice(
        t('studio.kifu_mgmt.cloud_sync_success', {
          defaultValue: `クラウド同期完了 (受信: ${pulled}局, 送信: ${pushed}局${migrated > 0 ? `, 移行: ${migrated}件` : ''})`,
          pulled,
          pushed,
          migrated: migrated > 0 ? `, 移行: ${migrated}件` : '',
        })
      );
    } catch (err) {
      console.warn('[KifuLibrary] Cloud sync error:', err);
      const errCode = (err as { code?: string })?.code;
      const errText = errCode ?? (err instanceof Error ? err.message : String(err));
      setCloudNotice(`同期に失敗しました: ${errText}`);
    } finally {
      setIsCloudSyncing(false);
      setTimeout(() => setCloudNotice(null), 4000);
    }
  };

  const handleExportKif = async (rec: KifuRecord) => {
    const uid = auth?.currentUser?.uid;
    const full = await ensureKifuRecordPayload(uid, rec.id);
    const content = full?.rawKif || full?.jkfJson || rec.rawKif || rec.jkfJson;
    if (!content || content === '{}') return;
    const ext = full?.rawKif || rec.rawKif ? 'kif' : 'jkf';
    const safeTitle = (rec.title || rec.id).replace(/[\\/:*?"<>|]/g, '_');
    downloadKifFile(content, `${safeTitle}.${ext}`);
  };

  const handleOpenInStudio = (rec: KifuRecord) => {
    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    if (returnTo === 'trace') {
      navigate(`/studio?mode=trace&gameId=${encodeURIComponent(rec.id)}`);
      return;
    }
    navigate(`/studio?gameId=${encodeURIComponent(rec.id)}`);
  };

  const renderSortIndicator = (field: LibrarySortField) => {
    if (sortField !== field) return null;
    return (
      <span className="ml-1 text-amber-400">
        {sortDirection === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  const handleOpenTacticNote = (rec: KifuRecord) => {
    const tacticId = rec.id.startsWith('tactic_game_')
      ? rec.id.replace(/^tactic_game_/, '')
      : `tactic_lib_${rec.id}`;
    const existing = getTacticsItemById(tacticId);
    if (!existing) {
      const created: TacticsNoteItem = {
        id: tacticId,
        category: 'custom',
        title: rec.title,
        tag: rec.openingName || rec.tags[0] || '研究',
        summary: rec.notes || `${rec.title} (${rec.totalPlies}手)`,
        jkfJson: rec.jkfJson !== '{}' ? rec.jkfJson : undefined,
        evalHistory: rec.evaluations
          ? Object.entries(rec.evaluations)
              .map(([p, v]) => ({
                ply: Number(p),
                scoreCp: v.scoreCp,
                isMate: v.isMate,
              }))
              .filter((e) => !Number.isNaN(e.ply))
              .sort((a, b) => a.ply - b.ply)
          : undefined,
        isCustom: true,
        updatedAt: new Date().toISOString(),
      };
      saveTacticsItem(created);
      const uid = auth?.currentUser?.uid;
      if (uid) {
        void uploadTacticToFirestore(uid, created);
      }
    }
    navigate(`/tactics/${encodeURIComponent(tacticId)}`);
  };

  const renderWinnerBadge = (
    winner?: KifuWinner,
    compact = false,
    gameKind?: KifuGameKind
  ) => {
    if (winner === 'sente') {
      return compact ? (
        <span className="inline-flex flex-col items-center leading-tight px-2 py-0.5 rounded text-[10px] font-medium bg-amber-950 text-amber-300 border border-amber-800">
          <span>{t('library_page.winner_sente_line1')}</span>
          <span>{t('library_page.winner_win_line2')}</span>
        </span>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-950 text-amber-300 border border-amber-800">
          {t('library.sente_win')}
        </span>
      );
    }
    if (winner === 'gote') {
      return compact ? (
        <span className="inline-flex flex-col items-center leading-tight px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-950 text-indigo-300 border border-indigo-800">
          <span>{t('library_page.winner_gote_line1')}</span>
          <span>{t('library_page.winner_win_line2')}</span>
        </span>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-950 text-indigo-300 border border-indigo-800">
          {t('library.gote_win')}
        </span>
      );
    }
    if (winner === 'draw') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300">
          {t('library.draw')}
        </span>
      );
    }
    if (gameKind === 'joseki') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-950/70 text-indigo-300 border border-indigo-700/50">
          {t('library_page.joseki_winner_badge')}
        </span>
      );
    }
    if (gameKind === 'other') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-950/70 text-sky-300 border border-sky-700/50">
          {t('library_page.study_winner_badge')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400">
        {t('library.unknown_result')}
      </span>
    );
  };

  const renderAnalysisBadge = (rec: KifuRecord) => {
    const hasEvals =
      rec.evaluations != null && Object.keys(rec.evaluations).length > 0;
    if (rec.analysisStatus === 'queued') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800">
          {t('library.queued_badge')}
        </span>
      );
    }
    if (
      rec.analysisStatus === 'processing' ||
      rec.analysisStatus === 'analyzing'
    ) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800">
          {t('library.processing_badge')}
        </span>
      );
    }
    if (rec.analysisStatus === 'failed') {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-950 text-rose-300 border border-rose-800">
          {t('library.failed_badge')}
        </span>
      );
    }
    if (rec.analysisStatus === 'completed' || hasEvals) {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
          {rec.analysisEngineId === 'yaneuraou'
            ? t('library.cloud_analyzed_badge')
            : t('library.analyzed_badge')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] text-slate-500 bg-slate-950">
        {t('library.unanalyzed_badge')}
      </span>
    );
  };

  const playerProfiles = useMemo(() => loadPlayerProfiles(), [records]);

  const activeChips: Array<{ key: string; label: string; onClear: () => void }> = [];
  if (filter.playerId !== 'all') {
    const playerName =
      playerProfiles.find((p) => p.id === filter.playerId)?.name ??
      filter.playerId;
    activeChips.push({
      key: 'playerId',
      label: `${t('library_page.filter_player')}: ${playerName}`,
      onClear: clearPlayerFilter,
    });
  }
  if (filter.query.trim()) {
    activeChips.push({
      key: 'query',
      label: `"${filter.query.trim()}"`,
      onClear: () => updateFilter({ query: '' }),
    });
  }
  if (filter.dateFrom || filter.dateTo) {
    activeChips.push({
      key: 'date',
      label: `${filter.dateFrom || '…'} ~ ${filter.dateTo || '…'}`,
      onClear: () => updateFilter({ dateFrom: '', dateTo: '' }),
    });
  }
  if (filter.winner !== 'all') {
    activeChips.push({
      key: 'winner',
      label: `${t('library_page.filter_winner')}: ${filter.winner}`,
      onClear: () => updateFilter({ winner: 'all' }),
    });
  }
  if (filter.openingId !== 'all') {
    const cat = OPENING_CATEGORIES.find((c) => c.id === filter.openingId);
    activeChips.push({
      key: 'opening',
      label: `${t('library_page.filter_opening')}: ${cat ? t(cat.nameKey) : filter.openingId}`,
      onClear: () => updateFilter({ openingId: 'all' }),
    });
  }
  for (const selectedTagId of selectedFilterTagIds) {
    activeChips.push({
      key: `tag-${selectedTagId}`,
      label: `#${tagNameById.get(selectedTagId) ?? selectedTagId}`,
      onClear: () =>
        updateFilter({
          tagId: 'all',
          tagIds: selectedFilterTagIds.filter((id) => id !== selectedTagId),
        }),
    });
  }
  if (filter.analysisStatus !== 'all') {
    activeChips.push({
      key: 'analysis',
      label: `${t('library_page.filter_analysis')}: ${filter.analysisStatus}`,
      onClear: () => updateFilter({ analysisStatus: 'all' }),
    });
  }
  if (filter.reviewStatus !== 'all') {
    activeChips.push({
      key: 'review',
      label: `${t('library_page.filter_review')}: ${filter.reviewStatus}`,
      onClear: () => updateFilter({ reviewStatus: 'all' }),
    });
  }
  if (filter.source !== 'all') {
    activeChips.push({
      key: 'source',
      label: `${t('library_page.filter_source')}: ${filter.source}`,
      onClear: () => updateFilter({ source: 'all' }),
    });
  }
  if (filter.favoriteOnly) {
    activeChips.push({
      key: 'favorite',
      label: `★ ${t('library_page.filter_favorite_only')}`,
      onClear: () => updateFilter({ favoriteOnly: false }),
    });
  }
  if (filter.folderPath && filter.folderPath.trim()) {
    const isUncat = filter.folderPath === UNCATEGORIZED_FOLDER_KEY;
    activeChips.push({
      key: 'folderPath',
      label: `📁 ${isUncat ? t('library_page.folders.uncategorized') : filter.folderPath}`,
      onClear: () => updateFilter({ folderPath: '' }),
    });
  }
  for (const rule of filter.rules ?? []) {
    const validVals = rule.values.filter((v) => v.length > 0);
    if (validVals.length === 0) continue;
    const fieldLabel = getFilterRuleFieldLabel(rule.field, t);
    const valLabels = validVals
      .map((v) => getFilterRuleValueLabel(rule.field, v, t, tagNameById))
      .join(', ');
    const opPrefix =
      rule.operator === 'not_in'
        ? 'NOT '
        : rule.operator === 'all'
          ? 'AND '
          : '';
    activeChips.push({
      key: `rule-${rule.id}`,
      label: `${fieldLabel}: ${opPrefix}${valLabels}`,
      onClear: () =>
        updateFilter({
          rules: (filter.rules ?? []).filter((r) => r.id !== rule.id),
        }),
    });
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900/95 backdrop-blur px-4 sm:px-6 py-3">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleGoBack}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition"
              >
                ← {t('common.back')}
              </button>
              <Link
                to="/"
                title={t('common.home')}
                aria-label={t('common.home')}
                className="hidden md:inline-flex px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition"
              >
                🏠
              </Link>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>📚</span>
                <span>{t('library_page.title')}</span>
                <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-slate-700">
                  {t('library_page.filtered_count', {
                    filtered: filteredRecords.length,
                    total: records.length,
                  })}
                </span>
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block">
                {t('library_page.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTagDictOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-amber-300 hover:bg-slate-700 text-xs font-semibold transition flex items-center gap-1 whitespace-nowrap"
              title={t('library_page.tag_dict_title')}
              aria-label={t('library_page.tag_dict_title')}
            >
              <span>🏷️</span>
              <span className="hidden md:inline">{t('library_page.tag_dict_button')}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowTrash((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1 whitespace-nowrap ${
                showTrash
                  ? 'bg-rose-900/60 border-rose-500/60 text-rose-200'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
              title={t('library_page.show_trash_title', 'ゴミ箱を表示')}
              aria-label={t('library_page.show_trash_title', 'ゴミ箱を表示')}
            >
              <span>🗑️</span>
              <span className="hidden md:inline">
                {t('library_page.trash_btn', { count: trashCount, defaultValue: `ゴミ箱 (${trashCount})` })}
              </span>
            </button>
            <Link
              to="/studio"
              className="hidden md:inline-flex px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold border border-slate-700 transition"
            >
              ✨ {t('nav.studio', '検討盤面')}
            </Link>
            <Link
              to="/tactics"
              className="hidden md:inline-flex px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
            >
              📁 {t('studio.header.tactics_library', '定跡一覧')}
            </Link>
            <Link
              to="/players"
              className="hidden md:inline-flex px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
            >
              🏯 {t('players_page.nav_label')}
            </Link>
            <Link
              to="/studio?editPosition=new"
              className="hidden md:inline-flex px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition"
            >
              ＋ {t('library_page.new_position_edit_btn')}
            </Link>
            <Link
              to="/studio?library=true&tab=import"
              className="hidden md:inline-flex px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold shadow transition"
            >
              📥 {t('library_page.import_kifu_btn')}
            </Link>
            {externalKifuDbHref && (
              <a
                href={externalKifuDbHref}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 text-xs font-semibold items-center gap-1 transition"
                title={
                  settings.externalKifuDbLabel?.trim() ||
                  t('library_page.external_kifu_db_btn')
                }
              >
                <span>🌐</span>
                <span className="hidden xl:inline">
                  {settings.externalKifuDbLabel?.trim() ||
                    t('library_page.external_kifu_db_btn')}
                </span>
                <span>↗</span>
              </a>
            )}
            <button
              type="button"
              onClick={handleCloudSyncAndRefresh}
              disabled={isCloudSyncing}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-600/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
              title={t('studio.kifu_mgmt.cloud_sync_title', 'クラウド最新解析結果を受信・同期して再読み込み')}
            >
              <span className={isCloudSyncing ? 'animate-spin' : ''}>🔄</span>
              <span className="hidden sm:inline">{t('studio.kifu_mgmt.cloud_sync_btn', 'クラウド同期')}</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/guide/library')}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition"
              title={t('guide.title')}
              aria-label={t('guide.title')}
            >
              ❓
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 space-y-4">
        {/* Top-level Game Kind & Content Section Tabs (Issue #72 / #140 / #176) */}
        <div
          role="tablist"
          aria-label={t('library_page.filter_game_kind')}
          className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 pb-3"
        >
          {(
            [
              { id: 'all', icon: '📚', label: t('library_page.tab_all'), count: gameKindCounts.all },
              { id: 'pro', icon: '🏯', label: t('library_page.game_kind_pro'), count: gameKindCounts.pro },
              { id: 'ladies', icon: '🌸', label: t('library_page.game_kind_ladies'), count: gameKindCounts.ladies },
              { id: 'amateur', icon: '🎓', label: t('library_page.game_kind_amateur'), count: gameKindCounts.amateur },
              { id: 'self', icon: '👤', label: t('library_page.game_kind_self'), count: gameKindCounts.self },
            ] as const
          ).map((tab) => {
            const active = activeSection === 'kifu' && filter.gameKind === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleSelectGameKindTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  active
                    ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm'
                    : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    active
                      ? 'bg-amber-500/25 text-amber-200'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}

          <span className="h-5 w-px bg-slate-700 mx-1 hidden sm:inline" />

          {(
            [
              {
                id: 'joseki',
                icon: '📖',
                label: t('library_page.game_kind_joseki'),
                count: gameKindCounts.joseki,
                activeCls: 'bg-indigo-500/20 border-indigo-400/60 text-indigo-200 shadow-sm',
                hoverCls: 'hover:text-indigo-200 hover:border-indigo-700/60',
                badgeCls: 'bg-indigo-500/30 text-indigo-100',
              },
              {
                id: 'other',
                icon: '🌳',
                label: t('library_page.game_kind_other'),
                count: gameKindCounts.other,
                activeCls: 'bg-sky-500/20 border-sky-400/60 text-sky-200 shadow-sm',
                hoverCls: 'hover:text-sky-200 hover:border-sky-700/60',
                badgeCls: 'bg-sky-500/30 text-sky-100',
              },
            ] as const
          ).map((tab) => {
            const active = activeSection === 'kifu' && filter.gameKind === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleSelectGameKindTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  active ? tab.activeCls : `bg-slate-900/70 border-slate-800 text-slate-400 ${tab.hoverCls}`
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    active ? tab.badgeCls : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}

          <span className="h-5 w-px bg-slate-700 mx-1 hidden sm:inline" />

          <button
            key="tsumego-tab"
            type="button"
            role="tab"
            aria-selected={activeSection === 'tsumego'}
            onClick={() => setActiveSection('tsumego')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              activeSection === 'tsumego'
                ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200 shadow-sm'
                : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-emerald-200 hover:border-emerald-700/60'
            }`}
          >
            <span>🧩</span>
            <span>{t('library_page.tab_tsumego')}</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeSection === 'tsumego'
                  ? 'bg-emerald-500/30 text-emerald-100'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {tsumegoProblems.length}
            </span>
          </button>

          <button
            key="quiz-tab"
            type="button"
            role="tab"
            aria-selected={activeSection === 'quiz'}
            onClick={() => setActiveSection('quiz')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              activeSection === 'quiz'
                ? 'bg-violet-500/20 border-violet-400/60 text-violet-200 shadow-sm'
                : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-violet-200 hover:border-violet-700/60'
            }`}
          >
            <span>🎯</span>
            <span>{t('library_page.tab_quiz')}</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeSection === 'quiz'
                  ? 'bg-violet-500/30 text-violet-100'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {quizCards.length}
            </span>
          </button>

          <button
            key="diagrams-tab"
            type="button"
            role="tab"
            aria-selected={activeSection === 'diagrams'}
            onClick={() => setActiveSection('diagrams')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              activeSection === 'diagrams'
                ? 'bg-amber-500/20 border-amber-400/60 text-amber-200 shadow-sm'
                : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-amber-200 hover:border-amber-700/60'
            }`}
          >
            <span>📐</span>
            <span>{t('library_page.tab_diagrams')}</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeSection === 'diagrams'
                  ? 'bg-amber-500/30 text-amber-100'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {diagrams.length}
            </span>
          </button>
        </div>

        {cloudNotice && (
          <div className="rounded-xl border border-sky-500/40 bg-sky-950/30 px-4 py-2.5 flex items-center justify-between gap-2 text-xs text-sky-200">
            <span>{cloudNotice}</span>
            <button
              type="button"
              onClick={() => setCloudNotice(null)}
              className="text-sky-400 hover:text-sky-200"
            >
              ✕
            </button>
          </div>
        )}

        {activeSection === 'tsumego' ? (
          <LibraryTsumegoTab
            problems={tsumegoProblems}
            onRefresh={refreshRecords}
            onNotice={showLibraryNotice}
          />
        ) : activeSection === 'quiz' ? (
          <LibraryQuizTab
            cards={quizCards}
            records={records}
            onRefresh={refreshRecords}
            onNotice={showLibraryNotice}
          />
        ) : activeSection === 'diagrams' ? (
          <LibraryDiagramTab
            diagrams={diagrams}
            onRefresh={refreshRecords}
            onNotice={showLibraryNotice}
          />
        ) : (
        <>
        <MyFilterBar
          presets={kifuPresets}
          activePresetId={activeMyFilterId}
          onSelectPreset={handleSelectMyFilter}
          onSavePreset={handleSaveMyFilter}
          onDeletePreset={handleDeleteMyFilter}
        />

        {/* S1 Search + S2 Filter Toggle + S3 Sort + S4 View Toggle */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <input
                type="text"
                value={filter.query}
                onChange={(e) => updateFilter({ query: e.target.value })}
                placeholder={t('library_page.search_placeholder')}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <button
              type="button"
              onClick={() => updateFilter({ favoriteOnly: !filter.favoriteOnly })}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                filter.favoriteOnly
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-600'
              }`}
            >
              ★ {t('library_page.filter_favorite_only')}
            </button>

            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                showFilters || activeFilterCount > 0
                  ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                  : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-600'
              }`}
            >
              🎛️ {t('library_page.filter_toggle')}
              {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>

            <button
              type="button"
              onClick={toggleFolderSidebar}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
                showFolderSidebar || (filter.folderPath && filter.folderPath.trim())
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-600'
              }`}
            >
              📁 {t('library_page.folder_sidebar_btn')}
            </button>

            {/* S3 Sort selector */}
            <div className="flex items-center gap-1">
              <select
                value={sortField}
                onChange={(e) => {
                  setSortField(e.target.value as LibrarySortField);
                  setActiveMyFilterId(null);
                }}
                aria-label={t('library_page.sort_label')}
                className="rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="updatedAt">{t('library_page.col_updated')}</option>
                <option value="matchDate">{t('library_page.col_date')}</option>
                <option value="title">{t('library_page.col_title')}</option>
                <option value="totalPlies">{t('library_page.col_plies')}</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
                  setActiveMyFilterId(null);
                }}
                className="px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-300 hover:text-amber-300"
                title={sortDirection}
              >
                {sortDirection === 'asc' ? '▲' : '▼'}
              </button>
            </div>

            {/* S4 View Mode Toggle */}
            <div className="hidden md:inline-flex rounded-lg border border-slate-700 bg-slate-950 p-0.5">
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

          {/* S2 Structured Filter Rule Builder */}
          {showFilters && (
            <KifuFilterRuleBuilder
              rules={filter.rules ?? []}
              combinator={filter.ruleCombinator ?? 'and'}
              tagRegistry={tagRegistry}
              groupedTags={groupedTags}
              onChangeRules={(nextRules: KifuFilterRule[]) =>
                updateFilter({ rules: nextRules })
              }
              onChangeCombinator={(nextCombinator: FilterRuleCombinator) =>
                updateFilter({ ruleCombinator: nextCombinator })
              }
              onClearAll={() =>
                updateFilter({ rules: [], ruleCombinator: 'and' })
              }
            />
          )}

          {/* S5 Active Filter Chips */}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/80">
              {activeChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onClear}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-200 text-[11px] hover:bg-amber-500/25 transition"
                >
                  <span>{chip.label}</span>
                  <span className="text-amber-400">✕</span>
                </button>
              ))}
              <button
                type="button"
                onClick={resetFilters}
                className="text-[11px] text-slate-400 hover:text-slate-200 underline ml-1"
              >
                {t('library_page.filter_clear')}
              </button>
            </div>
          )}
        </section>

        {/* Bulk Action Bar (Issue #68) */}
        {selectedIds.size > 0 && (
          <section
            data-testid="bulk-action-bar"
            className="rounded-xl border border-amber-500/40 bg-amber-950/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-amber-300">
                {t('library_page.bulk_selected', { count: selectedIds.size })}
              </span>
              {selectedIds.size < sortedRecords.length && (
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  {t('library_page.bulk_select_all_filtered', {
                    count: sortedRecords.length,
                  })}
                </button>
              )}
              <button
                type="button"
                onClick={clearSelection}
                className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-700 transition"
              >
                {t('library_page.bulk_clear_selection')}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={bulkTagId}
                onChange={(e) => setBulkTagId(e.target.value)}
                aria-label={t('library_page.bulk_tag_placeholder')}
                className="rounded bg-slate-950 border border-slate-700 px-2 py-1 text-slate-200"
              >
                <option value="">
                  {t('library_page.bulk_tag_placeholder')}
                </option>
                {tagRegistry.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    #{tag.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!bulkTagId}
                onClick={handleBulkAssignTag}
                className="px-2 py-1 rounded bg-sky-600/80 hover:bg-sky-500 disabled:opacity-40 text-white font-semibold transition"
              >
                {t('library_page.bulk_add_tag')}
              </button>
              <button
                type="button"
                disabled={!bulkTagId}
                onClick={handleBulkRemoveTag}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 transition"
              >
                {t('library_page.bulk_remove_tag')}
              </button>

              <span className="h-4 w-px bg-slate-700 mx-0.5" />

              <button
                type="button"
                onClick={() => handleBulkFavorite(true)}
                className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 transition"
              >
                ★ {t('library_page.bulk_fav_on')}
              </button>
              <button
                type="button"
                onClick={() => handleBulkFavorite(false)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              >
                ☆ {t('library_page.bulk_fav_off')}
              </button>

              <button
                type="button"
                onClick={handleBulkExportBundle}
                className="px-2 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/30 transition"
              >
                {t('library_page.bulk_export_bundle')}
              </button>

              <span className="h-4 w-px bg-slate-700 mx-0.5" />

              <select
                value={cloudLevel}
                onChange={(e) =>
                  setCloudLevel(e.target.value as CloudAnalysisLevel)
                }
                className="rounded bg-slate-950 border border-slate-700 px-1.5 py-1 text-slate-200"
              >
                <option value="light">
                  {t('library_page.cloud_level_light')}
                </option>
                <option value="standard">
                  {t('library_page.cloud_level_standard')}
                </option>
                <option value="deep">
                  {t('library_page.cloud_level_deep')}
                </option>
              </select>
              <label className="inline-flex items-center gap-1 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cloudForceReanalyze}
                  onChange={(e) => setCloudForceReanalyze(e.target.checked)}
                  className="rounded border-slate-600 bg-slate-950 text-sky-500"
                />
                <span>{t('library_page.bulk_cloud_force')}</span>
              </label>
              <button
                type="button"
                disabled={isQueuingCloud}
                onClick={() => void handleBulkCloudAnalyze()}
                className="px-2 py-1 rounded bg-sky-600/80 hover:bg-sky-500 disabled:opacity-40 text-white font-semibold transition"
              >
                {t('library_page.bulk_cloud_analyze')}
              </button>

              <button
                type="button"
                onClick={() => void handleBulkDelete()}
                className="px-2 py-1 rounded bg-rose-600/80 hover:bg-rose-500 text-white font-semibold transition"
              >
                {t('library_page.bulk_delete')}
              </button>
            </div>
          </section>
        )}

        {/* Folder Tree Sidebar + Records List */}
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          {showFolderSidebar && (
            <VirtualFolderTreeSidebar
              roots={folderTree.roots}
              uncategorizedCount={folderTree.uncategorizedCount}
              totalCount={folderVisibleTotalCount}
              selectedFolderPath={filter.folderPath ?? ''}
              onSelectFolder={(fp) => updateFilter({ folderPath: fp })}
              onClose={toggleFolderSidebar}
            />
          )}

          <div className="flex-1 min-w-0 w-full space-y-4">
        {/* Records List */}
        {records.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center text-sm text-slate-400">
            {t('library_page.empty')}
          </div>
        ) : sortedRecords.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-12 text-center text-sm text-slate-400 space-y-3">
            <div>{t('library_page.no_matches')}</div>
            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold"
            >
              {t('library_page.filter_clear')}
            </button>
          </div>
        ) : effectiveViewMode === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pagedRecords.map((rec) => (
              <div
                key={rec.id}
                className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col justify-between gap-3 hover:border-slate-700 transition"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(rec.id)}
                      onChange={() => toggleSelectOne(rec.id)}
                      aria-label={rec.title}
                      className="mt-1 rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-500 cursor-pointer"
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => handleOpenInStudio(rec)}
                        className="font-semibold text-sm text-slate-100 hover:text-amber-300 hover:underline text-left truncate block w-full"
                        title={t('library_page.open_in_studio_title', 'クリックして検討盤面で開く')}
                      >
                        {rec.title}
                      </button>
                      <div className="text-[11px] text-slate-400 truncate">
                        {rec.openingName} · {formatDateLabel(rec.matchDate || rec.createdAt)} ·{' '}
                        {rec.totalPlies}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleFavorite(rec)}
                      className={`text-base ${
                        rec.favorite ? 'text-amber-400' : 'text-slate-600 hover:text-amber-300'
                      }`}
                    >
                      {rec.favorite ? '★' : '☆'}
                    </button>
                  </div>
                  <div className="text-xs text-slate-300">
                    {(() => {
                      const kind = resolveGameKind(rec);
                      if (
                        (kind === 'joseki' || kind === 'other') &&
                        isGenericPlaceholderPlayerName(rec.senteName) &&
                        isGenericPlaceholderPlayerName(rec.goteName)
                      ) {
                        return kind === 'joseki' ? (
                          <span className="text-indigo-300 font-medium">
                            📖 {t('library_page.joseki_record_badge')}
                          </span>
                        ) : (
                          <span className="text-sky-300 font-medium">
                            🌳 {t('library_page.study_record_badge')}
                          </span>
                        );
                      }
                      return (
                        <span>
                          ▲ {rec.senteName} vs △ {rec.goteName}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {renderWinnerBadge(rec.winner, false, resolveGameKind(rec))}
                    {renderAnalysisBadge(rec)}
                  </div>
                  {rec.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {rec.tags.slice(0, 5).map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px]"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={
                        isQueuingCloud ||
                        rec.analysisStatus === 'queued' ||
                        rec.analysisStatus === 'processing'
                      }
                      onClick={() => void handleSingleCloudAnalyze(rec)}
                      className="px-2 py-0.5 rounded text-[10px] bg-sky-950/60 hover:bg-sky-900 disabled:opacity-40 text-sky-300 border border-sky-500/30"
                      title={t('library_page.action_cloud_analyze')}
                    >
                      ☁️
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetadataEditorRecordId(rec.id)}
                      className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-sky-300"
                      title={t('library_page.action_edit_metadata')}
                    >
                      📝
                    </button>
                    <button
                      type="button"
                      onClick={() => setTagEditorRecordId(rec.id)}
                      className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-amber-300"
                      title={t('library_page.action_edit_tags')}
                    >
                      🏷️
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExportKif(rec)}
                      className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300"
                    >
                      {t('library_page.action_export_kif')}
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    {(resolveGameKind(rec) === 'joseki' || resolveGameKind(rec) === 'other') && (
                      <button
                        type="button"
                        onClick={() => handleOpenTacticNote(rec)}
                        className="px-2 py-1 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold"
                        title={t('library_page.open_tactic_note')}
                      >
                        📖
                      </button>
                    )}
                    {(isCustomPositionRecord(rec) || rec.totalPlies === 0) && (
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/studio?editPosition=1&gameId=${encodeURIComponent(rec.id)}`)
                        }
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-[11px] font-semibold"
                        title={t('library_page.action_edit_position')}
                      >
                        🛠️
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenInStudio(rec)}
                      className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-semibold"
                    >
                      {t('library_page.go_studio')}
                    </button>
                    {showTrash && (
                      <button
                        type="button"
                        onClick={() => handleRestore(rec)}
                        className="px-2 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold"
                        title={t('library_page.restore_btn', '元に戻す')}
                      >
                        ♻️ {t('library_page.restore_btn', '元に戻す')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDelete(rec)}
                      className="px-1.5 py-1 rounded text-rose-400 hover:bg-rose-950/40 text-xs"
                      title={showTrash ? '完全削除' : t('library_page.action_delete')}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-x-auto shadow-lg">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="px-3 py-3 text-center w-8">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectPage}
                      aria-label={t('library_page.bulk_select_all_filtered', {
                        count: pagedRecords.length,
                      })}
                      className="rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-2 py-2.5 text-center w-8">★</th>
                  <th
                    className="px-2.5 py-2.5 cursor-pointer hover:text-slate-200 select-none whitespace-nowrap"
                    onClick={() => handleSort('title')}
                  >
                    {t('library_page.col_title')}
                    {renderSortIndicator('title')}
                  </th>
                  <th
                    className="px-2 py-2.5 cursor-pointer hover:text-slate-200 select-none whitespace-nowrap"
                    onClick={() => handleSort('matchDate')}
                  >
                    {t('library_page.col_date')}
                    {renderSortIndicator('matchDate')}
                  </th>
                  <th className="px-2.5 py-2.5 whitespace-nowrap">{t('library_page.col_players')}</th>
                  <th className="px-2 py-2.5 text-center whitespace-nowrap">{t('library_page.col_winner')}</th>
                  <th
                    className="px-2 py-2.5 text-center cursor-pointer hover:text-slate-200 select-none whitespace-nowrap"
                    onClick={() => handleSort('totalPlies')}
                  >
                    {t('library_page.col_plies')}
                    {renderSortIndicator('totalPlies')}
                  </th>
                  <th className="px-2.5 py-2.5 whitespace-nowrap">{t('library_page.col_tags')}</th>
                  <th className="px-2 py-2.5 text-center whitespace-nowrap">{t('library_page.col_analysis')}</th>
                  <th
                    className="px-2 py-2.5 cursor-pointer hover:text-slate-200 select-none whitespace-nowrap"
                    onClick={() => handleSort('updatedAt')}
                  >
                    {t('library_page.col_updated')}
                    {renderSortIndicator('updatedAt')}
                  </th>
                  <th className="px-2.5 py-2.5 text-right whitespace-nowrap">{t('library_page.col_actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs">
                {pagedRecords.map((rec) => (
                  <tr
                    key={rec.id}
                    className="hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-2 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(rec.id)}
                        onChange={() => toggleSelectOne(rec.id)}
                        aria-label={rec.title}
                        className="rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleFavorite(rec)}
                        className={`text-sm transition ${
                          rec.favorite
                            ? 'text-amber-400'
                            : 'text-slate-600 hover:text-amber-300'
                        }`}
                        title={t('library_page.col_favorite')}
                      >
                        {rec.favorite ? '★' : '☆'}
                      </button>
                    </td>
                    <td className="px-2.5 py-2.5 max-w-[200px]">
                      {editingId === rec.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCommitRename(rec.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="w-full rounded bg-slate-950 border border-amber-500 px-2 py-0.5 text-xs text-slate-100"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleCommitRename(rec.id)}
                            className="px-1.5 py-0.5 rounded bg-amber-600 text-slate-950 font-bold"
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => handleOpenInStudio(rec)}
                            className="font-semibold text-slate-100 hover:text-amber-300 hover:underline text-left truncate flex items-center gap-1 group"
                            title={t('library_page.open_in_studio_title', 'クリックして検討盤面で開く')}
                          >
                            <span className="truncate">{rec.title}</span>
                            <span className="text-[10px] text-amber-400/80 group-hover:text-amber-300 shrink-0">↗</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartRename(rec)}
                            className="text-[11px] text-slate-500 hover:text-amber-300 shrink-0"
                            title={t('library_page.action_rename')}
                          >
                            ✏️
                          </button>
                        </div>
                      )}
                      <div className="text-[11px] text-slate-400 truncate">
                        {rec.openingName}
                        {rec.tournament ? ` · ${rec.tournament}` : ''}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-slate-300 font-mono whitespace-nowrap">
                      {formatDateLabel(rec.matchDate || rec.createdAt)}
                    </td>
                    <td className="px-2.5 py-2.5 max-w-[140px]">
                      {(() => {
                        const kind = resolveGameKind(rec);
                        const isPlaceholderPlayers =
                          isGenericPlaceholderPlayerName(rec.senteName) &&
                          isGenericPlaceholderPlayerName(rec.goteName);
                        if ((kind === 'joseki' || kind === 'other') && isPlaceholderPlayers) {
                          return (
                            <div className="space-y-0.5">
                              {kind === 'joseki' ? (
                                <span className="inline-flex items-center gap-1 text-indigo-300 font-medium text-[11px]">
                                  📖 {t('library_page.joseki_record_badge')}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-sky-300 font-medium text-[11px]">
                                  🌳 {t('library_page.study_record_badge')}
                                </span>
                              )}
                              {rec.notes && (
                                <div className="text-[10px] text-slate-400 truncate">
                                  {rec.notes}
                                </div>
                              )}
                            </div>
                          );
                        }
                        return (
                          <>
                            <div className="text-slate-200 truncate">▲ {rec.senteName}</div>
                            <div className="text-slate-400 truncate">△ {rec.goteName}</div>
                            {kind !== 'other' &&
                              kind !== 'joseki' &&
                              (!rec.sentePlayerId || !rec.gotePlayerId) && (
                                <Link
                                  to="/players"
                                  className="inline-block mt-0.5 text-[10px] text-sky-400 hover:text-sky-300 underline"
                                >
                                  👤 {t('library_page.register_player_hint')}
                                </Link>
                              )}
                          </>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-2.5 text-center whitespace-nowrap">
                      {renderWinnerBadge(rec.winner, true, resolveGameKind(rec))}
                    </td>
                    <td className="px-2 py-2.5 text-center font-mono text-slate-300 whitespace-nowrap">
                      {rec.totalPlies}
                    </td>
                    <td className="px-2.5 py-2.5 max-w-[160px]">
                      <div className="flex flex-wrap gap-1">
                        {rec.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px] whitespace-nowrap"
                          >
                            #{tag}
                          </span>
                        ))}
                        {rec.tags.length > 3 && (
                          <span className="text-[10px] text-slate-500 whitespace-nowrap">
                            +{rec.tags.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-center whitespace-nowrap">
                      {renderAnalysisBadge(rec)}
                    </td>
                    <td className="px-2 py-2.5 text-slate-400 font-mono whitespace-nowrap leading-tight">
                      {(() => {
                        const dt = formatDateTimeLabel(rec.updatedAt);
                        const [dPart, tPart] = dt.split(' ');
                        return (
                          <div className="flex flex-col">
                            <span>{dPart}</span>
                            {tPart && (
                              <span className="text-[10px] text-slate-500">
                                {tPart}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-2.5 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex flex-col items-end gap-1">
                        <div className="inline-flex items-center gap-1">
                          {(resolveGameKind(rec) === 'joseki' || resolveGameKind(rec) === 'other') && (
                            <button
                              type="button"
                              onClick={() => handleOpenTacticNote(rec)}
                              className="px-2 py-0.5 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold transition"
                              title={t('library_page.open_tactic_note')}
                            >
                              📖
                            </button>
                          )}
                          {(isCustomPositionRecord(rec) || rec.totalPlies === 0) && (
                            <button
                              type="button"
                              onClick={() =>
                                navigate(`/studio?editPosition=1&gameId=${encodeURIComponent(rec.id)}`)
                              }
                              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 text-[11px] font-semibold transition"
                              title={t('library_page.action_edit_position')}
                            >
                              🛠️
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenInStudio(rec)}
                            className="px-2 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-semibold transition"
                            title={t('library_page.open_studio')}
                          >
                            {t('library_page.go_studio')}
                          </button>
                        </div>
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={
                              isQueuingCloud ||
                              rec.analysisStatus === 'queued' ||
                              rec.analysisStatus === 'processing'
                            }
                            onClick={() => void handleSingleCloudAnalyze(rec)}
                            className="px-1.5 py-0.5 rounded bg-sky-950/60 hover:bg-sky-900 disabled:opacity-40 text-sky-300 border border-sky-500/30 text-[10px]"
                            title={t('library_page.action_cloud_analyze')}
                          >
                            ☁️
                          </button>
                          <button
                            type="button"
                            onClick={() => setMetadataEditorRecordId(rec.id)}
                            className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 text-[10px]"
                            title={t('library_page.action_edit_metadata')}
                          >
                            📝
                          </button>
                          <button
                            type="button"
                            onClick={() => setTagEditorRecordId(rec.id)}
                            className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px]"
                            title={t('library_page.action_edit_tags')}
                          >
                            🏷️
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleExportKif(rec)}
                            className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                            title={t('library_page.action_export_kif')}
                          >
                            ⬇
                          </button>
                          {showTrash && (
                            <button
                              type="button"
                              onClick={() => handleRestore(rec)}
                              className="px-1.5 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold"
                              title={t('library_page.restore_btn', '元に戻す')}
                            >
                              ♻️ {t('library_page.restore_btn', '元に戻す')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleDelete(rec)}
                            className="px-1.5 py-0.5 rounded text-rose-400 hover:bg-rose-950/40 text-xs transition"
                            title={showTrash ? '完全削除' : t('library_page.action_delete')}
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
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
          </div>
        </div>
        </>
        )}
      </main>

      <RecordTagEditorModal
        record={tagEditorRecord}
        isOpen={tagEditorRecord !== null}
        onClose={() => setTagEditorRecordId(null)}
        onUpdated={refreshRecords}
        onOpenTagDictionary={() => {
          setTagEditorRecordId(null);
          setTagDictOpen(true);
        }}
      />

      <RecordMetadataEditorModal
        record={metadataEditorRecord}
        isOpen={metadataEditorRecord !== null}
        existingFolderPaths={folderTree.allFolderPaths}
        onClose={() => setMetadataEditorRecordId(null)}
        onUpdated={refreshRecords}
      />

      {tagDictOpen && (
        <TagDictionaryModal
          records={records}
          onClose={() => setTagDictOpen(false)}
          onChanged={refreshRecords}
        />
      )}
    </div>
  );
};
