/**
 * Unified Studio Kifu Management Modal Component.
 * Integrates:
 * 1. Library List (browse saved games, inline edit title/tags, filter by tags, open, delete)
 * 2. Ingest / Import (paste text or drag & drop file, editable title/tags, live preview, auto-save & open)
 * 3. Save / Update Current Study (overwrite current game or save as new variation, interactive tag creation)
 * Follows Rule 1: strictly English code, comments, and identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { JKFPlayer } from 'json-kifu-format';
import { decodeKifBuffer } from '../../utils/encoding';
import {
  SavedStudioGame,
  deleteStudioGame,
  generateGameTitle,
  loadSavedStudioGames,
  saveStudioGame,
  migrateExistingGamesPlayers,
  loadStructuredTagGroups,
  addCustomTagToCategory,
  detectGameWinner,
  getTreeBranchStats,
  TagCategoryGroup,
} from '../../utils/studioKifuStorage';
import { CategorizedTagCombobox } from './CategorizedTagCombobox';
import { filterTagGroupsByGameKind } from '../../types/tagRegistry';
import { ShogiPlayerProfile } from '../../types/player';
import {
  inferAutoKifuTags,
  reclassifyAiPlayersAndSyncRecords,
  reclassifyRecordsForPlayer,
} from '../../utils/gameKindClassifier';
import {
  isProtectedPlayerProfile,
  loadPlayerProfiles,
  resolveOrRegisterPlayer,
  upsertPlayerProfile,
  deletePlayerProfile,
  findMatchingPlayer,
  registerNewPlayer,
} from '../../utils/playerStorage';

import {
  EngineId,
  EngineProfile,
  getAllEngineProfiles,
  resolveEngineDisplayName,
} from '../../engine/engineConfig';
import { useAuth } from '../../hooks/useAuth';
import {
  uploadKifuRecordToFirestore,
  deleteKifuRecordFromFirestore,
  uploadPlayerToFirestore,
  deletePlayerFromFirestore,
  queueKifuRecordForCloudAnalysis,
  canQueueRecordForCloudAnalysis,
  isCloudAnalyzedRecord,
  CLOUD_ANALYSIS_ENGINE_ID,
} from '../../services/firestoreKifuSync';
import {
  CloudAnalysisLevel,
  KifuGameKind,
  KifuRecord,
} from '../../types/kifuRecord';
import {
  findDuplicateKifuRecords,
  mergeTagsIntoExistingRecord,
} from '../../utils/kifuDuplicateDetector';
import { kifuRecordToStudioGame } from '../../utils/kifuRecordCodec';
import { loadKifuRecords } from '../../utils/kifuRecordStorage';
import { computeKifuRecordContentHash } from '../../utils/kifuContentHash';
import { DuplicateKifuDialog } from './DuplicateKifuDialog';
import {
  BulkAnalysisTarget,
  BulkImportReviewPanel,
  BulkReviewItem,
} from './BulkImportReviewPanel';
import { useSettings } from '../../contexts/SettingsContext';

export interface BatchAnalysisProgressInfo {
  gameIndex: number;
  totalGames: number;
  gameTitle: string;
  currentPly: number;
  totalPlies: number;
  engineName: string;
}

export interface StudioKifuManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenGame: (game: SavedStudioGame) => void;
  activeGameId: string | null;
  currentGameData?: {
    senteName: string;
    goteName: string;
    tournament?: string;
    openingName: string;
    totalPlies: number;
    forkCount: number;
    jkfJson: string;
    rawKif?: string;
  };
  onBatchAnalyzeGames?: (gameIds: string[], depth: number, engineId?: EngineId, forceRestart?: boolean) => Promise<void>;
  isEngineAnalyzing?: boolean;
  availableEngines?: EngineProfile[];
  activeEngineId?: EngineId;
  batchProgress?: BatchAnalysisProgressInfo | null;
  onCancelBatchAnalysis?: () => void;
  initialTab?: 'library' | 'import' | 'save' | 'players';
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
9 ２四歩(25)   ( 0:03/00:00:06)
10 同　歩(23)   ( 0:01/00:00:07)
11 同　飛(28)   ( 0:01/00:00:07)
12 ８六歩(85)   ( 0:02/00:00:09)
13 同　歩(87)   ( 0:01/00:00:08)
14 同　飛(82)   ( 0:01/00:00:10)
`.trim();

function tryParseKifu(text: string): { player: JKFPlayer | null; error: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { player: null, error: null };

  try {
    const json = JSON.parse(trimmed);
    if (json.moves || json.header) {
      return { player: new JKFPlayer(json), error: null };
    }
  } catch {
    // Continue
  }

  try {
    return { player: JKFPlayer.parseKIF(trimmed), error: null };
  } catch {
    // Continue
  }

  try {
    return { player: JKFPlayer.parseCSA(trimmed), error: null };
  } catch {
    // Continue
  }

  try {
    return { player: JKFPlayer.parseKI2(trimmed), error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return { player: null, error: msg };
  }
}

export const StudioKifuManagementModal: React.FC<StudioKifuManagementModalProps> = ({
  isOpen,
  onClose,
  onOpenGame,
  activeGameId,
  currentGameData,
  onBatchAnalyzeGames,
  isEngineAnalyzing = false,
  availableEngines = getAllEngineProfiles(),
  activeEngineId = 'fairy-stockfish',
  batchProgress = null,
  onCancelBatchAnalysis,
  initialTab,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<'library' | 'import' | 'save' | 'players'>(
    initialTab ?? 'import'
  );

  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Batch Selection State
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>([]);
  const [batchDepth, setBatchDepth] = useState<number>(settings.defaultAnalysisDepth);
  const [batchEngineId, setBatchEngineId] = useState<EngineId>(activeEngineId);
  const [batchForceRestart, setBatchForceRestart] = useState<boolean>(false);
  const [isExecutingBatch, setIsExecutingBatch] = useState<boolean>(false);
  const [importWithAnalysis, setImportWithAnalysis] = useState<boolean>(true);
  const [importAnalysisTarget, setImportAnalysisTarget] = useState<'local' | 'cloud'>('cloud');
  const [cloudAnalysisLevel, setCloudAnalysisLevel] = useState<CloudAnalysisLevel>('standard');
  const [importAnalysisDepth, setImportAnalysisDepth] = useState<number>(settings.defaultAnalysisDepth);
  const [importAnalysisEngineId, setImportAnalysisEngineId] = useState<EngineId>(activeEngineId);

  // Players state
  const [playerProfiles, setPlayerProfiles] = useState<ShogiPlayerProfile[]>(() => loadPlayerProfiles());
  const [selectedPlayerFilter, setSelectedPlayerFilter] = useState<string | null>(null);

  // New Player Form State in Players Tab
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerCategory, setNewPlayerCategory] = useState<'user' | 'pro' | 'ai'>('user');
  const [newPlayerTitle, setNewPlayerTitle] = useState('');
  const [newPlayerNote, setNewPlayerNote] = useState('');
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [playerCategoryTab, setPlayerCategoryTab] = useState<'all' | 'user' | 'ai' | 'pro'>('all');
  const playerFormRef = useRef<HTMLDivElement | null>(null);

  // Structured Tag Groups state (category-aware)
  const [tagGroups, setTagGroups] = useState<TagCategoryGroup[]>(() => loadStructuredTagGroups());

  // Library state
  const [games, setGames] = useState<SavedStudioGame[]>(() => loadSavedStudioGames());
  const [libraryViewMode, setLibraryViewMode] = useState<'flat' | 'drilldown'>('flat');
  const [drilldownAxis, setDrilldownAxis] = useState<'player' | 'yearMonth' | 'tournament' | 'opening' | 'winner'>('player');
  const [drilldownPlayerCategory, setDrilldownPlayerCategory] = useState<'all' | 'pro' | 'ai' | 'user'>('all');
  const [drilldownTournamentCategory, setDrilldownTournamentCategory] = useState<'all' | 'pro' | 'amateur' | 'other'>('all');
  const [drilldownSelectedGroup, setDrilldownSelectedGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>([]);
  const [winnerFilter, setWinnerFilter] = useState<'all' | 'sente' | 'gote' | 'draw' | 'unknown'>('all');

  // In-line editing in Library list
  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editSentePlayerId, setEditSentePlayerId] = useState<string>('');
  const [editGotePlayerId, setEditGotePlayerId] = useState<string>('');
  const [editWinner, setEditWinner] = useState<'sente' | 'gote' | 'draw' | 'unknown'>('unknown');
  const [confirmDeleteGame, setConfirmDeleteGame] = useState<SavedStudioGame | null>(null);

  // Pending save/import blocked by duplicate detection dialog (#44)
  const [pendingDuplicateSave, setPendingDuplicateSave] = useState<{
    game: SavedStudioGame;
    duplicates: KifuRecord[];
    kind: 'import' | 'saveAsNew';
  } | null>(null);

  // Import state
  const [importText, setImportText] = useState('');
  const lastInitializedKifuRef = useRef<string | null>(null);
  const [detectedEncoding, setDetectedEncoding] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importCustomTitle, setImportCustomTitle] = useState('');
  const [importGameKind, setImportGameKind] = useState<KifuGameKind>('other');
  const [importSelectedTags, setImportSelectedTags] = useState<string[]>(['研究']);
  const [importSentePlayerId, setImportSentePlayerId] = useState<string | null>(null);
  const [importGotePlayerId, setImportGotePlayerId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);
  const bulkDirInputRef = useRef<HTMLInputElement>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkSummary, setBulkSummary] = useState<{
    success: number;
    duplicate: number;
    failed: number;
    failures: { fileName: string; reason: string }[];
    sizeWarning: boolean;
  } | null>(null);
  const [reviewItems, setReviewItems] = useState<BulkReviewItem[] | null>(null);
  const [bulkAnalysisTarget, setBulkAnalysisTarget] = useState<BulkAnalysisTarget>('local');
  const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);

  // Save / Update state
  const [saveTitle, setSaveTitle] = useState('');
  const [saveGameKind, setSaveGameKind] = useState<KifuGameKind>('other');
  const [saveTags, setSaveTags] = useState<string[]>(['研究']);
  const [saveMode, setSaveMode] = useState<'overwrite' | 'new'>('overwrite');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const wasOpenRef = useRef<boolean>(false);

  // Cloud analysis queue state
  const { user } = useAuth();
  const [isCloudQueuing, setIsCloudQueuing] = useState<boolean>(false);
  const [cloudQueueMsg, setCloudQueueMsg] = useState<string | null>(null);

  const activeSavedGame = useMemo(() => {
    if (!activeGameId) return null;
    return games.find((g) => g.id === activeGameId) ?? null;
  }, [activeGameId, games]);

  // Initialize modal state once when opened so user edits (e.g. Save as New) are never overwritten
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) {
      return;
    }
    wasOpenRef.current = true;

    // 1. Backfill player IDs into existing games that lacked them
    migrateExistingGamesPlayers((rawName, defaultCat) => {
      const res = resolveOrRegisterPlayer(rawName, defaultCat);
      return { id: res.profile.id, name: res.profile.name };
    });

    const loadedProfiles = loadPlayerProfiles();
    const loadedGames = loadSavedStudioGames();
    setPlayerProfiles(loadedProfiles);
    setGames(loadedGames);
    setFeedbackMsg(null);
    setEditingGameId(null);

    const matchedSavedGame = activeGameId
      ? loadedGames.find((g) => g.id === activeGameId) ?? null
      : null;

    if (currentGameData) {
      if (matchedSavedGame) {
        setSaveTitle(matchedSavedGame.title);
        setSaveTags(matchedSavedGame.tags || ['研究']);
        setSaveGameKind(
          matchedSavedGame.gameKind ??
            inferAutoKifuTags(
              {
                senteName: matchedSavedGame.senteName,
                goteName: matchedSavedGame.goteName,
                tournament: matchedSavedGame.tournament,
                openingName: matchedSavedGame.openingName,
                sentePlayerId: matchedSavedGame.sentePlayerId,
                gotePlayerId: matchedSavedGame.gotePlayerId,
              },
              loadedProfiles
            ).gameKind
        );
        setSaveMode('overwrite');
      } else {
        const generated = generateGameTitle({
          senteName: currentGameData.senteName,
          goteName: currentGameData.goteName,
          tournament: currentGameData.tournament,
          openingName: currentGameData.openingName,
        });
        setSaveTitle(generated);
        const auto = inferAutoKifuTags(
          {
            senteName: currentGameData.senteName,
            goteName: currentGameData.goteName,
            tournament: currentGameData.tournament,
            openingName: currentGameData.openingName,
          },
          loadedProfiles
        );
        setSaveGameKind(auto.gameKind);
        setSaveTags(auto.tags);
        setSaveMode('new');
      }
    }
  }, [isOpen]);

  // Refresh saved games list during batch analysis progress without resetting save form state
  useEffect(() => {
    if (isOpen && batchProgress?.gameIndex !== undefined) {
      setGames(loadSavedStudioGames());
    }
  }, [isOpen, batchProgress?.gameIndex]);

  const refreshGames = () => {
    setGames(loadSavedStudioGames());
  };

  const kifuRecordsById = useMemo(() => {
    const map = new Map<string, KifuRecord>();
    for (const rec of loadKifuRecords()) {
      map.set(rec.id, rec);
    }
    return map;
  }, [games]);

  const handleQueueCloudAnalysis = async (
    gameIds: string[],
    options: { forceReanalyze?: boolean; level?: CloudAnalysisLevel } = {}
  ): Promise<number> => {
    if (!user?.uid || gameIds.length === 0 || isCloudQueuing) return 0;
    setIsCloudQueuing(true);
    try {
      let queuedCount = 0;
      for (const id of gameIds) {
        const ok = await queueKifuRecordForCloudAnalysis(user.uid, id, {
          forceReanalyze: options.forceReanalyze,
          level: options.level ?? cloudAnalysisLevel,
        });
        if (ok) queuedCount += 1;
      }
      refreshGames();
      setCloudQueueMsg(
        queuedCount > 0
          ? `☁️ ${queuedCount}/${gameIds.length}件をクラウド解析キューに送信しました`
          : options.forceReanalyze
            ? '再解析を送信できませんでした（依頼中または棋譜データ取得・SFEN生成に失敗）'
            : 'クラウド解析に送信できる棋譜がありませんでした（依頼中・SFEN生成不可は除外。解析済みの再解析は「全手再解析」をチェック）'
      );
      setTimeout(() => setCloudQueueMsg(null), 4000);
      return queuedCount;
    } finally {
      setIsCloudQueuing(false);
    }
  };

  // Parse import text preview
  const { player: importPlayer, error: importError } = useMemo(() => {
    return tryParseKifu(importText);
  }, [importText]);

  const importMeta = useMemo(() => {
    if (!importPlayer) return null;
    const header = importPlayer.kifu.header || {};
    const sente = header['先手'] || header['☗'] || '先手';
    const gote = header['後手'] || header['☖'] || '後手';
    const tour = header['棋戦'] || header['棋戦名'] || header['場所'];
    const opening = header['戦型'] || '未分類';
    const date = header['開始日時'] || header['日付'];
    const stats = importPlayer.kifu.moves ? getTreeBranchStats(importPlayer.kifu.moves) : null;
    const totalPlies = stats ? Math.max(stats.longestStreamPlies, importPlayer.getMaxTesuu()) : importPlayer.getMaxTesuu();

    const autoTitle = generateGameTitle({
      senteName: sente,
      goteName: gote,
      tournament: tour,
      openingName: opening,
      date,
    });

    return { sente, gote, tour, opening, date, totalPlies, autoTitle };
  }, [importPlayer]);

  // Whenever a genuinely new kifu is parsed in import tab, set the editable title, initial tags & initial player matches once
  useEffect(() => {
    if (!importText.trim()) {
      lastInitializedKifuRef.current = null;
      return;
    }

    if (importMeta && lastInitializedKifuRef.current !== importText) {
      lastInitializedKifuRef.current = importText;
      setImportCustomTitle(importMeta.autoTitle);

      // Auto-match players first so profile metadata feeds gameKind/tag inference
      const sMatch = findMatchingPlayer(importMeta.sente, playerProfiles);
      setImportSentePlayerId(sMatch.profile ? sMatch.profile.id : null);

      const gMatch = findMatchingPlayer(importMeta.gote, playerProfiles);
      setImportGotePlayerId(gMatch.profile ? gMatch.profile.id : null);

      const auto = inferAutoKifuTags(
        {
          senteName: importMeta.sente,
          goteName: importMeta.gote,
          tournament: importMeta.tour,
          openingName: importMeta.opening,
          sentePlayerId: sMatch.profile?.id,
          gotePlayerId: gMatch.profile?.id,
        },
        playerProfiles
      );
      setImportGameKind(auto.gameKind);
      setImportSelectedTags(auto.tags);
    }
  }, [importText, importMeta, playerProfiles]);

  // Handle Delete Game from library (request confirmation)
  const handleDeleteRequest = (game: SavedStudioGame, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDeleteGame(game);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteGame) return;
    const targetId = confirmDeleteGame.id;
    deleteStudioGame(targetId);
    refreshGames();
    setConfirmDeleteGame(null);
    if (user?.uid) {
      await deleteKifuRecordFromFirestore(user.uid, targetId);
    }
  };

  // Start in-line editing a game from the library list
  const handleStartEdit = (game: SavedStudioGame, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingGameId(game.id);
    setEditTitle(game.title);
    setEditTags(game.tags ? [...game.tags] : []);
    setEditSentePlayerId(game.sentePlayerId || '');
    setEditGotePlayerId(game.gotePlayerId || '');
    setEditWinner(game.winner || 'unknown');
  };

  // Save in-line edits
  const handleSaveInlineEdit = (gameId: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const game = games.find((g) => g.id === gameId);
    if (!game || !editTitle.trim()) return;

    // Resolve player names if IDs are selected
    const senteProf = playerProfiles.find((p) => p.id === editSentePlayerId);
    const goteProf = playerProfiles.find((p) => p.id === editGotePlayerId);

    const updated: SavedStudioGame = {
      ...game,
      title: editTitle.trim(),
      tags: editTags,
      winner: editWinner,
      sentePlayerId: editSentePlayerId || game.sentePlayerId,
      gotePlayerId: editGotePlayerId || game.gotePlayerId,
      senteName: senteProf ? senteProf.name : game.senteName,
      goteName: goteProf ? goteProf.name : game.goteName,
      updatedAt: new Date().toISOString(),
    };
    saveStudioGame(updated);
    refreshGames();
    setEditingGameId(null);
  };

  // Commits an imported game: persist + cloud upload + open + optional analysis
  const commitImportedGame = (newGame: SavedStudioGame) => {
    saveStudioGame(newGame);
    if (importWithAnalysis && importAnalysisTarget === 'cloud' && user?.uid) {
      void queueKifuRecordForCloudAnalysis(user.uid, newGame.id, {
        level: cloudAnalysisLevel,
      }).then((queued) => {
        if (!queued) {
          void uploadKifuRecordToFirestore(user.uid, newGame.id);
        }
        refreshGames();
      });
    } else {
      if (user?.uid) {
        void uploadKifuRecordToFirestore(user.uid, newGame.id);
      }
      if (importWithAnalysis && onBatchAnalyzeGames) {
        onBatchAnalyzeGames([newGame.id], importAnalysisDepth, importAnalysisEngineId);
      }
    }
    refreshGames();
    onOpenGame(newGame);
    // Reset import staging state so subsequent imports start fresh
    setImportText('');
    setDetectedEncoding(null);
    setImportCustomTitle('');
    setImportGameKind('other');
    setImportSelectedTags(['研究']);
    setImportSentePlayerId(null);
    setImportGotePlayerId(null);
    lastInitializedKifuRef.current = null;
    onClose();
  };

  // Commits a save-as-new / overwrite from the Save tab
  const commitSaveGame = (gameToSave: SavedStudioGame, isOverwrite: boolean) => {
    saveStudioGame(gameToSave);
    if (user?.uid) {
      uploadKifuRecordToFirestore(user.uid, gameToSave.id);
    }
    refreshGames();
    onOpenGame(gameToSave); // Keeps active ID aligned
    setFeedbackMsg(
      isOverwrite
        ? t('studio.kifu.toast_overwrite_success', '既存の棋譜を上書き保存しました！')
        : t('studio.kifu.toast_save_success', '新しい棋譜としてライブラリに保存しました！')
    );
    setTimeout(() => {
      setFeedbackMsg(null);
      onClose();
    }, 900);
  };

  // Import Action: saves directly to library AND opens immediately
  const handleExecuteImport = () => {
    if (!importPlayer || !importMeta) return;

    // Use selected player IDs if specified, otherwise auto-resolve/register
    let sId = importSentePlayerId;
    if (!sId) {
      const sResolved = resolveOrRegisterPlayer(importMeta.sente, 'pro');
      sId = sResolved.profile.id;
    } else {
      // If user linked this imported name to an existing profile, record alias
      const prof = playerProfiles.find((p) => p.id === sId);
      if (prof && !prof.aliases?.includes(importMeta.sente.trim())) {
        upsertPlayerProfile({
          ...prof,
          aliases: [...(prof.aliases || []), importMeta.sente.trim()],
        });
      }
    }

    let gId = importGotePlayerId;
    if (!gId) {
      const gResolved = resolveOrRegisterPlayer(importMeta.gote, 'pro');
      gId = gResolved.profile.id;
    } else {
      const prof = playerProfiles.find((p) => p.id === gId);
      if (prof && !prof.aliases?.includes(importMeta.gote.trim())) {
        upsertPlayerProfile({
          ...prof,
          aliases: [...(prof.aliases || []), importMeta.gote.trim()],
        });
      }
    }

    setPlayerProfiles(loadPlayerProfiles());

    // Retrieve clean display names from profiles
    const latestProfiles = loadPlayerProfiles();
    const finalSenteProf = latestProfiles.find((p) => p.id === sId);
    const finalGoteProf = latestProfiles.find((p) => p.id === gId);

    const stats = importPlayer.kifu.moves ? getTreeBranchStats(importPlayer.kifu.moves) : null;
    const finalTotalPlies = stats ? Math.max(stats.longestStreamPlies, importMeta.totalPlies) : importMeta.totalPlies;

    const gameId = `studio-game-${Date.now()}`;
    const detectedWinner = detectGameWinner(importPlayer.kifu, importText);
    const newGame: SavedStudioGame = {
      id: gameId,
      title: (importCustomTitle || importMeta.autoTitle).trim(),
      senteName: finalSenteProf ? finalSenteProf.name : importMeta.sente,
      goteName: finalGoteProf ? finalGoteProf.name : importMeta.gote,
      sentePlayerId: sId,
      gotePlayerId: gId,
      winner: detectedWinner,
      gameKind: importGameKind,
      openingId: 'imported',
      openingName: importMeta.opening,
      tournament: importMeta.tour,
      matchDate: importMeta.date,
      totalPlies: finalTotalPlies,
      activeForkPointers: stats?.longestStreamForkPointers || [],
      forkCount: stats ? Math.max(0, stats.totalUniqueNodes - finalTotalPlies - 1) : 0,
      jkfJson: JSON.stringify(importPlayer.kifu),
      rawKif: importText,
      tags: importSelectedTags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Duplicate detection via contentHash across all KifuRecords (#44)
    const duplicates = findDuplicateKifuRecords({
      jkfJson: newGame.jkfJson,
      rawKif: newGame.rawKif,
    });
    if (duplicates.length > 0) {
      setPendingDuplicateSave({ game: newGame, duplicates, kind: 'import' });
      return;
    }
    commitImportedGame(newGame);
  };

  // ---- Bulk import (#51/#52): multi-file & folder ingest for the Studio library ----
  // Builds a SavedStudioGame from raw kifu text without the interactive
  // preview/duplicate-dialog flow. Returns null for unparseable input.
  const buildStudioGameFromText = (text: string): SavedStudioGame | null => {
    const { player, error } = tryParseKifu(text);
    if (!player || error) return null;

    const header = player.kifu.header || {};
    const sente = header['先手'] || header['☗'] || '先手';
    const gote = header['後手'] || header['☖'] || '後手';
    const tour = header['棋戦'] || header['棋戦名'] || header['場所'];
    const opening = header['戦型'] || '未分類';
    const date = header['開始日時'] || header['日付'];

    const sResolved = resolveOrRegisterPlayer(sente, 'pro');
    const gResolved = resolveOrRegisterPlayer(gote, 'pro');

    const stats = player.kifu.moves ? getTreeBranchStats(player.kifu.moves) : null;
    const totalPlies = stats
      ? Math.max(stats.longestStreamPlies, player.getMaxTesuu())
      : player.getMaxTesuu();

    const auto = inferAutoKifuTags(
      {
        senteName: sResolved.profile.name,
        goteName: gResolved.profile.name,
        tournament: tour,
        openingName: opening,
        sentePlayerId: sResolved.profile.id,
        gotePlayerId: gResolved.profile.id,
      },
      loadPlayerProfiles()
    );

    return {
      id: `studio-game-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: generateGameTitle({
        senteName: sResolved.profile.name,
        goteName: gResolved.profile.name,
        tournament: tour,
        openingName: opening,
        date,
      }),
      senteName: sResolved.profile.name,
      goteName: gResolved.profile.name,
      sentePlayerId: sResolved.profile.id,
      gotePlayerId: gResolved.profile.id,
      winner: detectGameWinner(player.kifu, text),
      gameKind: auto.gameKind,
      openingId: 'imported',
      openingName: opening,
      tournament: tour,
      matchDate: date,
      totalPlies,
      activeForkPointers: stats?.longestStreamForkPointers || [],
      forkCount: stats ? Math.max(0, stats.totalUniqueNodes - totalPlies - 1) : 0,
      jkfJson: JSON.stringify(player.kifu),
      rawKif: text,
      tags: auto.tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  const runBulkStudioImport = async (files: Iterable<File>) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;
    setBulkSummary(null);
    setBulkProgress({ done: 0, total: fileList.length });

    const failures: { fileName: string; reason: string }[] = [];
    const staged: BulkReviewItem[] = [];
    let duplicate = 0;
    let failed = 0;
    let totalBytes = 0;
    const seenHashes = new Set<string>();
    // Seed with existing record hashes once for O(1) lookups.
    for (const rec of loadKifuRecords()) {
      if (rec.contentHash) seenHashes.add(rec.contentHash);
    }
    const freshProfiles = loadPlayerProfiles();

    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (!file) continue;
        const fileName = file.name || '(unnamed)';
        try {
          if (!/\.(kif|ki2|kifu|csa|txt|jkf)$/i.test(fileName)) {
            failed += 1;
            failures.push({ fileName, reason: 'unsupported' });
          } else {
            const buffer = await file.arrayBuffer();
            const decoded = decodeKifBuffer(buffer);
            totalBytes += decoded.text.length;
            const game = buildStudioGameFromText(decoded.text);
            if (!game) {
              failed += 1;
              failures.push({ fileName, reason: 'parse' });
            } else {
              const dup = findDuplicateKifuRecords({
                jkfJson: game.jkfJson,
                rawKif: game.rawKif,
              });
              // Also guard against duplicates within this batch via hash.
              const hash = computeKifuRecordContentHash({ jkfJson: game.jkfJson, rawKif: game.rawKif });
              if (dup.length > 0 || (hash && seenHashes.has(hash))) {
                duplicate += 1;
              } else {
                if (hash) seenHashes.add(hash);
                // Stage for the review panel: nothing is persisted yet, so the
                // user can fix player links / tags / analysis choices first.
                const sMatch = findMatchingPlayer(game.senteName, freshProfiles);
                const gMatch = findMatchingPlayer(game.goteName, freshProfiles);
                staged.push({
                  key: `${fileName}-${i}`,
                  fileName,
                  game,
                  selected: true,
                  analyze: importWithAnalysis,
                  sentePlayerId: game.sentePlayerId ?? sMatch.profile?.id ?? null,
                  gotePlayerId: game.gotePlayerId ?? gMatch.profile?.id ?? null,
                  tags: [...(game.tags ?? [])],
                  tagsOpen: false,
                });
              }
            }
          }
        } catch {
          failed += 1;
          failures.push({ fileName, reason: 'read' });
        }
        setBulkProgress({ done: i + 1, total: fileList.length });
      }

      // N3: warn when the imported raw text approaches localStorage limits.
      setBulkSummary({
        success: staged.length,
        duplicate,
        failed,
        failures: failures.slice(0, 20),
        sizeWarning: totalBytes > 4 * 1024 * 1024,
      });
      if (staged.length > 0) {
        setReviewItems(staged);
      } else {
        refreshGames();
      }
    } finally {
      setBulkProgress(null);
    }
  };

  // Confirm handler for the review panel: persists only selected items with
  // the user-chosen player links and tags, then queues local or cloud analysis.
  const confirmBulkImport = async () => {
    if (!reviewItems || isBulkSubmitting) return;
    setIsBulkSubmitting(true);
    try {
      const profiles = loadPlayerProfiles();
      const analyzeIds: string[] = [];
      let imported = 0;
      let cloudQueued = 0;

      for (const item of reviewItems) {
        if (!item.selected) continue;

        const resolveSide = (playerId: string | null, fallbackName: string) => {
          if (playerId) {
            const prof = profiles.find((p) => p.id === playerId);
            if (prof) return prof;
          }
          return resolveOrRegisterPlayer(fallbackName, 'pro').profile;
        };
        const sProf = resolveSide(item.sentePlayerId, item.game.senteName);
        const gProf = resolveSide(item.gotePlayerId, item.game.goteName);

        const gameToSave: SavedStudioGame = {
          ...item.game,
          senteName: sProf.name,
          goteName: gProf.name,
          sentePlayerId: sProf.id,
          gotePlayerId: gProf.id,
          tags: item.tags,
        };

        saveStudioGame(gameToSave);
        imported += 1;

        if (item.analyze && bulkAnalysisTarget === 'cloud' && user?.uid) {
          const queued = await queueKifuRecordForCloudAnalysis(user.uid, gameToSave.id, {
            level: cloudAnalysisLevel,
          });
          if (queued) {
            cloudQueued += 1;
          } else {
            uploadKifuRecordToFirestore(user.uid, gameToSave.id);
          }
        } else {
          if (user?.uid) {
            uploadKifuRecordToFirestore(user.uid, gameToSave.id);
          }
          if (item.analyze) analyzeIds.push(gameToSave.id);
        }
      }

      setReviewItems(null);
      setPlayerProfiles(loadPlayerProfiles());
      refreshGames();
      setBulkSummary((prev) => (prev ? { ...prev, success: imported } : prev));
      if (cloudQueued > 0) {
        setFeedbackMsg(`☁️ ${cloudQueued}件をクラウド解析キューに登録しました`);
        setTimeout(() => setFeedbackMsg(null), 4000);
      }

      if (analyzeIds.length > 0 && onBatchAnalyzeGames) {
        void onBatchAnalyzeGames(analyzeIds, importAnalysisDepth, importAnalysisEngineId);
      }
    } finally {
      setIsBulkSubmitting(false);
    }
  };

  const handleBulkFolderPick = async () => {
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
        void runBulkStudioImport(collected);
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    bulkDirInputRef.current?.click();
  };

  // Save / Update Action: updates current active game or creates new variation
  const handleSaveCurrent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentGameData || !saveTitle.trim()) return;

    const isOverwrite = saveMode === 'overwrite' && activeSavedGame;
    const targetId = isOverwrite ? activeSavedGame.id : `studio-game-${Date.now()}`;

    let currentWinner = isOverwrite ? activeSavedGame.winner : undefined;
    if (!currentWinner || currentWinner === 'unknown') {
      try {
        const parsed = JSON.parse(currentGameData.jkfJson);
        currentWinner = detectGameWinner(parsed, currentGameData.rawKif);
      } catch {
        // ignore
      }
    }

    const gameToSave: SavedStudioGame = {
      id: targetId,
      title: saveTitle.trim(),
      senteName: currentGameData.senteName,
      goteName: currentGameData.goteName,
      winner: currentWinner,
      gameKind: saveGameKind,
      openingId: 'custom',
      openingName: currentGameData.openingName || '研究',
      tournament: currentGameData.tournament,
      totalPlies: currentGameData.totalPlies,
      forkCount: currentGameData.forkCount,
      jkfJson: currentGameData.jkfJson,
      rawKif: currentGameData.rawKif,
      tags: saveTags,
      createdAt: isOverwrite ? activeSavedGame.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Overwrite updates the same record in place -> no duplicate possible.
    // Save-as-new checks contentHash against all records (#44).
    if (!isOverwrite) {
      const duplicates = findDuplicateKifuRecords({
        jkfJson: gameToSave.jkfJson,
        rawKif: gameToSave.rawKif,
      });
      if (duplicates.length > 0) {
        setPendingDuplicateSave({ game: gameToSave, duplicates, kind: 'saveAsNew' });
        return;
      }
    }
    commitSaveGame(gameToSave, Boolean(isOverwrite));
  };

  // Duplicate dialog handlers (#44)
  const handleDupOpenExisting = (record: KifuRecord) => {
    setPendingDuplicateSave(null);
    onOpenGame(kifuRecordToStudioGame(record));
    onClose();
  };

  const handleDupSaveAnyway = () => {
    const pending = pendingDuplicateSave;
    if (!pending) return;
    setPendingDuplicateSave(null);
    if (pending.kind === 'import') {
      commitImportedGame(pending.game);
    } else {
      commitSaveGame(pending.game, false);
    }
  };

  const handleDupMerge = () => {
    const pending = pendingDuplicateSave;
    if (!pending) return;
    setPendingDuplicateSave(null);
    const first = pending.duplicates[0];
    if (first) {
      const merged = mergeTagsIntoExistingRecord(first, pending.game.tags);
      if (merged) setFeedbackMsg(t('duplicate.merge_done'));
    }
  };

  const handleDupCancel = () => {
    setPendingDuplicateSave(null);
  };

  // Drag and Drop & File Reader
  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buffer = ev.target?.result as ArrayBuffer;
      if (buffer) {
        const decoded = decodeKifBuffer(buffer);
        setImportText(decoded.text);
        setDetectedEncoding(decoded.encoding);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Helper: extracts true match year and month from raw KIF/JKF header date if available
  const extractGameYearMonth = (g: SavedStudioGame): string => {
    // 1. Try explicitly stored matchDate from KIF header
    if (g.matchDate) {
      const m = g.matchDate.match(/^(\d{4})[-/](\d{1,2})/);
      if (m && m[1] && m[2]) {
        return `${m[1]}年${m[2].padStart(2, '0')}月`;
      }
    }
    // 2. Try parsing from JKF header directly
    try {
      if (g.jkfJson) {
        const parsed = JSON.parse(g.jkfJson);
        const header = parsed.header || {};
        const headerDate: string | undefined = header['開始日時'] || header['日付'] || header['対局日'];
        if (headerDate) {
          const m = headerDate.match(/(\d{4})[-/年](\d{1,2})/);
          if (m && m[1] && m[2]) {
            return `${m[1]}年${m[2].padStart(2, '0')}月`;
          }
        }
      }
    } catch {
      // Ignore
    }
    // 3. Try parsing date from title e.g. "2026/11/05"
    const titleMatch = g.title.match(/(\d{4})[-/](\d{1,2})[-/]\d{1,2}/);
    if (titleMatch && titleMatch[1] && titleMatch[2]) {
      return `${titleMatch[1]}年${titleMatch[2].padStart(2, '0')}月`;
    }
    return '未記録・その他';
  };

  // Helper: classifies tournament into Pro / Amateur / Other
  const getTournamentCategory = (tourName: string, tags?: string[]): 'pro' | 'amateur' | 'other' => {
    const isPro =
      ['竜王戦', '名人戦', '王位戦', '王座戦', '棋王戦', '王将戦', '棋聖戦', '叡王戦', '朝日杯', '銀河戦', '早指し選手権', 'JT杯', '順位戦', '新人王戦'].some(
        (t) => tourName.includes(t) || (tags && tags.includes(t))
      ) || (tags && tags.includes('プロ公式'));
    if (isPro) return 'pro';

    const isAmateur =
      ['オンライン早指し戦', 'オンライン対局', 'アマ公式', '全国大会', '支部名人戦', 'アマ名人', '朝日アマ', '練習対局'].some(
        (t) => tourName.includes(t) || (tags && tags.includes(t))
      ) || (tags && tags.includes('アマ公式'));
    if (isAmateur) return 'amateur';

    return 'other';
  };

  // Compute grouped drill-down buckets depending on the selected axis
  const drilldownGroups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; icon: string; count: number; category?: string }>();

    for (const g of games) {
      if (drilldownAxis === 'player') {
        const sName = g.senteName || '先手';
        const gName = g.goteName || '後手';
        const players = Array.from(new Set([sName, gName]));
        for (const p of players) {
          const prof = playerProfiles.find((pr) => pr.name === p || pr.aliases?.includes(p));
          const cat = prof?.category || 'pro';
          if (drilldownPlayerCategory !== 'all' && cat !== drilldownPlayerCategory) {
            continue;
          }
          const icon = cat === 'user' ? '👤' : cat === 'ai' ? '🤖' : '🏯';
          const title = prof?.title ? ` (${prof.title})` : '';
          const existing = map.get(p) || { key: p, label: `${p}${title}`, icon, count: 0, category: cat };
          existing.count++;
          map.set(p, existing);
        }
      } else if (drilldownAxis === 'yearMonth') {
        const ym = extractGameYearMonth(g);
        const existing = map.get(ym) || { key: ym, label: ym, icon: '📅', count: 0 };
        existing.count++;
        map.set(ym, existing);
      } else if (drilldownAxis === 'tournament') {
        let tour = g.tournament && g.tournament.trim() ? g.tournament.trim() : '';
        if (!tour) {
          for (const t of ['竜王戦', '名人戦', '王位戦', '王座戦', '棋王戦', '王将戦', '棋聖戦', '叡王戦', '朝日杯', '銀河戦', '早指し選手権', 'JT杯', 'オンライン早指し戦', 'オンライン対局', '実戦対局']) {
            if ((g.tags && g.tags.includes(t)) || g.title.includes(t)) {
              tour = t;
              break;
            }
          }
        }
        if (!tour) tour = t('studio.kifu_mgmt.tour_other', '個人対局・その他');

        const cat = getTournamentCategory(tour, g.tags);
        if (drilldownTournamentCategory !== 'all' && cat !== drilldownTournamentCategory) {
          continue;
        }

        const icon = cat === 'pro' ? '🏯' : cat === 'amateur' ? '⚔️' : '📁';
        const existing = map.get(tour) || { key: tour, label: tour, icon, count: 0, category: cat };
        existing.count++;
        map.set(tour, existing);
      } else if (drilldownAxis === 'opening') {
        const op = g.openingName && g.openingName.trim() ? g.openingName.trim() : t('studio.kifu_mgmt.unclassified', '未分類');
        const existing = map.get(op) || { key: op, label: op, icon: '⚔️', count: 0 };
        existing.count++;
        map.set(op, existing);
      } else if (drilldownAxis === 'winner') {
        const w = g.winner || 'unknown';
        const label =
          w === 'sente'
            ? t('studio.kifu_mgmt.winner_sente', '先手勝ち (☗)')
            : w === 'gote'
            ? t('studio.kifu_mgmt.winner_gote', '後手勝ち (☖)')
            : w === 'draw'
            ? t('studio.kifu_mgmt.winner_draw', '引き分け (千日手/持将棋)')
            : t('studio.kifu_mgmt.winner_unknown', '勝敗未記録・進行中');
        const icon = w === 'sente' ? '☗' : w === 'gote' ? '☖' : w === 'draw' ? '🤝' : '❓';
        const existing = map.get(w) || { key: w, label, icon, count: 0 };
        existing.count++;
        map.set(w, existing);
      }
    }

    // Sort order: for yearMonth sort chronologically descending, others by count descending
    if (drilldownAxis === 'yearMonth') {
      return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [games, drilldownAxis, drilldownPlayerCategory, drilldownTournamentCategory, playerProfiles]);

  const filteredGames = games.filter((g) => {
    // 0. If in Drilldown Mode and a group is selected, filter strictly by that group
    if (libraryViewMode === 'drilldown' && drilldownSelectedGroup) {
      if (drilldownAxis === 'player') {
        const matchS = g.senteName === drilldownSelectedGroup || g.sentePlayerId === drilldownSelectedGroup;
        const matchG = g.goteName === drilldownSelectedGroup || g.gotePlayerId === drilldownSelectedGroup;
        if (!matchS && !matchG) return false;
      } else if (drilldownAxis === 'yearMonth') {
        const ym = extractGameYearMonth(g);
        if (ym !== drilldownSelectedGroup) return false;
      } else if (drilldownAxis === 'tournament') {
        const matchesTourProp = g.tournament && g.tournament.includes(drilldownSelectedGroup);
        const matchesTag = g.tags && g.tags.includes(drilldownSelectedGroup);
        const matchesTitle = g.title.includes(drilldownSelectedGroup);
        if (drilldownSelectedGroup === 'その他・一般対局') {
          // Matches games without standard tournaments
        } else if (!matchesTourProp && !matchesTag && !matchesTitle) {
          return false;
        }
      } else if (drilldownAxis === 'opening') {
        const matchesOpening = g.openingName === drilldownSelectedGroup;
        const matchesTag = g.tags && g.tags.includes(drilldownSelectedGroup);
        const matchesTitle = g.title.includes(drilldownSelectedGroup);
        if (!matchesOpening && !matchesTag && !matchesTitle) return false;
      } else if (drilldownAxis === 'winner') {
        const gWinner = g.winner || 'unknown';
        if (gWinner !== drilldownSelectedGroup) return false;
      }
    }

    // 1. Winner filter (from toolbar buttons)
    if (winnerFilter !== 'all') {
      const gWinner = g.winner || 'unknown';
      if (gWinner !== winnerFilter) return false;
    }

    // 4. Player filter
    if (selectedPlayerFilter) {
      const matchSente = g.sentePlayerId === selectedPlayerFilter || g.senteName.includes(selectedPlayerFilter);
      const matchGote = g.gotePlayerId === selectedPlayerFilter || g.goteName.includes(selectedPlayerFilter);
      if (!matchSente && !matchGote) return false;
    }

    // 5. Tag filter: all selected filter tags must be included (AND filter)
    if (selectedTagFilters.length > 0) {
      const gTags = g.tags || [];
      const hasAllTags = selectedTagFilters.every((fTag) => gTags.includes(fTag));
      if (!hasAllTags) return false;
    }

    // 6. Text search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      g.title.toLowerCase().includes(q) ||
      g.senteName.toLowerCase().includes(q) ||
      g.goteName.toLowerCase().includes(q) ||
      g.openingName.toLowerCase().includes(q) ||
      Boolean(g.tournament && g.tournament.toLowerCase().includes(q)) ||
      Boolean(g.tags && g.tags.some((tag: string) => tag.toLowerCase().includes(q)))
    );
  });

  // Helper to render individual player profile card
  const renderPlayerCard = (prof: ShogiPlayerProfile) => {
    const matchCount = games.filter(
      (g) =>
        g.sentePlayerId === prof.id ||
        g.gotePlayerId === prof.id ||
        g.senteName.includes(prof.name) ||
        g.goteName.includes(prof.name)
    ).length;

    return (
      <div
        key={prof.id}
        className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition flex items-center justify-between"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-base shrink-0">
            {prof.category === 'user' ? '👤' : prof.category === 'ai' ? '🤖' : '🏯'}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-slate-200 truncate">{prof.name}</span>
              {prof.title && (
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-amber-300/90 font-mono">
                  {prof.title}
                </span>
              )}
              <span className="text-[10px] text-slate-500">
                {prof.category === 'user'
                  ? t('players_page.category_user', 'マイユーザー')
                  : prof.category === 'ai'
                  ? t('players_page.category_ai', 'AI/CPU')
                  : t('players_page.category_pro', 'プロ棋士・一般')}
              </span>
            </div>
            <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
              <span>{t('studio.kifu_mgmt.player_match_count', '棋譜: {{count}} 局', { count: matchCount })}</span>
              {prof.note && <span>&bull; {prof.note}</span>}
              {prof.aliases && prof.aliases.length > 0 && (
                <span className="truncate max-w-[200px]">
                  ・{t('studio.kifu_mgmt.aliases_label', '表記:')} {prof.aliases.join(', ')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setSelectedPlayerFilter(prof.name);
              setActiveTab('library');
            }}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-amber-900/40 text-amber-300 text-[10px] transition"
            title={t('studio.kifu_mgmt.view_player_kifu_title', 'このプレイヤーの棋譜を表示')}
          >
            {t('studio.kifu_mgmt.view_player_kifu_btn', '棋譜を表示')}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingPlayerId(prof.id);
              setNewPlayerName(prof.name);
              setNewPlayerCategory(prof.category);
              setNewPlayerTitle(prof.title || '');
              setNewPlayerNote(prof.note || '');
              playerFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs"
            title={t('common.edit', '編集')}
          >
            ✏️
          </button>
          {!isProtectedPlayerProfile(prof.id) && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    t('studio.kifu_mgmt.confirm_delete_player', '「{{name}}」を削除しますか？', { name: prof.name })
                  )
                ) {
                  deletePlayerProfile(prof.id);
                  setPlayerProfiles(loadPlayerProfiles());
                  if (user?.uid) void deletePlayerFromFirestore(user.uid, prof.id);
                }
              }}
              className="p-1 rounded hover:bg-rose-950/50 text-slate-500 hover:text-rose-400 text-xs"
              title={t('common.delete', '削除')}
            >
              🗑️
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderGameKindSelector = (
    selected: KifuGameKind,
    onSelect: (kind: KifuGameKind) => void,
    keyPrefix: string
  ) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold text-slate-400 mr-1">
        {t('library_page.meta_game_kind', '棋譜区分')}:
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
      ).map((opt) => (
        <button
          key={`${keyPrefix}-${opt.id}`}
          type="button"
          onClick={() => onSelect(opt.id)}
          className={`px-2 py-0.5 rounded-md border text-[11px] transition ${
            selected === opt.id
              ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 font-bold'
              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
        >
          {opt.icon} {t(opt.labelKey)}
        </button>
      ))}
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in font-sans">
      <div className="bg-slate-900 border border-slate-700/80 rounded-none md:rounded-2xl shadow-2xl w-full h-full max-h-none md:h-auto md:max-w-4xl md:max-h-[90vh] flex flex-col overflow-hidden text-slate-100">
        {/* Modal Header */}
        <div className="p-3.5 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/50">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-amber-300 flex items-center gap-2">
              <span>📚</span>
              <span>{t('studio.unified_modal.title')}</span>
            </h3>
            <p className="hidden sm:block text-xs text-slate-400 mt-0.5">{t('studio.unified_modal.subtitle')}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onClose();
                navigate('/guide/import');
              }}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition"
              title={t('guide.title')}
              aria-label={t('guide.title')}
            >
              ❓
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg p-1.5 transition text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 shrink-0 text-xs font-semibold overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`flex-1 min-w-[90px] py-2.5 px-2 sm:px-3 text-center border-b-2 transition flex items-center justify-center gap-1 sm:gap-1.5 shrink-0 ${
              activeTab === 'import'
                ? 'border-amber-500 text-amber-300 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>📥 {t('studio.unified_modal.tab_import')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('save')}
            className={`flex-1 min-w-[90px] py-2.5 px-2 sm:px-3 text-center border-b-2 transition flex items-center justify-center gap-1 sm:gap-1.5 shrink-0 ${
              activeTab === 'save'
                ? 'border-amber-500 text-amber-300 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>💾 {t('studio.unified_modal.tab_save')}</span>
            {activeSavedGame && (
              <span
                className="w-2 h-2 rounded-full bg-emerald-400"
                title={t('studio.kifu_mgmt.editing_status_tooltip', '編集中')}
              />
            )}
          </button>
        </div>

        {/* Body content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5">
          {/* Active Batch Analysis Progress Banner */}
          {batchProgress && (
            <div className="mb-4 p-3.5 rounded-xl bg-gradient-to-r from-amber-950/80 via-slate-900 to-amber-950/80 border border-amber-500/60 shadow-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="animate-spin text-amber-400">⏳</span>
                  <span className="font-bold text-amber-300">
                    {t('studio.kifu_mgmt.batch_running', {
                      defaultValue: `一括AI解析実行中 [${batchProgress.gameIndex + 1} / ${batchProgress.totalGames} 局]`,
                      current: batchProgress.gameIndex + 1,
                      total: batchProgress.totalGames,
                    })}
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 text-[10px] font-mono">
                    {batchProgress.engineName}
                  </span>
                </div>
                {onCancelBatchAnalysis && (
                  <button
                    type="button"
                    onClick={onCancelBatchAnalysis}
                    className="px-2 py-0.5 rounded bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-700/60 text-[11px] font-bold transition flex items-center gap-1 shadow"
                  >
                    <span>⏹</span>
                    <span>{t('studio.kifu_mgmt.batch_cancel', '解析を中断')}</span>
                  </button>
                )}
              </div>
              <div className="text-[11px] text-slate-300 font-medium truncate">
                {t('studio.kifu_mgmt.batch_target', {
                  defaultValue: `対象: ${batchProgress.gameTitle}`,
                  title: batchProgress.gameTitle,
                })}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>
                    {t('studio.kifu_mgmt.batch_progress', {
                      defaultValue: `進捗: ${batchProgress.currentPly} / ${batchProgress.totalPlies} 手`,
                      current: batchProgress.currentPly,
                      total: batchProgress.totalPlies,
                    })}
                  </span>
                  <span>
                    {batchProgress.totalPlies > 0
                      ? Math.round((batchProgress.currentPly / batchProgress.totalPlies) * 100)
                      : 0}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300 rounded-full"
                    style={{
                      width: `${
                        batchProgress.totalPlies > 0
                          ? Math.min(100, Math.round((batchProgress.currentPly / batchProgress.totalPlies) * 100))
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: Library List */}
          {activeTab === 'library' && (
            <div className="space-y-3">
              {/* Top View Mode Switcher: 一覧表示 (Flat List) vs ドリルダウン階層表示 (Drill-Down Explorer) */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setLibraryViewMode('flat');
                      setDrilldownSelectedGroup(null);
                    }}
                    className={`px-3 py-1 rounded-md transition font-semibold flex items-center gap-1.5 ${
                      libraryViewMode === 'flat'
                        ? 'bg-amber-600 text-slate-950 shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>📋</span>
                    <span>{t('studio.kifu_mgmt.view_flat', '一覧リスト表示')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLibraryViewMode('drilldown');
                      setDrilldownSelectedGroup(null);
                    }}
                    className={`px-3 py-1 rounded-md transition font-semibold flex items-center gap-1.5 ${
                      libraryViewMode === 'drilldown'
                        ? 'bg-amber-600 text-slate-950 shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>📂</span>
                    <span>{t('studio.kifu_mgmt.view_drilldown', 'ドリルダウン探索')}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  {/* Select All / Select Unanalyzed Helper Buttons */}
                  <div className="flex items-center gap-1.5 mr-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedGameIds.length === filteredGames.length) {
                          setSelectedGameIds([]);
                        } else {
                          setSelectedGameIds(filteredGames.map((g) => g.id));
                        }
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition"
                    >
                      {selectedGameIds.length === filteredGames.length
                        ? t('studio.kifu_mgmt.deselect_all', '全解除')
                        : t('studio.kifu_mgmt.select_all', 'すべて選択')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const unanalyzed = filteredGames.filter((g) => {
                          const cnt = g.evaluations ? Object.keys(g.evaluations).length : (g.analyzedPliesCount || 0);
                          return cnt < g.totalPlies;
                        }).map((g) => g.id);
                        setSelectedGameIds(unanalyzed);
                      }}
                      className="px-2 py-0.5 rounded bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-800/40 text-[10px] transition"
                    >
                      {t('studio.kifu_mgmt.select_unanalyzed', '未解析のみ選択')}
                    </button>
                  </div>

                  {libraryViewMode === 'drilldown' ? (
                    <span className="text-amber-300 font-mono">
                      {drilldownSelectedGroup
                        ? t('studio.kifu_mgmt.selected_count', {
                            defaultValue: `選択中: ${drilldownSelectedGroup} (${filteredGames.length} 局)`,
                            group: drilldownSelectedGroup,
                            count: filteredGames.length,
                          })
                        : t('studio.kifu_mgmt.groups_count', {
                            defaultValue: `${drilldownGroups.length} グループ`,
                            count: drilldownGroups.length,
                          })}
                    </span>
                  ) : (
                    <span>
                      {t('studio.kifu_mgmt.matching_games', {
                        defaultValue: `該当: ${filteredGames.length} 局`,
                        count: filteredGames.length,
                      })}
                    </span>
                  )}
                </div>
              </div>

              {/* MODE 1: Drilldown Explorer Mode */}
              {libraryViewMode === 'drilldown' && (
                <div className="space-y-3">
                  {/* Axis Tabs: 棋士 / 年月 / 棋戦 / 戦型 */}
                  <div className="flex items-center justify-between bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-1 text-xs">
                      <span className="text-[10px] text-slate-500 font-bold px-1.5">{t('studio.kifu_mgmt.axis_label', '探索軸:')}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setDrilldownAxis('player');
                          setDrilldownSelectedGroup(null);
                        }}
                        className={`px-2.5 py-1 rounded-lg transition font-medium flex items-center gap-1 ${
                          drilldownAxis === 'player'
                            ? 'bg-slate-800 text-amber-300 border border-amber-500/40 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span>👤</span>
                        <span>{t('studio.kifu_mgmt.axis_player', '棋士・対局者')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDrilldownAxis('yearMonth');
                          setDrilldownSelectedGroup(null);
                        }}
                        className={`px-2.5 py-1 rounded-lg transition font-medium flex items-center gap-1 ${
                          drilldownAxis === 'yearMonth'
                            ? 'bg-slate-800 text-amber-300 border border-amber-500/40 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span>📅</span>
                        <span>{t('studio.kifu_mgmt.axis_year_month', '対局年月')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDrilldownAxis('tournament');
                          setDrilldownSelectedGroup(null);
                        }}
                        className={`px-2.5 py-1 rounded-lg transition font-medium flex items-center gap-1 ${
                          drilldownAxis === 'tournament'
                            ? 'bg-slate-800 text-amber-300 border border-amber-500/40 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span>🏆</span>
                        <span>{t('studio.kifu_mgmt.axis_tournament', '棋戦・大会')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDrilldownAxis('opening');
                          setDrilldownSelectedGroup(null);
                        }}
                        className={`px-2.5 py-1 rounded-lg transition font-medium flex items-center gap-1 ${
                          drilldownAxis === 'opening'
                            ? 'bg-slate-800 text-amber-300 border border-amber-500/40 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span>⚔️</span>
                        <span>{t('studio.kifu_mgmt.axis_opening', '戦型')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDrilldownAxis('winner');
                          setDrilldownSelectedGroup(null);
                        }}
                        className={`px-2.5 py-1 rounded-lg transition font-medium flex items-center gap-1 ${
                          drilldownAxis === 'winner'
                            ? 'bg-slate-800 text-amber-300 border border-amber-500/40 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span>👑</span>
                        <span>{t('studio.kifu_mgmt.axis_winner', '勝敗結果')}</span>
                      </button>
                    </div>

                    {drilldownSelectedGroup && (
                      <button
                        type="button"
                        onClick={() => setDrilldownSelectedGroup(null)}
                        className="text-xs text-amber-400 hover:underline px-2 py-0.5 rounded bg-slate-900 border border-slate-700 flex items-center gap-1"
                      >
                        <span>←</span>
                        <span>{t('studio.kifu_mgmt.back_to_groups', '一覧に戻る')}</span>
                      </button>
                    )}
                  </div>

                  {/* Level 1: Category / Group Grid (When no group is selected) */}
                  {!drilldownSelectedGroup && (
                    <div className="space-y-2.5">
                      {/* Sub-Category Filter: 棋士区分 (プロ / AI / マイユーザー) */}
                      {drilldownAxis === 'player' && (
                        <div className="flex items-center gap-1.5 p-1 bg-slate-950/60 rounded-lg border border-slate-800 text-[11px]">
                          <span className="text-[10px] text-slate-500 font-bold px-1.5">{t('studio.kifu_mgmt.axis_label', '区分絞込:')}</span>
                          <button
                            type="button"
                            onClick={() => setDrilldownPlayerCategory('all')}
                            className={`px-2 py-0.5 rounded transition ${
                              drilldownPlayerCategory === 'all'
                                ? 'bg-amber-500/20 text-amber-300 font-bold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {t('studio.kifu_mgmt.filter_all', 'すべて')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDrilldownPlayerCategory('pro')}
                            className={`px-2 py-0.5 rounded transition flex items-center gap-1 ${
                              drilldownPlayerCategory === 'pro'
                                ? 'bg-amber-500/20 text-amber-300 font-bold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <span>🏯</span>
                            <span>{t('studio.kifu_mgmt.filter_pro', 'プロ棋士')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDrilldownPlayerCategory('ai')}
                            className={`px-2 py-0.5 rounded transition flex items-center gap-1 ${
                              drilldownPlayerCategory === 'ai'
                                ? 'bg-amber-500/20 text-amber-300 font-bold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <span>🤖</span>
                            <span>{t('studio.kifu_mgmt.filter_ai', 'AI・コンピュータ')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDrilldownPlayerCategory('user')}
                            className={`px-2 py-0.5 rounded transition flex items-center gap-1 ${
                              drilldownPlayerCategory === 'user'
                                ? 'bg-amber-500/20 text-amber-300 font-bold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <span>👤</span>
                            <span>{t('studio.kifu_mgmt.filter_user', 'マイユーザー')}</span>
                          </button>
                        </div>
                      )}

                      {/* Sub-Category Filter: 棋戦分類 (プロ公式 / アマ公式・ネット / その他) */}
                      {drilldownAxis === 'tournament' && (
                        <div className="flex items-center gap-1.5 p-1 bg-slate-950/60 rounded-lg border border-slate-800 text-[11px]">
                          <span className="text-[10px] text-slate-500 font-bold px-1.5">{t('studio.kifu_mgmt.axis_label', '大会分類:')}</span>
                          <button
                            type="button"
                            onClick={() => setDrilldownTournamentCategory('all')}
                            className={`px-2 py-0.5 rounded transition ${
                              drilldownTournamentCategory === 'all'
                                ? 'bg-amber-500/20 text-amber-300 font-bold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {t('studio.kifu_mgmt.filter_all', 'すべて')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDrilldownTournamentCategory('pro')}
                            className={`px-2 py-0.5 rounded transition flex items-center gap-1 ${
                              drilldownTournamentCategory === 'pro'
                                ? 'bg-amber-500/20 text-amber-300 font-bold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <span>🏯</span>
                            <span>{t('studio.kifu_mgmt.filter_tour_pro', 'プロ公式棋戦')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDrilldownTournamentCategory('amateur')}
                            className={`px-2 py-0.5 rounded transition flex items-center gap-1 ${
                              drilldownTournamentCategory === 'amateur'
                                ? 'bg-amber-500/20 text-amber-300 font-bold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <span>⚔️</span>
                            <span>{t('studio.kifu_mgmt.filter_tour_amateur', 'アマ大会・ネット対局')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDrilldownTournamentCategory('other')}
                            className={`px-2 py-0.5 rounded transition flex items-center gap-1 ${
                              drilldownTournamentCategory === 'other'
                                ? 'bg-amber-500/20 text-amber-300 font-bold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <span>📁</span>
                            <span>{t('studio.kifu_mgmt.filter_tour_other', 'その他・個人対局')}</span>
                          </button>
                        </div>
                      )}

                      <div className="text-[11px] text-slate-400">
                        {drilldownAxis === 'player' && '棋士を選択すると、その棋士が関わる棋譜のみにドリルダウンします:'}
                        {drilldownAxis === 'yearMonth' && '対局年月（棋譜情報より抽出）を選択すると、その時期に指された棋譜へドリルダウンします:'}
                        {drilldownAxis === 'tournament' && '棋戦・大会を選択すると、その棋戦の棋譜へドリルダウンします:'}
                        {drilldownAxis === 'opening' && '戦型を選択すると、その戦型で指された棋譜へドリルダウンします:'}
                        {drilldownAxis === 'winner' && '勝敗結果を選択すると、その結果の対局棋譜へドリルダウンします:'}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {drilldownGroups.map((grp) => (
                          <button
                            type="button"
                            key={`drill-${grp.key}`}
                            onClick={() => setDrilldownSelectedGroup(grp.key)}
                            className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-amber-500/60 hover:bg-slate-850 transition text-left flex items-center justify-between group shadow-sm"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-base">{grp.icon}</span>
                                <span className="font-bold text-xs text-slate-200 group-hover:text-amber-300 truncate">
                                  {grp.label}
                                </span>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 font-mono text-[11px] shrink-0 font-bold">
                              {grp.count} 局
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Level 2: Inside the selected group (Show filtered games list with breadcrumb) */}
                  {drilldownSelectedGroup && (
                    <div className="space-y-2">
                      {/* Breadcrumb Header */}
                      <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-600/40 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-amber-400">📂</span>
                          <span className="text-slate-400">
                            {drilldownAxis === 'player'
                              ? '棋士'
                              : drilldownAxis === 'yearMonth'
                              ? '年月'
                              : drilldownAxis === 'tournament'
                              ? '棋戦'
                              : drilldownAxis === 'opening'
                              ? '戦型'
                              : '勝敗'}
                          </span>
                          <span className="text-slate-500">/</span>
                          <span className="font-bold text-amber-300 text-sm">
                            {drilldownAxis === 'winner'
                              ? drilldownSelectedGroup === 'sente'
                                ? '☗ 先手勝ち'
                                : drilldownSelectedGroup === 'gote'
                                ? '☖ 後手勝ち'
                                : drilldownSelectedGroup === 'draw'
                                ? '🤝 引き分け'
                                : '❓ 勝敗未記録'
                              : drilldownSelectedGroup}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-mono text-[10px]">
                            {filteredGames.length} 局
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDrilldownSelectedGroup(null)}
                          className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs text-slate-300 hover:text-amber-300 transition"
                        >
                          {t('studio.kifu_mgmt.close_other_groups', '閉じる・他のグループを見る')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Search & Tag Filter Bar (Always visible in Flat Mode or inside Level 2 Drilldown) */}
              {(libraryViewMode === 'flat' || drilldownSelectedGroup) && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('studio.library_modal.search_placeholder')}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition"
                      />
                      <span className="absolute left-2.5 top-1.5 text-slate-500 text-xs">🔍</span>
                    </div>

                    {/* Quick Reset Button */}
                    {(searchQuery || selectedTagFilters.length > 0 || winnerFilter !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedTagFilters([]);
                          setWinnerFilter('all');
                        }}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition shrink-0"
                      >
                        {t('studio.kifu_mgmt.clear_btn', 'クリア')}
                      </button>
                    )}
                  </div>

                  {/* Outcome Filter Toolbar (勝敗クイック絞り込み) */}
                  <div className="flex items-center gap-1.5 p-1.5 bg-slate-950/80 rounded-xl border border-slate-800 text-xs flex-wrap">
                    <span className="text-[10px] text-slate-500 font-bold px-1.5 shrink-0">
                      👑 {t('studio.kifu_mgmt.winner_filter_label', '勝敗絞込:')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setWinnerFilter('all')}
                      className={`px-2.5 py-0.5 rounded-lg transition font-medium text-[11px] ${
                        winnerFilter === 'all'
                          ? 'bg-amber-600 text-slate-950 font-bold shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t('common.all', 'すべて')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWinnerFilter('sente')}
                      className={`px-2.5 py-0.5 rounded-lg transition font-medium text-[11px] flex items-center gap-1 ${
                        winnerFilter === 'sente'
                          ? 'bg-amber-950 text-amber-300 border border-amber-600 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>☗</span>
                      <span>{t('studio.kifu_mgmt.winner_sente_short', '先手勝ち')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWinnerFilter('gote')}
                      className={`px-2.5 py-0.5 rounded-lg transition font-medium text-[11px] flex items-center gap-1 ${
                        winnerFilter === 'gote'
                          ? 'bg-sky-950 text-sky-300 border border-sky-600 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>☖</span>
                      <span>{t('studio.kifu_mgmt.winner_gote_short', '後手勝ち')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWinnerFilter('draw')}
                      className={`px-2.5 py-0.5 rounded-lg transition font-medium text-[11px] flex items-center gap-1 ${
                        winnerFilter === 'draw'
                          ? 'bg-purple-950 text-purple-300 border border-purple-600 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>🤝</span>
                      <span>{t('studio.kifu_mgmt.winner_draw_short', '引き分け')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWinnerFilter('unknown')}
                      className={`px-2.5 py-0.5 rounded-lg transition font-medium text-[11px] flex items-center gap-1 ${
                        winnerFilter === 'unknown'
                          ? 'bg-slate-800 text-slate-200 border border-slate-600 font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>❓</span>
                      <span>{t('studio.kifu_mgmt.winner_unknown_short', '未記録・進行中')}</span>
                    </button>
                  </div>

                  {/* Category-based Tag Filter (Comboboxes) */}
                  <div className="space-y-1.5 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 text-[11px]">
                    <div className="flex items-center justify-between pb-1 border-b border-slate-800/80">
                      <span className="text-[10px] text-slate-400 font-semibold">
                        🏷️ {t('studio.kifu_mgmt.tag_filter_by_category', 'カテゴリー別タグ絞り込み:')}
                      </span>
                      {selectedTagFilters.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedTagFilters([])}
                          className="text-[10px] text-amber-400 hover:underline"
                        >
                          絞り込み解除 (すべて表示)
                        </button>
                      )}
                    </div>

                    <CategorizedTagCombobox
                      tagGroups={tagGroups}
                      selectedTags={selectedTagFilters}
                      onChange={setSelectedTagFilters}
                      onAddCustomTag={(cat, tag) => {
                        const updated = addCustomTagToCategory(cat, tag);
                        setTagGroups(updated);
                      }}
                      placeholder={t('studio.kifu_mgmt.tag_filter_placeholder', 'タグ絞り込み...')}
                    />
                  </div>
                </div>
              )}

              {/* Game Cards List: Shown when in Flat Mode OR when a Drilldown group is selected */}
              {(libraryViewMode === 'flat' || drilldownSelectedGroup) && (
                filteredGames.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 space-y-2">
                    <div className="text-3xl">📭</div>
                    <p className="text-xs">{t('studio.library_modal.empty_msg')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                  {filteredGames.map((game) => {
                    const isActive = game.id === activeGameId;
                    const isEditing = editingGameId === game.id;

                    if (isEditing) {
                      return (
                        <div
                          key={game.id}
                          className="p-3.5 rounded-xl bg-slate-950 border-2 border-amber-500/80 space-y-3"
                        >
                          <div className="text-xs font-bold text-amber-300">
                            ✏️ {t('studio.kifu_mgmt.edit_game_info_title', '棋譜情報の編集')}
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-400">
                              {t('studio.kifu_mgmt.title_label', 'タイトル:')}
                            </label>
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                            />
                          </div>

                          {/* Player Association (先手・後手の紐づけ) */}
                          <div className="grid grid-cols-2 gap-2 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                            <div className="space-y-1">
                              <label className="text-[11px] font-semibold text-amber-300">
                                ☗ {t('studio.kifu_mgmt.sente_player_label', '先手プレイヤー:')}
                              </label>
                              <select
                                value={editSentePlayerId}
                                onChange={(e) => setEditSentePlayerId(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                              >
                                <option value="">
                                  {t('studio.kifu_mgmt.unselected_player', '-- 未選択 ({{name}}) --', {
                                    name: game.senteName,
                                  })}
                                </option>
                                <optgroup label={`👤 ${t('studio.kifu_mgmt.filter_user', 'マイユーザー')}`}>
                                  {playerProfiles
                                    .filter((p) => p.category === 'user')
                                    .map((p) => (
                                      <option key={`sente-prof-${p.id}`} value={p.id}>
                                        {p.name} {p.title ? `(${p.title})` : ''}
                                      </option>
                                    ))}
                                </optgroup>
                                <optgroup label={`🤖 ${t('studio.kifu_mgmt.filter_ai', 'コンピュータ / AI')}`}>
                                  {playerProfiles
                                    .filter((p) => p.category === 'ai')
                                    .map((p) => (
                                      <option key={`sente-prof-${p.id}`} value={p.id}>
                                        {p.name} {p.title ? `(${p.title})` : ''}
                                      </option>
                                    ))}
                                </optgroup>
                                <optgroup label={`🏯 ${t('studio.kifu_mgmt.pro_and_others', 'プロ棋士・その他棋士')}`}>
                                  {playerProfiles
                                    .filter((p) => p.category === 'pro')
                                    .map((p) => (
                                      <option key={`sente-prof-${p.id}`} value={p.id}>
                                        {p.name} {p.title ? `(${p.title})` : ''}
                                      </option>
                                    ))}
                                </optgroup>
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[11px] font-semibold text-sky-300">
                                ☖ {t('studio.kifu_mgmt.gote_player_label', '後手プレイヤー:')}
                              </label>
                              <select
                                value={editGotePlayerId}
                                onChange={(e) => setEditGotePlayerId(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                              >
                                <option value="">
                                  {t('studio.kifu_mgmt.unselected_player', '-- 未選択 ({{name}}) --', {
                                    name: game.goteName,
                                  })}
                                </option>
                                <optgroup label={`👤 ${t('studio.kifu_mgmt.filter_user', 'マイユーザー')}`}>
                                  {playerProfiles
                                    .filter((p) => p.category === 'user')
                                    .map((p) => (
                                      <option key={`gote-prof-${p.id}`} value={p.id}>
                                        {p.name} {p.title ? `(${p.title})` : ''}
                                      </option>
                                    ))}
                                </optgroup>
                                <optgroup label={`🤖 ${t('studio.kifu_mgmt.filter_ai', 'コンピュータ / AI')}`}>
                                  {playerProfiles
                                    .filter((p) => p.category === 'ai')
                                    .map((p) => (
                                      <option key={`gote-prof-${p.id}`} value={p.id}>
                                        {p.name} {p.title ? `(${p.title})` : ''}
                                      </option>
                                    ))}
                                </optgroup>
                                <optgroup label={`🏯 ${t('studio.kifu_mgmt.pro_and_others', 'プロ棋士・その他棋士')}`}>
                                  {playerProfiles
                                    .filter((p) => p.category === 'pro')
                                    .map((p) => (
                                      <option key={`gote-prof-${p.id}`} value={p.id}>
                                        {p.name} {p.title ? `(${p.title})` : ''}
                                      </option>
                                    ))}
                                </optgroup>
                              </select>
                            </div>
                          </div>

                          {/* Winner Outcome Selector */}
                          <div className="space-y-1 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                            <label className="text-[11px] font-semibold text-slate-300">
                              👑 {t('studio.kifu_mgmt.game_result_outcome', '対局結果（勝敗）:')}
                            </label>
                            <select
                              value={editWinner}
                              onChange={(e) => setEditWinner(e.target.value as 'sente' | 'gote' | 'draw' | 'unknown')}
                              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                            >
                              <option value="unknown">❓ {t('studio.kifu_mgmt.winner_unknown', '勝敗未記録・進行中')}</option>
                              <option value="sente">{t('studio.kifu_mgmt.winner_sente', '先手勝ち (☗)')}</option>
                              <option value="gote">{t('studio.kifu_mgmt.winner_gote', '後手勝ち (☖)')}</option>
                              <option value="draw">{t('studio.kifu_mgmt.winner_draw', '引き分け (千日手/持将棋)')}</option>
                            </select>
                          </div>

                          {/* Categorized Tag Multi-select Combobox */}
                          <div className="space-y-1">
                            <label className="text-[11px] text-slate-400 font-semibold">
                              {t('studio.kifu_mgmt.tag_select_label', '分類・タグ選択:')}
                            </label>
                            <CategorizedTagCombobox
                              tagGroups={tagGroups}
                              selectedTags={editTags}
                              onChange={setEditTags}
                              onAddCustomTag={(cat, tag) => {
                                const updated = addCustomTagToCategory(cat, tag);
                                setTagGroups(updated);
                              }}
                              placeholder={t('studio.kifu_mgmt.tag_select_placeholder', 'タグを選択または新規追加...')}
                            />
                          </div>

                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingGameId(null)}
                              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
                            >
                              {t('common.cancel', 'キャンセル')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveInlineEdit(game.id)}
                              className="px-3.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs shadow"
                            >
                              変更を保存
                            </button>
                          </div>
                        </div>
                      );
                    }

                    const isSelected = selectedGameIds.includes(game.id);
                    const evalCount = game.evaluations ? Object.keys(game.evaluations).length : (game.analyzedPliesCount || 0);
                    const isFullyAnalyzed = evalCount >= game.totalPlies && game.totalPlies > 0;
                    const isPartiallyAnalyzed = evalCount > 0 && !isFullyAnalyzed;
                    const record = kifuRecordsById.get(game.id);
                    const recordStatus = record?.analysisStatus;
                    const isAlreadyCloudAnalyzed = Boolean(record && isCloudAnalyzedRecord(record));
                    const canQueueCloud =
                      Boolean(user?.uid) &&
                      (!record || canQueueRecordForCloudAnalysis(record, { allowReanalyze: true }));

                    return (
                      <div
                        key={game.id}
                        onClick={() => {
                          onOpenGame(game);
                          onClose();
                        }}
                        className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between group ${
                          isActive
                            ? 'bg-amber-950/30 border-amber-500/70 shadow-md'
                            : isSelected
                            ? 'bg-amber-950/20 border-amber-500/40'
                            : 'bg-slate-950/60 border-slate-800 hover:border-amber-500/60 hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-3 flex-1">
                          {/* Selection Checkbox */}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedGameIds((prev) =>
                                prev.includes(game.id)
                                  ? prev.filter((id) => id !== game.id)
                                  : [...prev, game.id]
                              );
                            }}
                            className="shrink-0 p-1 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // Controlled by wrapper div
                              className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-700 focus:ring-amber-500 cursor-pointer"
                            />
                          </div>

                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isActive && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500 text-slate-950 font-bold shrink-0">
                                  展開中
                                </span>
                              )}
                              <span className="font-bold text-xs sm:text-sm text-slate-200 group-hover:text-amber-300 transition truncate">
                                {game.title}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-amber-300/90 shrink-0">
                                {game.openingName}
                              </span>

                              {/* Game Winner Outcome Badge */}
                              {game.winner === 'sente' ? (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-950 text-amber-300 border border-amber-600/70 font-bold shrink-0 flex items-center gap-1 shadow-sm">
                                  <span>☗</span>
                                  <span>{t('studio.kifu_mgmt.winner_sente_short', '先手勝ち')}</span>
                                </span>
                              ) : game.winner === 'gote' ? (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-sky-950 text-sky-300 border border-sky-600/70 font-bold shrink-0 flex items-center gap-1 shadow-sm">
                                  <span>☖</span>
                                  <span>{t('studio.kifu_mgmt.winner_gote_short', '後手勝ち')}</span>
                                </span>
                              ) : game.winner === 'draw' ? (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-purple-950 text-purple-300 border border-purple-600/70 font-bold shrink-0 flex items-center gap-1 shadow-sm">
                                  <span>🤝</span>
                                  <span>{t('studio.kifu_mgmt.winner_draw_short', '引き分け')}</span>
                                </span>
                              ) : null}

                              {/* Analysis Status Badge */}
                              {recordStatus === 'queued' ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-700/70 font-semibold shrink-0">
                                  ☁️ キュー待ち
                                  {typeof record?.analysisQueuePosition === 'number'
                                    ? record.analysisQueuePosition <= 1
                                      ? '（次番）'
                                      : `（あと${record.analysisQueuePosition - 1}件待ち）`
                                    : ''}
                                </span>
                              ) : recordStatus === 'processing' ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-950 text-sky-300 border border-sky-700/70 font-semibold shrink-0 animate-pulse">
                                  ☁️ クラウド解析中...
                                </span>
                              ) : recordStatus === 'failed' ? (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[10px] bg-rose-950 text-rose-300 border border-rose-700/70 font-semibold shrink-0"
                                  title={record?.analysisError || 'クラウド解析に失敗しました'}
                                >
                                  ☁️ 解析失敗
                                </span>
                              ) : isFullyAnalyzed || recordStatus === 'completed' ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-semibold shrink-0 flex items-center gap-1">
                                  <span>{game.analysisEngineId === CLOUD_ANALYSIS_ENGINE_ID ? '☁️' : '🤖'}</span>
                                  <span>
                                    解析済 (
                                    {resolveEngineDisplayName(game.analysisEngineId, t)}
                                    ・深さ{game.analysisDepth || 10})
                                  </span>
                                </span>
                              ) : isPartiallyAnalyzed ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950 text-amber-300 border border-amber-800/60 font-semibold shrink-0">
                                  一部解析 ({evalCount}/{game.totalPlies}手
                                  {game.analysisEngineId && (
                                    <span>
                                      ・
                                      {resolveEngineDisplayName(game.analysisEngineId, t)}
                                    </span>
                                  )}
                                  )
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-900 text-slate-500 border border-slate-800 shrink-0">
                                  未解析
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-400">
                              <span className="font-medium text-slate-300">
                                ☗ {game.senteName} vs ☖ {game.goteName}
                              </span>
                              {/* Player Badges - Only render when player name differs from raw sente/gote string */}
                              {(() => {
                                const sP = playerProfiles.find((p) => p.id === game.sentePlayerId);
                                const gP = playerProfiles.find((p) => p.id === game.gotePlayerId);
                                const showSenteBadge = sP && sP.name !== game.senteName;
                                const showGoteBadge = gP && gP.name !== game.goteName;
                                if (!showSenteBadge && !showGoteBadge) return null;
                                return (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {showSenteBadge && (
                                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-950/60 text-amber-300 border border-amber-800/40">
                                        ☗ {sP.name}
                                      </span>
                                    )}
                                    {showGoteBadge && (
                                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-sky-950/60 text-sky-300 border border-sky-800/40">
                                        ☖ {gP.name}
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                              <span>•</span>
                              <span>
                                {t('studio.match.plies_count', '{{count}} 手', { count: game.totalPlies })}
                              </span>
                              {game.forkCount > 0 && (
                                <>
                                  <span>•</span>
                                  <span className="text-amber-400 font-semibold">
                                    +{game.forkCount} {t('studio.kifu_mgmt.branch_count_unit', '分岐')}
                                  </span>
                                </>
                              )}
                            </div>
                            {game.tags && game.tags.length > 0 && (
                              <div className="flex items-center gap-1 mt-1 flex-wrap">
                                {game.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="px-1.5 py-0.2 rounded bg-slate-800/80 text-[10px] text-slate-400 border border-slate-750"
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                          {canQueueCloud && (
                            <button
                              type="button"
                              disabled={isCloudQueuing}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleQueueCloudAnalysis([game.id], {
                                  forceReanalyze: isAlreadyCloudAnalyzed,
                                });
                              }}
                              className="p-1 sm:px-2 sm:py-1 rounded bg-indigo-950/70 hover:bg-indigo-900 text-indigo-300 border border-indigo-700/60 text-xs transition disabled:opacity-40"
                              title={
                                isAlreadyCloudAnalyzed
                                  ? t('studio.kifu_mgmt.resend_cloud_analysis_title', 'クラウド再解析に送る')
                                  : t('studio.kifu_mgmt.send_cloud_analysis_title', 'クラウド解析キューに送る')
                              }
                            >
                              {isAlreadyCloudAnalyzed ? '☁️🔄' : '☁️'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => handleStartEdit(game, e)}
                            className="p-1 sm:px-2 sm:py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs transition"
                            title={t('studio.kifu_mgmt.edit_title_tags_title', 'タイトル・タグを編集')}
                          >
                            ✏️
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteRequest(game, e)}
                            className="p-1 sm:px-2 sm:py-1 rounded bg-slate-800/80 hover:bg-rose-900/60 text-slate-400 hover:text-rose-200 text-xs transition"
                            title={t('studio.kifu_mgmt.delete_kifu_title', 'この棋譜を削除')}
                          >
                            🗑️
                          </button>
                          <span className="text-amber-400 text-xs font-semibold group-hover:translate-x-0.5 transition-transform hidden sm:inline">
                            {t('studio.kifu_mgmt.open_arrow', '開く ➔')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Floating Batch Action Toolbar */}
              {selectedGameIds.length > 0 && (
                <div className="sticky bottom-0 z-20 mt-4 p-3 bg-slate-900/95 border border-amber-500/50 rounded-2xl shadow-2xl backdrop-blur-md flex flex-wrap items-center justify-between gap-3 animate-fade-in text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-400 font-bold flex items-center gap-1.5">
                      <span>☑️</span>
                      <span>
                        {t('studio.kifu_mgmt.games_selected_count', '{{count}} 局 選択中', {
                          count: selectedGameIds.length,
                        })}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedGameIds([])}
                      className="text-slate-400 hover:text-slate-200 underline text-[11px]"
                    >
                      {t('studio.kifu_mgmt.deselect_all', '全解除')}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-[11px]">
                      {t('studio.kifu_mgmt.engine_label', 'エンジン:')}
                    </span>
                    <select
                      value={batchEngineId}
                      onChange={(e) => setBatchEngineId(e.target.value as EngineId)}
                      disabled={isExecutingBatch || isEngineAnalyzing}
                      className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-amber-300 font-semibold focus:outline-none cursor-pointer max-w-[140px] truncate"
                    >
                      {availableEngines.map((eng) => (
                        <option key={`batch-eng-${eng.id}`} value={eng.id}>
                          {resolveEngineDisplayName(eng, t)}
                        </option>
                      ))}
                    </select>

                    <span className="text-slate-400 text-[11px]">
                      {t('studio.kifu_mgmt.depth_label', '深さ:')}
                    </span>
                    <select
                      value={batchDepth}
                      onChange={(e) => setBatchDepth(parseInt(e.target.value, 10))}
                      disabled={isExecutingBatch || isEngineAnalyzing}
                      className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-amber-300 font-semibold focus:outline-none cursor-pointer"
                    >
                      <option value={8}>{t('studio.kifu_mgmt.depth_8', '深さ 8 (軽量・高速)')}</option>
                      <option value={10}>{t('studio.kifu_mgmt.depth_10', '深さ 10 (標準・推奨)')}</option>
                      <option value={12}>{t('studio.kifu_mgmt.depth_12', '深さ 12 (深層・高精度)')}</option>
                      <option value={16}>{t('studio.kifu_mgmt.depth_16', '深さ 16 (最高精度)')}</option>
                    </select>

                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 select-none px-1">
                      <input
                        type="checkbox"
                        checked={batchForceRestart}
                        onChange={(e) => setBatchForceRestart(e.target.checked)}
                        disabled={isExecutingBatch || isEngineAnalyzing}
                        className="w-3.5 h-3.5 rounded text-amber-500 bg-slate-950 border-slate-700 focus:ring-amber-500 cursor-pointer"
                      />
                      <span className="text-[11px] text-amber-300/90 font-medium">
                        {t('studio.kifu_mgmt.reanalyze_all_moves', '全手再解析')}
                      </span>
                    </label>

                    <button
                      type="button"
                      disabled={isExecutingBatch || isEngineAnalyzing || !onBatchAnalyzeGames}
                      onClick={async () => {
                        if (!onBatchAnalyzeGames) return;
                        setIsExecutingBatch(true);
                        try {
                          await onBatchAnalyzeGames(selectedGameIds, batchDepth, batchEngineId, batchForceRestart);
                          refreshGames();
                          setSelectedGameIds([]);
                        } finally {
                          setIsExecutingBatch(false);
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold shadow-lg transition disabled:opacity-50 flex items-center gap-1.5 active:scale-95"
                    >
                      <span>🤖</span>
                      <span>
                        {isExecutingBatch || isEngineAnalyzing
                          ? t('studio.kifu_mgmt.batch_running_short', '解析実行中...')
                          : t('studio.kifu_mgmt.batch_analyze_btn', '選択した棋譜を一括AI解析')}
                      </span>
                    </button>

                    {user?.uid && (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={cloudAnalysisLevel}
                          onChange={(e) => setCloudAnalysisLevel(e.target.value as CloudAnalysisLevel)}
                          disabled={isCloudQueuing || isExecutingBatch || isEngineAnalyzing}
                          className="bg-slate-950 border border-indigo-700/70 rounded-lg px-2 py-2 text-indigo-200 text-xs font-semibold focus:outline-none cursor-pointer"
                          title={t('studio.kifu_mgmt.cloud_level_label', 'クラウド解析レベル')}
                        >
                          <option value="light">{t('studio.kifu_mgmt.level_light_short', '軽量 (10万)')}</option>
                          <option value="standard">{t('studio.kifu_mgmt.level_standard_short', '普通 (20万)')}</option>
                          <option value="deep">{t('studio.kifu_mgmt.level_deep_short', 'じっくり (50万)')}</option>
                        </select>
                        <button
                          type="button"
                          disabled={isCloudQueuing || isExecutingBatch || isEngineAnalyzing}
                          onClick={async () => {
                            await handleQueueCloudAnalysis(selectedGameIds, {
                              forceReanalyze: batchForceRestart,
                              level: cloudAnalysisLevel,
                            });
                            setSelectedGameIds([]);
                          }}
                          className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg transition disabled:opacity-50 flex items-center gap-1.5 active:scale-95"
                          title={t(
                            'studio.kifu_mgmt.queue_cloud_tooltip',
                            '選択した棋譜をクラウド解析キューに送信します（「全手再解析」チェックでクラウド解析済も再送）'
                          )}
                        >
                          <span>☁️</span>
                          <span>
                            {isCloudQueuing
                              ? t('studio.kifu_mgmt.sending_status', '送信中...')
                              : t('studio.kifu_mgmt.send_cloud_btn', 'クラウド解析に送る')}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {cloudQueueMsg && (
                <div className="sticky bottom-2 z-20 mt-2 px-3 py-2 rounded-xl bg-indigo-950/95 border border-indigo-500/60 text-indigo-200 text-xs font-medium shadow-lg">
                  {cloudQueueMsg}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Ingest / Import */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              {/* Sample quick buttons */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">
                  {t('studio.kifu_mgmt.sample_kifu_label', 'サンプル棋譜:')}
                </span>
                <button
                  type="button"
                  onClick={() => setImportText(SAMPLE_AIGAKARI)}
                  className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold transition"
                >
                  {t('studio.import_modal.sample_aigakari', '相掛かり')}
                </button>
                <button
                  type="button"
                  onClick={() => setImportText(SAMPLE_KAKUGAWARI)}
                  className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold transition"
                >
                  {t('studio.import_modal.sample_kakugawari', '角換わり')}
                </button>
              </div>

              {/* Paste or Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                className={`relative border-2 border-dashed rounded-xl transition-all ${
                  isDragging
                    ? 'border-amber-400 bg-amber-500/10'
                    : 'border-slate-700 bg-slate-950/50 hover:border-slate-600'
                }`}
              >
                <textarea
                  rows={5}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={t(
                    'studio.kifu_mgmt.import_textarea_placeholder',
                    'ここにKIF/CSAテキストを貼り付け、またはファイルをドロップしてください...'
                  )}
                  className="w-full bg-transparent p-3 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:outline-none resize-none"
                />

                <div className="p-2 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition"
                    >
                      📁 {t('studio.kifu_mgmt.select_file_btn', 'ファイル選択 (.kif, .csa, .jkf)')}
                    </button>
                    <button
                      type="button"
                      onClick={() => bulkFileInputRef.current?.click()}
                      disabled={bulkProgress !== null}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs transition"
                    >
                      📄 {t('studio.kifu_mgmt.multiple_files_btn', '複数ファイル')}
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkFolderPick}
                      disabled={bulkProgress !== null}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs transition"
                    >
                      🗀️ {t('studio.kifu_mgmt.folder_btn', 'フォルダ')}
                    </button>
                    {bulkProgress && (
                      <span className="text-[10px] text-emerald-400">
                        {t('studio.kifu_mgmt.processing_progress', '処理中 {{done}}/{{total}}', {
                          done: bulkProgress.done,
                          total: bulkProgress.total,
                        })}
                      </span>
                    )}
                    {detectedEncoding && (
                      <span className="text-[10px] text-amber-400 font-mono">
                        ({detectedEncoding})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {importText && (
                      <button
                        type="button"
                        onClick={() => {
                          setImportText('');
                          setDetectedEncoding(null);
                          setImportCustomTitle('');
                          setImportGameKind('other');
                          setImportSelectedTags(['研究']);
                          setImportSentePlayerId(null);
                          setImportGotePlayerId(null);
                          lastInitializedKifuRef.current = null;
                        }}
                        className="text-slate-400 hover:text-rose-400 text-xs transition"
                        title={t('studio.kifu_mgmt.clear_input_btn', 'クリア')}
                      >
                        🗑️ {t('studio.kifu_mgmt.clear_input_btn', 'クリア')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const clip = await navigator.clipboard.readText();
                          if (clip) setImportText(clip);
                        } catch {
                          // Ignore
                        }
                      }}
                      className="text-amber-400 hover:underline text-xs"
                    >
                      📋 {t('studio.kifu_mgmt.paste_clipboard_btn', 'クリップボード貼付')}
                    </button>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".kif,.kifu,.csa,.ki2,.jkf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      processFile(e.target.files[0]);
                    }
                  }}
                />
                <input
                  ref={bulkFileInputRef}
                  type="file"
                  multiple
                  accept=".kif,.kifu,.ki2,.csa,.txt,.jkf"
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) void runBulkStudioImport(files);
                    e.target.value = '';
                  }}
                />
                <input
                  ref={bulkDirInputRef}
                  type="file"
                  multiple
                  // @ts-expect-error non-standard but widely supported directory attr
                  webkitdirectory=""
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) void runBulkStudioImport(files);
                    e.target.value = '';
                  }}
                />
              </div>

              {/* Bulk import summary (#52) */}
              {bulkSummary && (
                <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300 font-semibold">
                      📦 {t('studio.kifu_mgmt.bulk_import_result', '一括取り込み結果')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setBulkSummary(null)}
                      className="text-slate-500 hover:text-slate-300"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-emerald-400">
                      {t('studio.kifu_mgmt.bulk_success', '成功 {{count}}', { count: bulkSummary.success })}
                    </span>
                    <span className="text-amber-400">
                      {t('studio.kifu_mgmt.bulk_duplicate', '重複スキップ {{count}}', { count: bulkSummary.duplicate })}
                    </span>
                    <span className="text-rose-400">
                      {t('studio.kifu_mgmt.bulk_failed', '失敗 {{count}}', { count: bulkSummary.failed })}
                    </span>
                  </div>
                  {bulkSummary.failures.map((f, i) => (
                    <div key={`${f.fileName}-${i}`} className="text-slate-500 truncate" title={f.fileName}>
                      ✕ {f.fileName} — {f.reason}
                    </div>
                  ))}
                  {bulkSummary.sizeWarning && (
                    <div className="text-amber-400">
                      {t(
                        'studio.kifu_mgmt.storage_size_warning',
                        '⚠️ 取り込んだ棋譜のデータ量が大きくなっています。ブラウザのストレージ上限にご注意ください。'
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Error Message */}
              {importError && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs">
                  {t('studio.kifu_mgmt.import_error_msg', '⚠️ 棋譜の解析に失敗しました: {{error}}', {
                    error: importError,
                  })}
                </div>
              )}

              {/* Preview and Editable Save & Load */}
              {importMeta && (
                <div className="bg-slate-950/70 border border-amber-500/50 rounded-xl p-3.5 space-y-3">
                  <div className="text-xs text-amber-300 font-semibold flex items-center justify-between">
                    <span>✨ {t('studio.kifu_mgmt.parse_complete_preview', '解析完了プレビュー')}</span>
                    <span className="font-mono text-slate-400">
                      {t('studio.match.plies_count', '{{count}} 手', { count: importMeta.totalPlies })}
                    </span>
                  </div>

                  {/* Player Identification & Prompt during Import */}
                  {(() => {
                    const senteMatch = findMatchingPlayer(importMeta.sente, playerProfiles);
                    const goteMatch = findMatchingPlayer(importMeta.gote, playerProfiles);

                    return (
                      <div className="space-y-2 pt-1 border-t border-slate-800">
                        <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                          <span>👤 {t('studio.kifu_mgmt.player_match_verification', '対局者ユーザー照合:')}</span>
                          <span className="text-[10px] text-slate-500 font-normal">
                            {t('studio.kifu_mgmt.player_match_hint', '段位・称号を除外した名前で判定')}
                          </span>
                        </div>

                        {/* Sente Match Verification */}
                        <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-amber-300">☗ {t('studio.kifu_mgmt.sente_label', '先手:')} {importMeta.sente}</span>
                            {(() => {
                              const activeProf = playerProfiles.find((p) => p.id === (importSentePlayerId || senteMatch.profile?.id));
                              return activeProf ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 font-semibold">
                                  ✓ {t('studio.kifu_mgmt.linked_target', '紐づけ先:')} {activeProf.name} (
                                  {activeProf.category === 'user'
                                    ? t('studio.kifu_mgmt.filter_user', 'マイユーザー')
                                    : activeProf.category === 'ai'
                                    ? 'CPU'
                                    : t('studio.kifu_mgmt.filter_pro', 'プロ棋士')}
                                  )
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/60 font-semibold">
                                  ⚠️ {t('studio.kifu_mgmt.unregistered_new', '未登録 (新規作成)')}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="text-slate-400 text-[10px]">{t('studio.kifu_mgmt.original_notation', '原表記:')}</span>
                            <span className="font-mono text-slate-300">{senteMatch.normalizedName}</span>
                            {senteMatch.detectedTitle && (
                              <span className="text-slate-500 text-[10px]">({senteMatch.detectedTitle})</span>
                            )}
                            <div className="ml-auto flex items-center gap-1">
                              <span className="text-[10px] text-slate-400">{t('studio.kifu_mgmt.linked_target', '紐づけ先:')}</span>
                              <select
                                value={importSentePlayerId || (senteMatch.profile ? senteMatch.profile.id : 'create-pro')}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val.startsWith('create-')) {
                                    const cat = val.replace('create-', '') as 'user' | 'ai' | 'pro';
                                    const created = registerNewPlayer({
                                      name: senteMatch.normalizedName,
                                      category: cat,
                                      title: senteMatch.detectedTitle,
                                      rawAlias: importMeta.sente,
                                    });
                                    setPlayerProfiles(loadPlayerProfiles());
                                    setImportSentePlayerId(created.id);
                                  } else {
                                    setImportSentePlayerId(val);
                                  }
                                }}
                                className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-200"
                              >
                                {senteMatch.profile && (
                                  <option value={senteMatch.profile.id}>
                                    ✓ {t('studio.kifu_mgmt.auto_matched', '自動判定')}: {senteMatch.profile.name}
                                  </option>
                                )}
                                {!senteMatch.profile && (
                                  <>
                                    <option value="create-pro">🏯 {t('studio.kifu_mgmt.create_as_pro', 'プロ棋士として新規作成')}</option>
                                    <option value="create-user">👤 {t('studio.kifu_mgmt.create_as_user', 'マイユーザーとして新規作成')}</option>
                                    <option value="create-ai">🤖 {t('studio.kifu_mgmt.create_as_ai', 'コンピュータ/CPUとして新規作成')}</option>
                                  </>
                                )}
                                <optgroup label={`👤 ${t('studio.kifu_mgmt.link_from_user', 'マイユーザーから紐づける')}`}>
                                  {playerProfiles
                                    .filter((p) => p.category === 'user')
                                    .map((p) => (
                                      <option key={`import-sente-user-${p.id}`} value={p.id}>
                                        {p.name} {p.title ? `(${p.title})` : ''}
                                      </option>
                                    ))}
                                </optgroup>
                                <optgroup label={`🤖 ${t('studio.kifu_mgmt.link_from_ai', 'コンピュータから紐づける')}`}>
                                  {playerProfiles
                                    .filter((p) => p.category === 'ai')
                                    .map((p) => (
                                      <option key={`import-sente-ai-${p.id}`} value={p.id}>
                                        {p.name} {p.title ? `(${p.title})` : ''}
                                      </option>
                                    ))}
                                </optgroup>
                                <optgroup label={`🏯 ${t('studio.kifu_mgmt.link_from_pro', 'プロ棋士から紐づける')}`}>
                                  {playerProfiles
                                    .filter((p) => p.category === 'pro')
                                    .map((p) => (
                                      <option key={`import-sente-pro-${p.id}`} value={p.id}>
                                        {p.name} {p.title ? `(${p.title})` : ''}
                                      </option>
                                    ))}
                                </optgroup>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Gote Match Verification */}
                        <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-sky-300">☖ {t('studio.kifu_mgmt.gote_label', '後手:')} {importMeta.gote}</span>
                            {(() => {
                              const activeProf = playerProfiles.find((p) => p.id === (importGotePlayerId || goteMatch.profile?.id));
                              return activeProf ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 font-semibold">
                                  ✓ {t('studio.kifu_mgmt.linked_target', '紐づけ先:')} {activeProf.name} (
                                  {activeProf.category === 'user'
                                    ? t('studio.kifu_mgmt.filter_user', 'マイユーザー')
                                    : activeProf.category === 'ai'
                                    ? 'CPU'
                                    : t('studio.kifu_mgmt.filter_pro', 'プロ棋士')}
                                  )
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-400 border border-amber-800/60 font-semibold">
                                  ⚠️ {t('studio.kifu_mgmt.unregistered_new', '未登録 (新規作成)')}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="text-slate-400 text-[10px]">{t('studio.kifu_mgmt.original_notation', '原表記:')}</span>
                            <span className="font-mono text-slate-300">{goteMatch.normalizedName}</span>
                            {goteMatch.detectedTitle && (
                              <span className="text-slate-500 text-[10px]">({goteMatch.detectedTitle})</span>
                            )}
                            <div className="ml-auto flex items-center gap-1">
                              <span className="text-[10px] text-slate-400">{t('studio.kifu_mgmt.linked_target', '紐づけ先:')}</span>
                              <select
                                value={importGotePlayerId || (goteMatch.profile ? goteMatch.profile.id : 'create-pro')}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val.startsWith('create-')) {
                                    const cat = val.replace('create-', '') as 'user' | 'ai' | 'pro';
                                    const created = registerNewPlayer({
                                      name: goteMatch.normalizedName,
                                      category: cat,
                                      title: goteMatch.detectedTitle,
                                      rawAlias: importMeta.gote,
                                    });
                                    setPlayerProfiles(loadPlayerProfiles());
                                    setImportGotePlayerId(created.id);
                                  } else {
                                    setImportGotePlayerId(val);
                                  }
                                }}
                                className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-200"
                              >
                                {goteMatch.profile && (
                                  <option value={goteMatch.profile.id}>
                                    ✓ {t('studio.kifu_mgmt.auto_matched', '自動判定')}: {goteMatch.profile.name}
                                  </option>
                                )}
                                {!goteMatch.profile && (
                                  <>
                                    <option value="create-pro">🏯 {t('studio.kifu_mgmt.create_as_pro', 'プロ棋士として新規作成')}</option>
                                    <option value="create-user">👤 {t('studio.kifu_mgmt.create_as_user', 'マイユーザーとして新規作成')}</option>
                                    <option value="create-ai">🤖 {t('studio.kifu_mgmt.create_as_ai', 'コンピュータ/CPUとして新規作成')}</option>
                                  </>
                                )}
                                <optgroup label={`👤 ${t('studio.kifu_mgmt.link_from_user', 'マイユーザーから紐づける')}`}>
                                  {playerProfiles
                                    .filter((p) => p.category === 'user')
                                    .map((p) => (
                                      <option key={`import-gote-user-${p.id}`} value={p.id}>
                                        {p.name} {p.title ? `(${p.title})` : ''}
                                      </option>
                                    ))}
                                </optgroup>
                                <optgroup label={`🤖 ${t('studio.kifu_mgmt.link_from_ai', 'コンピュータから紐づける')}`}>
                                  {playerProfiles
                                    .filter((p) => p.category === 'ai')
                                    .map((p) => (
                                      <option key={`import-gote-ai-${p.id}`} value={p.id}>
                                        {p.name} {p.title ? `(${p.title})` : ''}
                                      </option>
                                    ))}
                                </optgroup>
                                <optgroup label={`🏯 ${t('studio.kifu_mgmt.link_from_pro', 'プロ棋士から紐づける')}`}>
                                  {playerProfiles
                                    .filter((p) => p.category === 'pro')
                                    .map((p) => (
                                      <option key={`import-gote-pro-${p.id}`} value={p.id}>
                                        {p.name} {p.title ? `(${p.title})` : ''}
                                      </option>
                                    ))}
                                </optgroup>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Editable Title */}
                  <div className="space-y-1 pt-1 border-t border-slate-800">
                    <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                      <span>{t('studio.kifu_mgmt.kifu_title_editable', '棋譜タイトル（編集可能）:')}</span>
                      <button
                        type="button"
                        onClick={() => setImportCustomTitle(importMeta.autoTitle)}
                        className="text-[10px] text-amber-400 hover:underline font-normal"
                      >
                        {t('studio.kifu_mgmt.restore_autogen', '自動生成に戻す')}
                      </button>
                    </label>
                    <input
                      type="text"
                      value={importCustomTitle}
                      onChange={(e) => setImportCustomTitle(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Game Kind + Dynamic Tag Selection for Import */}
                  <div className="space-y-2">
                    {renderGameKindSelector(importGameKind, setImportGameKind, 'imp-gk')}
                    <label className="text-[11px] font-semibold text-slate-400 block">
                      {t('studio.kifu_mgmt.select_save_tags', '保存タグの選択:')}
                    </label>
                    <CategorizedTagCombobox
                      tagGroups={filterTagGroupsByGameKind(
                        tagGroups,
                        importGameKind,
                        importSelectedTags
                      )}
                      selectedTags={importSelectedTags}
                      onChange={setImportSelectedTags}
                      onAddCustomTag={(cat, tag) => {
                        const updated = addCustomTagToCategory(cat, tag);
                        setTagGroups(updated);
                      }}
                      placeholder={t('studio.kifu_mgmt.tag_combobox_placeholder', '保存タグを選択または新規追加...')}
                    />
                  </div>

                  {/* Auto AI Analysis Toggle during Import */}
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={importWithAnalysis}
                          onChange={(e) => setImportWithAnalysis(e.target.checked)}
                          className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-700 focus:ring-amber-500 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                          <span>🤖</span>
                          <span>{t('studio.kifu_mgmt.auto_ai_analysis_checkbox', '取り込みと同時にAI全手解析を実行する')}</span>
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {t('studio.kifu_mgmt.auto_detect_blunders_hint', '好手・悪手を自動検出')}
                      </span>
                    </label>

                    {importWithAnalysis && (
                      <div className="pl-6 pt-1.5 border-t border-slate-800/80 space-y-2 text-xs text-slate-300">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={!user?.uid}
                            onClick={() => setImportAnalysisTarget('cloud')}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition ${
                              importAnalysisTarget === 'cloud' && user?.uid
                                ? 'bg-indigo-950 text-indigo-200 border-indigo-500/70'
                                : 'bg-slate-950 text-slate-400 border-slate-700 hover:border-slate-500'
                            } disabled:opacity-40`}
                            title={user?.uid ? 'クラウドでやねうら王+水匠5により解析します' : 'Googleログインで利用できます'}
                          >
                            ☁️ クラウド解析 (やねうら王・水匠)
                          </button>
                          <button
                            type="button"
                            onClick={() => setImportAnalysisTarget('local')}
                            className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition ${
                              importAnalysisTarget === 'local' || !user?.uid
                                ? 'bg-amber-950/70 text-amber-200 border-amber-500/70'
                                : 'bg-slate-950 text-slate-400 border-slate-700 hover:border-slate-500'
                            }`}
                          >
                            🖥️ ブラウザ解析 (ローカル)
                          </button>
                        </div>

                        {importAnalysisTarget === 'cloud' && user?.uid && (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] text-slate-400">
                              {t('studio.kifu_mgmt.cloud_level_label', 'クラウド解析レベル:')}
                            </span>
                            <select
                              value={cloudAnalysisLevel}
                              onChange={(e) => setCloudAnalysisLevel(e.target.value as CloudAnalysisLevel)}
                              className="bg-slate-950 border border-indigo-700/70 rounded px-2 py-0.5 text-xs text-indigo-200 font-semibold"
                            >
                              <option value="light">{t('studio.kifu_mgmt.level_light', '軽量 (10万ノード・高速)')}</option>
                              <option value="standard">{t('studio.kifu_mgmt.level_standard', '普通 (20万ノード・標準)')}</option>
                              <option value="deep">{t('studio.kifu_mgmt.level_deep', 'じっくり (50万ノード・高精度)')}</option>
                            </select>
                          </div>
                        )}

                        {(importAnalysisTarget === 'local' || !user?.uid) && (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] text-slate-400">
                              {t('studio.kifu_mgmt.local_engine_depth_label', '解析エンジン & 深さ:')}
                            </span>
                            <div className="flex items-center gap-2">
                              <select
                                value={importAnalysisEngineId}
                                onChange={(e) => setImportAnalysisEngineId(e.target.value as EngineId)}
                                className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-xs text-amber-300 font-semibold max-w-[130px] truncate"
                              >
                                {availableEngines.map((eng) => (
                                  <option key={`import-eng-${eng.id}`} value={eng.id}>
                                    {resolveEngineDisplayName(eng, t)}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={importAnalysisDepth}
                                onChange={(e) => setImportAnalysisDepth(parseInt(e.target.value, 10))}
                                className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-xs text-amber-300 font-semibold"
                              >
                                <option value={8}>{t('studio.kifu_mgmt.depth_8', '深さ 8 (軽量・高速)')}</option>
                                <option value={10}>{t('studio.kifu_mgmt.depth_10', '深さ 10 (標準・推奨)')}</option>
                                <option value={12}>{t('studio.kifu_mgmt.depth_12', '深さ 12 (深層・高精度)')}</option>
                                <option value={16}>{t('studio.kifu_mgmt.depth_16', '深さ 16 (最高精度)')}</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleExecuteImport}
                    className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-lg transition active:scale-98 flex items-center justify-center gap-1.5"
                  >
                    <span>🚀</span>
                    <span>
                      {!importWithAnalysis
                        ? t('studio.kifu_mgmt.import_save_only_btn', 'ライブラリに保存して盤面に取り込む')
                        : importAnalysisTarget === 'cloud' && user?.uid
                        ? t('studio.kifu_mgmt.import_save_and_cloud_btn', '保存して盤面に取り込み & ☁️ クラウド解析に送る')
                        : t('studio.kifu_mgmt.import_save_and_ai_btn', '保存して盤面に取り込み & AI解析開始')}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Save / Update Current Study */}
          {activeTab === 'save' && (
            <div className="space-y-4">
              <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl space-y-2">
                <div className="text-xs text-amber-300 font-semibold flex items-center justify-between">
                  <span>📌 {t('studio.kifu_mgmt.current_study_board', '現在の検討盤面')}</span>
                  {activeSavedGame && (
                    <span className="text-[11px] text-emerald-400">
                      {t('studio.kifu_mgmt.saved_source', '保存元:')} {activeSavedGame.title}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                  <div>
                    {t('studio.kifu_mgmt.sente_label', '先手:')} <span className="font-semibold">{currentGameData?.senteName}</span>
                  </div>
                  <div>
                    {t('studio.kifu_mgmt.gote_label', '後手:')} <span className="font-semibold">{currentGameData?.goteName}</span>
                  </div>
                  <div>
                    {t('studio.kifu_mgmt.axis_opening', '戦型')}: <span className="font-semibold">{currentGameData?.openingName}</span>
                  </div>
                  <div>
                    {t('studio.match.plies_label', '手数:')}{' '}
                    <span className="font-semibold">
                      {t('studio.match.plies_count', '{{count}} 手', { count: currentGameData?.totalPlies ?? 0 })}
                    </span>
                  </div>
                  <div>
                    {t('studio.kifu_mgmt.branch_points', '分岐点:')}{' '}
                    <span className="font-semibold text-amber-400">
                      +{currentGameData?.forkCount} {t('studio.kifu_mgmt.branch_count_unit', '箇所')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Overwrite vs New Choice */}
              {activeSavedGame && (
                <div className="flex gap-2 p-1.5 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setSaveMode('overwrite')}
                    className={`flex-1 py-1.5 rounded-lg font-semibold transition ${
                      saveMode === 'overwrite'
                        ? 'bg-amber-600 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t('studio.kifu_mgmt.overwrite_existing_btn', '既存の棋譜を上書き保存')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSaveMode('new');
                      if (currentGameData) {
                        setSaveTitle(`${activeSavedGame.title} (新分岐)`);
                      }
                    }}
                    className={`flex-1 py-1.5 rounded-lg font-semibold transition ${
                      saveMode === 'new'
                        ? 'bg-amber-600 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t('studio.kifu_mgmt.save_as_new_btn', '別名で新規保存')}
                  </button>
                </div>
              )}

              <form onSubmit={handleSaveCurrent} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300 block">
                    {t('studio.kifu_mgmt.kifu_title_label', '棋譜タイトル:')}
                  </label>
                  <input
                    type="text"
                    required
                    value={saveTitle}
                    onChange={(e) => setSaveTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 transition"
                    placeholder={t('studio.kifu_mgmt.enter_title_placeholder', 'タイトルを入力...')}
                  />
                </div>

                {/* Game Kind + Dynamic Tags using CategorizedTagCombobox */}
                <div className="space-y-2">
                  {renderGameKindSelector(saveGameKind, setSaveGameKind, 'save-gk')}
                  <label className="text-xs font-semibold text-slate-300 block">
                    {t('studio.kifu_mgmt.select_tags_label', 'タグの選択:')}
                  </label>
                  <CategorizedTagCombobox
                    tagGroups={filterTagGroupsByGameKind(
                      tagGroups,
                      saveGameKind,
                      saveTags
                    )}
                    selectedTags={saveTags}
                    onChange={setSaveTags}
                    onAddCustomTag={(cat, tag) => {
                      const updated = addCustomTagToCategory(cat, tag);
                      setTagGroups(updated);
                    }}
                    placeholder={t('studio.kifu_mgmt.select_or_add_tags_placeholder', 'タグを選択または新規追加...')}
                  />
                </div>

                {feedbackMsg && (
                  <div className="p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold text-center">
                    ✨ {feedbackMsg}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs sm:text-sm shadow-lg transition active:scale-98 flex items-center justify-center gap-1.5"
                >
                  <span>💾</span>
                  <span>
                    {saveMode === 'overwrite' && activeSavedGame
                      ? t('studio.kifu_mgmt.overwrite_existing_btn', '既存の棋譜を上書き保存')
                      : t('studio.kifu_mgmt.save_to_library_btn', 'ライブラリに保存')}
                  </span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 4: Players & Users Management */}
          {activeTab === 'players' && (
            <div className="space-y-4">
              <div
                ref={playerFormRef}
                className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 space-y-3"
              >
                <div className="text-xs font-bold text-amber-300 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    ➕ {editingPlayerId
                      ? t('players_page.form_edit_title', 'プレイヤー情報の編集')
                      : t('players_page.form_add_title', '新しいプレイヤーの作成')}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const res = reclassifyAiPlayersAndSyncRecords();
                        setPlayerProfiles(loadPlayerProfiles());
                        refreshGames();
                        window.alert(
                          t(
                            'players_page.ai_fix_done',
                            `AI区分を ${res.updatedPlayers} 名修正し、棋譜 ${res.updatedRecords} 件の種別を再判定しました。`,
                            { players: res.updatedPlayers, records: res.updatedRecords }
                          )
                        );
                      }}
                      className="px-2 py-0.5 rounded bg-sky-950/70 hover:bg-sky-900 border border-sky-500/40 text-sky-300 text-[10px] font-semibold transition"
                    >
                      🤖 {t('players_page.ai_fix_btn', '対局ソフト/AI名を自動修正')}
                    </button>
                    {editingPlayerId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPlayerId(null);
                          setNewPlayerName('');
                          setNewPlayerTitle('');
                          setNewPlayerNote('');
                        }}
                        className="text-[10px] text-slate-400 hover:text-slate-200"
                      >
                        キャンセル
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-semibold">{t('players_page.field_name', '名前 (必須)')}:</label>
                    <input
                      type="text"
                      value={newPlayerName}
                      onChange={(e) => setNewPlayerName(e.target.value)}
                      placeholder={t('studio.kifu_mgmt.player_name_placeholder', '例: 山田太郎, あなた')}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-semibold">{t('players_page.field_category', '区分')}:</label>
                    <select
                      value={newPlayerCategory}
                      onChange={(e) => setNewPlayerCategory(e.target.value as 'user' | 'pro' | 'ai')}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    >
                      <option value="user">👤 {t('studio.kifu_mgmt.player_cat_user', 'マイユーザー (自分・家族・友人)')}</option>
                      <option value="ai">🤖 {t('studio.kifu_mgmt.player_cat_ai', 'コンピュータ / AI (将棋対戦ソフト・CPU)')}</option>
                      <option value="pro">🏯 {t('studio.kifu_mgmt.player_cat_pro', 'プロ棋士・その他一般棋士')}</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-semibold">{t('players_page.field_title', '段位・肩書 (任意)')}:</label>
                    <input
                      type="text"
                      value={newPlayerTitle}
                      onChange={(e) => setNewPlayerTitle(e.target.value)}
                      placeholder={t('studio.kifu_mgmt.player_title_placeholder', '例: 初段, 九段, アマ三段')}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-semibold">{t('players_page.field_note', 'メモ・戦型傾向 (任意)')}:</label>
                  <input
                    type="text"
                    value={newPlayerNote}
                    onChange={(e) => setNewPlayerNote(e.target.value)}
                    placeholder={t('studio.kifu_mgmt.player_note_placeholder', '例: 居飛車党、得意戦法: 四間飛車')}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!newPlayerName.trim()) return;
                    const idToSave = editingPlayerId || `player-${Date.now()}`;
                    const existingProf = editingPlayerId
                      ? playerProfiles.find((p) => p.id === editingPlayerId)
                      : undefined;
                    const targetProfile: ShogiPlayerProfile = {
                      id: idToSave,
                      name: newPlayerName.trim(),
                      category: newPlayerCategory,
                      title: newPlayerTitle.trim() || undefined,
                      aliases: existingProf?.aliases,
                      note: newPlayerNote.trim() || undefined,
                      isOwner: existingProf?.isOwner,
                      createdAt: existingProf?.createdAt || new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                    };
                    upsertPlayerProfile(targetProfile);
                    reclassifyRecordsForPlayer(targetProfile.id);
                    setPlayerProfiles(loadPlayerProfiles());
                    refreshGames();
                    if (user?.uid) {
                      const saved = loadPlayerProfiles().find((p) => p.id === targetProfile.id);
                      if (saved) void uploadPlayerToFirestore(user.uid, saved);
                    }
                    setNewPlayerName('');
                    setNewPlayerTitle('');
                    setNewPlayerNote('');
                    setEditingPlayerId(null);
                  }}
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs shadow transition"
                >
                  {editingPlayerId
                    ? t('studio.kifu_mgmt.player_save_edit', '変更を保存')
                    : t('studio.kifu_mgmt.player_register_new', '＋ プレイヤーを登録')}
                </button>
              </div>

              {/* Registered Players List with Category Tabs */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-slate-400 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {t('studio.kifu_mgmt.registered_players_count', '登録済み対局者一覧 ({{count}}名)', {
                      count: playerProfiles.length,
                    })}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      [
                        {
                          id: 'all',
                          label: 'すべて',
                          count: playerProfiles.length,
                        },
                        {
                          id: 'user',
                          label: '👤 マイユーザー',
                          count: playerProfiles.filter((p) => p.category === 'user').length,
                        },
                        {
                          id: 'ai',
                          label: '🤖 コンピュータ/AI',
                          count: playerProfiles.filter((p) => p.category === 'ai').length,
                        },
                        {
                          id: 'pro',
                          label: '🏯 プロ棋士・その他',
                          count: playerProfiles.filter((p) => p.category === 'pro').length,
                        },
                      ] as const
                    ).map((tab) => {
                      const active = playerCategoryTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setPlayerCategoryTab(tab.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                            active
                              ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                              : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <span>{tab.label}</span>
                          <span className="text-[10px] font-mono opacity-80">
                            {tab.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  {playerProfiles
                    .filter(
                      (p) =>
                        playerCategoryTab === 'all' ||
                        p.category === playerCategoryTab
                    )
                    .map((prof) => renderPlayerCard(prof))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal / Backdrop */}
        {confirmDeleteGame && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-5 max-w-md w-full space-y-4 text-slate-100">
              <div className="flex items-center gap-3 text-rose-400">
                <span className="text-2xl">⚠️</span>
                <h3 className="font-bold text-base text-rose-300">
                  {t('studio.kifu_mgmt.confirm_delete_title', '棋譜削除の確認')}
                </h3>
              </div>

              <div className="text-xs sm:text-sm text-slate-300 space-y-2 bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                <p className="text-slate-200">
                  {t('studio.kifu_mgmt.confirm_delete_desc', '以下の棋譜をライブラリから完全に削除しますか？')}
                </p>
                <div className="font-bold text-amber-300 pt-1 border-t border-slate-800">
                  {confirmDeleteGame.title}
                </div>
                <div className="text-[11px] text-slate-400">
                  ☗ {confirmDeleteGame.senteName} vs ☖ {confirmDeleteGame.goteName} ({confirmDeleteGame.totalPlies}手)
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteGame(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  {t('common.cancel', 'キャンセル')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow transition flex items-center gap-1.5"
                >
                  <span>🗑️</span>
                  <span>{t('studio.kifu_mgmt.delete_btn', '削除する')}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Duplicate Kifu Resolution Dialog (#44) */}
        {pendingDuplicateSave && (
          <DuplicateKifuDialog
            duplicates={pendingDuplicateSave.duplicates}
            candidateTitle={pendingDuplicateSave.game.title}
            onOpenExisting={handleDupOpenExisting}
            onSaveAnyway={handleDupSaveAnyway}
            onMerge={handleDupMerge}
            onCancel={handleDupCancel}
          />
        )}

        {/* Bulk Import Review Panel (#51/#52) */}
        {reviewItems && reviewItems.length > 0 && (
          <BulkImportReviewPanel
            items={reviewItems}
            playerProfiles={playerProfiles}
            tagGroups={tagGroups}
            confirmLabel="取り込む"
            analysisTarget={bulkAnalysisTarget}
            isCloudEnabled={Boolean(user?.uid)}
            isSubmitting={isBulkSubmitting}
            onAnalysisTargetChange={setBulkAnalysisTarget}
            onChange={setReviewItems}
            onConfirm={() => {
              void confirmBulkImport();
            }}
            onCancel={() => setReviewItems(null)}
          />
        )}
      </div>
    </div>
  );
};
