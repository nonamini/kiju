/**
 * Single-Screen Shogi Studio Page (1画面完結型スタジオ).
 * Central high-fidelity Kaya board + Left branch tree + Right contextual mode panel.
 * Connects directly to shogi.js and json-kifu-format.
 * Follows Rule 1: strictly English code, comments, and identifiers.
 * Follows Rule 2: strict TypeScript, zero any, zero hallucinated properties.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { JKFPlayer, ForkPointer, Formats } from 'json-kifu-format';
import { Shogi } from 'shogi.js';
import {
  StudioShogiBoardView,
  StudioBoardSquare,
  StudioCandidateArrow,
} from '../components/board/StudioShogiBoardView';
import { StudioKomadaiView } from '../components/board/StudioKomadaiView';
import { getPieceSpriteCoords } from '../components/board/pieceSprites';
import { useBoardAppearance } from '../hooks/useBoardAppearance';
import {
  buildFullBoardCellsFromShogi,
  copyPngFromSvgToClipboard,
  downloadPngFromSvg,
  downloadSvgString,
  renderFullBoardToSvg,
} from '../utils/boardImageExport';
import { copyKifToClipboard } from '../utils/exportHelpers';
import { formatKifMove } from '../utils/kifSerializer';
import { playPieceMoveSound } from '../utils/shogiSound';
import { StudioKifuManagementModal, BatchAnalysisProgressInfo } from '../components/kifu/StudioKifuManagementModal';
import { StudioAiEvalPanel } from '../components/eval/StudioAiEvalPanel';
import { StudioSaveTacticModal } from '../components/kifu/StudioSaveTacticModal';
import { StudioSaveKifuModal } from '../components/kifu/StudioSaveKifuModal';
import { StudioTacticsLibraryModal } from '../components/tactics/StudioTacticsLibraryModal';
import { createStudioGameFromTactic } from '../utils/tacticsJkfConverter';
import { loadTacticsItems } from '../utils/tacticsStorage';
import {
  StudioMatchResultModal,
  StudioMatchOutcome,
} from '../components/kifu/StudioMatchResultModal';
import { StudioMatchReviewModal } from '../components/sparring/StudioMatchReviewModal';
import { ShogiRulebookModal } from '../components/common/ShogiRulebookModal';
import { StudioQuizPoolModal } from '../components/quiz/StudioQuizPoolModal';
import { StudioInlineQuizPanel } from '../components/quiz/StudioInlineQuizPanel';
import { QuizStudioEditView } from '../components/quiz/QuizStudioEditView';
import { JosekiTreeVisualizer } from '../components/tree/JosekiTreeVisualizer';
import { SplitStudyReferencePane } from '../components/studio/SplitStudyReferencePane';
import {
  MAX_STUDIO_QUICK_PINS,
  StudioMenuCategory,
  StudioQuickAccessMenu,
} from '../components/studio/StudioQuickAccessMenu';
import { DEFAULT_APP_SETTINGS } from '../utils/appSettingsStorage';
import { TacticalQuizCard } from '../types/quiz';
import { TsumegoProblem } from '../types/tsumego';
import {
  loadImportedTsumegoHashes,
  loadTsumegoProblems,
  recordImportedTsumegoHashes,
  saveTsumegoProblems,
} from '../utils/tsumegoStorage';
import {
  hashTsumegoSfen,
  importKifTsumegoFile,
  importSfenTsumegoFile,
} from '../utils/tsumegoImporter';
import {
  TSUMEGO_PLY_FILTER_OPTIONS,
  TsumegoPlyFilter,
  filterTsumegoByPly,
  pickNextTsumegoProblem,
} from '../utils/tsumegoSelection';
import { TsumegoSolvePanel } from '../components/tsumego/TsumegoSolvePanel';
import { TsumegoSetupModal } from '../components/board/TsumegoSetupModal';
import {
  EditBoardPreviewState,
  PositionEditAnalysisPanel,
} from '../components/board/PositionEditAnalysisPanel';
import {
  PositionSaveCategory,
  PositionSaveInitialTarget,
  PositionSaveModal,
} from '../components/board/PositionSaveModal';
import { ConfirmModal } from '../components/common/ConfirmModal';
import {
  ALL_TO_BOX_SFEN,
  EditSelection,
  HIRATE_SFEN,
  PIECE_ORDER,
  PieceBase,
  SFEN_BASE_TO_KIND,
  TSUMEGO_BOX_SFEN,
  TSUMEGO_INITIAL_SFEN,
  applyEditBoxClick,
  applyEditHandClick,
  applyEditSquareClick,
  applyEditSquareRightClick,
  canPlaceInHand,
  createJkfPlayerFromSfen,
  extractStartSfenFromJkfJson,
  getPieceBoxCounts,
  isCustomPositionRecord,
  parsePositionSfen,
  serializePositionSfen,
} from '../utils/positionEditor';
import { loadQuizPool } from '../utils/quizPoolStorage';
import { checkSanyataRepetition, calculateImpassePoints } from '../utils/shogiEndgameJudger';
import { useShogiEngine } from '../hooks/useShogiEngine';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import {
  ensureKifuRecordPayload,
  syncTsumegoImportHistoryWithCloud,
  uploadTsumegoBatchToFirestore,
} from '../services/firestoreKifuSync';
import {
  fetchUserSpotAnalyses,
  queueSpotAnalysis,
  SpotAnalysisKind,
  SpotAnalysisRecord,
} from '../services/spotAnalysisSync';
import { kifuRecordToStudioGame } from '../utils/kifuRecordCodec';
import { KifuRecord } from '../types/kifuRecord';
import { resolveGameKind } from '../utils/gameKindClassifier';
import { getKifuRecord, updateKifuRecord } from '../utils/kifuRecordStorage';
import { extractMainlineMoveSignature, isProtectedMatchRecord } from '../utils/mainlineProtection';
import { EngineId, resolveEngineDisplayName } from '../engine/engineConfig';
import { MoveEvaluation } from '../types/shogi';
import {
  SavedStudioGame,
  detectGameWinner,
  loadSavedStudioGames,
  saveStudioGame,
  updateStudioGameEvaluations,
  generateGameTitle,
  getTreeBranchStats,
  saveLastStudioSession,
  loadLastStudioSession,
  saveStudioDraft,
  loadStudioDraft,
  clearStudioDraft,
  StudioDraftBackup,
  updateStudioGameTags,
} from '../utils/studioKifuStorage';
import { TagCategoryGroup, loadStructuredTagGroups, addCustomTagToCategory } from '../utils/studioKifuStorage';
import { CategorizedTagCombobox } from '../components/kifu/CategorizedTagCombobox';
import { loadPlayerProfiles, findMatchingPlayer } from '../utils/playerStorage';
import { formatUsiToJapanese, parseUsiMove, cleanJkfFalsyPromotions } from '../utils/usiFormatter';
import { hasAnyLegalMoves } from '../utils/shogiEndgameJudger';
import { autoRegisterStudioQuizzes, JkfMoveData } from '../utils/studioQuizExtractor';
import {
  RAW_PROMOTABLE_KINDS,
  PROMOTED_KINDS,
  getStrictLegalMovesForSquare,
  getStrictLegalDropsForPiece,
} from '../utils/shogiRules';
import { ShogiBoard } from '../utils/shogiBoard';
import { saveTraceSession, TraceSessionStats } from '../utils/traceHistoryStorage';
import { trackEvent } from '../utils/analytics';
import {
  evaluateStudioRouteSync,
  hasStudioNavigationIntent,
} from '../utils/studioRouteSync';

const PROMOTABLE_KINDS = RAW_PROMOTABLE_KINDS;

interface PendingPromotionMove {
  from: StudioBoardSquare;
  to: StudioBoardSquare;
  pieceKind: string;
}

export type StudioMode = 'STUDY' | 'SHOGI_TRACE' | 'AI_MATCH' | 'QUIZ' | 'TSUMEGO' | 'RESIGN_MATE';

const HIRATE_INITIAL_KIF = `
手合割：平手
先手：先手
後手：後手
手数----指手---------消費時間--
`.trim();

export interface SingleScreenStudioPageProps {
  isRouteActive?: boolean;
}

export const SingleScreenStudioPage: React.FC<SingleScreenStudioPageProps> = ({
  isRouteActive = true,
}) => {
  const { t } = useTranslation();
  const { settings, updateSettings, openSettings } = useSettings();
  const { pieceSpriteHref, showCoordinates } = useBoardAppearance();
  const isCompactLayout = (settings.studioLayoutDensity ?? 'comfortable') === 'compact';
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const lastStudioLocationKeyRef = useRef<string | null>(null);
  const wasRouteActiveRef = useRef<boolean>(isRouteActive);
  const pendingQuizDeepLinkIdRef = useRef<string | null>(null);

  // Current active mode
  const [activeMode, setActiveMode] = useState<StudioMode>(() => {
    const modeParam = searchParams.get('mode');
    if (modeParam === 'match') return 'AI_MATCH';
    if (modeParam === 'trace') return 'SHOGI_TRACE';
    if (modeParam === 'quiz' || searchParams.get('quiz') === 'true') return 'QUIZ';
    if (modeParam === 'tsumego' || searchParams.get('tsumego') === 'true') return 'TSUMEGO';
    return 'STUDY';
  });

  // Input KIF text and parsed JKF player (Default to clean Hirate board instead of demo game)
  const [kifText, setKifText] = useState(HIRATE_INITIAL_KIF);
  const [player, setPlayer] = useState<JKFPlayer>(() => JKFPlayer.parseKIF(HIRATE_INITIAL_KIF));
  const [currentPly, setCurrentPly] = useState(0);
  const [isManagementModalOpen, setIsManagementModalOpen] = useState(() => searchParams.get('library') === 'true');
  const [activeGameId, setActiveGameId] = useState<string | null>(() => searchParams.get('gameId') || null);
  const [activeGameTags, setActiveGameTags] = useState<string[]>(['研究']);
  const [isTagPopoverOpen, setIsTagPopoverOpen] = useState(false);
  const [tagGroups, setTagGroups] = useState<TagCategoryGroup[]>(() => loadStructuredTagGroups());

  // Trigger state counter to force React re-render when player mutates internally
  const [version, setVersion] = useState(0);
  const bumpVersion = () => setVersion((v) => v + 1);

  // Board settings & interactions
  const [isFlipped, setIsFlipped] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<StudioBoardSquare | null>(null);
  const [selectedPieceFromHand, setSelectedPieceFromHand] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotionMove | null>(null);

  // Mobile active tab ('board' | 'tree' | 'action' | 'practice' | 'fulltree')
  const [mobileActiveTab, setMobileActiveTab] = useState<'board' | 'tree' | 'action' | 'practice' | 'fulltree'>(() =>
    searchParams.get('mode') === 'trace' ? 'practice' : 'board'
  );
  const [isTrainingMenuOpen, setIsTrainingMenuOpen] = useState<boolean>(false);

  // Trace Drill State
  const [traceFeedback, setTraceFeedback] = useState<string | null>(null);
  const [traceStartMode, setTraceStartMode] = useState<'initial' | 'custom' | 'random'>('initial');
  const [traceCustomPly, setTraceCustomPly] = useState<number>(0);
  const [traceSideMode, setTraceSideMode] = useState<'both' | 'sente' | 'gote'>('both');
  const [isTraceActive, setIsTraceActive] = useState<boolean>(false);
  const [traceMistakes, setTraceMistakes] = useState<number>(0);
  const [traceUsedHint, setTraceUsedHint] = useState<boolean>(false);
  const [traceStats, setTraceStats] = useState<TraceSessionStats>({
    exact: 0,
    near: 0,
    aiBest: 0,
    wrong: 0,
    skipped: 0,
  });
  const [traceAiBestRecordedPly, setTraceAiBestRecordedPly] = useState<number | null>(null);
  const [traceStartPlyActual, setTraceStartPlyActual] = useState<number>(0);
  const [traceSummaryModal, setTraceSummaryModal] = useState<{
    stats: TraceSessionStats;
    title: string;
    pliesCovered: number;
  } | null>(null);
  const activePlyRef = useRef<HTMLButtonElement | null>(null);

  const PIECE_KIND_LABEL: Record<string, string> = {
    FU: '歩', KY: '香', KE: '桂', GI: '銀', KI: '金', KA: '角', HI: '飛', OU: '玉',
    TO: 'と', NY: '成香', NK: '成桂', NG: '成銀', UM: '馬', RY: '龍',
  };

  // AI Match / Sparring Mode State
  const [isMatchActive, setIsMatchActive] = useState(false);
  const [matchSentePlayer, setMatchSentePlayer] = useState<'human' | EngineId>('human');
  const [matchGotePlayer, setMatchGotePlayer] = useState<'human' | EngineId>('fairy-stockfish');
  const [customSenteName, setCustomSenteName] = useState<string>(() => {
    try {
      return localStorage.getItem('joseki_custom_sente_name') || '';
    } catch {
      return '';
    }
  });
  const [customGoteName, setCustomGoteName] = useState<string>(() => {
    try {
      return localStorage.getItem('joseki_custom_gote_name') || '';
    } catch {
      return '';
    }
  });
  const [matchPlayerSide, setMatchPlayerSide] = useState<0 | 1>(0); // 0: Sente, 1: Gote
  const [matchAiThinkTime, setMatchAiThinkTime] = useState<number>(1000); // ms per move (500, 1000, 3000, 5000, 10000)
  
  // Composite Time Control State (Supports per-side handicap settings)
  const [isHandicapTime, setIsHandicapTime] = useState<boolean>(false);
  const [baseTimeMin, setBaseTimeMin] = useState<number>(0); // 0 (unlimited), 3, 5, 10 minutes
  const [byoyomiSec, setByoyomiSec] = useState<number>(0); // 0 (none / sudden death), 10, 30 seconds
  const [fischerSec, setFischerSec] = useState<number>(0); // 0 (none), 5, 10 seconds per move

  // Dedicated Gote Time Control (when isHandicapTime is true)
  const [goteBaseTimeMin, setGoteBaseTimeMin] = useState<number>(0);
  const [goteByoyomiSec, setGoteByoyomiSec] = useState<number>(0);
  const [goteFischerSec, setGoteFischerSec] = useState<number>(0);

  // Live in-match clocks for both sides (in seconds)
  const [senteRemainingSec, setSenteRemainingSec] = useState<number>(0);
  const [senteByoyomiRemaining, setSenteByoyomiRemaining] = useState<number>(0);
  const [goteRemainingSec, setGoteRemainingSec] = useState<number>(0);
  const [goteByoyomiRemaining, setGoteByoyomiRemaining] = useState<number>(0);

  // Zen (集中対局) Mode State
  const [isZenMode, setIsZenMode] = useState<boolean>(false);
  const [isSplitRefOpen, setIsSplitRefOpen] = useState<boolean>(false);
  const [startWithZenMode, setStartWithZenMode] = useState<boolean>(true);
  const [clockSwitchMode, setClockSwitchMode] = useState<'auto' | 'manual'>('auto');
  const [isWaitingClockPress, setIsWaitingClockPress] = useState<boolean>(false);
  const [showKifuSheet, setShowKifuSheet] = useState<boolean>(false);
  const [kifuSheetViewerSide, setKifuSheetViewerSide] = useState<0 | 1>(0); // 0: Sente, 1: Gote
  const [showLiveEvalBar, setShowLiveEvalBar] = useState<boolean>(false);
  const [hintHighlightMove, setHintHighlightMove] = useState<{ from?: StudioBoardSquare; to: StudioBoardSquare } | null>(null);

  const [hintLimit, setHintLimit] = useState<number>(3); // 0, 1, 3, 5, or 999 (unlimited)
  const [hintsUsedCount, setHintsUsedCount] = useState<number>(0);
  const [activeHintMove, setActiveHintMove] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<StudioMatchOutcome | null>(null);
  const [isResultModalOpen, setIsResultModalOpen] = useState<boolean>(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);
  const [matchStartOrigin, setMatchStartOrigin] = useState<'new' | 'resume'>('new');
  const [matchMovesList, setMatchMovesList] = useState<Array<{ ply: number; moveText: string }>>([]);
  const [matchSfenHistory, setMatchSfenHistory] = useState<string[]>([]);
  const [isRulebookModalOpen, setIsRulebookModalOpen] = useState<boolean>(false);
  const [rulebookInitialTab] = useState<'sanyata' | 'impasse' | 'fouls' | 'promotion'>('sanyata');
  const [isSaveTacticModalOpen, setIsSaveTacticModalOpen] = useState<boolean>(false);
  const [isSaveKifuModalOpen, setIsSaveKifuModalOpen] = useState<boolean>(false);
  const [activeGameTitle, setActiveGameTitle] = useState<string>('');
  const [isKifuSavedFeedback, setIsKifuSavedFeedback] = useState<boolean>(false);
  const lastCleanJkfRef = useRef<string | null>(null);

  const handleKifuModalSaved = (savedRecord: KifuRecord) => {
    player.kifu.header['棋戦'] = savedRecord.title;
    player.kifu.header['先手'] = savedRecord.senteName;
    player.kifu.header['後手'] = savedRecord.goteName;
    setActiveGameId(savedRecord.id);
    setActiveGameTitle(savedRecord.title);
    setActiveGameTags(savedRecord.tags);
    lastCleanJkfRef.current = JSON.stringify(player.kifu);
    clearStudioDraft();
    setDetectedDraft(null);
    setIsKifuSavedFeedback(true);
    const resolvedKind = resolveGameKind(savedRecord);
    setPositionSaveToast(
      t('studio_kifu_save.saved_toast', {
        title: savedRecord.title,
        kind: t(`studio_kifu_save.kind_${resolvedKind}`),
      })
    );
    bumpVersion();
    window.setTimeout(() => setIsKifuSavedFeedback(false), 2500);
    window.setTimeout(() => setPositionSaveToast(null), 3000);
  };
  const [isTacticsLibraryOpen, setIsTacticsLibraryOpen] = useState<boolean>(false);
  const [isTreeEditMode, setIsTreeEditMode] = useState<boolean>(false);
  const [tacticRangeStart, setTacticRangeStart] = useState<number | null>(null);
  const [tacticRangeEnd, setTacticRangeEnd] = useState<number | null>(null);
  const [isTacticClipBarOpen, setIsTacticClipBarOpen] = useState<boolean>(false);
  const [studioViewTier, setStudioViewTier] = useState<1 | 2 | 3>(3); // 1: Minimal Board, 2: Broadcast AI Bar, 3: Research + Candidate Arrows
  const [studyMultiPv, setStudyMultiPv] = useState<1 | 3>(3);
  const [detectedDraft, setDetectedDraft] = useState<StudioDraftBackup | null>(() => {
    // Only detect draft if not opening a specific gameId
    const targetGameId = searchParams.get('gameId');
    if (targetGameId) return null;
    const draft = loadStudioDraft();
    if (draft && draft.totalPlies > 0) return draft;
    return null;
  });
  const [studioConfirmDialog, setStudioConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  } | null>(null);

  // Tsumego state
  const [tsumegoList, setTsumegoList] = useState<TsumegoProblem[]>(() => loadTsumegoProblems());
  const [selectedTsumegoId, setSelectedTsumegoId] = useState<string>(() => {
    const paramId = searchParams.get('tsumegoId');
    if (paramId) return paramId;
    const list = loadTsumegoProblems();
    return list[0]?.id || '';
  });
  const [tsumegoFilterPly, setTsumegoFilterPly] = useState<TsumegoPlyFilter>('all');
  const [isTsumegoRandom, setIsTsumegoRandom] = useState<boolean>(true);
  const [isTsumegoMasked, setIsTsumegoMasked] = useState<boolean>(false);
  const [isStudioMenuOpen, setIsStudioMenuOpen] = useState<boolean>(false);
  const [isPositionEditMode, setIsPositionEditMode] = useState<boolean>(false);
  const [showTsumegoSetupModal, setShowTsumegoSetupModal] = useState<boolean>(false);
  const [showSavePositionModal, setShowSavePositionModal] = useState<boolean>(false);
  const [editSaveTarget, setEditSaveTarget] = useState<PositionSaveInitialTarget | null>(null);
  const [editDefaultCategory, setEditDefaultCategory] = useState<PositionSaveCategory | undefined>(undefined);
  const [editSelection, setEditSelection] = useState<EditSelection | null>(null);
  const [editPreviewState, setEditPreviewState] = useState<EditBoardPreviewState | null>(null);
  const [positionSaveToast, setPositionSaveToast] = useState<string | null>(null);
  const editBackupRef = useRef<{
    kifuJson: string;
    ply: number;
    forkPointers: ForkPointer[];
  } | null>(null);

  const handleImportTsumegoFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const nowIso = new Date().toISOString();
    const excludeSfenHashes = new Set<string>([
      ...loadImportedTsumegoHashes(),
      ...tsumegoList.map((p) => hashTsumegoSfen(p.startSfen)),
    ]);
    const imported: TsumegoProblem[] = [];
    for (const file of Array.from(files)) {
      const lower = file.name.toLowerCase();
      const loadedItems =
        lower.endsWith('.kif') || lower.endsWith('.kifu')
          ? await importKifTsumegoFile(file)
          : await importSfenTsumegoFile(file, {
              maxProblems: 50,
              excludeSfenHashes,
            });
      for (const item of loadedItems) {
        excludeSfenHashes.add(hashTsumegoSfen(item.startSfen));
        imported.push({ ...item, updatedAt: nowIso });
      }
    }
    if (imported.length > 0) {
      const next = [...imported, ...tsumegoList];
      setTsumegoList(next);
      saveTsumegoProblems(next);
      recordImportedTsumegoHashes(imported.map((p) => p.startSfen));
      setSelectedTsumegoId(imported[0]!.id);
      if (user?.uid) {
        void uploadTsumegoBatchToFirestore(user.uid, imported);
        void syncTsumegoImportHistoryWithCloud(user.uid);
      }
    }
  };

  const activeTsumego = useMemo(() => {
    return tsumegoList.find((p) => p.id === selectedTsumegoId) || tsumegoList[0] || null;
  }, [tsumegoList, selectedTsumegoId]);

  const filteredTsumegoList = useMemo(
    () => filterTsumegoByPly(tsumegoList, tsumegoFilterPly),
    [tsumegoList, tsumegoFilterPly]
  );

  const handleSelectNextTsumego = () => {
    const next = pickNextTsumegoProblem(
      filteredTsumegoList,
      activeTsumego?.id ?? selectedTsumegoId,
      isTsumegoRandom
    );
    if (next) {
      setSelectedTsumegoId(next.id);
    }
  };

  // Wasm AI Engine Integration
  const engine = useShogiEngine({ autoInit: true });
  const [evalHistory, setEvalHistory] = useState<Map<number, MoveEvaluation>>(() => new Map());
  const [localEvalHistory, setLocalEvalHistory] = useState<Map<number, MoveEvaluation>>(() => new Map());
  const [evalSourceView, setEvalSourceView] = useState<'cloud' | 'local'>('cloud');
  const [spotAnalyses, setSpotAnalyses] = useState<SpotAnalysisRecord[]>([]);
  const [isQueuingSpot, setIsQueuingSpot] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<BatchAnalysisProgressInfo | null>(null);
  const cancelBatchAnalysisRef = useRef<boolean>(false);

  // Auto-save last active studio session whenever current state changes (skip empty initial board)
  useEffect(() => {
    try {
      const maxPly = player.getMaxTesuu();
      // If there are no moves made and no active game id, do not save as an active session to resume
      if (maxPly === 0 && currentPly === 0 && !activeGameId) {
        return;
      }

      const savedRecTitle = activeGameId ? getKifuRecord(activeGameId)?.title : undefined;
      const gTitle =
        activeGameTitle ||
        savedRecTitle ||
        player.kifu.header['棋戦'] ||
        (player.kifu.header['先手'] && player.kifu.header['後手']
          ? `${player.kifu.header['先手']} vs ${player.kifu.header['後手']}`
          : player.kifu.header['戦型'] || t('studio.free_study'));

      saveLastStudioSession({
        gameId: activeGameId,
        gameTitle: gTitle,
        currentPly,
        totalPlies: maxPly,
        activeMode,
        senteName: player.kifu.header['先手'],
        goteName: player.kifu.header['後手'],
        updatedAt: new Date().toISOString(),
      });

      // Backup current working board & full tree only when modified from initial/saved state
      if (maxPly > 0) {
        const currentJkf = JSON.stringify(player.kifu);
        if (lastCleanJkfRef.current === null) {
          lastCleanJkfRef.current = currentJkf;
        } else if (currentJkf !== lastCleanJkfRef.current) {
          saveStudioDraft({
            jkfJson: currentJkf,
            currentPly,
            totalPlies: maxPly,
            updatedAt: new Date().toISOString(),
            title: gTitle,
            gameId: activeGameId,
            activeForkPointers: player.forkPointers ? [...player.forkPointers] : [],
          });
        }
      }
    } catch (err) {
      console.warn('Failed to auto-save studio session:', err);
    }
  }, [currentPly, activeMode, activeGameId, player, version, t]);

  // Guard against accidental tab closure / refresh during active match or AI batch analysis
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (batchProgress !== null || isMatchActive) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [batchProgress, isMatchActive]);

  // Auto-scroll left kifu list to current ply
  useEffect(() => {
    activePlyRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPly]);

  // Auto-mark active game as 'read' (通し確認済) when reaching the final ply in STUDY or SHOGI_TRACE
  useEffect(() => {
    if (!activeGameId || (activeMode !== 'STUDY' && activeMode !== 'SHOGI_TRACE')) return;
    const maxP = player.getMaxTesuu();
    if (maxP > 0 && currentPly === maxP) {
      const rec = getKifuRecord(activeGameId);
      if (rec && rec.reviewStatus !== 'read') {
        updateKifuRecord(activeGameId, { reviewStatus: 'read' });
      }
    }
  }, [activeGameId, activeMode, currentPly, player]);

  // Auto-advance opponent move in Shogi Trace when playing single-side (pseudo-match)
  useEffect(() => {
    if (!isRouteActive) return;
    if (!isTraceActive || activeMode !== 'SHOGI_TRACE' || traceSideMode === 'both') return;
    if (currentPly >= player.getMaxTesuu()) return;
    const isOpponentTurn =
      (traceSideMode === 'sente' && player.shogi.turn === 1) ||
      (traceSideMode === 'gote' && player.shogi.turn === 0);
    if (!isOpponentTurn) return;

    const timer = setTimeout(() => {
      goToPly(currentPly + 1);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRouteActive, isTraceActive, activeMode, traceSideMode, currentPly, player, version]);

  // Trigger AI move during match when it is AI's turn
  const isVariation = Boolean(player.forkPointers && player.forkPointers.length > 0);
  const currentSfen = player.shogi.toSFENString();

  // Load user's spot cloud analyses when signed in
  useEffect(() => {
    if (!user?.uid) {
      setSpotAnalyses([]);
      return;
    }
    void fetchUserSpotAnalyses(user.uid).then(setSpotAnalyses);
  }, [user?.uid]);

  const activeSpotPosition = useMemo(
    () => spotAnalyses.find((s) => s.sfen === currentSfen && s.kind === 'position') ?? null,
    [spotAnalyses, currentSfen]
  );

  const activeSpotMate = useMemo(
    () => spotAnalyses.find((s) => s.sfen === currentSfen && s.kind === 'mate') ?? null,
    [spotAnalyses, currentSfen]
  );

  const handleQueueSpotAnalysis = async (kind: SpotAnalysisKind) => {
    if (!user?.uid || isQueuingSpot) return;
    setIsQueuingSpot(true);
    try {
      const created = await queueSpotAnalysis(user.uid, {
        sfen: currentSfen,
        kind,
        gameId: activeGameId ?? undefined,
        ply: currentPly,
      });
      if (created) {
        setSpotAnalyses((prev) => [created, ...prev]);
      }
    } finally {
      setIsQueuingSpot(false);
    }
  };
  useEffect(() => {
    if (!isRouteActive || !isMatchActive || matchResult || !engine.isReady || engine.isSearching) return;

    // Check who is on turn
    const turn = player.shogi.turn;
    const isSente = turn === 0;
    const activeParticipant = isSente ? matchSentePlayer : matchGotePlayer;

    // If human is on turn, no AI action
    if (activeParticipant === 'human') return;

    // If manual clock switch is enabled and player hasn't pressed clock yet, don't start AI search
    if (clockSwitchMode === 'manual' && isWaitingClockPress) return;

    // Switch engine if active participant differs
    if (activeParticipant !== engine.activeEngineId) {
      engine.switchEngine(activeParticipant);
    }

    // Dynamic AI Think Time:
    // AI has smaller time scale scaled to its remaining game clock or matchAiThinkTime
    // 1. Check AI's remaining clock
    const aiRemainingSec = isSente ? senteRemainingSec : goteRemainingSec;
    const aiByoyomiSec = isSente ? senteByoyomiRemaining : goteByoyomiRemaining;

    let dynamicMovetime = matchAiThinkTime;

    if (baseTimeMin > 0 && aiRemainingSec <= 0 && aiByoyomiSec > 0) {
      // In byoyomi, think for at most byoyomi - 1 second (min 400ms)
      dynamicMovetime = Math.max(400, (aiByoyomiSec - 1) * 1000);
    } else if (baseTimeMin > 0 && aiRemainingSec < 30) {
      // Time trouble in main clock: fast moves
      dynamicMovetime = Math.min(matchAiThinkTime, 500);
    } else {
      // Game phase aware thinking:
      // Opening (<= 24 plies): quick book/positioning moves (40% of base)
      // Midgame (25 - 60 plies): deep tactical calculation (100% of base)
      // Endgame (> 60 plies): speed up slightly or use 70% of base
      if (currentPly <= 24) {
        dynamicMovetime = Math.max(300, Math.round(matchAiThinkTime * 0.4));
      } else if (currentPly > 60) {
        dynamicMovetime = Math.max(500, Math.round(matchAiThinkTime * 0.75));
      } else {
        dynamicMovetime = matchAiThinkTime;
      }
    }

    const sfen = player.shogi.toSFENString();

    let isSubscribed = true;
    engine
      .searchPosition(sfen, undefined, { movetime: dynamicMovetime })
      .then((res) => {
        if (!isSubscribed || !isMatchActive) return;

        // Update live evaluation history for the current position so the Eval Bar reflects it immediately!
        if (res.evaluation) {
          const evalObj = res.evaluation;
          setEvalHistory((prev) => {
            const next = new Map(prev);
            next.set(currentPly, evalObj);
            return next;
          });
        }

        if (res.bestMove && res.bestMove !== 'resign' && res.bestMove !== '(none)') {
          const parsed = parseUsiMove(res.bestMove, player.shogi);
          if (parsed) {
            executeStudyMove(parsed.from, parsed.to, parsed.piece, parsed.promote);
          }
        } else if (res.bestMove === 'resign') {
          // AI resigned -> Human victory!
          handleFinishMatch('resign_win');
        }
      })
      .catch((err) => {
        console.warn('AI match move search error:', err);
      });

    return () => {
      isSubscribed = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRouteActive, isMatchActive, player.shogi.turn, currentPly, matchResult, engine.isReady, version, matchAiThinkTime, matchSentePlayer, matchGotePlayer, clockSwitchMode, isWaitingClockPress]);

  // Request hint during AI Match
  const handleRequestMatchHint = () => {
    if (!isMatchActive || engine.isSearching || (hintLimit < 999 && hintsUsedCount >= hintLimit)) {
      return;
    }

    const sfen = player.shogi.toSFENString();
    engine
      .searchPosition(sfen, undefined, { depth: 10, movetime: 800 })
      .then((res) => {
        if (res.bestMove && res.bestMove !== 'resign' && res.bestMove !== '(none)') {
          const moveJp = formatUsiToJapanese(res.bestMove, player.shogi.turn, player.shogi);
          setActiveHintMove(moveJp);
          setHintsUsedCount((c) => c + 1);

          // Parse coordinates to highlight hint square on board
          const parsed = parseUsiMove(res.bestMove, player.shogi);
          if (parsed) {
            setHintHighlightMove({ from: parsed.from, to: parsed.to });
          }

          // Record in position comment that a hint was used
          const existingComments = player.getComments(currentPly) || [];
          const logLine = t('studio.match.hint_used_log', { move: moveJp });
          if (!existingComments.includes(logLine)) {
            const moveFormat = player.getMoveFormat(currentPly);
            if (moveFormat) {
              moveFormat.comments = [...existingComments, logLine];
              bumpVersion();
            }
          }
        }
      })
      .catch((err) => {
        console.warn('Match hint search error:', err);
      });
  };

  // Resign match
  const handleResignMatch = () => {
    if (!isMatchActive) return;
    if (window.confirm(t('studio.match.resign_confirm'))) {
      handleFinishMatch('resign_lose');
    }
  };

  // Start or restart match
  const handleStartMatch = (origin: 'new' | 'resume') => {
    trackEvent('ai_match_start', { origin });
    const isBothHuman = matchSentePlayer === 'human' && matchGotePlayer === 'human';
    const getParticipantName = (p: 'human' | EngineId, isSenteSide: boolean) => {
      if (p === 'human') {
        const customName = isSenteSide ? customSenteName.trim() : customGoteName.trim();
        if (customName) return customName;
        if (isBothHuman) {
          return isSenteSide ? t('studio.match.player_human_1') : t('studio.match.player_human_2');
        }
        return t('studio.match.player_you');
      }
      const found = engine.availableEngines.find((e) => e.id === p);
      return found ? resolveEngineDisplayName(found, t) : resolveEngineDisplayName(p, t);
    };

    const sName = getParticipantName(matchSentePlayer, true);
    const gName = getParticipantName(matchGotePlayer, false);

    if (origin === 'new') {
      // Initialize a clean, empty 平手 board for a fresh new game
      const emptyKif = `手合割：平手\n先手：${sName}\n後手：${gName}\n手数----指手---------消費時間--\n`;
      const freshPlayer = JKFPlayer.parseKIF(emptyKif);
      setPlayer(freshPlayer);
      setCurrentPly(0);
    } else {
      // Resume from current study ply: update player headers to reflect match
      player.kifu.header['先手'] = sName;
      player.kifu.header['後手'] = gName;
    }

    // Set flip: if Gote is human and Sente is AI, flip board
    if (matchGotePlayer === 'human' && matchSentePlayer !== 'human') {
      setIsFlipped(true);
      setMatchPlayerSide(1);
    } else {
      setIsFlipped(false);
      setMatchPlayerSide(0);
    }

    setIsMatchActive(true);
    setHintsUsedCount(0);
    setActiveHintMove(null);
    setMatchResult(null);
    setMatchMovesList([]);
    setMatchSfenHistory([player.shogi.toSFENString()]);
    setIsWaitingClockPress(false);

    // Initialize clock values for both players (using separate handicap time if enabled)
    const effectiveGoteBaseMin = isHandicapTime ? goteBaseTimeMin : baseTimeMin;
    const effectiveGoteByoyomiSec = isHandicapTime ? goteByoyomiSec : byoyomiSec;

    setSenteRemainingSec(baseTimeMin * 60);
    setSenteByoyomiRemaining(byoyomiSec);
    setGoteRemainingSec(effectiveGoteBaseMin * 60);
    setGoteByoyomiRemaining(effectiveGoteByoyomiSec);

    if (startWithZenMode) {
      setIsZenMode(true);
    }
    setMobileActiveTab('board');

    bumpVersion();
  };

  // Exit match mode
  const handleExitMatch = () => {
    setIsMatchActive(false);
    setActiveHintMove(null);
    setMatchResult(null);
    setMatchMovesList([]);
    setIsWaitingClockPress(false);
  };

  // Auto-save completed match to Kifu Library and open result modal
  const handleFinishMatch = (outcome: StudioMatchOutcome) => {
    setMatchResult(outcome);
    setIsResultModalOpen(true);

    try {
      const sName = player.kifu.header['先手'] || '先手';
      const gName = player.kifu.header['後手'] || '後手';
      const profiles = loadPlayerProfiles();
      const sMatch = findMatchingPlayer(sName, profiles);
      const gMatch = findMatchingPlayer(gName, profiles);

      const isVictory =
        outcome === 'win' ||
        outcome === 'resign_win' ||
        outcome === 'mate_win' ||
        outcome === 'timeout_win';

      const isPlayerSente = matchPlayerSide === 0;
      let winner: 'sente' | 'gote' | 'draw' | 'unknown' = 'unknown';
      if (outcome === 'sanyata_draw' || outcome === 'impasse_draw') {
        winner = 'draw';
      } else if (isVictory) {
        winner = isPlayerSente ? 'sente' : 'gote';
      } else {
        winner = isPlayerSente ? 'gote' : 'sente';
      }

      const title = generateGameTitle({
        senteName: sName,
        goteName: gName,
        openingName: player.kifu.header['戦型'] || '実戦対局',
        date: new Date().toLocaleDateString('ja-JP'),
      });

      const outcomeTag =
        outcome === 'resign_win' || outcome === 'resign_lose'
          ? '投了'
          : outcome === 'mate_win' || outcome === 'mate_lose'
          ? '詰み'
          : outcome === 'timeout_win' || outcome === 'timeout_loss'
          ? '切れ負け'
          : outcome === 'sanyata_draw'
          ? '千日手'
          : outcome === 'impasse_draw' || outcome === 'impasse_win' || outcome === 'impasse_lose'
          ? '持将棋'
          : '終局';

      const targetId = activeGameId || `studio-game-${Date.now()}`;
      const savedMatch: SavedStudioGame = {
        id: targetId,
        title,
        senteName: sName,
        goteName: gName,
        sentePlayerId: sMatch.profile?.id,
        gotePlayerId: gMatch.profile?.id,
        winner,
        openingId: 'match',
        openingName: player.kifu.header['戦型'] || '実戦対局',
        tournament: player.kifu.header['棋戦'] || player.kifu.header['棋戦名'],
        matchDate: new Date().toLocaleDateString('ja-JP'),
        totalPlies: player.getMaxTesuu(),
        forkCount: 0,
        jkfJson: JSON.stringify(player.kifu),
        rawKif: kifText,
        tags: ['実戦対局', outcomeTag],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      saveStudioGame(savedMatch);
      setActiveGameId(targetId);
    } catch (err) {
      console.warn('Failed to auto-save match result:', err);
    }
  };
  const [suspendToast, setSuspendToast] = useState<boolean>(false);
  const [quizCreatedToast, setQuizCreatedToast] = useState<{ count: number } | null>(null);
  const [isQuizPoolModalOpen, setIsQuizPoolModalOpen] = useState<boolean>(false);
  const [editingQuizCard, setEditingQuizCard] = useState<TacticalQuizCard | null>(null);
  const [quizEditReturnTarget, setQuizEditReturnTarget] = useState<'library' | 'studio'>('library');
  const [quizPool, setQuizPool] = useState<TacticalQuizCard[]>(() =>
    loadQuizPool().filter((c) => c.isEnabled)
  );
  const [activeQuizIndex, setActiveQuizIndex] = useState<number>(0);
  const [quizVerdict, setQuizVerdict] = useState<'best' | 'acceptable' | 'wrong' | null>(null);
  const [quizEvalLossCp, setQuizEvalLossCp] = useState<number | null>(null);
  const [quizLastPlayedMove, setQuizLastPlayedMove] = useState<string | null>(null);
  const [_quizActivePv, setQuizActivePv] = useState<string[] | null>(null);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState<boolean>(false);
  const [quizReplayState, setQuizReplayState] = useState<{
    isActive: boolean;
    moves: string[];
    currentIndex: number;
    isPlaying: boolean;
    currentScoreCp?: number | null;
    isAnalyzing?: boolean;
    stepScores: number[];
  } | null>(null);
  const [isQuizShuffled, setIsQuizShuffled] = useState<boolean>(true);
  const [quizShuffledOrder, setQuizShuffledOrder] = useState<number[]>([]);
  const [mobileChoicesVisible, setMobileChoicesVisible] = useState<boolean>(false);
  const [isQuizDeepThinking] = useState<boolean>(false);
  const quizPoolCount = quizPool.length;

  // Resignation Mate Analysis State (Mode 5: RESIGN_MATE)
  const [isResignMateAnalyzing, setIsResignMateAnalyzing] = useState<boolean>(false);
  const [resignMateResult, setResignMateResult] = useState<{
    sfen: string;
    isMate: boolean;
    matePly?: number;
    scoreCp: number;
    pv: string[];
    depth: number;
  } | null>(null);

  // Active quiz card helper (uses shuffled index permutation when isQuizShuffled is true)
  const resolvedCardIndex = useMemo(() => {
    if (quizPool.length === 0) return 0;
    if (isQuizShuffled && quizShuffledOrder.length === quizPool.length) {
      return quizShuffledOrder[activeQuizIndex % quizShuffledOrder.length] ?? 0;
    }
    return activeQuizIndex % quizPool.length;
  }, [quizPool.length, isQuizShuffled, quizShuffledOrder, activeQuizIndex]);

  const currentQuizCard: TacticalQuizCard | null =
    quizPool.length > 0 && resolvedCardIndex < quizPool.length ? quizPool[resolvedCardIndex] ?? null : null;

  // Load quiz card position onto the board
  const loadQuizPosition = (card: TacticalQuizCard) => {
    try {
      const games = loadSavedStudioGames();
      const targetGame = games.find((g) => g.id === card.sourceGameId);
      if (targetGame && targetGame.jkfJson && targetGame.jkfJson !== '{}') {
        handleOpenGame(targetGame, card.ply);
        const parsedJkf = JSON.parse(targetGame.jkfJson);
        const qPlayer = new JKFPlayer(parsedJkf);
        if (targetGame.activeForkPointers && targetGame.activeForkPointers.length > 0) {
          qPlayer.goto(card.ply, targetGame.activeForkPointers);
        } else {
          qPlayer.goto(card.ply);
        }

        // Authoritative Board Sync: If card has a verified startSfen, initialize the board state directly from it
        // to prevent shogi.js goto/promotion bugs from dropping promotions (e.g. 馬 -> 角)
        if (card.startSfen) {
          qPlayer.shogi.initializeFromSFENString(card.startSfen);
        }

        setPlayer(qPlayer);
        setCurrentPly(card.ply);
        bumpVersion();
      } else if (card.startSfen) {
        const fallbackPlayer = new JKFPlayer({
          header: {
            ...(targetGame?.senteName ? { 先手: targetGame.senteName } : {}),
            ...(targetGame?.goteName ? { 後手: targetGame.goteName } : {}),
          },
          moves: [{}],
        });
        fallbackPlayer.shogi.initializeFromSFENString(card.startSfen);
        setPlayer(fallbackPlayer);
        setCurrentPly(card.ply);
        bumpVersion();
      }
      setQuizVerdict(null);
      setQuizEvalLossCp(null);
      setQuizLastPlayedMove(null);
      setQuizActivePv(null);
      setIsAnswerRevealed(false);
      setQuizReplayState(null);
      setHintHighlightMove(null);
      setMobileChoicesVisible(false);
      // Ensure player faces their own side to move
      setIsFlipped(card.sideToMove === 'w');
    } catch (err) {
      console.warn('Failed to load quiz position:', err);
    }
  };

  // Helper to convert board/drop coords to valid USI notation (e.g., "1g1f", "S*6c")
  const RANK_CHARS = ['', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
  const toUsi = (from?: { x: number; y: number }, to?: { x: number; y: number }, pieceKind?: string, promote?: boolean): string => {
    if (!to) return '';
    if (!from) {
      // Piece drop: map pieceKind to USI single letter (FU->P, KY->L, etc.)
      const dropMap: Record<string, string> = {
        FU: 'P', KY: 'L', KE: 'N', GI: 'S', KI: 'G', KA: 'B', HI: 'R',
        fu: 'P', ky: 'L', ke: 'N', gi: 'S', ki: 'G', ka: 'B', hi: 'R',
        P: 'P', L: 'L', N: 'N', S: 'S', G: 'G', B: 'B', R: 'R',
      };
      const p = dropMap[pieceKind || ''] || (pieceKind ? pieceKind[0]?.toUpperCase() : 'P');
      return `${p}*${to.x}${RANK_CHARS[to.y]}`;
    }
    return `${from.x}${RANK_CHARS[from.y]}${to.x}${RANK_CHARS[to.y]}${promote ? '+' : ''}`;
  };

  // Helper to synchronously instantiate a JKFPlayer at the quiz starting position
  const createQuizBasePlayer = (card: TacticalQuizCard): JKFPlayer => {
    let qp: JKFPlayer;
    const games = loadSavedStudioGames();
    const targetGame = games.find((g) => g.id === card.sourceGameId);
    const fallbackHeader = {
      ...(targetGame?.senteName ? { 先手: targetGame.senteName } : {}),
      ...(targetGame?.goteName ? { 後手: targetGame.goteName } : {}),
    };
    try {
      if (targetGame && targetGame.jkfJson && targetGame.jkfJson !== '{}') {
        const parsedJkf = JSON.parse(targetGame.jkfJson);
        qp = new JKFPlayer(parsedJkf);
        if (targetGame.activeForkPointers && targetGame.activeForkPointers.length > 0) {
          qp.goto(card.ply, targetGame.activeForkPointers);
        } else {
          qp.goto(card.ply);
        }
      } else {
        qp = new JKFPlayer({ header: fallbackHeader, moves: [{}] });
      }
      if (card.startSfen) {
        qp.shogi.initializeFromSFENString(card.startSfen);
      }
    } catch {
      qp = new JKFPlayer({ header: fallbackHeader, moves: [{}] });
      if (card.startSfen) {
        qp.shogi.initializeFromSFENString(card.startSfen);
      }
    }
    return qp;
  };

  // Synchronously step quiz board to a specific replay move index (0 to moves.length)
  const applyQuizReplayIndex = (moves: string[], targetIndex: number) => {
    if (!currentQuizCard) return;
    const replayPlayer = createQuizBasePlayer(currentQuizCard);
    for (let i = 0; i < targetIndex; i++) {
      const usi = moves[i];
      if (usi) {
        const parsed = parseUsiMove(usi, replayPlayer.shogi);
        if (parsed) {
          try {
            if (parsed.from) {
              replayPlayer.shogi.move(
                parsed.from.x,
                parsed.from.y,
                parsed.to.x,
                parsed.to.y,
                Boolean(parsed.promote)
              );
            } else {
              replayPlayer.shogi.drop(
                parsed.to.x,
                parsed.to.y,
                parsed.piece as Formats.Kind,
                replayPlayer.shogi.turn
              );
            }
          } catch {
            break;
          }
        }
      }
    }
    setPlayer(replayPlayer);
    setCurrentPly(currentQuizCard.ply + targetIndex);
    bumpVersion();
  };

  // Play continuation PV onto the board step-by-step with live AI search & stepper
  const handlePlayPvContinuation = async (pv: string[], choiceUsi?: string) => {
    if (!currentQuizCard) return;

    let fullMoves = [...pv];
    const matchedChoice = choiceUsi
      ? currentQuizCard.choices?.find((c) => c.usi.toLowerCase() === choiceUsi.toLowerCase())
      : undefined;

    // Calculate accurate target Sente-normalized score along this line
    // Note: scoreCpBefore is Sente-normalized (+ = Sente advantage, - = Gote advantage)
    // choice.scoreDelta is Mover-normalized (0 for best move, negative for blunders)
    const moverDelta = matchedChoice?.scoreDelta ?? 0;
    const targetLineScoreCp =
      currentQuizCard.sideToMove === 'b'
        ? currentQuizCard.scoreCpBefore + moverDelta
        : currentQuizCard.scoreCpBefore - moverDelta;

    const buildStepScores = (len: number, endScore: number): number[] => {
      const scores: number[] = [currentQuizCard.scoreCpBefore];
      for (let i = 1; i <= len; i++) {
        scores.push(endScore);
      }
      return scores;
    };

    // If choiceUsi is not the best move and pv has only 1 move (e.g. [choiceUsi]),
    // query active engine for real-time refutation PV!
    const isSingleMoveNonBest = fullMoves.length <= 1 && choiceUsi && choiceUsi !== currentQuizCard.bestMove;

    // Immediately step to move 1 (1 / N) so the user sees the chosen move and its resulting evaluation right away
    const initialIdx = fullMoves.length >= 1 ? 1 : 0;
    const initialStepScores = buildStepScores(fullMoves.length, targetLineScoreCp);

    setQuizReplayState({
      isActive: true,
      moves: fullMoves,
      currentIndex: initialIdx,
      isPlaying: false,
      currentScoreCp: initialStepScores[initialIdx] ?? targetLineScoreCp,
      isAnalyzing: Boolean(isSingleMoveNonBest),
      stepScores: initialStepScores,
    });

    applyQuizReplayIndex(fullMoves, initialIdx);

    if (isSingleMoveNonBest) {
      try {
        const startSfen = currentQuizCard.startSfen;
        const res = await engine.searchPosition(startSfen, [choiceUsi], { depth: 10 });
        if (res && res.evaluation) {
          const evalRes = res.evaluation;
          const enginePv = evalRes.pv && evalRes.pv.length > 0 ? evalRes.pv : [];
          // Complete line: [choiceUsi, ...opponentRefutations]
          fullMoves = [choiceUsi, ...enginePv.slice(0, 5)];
          const lossScore = evalRes.scoreCp;
          const updatedStepScores = buildStepScores(fullMoves.length, lossScore);

          setQuizReplayState((prev) => {
            const idx = prev ? Math.min(prev.currentIndex, fullMoves.length) : 1;
            return {
              isActive: true,
              moves: fullMoves,
              currentIndex: idx,
              isPlaying: false,
              currentScoreCp: updatedStepScores[idx] ?? lossScore,
              isAnalyzing: false,
              stepScores: updatedStepScores,
            };
          });
        } else {
          setQuizReplayState((prev) => (prev ? { ...prev, isAnalyzing: false } : null));
        }
      } catch (err) {
        console.warn('Realtime refutation search failed:', err);
        setQuizReplayState((prev) => (prev ? { ...prev, isAnalyzing: false } : null));
      }
    }
  };

  // Manual step navigation for Quiz replay
  const handleQuizReplayStep = (direction: 'prev' | 'next' | 'first' | 'last') => {
    if (!quizReplayState) return;
    const { moves, currentIndex, stepScores } = quizReplayState;
    let nextIdx = currentIndex;

    if (direction === 'first') nextIdx = 0;
    else if (direction === 'last') nextIdx = moves.length;
    else if (direction === 'prev') nextIdx = Math.max(0, currentIndex - 1);
    else if (direction === 'next') nextIdx = Math.min(moves.length, currentIndex + 1);

    if (nextIdx === currentIndex) return;

    applyQuizReplayIndex(moves, nextIdx);
    const fallbackScore = stepScores[stepScores.length - 1] ?? currentQuizCard?.scoreCpBefore ?? 0;
    const score = stepScores[nextIdx] ?? (nextIdx === 0 ? (currentQuizCard?.scoreCpBefore ?? 0) : fallbackScore);

    setQuizReplayState((prev) =>
      prev ? { ...prev, currentIndex: nextIdx, isPlaying: false, currentScoreCp: score } : null
    );
  };

  // Toggle Auto Play / Pause
  const handleToggleQuizReplayPlay = () => {
    setQuizReplayState((prev) => (prev ? { ...prev, isPlaying: !prev.isPlaying } : null));
  };

  // Auto-play timer effect for Quiz replay
  useEffect(() => {
    if (!isRouteActive || !quizReplayState || !quizReplayState.isPlaying) return;

    if (quizReplayState.currentIndex >= quizReplayState.moves.length) {
      setQuizReplayState((prev) => (prev ? { ...prev, isPlaying: false } : null));
      return;
    }

    const timer = setTimeout(() => {
      const nextIdx = quizReplayState.currentIndex + 1;
      applyQuizReplayIndex(quizReplayState.moves, nextIdx);
      const score = quizReplayState.stepScores[nextIdx] ?? quizReplayState.currentScoreCp;
      setQuizReplayState((prev) =>
        prev
          ? {
              ...prev,
              currentIndex: nextIdx,
              currentScoreCp: score,
              isPlaying: nextIdx < prev.moves.length,
            }
          : null
      );
    }, 850);

    return () => clearTimeout(timer);
  }, [isRouteActive, quizReplayState]);

  // Exit replay and reset board to quiz position
  const handleExitQuizReplay = () => {
    setQuizReplayState(null);
    if (currentQuizCard) {
      loadQuizPosition(currentQuizCard);
    }
  };

  // Adopt current replay variation as an official study fork and enter STUDY mode
  const handleAdoptVariationAsStudy = () => {
    if (!currentQuizCard || !quizReplayState) return;

    try {
      const games = loadSavedStudioGames();
      const targetGame = games.find((g) => g.id === currentQuizCard.sourceGameId);
      if (targetGame) {
        // Instantiate target game player at the quiz position
        const parsedJkf = JSON.parse(targetGame.jkfJson);
        const forkPlayer = new JKFPlayer(parsedJkf);
        if (targetGame.activeForkPointers && targetGame.activeForkPointers.length > 0) {
          forkPlayer.goto(currentQuizCard.ply, targetGame.activeForkPointers);
        } else {
          forkPlayer.goto(currentQuizCard.ply);
        }

        // Apply all replay moves up to currentIndex (or full moves if at beginning)
        const movesToApplyCount =
          quizReplayState.currentIndex > 0
            ? quizReplayState.currentIndex
            : quizReplayState.moves.length;

        for (let i = 0; i < movesToApplyCount; i++) {
          const usi = quizReplayState.moves[i];
          if (usi) {
            const parsed = parseUsiMove(usi, forkPlayer.shogi);
            if (parsed) {
              forkPlayer.inputMove({
                from: parsed.from ? { x: parsed.from.x, y: parsed.from.y } : undefined,
                to: { x: parsed.to.x, y: parsed.to.y },
                piece: parsed.piece,
                promote: parsed.promote,
              });
            }
          }
        }

        // Save updated game with new branch fork
        const updatedJkf = forkPlayer.kifu;
        const updatedGame: SavedStudioGame = {
          ...targetGame,
          jkfJson: JSON.stringify(updatedJkf),
          totalPlies: Math.max(targetGame.totalPlies, forkPlayer.getMaxTesuu()),
          forkCount: (targetGame.forkCount || 0) + 1,
          updatedAt: new Date().toISOString(),
        };
        saveStudioGame(updatedGame);

        // Set as active studio player and switch to STUDY mode
        setPlayer(forkPlayer);
        setActiveGameId(updatedGame.id);
        setCurrentPly(forkPlayer.tesuu);
        setQuizReplayState(null);
        setActiveMode('STUDY');
        bumpVersion();
      }
    } catch (err) {
      console.warn('Failed to adopt variation as study fork:', err);
    }
  };

  // Launch AI deep mate search on resignation position (Mode 5: RESIGN_MATE)
  const handleAnalyzeResignMate = async () => {
    try {
      // 1. Jump to totalPlies (final resignation position) if not already there
      const lastPly = player.getMaxTesuu();
      if (currentPly !== lastPly) {
        goToPly(lastPly);
      }

      setIsResignMateAnalyzing(true);
      setResignMateResult(null);

      const targetSfen = player.shogi.toSFENString();
      const res = await engine.searchPosition(targetSfen, undefined, { depth: 18, movetime: 5000 });

      if (res && res.evaluation) {
        const ev = res.evaluation;
        const mateFound = Boolean(ev.isMate || (ev.matePly && ev.matePly > 0));
        setResignMateResult({
          sfen: targetSfen,
          isMate: mateFound,
          matePly: ev.matePly,
          scoreCp: ev.scoreCp,
          pv: ev.pv && ev.pv.length > 0 ? ev.pv : (res.bestMove && res.bestMove !== 'resign' ? [res.bestMove] : []),
          depth: ev.depth || 18,
        });
      }
    } catch (err) {
      console.warn('Resignation mate analysis failed:', err);
    } finally {
      setIsResignMateAnalyzing(false);
    }
  };

  // Replay resignation mate/defense PV step-by-step
  const handleReplayResignMatePv = (pv: string[]) => {
    if (!pv || pv.length === 0) return;
    const lastPly = player.getMaxTesuu();
    if (currentPly !== lastPly) {
      goToPly(lastPly);
    }

    const initialIdx = 1;
    const stepScores = [resignMateResult?.scoreCp ?? 0];
    for (let i = 1; i <= pv.length; i++) {
      stepScores.push(resignMateResult?.scoreCp ?? 0);
    }

    setQuizReplayState({
      isActive: true,
      moves: pv,
      currentIndex: initialIdx,
      isPlaying: false,
      currentScoreCp: resignMateResult?.scoreCp ?? 0,
      isAnalyzing: false,
      stepScores,
    });

    // Step to 1st move of PV
    applyQuizReplayIndex(pv, initialIdx);
    setMobileActiveTab('board');
  };

  // Adopt resignation mate PV variation into the game study tree
  const handleAdoptResignMateAsStudy = () => {
    if (!resignMateResult || resignMateResult.pv.length === 0) return;

    try {
      const lastPly = player.getMaxTesuu();
      const clonePlayer = new JKFPlayer(JSON.parse(JSON.stringify(player.kifu)));
      clonePlayer.goto(lastPly);

      for (const usi of resignMateResult.pv) {
        const parsed = parseUsiMove(usi, clonePlayer.shogi);
        if (parsed) {
          clonePlayer.inputMove({
            from: parsed.from ? { x: parsed.from.x, y: parsed.from.y } : undefined,
            to: { x: parsed.to.x, y: parsed.to.y },
            piece: parsed.piece,
            promote: parsed.promote,
          });
        }
      }

      const updatedJkf = clonePlayer.kifu;
      if (activeGameId) {
        const games = loadSavedStudioGames();
        const targetGame = games.find((g) => g.id === activeGameId);
        if (targetGame) {
          const updatedGame: SavedStudioGame = {
            ...targetGame,
            jkfJson: JSON.stringify(updatedJkf),
            totalPlies: Math.max(targetGame.totalPlies, clonePlayer.getMaxTesuu()),
            forkCount: (targetGame.forkCount || 0) + 1,
            updatedAt: new Date().toISOString(),
          };
          saveStudioGame(updatedGame);
        }
      }

      setPlayer(clonePlayer);
      setCurrentPly(clonePlayer.tesuu);
      setQuizReplayState(null);
      setActiveMode('STUDY');
      bumpVersion();
    } catch (err) {
      console.warn('Failed to adopt resign mate variation:', err);
    }
  };

  // Jump to specific quiz index
  const handleNextQuizCard = () => {
    if (quizPool.length === 0) return;
    const nextIdx = (activeQuizIndex + 1) % quizPool.length;
    setActiveQuizIndex(nextIdx);
    const targetIdx =
      isQuizShuffled && quizShuffledOrder.length === quizPool.length
        ? quizShuffledOrder[nextIdx] ?? nextIdx
        : nextIdx;
    const nextCard = quizPool[targetIdx];
    if (nextCard) {
      loadQuizPosition(nextCard);
    }
  };

  // Switch or initialize quiz when entering QUIZ mode
  useEffect(() => {
    if (activeMode === 'QUIZ') {
      if (pendingQuizDeepLinkIdRef.current) {
        pendingQuizDeepLinkIdRef.current = null;
        return;
      }
      const activeCards = loadQuizPool().filter((c) => c.isEnabled);
      setQuizPool(activeCards);

      // Generate randomized index array if shuffle is enabled
      const indices = activeCards.map((_, i) => i);
      if (isQuizShuffled) {
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          const temp = indices[i]!;
          indices[i] = indices[j]!;
          indices[j] = temp;
        }
      }
      setQuizShuffledOrder(indices);

      if (activeCards.length > 0) {
        const firstIdx = isQuizShuffled && indices.length > 0 ? indices[0]! : 0;
        const targetCard = activeCards[firstIdx];
        if (targetCard) {
          loadQuizPosition(targetCard);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode]);

  const handleSuspendMatch = () => {
    // 1. Resolve players and title
    const sName = player.kifu.header['先手'] || '先手';
    const gName = player.kifu.header['後手'] || '後手';
    const profiles = loadPlayerProfiles();
    const sMatch = findMatchingPlayer(sName, profiles);
    const gMatch = findMatchingPlayer(gName, profiles);

    const title = generateGameTitle({
      senteName: sName,
      goteName: gName,
      openingName: '中断局',
      date: new Date().toLocaleDateString('ja-JP'),
    });

    const targetId = activeGameId || `studio-game-${Date.now()}`;
    const suspendedGame: SavedStudioGame = {
      id: targetId,
      title: `${title} (中断)`,
      senteName: sName,
      goteName: gName,
      sentePlayerId: sMatch.profile?.id,
      gotePlayerId: gMatch.profile?.id,
      winner: 'unknown',
      openingId: 'suspended',
      openingName: '中断局',
      matchDate: new Date().toLocaleDateString('ja-JP'),
      totalPlies: player.getMaxTesuu(),
      forkCount: 0,
      jkfJson: JSON.stringify(player.kifu),
      rawKif: kifText,
      tags: ['実戦対局', '中断局'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveStudioGame(suspendedGame);
    setActiveGameId(targetId);

    // Stop active match and restore normal view
    setIsMatchActive(false);
    setIsZenMode(false);
    setActiveHintMove(null);
    setMatchResult(null);
    setMatchMovesList([]);
    setIsWaitingClockPress(false);

    setSuspendToast(true);
    setTimeout(() => {
      setSuspendToast(false);
    }, 3500);
  };

  // Match Clock Countdown Effect (counts down for whoever's clock is currently running)
  useEffect(() => {
    if (!isRouteActive || !isMatchActive || matchResult !== null) return;

    const currentTurn = player.shogi.turn;
    const tickingTurn: 0 | 1 = clockSwitchMode === 'manual' && isWaitingClockPress
      ? (currentTurn === 0 ? 1 : 0) // The player who just moved
      : currentTurn; // The player whose turn it is

    const activeBaseMin = tickingTurn === 0 ? baseTimeMin : (isHandicapTime ? goteBaseTimeMin : baseTimeMin);
    const activeByoyomiSec = tickingTurn === 0 ? byoyomiSec : (isHandicapTime ? goteByoyomiSec : byoyomiSec);

    if (activeBaseMin === 0) return; // Unlimited for this player

    const timer = setInterval(() => {
      if (tickingTurn === 0) {
        setSenteRemainingSec((prev) => {
          if (prev > 0) return prev - 1;
          if (activeByoyomiSec > 0) {
            setSenteByoyomiRemaining((bPrev) => {
              if (bPrev <= 1) {
                // Sente timed out
                const isHuman = matchSentePlayer === 'human';
                handleFinishMatch(isHuman ? 'timeout_loss' : 'timeout_win');
                return 0;
              }
              return bPrev - 1;
            });
            return 0;
          } else {
            // Sente timed out (sudden death)
            const isHuman = matchSentePlayer === 'human';
            handleFinishMatch(isHuman ? 'timeout_loss' : 'timeout_win');
            return 0;
          }
        });
      } else {
        setGoteRemainingSec((prev) => {
          if (prev > 0) return prev - 1;
          if (activeByoyomiSec > 0) {
            setGoteByoyomiRemaining((bPrev) => {
              if (bPrev <= 1) {
                // Gote timed out
                const isHuman = matchGotePlayer === 'human';
                handleFinishMatch(isHuman ? 'timeout_loss' : 'timeout_win');
                return 0;
              }
              return bPrev - 1;
            });
            return 0;
          } else {
            // Gote timed out (sudden death)
            const isHuman = matchGotePlayer === 'human';
            handleFinishMatch(isHuman ? 'timeout_loss' : 'timeout_win');
            return 0;
          }
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [
    isRouteActive,
    isMatchActive,
    matchResult,
    player.shogi.turn,
    clockSwitchMode,
    isWaitingClockPress,
    baseTimeMin,
    byoyomiSec,
    isHandicapTime,
    goteBaseTimeMin,
    goteByoyomiSec,
    matchSentePlayer,
    matchGotePlayer,
  ]);

  // Handle Fischer increment on move
  const applyFischerIncrement = (turnJustMoved: 0 | 1) => {
    const incSec = turnJustMoved === 0 ? fischerSec : (isHandicapTime ? goteFischerSec : fischerSec);
    const byo = turnJustMoved === 0 ? byoyomiSec : (isHandicapTime ? goteByoyomiSec : byoyomiSec);
    const base = turnJustMoved === 0 ? baseTimeMin : (isHandicapTime ? goteBaseTimeMin : baseTimeMin);

    if (isMatchActive && base > 0 && incSec > 0) {
      if (turnJustMoved === 0) {
        setSenteRemainingSec((prev) => prev + incSec);
      } else {
        setGoteRemainingSec((prev) => prev + incSec);
      }
    }
    // Reset byoyomi clock for the side that moved
    if (byo > 0) {
      if (turnJustMoved === 0) {
        setSenteByoyomiRemaining(byo);
      } else {
        setGoteByoyomiRemaining(byo);
      }
    }
  };

  useEffect(() => {
    if (!isRouteActive || !isPositionEditMode) return;
    engine.stop();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditSelection(null);
        setEditPreviewState(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRouteActive, isPositionEditMode]);

  // Clear cached local evaluations whenever the selected local engine changes
  useEffect(() => {
    setLocalEvalHistory(new Map());
  }, [engine.activeEngineId]);

  useEffect(() => {
    // Pause background auto-evaluation completely while hidden or while Position Edit Mode or Quiz Edit is active
    if (!isRouteActive || isPositionEditMode || editingQuizCard !== null) return;
    // Do not run background auto-evaluation during training modes (protects cloud-analyzed records)
    if (activeMode === 'SHOGI_TRACE' || activeMode === 'QUIZ' || activeMode === 'TSUMEGO') return;
    // If batch analyzing or engine busy, skip
    if (!engine.isReady || engine.isSearching || batchProgress) return;

    // Check if we already have sufficient evaluation (including MultiPV=3 candidates when selected)
    const existingLocal = localEvalHistory.get(currentPly);
    const hasEnoughLocal =
      studyMultiPv === 1
        ? Boolean(existingLocal)
        : Boolean(existingLocal?.candidates && existingLocal.candidates.length >= 2);
    if (hasEnoughLocal) return;

    const hasCloudCandidates = Boolean(evalHistory.get(currentPly)?.candidates?.length);
    if (evalSourceView !== 'local' && !isVariation && evalHistory.has(currentPly) && (studyMultiPv === 1 || hasCloudCandidates)) {
      return;
    }

    // In AI Match: only calculate evaluation when it is HUMAN's turn to prevent engine contention with AI's thinking!
    if (isMatchActive) {
      const isHumanTurn =
        (player.shogi.turn === 0 && matchSentePlayer === 'human') ||
        (player.shogi.turn === 1 && matchGotePlayer === 'human');
      if (!isHumanTurn) return;
    }

    // Terminal checkmate check
    const currentTurn = player.shogi.turn as 0 | 1;
    const isCurrentCheck = player.shogi.isCheck(currentTurn);
    const hasMoves = hasAnyLegalMoves(player.shogi);
    if (isCurrentCheck && !hasMoves) {
      const mateEval: MoveEvaluation = {
        scoreCp: currentTurn === 1 ? 30000 : -30000,
        isMate: true,
        matePly: 0,
        depth: 8,
        evaluatedAt: new Date().toISOString(),
      };
      setLocalEvalHistory((prev) => {
        const next = new Map(prev);
        next.set(currentPly, mateEval);
        return next;
      });
      return;
    }

    engine.setOption('MultiPV', studyMultiPv);
    engine
      .searchPosition(currentSfen, undefined, { depth: 8, movetime: 500 })
      .then((res) => {
        if (res.evaluation) {
          const evalObj = res.evaluation;
          setLocalEvalHistory((prev) => {
            const next = new Map(prev);
            next.set(currentPly, evalObj);
            return next;
          });
        }
      })
      .catch((err) => {
        console.warn('Position search error:', err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRouteActive, currentPly, currentSfen, isVariation, engine.isReady, engine.activeEngineId, version, batchProgress, activeGameId, isMatchActive, isPositionEditMode, player.shogi.turn, matchSentePlayer, matchGotePlayer, studyMultiPv, evalSourceView]);

  const handleAnalyzeCurrentPosition = (depth = 12) => {
    if (isPositionEditMode || !engine.isReady || batchProgress) return;

    const currentTurn = player.shogi.turn as 0 | 1;
    const isCurrentCheck = player.shogi.isCheck(currentTurn);
    const hasMoves = hasAnyLegalMoves(player.shogi);
    if (isCurrentCheck && !hasMoves) {
      const mateEval: MoveEvaluation = {
        scoreCp: currentTurn === 1 ? 30000 : -30000,
        isMate: true,
        matePly: 0,
        depth,
        evaluatedAt: new Date().toISOString(),
      };
      setLocalEvalHistory((prev) => {
        const next = new Map(prev);
        next.set(currentPly, mateEval);
        return next;
      });
      return;
    }

    const sfen = player.shogi.toSFENString();
    const movetime = depth <= 8 ? 500 : depth <= 12 ? 1200 : 2500;
    engine.setOption('MultiPV', studyMultiPv);
    engine
      .searchPosition(sfen, undefined, { depth, movetime })
      .then((res) => {
        if (res.evaluation) {
          const evalObj = res.evaluation;
          setLocalEvalHistory((prev) => {
            const next = new Map(prev);
            next.set(currentPly, evalObj);
            return next;
          });
        }
      })
      .catch((err) => {
        console.warn('Manual position search error:', err);
      });
  };

  // Helper to format engine name for display
  const getEngineDisplayName = (engId?: string): string => {
    return resolveEngineDisplayName(engId, t);
  };

  // Full-game batch analysis (１局全体解析)
  const handleBatchAnalyzeGame = async (forceRestart = false, depth = 10) => {
    if (isPositionEditMode || !engine.isReady || engine.isSearching || batchProgress) return;
    cancelBatchAnalysisRef.current = false;

    const maxPly = player.getMaxTesuu();
    const gameTitle = player.kifu.header['棋戦'] || player.kifu.header['戦型'] || t('studio.free_study');
    const engineDisplayName = getEngineDisplayName(engine.activeEngineId);

    setBatchProgress({
      gameIndex: 0,
      totalGames: 1,
      gameTitle,
      currentPly: 0,
      totalPlies: maxPly,
      engineName: engineDisplayName,
    });

    // Save current ply location
    const origPly = currentPly;
    const currentForks = player.forkPointers;

    const currentEvalHistory = forceRestart ? new Map<number, MoveEvaluation>() : new Map(evalHistory);
    if (forceRestart) {
      setEvalHistory(new Map());
    }

    const movetime = depth <= 8 ? 300 : depth <= 12 ? 600 : 1200;

    for (let p = 0; p <= maxPly; p++) {
      if (cancelBatchAnalysisRef.current) break;

      if (!forceRestart && currentEvalHistory.has(p)) {
        setBatchProgress({
          gameIndex: 0,
          totalGames: 1,
          gameTitle,
          currentPly: p + 1,
          totalPlies: maxPly,
          engineName: engineDisplayName,
        });
        continue;
      }

      try {
        // Move to target ply
        player.goto(p, currentForks);
        setCurrentPly(p);

        // Check if the side to move is already in checkmate (no legal moves and in check)
        const currentTurn = player.shogi.turn as 0 | 1;
        const isCurrentCheck = player.shogi.isCheck(currentTurn);
        const hasMoves = hasAnyLegalMoves(player.shogi);

        if (isCurrentCheck && !hasMoves) {
          // Terminal checkmate reached!
          const mateEval: MoveEvaluation = {
            scoreCp: currentTurn === 1 ? 30000 : -30000,
            isMate: true,
            matePly: 0,
            depth,
            evaluatedAt: new Date().toISOString(),
          };
          currentEvalHistory.set(p, mateEval);
          setEvalHistory(new Map(currentEvalHistory));
          if (activeGameId) {
            updateStudioGameEvaluations(activeGameId, { [p]: mateEval }, { engineId: engine.activeEngineId, depth });
          }
        } else {
          const sfen = player.shogi.toSFENString();
          const res = await engine.searchPosition(sfen, undefined, { depth, movetime });
          if (res.evaluation) {
            const evalObj = res.evaluation;
            currentEvalHistory.set(p, evalObj);
            setEvalHistory(new Map(currentEvalHistory));

            // Persist to storage if activeGameId exists
            if (activeGameId) {
              updateStudioGameEvaluations(activeGameId, { [p]: evalObj }, { engineId: engine.activeEngineId, depth });
            }
          }
        }
      } catch (err) {
        console.warn(`Batch analysis failed at ply ${p}:`, err);
      }
      setBatchProgress({
        gameIndex: 0,
        totalGames: 1,
        gameTitle,
        currentPly: p + 1,
        totalPlies: maxPly,
        engineName: engineDisplayName,
      });
    }

    // Restore original position
    player.goto(origPly, currentForks);
    setCurrentPly(player.tesuu);
    setBatchProgress(null);
    bumpVersion();

    // Auto-extract and register Tactical Quiz Cards from turning points
    try {
      const targetGameId = activeGameId || `studio-game-${Date.now()}`;
      const openingId = player.kifu.header['戦型'] || 'other';
      const addedCount = autoRegisterStudioQuizzes({
        gameId: targetGameId,
        openingId,
        totalPlies: maxPly,
        evaluations: currentEvalHistory,
        getMoveAtPly: (ply: number) => {
          const m = player.getMove(ply);
          return m as JkfMoveData | null | undefined;
        },
      });

      if (addedCount > 0) {
        setQuizCreatedToast({ count: addedCount });
        setQuizPool(loadQuizPool().filter((c) => c.isEnabled));
        setTimeout(() => {
          setQuizCreatedToast(null);
        }, 4000);
      }
    } catch (qErr) {
      console.warn('Auto quiz extraction skipped or failed:', qErr);
    }
  };

  // Batch analyze multiple games sequentially from Library Management Modal
  const handleBatchAnalyzeMultipleGames = async (
    gameIds: string[],
    depth = 10,
    engineId?: EngineId,
    forceRestart = false
  ) => {
    if (!engine.isReady || engine.isSearching) return;
    trackEvent('ai_analysis_run', { scope: 'batch', count: gameIds.length });
    cancelBatchAnalysisRef.current = false;

    const chosenEngineId = engineId || engine.activeEngineId;

    // Switch engine if a specific engine was selected
    if (chosenEngineId !== engine.activeEngineId) {
      await engine.switchEngine(chosenEngineId);
    }

    // Enable MultiPV=3 for batch analysis to capture top candidate moves for high-quality quiz choices (Spec §3.2)
    engine.setOption('USI_MultiPV', 3);

    const savedGames = loadSavedStudioGames();
    const movetime = depth <= 8 ? 300 : depth <= 12 ? 600 : 1200;
    const activeEngineName = getEngineDisplayName(chosenEngineId);

    for (let gIdx = 0; gIdx < gameIds.length; gIdx++) {
      if (cancelBatchAnalysisRef.current) break;

      const gid = gameIds[gIdx];
      if (!gid) continue;
      let targetGame = savedGames.find((g) => g.id === gid);
      if (!targetGame) continue;
      if (!targetGame.jkfJson || targetGame.jkfJson === '{}') {
        const hydrated = await ensureKifuRecordPayload(user?.uid, gid);
        if (hydrated) {
          targetGame = kifuRecordToStudioGame(hydrated);
        }
      }

      try {
        const parsedJkf = JSON.parse(targetGame.jkfJson);
        const gamePlayer = new JKFPlayer(parsedJkf);

        // Find the deepest playable stream across the tree or active branch
        const treeStats = parsedJkf.moves ? getTreeBranchStats(parsedJkf.moves) : { longestStreamPlies: gamePlayer.getMaxTesuu(), longestStreamForkPointers: [] };
        const targetForkPointers = targetGame.activeForkPointers && targetGame.activeForkPointers.length > 0
          ? targetGame.activeForkPointers
          : treeStats.longestStreamForkPointers;

        // Apply fork pointers to navigate into the deepest branch stream
        if (targetForkPointers && targetForkPointers.length > 0) {
          gamePlayer.goto(0, targetForkPointers);
        }
        const maxP = Math.max(gamePlayer.getMaxTesuu(), treeStats.longestStreamPlies);

        const existingEvals = !forceRestart && targetGame.evaluations ? new Map<number, MoveEvaluation>(
          Object.entries(targetGame.evaluations).map(([k, v]) => [Number(k), v])
        ) : new Map<number, MoveEvaluation>();

        setBatchProgress({
          gameIndex: gIdx,
          totalGames: gameIds.length,
          gameTitle: targetGame.title,
          currentPly: 0,
          totalPlies: maxP,
          engineName: activeEngineName,
        });

        for (let p = 0; p <= maxP; p++) {
          if (cancelBatchAnalysisRef.current) break;

          if (!forceRestart && existingEvals.has(p)) {
            setBatchProgress({
              gameIndex: gIdx,
              totalGames: gameIds.length,
              gameTitle: targetGame.title,
              currentPly: p + 1,
              totalPlies: maxP,
              engineName: activeEngineName,
            });
            continue;
          }

          try {
            gamePlayer.goto(p, targetForkPointers);
          } catch (gotoErr) {
            console.warn(`Failed to goto ply ${p} with fork pointers:`, gotoErr);
            try {
              gamePlayer.goto(p);
            } catch (fallbackErr) {
              console.warn(`Failed fallback goto ply ${p}:`, fallbackErr);
              continue;
            }
          }
          const currentTurn = gamePlayer.shogi.turn as 0 | 1;
          const isCheck = gamePlayer.shogi.isCheck(currentTurn);
          const hasMoves = hasAnyLegalMoves(gamePlayer.shogi);

          if (isCheck && !hasMoves) {
            const mateEval: MoveEvaluation = {
              scoreCp: currentTurn === 1 ? 30000 : -30000,
              isMate: true,
              matePly: 0,
              depth,
              evaluatedAt: new Date().toISOString(),
            };
            existingEvals.set(p, mateEval);
            updateStudioGameEvaluations(targetGame.id, { [p]: mateEval }, { engineId: chosenEngineId, depth });
          } else {
            const sfen = gamePlayer.shogi.toSFENString();
            const res = await engine.searchPosition(sfen, undefined, { depth, movetime });
            if (res.evaluation) {
              const evalObj = res.evaluation;
              existingEvals.set(p, evalObj);
              updateStudioGameEvaluations(targetGame.id, { [p]: evalObj }, { engineId: chosenEngineId, depth });
            }
          }
          setBatchProgress({
            gameIndex: gIdx,
            totalGames: gameIds.length,
            gameTitle: targetGame.title,
            currentPly: p + 1,
            totalPlies: maxP,
            engineName: activeEngineName,
          });
        }

        // Auto-extract quizzes for this analyzed game
        autoRegisterStudioQuizzes({
          gameId: targetGame.id,
          openingId: targetGame.openingId || 'other',
          totalPlies: maxP,
          evaluations: existingEvals,
          getMoveAtPly: (ply: number) => {
            const m = gamePlayer.getMove(ply);
            return m as JkfMoveData | null | undefined;
          },
        });
        setQuizPool(loadQuizPool().filter((c) => c.isEnabled));

        // If this is currently active game, update in-memory state
        if (gid === activeGameId) {
          setEvalHistory(new Map(existingEvals));
        }
      } catch (err) {
        console.warn(`Failed batch analysis for game ${gid}:`, err);
      }
    }

    // Reset MultiPV back to 1 for standard match play
    engine.setOption('USI_MultiPV', 1);

    setBatchProgress(null);
    bumpVersion();
  };

  const handleCancelBatchAnalysis = () => {
    cancelBatchAnalysisRef.current = true;
    setBatchProgress(null);
  };

  // Extract Sente and Gote player names from JKF header
  const senteName = player.kifu.header['先手'] || t('board.sente');
  const goteName = player.kifu.header['後手'] || t('board.gote');
  const totalPlies = player.getMaxTesuu();

  // Compute hands (captured pieces) for Sente (0) and Gote (1)
  const senteHands = useMemo(() => {
    const rawHands = player.shogi.hands[0];
    const counts: Record<string, number> = {};
    if (rawHands) {
      for (const p of rawHands) {
        counts[p.kind] = (counts[p.kind] ?? 0) + 1;
      }
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.shogi.hands, currentPly, version]);

  const goteHands = useMemo(() => {
    const rawHands = player.shogi.hands[1];
    const counts: Record<string, number> = {};
    if (rawHands) {
      for (const p of rawHands) {
        counts[p.kind] = (counts[p.kind] ?? 0) + 1;
      }
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.shogi.hands, currentPly, version]);

  // Optional read-only Shogi snapshot when stepping through Mate/PV sequences in Edit Mode
  const editPreviewShogi = useMemo(() => {
    if (!isPositionEditMode || !editPreviewState) return null;
    try {
      const shogi = new Shogi();
      shogi.initializeFromSFENString(editPreviewState.sfen);
      return shogi;
    } catch {
      return null;
    }
  }, [isPositionEditMode, editPreviewState]);

  const displayShogi = editPreviewShogi ?? player.shogi;
  const displaySenteHands: Record<string, number> = editPreviewShogi
    ? editPreviewShogi.getHandsSummary(0)
    : senteHands;
  const displayGoteHands: Record<string, number> = editPreviewShogi
    ? editPreviewShogi.getHandsSummary(1)
    : goteHands;

  // Position Edit Mode lifecycle & interaction helpers
  const applyEditedSfenInPlace = (nextSfen: string) => {
    setEditPreviewState(null);
    player.shogi.initializeFromSFENString(nextSfen);
    bumpVersion();
  };

  const enterPositionEditMode = (options?: {
    startSfen?: string;
    target?: PositionSaveInitialTarget | null;
    defaultCategory?: PositionSaveCategory;
    force?: boolean;
  }) => {
    if (!options?.force && (isMatchActive || (activeMode === 'AI_MATCH' && !options?.startSfen))) {
      return;
    }
    engine.stop();
    if (options?.force) {
      setIsMatchActive(false);
      setMatchResult(null);
    }
    editBackupRef.current = {
      kifuJson: JSON.stringify(player.kifu),
      ply: currentPly,
      forkPointers: player.forkPointers ? [...player.forkPointers] : [],
    };
    if (options?.startSfen) {
      setPlayer(createJkfPlayerFromSfen(options.startSfen));
      setCurrentPly(0);
    }
    setActiveMode('STUDY');
    setIsStudioMenuOpen(false);
    setSelectedSquare(null);
    setSelectedPieceFromHand(null);
    setEditSelection(null);
    setEditPreviewState(null);
    setEditSaveTarget(options?.target ?? null);
    setEditDefaultCategory(options?.defaultCategory);
    setIsPositionEditMode(true);
    bumpVersion();
  };

  const commitAndExitPositionEditMode = () => {
    const editedSfen = player.shogi.toSFENString();
    const committed = createJkfPlayerFromSfen(editedSfen, {
      '先手': senteName,
      '後手': goteName,
    });
    setPlayer(committed);
    setCurrentPly(0);
    setEvalHistory(new Map());
    setLocalEvalHistory(new Map());
    setMatchStartOrigin('resume');
    setIsPositionEditMode(false);
    setEditSelection(null);
    setEditPreviewState(null);
    setEditSaveTarget(null);
    setEditDefaultCategory(undefined);
    editBackupRef.current = null;
    bumpVersion();
  };

  const cancelPositionEditMode = () => {
    if (editBackupRef.current) {
      try {
        const parsed = JSON.parse(editBackupRef.current.kifuJson);
        const restored = new JKFPlayer(parsed);
        restored.goto(editBackupRef.current.ply, editBackupRef.current.forkPointers);
        setPlayer(restored);
        setCurrentPly(editBackupRef.current.ply);
      } catch (err) {
        console.warn('Failed to restore pre-edit board state:', err);
      }
    }
    setIsPositionEditMode(false);
    setEditSelection(null);
    setEditPreviewState(null);
    setEditSaveTarget(null);
    setEditDefaultCategory(undefined);
    editBackupRef.current = null;
    bumpVersion();
  };

  const handleEditSquareClick = (square: StudioBoardSquare) => {
    if (editPreviewState !== null) {
      setEditPreviewState(null);
      return;
    }
    const pos = parsePositionSfen(player.shogi.toSFENString());
    const res = applyEditSquareClick(pos, editSelection, square.x, square.y);
    setEditSelection(res.nextSelection);
    if (res.changed) {
      applyEditedSfenInPlace(serializePositionSfen(res.pos));
    }
  };

  const handleEditSquareRightClick = (square: StudioBoardSquare) => {
    if (editPreviewState !== null) {
      setEditPreviewState(null);
      return;
    }
    const pos = parsePositionSfen(player.shogi.toSFENString());
    const res = applyEditSquareRightClick(pos, square.x, square.y);
    if (res.changed) {
      applyEditedSfenInPlace(serializePositionSfen(res.pos));
      if (
        editSelection?.source === 'board' &&
        editSelection.x === square.x &&
        editSelection.y === square.y
      ) {
        setEditSelection(null);
      }
    }
  };

  const handleEditHandClick = (color: 0 | 1, clickedKind?: string) => {
    if (editPreviewState !== null) {
      setEditPreviewState(null);
      return;
    }
    const pos = parsePositionSfen(player.shogi.toSFENString());
    const res = applyEditHandClick(pos, editSelection, color, clickedKind);
    setEditSelection(res.nextSelection);
    if (res.changed) {
      applyEditedSfenInPlace(serializePositionSfen(res.pos));
    }
  };

  const handleEditBoxClick = (clickedBase?: PieceBase) => {
    if (editPreviewState !== null) {
      setEditPreviewState(null);
      return;
    }
    const pos = parsePositionSfen(player.shogi.toSFENString());
    const res = applyEditBoxClick(pos, editSelection, clickedBase);
    setEditSelection(res.nextSelection);
    if (res.changed) {
      applyEditedSfenInPlace(serializePositionSfen(res.pos));
    }
  };

  const handleEditMarginClick = (e: React.MouseEvent<HTMLElement>) => {
    if (isPositionEditMode && e.target === e.currentTarget) {
      setEditSelection(null);
    }
  };

  // Navigate to target ply in game
  const goToPly = (target: number, forkPointers?: ForkPointer[]) => {
    const prevPly = player.tesuu;
    const safeTarget = Math.max(0, Math.min(totalPlies, target));
    if (forkPointers) {
      player.goto(safeTarget, forkPointers);
    } else {
      player.goto(safeTarget);
    }
    setCurrentPly(player.tesuu);
    if (player.tesuu !== prevPly) {
      playPieceMoveSound();
    }
    setSelectedSquare(null);
    setSelectedPieceFromHand(null);
    setPendingPromotion(null);
    setTraceFeedback(null);
    setMobileActiveTab('board');
    bumpVersion();
  };

  const activeProtectedMatchInfo = useMemo(() => {
    if (!activeGameId) {
      return { isProtected: false, originalMainlineLength: 0 };
    }
    const rec = getKifuRecord(activeGameId);
    if (!rec || !isProtectedMatchRecord(rec)) {
      return { isProtected: false, originalMainlineLength: 0 };
    }
    return {
      isProtected: true,
      originalMainlineLength: extractMainlineMoveSignature(rec.jkfJson).length,
    };
  }, [activeGameId, version]);

  // Re-check saved study draft when returning to Studio or reopening a kifu
  useEffect(() => {
    if (!isRouteActive || isMatchActive || isPositionEditMode) return;
    const draft = loadStudioDraft();
    if (!draft || draft.totalPlies <= 0) return;
    const currentJkf = JSON.stringify(player.kifu);
    const matchesCurrentContext =
      (!activeGameId && !draft.gameId) ||
      (Boolean(activeGameId) && draft.gameId === activeGameId);
    if (matchesCurrentContext && draft.jkfJson !== currentJkf) {
      setDetectedDraft(draft);
    }
  }, [isRouteActive, activeGameId, isMatchActive, isPositionEditMode, player]);

  // Explicitly prune (delete) all moves occurring after the given ply on the current branch
  const handlePruneSubsequentMoves = (ply: number) => {
    if (ply >= totalPlies) return;
    const isProtectedMainlineEdit = activeProtectedMatchInfo.isProtected && !isVariation;
    const confirmKey = isProtectedMainlineEdit
      ? 'studio.tree.prune_mainline_protected_confirm'
      : 'studio.tree.prune_subsequent_confirm';
    const confirmMsg = t(confirmKey, { ply });

    const executePrune = () => {
      try {
        player.goto(ply);
        const currentForkStream = player.forks[player.forks.length - 1];
        if (!currentForkStream) return;
        const indexInStream = player.tesuu - currentForkStream.te;
        currentForkStream.moves.splice(indexInStream + 1);

        // Reset cursor cleanly to update JKFPlayer internal maxTesuu and board state
        const activeForks = player.forkPointers ? [...player.forkPointers] : [];
        player.goto(0, activeForks);
        player.goto(ply, activeForks);

        // Also clean up evaluations after pruned ply
        setEvalHistory((prev) => {
          const next = new Map(prev);
          for (const k of next.keys()) {
            if (k > ply) {
              next.delete(k);
            }
          }
          return next;
        });

        setCurrentPly(player.tesuu);
        bumpVersion();
      } catch (err) {
        console.error('Failed to prune subsequent moves:', err);
      }
    };

    setStudioConfirmDialog({
      title: isProtectedMainlineEdit
        ? t('studio.tree.mainline_protected_badge')
        : t('studio.tree.prune_subsequent'),
      message: confirmMsg,
      isDestructive: true,
      onConfirm: () => {
        setStudioConfirmDialog(null);
        executePrune();
      },
    });
  };

  // Explicitly delete a specific branch/fork at the given ply
  const handleDeleteFork = (ply: number, forkIdx: number, forkMoveStr: string) => {
    const confirmMsg = t('studio.tree.delete_fork_confirm', { ply, move: forkMoveStr });
    const executeDelete = () => {
      try {
        const parentForkIndex = player.forks.length - 1;
        const currentForkStream = player.forks[parentForkIndex];
        if (!currentForkStream) return;
        const indexInParent = ply - currentForkStream.te;
        const moveObj = currentForkStream.moves[indexInParent];

        if (moveObj && moveObj.forks && moveObj.forks[forkIdx]) {
          moveObj.forks.splice(forkIdx, 1);
          if (moveObj.forks.length === 0) {
            delete moveObj.forks;
          }

          // Reset cursors to refresh tree
          const activeForks = player.forkPointers ? [...player.forkPointers] : [];
          const safePly = Math.min(ply - 1, player.tesuu);
          player.goto(0, activeForks);
          player.goto(safePly, activeForks);

          setCurrentPly(player.tesuu);
          bumpVersion();
        }
      } catch (err) {
        console.error('Failed to delete fork:', err);
      }
    };

    setStudioConfirmDialog({
      title: t('studio.tree.delete_fork'),
      message: confirmMsg,
      isDestructive: true,
      onConfirm: () => {
        setStudioConfirmDialog(null);
        executeDelete();
      },
    });
  };

  const canUndoLastMove =
    currentPly > 0 &&
    currentPly === totalPlies &&
    !isMatchActive &&
    !isPositionEditMode &&
    activeMode !== 'SHOGI_TRACE' &&
    activeMode !== 'QUIZ' &&
    activeMode !== 'TSUMEGO';

  // Undo only the last played move at the tip of the current study branch (warns if modifying protected mainline)
  const handleUndoLastMove = () => {
    if (!canUndoLastMove) return;

    const executeUndo = () => {
      const targetPly = currentPly - 1;
      try {
        const lastStream = player.forks[player.forks.length - 1];
        if (!lastStream) return;

        if (player.forks.length > 1 && player.tesuu === lastStream.te && lastStream.moves.length <= 1) {
          // Current move is the sole move starting a sub-fork: remove that empty fork cleanly from its parent
          const activeForks = player.forkPointers ? [...player.forkPointers] : [];
          const lastPointer = activeForks.pop();
          const parentStream = player.forks[player.forks.length - 2];

          player.goto(0, activeForks);
          player.goto(targetPly, activeForks);

          if (parentStream && lastPointer) {
            const indexInParent = lastPointer.te - parentStream.te;
            const parentMove = parentStream.moves[indexInParent];
            if (parentMove?.forks && parentMove.forks[lastPointer.forkIndex]) {
              parentMove.forks.splice(lastPointer.forkIndex, 1);
              if (parentMove.forks.length === 0) {
                delete parentMove.forks;
              }
            }
          }

          player.goto(0, activeForks);
          player.goto(targetPly, activeForks);
        } else {
          player.goto(targetPly);
          const currentForkStream = player.forks[player.forks.length - 1];
          if (!currentForkStream) return;
          const indexInStream = player.tesuu - currentForkStream.te;
          currentForkStream.moves.splice(indexInStream + 1);

          const activeForks = player.forkPointers ? [...player.forkPointers] : [];
          player.goto(0, activeForks);
          player.goto(targetPly, activeForks);
        }

        setEvalHistory((prev) => {
          const next = new Map(prev);
          for (const k of next.keys()) {
            if (k > targetPly) {
              next.delete(k);
            }
          }
          return next;
        });

        setCurrentPly(player.tesuu);
        bumpVersion();
      } catch (err) {
        console.error('Failed to undo last move:', err);
      }
    };

    if (
      activeProtectedMatchInfo.isProtected &&
      !isVariation &&
      currentPly <= activeProtectedMatchInfo.originalMainlineLength
    ) {
      setStudioConfirmDialog({
        title: t('studio.tree.mainline_protected_badge'),
        message: t('studio.tree.undo_mainline_protected_confirm', { ply: currentPly }),
        isDestructive: true,
        onConfirm: () => {
          setStudioConfirmDialog(null);
          executeUndo();
        },
      });
      return;
    }

    executeUndo();
  };

  useEffect(() => {
    if (!isRouteActive || !canUndoLastMove) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndoLastMove();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRouteActive, canUndoLastMove, currentPly, totalPlies, version]);

  const [boardExportStatus, setBoardExportStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [copiedActionId, setCopiedActionId] = useState<string | null>(null);

  const studioQuickPins =
    settings.studioQuickPins ?? DEFAULT_APP_SETTINGS.studioQuickPins ?? [];

  const handleToggleQuickPin = (pinId: string) => {
    const exists = studioQuickPins.includes(pinId);
    const nextPins = exists
      ? studioQuickPins.filter((p) => p !== pinId)
      : studioQuickPins.length < MAX_STUDIO_QUICK_PINS
        ? [...studioQuickPins, pinId]
        : studioQuickPins;
    updateSettings({ studioQuickPins: nextPins });
  };

  const handleResetQuickPins = () => {
    updateSettings({
      studioQuickPins: [...(DEFAULT_APP_SETTINGS.studioQuickPins ?? [])],
    });
  };

  const showCopyFeedback = (ok: boolean, actionId?: string) => {
    setBoardExportStatus(ok ? 'copied' : 'error');
    setCopiedActionId(ok && actionId ? actionId : null);
    window.setTimeout(() => {
      setBoardExportStatus('idle');
      setCopiedActionId(null);
    }, 1800);
  };

  const buildStudioExportSvg = (): string => {
    const activeLastMove = isPositionEditMode ? editPreviewState?.lastMove : lastMoveObj;
    return renderFullBoardToSvg({
      cells: buildFullBoardCellsFromShogi(displayShogi),
      senteHands: displaySenteHands,
      goteHands: displayGoteHands,
      isFlipped,
      showCoordinates,
      lastMove: activeLastMove?.to ?? null,
      caption: `${senteName} vs ${goteName} (${currentPly})`,
    });
  };

  const buildCurrentBranchKifText = (maxPly: number): string => {
    const lines: string[] = ['#KIF version=2.0'];
    const header = player.kifu.header ?? {};
    if (!header['手合割']) {
      lines.push('手合割：平手');
    }
    for (const [k, v] of Object.entries(header)) {
      if (v) {
        lines.push(`${k}：${v}`);
      }
    }
    lines.push('手数----指手---------消費時間--');

    const state = player.getReadableKifuState();
    const limit = Math.min(maxPly, state.length - 1);
    let prevDest: { file: number; rank: number } | undefined;

    for (let i = 1; i <= limit; i += 1) {
      const step = state[i];
      const m = step?.moveFormat?.move;
      if (m) {
        const moveStr = formatKifMove(
          {
            ply: i,
            color: m.color === 0 ? 'b' : 'w',
            from: m.from ? { file: m.from.x, rank: m.from.y } : undefined,
            to: { file: m.to.x, rank: m.to.y },
            piece: m.piece,
            promote: Boolean(m.promote),
            isDrop: !m.from,
            kifString: step?.kifu ?? '',
            sfenMove: '',
          },
          prevDest
        );
        prevDest = { file: m.to.x, rank: m.to.y };
        lines.push(`${i} ${moveStr}`);
      } else if (step?.moveFormat?.special) {
        const specialMap: Record<string, string> = {
          TORYO: '投了',
          CHUDAN: '中断',
          SENNICHITE: '千日手',
          TIME_UP: '切れ負け',
          ILLEGAL_MOVE: '反則負け',
          JISHOGI: '持将棋',
          KACHI: '入玉勝ち',
          HIKIWAKE: '引き分け',
          TSUMI: '詰み',
          FUZUMI: '不詰',
          MAX_MOVES: '持将棋',
          ERROR: 'エラー',
        };
        const rawSpecial = step.moveFormat.special;
        const localizedSpecial = specialMap[rawSpecial.toUpperCase()] ?? rawSpecial;
        lines.push(`${i} ${localizedSpecial}`);
      }
    }

    return lines.join('\n');
  };

  // Last move from game sequence (or quiz opponentLastMove / replay move)
  const currentMove = currentPly >= 0 && currentPly <= player.getMaxTesuu() ? player.getMove(currentPly) : null;
  const lastMoveObj = useMemo(() => {
    if (activeMode === 'QUIZ' && currentQuizCard) {
      if (quizReplayState?.isActive && quizReplayState.currentIndex > 0) {
        const usi = quizReplayState.moves[quizReplayState.currentIndex - 1];
        if (usi) {
          const parsed = parseUsiMove(usi);
          if (parsed) {
            return {
              from: parsed.from ? { x: parsed.from.x, y: parsed.from.y } : undefined,
              to: { x: parsed.to.x, y: parsed.to.y },
            };
          }
        }
      }
      if (currentQuizCard.opponentLastMove) {
        const om = currentQuizCard.opponentLastMove;
        return {
          from: om.from ? { x: om.from.file, y: om.from.rank } : undefined,
          to: { x: om.to.file, y: om.to.rank },
        };
      }
    }
    if (!currentMove) return null;
    return {
      from: currentMove.from ? { x: currentMove.from.x, y: currentMove.from.y } : undefined,
      to: { x: currentMove.to.x, y: currentMove.to.y },
    };
  }, [currentMove, activeMode, currentQuizCard, quizReplayState]);

  // Compute legal target squares for highlighted dots using immutable ShogiBoard logic
  // (Zero mutation on player.shogi - prevents shogi.js unmove from reverting promoted pieces like 馬 to 角)
  const targetSquares: StudioBoardSquare[] = useMemo(() => {
    try {
      const sfen = player.shogi.toSFENString();
      const board = ShogiBoard.fromSfen(sfen);
      const color = player.shogi.turn === 0 ? 'b' : 'w';

      if (selectedSquare) {
        const strictMoves = getStrictLegalMovesForSquare(board, {
          file: selectedSquare.x,
          rank: selectedSquare.y,
        });
        return strictMoves.map((m) => ({ x: m.to.file, y: m.to.rank }));
      }

      if (selectedPieceFromHand) {
        const strictDrops = getStrictLegalDropsForPiece(board, selectedPieceFromHand, color);
        return strictDrops.map((d) => ({ x: d.file, y: d.rank }));
      }
    } catch (err) {
      console.warn('Failed computing legal target squares via immutable board:', err);
    }

    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSquare, selectedPieceFromHand, player.shogi, currentPly, version]);

  // Check if a move forces promotion (pawn/lance at rank 1, knight at ranks 1-2)
  const isMandatoryPromotion = (pieceKind: string, toY: number, color: number): boolean => {
    if (color === 0) {
      if ((pieceKind === 'FU' || pieceKind === 'KY') && toY === 1) return true;
      if (pieceKind === 'KE' && toY <= 2) return true;
    } else {
      if ((pieceKind === 'FU' || pieceKind === 'KY') && toY === 9) return true;
      if (pieceKind === 'KE' && toY >= 8) return true;
    }
    return false;
  };

  // Check if a move is eligible for promotion (only unpromoted pieces can promote)
  const isPromotionEligible = (pieceKind: string, fromY: number, toY: number, color: number): boolean => {
    if (!PROMOTABLE_KINDS.has(pieceKind) || PROMOTED_KINDS.has(pieceKind)) return false;
    if (color === 0) {
      return fromY <= 3 || toY <= 3;
    }
    return fromY >= 7 || toY >= 7;
  };

  // Execute a verified move or fork in Study mode
  const executeStudyMove = (
    from: StudioBoardSquare | undefined,
    to: StudioBoardSquare,
    pieceKind: string,
    promote?: boolean
  ) => {
    try {
      const turn = player.shogi.turn;

      // Only keep promote boolean if move was actually promotion-eligible
      // If piece cannot promote or move wasn't in/out of enemy zone, promote MUST be undefined
      // to prevent kifu format from falsely marking "不成" on normal moves
      let finalPromote: boolean | undefined = undefined;
      if (from && isPromotionEligible(pieceKind, from.y, to.y, turn)) {
        finalPromote = Boolean(promote);
      }

      // Validate legality against check (do not allow moves that leave or place King in check)
      if (from) {
        const destPiece = player.shogi.get(to.x, to.y);
        const originalMovingPiece = player.shogi.get(from.x, from.y);
        const originalKind = (originalMovingPiece ? originalMovingPiece.kind : pieceKind) as Formats.Kind;
        player.shogi.move(from.x, from.y, to.x, to.y, finalPromote);
        const stillChecked = player.shogi.isCheck(turn);
        const movedPiece = player.shogi.get(to.x, to.y);
        const wasAutoPromoted = movedPiece ? movedPiece.kind !== originalKind : false;
        player.shogi.unmove(
          from.x,
          from.y,
          to.x,
          to.y,
          Boolean(finalPromote || wasAutoPromoted),
          destPiece ? destPiece.kind : undefined
        );
        // Strictly restore original piece kind to prevent shogi.js unmove side-effects on live board
        const restoredPiece = player.shogi.get(from.x, from.y);
        if (restoredPiece && restoredPiece.kind !== originalKind) {
          restoredPiece.kind = originalKind;
        }
        if (stillChecked) {
          // Illegal: King would remain or end up in check (王手放置 / 自殺手)
          setSelectedSquare(null);
          setSelectedPieceFromHand(null);
          setPendingPromotion(null);
          return;
        }
      } else {
        // Drop validation
        player.shogi.drop(to.x, to.y, pieceKind as Formats.Kind, turn);
        const stillChecked = player.shogi.isCheck(turn);
        player.shogi.undrop(to.x, to.y);
        if (stillChecked) {
          // Illegal drop: King would remain in check
          setSelectedSquare(null);
          setSelectedPieceFromHand(null);
          setPendingPromotion(null);
          return;
        }
      }

      // If current move is a special termination (TORYO, CHUDAN, etc.), step back to the actual last playable position before branching
      const currentMoveFormat = player.getMoveFormat();
      if (currentMoveFormat && currentMoveFormat.special && player.tesuu > 0) {
        player.goto(player.tesuu - 1);
      }

      // If we are creating a new branch/variation, invalidate current ply eval from cache
      const isAlreadyVariation = Boolean(player.forkPointers && player.forkPointers.length > 0);
      if (!isAlreadyVariation) {
        setEvalHistory((prev) => {
          const next = new Map(prev);
          // Remove plies from the branch point onward so they are re-analyzed for the new branch
          for (const k of next.keys()) {
            if (k >= player.tesuu) {
              next.delete(k);
            }
          }
          return next;
        });
      }

      player.inputMove({
        from: from ? { x: from.x, y: from.y } : undefined,
        to: { x: to.x, y: to.y },
        piece: pieceKind,
        promote: finalPromote,
      });
      setCurrentPly(player.tesuu);
      playPieceMoveSound();
      setSelectedSquare(null);
      setSelectedPieceFromHand(null);
      setPendingPromotion(null);
      setHintHighlightMove(null); // Clear hint highlight on move

      // If in active match, track played moves for the match record
      if (isMatchActive) {
        const readableMove = player.getReadableKifu(player.tesuu);
        setMatchMovesList((prev) => [...prev, { ply: player.tesuu, moveText: readableMove }]);
        
        applyFischerIncrement(turn as 0 | 1);
        if (clockSwitchMode === 'manual') {
          const moverParticipant = turn === 0 ? matchSentePlayer : matchGotePlayer;
          if (moverParticipant === 'human') {
            // Human just moved -> human must press clock to pass turn
            setIsWaitingClockPress(true);
          } else {
            // AI just moved -> AI automatically hits the clock switch instantly!
            setIsWaitingClockPress(false);
          }
        } else {
          setIsWaitingClockPress(false);
        }

        // Append current SFEN to match history and check Sanyata (千日手) / Impasse (持将棋)
        const newSfen = player.shogi.toSFENString();
        const updatedSfenList = [...matchSfenHistory, newSfen];
        setMatchSfenHistory(updatedSfenList);

        // 1. Check 千日手 (Sanyata - 4 repetitions)
        const sanyataResult = checkSanyataRepetition(updatedSfenList);
        if (sanyataResult.isSanyata) {
          handleFinishMatch('sanyata_draw');
          return;
        }

        // 2. Check 入玉 & 持将棋 (Impasse & King Entering)
        const impasseResult = calculateImpassePoints(player.shogi, senteHands, goteHands);
        if (impasseResult.isImpasseReached) {
          if (impasseResult.impasseWinner === 'draw') {
            handleFinishMatch('impasse_draw');
            return;
          } else if (impasseResult.impasseWinner === 'sente') {
            handleFinishMatch(matchPlayerSide === 0 ? 'impasse_win' : 'impasse_lose');
            return;
          } else if (impasseResult.impasseWinner === 'gote') {
            handleFinishMatch(matchPlayerSide === 1 ? 'impasse_win' : 'impasse_lose');
            return;
          }
        }

        // Check if next turn player is in checkmate
        const nextTurn = player.shogi.turn;
        if (player.shogi.isCheck(nextTurn)) {
          const canEscape = hasAnyLegalMoves(player.shogi);
          if (!canEscape) {
            // Next turn has no legal moves -> Checkmate!
            if (nextTurn === matchPlayerSide) {
              // Player got mated -> Loss!
              handleFinishMatch('mate_lose');
            } else {
              // AI got mated -> Player Win!
              handleFinishMatch('mate_win');
            }
          }
        }
      }

      bumpVersion();
    } catch {
      // Ignore move if invalid
      setSelectedSquare(null);
      setSelectedPieceFromHand(null);
      setPendingPromotion(null);
    }
  };

  // Execute quiz attempt (from board interaction or choice button)
  const executeQuizAttempt = (
    usi: string,
    from?: StudioBoardSquare,
    to?: StudioBoardSquare,
    pieceKind?: string,
    promote?: boolean
  ) => {
    if (!currentQuizCard) return;

    const normalizedUsi = usi.trim().toLowerCase();
    const isBest =
      normalizedUsi === currentQuizCard.bestMove.toLowerCase() ||
      (currentQuizCard.choices &&
        currentQuizCard.choices.some((c) => c.isCorrect && c.usi.toLowerCase() === normalizedUsi));

    const choiceMatch = currentQuizCard.choices?.find(
      (c) => c.usi.toLowerCase() === normalizedUsi
    );

    const turnColor: 0 | 1 = currentQuizCard.sideToMove === 'w' ? 1 : 0;
    // Format move against base player before executing move
    const basePlayer = createQuizBasePlayer(currentQuizCard);
    const formattedPlayed = formatUsiToJapanese(usi, turnColor, basePlayer.shogi);
    setQuizLastPlayedMove(formattedPlayed);

    if (isBest) {
      setQuizVerdict('best');
      setQuizEvalLossCp(0);
      setIsAnswerRevealed(true);
      trackEvent('quiz_answer', { verdict: 'best' });
    } else if (choiceMatch && choiceMatch.scoreDelta !== undefined) {
      const matchLoss = Math.abs(choiceMatch.scoreDelta);
      if (matchLoss <= 150) {
        setQuizVerdict('acceptable');
        setIsAnswerRevealed(true);
        trackEvent('quiz_answer', { verdict: 'acceptable' });
      } else {
        setQuizVerdict('wrong');
        trackEvent('quiz_answer', { verdict: 'wrong' });
        // Do NOT reveal answer yet for wrong moves to allow user to retry!
      }
      setQuizEvalLossCp(matchLoss);
    } else {
      // Dynamic engine evaluation for custom/unknown board moves
      setQuizVerdict('wrong');
      setQuizEvalLossCp(300);
      trackEvent('quiz_answer', { verdict: 'wrong' });

      // Async: query active engine for dynamic real-time evaluation of custom move
      const baseSfen = currentQuizCard.startSfen || player.shogi.toSFENString();
      engine.searchPosition(baseSfen, [usi], { depth: 10 }).then((res) => {
        if (res && res.evaluation && res.evaluation.scoreCp !== undefined) {
          const evalDiff = currentQuizCard.sideToMove === 'b'
            ? currentQuizCard.scoreCpBefore - res.evaluation.scoreCp
            : res.evaluation.scoreCp - currentQuizCard.scoreCpBefore;
          const dynamicLoss = Math.round(Math.max(0, evalDiff));
          setQuizEvalLossCp(dynamicLoss);
          if (dynamicLoss === 0) {
            setQuizVerdict('best');
            setIsAnswerRevealed(true);
          } else if (dynamicLoss <= 150) {
            setQuizVerdict('acceptable');
            setIsAnswerRevealed(true);
          }
        }
      }).catch((err) => {
        console.warn('Dynamic quiz move eval error:', err);
      });
    }

    // Play move onto board if coordinates provided

    // Play move onto board if coordinates provided
    if (to && pieceKind) {
      executeStudyMove(from, to, pieceKind, promote);
    } else {
      // Parse USI and play onto board
      const parsed = parseUsiMove(usi, player.shogi);
      if (parsed) {
        executeStudyMove(parsed.from, parsed.to, parsed.piece, parsed.promote);
      }
    }
  };

  // Handle board square click
  const handleSquareClick = (square: StudioBoardSquare) => {
    if (isPositionEditMode) {
      handleEditSquareClick(square);
      return;
    }

    if (pendingPromotion) return; // Wait for promotion confirmation

    // In AI Match mode, strictly disable clicking when it is AI's turn or match ended
    if (isMatchActive) {
      if (matchResult !== null) return;
      const turn = player.shogi.turn;
      const participant = turn === 0 ? matchSentePlayer : matchGotePlayer;
      if (participant !== 'human') return; // Locked while AI is thinking!
      // In manual clock switch mode, player cannot make next move until the clock has been pressed
      if (clockSwitchMode === 'manual' && isWaitingClockPress) return;
    }

    // MODE: Shogi Trace Drill (Guessing next move)
    if (activeMode === 'SHOGI_TRACE') {
      const nextMove = player.getMove(currentPly + 1);
      if (!nextMove) {
        setTraceFeedback(t('studio.trace.finished'));
        return;
      }

      // If user selected a piece from hand, check if drop matches
      if (selectedPieceFromHand) {
        if (!nextMove.from && nextMove.piece === selectedPieceFromHand && nextMove.to.x === square.x && nextMove.to.y === square.y) {
          setTraceStats((prev) => ({
            ...prev,
            exact: traceMistakes === 0 && !traceUsedHint ? prev.exact + 1 : prev.exact,
            near: (traceMistakes >= 1 && traceMistakes <= 3) || (traceMistakes === 0 && traceUsedHint) ? prev.near + 1 : prev.near,
            wrong: traceMistakes >= 4 ? prev.wrong + 1 : prev.wrong,
          }));
          setTraceMistakes(0);
          setTraceUsedHint(false);
          setTraceAiBestRecordedPly(null);
          goToPly(currentPly + 1);
          setTraceFeedback(t('studio.trace.correct'));
        } else {
          const playedUsi = toUsi(undefined, square, selectedPieceFromHand, false);
          const aiBest = evalHistory.get(currentPly)?.bestMove;
          if (aiBest && playedUsi.toLowerCase() === aiBest.toLowerCase()) {
            if (traceAiBestRecordedPly !== currentPly) {
              setTraceStats((prev) => ({ ...prev, aiBest: prev.aiBest + 1 }));
              setTraceAiBestRecordedPly(currentPly);
            }
            setTraceFeedback(t('studio.trace.ai_best_feedback', '🌟 特別正解！棋譜とは異なりますが AI 最善手です（手順は進みません）'));
          } else {
            setTraceMistakes((m) => m + 1);
            setTraceFeedback(t('studio.trace.wrong'));
          }
        }
        setSelectedPieceFromHand(null);
        return;
      }

      // If square was selected, attempt to move
      if (selectedSquare) {
        if (selectedSquare.x === square.x && selectedSquare.y === square.y) {
          setSelectedSquare(null);
          return;
        }
        if (
          nextMove.from &&
          nextMove.from.x === selectedSquare.x &&
          nextMove.from.y === selectedSquare.y &&
          nextMove.to.x === square.x &&
          nextMove.to.y === square.y
        ) {
          setTraceStats((prev) => ({
            ...prev,
            exact: traceMistakes === 0 && !traceUsedHint ? prev.exact + 1 : prev.exact,
            near: (traceMistakes >= 1 && traceMistakes <= 3) || (traceMistakes === 0 && traceUsedHint) ? prev.near + 1 : prev.near,
            wrong: traceMistakes >= 4 ? prev.wrong + 1 : prev.wrong,
          }));
          setTraceMistakes(0);
          setTraceUsedHint(false);
          setTraceAiBestRecordedPly(null);
          goToPly(currentPly + 1);
          setTraceFeedback(t('studio.trace.correct'));
        } else {
          const playedUsi = toUsi(selectedSquare, square, player.shogi.get(selectedSquare.x, selectedSquare.y)?.kind, false);
          const aiBest = evalHistory.get(currentPly)?.bestMove;
          if (aiBest && (playedUsi.toLowerCase() === aiBest.toLowerCase() || `${playedUsi}+`.toLowerCase() === aiBest.toLowerCase())) {
            if (traceAiBestRecordedPly !== currentPly) {
              setTraceStats((prev) => ({ ...prev, aiBest: prev.aiBest + 1 }));
              setTraceAiBestRecordedPly(currentPly);
            }
            setTraceFeedback(t('studio.trace.ai_best_feedback', '🌟 特別正解！棋譜とは異なりますが AI 最善手です（手順は進みません）'));
          } else {
            setTraceMistakes((m) => m + 1);
            setTraceFeedback(t('studio.trace.wrong'));
          }
        }
        setSelectedSquare(null);
        return;
      }

      // First click: select piece on board
      const piece = player.shogi.get(square.x, square.y);
      if (piece && piece.color === player.shogi.turn) {
        setSelectedSquare(square);
      }
      return;
    }

    // MODE: In-Studio Tactical Quiz Solving
    if (activeMode === 'QUIZ') {
      if (!currentQuizCard) return;

      // Handle drop from hand in Quiz mode
      if (selectedPieceFromHand) {
        const isLegal = targetSquares.some((sq) => sq.x === square.x && sq.y === square.y);
        if (isLegal) {
          const moveUsi = toUsi(undefined, square, selectedPieceFromHand, false);
          executeQuizAttempt(moveUsi, undefined, square, selectedPieceFromHand, false);
        }
        setSelectedPieceFromHand(null);
        return;
      }

      // Handle piece move from board in Quiz mode
      if (selectedSquare) {
        if (selectedSquare.x === square.x && selectedSquare.y === square.y) {
          setSelectedSquare(null);
          return;
        }

        const isLegal = targetSquares.some((sq) => sq.x === square.x && sq.y === square.y);
        if (!isLegal) {
          const nextPiece = player.shogi.get(square.x, square.y);
          if (nextPiece && nextPiece.color === player.shogi.turn) {
            setSelectedSquare(square);
          } else {
            setSelectedSquare(null);
          }
          return;
        }

        const movingPiece = player.shogi.get(selectedSquare.x, selectedSquare.y);
        if (!movingPiece) {
          setSelectedSquare(null);
          return;
        }

        // Check promotion prompt or mandatory promotion
        if (isMandatoryPromotion(movingPiece.kind, square.y, movingPiece.color)) {
          const moveUsi = toUsi(selectedSquare, square, movingPiece.kind, true);
          executeQuizAttempt(moveUsi, selectedSquare, square, movingPiece.kind, true);
          return;
        }

        if (isPromotionEligible(movingPiece.kind, selectedSquare.y, square.y, movingPiece.color)) {
          setPendingPromotion({
            from: selectedSquare,
            to: square,
            pieceKind: movingPiece.kind,
          });
          return;
        }

        const moveUsi = toUsi(selectedSquare, square, movingPiece.kind, false);
        executeQuizAttempt(moveUsi, selectedSquare, square, movingPiece.kind, undefined);
        return;
      }

      // First click: select friendly piece
      const piece = player.shogi.get(square.x, square.y);
      if (piece && piece.color === player.shogi.turn) {
        setSelectedSquare(square);
        setSelectedPieceFromHand(null);
      }
      return;
    }

    // MODE: Study / Free Exploration
    // If a piece from hand was selected for drop
    if (selectedPieceFromHand) {
      const isLegal = targetSquares.some((sq) => sq.x === square.x && sq.y === square.y);
      if (isLegal) {
        executeStudyMove(undefined, square, selectedPieceFromHand, false);
      } else {
        setSelectedPieceFromHand(null);
      }
      return;
    }

    // If a board piece was previously selected
    if (selectedSquare) {
      if (selectedSquare.x === square.x && selectedSquare.y === square.y) {
        setSelectedSquare(null);
        return;
      }

      const isLegal = targetSquares.some((sq) => sq.x === square.x && sq.y === square.y);
      if (!isLegal) {
        // Maybe selected a different friendly piece
        const nextPiece = player.shogi.get(square.x, square.y);
        if (nextPiece && nextPiece.color === player.shogi.turn) {
          setSelectedSquare(square);
        } else {
          setSelectedSquare(null);
        }
        return;
      }

      const movingPiece = player.shogi.get(selectedSquare.x, selectedSquare.y);
      if (!movingPiece) {
        setSelectedSquare(null);
        return;
      }

      // Check promotion rules
      if (isMandatoryPromotion(movingPiece.kind, square.y, movingPiece.color)) {
        executeStudyMove(selectedSquare, square, movingPiece.kind, true);
        return;
      }

      if (isPromotionEligible(movingPiece.kind, selectedSquare.y, square.y, movingPiece.color)) {
        setPendingPromotion({
          from: selectedSquare,
          to: square,
          pieceKind: movingPiece.kind,
        });
        return;
      }

      // Normal unpromoted move (not eligible for promotion, promote should be undefined)
      executeStudyMove(selectedSquare, square, movingPiece.kind, undefined);
      return;
    }

    // First click: select friendly piece on board
    const piece = player.shogi.get(square.x, square.y);
    if (piece && piece.color === player.shogi.turn) {
      setSelectedSquare(square);
      setSelectedPieceFromHand(null);
    }
  };

  // Play recommended move directly from AI panel
  const handlePlayRecommendedMove = (usi: string) => {
    const parsed = parseUsiMove(usi, player.shogi);
    if (!parsed) return;
    executeStudyMove(parsed.from, parsed.to, parsed.piece, parsed.promote);
  };

  // Update comment for current position
  const [commentDraft, setCommentDraft] = useState<string>('');
  const [isCommentEditing, setIsCommentEditing] = useState<boolean>(false);

  // Sync commentDraft when ply or position changes
  useEffect(() => {
    try {
      const comments = player.getComments(currentPly);
      setCommentDraft(comments ? comments.join('\n') : '');
    } catch {
      setCommentDraft('');
    }
  }, [currentPly, player, version]);

  const handleSaveComment = (newComment: string) => {
    try {
      const moveFormat = player.getMoveFormat(currentPly);
      if (moveFormat) {
        const lines = newComment.split('\n').filter((line) => line.trim().length > 0);
        moveFormat.comments = lines.length > 0 ? lines : undefined;

        // Auto-save into library if activeGameId is present
        if (activeGameId) {
          const games = loadSavedStudioGames();
          const target = games.find((g) => g.id === activeGameId);
          if (target) {
            target.jkfJson = JSON.stringify(player.kifu);
            saveStudioGame(target);
          }
        }
        bumpVersion();
        setIsCommentEditing(false);
      }
    } catch (err) {
      console.warn('Failed to save comment:', err);
    }
  };

  // Restore working draft backup
  const handleRestoreDraft = () => {
    if (!detectedDraft) return;
    try {
      const parsedKifu = JSON.parse(detectedDraft.jkfJson);
      if (parsedKifu && parsedKifu.moves) {
        cleanJkfFalsyPromotions(parsedKifu.moves);
      }
      const newPlayer = new JKFPlayer(parsedKifu);
      setPlayer(newPlayer);
      if (detectedDraft.activeForkPointers && detectedDraft.activeForkPointers.length > 0) {
        newPlayer.goto(detectedDraft.currentPly || 0, detectedDraft.activeForkPointers);
      } else if (detectedDraft.currentPly > 0) {
        newPlayer.goto(detectedDraft.currentPly);
      }
      setCurrentPly(newPlayer.tesuu);
      setActiveGameId(detectedDraft.gameId || null);
      setDetectedDraft(null);
      bumpVersion();
    } catch (err) {
      console.error('Failed to restore draft:', err);
    }
  };

  const handleDismissDraft = () => {
    lastCleanJkfRef.current = JSON.stringify(player.kifu);
    clearStudioDraft();
    setDetectedDraft(null);
  };

  // Open a game from library (optionally jumping directly to initialPly)
  const handleOpenGame = async (game: SavedStudioGame, initialPly: number = 0) => {
    try {
      let targetGame = game;
      if (!targetGame.jkfJson || targetGame.jkfJson === '{}') {
        const hydrated = await ensureKifuRecordPayload(user?.uid, game.id);
        if (hydrated) {
          targetGame = kifuRecordToStudioGame(hydrated);
        }
      }

      let newPlayer: JKFPlayer | null = null;
      if (targetGame.jkfJson && targetGame.jkfJson !== '{}') {
        try {
          const parsedJkf = JSON.parse(targetGame.jkfJson);
          if (parsedJkf && parsedJkf.moves) {
            cleanJkfFalsyPromotions(parsedJkf.moves);
          }
          newPlayer = new JKFPlayer(parsedJkf);
        } catch (parseErr) {
          console.warn('Failed to parse jkfJson, attempting rawKif fallback:', parseErr);
        }
      }

      if (!newPlayer && targetGame.rawKif) {
        newPlayer = JKFPlayer.parseKIF(targetGame.rawKif);
      }
      if (!newPlayer) {
        throw new Error(`Unable to build JKFPlayer for game ${targetGame.id}`);
      }

      const maxTesuu = newPlayer.getMaxTesuu();
      const safeInitialPly = Math.max(0, Math.min(maxTesuu, initialPly));

      // Restore active fork pointers or deepest branch path safely without aborting load on stale pointers
      try {
        if (targetGame.activeForkPointers && targetGame.activeForkPointers.length > 0) {
          newPlayer.goto(safeInitialPly, targetGame.activeForkPointers);
        } else if (newPlayer.kifu.moves) {
          const stats = getTreeBranchStats(newPlayer.kifu.moves);
          if (stats.longestStreamForkPointers.length > 0 && safeInitialPly > 0) {
            newPlayer.goto(safeInitialPly, stats.longestStreamForkPointers);
          } else if (safeInitialPly > 0) {
            newPlayer.goto(safeInitialPly);
          }
        } else if (safeInitialPly > 0) {
          newPlayer.goto(safeInitialPly);
        }
      } catch (gotoErr) {
        console.warn('Branch pointer restoration failed, falling back to mainline:', gotoErr);
        newPlayer.goto(safeInitialPly);
      }

      setPlayer(newPlayer);
      setActiveGameId(targetGame.id);
      setActiveGameTitle(targetGame.title || '');
      setActiveGameTags(targetGame.tags && targetGame.tags.length > 0 ? targetGame.tags : ['研究']);
      setCurrentPly(newPlayer.tesuu);
      lastCleanJkfRef.current = JSON.stringify(newPlayer.kifu);
      setDetectedDraft(null);
      setSelectedSquare(null);
      setSelectedPieceFromHand(null);
      setPendingPromotion(null);
      if (targetGame.rawKif) setKifText(targetGame.rawKif);
      setTraceFeedback(null);

      // Restore saved evaluations or initialize fresh
      const restored = new Map<number, MoveEvaluation>();
      if (targetGame.evaluations) {
        Object.entries(targetGame.evaluations).forEach(([plyStr, ev]) => {
          restored.set(Number(plyStr), ev);
        });
      }
      setEvalHistory(restored);
      setLocalEvalHistory(new Map());

      bumpVersion();
    } catch (err) {
      console.error('Failed to load game into JKFPlayer:', err);
    }
  };

  // Pause active engine searches when Studio is hidden; lightly refresh Library-editable lists on resume
  useEffect(() => {
    if (!isRouteActive) {
      wasRouteActiveRef.current = false;
      engine.stop();
      return;
    }

    if (!wasRouteActiveRef.current) {
      wasRouteActiveRef.current = true;
      setTsumegoList(loadTsumegoProblems());
      setTagGroups(loadStructuredTagGroups());

      const allCards = loadQuizPool();
      const enabledCards = allCards.filter((c) => c.isEnabled);
      if (activeMode === 'QUIZ') {
        const cardMap = new Map(allCards.map((c) => [c.id, c]));
        setQuizPool((prev) => {
          const seen = new Set<string>();
          const updated: TacticalQuizCard[] = [];
          for (const existing of prev) {
            const latest = cardMap.get(existing.id);
            if (latest) {
              updated.push(latest);
              seen.add(latest.id);
            }
          }
          for (const card of enabledCards) {
            if (!seen.has(card.id)) {
              updated.push(card);
              seen.add(card.id);
            }
          }
          return updated;
        });
      } else {
        setQuizPool(enabledCards);
      }

      if (activeGameId) {
        const latestRecord = getKifuRecord(activeGameId);
        if (latestRecord) {
          setActiveGameTitle(latestRecord.title);
          setActiveGameTags(
            latestRecord.tags.length > 0 ? latestRecord.tags : ['研究']
          );
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRouteActive]);

  // Unified route-sync: apply URL query intents on initial/new visits, preserve live state on history Back
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const isInitialVisit = lastStudioLocationKeyRef.current === null;
    const decision = evaluateStudioRouteSync({
      isRouteActive,
      locationKey: location.key,
      lastStudioLocationKey: lastStudioLocationKeyRef.current,
      hasIntent: hasStudioNavigationIntent(params),
    });
    lastStudioLocationKeyRef.current = decision.nextLastStudioLocationKey;

    if (!decision.shouldApply) return;

    const resetTransientOverlays = () => {
      engine.stop();
      setIsPositionEditMode(false);
      setEditingQuizCard(null);
      setEditSelection(null);
      setEditPreviewState(null);
      setEditSaveTarget(null);
      setEditDefaultCategory(undefined);
      editBackupRef.current = null;
      setIsManagementModalOpen(false);
      setIsQuizPoolModalOpen(false);
      setIsTacticsLibraryOpen(false);
      setIsStudioMenuOpen(false);
      setIsMatchActive(false);
      setMatchResult(null);
    };

    const isNew = params.get('new') === 'true';
    const isResume = params.get('resume') === 'true';
    const targetGameId = params.get('gameId');
    const tacticIdParam = params.get('tacticId');
    const editPositionParam = params.get('editPosition');
    const sfenParam = params.get('sfen');
    const tsumegoIdParam = params.get('tsumegoId');
    const quizIdParam = params.get('quizId');
    const defaultCategoryParam = params.get('defaultCategory');
    const startFromCurrent = params.get('startFromCurrent') === '1';
    const modeParam = params.get('mode');
    const isLibraryParam = params.get('library') === 'true';
    const isTreeParam = params.get('tree') === 'true';
    const isQuizFlag = params.get('quiz') === 'true';
    const isTsumegoFlag = params.get('tsumego') === 'true';

    const validDefaultCategory: PositionSaveCategory | undefined =
      defaultCategoryParam === 'joseki' ||
      defaultCategoryParam === 'study' ||
      defaultCategoryParam === 'tsumego' ||
      defaultCategoryParam === 'quiz'
        ? defaultCategoryParam
        : undefined;

    const editQuizIdParam = params.get('editQuizId');
    if (editQuizIdParam === 'new') {
      const nowIso = new Date().toISOString();
      const newCard: TacticalQuizCard = {
        id: `manual_quiz_${Date.now()}`,
        source: 'manual',
        sourceGameId: 'manual',
        openingId: 'custom',
        type: 'attack',
        ply: 0,
        startSfen: HIRATE_SFEN,
        usiMovesToPosition: [],
        sideToMove: 'b',
        bestMove: '',
        pv: [],
        scoreCpBefore: 0,
        isEnabled: true,
        createdAt: nowIso,
      };
      resetTransientOverlays();
      setQuizEditReturnTarget('library');
      setEditingQuizCard(newCard);
      return;
    }
    if (editQuizIdParam) {
      const card = loadQuizPool().find((c) => c.id === editQuizIdParam);
      if (card) {
        resetTransientOverlays();
        setQuizEditReturnTarget('library');
        setEditingQuizCard(card);
        return;
      }
    }

    if (editPositionParam === 'new') {
      setIsManagementModalOpen(false);
      enterPositionEditMode({
        startSfen: HIRATE_SFEN,
        target: null,
        defaultCategory: validDefaultCategory,
        force: true,
      });
      return;
    }

    if (editPositionParam === '1') {
      if (quizIdParam) {
        const card = loadQuizPool().find((c) => c.id === quizIdParam);
        if (card) {
          setIsManagementModalOpen(false);
          enterPositionEditMode({
            startSfen: card.startSfen,
            target: {
              category: 'quiz',
              id: card.id,
              title: card.title || card.id,
              quizCard: card,
            },
            force: true,
          });
          return;
        }
      }

      if (tsumegoIdParam) {
        const prob = loadTsumegoProblems().find((p) => p.id === tsumegoIdParam);
        if (prob) {
          setIsManagementModalOpen(false);
          enterPositionEditMode({
            startSfen: prob.startSfen,
            target: {
              category: 'tsumego',
              id: prob.id,
              title: prob.title ?? prob.id,
              moveLimit: prob.moveLimit,
            },
            force: true,
          });
          return;
        }
      }

      if (targetGameId) {
        const rec = getKifuRecord(targetGameId);
        if (rec) {
          const sfen = extractStartSfenFromJkfJson(rec.jkfJson) ?? HIRATE_SFEN;
          setIsManagementModalOpen(false);
          setActiveGameId(rec.id);
          enterPositionEditMode({
            startSfen: sfen,
            target: {
              category: resolveGameKind(rec) === 'joseki' ? 'joseki' : 'study',
              id: rec.id,
              title: rec.title,
            },
            force: true,
          });
          return;
        }
      }

      if (tacticIdParam) {
        const tactic = loadTacticsItems().find((item) => item.id === tacticIdParam);
        if (tactic) {
          const startSfen =
            tactic.sfen ||
            (tactic.jkfJson ? extractStartSfenFromJkfJson(tactic.jkfJson) : null) ||
            HIRATE_SFEN;
          setIsManagementModalOpen(false);
          enterPositionEditMode({
            startSfen,
            target: { category: 'joseki', id: tactic.id, title: tactic.title },
            force: true,
          });
          return;
        }
      }
    }

    if (isNew) {
      resetTransientOverlays();
      setPlayer(JKFPlayer.parseKIF(HIRATE_INITIAL_KIF));
      setKifText(HIRATE_INITIAL_KIF);
      setActiveGameId(null);
      setActiveGameTitle('');
      setActiveGameTags(['研究']);
      setCurrentPly(0);
      setSelectedSquare(null);
      setSelectedPieceFromHand(null);
      setPendingPromotion(null);
      setTraceFeedback(null);
      setEvalHistory(new Map());
      setLocalEvalHistory(new Map());
      setActiveMode('STUDY');
      bumpVersion();
      return;
    }

    if (isLibraryParam) {
      resetTransientOverlays();
      setIsManagementModalOpen(true);
      return;
    }

    if (isTreeParam) {
      resetTransientOverlays();
      navigate('/tree', { replace: true });
      return;
    }

    if (quizIdParam) {
      resetTransientOverlays();
      const allCards = loadQuizPool();
      const targetCard = allCards.find((c) => c.id === quizIdParam);
      if (targetCard) {
        const enabledCards = allCards.filter((c) => c.isEnabled);
        const nextPool = targetCard.isEnabled
          ? enabledCards
          : [targetCard, ...enabledCards];
        const targetIdx = Math.max(
          0,
          nextPool.findIndex((c) => c.id === targetCard.id)
        );
        pendingQuizDeepLinkIdRef.current =
          activeMode !== 'QUIZ' ? targetCard.id : null;
        setIsQuizShuffled(false);
        setQuizPool(nextPool);
        setActiveQuizIndex(targetIdx);
        loadQuizPosition(targetCard);
        setActiveMode('QUIZ');
      }
      return;
    }

    if (tsumegoIdParam) {
      resetTransientOverlays();
      setTsumegoList(loadTsumegoProblems());
      setSelectedTsumegoId(tsumegoIdParam);
      setActiveMode('TSUMEGO');
      return;
    }

    if (sfenParam) {
      resetTransientOverlays();
      const freshPlayer = createJkfPlayerFromSfen(sfenParam);
      setPlayer(freshPlayer);
      setActiveGameId(null);
      setActiveGameTitle('');
      setCurrentPly(0);
      setEvalHistory(new Map());
      setLocalEvalHistory(new Map());
      if (modeParam === 'match' || startFromCurrent) {
        setActiveMode('AI_MATCH');
        setMatchStartOrigin('resume');
      } else {
        setActiveMode('STUDY');
      }
      bumpVersion();
      return;
    }

    if (isResume) {
      if (!isInitialVisit && (player.getMaxTesuu() > 0 || activeGameId !== null)) {
        setIsManagementModalOpen(false);
        return;
      }
      const lastSession = loadLastStudioSession();
      if (lastSession) {
        resetTransientOverlays();
        if (lastSession.gameId) {
          const games = loadSavedStudioGames();
          const target = games.find((g) => g.id === lastSession.gameId);
          if (target) {
            void handleOpenGame(target, lastSession.currentPly || 0);
            if (lastSession.activeMode) {
              setActiveMode(lastSession.activeMode);
            }
            return;
          }
        }
        if (lastSession.currentPly > 0) {
          goToPly(lastSession.currentPly);
        }
        if (lastSession.activeMode) {
          setActiveMode(lastSession.activeMode);
        }
      }
      return;
    }

    if (targetGameId) {
      resetTransientOverlays();
      if (modeParam === 'trace') {
        setActiveMode('SHOGI_TRACE');
        setMobileActiveTab('practice');
      } else if (modeParam === 'match') {
        setActiveMode('AI_MATCH');
      } else {
        setActiveMode('STUDY');
      }
      const rawPly = params.get('ply');
      const targetPly = rawPly !== null ? Math.max(0, Number.parseInt(rawPly, 10) || 0) : 0;
      const rec = getKifuRecord(targetGameId);
      if (rec) {
        void handleOpenGame(kifuRecordToStudioGame(rec), targetPly);
      } else {
        const games = loadSavedStudioGames();
        const target = games.find((g) => g.id === targetGameId);
        if (target) {
          void handleOpenGame(target, targetPly);
        }
      }
      if (modeParam === 'match' || startFromCurrent) {
        setMatchStartOrigin('resume');
      }
      return;
    }

    if (modeParam || isQuizFlag || isTsumegoFlag) {
      resetTransientOverlays();
      if (modeParam === 'match') {
        setActiveMode('AI_MATCH');
      } else if (modeParam === 'trace') {
        setActiveMode('SHOGI_TRACE');
        setMobileActiveTab('practice');
      } else if (modeParam === 'quiz' || isQuizFlag) {
        setActiveMode('QUIZ');
      } else if (modeParam === 'tsumego' || isTsumegoFlag) {
        setTsumegoList(loadTsumegoProblems());
        setActiveMode('TSUMEGO');
      } else {
        setActiveMode('STUDY');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRouteActive, location.key, location.search]);

  // Open import management modal when navigated with ?modal=import and clear query param
  useEffect(() => {
    if (!isRouteActive || searchParams.get('modal') !== 'import') return;
    setIsManagementModalOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('modal');
    setSearchParams(nextParams, { replace: true });
  }, [isRouteActive, searchParams, setSearchParams]);

  // Get readable kifu steps with fork variation info
  const kifuSteps = useMemo(() => {
    try {
      return player.getReadableKifuState();
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, version]);

  const handleCreateQuizFromCurrentPosition = () => {
    const curSfen = player.shogi.toSFENString();
    const sideToMove = player.shogi.turn === 1 ? 'w' : 'b';
    const curEval =
      evalHistory.get(currentPly) ??
      localEvalHistory.get(currentPly) ??
      (engine.candidatesSfen === curSfen ? engine.evaluation : null);
    const initialBest = curEval?.bestMove ?? curEval?.pv?.[0] ?? '';
    const initialPv =
      curEval?.pv && curEval.pv.length > 0
        ? curEval.pv.slice(0, 6)
        : initialBest
          ? [initialBest]
          : [];
    const solverScoreCp = curEval
      ? sideToMove === 'w'
        ? -curEval.scoreCp
        : curEval.scoreCp
      : 0;
    const baseTitle = activeGameTitle || player.kifu.header['棋戦'] || '';
    const defaultQuizTitle = baseTitle
      ? currentPly > 0
        ? `${baseTitle} (${t('quiz.card.ply', { ply: currentPly })})`
        : baseTitle
      : '';

    const newCard: TacticalQuizCard = {
      id: `manual_quiz_${Date.now()}`,
      title: defaultQuizTitle || undefined,
      source: 'manual',
      sourceGameId: activeGameId || 'manual',
      openingId: 'custom',
      type: 'attack',
      ply: currentPly,
      startSfen: curSfen,
      usiMovesToPosition: [],
      sideToMove,
      bestMove: initialBest,
      pv: initialPv,
      scoreCpBefore: solverScoreCp,
      isEnabled: true,
      createdAt: new Date().toISOString(),
    };

    engine.stop();
    setIsStudioMenuOpen(false);
    setQuizEditReturnTarget('studio');
    setEditingQuizCard(newCard);
  };

  if (editingQuizCard !== null) {
    return (
      <QuizStudioEditView
        card={editingQuizCard}
        onSaved={() => {
          setEditingQuizCard(null);
          setQuizPool(loadQuizPool().filter((c) => c.isEnabled));
          if (quizEditReturnTarget === 'library') {
            navigate('/library?tab=quiz');
          } else {
            setPositionSaveToast(t('quiz_editor.saved_toast'));
            window.setTimeout(() => setPositionSaveToast(null), 2500);
          }
        }}
        onCancel={() => {
          setEditingQuizCard(null);
          if (quizEditReturnTarget === 'library') {
            navigate('/library?tab=quiz');
          }
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen pb-14 md:pb-0 bg-slate-950 text-slate-100 overflow-hidden font-sans relative">
      {/* Toast Notification for Suspended Game */}
      {suspendToast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs shadow-2xl border border-amber-300 animate-bounce flex items-center gap-2">
          <span>⏸️</span>
          <span>{t('studio.match.suspend_toast')}</span>
        </div>
      )}

      {/* Toast Notification for Position Save */}
      {positionSaveToast && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-2xl border border-emerald-400 flex items-center gap-2">
          <span>✓</span>
          <span>{positionSaveToast}</span>
        </div>
      )}

      {/* Position Edit Mode Top Banner (Complete visual separation from normal mode) */}
      {isPositionEditMode ? (
        <div className="flex items-center justify-between px-3 sm:px-5 py-2 bg-amber-500 text-slate-950 border-b border-amber-400 shrink-0 z-30 shadow-md">
          <div className="flex items-center gap-2 font-extrabold text-xs sm:text-sm">
            <span>🛠️</span>
            <span>{t('position_editor.banner_title')}</span>
            {editPreviewState !== null && (
              <button
                type="button"
                onClick={() => setEditPreviewState(null)}
                className="px-2.5 py-0.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-emerald-300 text-[11px] font-bold border border-emerald-400/50 transition"
              >
                👁️ {t('position_editor.preview_banner_badge', { step: editPreviewState.stepIndex })}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs font-bold">
            <button
              type="button"
              onClick={commitAndExitPositionEditMode}
              className="px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-300 shadow transition"
            >
              {t('position_editor.exit_and_return')}
            </button>
            <button
              type="button"
              onClick={cancelPositionEditMode}
              className="px-3 py-1 rounded-lg bg-amber-950/20 hover:bg-amber-950/35 text-slate-950 border border-slate-950/25 transition"
            >
              {t('position_editor.cancel_discard')}
            </button>
          </div>
        </div>
      ) : !isZenMode ? (
        <header className="flex items-center justify-between px-2 sm:px-4 py-2 bg-slate-900 border-b border-amber-950/40 shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-3">
            <Link
              to="/"
              className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition shrink-0"
              title={t('common.home')}
            >
              ← <span className="hidden sm:inline">{t('common.home')}</span>
            </Link>
            <span className="text-lg sm:text-xl">🌳</span>
            <h1 className="text-sm sm:text-base font-bold bg-gradient-to-r from-amber-200 to-amber-500 bg-clip-text text-transparent truncate max-w-[120px] sm:max-w-none shrink-0">
              {t('studio.title')}
            </h1>
            {(() => {
              const displayHeaderTitle =
                activeGameTitle || player.kifu.header['戦型'] || t('studio.free_study');
              return (
                <span
                  className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 truncate max-w-[140px] sm:max-w-[240px] md:max-w-[360px]"
                  title={displayHeaderTitle}
                >
                  {displayHeaderTitle}
                </span>
              );
            })()}

            {/* Quick Tagging Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsTagPopoverOpen((prev) => !prev)}
                className="px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-750 text-amber-300 border border-slate-700 text-xs font-medium flex items-center gap-1 transition"
                title={t('studio.kifu_mgmt.tag_edit_title', 'タグを編集')}
              >
                <span>🏷️</span>
                <span className="max-w-[120px] truncate hidden sm:inline">
                  {activeGameTags.length > 0 ? activeGameTags.map((t) => `#${t}`).join(' ') : '#タグ追加'}
                </span>
                <span className="text-[10px] text-slate-400">▼</span>
              </button>

              {isTagPopoverOpen && (
                <div className="absolute left-0 top-full mt-1.5 z-50 w-[92vw] max-w-xl sm:w-[540px] bg-slate-900/95 border border-slate-700 rounded-xl shadow-2xl p-3.5 space-y-2.5 backdrop-blur-md">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 text-xs">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <span>🏷️</span>
                      <span>{t('studio.kifu_mgmt.select_save_tags', '保存タグの選択:')}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsTagPopoverOpen(false)}
                      className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 text-xs transition"
                    >
                      ✕
                    </button>
                  </div>
                  <CategorizedTagCombobox
                    tagGroups={tagGroups}
                    selectedTags={activeGameTags}
                    onChange={(nextTags) => {
                      setActiveGameTags(nextTags);
                      if (activeGameId) {
                        updateStudioGameTags(activeGameId, nextTags);
                      }
                    }}
                    onAddCustomTag={(cat, tag) => {
                      const updated = addCustomTagToCategory(cat, tag);
                      setTagGroups(updated);
                    }}
                    placeholder={t('studio.kifu_mgmt.tag_combobox_placeholder', '保存タグを選択または新規追加...')}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {(() => {
              const currentViewTierLabel =
                studioViewTier === 1
                  ? t('studio.view_tier.tier1', '1. 盤面')
                  : studioViewTier === 2
                    ? t('studio.view_tier.tier2', '2. AI分析')
                    : t('studio.view_tier.tier3', '3. 研究');
              const isTacticClipActive =
                isTacticClipBarOpen ||
                tacticRangeStart !== null ||
                tacticRangeEnd !== null;

              const quickMenuCategories: StudioMenuCategory[] = [
                {
                  id: 'kifu',
                  icon: '🗂️',
                  label: t('studio_menu.cat_kifu'),
                  actions: [
                    {
                      id: 'import',
                      icon: '📥',
                      label: t('library_page.import_kifu_btn'),
                      tooltip: t('library_page.import_kifu_btn'),
                      onClick: () => setIsManagementModalOpen(true),
                    },
                    {
                      id: 'library',
                      icon: '📚',
                      label: t('studio.manage_kifu_btn'),
                      tooltip: t('library_page.open_page_btn'),
                      onClick: () => navigate('/library'),
                    },
                    {
                      id: 'save_kifu',
                      icon: '💾',
                      label: isKifuSavedFeedback
                        ? t('studio.view_tier.save_kifu_done')
                        : t('studio.view_tier.save_kifu_btn'),
                      tooltip: t('studio.view_tier.save_kifu_btn'),
                      onClick: () => setIsSaveKifuModalOpen(true),
                    },
                    {
                      id: 'tactics',
                      icon: '📁',
                      label: t('studio.header.tactics_library'),
                      tooltip: t('studio.header.tactics_library_tooltip'),
                      onClick: () => setIsTacticsLibraryOpen(true),
                    },
                    {
                      id: 'tactic_clip',
                      icon: '✂️',
                      label: t('studio_menu.action_tactic_clip'),
                      tooltip: t('studio_menu.action_tactic_clip'),
                      active: isTacticClipActive,
                      disabled: activeMode !== 'STUDY' || isPositionEditMode,
                      onClick: () => {
                        if (isTacticClipActive) {
                          setIsTacticClipBarOpen(false);
                          setTacticRangeStart(null);
                          setTacticRangeEnd(null);
                        } else {
                          setIsTacticClipBarOpen(true);
                        }
                      },
                    },
                  ],
                },
                {
                  id: 'board',
                  icon: '♟️',
                  label: t('studio_menu.cat_board'),
                  actions: [
                    {
                      id: 'flip',
                      icon: '🔄',
                      label: t('studio.flip_board'),
                      tooltip: t('studio.flip_board'),
                      active: isFlipped,
                      onClick: () => setIsFlipped((prev) => !prev),
                    },
                    {
                      id: 'split',
                      icon: '🪟',
                      label: t('studio.header.split_ref'),
                      tooltip: t('studio.split_ref.title'),
                      active: isSplitRefOpen,
                      onClick: () => setIsSplitRefOpen((prev) => !prev),
                    },
                    {
                      id: 'view_tier',
                      icon: '👁️',
                      label: t('studio_menu.action_view_tier', {
                        mode: currentViewTierLabel,
                      }),
                      tooltip: t('studio_menu.action_view_tier', {
                        mode: currentViewTierLabel,
                      }),
                      active: studioViewTier !== 3,
                      keepOpenOnClick: true,
                      disabled: activeMode !== 'STUDY' || isPositionEditMode,
                      onClick: () =>
                        setStudioViewTier((prev) => (prev === 1 ? 2 : prev === 2 ? 3 : 1)),
                    },
                    {
                      id: 'edit_pos',
                      icon: '🛠️',
                      label: t('position_editor.edit_from_current'),
                      disabled: isMatchActive || activeMode === 'AI_MATCH',
                      onClick: () => {
                        const rec = activeGameId ? getKifuRecord(activeGameId) : null;
                        if (rec && !rec.deletedAt && isCustomPositionRecord(rec)) {
                          enterPositionEditMode({
                            target: { category: 'study', id: rec.id, title: rec.title },
                          });
                        } else {
                          enterPositionEditMode();
                        }
                      },
                    },
                    {
                      id: 'create_quiz_from_pos',
                      icon: '🎯',
                      label: t('studio_menu.create_quiz_from_pos'),
                      tooltip: t('studio_menu.create_quiz_from_pos_desc'),
                      disabled: isMatchActive || activeMode === 'AI_MATCH',
                      onClick: handleCreateQuizFromCurrentPosition,
                    },
                  ],
                },
                {
                  id: 'export',
                  icon: '📤',
                  label: t('studio_menu.cat_export'),
                  actions: [
                    {
                      id: 'export_png',
                      icon: '🖼️',
                      label: t('board_export.download_png'),
                      onClick: () => {
                        const svg = buildStudioExportSvg();
                        void downloadPngFromSvg(svg, `shogi-ply-${currentPly}.png`);
                      },
                    },
                    {
                      id: 'export_svg',
                      icon: '📐',
                      label: t('board_export.download_svg'),
                      onClick: () => {
                        const svg = buildStudioExportSvg();
                        downloadSvgString(svg, `shogi-ply-${currentPly}.svg`);
                      },
                    },
                    {
                      id: 'copy_png',
                      icon: copiedActionId === 'copy_png' ? '✅' : '📋',
                      label: t('board_export.copy_png'),
                      onClick: () => {
                        const svg = buildStudioExportSvg();
                        void copyPngFromSvgToClipboard(svg).then((ok) =>
                          showCopyFeedback(ok, 'copy_png')
                        );
                      },
                    },
                    {
                      id: 'copy_kif_all',
                      icon: copiedActionId === 'copy_kif_all' ? '✅' : '📄',
                      label: t('board_export.copy_kif_all'),
                      disabled: totalPlies === 0,
                      onClick: () => {
                        const kif = buildCurrentBranchKifText(totalPlies);
                        void copyKifToClipboard(kif).then((ok) =>
                          showCopyFeedback(ok, 'copy_kif_all')
                        );
                      },
                    },
                    {
                      id: 'copy_kif_ply',
                      icon: copiedActionId === 'copy_kif_ply' ? '✅' : '✂️',
                      label: t('board_export.copy_kif_to_ply', { ply: currentPly }),
                      disabled: currentPly === 0,
                      onClick: () => {
                        const kif = buildCurrentBranchKifText(currentPly);
                        void copyKifToClipboard(kif).then((ok) =>
                          showCopyFeedback(ok, 'copy_kif_ply')
                        );
                      },
                    },
                  ],
                },
                {
                  id: 'nav',
                  icon: '🧭',
                  label: t('studio_menu.cat_nav'),
                  actions: [
                    {
                      id: 'tree',
                      icon: '🌳',
                      label: t('studio.header.view_tree'),
                      tooltip: t('studio.header.view_tree_tooltip'),
                      onClick: () => navigate('/tree'),
                    },
                    {
                      id: 'players',
                      icon: '🏯',
                      label: t('players_page.nav_label'),
                      onClick: () => navigate('/players'),
                    },
                    {
                      id: 'rulebook',
                      icon: '📖',
                      label: t('studio.header.rulebook'),
                      tooltip: t('studio.header.rulebook_tooltip'),
                      onClick: () => navigate('/rulebook'),
                    },
                    {
                      id: 'guide',
                      icon: '📘',
                      label: t('studio.header.guide'),
                      tooltip: t('studio.header.guide_tooltip'),
                      onClick: () => navigate('/guide'),
                    },
                  ],
                },
              ];

              return (
                <StudioQuickAccessMenu
                  categories={quickMenuCategories}
                  pins={studioQuickPins}
                  onTogglePin={handleToggleQuickPin}
                  onResetPins={handleResetQuickPins}
                  isOpen={isStudioMenuOpen}
                  onOpenChange={setIsStudioMenuOpen}
                />
              );
            })()}
            <button
              type="button"
              onClick={() => {
                const isTrainingMode =
                  activeMode === 'AI_MATCH' ||
                  activeMode === 'QUIZ' ||
                  activeMode === 'TSUMEGO' ||
                  activeMode === 'SHOGI_TRACE';
                navigate(isTrainingMode ? '/guide/training' : '/guide/study');
              }}
              className="flex px-2 sm:px-2.5 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold transition"
              title={t('guide.title')}
              aria-label={t('guide.title')}
            >
              ❓
            </button>
            <button
              type="button"
              onClick={openSettings}
              className="hidden md:flex px-2 sm:px-2.5 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold transition"
              title={t('settings.title')}
            >
              ⚙️
            </button>
          </div>
        </header>
      ) : null}

      {/* Studio Mobile View Tabs (Compact bar under header; global MobileBottomNav stays at bottom) */}
      {!isZenMode && (
        <div className="lg:hidden shrink-0 bg-slate-900/90 border-b border-slate-800 px-1.5 py-1 flex items-center justify-around gap-1 z-20 select-none">
          <button
            type="button"
            onClick={() => setMobileActiveTab('board')}
            className={`flex flex-1 items-center justify-center gap-1 py-1 px-1.5 rounded-md text-[11px] font-semibold transition whitespace-nowrap ${
              mobileActiveTab === 'board' && activeMode !== 'QUIZ'
                ? 'text-amber-300 bg-amber-500/15 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="leading-none">☗</span>
            <span>{t('studio.mobile.tab_board')}</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileActiveTab('tree')}
            className={`flex flex-1 items-center justify-center gap-1 py-1 px-1.5 rounded-md text-[11px] font-semibold transition whitespace-nowrap ${
              mobileActiveTab === 'tree'
                ? 'text-amber-300 bg-amber-500/15 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="leading-none">📜</span>
            <span>{t('studio.mobile.tab_kifu')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeMode !== 'STUDY' && activeMode !== 'RESIGN_MATE') {
                setActiveMode('STUDY');
              }
              setMobileActiveTab('action');
            }}
            className={`flex flex-1 items-center justify-center gap-1 py-1 px-1.5 rounded-md text-[11px] font-semibold transition whitespace-nowrap ${
              mobileActiveTab === 'action'
                ? 'text-amber-300 bg-amber-500/15 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="leading-none">📊</span>
            <span>{t('studio.mobile.tab_analysis')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const defaultTrainingMode = settings.mobileTrainingDefaultMode ?? 'menu';
              if (defaultTrainingMode === 'menu') {
                setIsTrainingMenuOpen(true);
                setMobileActiveTab('practice');
              } else {
                setIsTrainingMenuOpen(false);
                setActiveMode(defaultTrainingMode);
                setMobileActiveTab(defaultTrainingMode === 'QUIZ' ? 'board' : 'practice');
              }
            }}
            className={`flex flex-1 items-center justify-center gap-1 py-1 px-1.5 rounded-md text-[11px] font-semibold transition relative whitespace-nowrap ${
              mobileActiveTab === 'practice'
                ? 'text-amber-300 bg-amber-500/15 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="leading-none">🔥</span>
            <span>{t('studio.mobile.tab_training')}</span>
            {quizPoolCount > 0 && (
              <span className="px-1 py-0.2 rounded-full text-[9px] leading-tight bg-amber-500 text-slate-950 font-mono font-bold">
                {quizPoolCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setMobileActiveTab('fulltree')}
            className={`hidden md:flex flex-1 items-center justify-center gap-1 py-1 px-1.5 rounded-md text-[11px] font-semibold transition whitespace-nowrap ${
              mobileActiveTab === 'fulltree'
                ? 'text-amber-300 bg-amber-500/15 border border-amber-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="leading-none">🌳</span>
            <span>{t('studio.mobile.tab_tree')}</span>
          </button>
        </div>
      )}

      {/* Recover Draft Notification Banner */}
      {detectedDraft && !isMatchActive && !isPositionEditMode && (
        <div className="bg-amber-950/80 border-b border-amber-500/50 px-4 py-2 flex items-center justify-between gap-3 text-xs z-20 shrink-0">
          <div className="flex items-center gap-2 text-amber-200 font-medium truncate">
            <span>💾</span>
            <span className="truncate">
              {t('studio.draft_banner.message', {
                title: detectedDraft.title || t('studio.free_study', '研究譜'),
                totalPlies: detectedDraft.totalPlies,
              })}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition text-xs shadow"
            >
              {t('studio.draft_banner.restore_btn', '下書きを復元')}
            </button>
            <button
              type="button"
              onClick={handleDismissDraft}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-400 hover:text-slate-200 transition text-xs"
            >
              {t('studio.draft_banner.dismiss_btn', '破棄')}
            </button>
          </div>
        </div>
      )}

      {/* Main Studio Body: Responsive Multi-Device 3-Pane Layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {/* Split-Screen Reference Workspace (#144) */}
        {!isZenMode && !isPositionEditMode && isSplitRefOpen && (
          <SplitStudyReferencePane
            onClose={() => setIsSplitRefOpen(false)}
            currentSfen={player.shogi.toSFENString()}
            onPlayUsiMove={handlePlayRecommendedMove}
          />
        )}

        {/* Left Pane: Tree & Move List (280px on desktop, full overlay on mobile when tree tab active) */}
        {!isZenMode && (
          <aside
            className={`w-full lg:w-[280px] bg-slate-900/90 lg:bg-slate-900/70 border-r border-slate-800 flex flex-col shrink-0 transition-opacity ${
              mobileActiveTab === 'tree' ? 'flex flex-1 z-20' : 'hidden lg:flex'
            } ${isPositionEditMode ? 'opacity-40 pointer-events-none select-none' : ''}`}
          >
          <div className="p-2.5 border-b border-slate-800 font-bold text-xs text-amber-300/90 flex justify-between items-center gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="truncate">
                {isMatchActive ? '⚔️ ' + t('studio.match.title') : t('studio.kifu_tree')}
              </span>
              {!isMatchActive && (
                player.forkPointers && player.forkPointers.length > 0 ? (
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 whitespace-nowrap shrink-0">
                    {t('studio.tree.variation')} ({t('studio.tree.depth', { depth: player.forkPointers.length })})
                  </span>
                ) : (
                  <>
                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 whitespace-nowrap shrink-0">
                      {t('studio.tree.main_trunk')}
                    </span>
                    {activeProtectedMatchInfo.isProtected && (
                      <span
                        className="px-1.5 py-0.5 text-[10px] rounded bg-sky-500/15 text-sky-300 border border-sky-500/40 whitespace-nowrap shrink-0 flex items-center gap-0.5"
                        title={t('studio.tree.mainline_protected_tooltip')}
                      >
                        <span>🛡️</span>
                        <span>{t('studio.tree.mainline_protected_badge')}</span>
                      </span>
                    )}
                  </>
                )
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {!isMatchActive && totalPlies > 0 && (
                <button
                  type="button"
                  onClick={() => setIsTreeEditMode((prev) => !prev)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition flex items-center justify-center whitespace-nowrap shrink-0 ${
                    isTreeEditMode
                      ? 'bg-rose-950/80 text-rose-300 border-rose-500/70 shadow-sm animate-pulse'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-700 hover:bg-slate-750'
                  }`}
                  aria-label={isTreeEditMode ? t('studio.tree.edit_mode_active', '手順編集・削除モードを終了') : t('studio.tree.edit_mode_toggle', '手順編集・削除モード（不要な手や分岐を削除）')}
                  title={isTreeEditMode ? t('studio.tree.edit_mode_active', '手順編集・削除モードを終了') : t('studio.tree.edit_mode_toggle', '手順編集・削除モード（不要な手や分岐を削除）')}
                >
                  <span>{isTreeEditMode ? '🛑' : '✂️'}</span>
                </button>
              )}
              <span className="font-mono text-slate-400 text-[11px] whitespace-nowrap shrink-0">
                {`${currentPly}/${totalPlies}`}
              </span>
            </div>
          </div>

          {/* If Match is active, hide future study moves to avoid spoiler, show only match history */}
          {isMatchActive ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="p-2.5 bg-amber-950/20 border-b border-amber-900/30 text-[11px] text-amber-300/80">
                <span>🔒 {t('studio.match.tree_hidden_during_match')}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-xs">
                <div className="text-[11px] text-slate-400 font-bold px-1 mb-1">
                  {t('studio.match.match_moves_record', { count: matchMovesList.length })}
                </div>
                {matchMovesList.map((m, idx) => (
                  <div
                    key={`match-move-${idx}`}
                    className="px-2 py-1 rounded bg-slate-800/60 border border-slate-700/50 flex items-center justify-between text-slate-200"
                  >
                    <span className="text-slate-400 text-[11px]">{m.ply}{t('studio.position_summary.last_move', { move: '' }).includes('手') ? '手目:' : ' ply:'}</span>
                    <span className="font-bold text-amber-300">{m.moveText}</span>
                  </div>
                ))}
                {matchMovesList.length === 0 && (
                  <div className="text-center py-6 text-slate-500 italic text-[11px]">
                    {t('studio.match.no_moves_recorded', '着手するとここに対局譜が記録されます')}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Breadcrumb if inside variation */}
              {player.forkPointers && player.forkPointers.length > 0 && (
                <div className="px-3 py-1.5 bg-amber-950/30 border-b border-amber-900/40 flex items-center justify-between text-[11px]">
                  <span className="text-amber-300/80 truncate">
                    {t('studio.tree.current_branch')}:
                    {player.forkPointers.map((fp) => ` ${fp.te}手目`).join(' ➔ ')}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      goToPly(currentPly, []);
                      if (activeGameId) {
                        const games = loadSavedStudioGames();
                        const target = games.find((g) => g.id === activeGameId);
                        if (target) {
                          target.activeForkPointers = [];
                          saveStudioGame(target);
                        }
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 border border-amber-500/40 text-[10px] transition shrink-0 ml-1"
                    title={t('studio.tree.return_to_main')}
                  >
                    ↩ {t('studio.tree.return_to_main')}
                  </button>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-mono text-xs">
                {(activeMode === 'SHOGI_TRACE' || activeMode === 'QUIZ') && (
                  <div className="p-2 mb-1.5 rounded bg-amber-950/30 border border-amber-900/40 text-[11px] text-amber-300/90">
                    🔒 {t('studio.trace.hidden_ahead', '特訓中は先の手順を非表示にしています')}
                  </div>
                )}
                {kifuSteps.slice(1).map((step, idx) => {
                  const ply = idx + 1;
                  if ((activeMode === 'SHOGI_TRACE' || activeMode === 'QUIZ') && ply > currentPly) {
                    return null;
                  }
                  const isSelected = ply === currentPly;
                  const isForkOrigin = player.forkPointers && player.forkPointers.some((fp) => fp.te === ply);

                  return (
                    <div key={`ply-${ply}`} className="space-y-1">
                      <button
                        ref={isSelected ? activePlyRef : undefined}
                        type="button"
                        onClick={() => goToPly(ply)}
                        className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-amber-500/20 text-amber-300 font-bold border-l-2 border-amber-400'
                            : isForkOrigin
                            ? 'bg-indigo-950/40 text-indigo-300 border-l-2 border-indigo-400'
                            : 'hover:bg-slate-800/60 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-slate-500 text-[11px] w-5 text-right">{ply}.</span>
                          <span className="truncate">{step.kifu}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-1">
                          {step.forks && step.forks.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30" title={t('studio.tree.branch_count', { count: step.forks.length })}>
                              +{step.forks.length}
                            </span>
                          )}
                          {step.comments && step.comments.length > 0 && (
                            <span className="text-[10px] text-slate-400" title={step.comments.join('\n')}>💬</span>
                          )}
                        </div>
                      </button>

                      {/* Fork Variation Buttons */}
                      {step.forks && step.forks.length > 0 && isSelected && (
                        <div className="ml-3 pl-2 pr-1 py-1.5 space-y-1 bg-slate-950/70 rounded-r border-l-2 border-amber-500 text-[11px]">
                          <div className="text-[10px] text-amber-400/90 font-semibold flex items-center justify-between">
                            <span>{t('studio.tree.fork_at', { ply })}</span>
                          </div>
                          {step.forks.map((forkMoveStr, forkIdx) => (
                            <div
                              key={`fork-${ply}-${forkIdx}`}
                              className="flex items-center gap-1 group"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  // forkAndForward forks the NEXT move (this.tesuu + 1), so go to ply - 1 first
                                  player.goto(ply - 1);
                                  player.forkAndForward(forkIdx);
                                  setCurrentPly(player.tesuu);

                                  // Persist active fork pointers to game record
                                  if (activeGameId) {
                                    const games = loadSavedStudioGames();
                                    const target = games.find((g) => g.id === activeGameId);
                                    if (target) {
                                      target.activeForkPointers = player.forkPointers ? [...player.forkPointers] : [];
                                      saveStudioGame(target);
                                    }
                                  }

                                  bumpVersion();
                                }}
                                className="flex-1 text-left px-2 py-1 rounded bg-slate-800 hover:bg-amber-600/30 text-slate-300 hover:text-amber-200 transition flex items-center justify-between"
                              >
                                <span className="font-semibold">↳ {forkMoveStr}</span>
                                <span className="text-[10px] text-slate-500 group-hover:text-amber-400">{t('studio.tree.select_fork', '選択 ➔')}</span>
                              </button>
                              {isTreeEditMode && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteFork(ply, forkIdx, forkMoveStr);
                                  }}
                                  className="px-1.5 py-1 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-300 hover:text-white text-[10px] transition"
                                  title={t('studio.tree.delete_fork')}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Prune subsequent moves action button when selected, has future moves, AND edit mode is active */}
                      {isSelected && ply < totalPlies && !isMatchActive && isTreeEditMode && (
                        <div className="ml-3 pl-2 py-0.5">
                          <button
                            type="button"
                            onClick={() => handlePruneSubsequentMoves(ply)}
                            className="px-2 py-0.5 rounded bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/80 hover:border-rose-600 text-rose-200 text-[10px] font-medium transition flex items-center gap-1 shadow-sm"
                            title={t('studio.tree.prune_subsequent')}
                          >
                            <span>✂️</span>
                            <span>{t('studio.tree.prune_subsequent')}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </aside>
        )}

        {/* Center Pane: Studio Board View */}
        <main
          onClick={handleEditMarginClick}
          className={`flex-1 min-h-0 flex flex-col items-center overflow-y-auto lg:overflow-hidden bg-slate-950/90 relative ${
            mobileActiveTab === 'board' ? 'flex' : 'hidden lg:flex'
          } ${
            isZenMode
              ? 'p-0 w-full h-full justify-center'
              : isCompactLayout
                ? 'px-0.5 py-0.5 md:p-1.5 justify-start lg:justify-between'
                : 'px-0.5 py-0.5 md:p-3 justify-start lg:justify-between'
          }`}
        >
          {isZenMode && (
            <button
              type="button"
              onClick={() => setIsZenMode(false)}
              className="lg:hidden absolute top-2 right-2 z-30 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold shadow-lg"
              title={t('studio.match.zen_mode_exit')}
            >
              ✕ {t('studio.match.zen_mode_exit')}
            </button>
          )}
          {activeMode === 'TSUMEGO' && !isPositionEditMode && activeTsumego ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-2 sm:p-4">
              <TsumegoSolvePanel
                problem={activeTsumego}
                isMasked={isTsumegoMasked}
                onNextProblem={
                  filteredTsumegoList.length > 0 ? handleSelectNextTsumego : undefined
                }
              />
            </div>
          ) : activeMode === 'TSUMEGO' ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
              <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl space-y-4">
                <div className="text-3xl">🧩</div>
                <h3 className="text-base font-bold text-slate-100">詰将棋問題がまだありません</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  SFEN形式（やねうら王 3〜11手詰データ等・最大50問をランダム抽出）または KIF形式の問題ファイルを読み込めます。
                </p>
                <label className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer transition-colors">
                  <span>📂 SFEN / KIF 問題集をインポート</span>
                  <input
                    type="file"
                    accept=".sfen,.txt,.kif,.kifu"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      void handleImportTsumegoFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
          ) : (
            <>
          {/* Main Content Area: Board + Side Clock Layout */}
          <div
            onClick={handleEditMarginClick}
            className={`flex items-center justify-center w-full ${
              isZenMode ? 'h-full gap-4 sm:gap-8 px-4 py-2' : 'h-full lg:h-full gap-3 sm:gap-6 max-w-[760px]'
            }`}
          >
            {/* Shogi Board Area: In Zen mode, scale up dynamically to fill viewport height/width */}
            <div
              onClick={handleEditMarginClick}
              className={`flex flex-col items-center ${isCompactLayout ? 'gap-0.5' : 'gap-1 sm:gap-1.5'} ${
                isZenMode
                  ? 'h-[96vh] w-[min(calc(100vw-160px),86vh)] max-w-[min(calc(100vw-160px),86vh)] justify-between'
                  : 'w-full md:max-w-[540px] h-full justify-start lg:justify-between'
              }`}
            >
              {/* Compact On-Demand Tactic Clipping Bar (Hidden unless activated) */}
              {!isZenMode &&
                !isPositionEditMode &&
                activeMode === 'STUDY' &&
                (isTacticClipBarOpen ||
                  tacticRangeStart !== null ||
                  tacticRangeEnd !== null) && (
                  <div className="flex w-full flex-wrap items-center justify-between gap-1.5 px-2 py-1 bg-slate-900/90 border border-amber-500/40 rounded-xl mb-1">
                    <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1">
                      <span>✂️</span>
                      <span>{t('studio_menu.tactic_clip_bar_label')}</span>
                    </span>
                    <div className="flex items-center gap-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          setTacticRangeStart(currentPly);
                          if (tacticRangeEnd !== null && tacticRangeEnd < currentPly) {
                            setTacticRangeEnd(null);
                          }
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                          tacticRangeStart === currentPly
                            ? 'bg-amber-500 text-slate-950 ring-1 ring-amber-300'
                            : 'bg-slate-800 text-slate-300 hover:text-amber-300'
                        }`}
                        title={t('studio.view_tier.range_start_tooltip', {
                          defaultValue: `現在の手数(${currentPly}手目)を定跡開始地点に設定`,
                          ply: currentPly,
                        })}
                      >
                        {tacticRangeStart !== null
                          ? t('studio.view_tier.range_start_set', {
                              defaultValue: `始:${tacticRangeStart}`,
                              ply: tacticRangeStart,
                            })
                          : t('studio.view_tier.range_start', '定跡開始')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTacticRangeEnd(currentPly);
                          if (tacticRangeStart !== null && tacticRangeStart > currentPly) {
                            setTacticRangeStart(null);
                          }
                        }}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition ${
                          tacticRangeEnd === currentPly
                            ? 'bg-amber-500 text-slate-950 ring-1 ring-amber-300'
                            : 'bg-slate-800 text-slate-300 hover:text-amber-300'
                        }`}
                        title={t('studio.view_tier.range_end_tooltip', {
                          defaultValue: `現在の手数(${currentPly}手目)を定跡終了地点に設定`,
                          ply: currentPly,
                        })}
                      >
                        {tacticRangeEnd !== null
                          ? t('studio.view_tier.range_end_set', {
                              defaultValue: `終:${tacticRangeEnd}`,
                              ply: tacticRangeEnd,
                            })
                          : t('studio.view_tier.range_end', '定跡終了')}
                      </button>
                      {(tacticRangeStart !== null || tacticRangeEnd !== null) && (
                        <button
                          type="button"
                          onClick={() => {
                            setTacticRangeStart(null);
                            setTacticRangeEnd(null);
                          }}
                          className="px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-slate-200"
                          title={t('studio.view_tier.range_reset', '範囲リセット')}
                        >
                          ↺
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsSaveTacticModalOpen(true)}
                        className="px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1 transition"
                      >
                        <span>✂️</span>
                        <span>{t('studio.view_tier.save_tactic_btn', '定跡保存')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsTacticClipBarOpen(false);
                          setTacticRangeStart(null);
                          setTacticRangeEnd(null);
                        }}
                        className="px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                        title={t('studio_menu.tactic_clip_close')}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

              {/* Tier 2 & 3: Inline Broadcast Level AI Evaluation Bar (Hidden during Position Edit Mode) */}
              {!isZenMode && !isPositionEditMode && activeMode === 'STUDY' && (settings.showEvalBar ?? true) && (studioViewTier === 2 || studioViewTier === 3) && (() => {
                const curEval =
                  evalSourceView === 'local'
                    ? (localEvalHistory.get(currentPly) ??
                        (engine.candidatesSfen === currentSfen ? engine.evaluation : null))
                    : (evalHistory.get(currentPly) ??
                        localEvalHistory.get(currentPly) ??
                        (engine.candidatesSfen === currentSfen ? engine.evaluation : null));
                const score =
                  curEval?.scoreCp ??
                  (engine.candidatesSfen === currentSfen ? engine.currentInfo?.scoreCp : undefined) ??
                  0;
                const isMate = curEval?.isMate ?? false;
                const clamped = Math.max(-2000, Math.min(2000, score));
                const senteWinPct = Math.round(50 + (clamped / 2000) * 50);
                const bestMoveUsi =
                  curEval?.bestMove ??
                  (engine.candidatesSfen === currentSfen ? engine.currentInfo?.bestMove : undefined);
                const bestMoveJp = bestMoveUsi ? formatUsiToJapanese(bestMoveUsi, player.shogi.turn, player.shogi) : null;
                const rawPv =
                  curEval?.pv ??
                  (engine.candidatesSfen === currentSfen && engine.currentInfo?.pv
                    ? Array.isArray(engine.currentInfo.pv)
                      ? engine.currentInfo.pv
                      : [engine.currentInfo.pv]
                    : []);

                return (
                  <>
                    {/* Mobile Compact 1-Line AI Strip (Quick Analyze & Tappable Recommended Move) */}
                    <div className="flex md:hidden w-full items-center justify-between gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] shrink-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-slate-200 font-mono font-semibold whitespace-nowrap">
                          {isMate
                            ? t('studio.view_tier.eval_mate', '詰み')
                            : `${score > 0 ? '+' : ''}${score} cp`}
                        </span>
                        <div className="w-10 h-1.5 bg-slate-800 rounded-full overflow-hidden flex shrink-0">
                          <div
                            className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-300"
                            style={{ width: `${senteWinPct}%` }}
                          />
                          <div
                            className="h-full bg-gradient-to-r from-sky-400 to-sky-600 transition-all duration-300"
                            style={{ width: `${100 - senteWinPct}%` }}
                          />
                        </div>
                      </div>

                      {bestMoveUsi && bestMoveUsi !== 'resign' && bestMoveJp && (
                        <button
                          type="button"
                          onClick={() => handlePlayRecommendedMove(bestMoveUsi)}
                          className="px-2 py-0.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 active:scale-95 border border-amber-500/40 text-amber-300 font-bold text-[11px] flex items-center gap-1 whitespace-nowrap transition truncate"
                          title={bestMoveJp}
                        >
                          <span>🤖</span>
                          <span>{bestMoveJp}</span>
                          <span className="text-[9px]">▶</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          engine.isSearching ? engine.stop() : handleAnalyzeCurrentPosition()
                        }
                        disabled={!engine.isReady && !engine.isSearching}
                        aria-label={
                          engine.isSearching ? t('engine.stop_btn') : t('engine.search_btn')
                        }
                        title={
                          engine.isSearching ? t('engine.stop_btn') : t('engine.search_btn')
                        }
                        className={`px-2 py-0.5 rounded-lg border text-xs font-semibold shrink-0 transition active:scale-95 disabled:opacity-40 ${
                          engine.isSearching
                            ? 'bg-rose-950/70 border-rose-500/50 text-rose-300 animate-pulse'
                            : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                        }`}
                      >
                        {engine.isSearching ? '⏹' : '🔍'}
                      </button>
                    </div>

                    {/* Desktop Broadcast Level AI Evaluation Card */}
                    <div className="hidden md:flex w-full bg-slate-900 border border-slate-800 rounded-xl p-2 flex-col gap-1.5 shadow-sm mb-1 text-xs">
                      <div className="flex items-center justify-between text-[11px] font-semibold">
                        <span className="text-amber-400">
                          {t('studio.view_tier.eval_sente', {
                            defaultValue: `▲ 先手 ${senteWinPct}%`,
                            pct: senteWinPct,
                          })}
                        </span>
                        <span className="text-slate-300 font-mono">
                          {isMate ? t('studio.view_tier.eval_mate', '詰み') : `${score > 0 ? '+' : ''}${score} cp`}
                        </span>
                        <span className="text-sky-400">
                          {t('studio.view_tier.eval_gote', {
                            defaultValue: `△ 後手 ${100 - senteWinPct}%`,
                            pct: 100 - senteWinPct,
                          })}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden flex">
                        <div
                          className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-300"
                          style={{ width: `${senteWinPct}%` }}
                        />
                        <div
                          className="h-full bg-gradient-to-r from-sky-400 to-sky-600 transition-all duration-300"
                          style={{ width: `${100 - senteWinPct}%` }}
                        />
                      </div>
                      {bestMoveJp && (
                        <div className="flex items-center justify-between text-[10px] text-slate-300 pt-0.5">
                          <span className="flex items-center gap-1">
                            <span>🤖 {t('studio.view_tier.ai_recommend', '推奨:')}</span>
                            <strong className="text-amber-400">{bestMoveJp}</strong>
                          </span>
                          {rawPv && rawPv.length > 0 && (
                            <span className="text-slate-400 truncate max-w-[200px]">
                              {t('studio.view_tier.ai_pv', '筋:')} {rawPv.slice(0, 3).map((mStr, i) => {
                                const s = (player.shogi.turn + i) % 2 === 0 ? 0 : 1;
                                return formatUsiToJapanese(mStr, s as 0 | 1, player.shogi);
                              }).join(' ')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}

              {/* Fixed 5-Button Position Editor Toolbar (Zero Layout Shift) */}
              {isPositionEditMode && (
                <div className="w-full flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/95 px-2 py-1.5 text-[11px] shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      applyEditedSfenInPlace(HIRATE_SFEN);
                      setEditSelection(null);
                    }}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold transition"
                  >
                    {t('position_editor.btn_hirate')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTsumegoSetupModal(true)}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-bold transition"
                  >
                    {t('position_editor.btn_tsumego')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const pos = parsePositionSfen(player.shogi.toSFENString());
                      applyEditedSfenInPlace(
                        serializePositionSfen({ ...pos, turn: pos.turn === 'b' ? 'w' : 'b' })
                      );
                    }}
                    className="px-2.5 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 font-bold transition"
                  >
                    {player.shogi.turn === 0
                      ? t('position_editor.btn_turn_sente')
                      : t('position_editor.btn_turn_gote')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      applyEditedSfenInPlace(ALL_TO_BOX_SFEN);
                      setEditSelection(null);
                    }}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold transition"
                  >
                    {t('position_editor.btn_all_to_box')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSavePositionModal(true)}
                    className="ml-auto px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow transition"
                  >
                    {t('position_editor.btn_save_library')}
                  </button>
                </div>
              )}

              {/* Top Komadai */}
              {(() => {
                const topColor: 0 | 1 = isFlipped ? 0 : 1;
                const canNormalSelect =
                  (!isMatchActive ||
                    (player.shogi.turn === 0 ? matchSentePlayer : matchGotePlayer) === 'human') &&
                  player.shogi.turn === topColor;
                return (
                  <StudioKomadaiView
                    color={topColor}
                    playerName={isFlipped ? senteName : goteName}
                    isTurn={displayShogi.turn === topColor}
                    hands={isFlipped ? displaySenteHands : displayGoteHands}
                    selectable={isPositionEditMode ? true : canNormalSelect}
                    selectedPiece={
                      isPositionEditMode
                        ? editPreviewState === null &&
                          editSelection?.source === 'hand' &&
                          editSelection.color === topColor
                          ? SFEN_BASE_TO_KIND[editSelection.base]
                          : null
                        : player.shogi.turn === topColor
                          ? selectedPieceFromHand
                          : null
                    }
                    timeRemaining={
                      !isPositionEditMode && isMatchActive && baseTimeMin > 0
                        ? `${Math.floor((isFlipped ? senteRemainingSec : goteRemainingSec) / 60)}:${((isFlipped ? senteRemainingSec : goteRemainingSec) % 60).toString().padStart(2, '0')}`
                        : undefined
                    }
                    byoyomiSeconds={
                      !isPositionEditMode &&
                      isMatchActive &&
                      (isFlipped ? senteRemainingSec : goteRemainingSec) <= 0
                        ? (isFlipped ? senteByoyomiRemaining : goteByoyomiRemaining)
                        : undefined
                    }
                    onPieceSelect={
                      isPositionEditMode
                        ? (kind) => handleEditHandClick(topColor, kind)
                        : canNormalSelect
                          ? (kind) => {
                              setSelectedPieceFromHand(kind === selectedPieceFromHand ? null : kind);
                              setSelectedSquare(null);
                            }
                          : undefined
                    }
                    onStandClick={
                      isPositionEditMode ? () => handleEditHandClick(topColor) : undefined
                    }
                    isDropTarget={
                      isPositionEditMode &&
                      editPreviewState === null &&
                      canPlaceInHand(editSelection) &&
                      !(editSelection?.source === 'hand' && editSelection.color === topColor)
                    }
                    isHumanPlayer={
                      !isPositionEditMode &&
                      isMatchActive &&
                      (isFlipped ? matchSentePlayer : matchGotePlayer) === 'human'
                    }
                    isFlippedPlayer={
                      !isPositionEditMode &&
                      isMatchActive &&
                      matchSentePlayer === 'human' &&
                      matchGotePlayer === 'human'
                    }
                    isFlippedBoard={isFlipped}
                    onViewKifuSheet={() => {
                      setKifuSheetViewerSide(topColor);
                      setShowKifuSheet(true);
                    }}
                    onHint={handleRequestMatchHint}
                    onResign={handleResignMatch}
                    className="w-full shrink-0"
                  />
                );
              })()}

              {/* Central SVG Board with Promotion Modal Overlay */}
              <div
                onClick={handleEditMarginClick}
                className="relative flex-1 min-h-[260px] sm:min-h-[300px] w-full flex items-center justify-center overflow-hidden"
              >
                <StudioShogiBoardView
                  shogi={displayShogi}
                  isFlipped={isFlipped}
                  selectedSquare={
                    isPositionEditMode
                      ? editPreviewState === null && editSelection?.source === 'board'
                        ? { x: editSelection.x, y: editSelection.y }
                        : null
                      : selectedSquare
                  }
                  targetSquares={isPositionEditMode ? [] : targetSquares}
                  lastMove={isPositionEditMode ? (editPreviewState?.lastMove ?? null) : lastMoveObj}
                  hintSquares={
                    isPositionEditMode
                      ? []
                      : hintHighlightMove
                        ? hintHighlightMove.from
                          ? [hintHighlightMove.from, hintHighlightMove.to]
                          : [hintHighlightMove.to]
                        : []
                  }
                  candidateArrows={(() => {
                    if (
                      isZenMode ||
                      isPositionEditMode ||
                      activeMode !== 'STUDY' ||
                      studioViewTier !== 3
                    ) {
                      return [];
                    }
                    const curEval =
                      evalSourceView === 'local'
                        ? (localEvalHistory.get(currentPly) ??
                            (engine.candidatesSfen === currentSfen ? engine.evaluation : null))
                        : (evalHistory.get(currentPly) ??
                            localEvalHistory.get(currentPly) ??
                            (engine.candidatesSfen === currentSfen ? engine.evaluation : null));
                    const localEval = localEvalHistory.get(currentPly);
                    const liveCandidates =
                      engine.candidatesSfen === currentSfen && engine.candidates.length > 0
                        ? engine.candidates
                        : null;
                    const multiCandidates =
                      evalSourceView === 'local'
                        ? (curEval?.candidates && curEval.candidates.length > 0
                            ? curEval.candidates
                            : liveCandidates)
                        : (curEval?.candidates && curEval.candidates.length > 0
                            ? curEval.candidates
                            : localEval?.candidates && localEval.candidates.length > 0
                              ? localEval.candidates
                              : activeSpotPosition?.result?.candidates &&
                                  activeSpotPosition.result.candidates.length > 0
                                ? activeSpotPosition.result.candidates
                                : liveCandidates);
                    const usiEntries: Array<{ rank: number; usi: string }> = [];
                    if (multiCandidates && multiCandidates.length > 0) {
                      const sorted = [...multiCandidates]
                        .sort((a, b) => a.multipv - b.multipv)
                        .slice(0, studyMultiPv);
                      sorted.forEach((c, idx) => {
                        if (c.usi) {
                          usiEntries.push({
                            rank: c.multipv >= 1 ? c.multipv : idx + 1,
                            usi: c.usi,
                          });
                        }
                      });
                    } else {
                      const liveBest =
                        engine.candidatesSfen === currentSfen
                          ? (engine.currentInfo?.bestMove ?? engine.currentInfo?.pv?.[0])
                          : undefined;
                      const singleUsi = curEval?.bestMove ?? liveBest;
                      if (singleUsi) {
                        usiEntries.push({ rank: 1, usi: singleUsi });
                      }
                    }
                    const dropCharMap: Record<string, string> = {
                      P: '歩',
                      L: '香',
                      N: '桂',
                      S: '銀',
                      G: '金',
                      B: '角',
                      R: '飛',
                    };
                    const arrows: StudioCandidateArrow[] = [];
                    for (const entry of usiEntries) {
                      const parsed = parseUsiMove(entry.usi, displayShogi);
                      if (!parsed) continue;
                      const label =
                        entry.rank === 1
                          ? t('studio.view_tier.arrow_best', '最')
                          : entry.rank === 2
                            ? t('studio.view_tier.arrow_second', '次')
                            : String(entry.rank);
                      const dropPrefix =
                        !parsed.from && entry.usi.length >= 2 && entry.usi[1] === '*'
                          ? dropCharMap[entry.usi[0]?.toUpperCase() ?? '']
                          : undefined;
                      arrows.push({
                        from: parsed.from,
                        to: parsed.to,
                        rank: entry.rank,
                        label,
                        dropPieceLabel: dropPrefix,
                        dropPieceColor: displayShogi.turn === 1 ? 1 : 0,
                      });
                    }
                    return arrows;
                  })()}
                  onSquareClick={handleSquareClick}
                  onSquareContextMenu={
                    isPositionEditMode ? (sq) => handleEditSquareRightClick(sq) : undefined
                  }
                  className="h-full w-auto max-w-full"
                />

                {/* Promotion Confirmation Modal */}
                {!isPositionEditMode && pendingPromotion && (
                  <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center z-20 rounded animate-fade-in">
                    <div className="bg-slate-900 border border-amber-500/60 rounded-xl p-5 shadow-2xl text-center space-y-4 max-w-xs">
                      <h4 className="text-sm font-bold text-amber-300">
                        {t('studio.promote_dialog.title', '駒を成りますか？')}
                      </h4>
                      <div className="flex items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (activeMode === 'QUIZ') {
                              const moveUsi = toUsi(pendingPromotion.from, pendingPromotion.to, pendingPromotion.pieceKind, true);
                              executeQuizAttempt(moveUsi, pendingPromotion.from, pendingPromotion.to, pendingPromotion.pieceKind, true);
                            } else {
                              executeStudyMove(pendingPromotion.from, pendingPromotion.to, pendingPromotion.pieceKind, true);
                            }
                          }}
                          className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-sm shadow transition active:scale-95"
                        >
                          {t('studio.promote_dialog.promote', '成る (Promote)')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (activeMode === 'QUIZ') {
                              const moveUsi = toUsi(pendingPromotion.from, pendingPromotion.to, pendingPromotion.pieceKind, false);
                              executeQuizAttempt(moveUsi, pendingPromotion.from, pendingPromotion.to, pendingPromotion.pieceKind, false);
                            } else {
                              executeStudyMove(pendingPromotion.from, pendingPromotion.to, pendingPromotion.pieceKind, false);
                            }
                          }}
                          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-sm transition active:scale-95"
                        >
                          {t('studio.promote_dialog.stay', '不成 (Stay)')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Komadai */}
              {(() => {
                const bottomColor: 0 | 1 = isFlipped ? 1 : 0;
                const canNormalSelect =
                  (!isMatchActive ||
                    (player.shogi.turn === 0 ? matchSentePlayer : matchGotePlayer) === 'human') &&
                  player.shogi.turn === bottomColor;
                return (
                  <StudioKomadaiView
                    color={bottomColor}
                    playerName={isFlipped ? goteName : senteName}
                    isTurn={displayShogi.turn === bottomColor}
                    hands={isFlipped ? displayGoteHands : displaySenteHands}
                    selectable={isPositionEditMode ? true : canNormalSelect}
                    selectedPiece={
                      isPositionEditMode
                        ? editPreviewState === null &&
                          editSelection?.source === 'hand' &&
                          editSelection.color === bottomColor
                          ? SFEN_BASE_TO_KIND[editSelection.base]
                          : null
                        : player.shogi.turn === bottomColor
                          ? selectedPieceFromHand
                          : null
                    }
                    timeRemaining={
                      !isPositionEditMode && isMatchActive && baseTimeMin > 0
                        ? `${Math.floor((isFlipped ? goteRemainingSec : senteRemainingSec) / 60)}:${((isFlipped ? goteRemainingSec : senteRemainingSec) % 60).toString().padStart(2, '0')}`
                        : undefined
                    }
                    byoyomiSeconds={
                      !isPositionEditMode &&
                      isMatchActive &&
                      (isFlipped ? goteRemainingSec : senteRemainingSec) <= 0
                        ? (isFlipped ? goteByoyomiRemaining : senteByoyomiRemaining)
                        : undefined
                    }
                    onPieceSelect={
                      isPositionEditMode
                        ? (kind) => handleEditHandClick(bottomColor, kind)
                        : canNormalSelect
                          ? (kind) => {
                              setSelectedPieceFromHand(kind === selectedPieceFromHand ? null : kind);
                              setSelectedSquare(null);
                            }
                          : undefined
                    }
                    onStandClick={
                      isPositionEditMode ? () => handleEditHandClick(bottomColor) : undefined
                    }
                    isDropTarget={
                      isPositionEditMode &&
                      editPreviewState === null &&
                      canPlaceInHand(editSelection) &&
                      !(editSelection?.source === 'hand' && editSelection.color === bottomColor)
                    }
                    isHumanPlayer={
                      !isPositionEditMode &&
                      isMatchActive &&
                      (isFlipped ? matchGotePlayer : matchSentePlayer) === 'human'
                    }
                    isFlippedPlayer={false}
                    isFlippedBoard={isFlipped}
                    onViewKifuSheet={() => {
                      setKifuSheetViewerSide(bottomColor);
                      setShowKifuSheet(true);
                    }}
                    onHint={handleRequestMatchHint}
                    onResign={handleResignMatch}
                    className="w-full shrink-0"
                  />
                );
              })()}

              {/* Mobile Embedded Shogi Trace Bar (Directly visible beneath the board on smartphone screens) */}
              {!isZenMode && activeMode === 'SHOGI_TRACE' && (
                <div className="lg:hidden w-full max-w-sm px-1.5 py-1 space-y-1.5 shrink-0">
                  {traceFeedback && (
                    <div
                      className={`p-2 rounded-lg border text-xs font-bold ${
                        traceFeedback.includes('正解') || traceFeedback.includes('Correct')
                          ? 'bg-emerald-950/60 border-emerald-500/70 text-emerald-200'
                          : traceFeedback.includes('ヒント') || traceFeedback.includes('Hint')
                          ? 'bg-amber-950/60 border-amber-500/70 text-amber-200'
                          : 'bg-rose-950/60 border-rose-500/70 text-rose-200'
                      }`}
                    >
                      {traceFeedback}
                    </div>
                  )}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-2 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-amber-300">✍️ {t('studio.tabs.trace')}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const next = player.getMove(currentPly + 1);
                            if (next) {
                              setTraceUsedHint(true);
                              const pieceLabel = PIECE_KIND_LABEL[next.piece] || next.piece;
                              setTraceFeedback(t('studio.trace.hint_msg', { piece: pieceLabel }));
                            }
                          }}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-semibold text-[11px] transition"
                        >
                          {t('studio.trace.hint_btn')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (currentPly >= totalPlies) return;
                            setTraceStats((prev) => ({ ...prev, skipped: prev.skipped + 1 }));
                            setTraceMistakes(0);
                            setTraceUsedHint(false);
                            goToPly(currentPly + 1);
                            setTraceFeedback(t('studio.trace.skipped_feedback', '⏭️ スキップして次の手へ進みました'));
                          }}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-[11px] transition"
                        >
                          {t('studio.trace.skip_btn', '⏭️ スキップ')}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-1 text-[10px] font-mono text-center pt-1 border-t border-slate-800/80">
                      <span className="text-emerald-300">○ {traceStats.exact}</span>
                      <span className="text-amber-300">△ {traceStats.near}</span>
                      <span className="text-sky-300">🌟 {traceStats.aiBest}</span>
                      <span className="text-rose-300">✕ {traceStats.wrong}</span>
                      <span className="text-slate-400">⏭ {traceStats.skipped}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Mobile Embedded Quiz Card (Directly visible beneath the board on smartphone screens) */}
              {!isZenMode && activeMode === 'QUIZ' && (
                <div className="lg:hidden w-full max-w-sm px-1.5 py-1 space-y-1.5 shrink-0">
                  {!currentQuizCard ? (
                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-center space-y-2">
                      <div className="text-xs font-bold text-slate-200">
                        🎯 {t('quiz.pool.empty')}
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsQuizPoolModalOpen(true)}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs shadow transition"
                      >
                        🗂️ {t('quiz.pool.title')}
                      </button>
                    </div>
                  ) : (
                    <>
                      {currentQuizCard.title && (
                        <div className="px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] font-bold text-slate-100 truncate">
                          🎯 {currentQuizCard.title}
                        </div>
                      )}
                      <div className="px-2.5 py-1.5 rounded-lg bg-amber-950/30 border border-amber-900/40 text-xs flex items-center justify-between">
                        <span className="font-bold text-slate-200">
                          {t('studio.quiz_inline.prompt_turn', {
                            turn: currentQuizCard.sideToMove === 'b' ? t('studio.position_summary.turn_sente', '▲ 先手') : t('studio.position_summary.turn_gote', '△ 後手'),
                          })}
                        </span>
                        <span className="font-mono text-[11px] text-amber-300">
                          {t('studio.quiz_inline.question_progress', {
                            current: activeQuizIndex + 1,
                            total: quizPool.length,
                          })}
                        </span>
                      </div>

                      {/* Mobile Compact Quiz Replay Controller */}
                      {quizReplayState?.isActive && (
                        <div className="p-2 rounded-lg bg-slate-900 border border-amber-500/50 space-y-1.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-amber-300 text-[11px]">
                              {t('studio.quiz_inline.replay_title', {
                                current: quizReplayState.currentIndex,
                                total: quizReplayState.moves.length,
                              })}
                            </span>
                            <button
                              type="button"
                              onClick={handleExitQuizReplay}
                              className="text-[10px] text-slate-400 hover:text-slate-200 underline"
                            >
                              {t('studio.quiz_inline.return_to_question', '出題局面に戻る')}
                            </button>
                          </div>
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleQuizReplayStep('first')}
                                className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[11px] font-mono"
                              >
                                |&lt;
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQuizReplayStep('prev')}
                                disabled={quizReplayState.currentIndex <= 0}
                                className="px-2.5 py-1 rounded bg-slate-800 disabled:opacity-30 text-slate-200 text-[11px] font-bold"
                              >
                                ◀
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQuizReplayStep('next')}
                                disabled={quizReplayState.currentIndex >= quizReplayState.moves.length}
                                className="px-2.5 py-1 rounded bg-slate-800 disabled:opacity-30 text-slate-200 text-[11px] font-bold"
                              >
                                ▶
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQuizReplayStep('last')}
                                className="px-2 py-1 rounded bg-slate-800 text-slate-300 text-[11px] font-mono"
                              >
                                &gt;|
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={handleToggleQuizReplayPlay}
                              className="px-2.5 py-1 rounded bg-amber-600 text-slate-950 font-bold text-[11px]"
                            >
                              {quizReplayState.isPlaying
                                ? t('studio.quiz_inline.replay_stop', '⏸ 停止')
                                : t('studio.quiz_inline.replay_play', '▶ 自動再生')}
                            </button>
                          </div>
                        </div>
                      )}
                  {/* Verdict & Explanation Banner */}
                  {quizVerdict !== null && (
                    <div
                      className={`p-2 rounded-lg border text-xs space-y-1 shadow ${
                        quizVerdict === 'best'
                          ? 'bg-emerald-950/70 border-emerald-500/70 text-emerald-200'
                          : quizVerdict === 'acceptable'
                          ? 'bg-sky-950/70 border-sky-500/70 text-sky-200'
                          : 'bg-rose-950/70 border-rose-500/70 text-rose-200'
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5">
                          <span>
                            {quizVerdict === 'best'
                              ? t('studio.quiz_inline.verdict_best', '🎉 最善手! 一致しました')
                              : quizVerdict === 'acceptable'
                              ? t('studio.quiz_inline.verdict_acceptable', '✨ 許容手（好手）')
                              : t('studio.quiz_inline.verdict_wrong', '❌ 惜しい、もう一度')}
                          </span>
                          {quizEvalLossCp !== null && (
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                                quizVerdict === 'best'
                                  ? 'bg-emerald-900 text-emerald-300'
                                  : quizVerdict === 'acceptable'
                                  ? 'bg-sky-900 text-sky-300'
                                  : 'bg-rose-900 text-rose-300'
                              }`}
                            >
                              {quizEvalLossCp === 0 ? '±0' : `-${quizEvalLossCp} cp`}
                            </span>
                          )}
                        </span>
                        {quizVerdict === 'wrong' && !isAnswerRevealed ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (currentQuizCard) {
                                loadQuizPosition(currentQuizCard);
                              }
                            }}
                            className="px-2.5 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-rose-500/40 text-amber-300 text-xs font-bold shadow"
                          >
                            {t('studio.quiz_inline.retry_btn', '🔄 やり直す')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleNextQuizCard}
                            className="px-2.5 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-black shadow"
                          >
                            {t('studio.quiz_inline.next_btn', '次へ進む ➔')}
                          </button>
                        )}
                      </div>

                      {/* Move Details & Explanation */}
                      <div className="text-[11px] pt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-slate-700/40">
                        {quizLastPlayedMove && (
                          <span>
                            {t('studio.quiz_inline.last_move', {
                              defaultValue: `着手: ${quizLastPlayedMove}`,
                              move: quizLastPlayedMove,
                            })}
                          </span>
                        )}
                        {currentQuizCard && (quizVerdict !== 'wrong' || isAnswerRevealed) && (
                          <span>
                            {t('studio.quiz_inline.ai_best_move', {
                              defaultValue: 'AI最善手: {{move}}',
                              move: (() => {
                                const baseP = createQuizBasePlayer(currentQuizCard);
                                return formatUsiToJapanese(
                                  currentQuizCard.bestMove,
                                  currentQuizCard.sideToMove === 'w' ? 1 : 0,
                                  baseP.shogi
                                );
                              })(),
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 3-Choice selection buttons embedded under board (with score delta tags after answer) */}
                  {currentQuizCard?.choices && currentQuizCard.choices.length > 0 && (mobileChoicesVisible || quizVerdict !== null) && (
                    <div className="space-y-1 animate-fade-in">
                      <div className="text-[11px] font-bold text-slate-400 flex items-center justify-between px-0.5">
                        <span>{t('studio.quiz_inline.choices_heading', '💡 選択肢 (三択)')}</span>
                        {quizVerdict === null && (
                          <span className="text-[10px] text-amber-400/80">{t('studio.quiz_inline.choices_sub', '候補から選択')}</span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-1">
                        {currentQuizCard.choices.map((choice) => {
                          const isFinished = quizVerdict === 'best' || quizVerdict === 'acceptable' || isAnswerRevealed;
                          const isSelectedAndBest = isFinished && choice.isCorrect;
                          const turnColor: 0 | 1 = currentQuizCard.sideToMove === 'w' ? 1 : 0;
                          const label =
                            choice.label ||
                            (() => {
                              const baseP = createQuizBasePlayer(currentQuizCard);
                              return formatUsiToJapanese(choice.usi, turnColor, baseP.shogi);
                            })();

                          return (
                            <div key={`mobile-choice-${choice.usi}`} className="space-y-0.5">
                              <button
                                type="button"
                                onClick={() => executeQuizAttempt(choice.usi)}
                                className={`w-full py-1.5 px-2.5 rounded-lg border text-xs font-bold transition flex items-center justify-between ${
                                  isSelectedAndBest
                                    ? 'bg-emerald-950/80 border-emerald-500 text-emerald-200 shadow'
                                    : isFinished && !choice.isCorrect
                                    ? 'bg-slate-900/50 border-slate-800 text-slate-400'
                                    : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-amber-600 hover:text-slate-950 hover:border-amber-500'
                                }`}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm">{label}</span>
                                  {choice.role === 'actual' && isFinished && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                                      {t('studio.quiz_inline.choice_role_actual', '実戦手')}
                                    </span>
                                  )}
                                  {choice.role === 'best' && isFinished && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                      {t('studio.quiz_inline.choice_role_best', 'AI最善')}
                                    </span>
                                  )}
                                </div>
                                {isFinished && choice.scoreDelta !== undefined && (
                                  <span
                                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                      choice.isCorrect
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                    }`}
                                  >
                                    {choice.isCorrect ? t('studio.quiz_inline.choice_best_label', '最善手') : `${choice.scoreDelta} cp`}
                                  </span>
                                )}
                              </button>

                              {/* Mobile PV Playback Trigger */}
                              {isFinished && (choice.continuationPv || [choice.usi]).length > 0 && (
                                <div className="flex items-center justify-between px-1 text-[10px] text-slate-400">
                                  <span className="truncate text-slate-500">
                                    {choice.explanation || (choice.isCorrect ? t('studio.quiz_inline.choice_default_exp_best', '最善の継続進行') : t('studio.quiz_inline.choice_default_exp_counter', '相手からの反撃'))}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handlePlayPvContinuation(choice.continuationPv || [choice.usi], choice.usi)}
                                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-amber-600 hover:text-slate-950 text-amber-300 font-bold transition flex items-center gap-0.5"
                                  >
                                    <span>▶</span>
                                    <span>{t('studio.quiz_inline.play_pv_btn', '変化を盤面再生')}</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Quick Bottom Control Buttons: Hint, Reveal, Next */}
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setMobileChoicesVisible(true);
                      }}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-amber-300 font-semibold text-xs transition flex items-center justify-center gap-1"
                    >
                      <span>💡</span>
                      <span>{mobileChoicesVisible ? t('studio.quiz_inline.choices_visible_label', '三択表示中') : t('studio.quiz_inline.show_choices_btn', '三択を見る')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileChoicesVisible(true);
                        if (currentQuizCard) {
                          executeQuizAttempt(currentQuizCard.bestMove);
                        }
                      }}
                      className="flex-1 py-1.5 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-xs transition"
                    >
                      {t('studio.quiz_inline.reveal_btn', '👁️ 正解')}
                    </button>
                      <button
                        type="button"
                        onClick={handleNextQuizCard}
                        className="flex-1 py-1.5 px-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs transition active:scale-95 shadow"
                      >
                        {t('studio.quiz_inline.next_card_btn', '次へ ➔')}
                      </button>
                    </div>
                    <div className="flex items-center justify-between pt-0.5 px-0.5 text-[11px]">
                      <button
                        type="button"
                        onClick={async () => {
                          const games = loadSavedStudioGames();
                          const targetGame = games.find((g) => g.id === currentQuizCard.sourceGameId);
                          if (targetGame) {
                            await handleOpenGame(targetGame, currentQuizCard.ply);
                            setActiveMode('STUDY');
                            setMobileActiveTab('board');
                          }
                        }}
                        className="text-amber-400 hover:underline flex items-center gap-1"
                      >
                        <span>🌳</span>
                        <span>{t('studio.quiz_inline.study_source_game', '元の棋譜で研究')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsQuizPoolModalOpen(true)}
                        className="text-slate-400 hover:text-slate-200 hover:underline flex items-center gap-1"
                      >
                        <span>🗂️</span>
                        <span>{t('quiz.pool.title')}</span>
                      </button>
                    </div>
                    </>
                  )}
                </div>
              )}

              {/* Piece Box (Edit Mode) OR Navigation / Quick Quiz Controls (Fixed Height Zero Layout Shift) */}
              {isPositionEditMode ? (() => {
                const pos = parsePositionSfen(displayShogi.toSFENString());
                const boxCounts = getPieceBoxCounts(pos);
                const availableBoxBases = PIECE_ORDER.filter((base) => boxCounts[base] > 0);
                const canReturnToBox =
                  editPreviewState === null &&
                  (editSelection?.source === 'board' || editSelection?.source === 'hand');
                return (
                  <div
                    onClick={() => handleEditBoxClick()}
                    title={canReturnToBox ? t('position_editor.piece_box_drop_hint') : undefined}
                    className={`w-full h-[44px] px-3 py-1 rounded-lg border flex items-center justify-between gap-2 shrink-0 transition-colors ${
                      canReturnToBox
                        ? 'bg-amber-950/30 border-amber-400/80 ring-1 ring-amber-400/40 cursor-pointer'
                        : 'bg-slate-900/95 border-slate-800'
                    }`}
                  >
                    <span className="text-[11px] font-bold text-slate-400 shrink-0">
                      {t('position_editor.piece_box_label')}
                    </span>
                    <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-0.5">
                      {availableBoxBases.length === 0 ? (
                        <span className="text-[11px] text-slate-600 font-mono px-1">-</span>
                      ) : (
                        availableBoxBases.map((base) => {
                          const cnt = boxCounts[base];
                          const isSel =
                            editPreviewState === null &&
                            editSelection?.source === 'box' &&
                            editSelection.base === base;
                          const { col, row } = getPieceSpriteCoords(SFEN_BASE_TO_KIND[base], false);
                          return (
                            <button
                              key={base}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditBoxClick(base);
                              }}
                              title={`${t(`position_editor.piece_${base}`)} ×${cnt}`}
                              className={`relative inline-flex items-center justify-center w-[28px] h-[30px] rounded p-0.5 shrink-0 cursor-pointer hover:scale-105 active:scale-95 transition-transform ${
                                isSel
                                  ? 'ring-2 ring-emerald-400 scale-110 shadow-lg shadow-emerald-500/40'
                                  : ''
                              }`}
                            >
                              <svg
                                className="w-full h-full drop-shadow"
                                viewBox={`${col * 35} ${row * 37} 35 37`}
                              >
                                <image
                                  href={pieceSpriteHref}
                                  x="0"
                                  y="0"
                                  width="280"
                                  height="148"
                                />
                              </svg>

                              {cnt > 1 && (
                                <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-0.5 rounded-full bg-red-600 text-white font-mono text-[9px] font-black flex items-center justify-center shadow ring-1 ring-white/60">
                                  {cnt}
                                </span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })() : !isZenMode && activeMode === 'QUIZ' ? (
                <div className="hidden lg:flex items-center gap-1.5 shrink-0 w-full max-w-sm justify-center px-2">
                  {(quizVerdict === 'best' || quizVerdict === 'acceptable' || isAnswerRevealed) ? (
                    <button
                      type="button"
                      onClick={handleNextQuizCard}
                      className="flex-1 py-1 px-3 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-xs shadow transition active:scale-95 flex items-center justify-center gap-1"
                    >
                      <span>{t('studio.quiz_inline.next_btn', '次へ進む ➔')}</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (currentQuizCard) {
                            const parsed = parseUsiMove(currentQuizCard.bestMove, player.shogi);
                            if (parsed && parsed.from) {
                              setHintHighlightMove({ from: parsed.from, to: parsed.from });
                            }
                          }
                        }}
                        className="flex-1 py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-semibold text-xs transition"
                      >
                        {t('studio.tsumego.hint_btn', '💡 ヒント')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAnswerRevealed(true);
                          if (currentQuizCard) {
                            executeQuizAttempt(currentQuizCard.bestMove);
                          }
                        }}
                        className="flex-1 py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-xs transition"
                      >
                        {t('studio.quiz_inline.reveal_btn', '👁️ 正解')}
                      </button>
                    </>
                  )}
                </div>
              ) : !isZenMode ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => goToPly(0)}
                    className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold transition"
                  >
                    |&lt;
                  </button>
                  <button
                    type="button"
                    onClick={() => goToPly(currentPly - 1)}
                    className="px-4 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold transition"
                  >
                    &lt;
                  </button>
                  <button
                    type="button"
                    onClick={() => goToPly(currentPly + 1)}
                    className="px-4 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold transition"
                  >
                    &gt;
                  </button>
                  <button
                    type="button"
                    onClick={() => goToPly(totalPlies)}
                    className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold transition"
                  >
                    &gt;|
                  </button>
                  {!isMatchActive &&
                    !isPositionEditMode && (
                      <button
                        type="button"
                        onClick={handleUndoLastMove}
                        disabled={!canUndoLastMove}
                        title={t('studio.tree.undo_last_move_title')}
                        className="ml-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-35 disabled:cursor-not-allowed text-xs font-semibold text-amber-300 transition whitespace-nowrap"
                      >
                        ↩ {t('studio.tree.undo_last_move')}
                      </button>
                    )}
                </div>
              ) : null}
            </div>

            {/* Side Column: Physical Shogi Clock (Rotated facing board) & Quick Controls - Shown on desktop/large screens */}
            {isMatchActive && (
              <div className="hidden lg:flex items-center justify-center h-full max-h-[92vh] gap-3 shrink-0 select-none">
                {/* Physical Clock Box (Integrated Dual Shogi Clock - Clean, large digits without duplicate names) */}
                <div className="flex flex-col items-center p-3 bg-slate-900/95 border-2 border-slate-700/80 rounded-2xl shadow-2xl w-28 sm:w-32 gap-3 select-none justify-center">
                  {/* Top Display: Opponent side (Rotated 90 degrees so text bottom faces the board) */}
                  <div
                    className={`flex items-center justify-center rounded-xl border w-24 h-24 rotate-90 text-center transition-all ${
                      matchResult !== null
                        ? 'bg-slate-950/70 border-slate-800/80 opacity-60'
                        : (clockSwitchMode === 'manual' && isWaitingClockPress
                        ? (isFlipped ? player.shogi.turn === 0 : player.shogi.turn === 1)
                        : (isFlipped ? player.shogi.turn === 1 : player.shogi.turn === 0))
                        ? 'bg-amber-950/40 border-amber-500/70 shadow-inner'
                        : 'bg-slate-950/70 border-slate-800/80 opacity-60'
                    }`}
                  >
                    <span className="font-mono text-xl sm:text-2xl font-black tracking-widest whitespace-nowrap text-slate-100">
                      {baseTimeMin === 0 ? (
                        '--:--'
                      ) : (isFlipped ? senteRemainingSec : goteRemainingSec) > 0 ? (
                        `${Math.floor((isFlipped ? senteRemainingSec : goteRemainingSec) / 60)}:${((isFlipped ? senteRemainingSec : goteRemainingSec) % 60).toString().padStart(2, '0')}`
                      ) : (
                        <span className="text-red-400 font-bold">{(isFlipped ? senteByoyomiRemaining : goteByoyomiRemaining)}s</span>
                      )}
                    </span>
                  </div>

                  {/* Built-in Seamless Switch Button (Natural Mechanical Button) */}
                  <button
                    type="button"
                    disabled={clockSwitchMode !== 'manual' || !isWaitingClockPress || matchResult !== null}
                    onClick={() => {
                      setIsWaitingClockPress(false);
                    }}
                    className={`w-24 py-2.5 rounded-xl border font-bold text-xs transition-all flex items-center justify-center ${
                      matchResult === null && clockSwitchMode === 'manual' && isWaitingClockPress
                        ? 'bg-amber-600 hover:bg-amber-500 text-slate-950 border-amber-400 cursor-pointer shadow-lg active:scale-95'
                        : 'bg-slate-800/80 border-slate-700/70 text-slate-500 cursor-default'
                    }`}
                  >
                    <span className="font-mono text-xs rotate-90 whitespace-nowrap font-bold">
                      {matchResult === null && clockSwitchMode === 'manual' && isWaitingClockPress ? '押す' : '─'}
                    </span>
                  </button>

                  {/* Bottom Display: Player side (Rotated 90 degrees so text bottom faces the board) */}
                  <div
                    className={`flex items-center justify-center rounded-xl border w-24 h-24 rotate-90 text-center transition-all ${
                      matchResult !== null
                        ? 'bg-slate-950/70 border-slate-800/80 opacity-60'
                        : (clockSwitchMode === 'manual' && isWaitingClockPress
                        ? (isFlipped ? player.shogi.turn === 1 : player.shogi.turn === 0)
                        : (isFlipped ? player.shogi.turn === 0 : player.shogi.turn === 1))
                        ? 'bg-amber-950/40 border-amber-500/70 shadow-inner'
                        : 'bg-slate-950/70 border-slate-800/80 opacity-60'
                    }`}
                  >
                    <span className="font-mono text-xl sm:text-2xl font-black tracking-widest whitespace-nowrap text-amber-300">
                      {baseTimeMin === 0 ? (
                        '--:--'
                      ) : (isFlipped ? goteRemainingSec : senteRemainingSec) > 0 ? (
                        `${Math.floor((isFlipped ? goteRemainingSec : senteRemainingSec) / 60)}:${((isFlipped ? goteRemainingSec : senteRemainingSec) % 60).toString().padStart(2, '0')}`
                      ) : (
                        <span className="text-red-400 font-bold">{(isFlipped ? goteByoyomiRemaining : senteByoyomiRemaining)}s</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Right of Clock: Vertical Evaluation Bar aligned to Rank 5 */}
                <div className="flex flex-col items-center justify-center h-full max-h-[520px] py-1">
                  {/* Exit Zen Button (Minimal corner icon) */}
                  {isZenMode && (
                    <button
                      type="button"
                      onClick={() => setIsZenMode(false)}
                      className="p-1 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition text-xs mb-auto"
                      title={t('studio.match.zen_mode_exit')}
                    >
                      ✕
                    </button>
                  )}

                  {/* Vertical Evaluation Bar (Centered directly at 5th rank / 50% midpoint) */}
                  {showLiveEvalBar && (() => {
                    const currentCp = evalHistory.get(currentPly)?.scoreCp ?? 0;
                    const clampedCp = Math.max(-2000, Math.min(2000, currentCp));
                    const sentePct = Math.round(50 + (clampedCp / 2000) * 50);
                    const gotePct = 100 - sentePct;

                    return (
                      <div className="flex flex-col items-center gap-3 my-auto select-none">
                        {/* Top: Sente Percent (Rotated 90 with larger bold font) */}
                        <div className="flex items-center gap-1 rotate-90 font-mono font-black text-sm text-amber-400 bg-slate-900/90 px-1.5 py-0.5 rounded border border-amber-500/40 shadow">
                          <span>▲</span>
                          <span>{sentePct}%</span>
                        </div>

                        {/* Bar Body */}
                        <div className="w-3.5 h-60 bg-slate-900 rounded-full overflow-hidden flex flex-col border-2 border-slate-700 shadow-xl relative">
                          {/* 5th Rank Centerline marker */}
                          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-400/60 z-10 -translate-y-1/2 pointer-events-none" />

                          {/* Top half: Sente Advantage */}
                          <div
                            className="w-full bg-gradient-to-t from-amber-600 to-amber-400 transition-all duration-300"
                            style={{ height: `${sentePct}%` }}
                          />
                          {/* Bottom half: Gote Advantage */}
                          <div
                            className="w-full bg-gradient-to-b from-slate-700 to-slate-800 transition-all duration-300 flex-1"
                          />
                        </div>

                        {/* Bottom: Gote Percent (Rotated 90 with larger bold font) */}
                        <div className="flex items-center gap-1 rotate-90 font-mono font-black text-sm text-slate-200 bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-700 shadow">
                          <span>△</span>
                          <span>{gotePct}%</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Spacer for bottom balance */}
                  {isZenMode && <div className="h-6 mt-auto" />}
                </div>
              </div>
            )}
          </div>
          </>
          )}
        </main>

        {/* Mobile Full-Screen Joseki Tree View (keeps bottom nav visible) */}
        {!isZenMode && mobileActiveTab === 'fulltree' && (
          <div className="lg:hidden flex-1 min-h-0 flex flex-col bg-slate-950 z-20 overflow-hidden">
            <JosekiTreeVisualizer
              games={loadSavedStudioGames()}
              maxPlyLimit={30}
              onClose={() => setMobileActiveTab('board')}
              onOpenGame={(game, ply) => {
                setActiveMode('STUDY');
                setMobileActiveTab('board');
                handleOpenGame(game, ply ?? 0);
              }}
              onSelectPosition={(sfen, gameId, ply) => {
                setActiveMode('STUDY');
                setMobileActiveTab('board');
                const games = loadSavedStudioGames();
                const matchedGame = gameId ? games.find((g) => g.id === gameId) : undefined;
                if (matchedGame) {
                  handleOpenGame(matchedGame, ply ?? 0);
                } else if (ply !== undefined && ply <= player.getMaxTesuu() && player.getMaxTesuu() > 0) {
                  goToPly(ply);
                } else if (sfen) {
                  player.shogi.initializeFromSFENString(sfen);
                  bumpVersion();
                }
              }}
            />
          </div>
        )}

        {/* Right Pane: Contextual Mode Operations (320px on desktop, full overlay on mobile when action/practice tab active) */}
        {!isZenMode && (
          <aside
            className={`relative w-full lg:w-[320px] bg-slate-900/95 lg:bg-slate-900/80 border-l border-slate-800 flex flex-col shrink-0 ${
              mobileActiveTab === 'action' || mobileActiveTab === 'practice' ? 'flex flex-1 z-20' : 'hidden lg:flex'
            }`}
          >
          <div
            className={`flex flex-col flex-1 min-h-0 transition ${
              isPositionEditMode ? 'opacity-10 grayscale pointer-events-none select-none' : ''
            }`}
          >
          {/* Desktop Mode Tabs (6 modes) */}
          <div className="hidden lg:grid grid-cols-6 p-1 bg-slate-950 border-b border-slate-800 gap-1 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setActiveMode('STUDY')}
              className={`py-1.5 rounded transition-colors ${
                activeMode === 'STUDY' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('studio.tabs.study')}
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('SHOGI_TRACE')}
              className={`py-1.5 rounded transition-colors ${
                activeMode === 'SHOGI_TRACE' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('studio.tabs.trace')}
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('AI_MATCH')}
              className={`py-1.5 rounded transition-colors ${
                activeMode === 'AI_MATCH' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('studio.tabs.ai_match')}
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('QUIZ')}
              className={`py-1.5 rounded transition-colors ${
                activeMode === 'QUIZ' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('studio.tabs.quiz')}
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('TSUMEGO')}
              className={`py-1.5 rounded transition-colors ${
                activeMode === 'TSUMEGO' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('studio.tabs.tsumego')}
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('RESIGN_MATE')}
              className={`py-1.5 rounded transition-colors ${
                activeMode === 'RESIGN_MATE' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('studio.tabs.resign_mate')}
            </button>
          </div>

          {/* Mobile Mode Sub-Tabs: Analysis (STUDY / RESIGN_MATE) */}
          {mobileActiveTab === 'action' && (
            <div className="lg:hidden grid grid-cols-2 p-1 bg-slate-950 border-b border-slate-800 gap-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveMode('STUDY')}
                className={`py-1.5 rounded transition-colors ${
                  activeMode === 'STUDY' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                📊 {t('studio.tabs.study')}
              </button>
              <button
                type="button"
                onClick={() => setActiveMode('RESIGN_MATE')}
                className={`py-1.5 rounded transition-colors ${
                  activeMode === 'RESIGN_MATE' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🔍 {t('studio.tabs.resign_mate')}
              </button>
            </div>
          )}

          {/* Mobile Mode Sub-Tabs: Training (Menu button + 4 modes) */}
          {mobileActiveTab === 'practice' && !isTrainingMenuOpen && (
            <div className="lg:hidden flex items-center p-1 bg-slate-950 border-b border-slate-800 gap-1 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setIsTrainingMenuOpen(true)}
                className="px-2 py-1.5 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-amber-300 shrink-0"
                title={t('studio.mobile.training_menu.title')}
              >
                ← {t('studio.mobile.training_menu.back_to_menu')}
              </button>
              <div className="grid grid-cols-4 flex-1 gap-1">
                <button
                  type="button"
                  onClick={() => setActiveMode('AI_MATCH')}
                  className={`py-1.5 rounded transition-colors ${
                    activeMode === 'AI_MATCH' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ⚔️ {t('studio.tabs.ai_match')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveMode('QUIZ');
                    setMobileActiveTab('board');
                  }}
                  className={`py-1.5 rounded transition-colors ${
                    activeMode === 'QUIZ' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  🎯 {t('studio.tabs.quiz')}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('TSUMEGO')}
                  className={`py-1.5 rounded transition-colors ${
                    activeMode === 'TSUMEGO' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  👑 {t('studio.tabs.tsumego')}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('SHOGI_TRACE')}
                  className={`py-1.5 rounded transition-colors ${
                    activeMode === 'SHOGI_TRACE' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ✍️ {t('studio.tabs.trace')}
                </button>
              </div>
            </div>
          )}

          {/* Mode Body Panel */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {/* Mobile Training Menu Screen */}
            {mobileActiveTab === 'practice' && isTrainingMenuOpen ? (
              <div className="lg:hidden space-y-3">
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-amber-300 flex items-center gap-2">
                    <span>🔥</span>
                    <span>{t('studio.mobile.training_menu.title')}</span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    {t('studio.mobile.training_menu.subtitle')}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsTrainingMenuOpen(false);
                      setActiveMode('AI_MATCH');
                    }}
                    className="w-full text-left p-3.5 rounded-xl bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/50 transition space-y-1"
                  >
                    <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>⚔️</span>
                      <span>{t('studio.tabs.ai_match')}</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {t('studio.mobile.training_menu.match_desc')}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsTrainingMenuOpen(false);
                      setActiveMode('QUIZ');
                      setMobileActiveTab('board');
                    }}
                    className="w-full text-left p-3.5 rounded-xl bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/50 transition space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                        <span>🎯</span>
                        <span>{t('studio.tabs.quiz')}</span>
                      </div>
                      {quizPoolCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          {quizPoolCount}問
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {t('studio.mobile.training_menu.quiz_desc')}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsTrainingMenuOpen(false);
                      setActiveMode('TSUMEGO');
                    }}
                    className="w-full text-left p-3.5 rounded-xl bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/50 transition space-y-1"
                  >
                    <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>👑</span>
                      <span>{t('studio.tabs.tsumego')}</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {t('studio.mobile.training_menu.tsumego_desc')}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsTrainingMenuOpen(false);
                      setActiveMode('SHOGI_TRACE');
                    }}
                    className="w-full text-left p-3.5 rounded-xl bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/50 transition space-y-1"
                  >
                    <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <span>✍️</span>
                      <span>{t('studio.tabs.trace')}</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {t('studio.mobile.training_menu.trace_desc')}
                    </p>
                  </button>
                </div>
              </div>
            ) : (
            <>
            {/* Current Position Summary (Shown for study, trace, and resign mate modes; Quiz and Tsumego modes render their own specialized headers) */}
            {activeMode !== 'QUIZ' && activeMode !== 'TSUMEGO' && (
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs space-y-1.5">
                <div className="text-amber-400 font-bold flex justify-between">
                  <span>{t('studio.position_summary.ply', { ply: currentPly })}</span>
                  <span>
                    {t('studio.position_summary.turn_label', {
                      turn: player.shogi.turn === 0 ? t('studio.position_summary.turn_sente') : t('studio.position_summary.turn_gote'),
                    })}
                  </span>
                </div>
                <div className="text-slate-300">
                  {t('studio.position_summary.last_move', {
                    move:
                      (currentPly <= player.getMaxTesuu()
                        ? player.getReadableKifu(currentPly)
                        : '') || t('studio.position_summary.start_pos'),
                  })}
                </div>
              </div>
            )}

            {/* Mode 1: Study / Free Exploration */}
            {activeMode === 'STUDY' && (
              <div className="space-y-4">
                {/* Wasm AI Live Evaluation Panel */}
                <StudioAiEvalPanel
                  status={engine.status}
                  isReady={engine.isReady}
                  isSearching={engine.isSearching}
                  activeEngineId={engine.activeEngineId}
                  availableEngines={engine.availableEngines}
                  onSwitchEngine={engine.switchEngine}
                  evaluation={
                    evalSourceView === 'local'
                      ? (localEvalHistory.get(currentPly) ??
                          (engine.candidatesSfen === currentSfen ? engine.evaluation : null))
                      : (evalHistory.get(currentPly) ??
                          localEvalHistory.get(currentPly) ??
                          (engine.candidatesSfen === currentSfen ? engine.evaluation : null))
                  }
                  candidates={
                    localEvalHistory.get(currentPly)?.candidates ??
                    (engine.candidatesSfen === currentSfen ? engine.candidates : [])
                  }
                  multiPv={studyMultiPv}
                  onMultiPvChange={(nextPv) => {
                    setStudyMultiPv(nextPv);
                    if (engine.isReady) {
                      engine.setOption('MultiPV', nextPv);
                      if (!isPositionEditMode && !batchProgress) {
                        const sfen = player.shogi.toSFENString();
                        engine
                          .searchPosition(sfen, undefined, { depth: 10, movetime: 900 })
                          .then((res) => {
                            if (res.evaluation) {
                              const evalObj = res.evaluation;
                              setLocalEvalHistory((prev) => {
                                const next = new Map(prev);
                                next.set(currentPly, evalObj);
                                return next;
                              });
                            }
                          })
                          .catch((err) => {
                            console.warn('MultiPV switch search error:', err);
                          });
                      }
                    }
                  }}
                  currentInfo={
                    engine.candidatesSfen === currentSfen ? engine.currentInfo : null
                  }
                  evalHistory={evalHistory}
                  localEvalHistory={localEvalHistory}
                  evalSourceView={evalSourceView}
                  onChangeEvalSourceView={setEvalSourceView}
                  currentPly={currentPly}
                  totalPlies={totalPlies}
                  currentTurn={player.shogi.turn}
                  shogiInstance={player.shogi}
                  onAnalyzeCurrent={handleAnalyzeCurrentPosition}
                  onBatchAnalyzeGame={handleBatchAnalyzeGame}
                  batchProgress={batchProgress}
                  onSelectPly={goToPly}
                  onPlayRecommendedMove={handlePlayRecommendedMove}
                  onOpenMatchReview={() => setIsReviewModalOpen(true)}
                />

                {/* Spot Cloud Analysis Card (#62) */}
                {user?.uid && (
                  <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-300 flex items-center gap-1.5">
                        <span>☁️</span>
                        <span>{t('studio.cloud_spot.title', 'スポットクラウド解析 (深層AI)')}</span>
                      </span>
                      {activeSpotPosition && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono">
                          {activeSpotPosition.status}
                        </span>
                      )}
                    </div>
                    {activeSpotPosition?.status === 'completed' && activeSpotPosition.result ? (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-mono text-emerald-300">
                          {t('studio.cloud_spot.eval_score', {
                            score: activeSpotPosition.result.scoreCp > 0 ? `+${activeSpotPosition.result.scoreCp}` : activeSpotPosition.result.scoreCp,
                            depth: activeSpotPosition.result.depth,
                          })}
                        </div>
                        {activeSpotPosition.result.candidates?.slice(0, 3).map((c) => (
                          <button
                            key={`spot-cand-${c.multipv}`}
                            type="button"
                            onClick={() => handlePlayRecommendedMove(c.usi)}
                            className="w-full text-left px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-between text-[11px]"
                          >
                            <span className="font-bold text-slate-200">
                              {c.multipv}. {formatUsiToJapanese(c.usi, player.shogi.turn, player.shogi)}
                            </span>
                            <span className="font-mono text-amber-300">
                              {c.scoreCp > 0 ? `+${c.scoreCp}` : c.scoreCp} cp
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : activeSpotPosition ? (
                      <p className="text-[11px] text-slate-400">
                        {t('studio.cloud_spot.queued', 'クラウド解析キューに登録済みです（次回バッチで解析されます）。')}
                      </p>
                    ) : (
                      <button
                        type="button"
                        disabled={isQueuingSpot}
                        onClick={() => void handleQueueSpotAnalysis('position')}
                        className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-amber-300 font-semibold text-xs transition"
                      >
                        {t('studio.cloud_spot.queue_btn', '☁️ この局面をクラウドで精密解析を予約')}
                      </button>
                    )}
                  </div>
                )}

                {/* Position Note & Thoughts (コメント・読み筋メモ) */}
                <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-300 flex items-center gap-1.5">
                      <span>📝</span>
                      <span>{t('studio.comment.title')}</span>
                    </span>
                    {!isCommentEditing && (
                      <button
                        type="button"
                        onClick={() => setIsCommentEditing(true)}
                        className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold transition"
                      >
                        {commentDraft ? t('common.edit', '編集') : `＋ ${t('studio.comment.add_note', 'メモを追加')}`}
                      </button>
                    )}
                  </div>

                  {isCommentEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        placeholder={t('studio.comment.placeholder')}
                        rows={3}
                        className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded p-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none resize-none font-sans"
                        autoFocus
                      />
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const comments = player.getComments(currentPly);
                            setCommentDraft(comments ? comments.join('\n') : '');
                            setIsCommentEditing(false);
                          }}
                          className="px-2.5 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveComment(commentDraft)}
                          className="px-3 py-1 text-[11px] rounded bg-amber-600 hover:bg-amber-500 font-bold text-slate-950 transition shadow"
                        >
                          {t('common.save')}
                        </button>
                      </div>
                    </div>
                  ) : commentDraft ? (
                    <div
                      onClick={() => setIsCommentEditing(true)}
                      className="p-2 rounded bg-slate-900/60 border border-slate-800 text-slate-200 whitespace-pre-wrap leading-relaxed cursor-pointer hover:border-slate-700 transition"
                      title={t('studio.comment.click_to_edit', 'クリックして編集')}
                    >
                      {commentDraft}
                    </div>
                  ) : (
                    <div
                      onClick={() => setIsCommentEditing(true)}
                      className="py-3 text-center text-slate-500 border border-dashed border-slate-800 rounded cursor-pointer hover:border-slate-700 hover:text-slate-400 transition"
                    >
                      {t('studio.comment.empty_hint')}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-400">{t('studio.study.title')}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {t('studio.study.desc')}
                  </p>
                  <div className="p-3 bg-amber-950/20 rounded border border-amber-500/20 text-xs text-amber-200/90">
                    {t('studio.study.hint')}
                  </div>
                </div>
              </div>
            )}

            {/* Mode 2: Shogi Trace Drill (プロ手順なぞり) */}
            {activeMode === 'SHOGI_TRACE' && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400">{t('studio.trace.title')}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t('studio.trace.desc')}
                </p>

                {!isTraceActive ? (
                  <>
                {/* Target Kifu Selection via Library Modal */}
                <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-400">{t('studio.trace.target_game', '対象棋譜')}</span>
                    <span className="text-[11px] font-mono text-amber-300">
                      {t('studio.match.plies_count', '{{count}} 手', { count: totalPlies })}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-slate-200 truncate">
                    {player.kifu.header['棋戦'] ||
                      player.kifu.header['戦型'] ||
                      t('studio.free_study')}
                  </div>
                  <div className="text-[11px] text-amber-200/90 font-semibold truncate">
                    ▲ {senteName} vs △ {goteName}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/library?returnTo=trace')}
                    className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition flex items-center justify-center gap-1.5"
                  >
                    <span>📚</span>
                    <span>{t('studio.library_modal.tab_library', '棋譜ライブラリから選ぶ')}</span>
                  </button>
                </div>

                {/* Start Position Selection: Initial / Custom Ply / Random */}
                <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs">
                  <div className="text-[11px] font-semibold text-slate-400">{t('studio.trace.start_pos_heading', '開始位置')}</div>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => setTraceStartMode('initial')}
                      className={`py-1.5 rounded font-bold border transition text-[11px] ${
                        traceStartMode === 'initial'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t('studio.trace.start_mode_initial', '初期 (0手)')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTraceStartMode('custom');
                        setTraceCustomPly(currentPly);
                      }}
                      className={`py-1.5 rounded font-bold border transition text-[11px] ${
                        traceStartMode === 'custom'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t('studio.trace.start_mode_custom', '手数指定')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTraceStartMode('random')}
                      className={`py-1.5 rounded font-bold border transition text-[11px] ${
                        traceStartMode === 'random'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t('studio.trace.start_mode_random', 'ランダム')}
                    </button>
                  </div>

                  {traceStartMode === 'custom' && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="number"
                        min={0}
                        max={Math.max(0, totalPlies - 1)}
                        value={traceCustomPly}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setTraceCustomPly(
                            Number.isFinite(v)
                              ? Math.max(0, Math.min(Math.max(0, totalPlies - 1), Math.floor(v)))
                              : 0
                          );
                        }}
                        className="w-20 rounded bg-slate-900 border border-slate-700 px-2 py-1 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
                      />
                      <span className="text-[11px] text-slate-400">
                        {t('studio.trace.custom_start_ply_label', {
                          defaultValue: '手目から開始（最大 {{max}}）',
                          max: Math.max(0, totalPlies - 1),
                        })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Play Side Selection: Both / Sente only / Gote only (Pseudo-match) */}
                <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs">
                  <div className="text-[11px] font-semibold text-slate-400">{t('studio.trace.side_mode_heading', '担当手番')}</div>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => setTraceSideMode('both')}
                      className={`py-1.5 rounded font-bold border transition text-[11px] ${
                        traceSideMode === 'both'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t('studio.trace.side_mode_both', '両方指す')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTraceSideMode('sente')}
                      className={`py-1.5 rounded font-bold border transition text-[11px] ${
                        traceSideMode === 'sente'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t('studio.trace.side_mode_sente', '▲ 先手番')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTraceSideMode('gote')}
                      className={`py-1.5 rounded font-bold border transition text-[11px] ${
                        traceSideMode === 'gote'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t('studio.trace.side_mode_gote', '△ 後手番')}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const maxStart = Math.max(0, totalPlies - 1);
                    const targetPly =
                      traceStartMode === 'initial'
                        ? 0
                        : traceStartMode === 'random'
                        ? Math.floor(Math.random() * (maxStart + 1))
                        : Math.max(0, Math.min(maxStart, traceCustomPly));
                    if (traceSideMode === 'gote') setIsFlipped(true);
                    else if (traceSideMode === 'sente') setIsFlipped(false);
                    setTraceStats({ exact: 0, near: 0, aiBest: 0, wrong: 0, skipped: 0 });
                    setTraceMistakes(0);
                    setTraceUsedHint(false);
                    setTraceAiBestRecordedPly(null);
                    setTraceStartPlyActual(targetPly);
                    setIsTraceActive(true);
                    goToPly(targetPly);
                    setTraceFeedback(null);
                    setMobileActiveTab('board');
                  }}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:brightness-110 rounded-lg text-xs font-bold text-slate-950 shadow transition flex items-center justify-center gap-1.5"
                >
                  <span>✍️</span>
                  <span>{t('studio.trace.start_btn', 'なぞりを開始')}</span>
                </button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 rounded-xl bg-slate-950/70 border border-amber-500/40 space-y-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-amber-300 flex items-center gap-1.5">
                          <span className="animate-pulse">●</span>
                          <span>{t('studio.trace.in_progress', 'なぞり特訓中')}</span>
                        </span>
                        <span className="font-mono text-slate-300">
                          {currentPly} / {totalPlies} 手
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 pt-1 text-center font-mono text-[11px]">
                        <div className="p-1.5 rounded bg-emerald-950/50 border border-emerald-500/30">
                          <div className="text-[10px] text-emerald-300/80">{t('studio.trace.stat_exact', '正解')}</div>
                          <div className="font-bold text-emerald-300">{traceStats.exact}</div>
                        </div>
                        <div className="p-1.5 rounded bg-amber-950/50 border border-amber-500/30">
                          <div className="text-[10px] text-amber-300/80">{t('studio.trace.stat_near', '準正解')}</div>
                          <div className="font-bold text-amber-300">{traceStats.near}</div>
                        </div>
                        <div className="p-1.5 rounded bg-rose-950/50 border border-rose-500/30">
                          <div className="text-[10px] text-rose-300/80">{t('studio.trace.stat_wrong', '不正解')}</div>
                          <div className="font-bold text-rose-300">{traceStats.wrong}</div>
                        </div>
                        <div className="p-1.5 rounded bg-slate-900 border border-slate-700">
                          <div className="text-[10px] text-slate-400">{t('studio.trace.stat_skipped', 'スキップ')}</div>
                          <div className="font-bold text-slate-300">{traceStats.skipped}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const next = player.getMove(currentPly + 1);
                            if (next) {
                              setTraceUsedHint(true);
                              const pieceLabel = PIECE_KIND_LABEL[next.piece] || next.piece;
                              setTraceFeedback(t('studio.trace.hint_msg', { piece: pieceLabel }));
                            }
                          }}
                          className="py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-semibold text-xs transition"
                        >
                          {t('studio.trace.hint_btn')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (currentPly >= totalPlies) return;
                            setTraceStats((prev) => ({ ...prev, skipped: prev.skipped + 1 }));
                            setTraceMistakes(0);
                            setTraceUsedHint(false);
                            goToPly(currentPly + 1);
                            setTraceFeedback(t('studio.trace.skipped_feedback', '⏭️ スキップして次の手へ進みました'));
                          }}
                          className="py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-semibold text-xs transition"
                        >
                          {t('studio.trace.skip_btn', '⏭️ スキップ')}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const title =
                            player.kifu.header['棋戦'] ||
                            (senteName && goteName ? `${senteName} vs ${goteName}` : t('studio.free_study'));
                          saveTraceSession({
                            id: `trace-${Date.now()}`,
                            gameId: activeGameId,
                            gameTitle: title,
                            sideMode: traceSideMode,
                            startPly: traceStartPlyActual,
                            endPly: currentPly,
                            stats: traceStats,
                            playedAt: new Date().toISOString(),
                          });
                          trackEvent('trace_complete');
                          setTraceSummaryModal({
                            stats: traceStats,
                            title,
                            pliesCovered: Math.max(0, currentPly - traceStartPlyActual),
                          });
                          setIsTraceActive(false);
                          setTraceFeedback(null);
                        }}
                        className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition"
                      >
                        {t('studio.trace.end_btn', '⏹️ なぞりを終了（結果を見る）')}
                      </button>
                    </div>

                    {traceFeedback && (
                      <div
                        className={`p-3 rounded border text-xs font-bold transition-all ${
                          traceFeedback.includes('正解') || traceFeedback.includes('Correct')
                            ? 'bg-emerald-950/50 border-emerald-500 text-emerald-200'
                            : traceFeedback.includes('ヒント') || traceFeedback.includes('Hint')
                            ? 'bg-amber-950/50 border-amber-500 text-amber-200'
                            : traceFeedback.includes('スキップ')
                            ? 'bg-slate-900 border-slate-700 text-slate-300'
                            : 'bg-red-950/50 border-red-500 text-red-200'
                        }`}
                      >
                        {traceFeedback}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Mode 3: AI Match / Sparring */}
            {activeMode === 'AI_MATCH' && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <span>⚔️</span>
                    <span>{t('studio.match.title')}</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {t('studio.match.subtitle')}
                  </p>
                </div>

                {!isMatchActive ? (
                  /* Match Configuration Setup */
                  <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3 text-xs">
                    {/* Origin Switch: New Hirate vs Resume Study */}
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setMatchStartOrigin('new')}
                          className={`py-1.5 rounded font-bold border transition ${
                            matchStartOrigin === 'new'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {t('studio.match.tab_new_game')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setMatchStartOrigin('resume')}
                          className={`py-1.5 rounded font-bold border transition ${
                            matchStartOrigin === 'resume'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {t('studio.match.tab_resume_game')}
                        </button>
                      </div>
                    </div>

                    {/* Participant Selection: Sente & Gote */}
                    <div className="space-y-2 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                      {/* Sente Player Selection */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-amber-300 flex items-center justify-between">
                          <span>{t('studio.match.sente_player_select')}</span>
                          <span className="text-[10px] text-slate-500 font-normal">{t('studio.match.player_sente', '先手番')}</span>
                        </label>
                        <select
                          value={matchSentePlayer}
                          onChange={(e) => setMatchSentePlayer(e.target.value as 'human' | EngineId)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-amber-300 font-semibold focus:outline-none focus:border-amber-500 cursor-pointer"
                        >
                          <option value="human">👤 {t('studio.match.player_human')}</option>
                          {engine.availableEngines.map((eng) => (
                            <option key={`sente-${eng.id}`} value={eng.id}>
                              🤖 {resolveEngineDisplayName(eng, t)}
                            </option>
                          ))}
                        </select>
                        {matchSentePlayer === 'human' && (
                          <div className="space-y-1">
                            <input
                              list="my-users-sente-list"
                              type="text"
                              placeholder={t('studio.match.custom_player_name_placeholder')}
                              value={customSenteName}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCustomSenteName(val);
                                try {
                                   localStorage.setItem('joseki_custom_sente_name', val);
                                } catch {
                                  // Ignore storage error
                                }
                              }}
                              className="w-full bg-slate-950/80 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                            />
                            <datalist id="my-users-sente-list">
                              {loadPlayerProfiles()
                                .filter((p) => p.category === 'user')
                                .map((p) => (
                                  <option key={`sente-dl-${p.id}`} value={p.name}>
                                    {p.title ? `${p.name} (${p.title})` : p.name}
                                  </option>
                                ))}
                            </datalist>
                          </div>
                        )}
                      </div>

                      {/* Gote Player Selection */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-blue-300 flex items-center justify-between">
                          <span>{t('studio.match.gote_player_select')}</span>
                          <span className="text-[10px] text-slate-500 font-normal">{t('studio.match.player_gote', '後手番')}</span>
                        </label>
                        <select
                          value={matchGotePlayer}
                          onChange={(e) => setMatchGotePlayer(e.target.value as 'human' | EngineId)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-blue-300 font-semibold focus:outline-none focus:border-blue-500 cursor-pointer"
                        >
                          <option value="human">👤 {t('studio.match.player_human')}</option>
                          {engine.availableEngines.map((eng) => (
                            <option key={`gote-${eng.id}`} value={eng.id}>
                              🤖 {resolveEngineDisplayName(eng, t)}
                            </option>
                          ))}
                        </select>
                        {matchGotePlayer === 'human' && (
                          <div className="space-y-1">
                            <input
                              list="my-users-gote-list"
                              type="text"
                              placeholder={t('studio.match.custom_player_name_placeholder')}
                              value={customGoteName}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCustomGoteName(val);
                                try {
                                  localStorage.setItem('joseki_custom_gote_name', val);
                                } catch {
                                  // Ignore storage error
                                }
                              }}
                              className="w-full bg-slate-950/80 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                            />
                            <datalist id="my-users-gote-list">
                              {loadPlayerProfiles()
                                .filter((p) => p.category === 'user')
                                .map((p) => (
                                  <option key={`gote-dl-${p.id}`} value={p.name}>
                                    {p.title ? `${p.name} (${p.title})` : p.name}
                                  </option>
                                ))}
                            </datalist>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Preset Time Control Selection */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                        <span>⏱️ {t('studio.match.time_control_preset_label')}</span>
                        <span className="text-[10px] text-amber-400 font-mono">
                          {baseTimeMin === 0 && byoyomiSec === 0
                            ? t('studio.match.time_unlimited', '無制限')
                            : `${baseTimeMin}分 / 秒読み${byoyomiSec}秒`}
                        </span>
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { label: t('studio.match.clock_preset_wars_10m', '10分切れ負け'), min: 10, byo: 0, fischer: 0 },
                          { label: t('studio.match.clock_preset_wars_3m', '3分切れ負け'), min: 3, byo: 0, fischer: 0 },
                          { label: t('studio.match.clock_preset_byoyomi_10m_30s', '10分+30秒'), min: 10, byo: 30, fischer: 0 },
                          { label: t('studio.match.clock_preset_unlimited', '無制限 (検討)'), min: 0, byo: 0, fischer: 0 },
                        ].map((preset) => {
                          const isActive = baseTimeMin === preset.min && byoyomiSec === preset.byo && fischerSec === preset.fischer && !isHandicapTime;
                          return (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => {
                                setIsHandicapTime(false);
                                setBaseTimeMin(preset.min);
                                setByoyomiSec(preset.byo);
                                setFischerSec(preset.fischer);
                              }}
                              className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border transition text-left flex items-center justify-between ${
                                isActive
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              <span>{preset.label}</span>
                              {isActive && <span className="text-[10px] text-amber-400">✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* AI Think Time */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-400">
                        {t('studio.match.ai_strength')}
                      </label>
                      <select
                        value={matchAiThinkTime}
                        onChange={(e) => setMatchAiThinkTime(Number(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
                      >
                        <option value={500}>{t('studio.match.strength_05s')}</option>
                        <option value={1000}>{t('studio.match.strength_1s')}</option>
                        <option value={3000}>{t('studio.match.strength_3s')}</option>
                        <option value={5000}>{t('studio.match.strength_5s')}</option>
                        <option value={10000}>{t('studio.match.strength_10s')}</option>
                      </select>
                    </div>

                    {/* Separate Handicap Checkbox */}
                    <label className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer hover:bg-slate-800/80 transition">
                      <input
                        type="checkbox"
                        checked={isHandicapTime}
                        onChange={(e) => setIsHandicapTime(e.target.checked)}
                        className="rounded border-slate-700 text-amber-500 focus:ring-amber-400 focus:ring-offset-slate-950"
                      />
                      <span className="text-[11px] font-semibold text-slate-300">
                        ⚖️ {t('studio.match.handicap_time_setting')}
                      </span>
                    </label>

                    {/* Composite Time Controls */}
                    {/* 1. Sente (or Shared) Base Time */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-amber-300">
                        {isHandicapTime ? t('studio.match.sente_time_header') : t('studio.match.base_time_label')}
                      </label>
                      <div className="grid grid-cols-4 gap-1">
                        {[
                          { min: 0, label: t('studio.match.time_unlimited') },
                          { min: 3, label: t('studio.match.time_3m') },
                          { min: 5, label: t('studio.match.time_5m') },
                          { min: 10, label: t('studio.match.time_10m') },
                        ].map((opt) => (
                          <button
                            key={`sente-base-${opt.min}`}
                            type="button"
                            onClick={() => {
                              setBaseTimeMin(opt.min);
                              if (opt.min === 0) {
                                setByoyomiSec(0);
                                setFischerSec(0);
                              }
                            }}
                            className={`py-1 rounded text-[11px] font-bold border transition ${
                              baseTimeMin === opt.min
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>

                      {/* Byoyomi & Fischer for Sente */}
                      {baseTimeMin > 0 && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400">{t('studio.match.byoyomi_label')}</span>
                            <div className="grid grid-cols-3 gap-0.5">
                              {[0, 10, 30].map((s) => (
                                <button
                                  key={`sente-byo-${s}`}
                                  type="button"
                                  onClick={() => setByoyomiSec(s)}
                                  className={`py-0.5 text-[10px] rounded font-bold border ${
                                    byoyomiSec === s
                                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                                      : 'bg-slate-900 text-slate-400 border-slate-800'
                                  }`}
                                >
                                  {s === 0 ? '無' : `${s}s`}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] text-slate-400">{t('studio.match.fischer_label')}</span>
                            <div className="grid grid-cols-3 gap-0.5">
                              {[0, 5, 10].map((s) => (
                                <button
                                  key={`sente-fisch-${s}`}
                                  type="button"
                                  onClick={() => setFischerSec(s)}
                                  className={`py-0.5 text-[10px] rounded font-bold border ${
                                    fischerSec === s
                                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                                      : 'bg-slate-900 text-slate-400 border-slate-800'
                                  }`}
                                >
                                  {s === 0 ? '無' : `+${s}s`}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Dedicated Gote Time Control (when handicap enabled) */}
                    {isHandicapTime && (
                      <div className="space-y-1.5 pt-1 border-t border-slate-800">
                        <label className="text-[11px] font-semibold text-blue-300">
                          {t('studio.match.gote_time_header')}
                        </label>
                        <div className="grid grid-cols-4 gap-1">
                          {[
                            { min: 0, label: t('studio.match.time_unlimited') },
                            { min: 3, label: t('studio.match.time_3m') },
                            { min: 5, label: t('studio.match.time_5m') },
                            { min: 10, label: t('studio.match.time_10m') },
                          ].map((opt) => (
                            <button
                              key={`gote-base-${opt.min}`}
                              type="button"
                              onClick={() => {
                                setGoteBaseTimeMin(opt.min);
                                if (opt.min === 0) {
                                  setGoteByoyomiSec(0);
                                  setGoteFischerSec(0);
                                }
                              }}
                              className={`py-1 rounded text-[11px] font-bold border transition ${
                                goteBaseTimeMin === opt.min
                                  ? 'bg-blue-500 text-slate-950 border-blue-400'
                                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>

                        {goteBaseTimeMin > 0 && (
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-400">{t('studio.match.byoyomi_label')}</span>
                              <div className="grid grid-cols-3 gap-0.5">
                                {[0, 10, 30].map((s) => (
                                  <button
                                    key={`gote-byo-${s}`}
                                    type="button"
                                    onClick={() => setGoteByoyomiSec(s)}
                                    className={`py-0.5 text-[10px] rounded font-bold border ${
                                      goteByoyomiSec === s
                                        ? 'bg-blue-500 text-slate-950 border-blue-400'
                                        : 'bg-slate-900 text-slate-400 border-slate-800'
                                    }`}
                                  >
                                    {s === 0 ? '無' : `${s}s`}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-400">{t('studio.match.fischer_label')}</span>
                              <div className="grid grid-cols-3 gap-0.5">
                                {[0, 5, 10].map((s) => (
                                  <button
                                    key={`gote-fisch-${s}`}
                                    type="button"
                                    onClick={() => setGoteFischerSec(s)}
                                    className={`py-0.5 text-[10px] rounded font-bold border ${
                                      goteFischerSec === s
                                        ? 'bg-blue-500 text-slate-950 border-blue-400'
                                        : 'bg-slate-900 text-slate-400 border-slate-800'
                                    }`}
                                  >
                                    {s === 0 ? '無' : `+${s}s`}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Clock Switch Mode: Auto vs Manual (90-deg physical clock simulation) */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-400">
                        {t('studio.match.clock_switch_mode')}
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setClockSwitchMode('auto')}
                          className={`py-1.5 rounded font-bold border transition ${
                            clockSwitchMode === 'auto'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {t('studio.match.clock_switch_auto')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setClockSwitchMode('manual')}
                          className={`py-1.5 rounded font-bold border transition ${
                            clockSwitchMode === 'manual'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {t('studio.match.clock_switch_manual')}
                        </button>
                      </div>
                    </div>

                    {/* Hint Limit Selection */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-400">
                        {t('studio.match.hint_limit_label')}
                      </label>
                      <div className="grid grid-cols-5 gap-1">
                        {[0, 1, 3, 5, 999].map((limitVal) => (
                          <button
                            key={limitVal}
                            type="button"
                            onClick={() => setHintLimit(limitVal)}
                            className={`py-1 rounded text-[11px] font-bold border transition ${
                              hintLimit === limitVal
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {limitVal === 999 ? '∞' : `${limitVal}回`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Checkboxes: Zen Mode & Live Eval Bar */}
                    <div className="space-y-1.5 pt-1">
                      <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer hover:bg-slate-800/80 transition">
                        <input
                          type="checkbox"
                          checked={startWithZenMode}
                          onChange={(e) => setStartWithZenMode(e.target.checked)}
                          className="rounded border-slate-700 text-amber-500 focus:ring-amber-400 focus:ring-offset-slate-950"
                        />
                        <span className="text-xs font-semibold text-amber-200">
                          {t('studio.match.start_with_zen_mode')}
                        </span>
                      </label>

                      <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer hover:bg-slate-800/80 transition">
                        <input
                          type="checkbox"
                          checked={showLiveEvalBar}
                          onChange={(e) => setShowLiveEvalBar(e.target.checked)}
                          className="rounded border-slate-700 text-amber-500 focus:ring-amber-400 focus:ring-offset-slate-950"
                        />
                        <span className="text-xs font-semibold text-slate-300">
                          📊 {t('studio.match.show_eval_bar_setting')}
                        </span>
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleStartMatch(matchStartOrigin)}
                      className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:brightness-110 rounded-lg text-xs font-bold text-slate-950 shadow transition flex items-center justify-center gap-1.5 mt-2"
                    >
                      <span>⚔️</span>
                      <span>
                        {matchStartOrigin === 'new'
                          ? t('studio.match.start_new')
                          : t('studio.match.start_from_current', { ply: currentPly })}
                      </span>
                    </button>
                  </div>
                ) : (
                  /* Active Match Session HUD */
                  <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3 text-xs">
                    {/* Status Banner */}
                    <div className={`p-2.5 rounded-lg border text-center font-bold ${
                      matchResult === 'win' || matchResult === 'timeout_win'
                        ? 'bg-emerald-950/50 border-emerald-500 text-emerald-200'
                        : matchResult === 'loss' || matchResult === 'timeout_loss'
                        ? 'bg-red-950/50 border-red-500 text-red-200'
                        : player.shogi.turn === matchPlayerSide
                        ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                        : 'bg-slate-900 border-slate-700 text-slate-300'
                    }`}>
                      {matchResult === 'win' ? (
                        <span>{t('studio.match.game_over_win')}</span>
                      ) : matchResult === 'loss' ? (
                        <span>{t('studio.match.game_over_lose')}</span>
                      ) : matchResult === 'timeout_win' ? (
                        <span>{t('studio.match.game_over_timeout_win')}</span>
                      ) : matchResult === 'timeout_loss' ? (
                        <span>{t('studio.match.game_over_timeout_loss')}</span>
                      ) : player.shogi.turn === matchPlayerSide ? (
                        <span className="flex items-center justify-center gap-1.5">
                          <span className="animate-pulse">●</span>
                          <span>{t('studio.match.your_turn')}</span>
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1.5 text-slate-400">
                          <span className="animate-spin">⏳</span>
                          <span>{t('studio.match.ai_thinking')}</span>
                        </span>
                      )}
                    </div>

                    {/* Live Match Clock (if not unlimited) */}
                    {baseTimeMin > 0 && (
                      <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5 font-mono text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-amber-300 font-semibold">{senteName} (▲)</span>
                          <span className="font-bold text-slate-100">
                            {senteRemainingSec > 0
                              ? `${Math.floor(senteRemainingSec / 60)}:${(senteRemainingSec % 60).toString().padStart(2, '0')}`
                              : `${senteByoyomiRemaining}秒`}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-blue-300 font-semibold">{goteName} (△)</span>
                          <span className="font-bold text-slate-100">
                            {goteRemainingSec > 0
                              ? `${Math.floor(goteRemainingSec / 60)}:${(goteRemainingSec % 60).toString().padStart(2, '0')}`
                              : `${goteByoyomiRemaining}秒`}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Hint Controls */}
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-400">
                          {t('studio.match.hint_btn')}
                        </span>
                        <span className="text-[10px] text-amber-400 font-mono">
                          {hintLimit === 999
                            ? t('studio.match.hint_unlimited')
                            : t('studio.match.hint_remaining', { count: Math.max(0, hintLimit - hintsUsedCount) })}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={handleRequestMatchHint}
                        disabled={
                          matchResult !== null ||
                          player.shogi.turn !== matchPlayerSide ||
                          engine.isSearching ||
                          (hintLimit < 999 && hintsUsedCount >= hintLimit)
                        }
                        className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 rounded text-xs font-bold text-amber-300 transition flex items-center justify-center gap-1.5 shadow"
                      >
                        <span>💡</span>
                        <span>
                          {hintLimit < 999 && hintsUsedCount >= hintLimit
                            ? t('studio.match.hint_exhausted')
                            : t('studio.match.hint_btn')}
                        </span>
                      </button>

                      {/* Revealed Hint Message */}
                      {activeHintMove && (
                        <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs text-center font-bold">
                          {t('studio.match.hint_used_log', {
                            defaultValue: `AI推奨手: ${activeHintMove}`,
                            move: activeHintMove,
                          })}
                        </div>
                      )}
                    </div>

                    {/* Position Notes during match */}
                    <div className="p-2.5 bg-slate-900/60 border border-slate-800 rounded-lg space-y-1.5">
                      <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                        <span>📝</span>
                        <span>{t('studio.comment.title')}</span>
                      </span>
                      {commentDraft ? (
                        <div className="text-[11px] text-slate-300 leading-relaxed bg-slate-950 p-2 rounded border border-slate-800/80">
                          {commentDraft}
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-500 italic">
                          {t('studio.comment.empty_hint')}
                        </div>
                      )}
                    </div>

                    {/* Actions: Zen Mode, Resign or Exit */}
                    <div className="space-y-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsZenMode(true)}
                        className="w-full py-2 bg-gradient-to-r from-indigo-900/60 to-purple-900/60 hover:from-indigo-800/70 hover:to-purple-800/70 border border-indigo-500/40 rounded-lg text-indigo-200 font-bold text-xs transition shadow flex items-center justify-center gap-1.5"
                      >
                        <span>🧘</span>
                        <span>{t('studio.match.zen_mode_btn')}</span>
                      </button>

                      <div className="flex gap-2">
                        {matchResult === null ? (
                          <>
                            <button
                              type="button"
                              onClick={handleSuspendMatch}
                              className="flex-1 py-1.5 bg-slate-800 hover:bg-amber-950/40 border border-slate-700 hover:border-amber-500/50 rounded text-slate-200 hover:text-amber-300 text-xs font-semibold transition"
                              title={t('studio.match.suspend_btn', '対局を中断してライブラリに保存')}
                            >
                              {t('studio.match.suspend_btn')}
                            </button>
                            <button
                              type="button"
                              onClick={handleResignMatch}
                              className="flex-1 py-1.5 bg-slate-800 hover:bg-rose-950/50 border border-slate-700 hover:border-rose-500/50 rounded text-slate-300 hover:text-rose-200 text-xs font-semibold transition"
                            >
                              {t('studio.match.resign_btn')}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={handleExitMatch}
                            className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-amber-300 text-xs font-bold transition"
                          >
                            {t('studio.match.end_match_btn')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Mode 4: Tactical Quiz Mode */}
            {activeMode === 'QUIZ' && (
              <StudioInlineQuizPanel
                card={currentQuizCard}
                cardIndex={activeQuizIndex}
                totalCards={quizPool.length}
                engine={engine}
                savedGames={loadSavedStudioGames()}
                shogiInstance={player.shogi}
                verdict={quizVerdict}
                evalLossCp={quizEvalLossCp}
                lastPlayedMove={quizLastPlayedMove}
                isAnswerRevealed={isAnswerRevealed}
                isDeepThinking={isQuizDeepThinking}
                onPickChoice={(usi) => executeQuizAttempt(usi)}
                onRequestHint={() => {
                  // Hint only reveals 3 choices in the panel, no board square highlight spoilers
                }}
                onRevealAnswer={() => {
                  setIsAnswerRevealed(true);
                  if (currentQuizCard) {
                    executeQuizAttempt(currentQuizCard.bestMove);
                  }
                }}
                onNextCard={handleNextQuizCard}
                onRetryPosition={() => {
                  if (currentQuizCard) {
                    loadQuizPosition(currentQuizCard);
                  }
                }}
                onOpenPoolModal={() => setIsQuizPoolModalOpen(true)}
                onJumpToGamePosition={async (gameId, targetPly) => {
                  const games = loadSavedStudioGames();
                  const targetGame = games.find((g) => g.id === gameId);
                  if (targetGame) {
                    await handleOpenGame(targetGame, targetPly);
                    setActiveMode('STUDY');
                    setMobileActiveTab('board');
                  }
                }}
                onPlayPvContinuation={handlePlayPvContinuation}
                onAdoptVariationAsStudy={handleAdoptVariationAsStudy}
                replayState={quizReplayState}
                onReplayStep={handleQuizReplayStep}
                onToggleReplayPlay={handleToggleQuizReplayPlay}
                onExitReplay={handleExitQuizReplay}
                isFlipped={isFlipped}
                onToggleFlip={() => setIsFlipped(!isFlipped)}
                isShuffled={isQuizShuffled}
                onToggleShuffle={() => {
                  const nextShuffled = !isQuizShuffled;
                  setIsQuizShuffled(nextShuffled);
                  if (nextShuffled) {
                    // Generate new Fisher-Yates shuffle order
                    const indices = quizPool.map((_, i) => i);
                    for (let i = indices.length - 1; i > 0; i--) {
                      const j = Math.floor(Math.random() * (i + 1));
                      const temp = indices[i]!;
                      indices[i] = indices[j]!;
                      indices[j] = temp;
                    }
                    setQuizShuffledOrder(indices);
                  }
                }}
              />
            )}

            {/* Mode 5: Tsumego (詰将棋) Mode */}
            {activeMode === 'TSUMEGO' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-300">{t('studio.tsumego.title')}</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                    {t('studio.tsumego.subtitle')}
                  </p>
                </div>

                {/* Ply count filter tabs (All, 1..11, 13+) */}
                <div className="flex flex-wrap gap-1 p-1.5 bg-slate-950 rounded-lg border border-slate-800 text-[11px]">
                  {TSUMEGO_PLY_FILTER_OPTIONS.map((opt) => (
                    <button
                      key={String(opt)}
                      type="button"
                      onClick={() => {
                        setTsumegoFilterPly(opt);
                        const nextFiltered = filterTsumegoByPly(tsumegoList, opt);
                        if (
                          nextFiltered.length > 0 &&
                          !nextFiltered.some((p) => p.id === (activeTsumego?.id ?? selectedTsumegoId))
                        ) {
                          const picked = pickNextTsumegoProblem(
                            nextFiltered,
                            null,
                            isTsumegoRandom
                          );
                          if (picked) {
                            setSelectedTsumegoId(picked.id);
                          }
                        }
                      }}
                      className={`px-2 py-1 rounded font-bold transition ${
                        tsumegoFilterPly === opt
                          ? 'bg-amber-500 text-slate-950 shadow'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
                      }`}
                    >
                      {opt === 'all'
                        ? t('studio.tsumego.filter_all')
                        : opt === '13+'
                          ? t('studio.tsumego.ply_13plus')
                          : t('position_editor.move_limit_fmt', { count: opt })}
                    </button>
                  ))}
                </div>

                {/* Random & Masked Mode Controls */}
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setIsTsumegoRandom((prev) => !prev)}
                    className={`px-2.5 py-1.5 rounded-lg border font-bold transition flex items-center justify-center gap-1 ${
                      isTsumegoRandom
                        ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-200'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>🎲</span>
                    <span>{t('studio.tsumego.random_mode')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTsumegoMasked((prev) => !prev)}
                    className={`px-2.5 py-1.5 rounded-lg border font-bold transition flex items-center justify-center gap-1 ${
                      isTsumegoMasked
                        ? 'bg-violet-500/20 border-violet-500/60 text-violet-200'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span>🎭</span>
                    <span>{t('studio.tsumego.masked_mode')}</span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={filteredTsumegoList.length === 0}
                  onClick={() => {
                    handleSelectNextTsumego();
                    setMobileActiveTab('board');
                  }}
                  className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-xs font-bold shadow transition flex items-center justify-center gap-1.5"
                >
                  <span>🎲</span>
                  <span>{t('studio.tsumego.next_random_btn')}</span>
                </button>

                {/* Problem list (hidden in Masked mode to prevent spoiling title / ply count / tags) */}
                {isTsumegoMasked ? (
                  <div className="rounded-xl border border-violet-500/30 bg-violet-950/20 p-3 text-[11px] text-violet-200 leading-relaxed">
                    🎭 {t('studio.tsumego.masked_list_hidden_hint')}
                  </div>
                ) : filteredTsumegoList.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center text-xs text-slate-400">
                    {t('studio.tsumego.empty_pool')}
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
                    {filteredTsumegoList.map((p) => {
                      const isSelected = p.id === (activeTsumego?.id || selectedTsumegoId);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedTsumegoId(p.id);
                            setMobileActiveTab('board');
                          }}
                          className={`w-full text-left p-2.5 rounded-lg border transition flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'bg-amber-500/15 border-amber-500/60 text-white'
                              : 'bg-slate-800/40 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                {t('studio.tsumego.ply_badge', '{{count}}手詰', { count: p.moveLimit })}
                              </span>
                              <span className="text-xs font-bold truncate">
                                {p.title || t('studio.tsumego.problem_number', '問題 #{{id}}', { id: p.id })}
                              </span>
                            </div>
                            {p.tags.length > 0 && (
                              <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                {p.tags.join(' ・ ')}
                              </p>
                            )}
                          </div>
                          {p.lastReviewedAt && (
                            <span className="text-emerald-400 text-xs shrink-0" title="Solved">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Mode 6: Resignation Mate Verification */}
            {activeMode === 'RESIGN_MATE' && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400">{t('studio.resign_mate.title')}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t('studio.resign_mate.desc')}
                </p>

                <button
                  type="button"
                  onClick={() => goToPly(totalPlies)}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-xs font-bold text-amber-300 transition"
                >
                  {t('studio.resign_mate.jump_btn', { ply: totalPlies })}
                </button>

                <button
                  type="button"
                  disabled={isResignMateAnalyzing}
                  onClick={handleAnalyzeResignMate}
                  className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs font-bold text-white shadow-lg transition flex items-center justify-center gap-2"
                >
                  {isResignMateAnalyzing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{t('studio.resign_mate.analyzing')}</span>
                    </>
                  ) : (
                    <span>{t('studio.resign_mate.analyze_btn')}</span>
                  )}
                </button>

                {user?.uid && (
                  <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs">
                    {activeSpotMate?.status === 'completed' && activeSpotMate.result ? (
                      <div className="space-y-1.5">
                        <div className="font-bold text-amber-300 flex items-center justify-between">
                          <span>{t('studio.cloud_spot.mate_result_title', '☁️ クラウド精密詰み検証結果')}</span>
                          <span className="font-mono text-[10px]">depth {activeSpotMate.result.depth}</span>
                        </div>
                        <div className="text-[11px] text-slate-200">
                          {activeSpotMate.result.isMate
                            ? t('studio.cloud_spot.mate_detected', {
                                defaultValue: `詰みあり（${activeSpotMate.result.matePly ?? '?'}手詰）`,
                                ply: activeSpotMate.result.matePly ?? '?',
                              })
                            : t('studio.cloud_spot.no_mate_score', {
                                defaultValue: `詰みなし（評価値 ${activeSpotMate.result.scoreCp} cp）`,
                                score: activeSpotMate.result.scoreCp,
                              })}
                        </div>
                        {activeSpotMate.result.pv && activeSpotMate.result.pv.length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleReplayResignMatePv(activeSpotMate.result!.pv!)}
                            className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition"
                          >
                            {t('studio.cloud_spot.replay_pv', '▶ クラウド読み筋を盤面再生')}
                          </button>
                        )}
                      </div>
                    ) : activeSpotMate ? (
                      <div className="text-[11px] text-slate-400">
                        {t('studio.cloud_spot.mate_queued', {
                          defaultValue: `☁️ クラウド詰み検証キュー登録済み（${activeSpotMate.status}）`,
                          status: activeSpotMate.status,
                        })}
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={isQueuingSpot}
                        onClick={() => void handleQueueSpotAnalysis('mate')}
                        className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-amber-300 font-semibold text-xs transition"
                      >
                        {t('studio.cloud_spot.mate_queue_btn', '☁️ 投了図をクラウドで精密詰み検証を予約')}
                      </button>
                    )}
                  </div>
                )}

                {/* Analysis Results Card */}
                {resignMateResult && (
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-3 animate-fade-in text-xs">
                    {/* Header Verdict Badge */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <span className="font-bold flex items-center gap-1.5">
                        {resignMateResult.isMate ? (
                          <span className="text-amber-400">
                            {t('studio.resign_mate.mate_detected_title', { ply: resignMateResult.matePly ?? '?' })}
                          </span>
                        ) : (
                          <span className="text-cyan-400">
                            {t('studio.resign_mate.no_mate_title')}
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {t('studio.resign_mate.eval_score', {
                          score: (resignMateResult.scoreCp > 0 ? '+' : '') + resignMateResult.scoreCp,
                        })}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {resignMateResult.isMate
                        ? t('studio.resign_mate.mate_detected_desc')
                        : t('studio.resign_mate.no_mate_desc')}
                    </p>

                    {/* Continuation Sequence */}
                    {resignMateResult.pv && resignMateResult.pv.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[11px] font-bold text-slate-400">
                          {t('studio.resign_mate.pv_heading')}
                        </span>
                        <div className="p-2 rounded bg-slate-950 border border-slate-800/80 font-mono text-[11px] text-amber-200 break-words leading-relaxed">
                          {resignMateResult.pv.map((usi, idx) => {
                            const side = (player.shogi.turn + idx) % 2 === 0 ? 0 : 1;
                            const formatted = formatUsiToJapanese(usi, side as 0 | 1, player.shogi);
                            return (
                              <span key={`${usi}-${idx}`} className="mr-1.5 inline-block">
                                {formatted}
                              </span>
                            );
                          })}
                        </div>

                        {/* Interactive Buttons: Replay PV on board & Adopt to Study Tree */}
                        <div className="flex flex-col gap-1.5 pt-2">
                          <button
                            type="button"
                            onClick={() => handleReplayResignMatePv(resignMateResult.pv)}
                            className="w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs shadow transition active:scale-95 flex items-center justify-center gap-1.5"
                          >
                            <span>{t('studio.resign_mate.replay_pv_btn')}</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleAdoptResignMateAsStudy}
                            className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs transition active:scale-95 flex items-center justify-center gap-1.5"
                          >
                            <span>{t('studio.resign_mate.adopt_branch_btn')}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {!resignMateResult.isMate && (
                      <p className="text-[10px] text-slate-500 italic pt-1">
                        {t('studio.resign_mate.mate_not_found_tip')}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            </>
            )}
          </div>
          </div>

          {isPositionEditMode && (
            <div className="absolute inset-0 z-20 flex flex-col">
              <PositionEditAnalysisPanel
                currentSfen={player.shogi.toSFENString()}
                engineIsReady={engine.isReady}
                engineIsSearching={engine.isSearching}
                activeEngineName={getEngineDisplayName(engine.activeEngineId)}
                engineSearchPosition={engine.searchPosition}
                onEngineStop={engine.stop}
                previewState={editPreviewState}
                onPreviewChange={setEditPreviewState}
              />
            </div>
          )}
        </aside>
        )}
      </div>

      {/* Shogi Trace Result Summary Modal */}
      {traceSummaryModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-slate-900 border-2 border-amber-500/50 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4 text-center">
            <div className="space-y-1">
              <div className="text-3xl animate-bounce">🏆</div>
              <h3 className="text-base font-bold text-amber-300">{t('studio.trace.report_title', 'なぞり特訓 結果レポート')}</h3>
              <p className="text-xs text-slate-400 truncate">{traceSummaryModal.title}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40">
                <div className="text-[11px] text-emerald-300/80">○ {t('studio.trace.stat_exact', '正解')}</div>
                <div className="text-lg font-extrabold text-emerald-300">{traceSummaryModal.stats.exact}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-950/50 border border-amber-500/40">
                <div className="text-[11px] text-amber-300/80">△ {t('studio.trace.stat_near', '準正解')}</div>
                <div className="text-lg font-extrabold text-amber-300">{traceSummaryModal.stats.near}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-sky-950/50 border border-sky-500/40">
                <div className="text-[11px] text-sky-300/80">🌟 {t('studio.trace.stat_ai_best', '特別正解 (AI最善)')}</div>
                <div className="text-lg font-extrabold text-sky-300">{traceSummaryModal.stats.aiBest}</div>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-500/40">
                <div className="text-[11px] text-rose-300/80">✕ {t('studio.trace.stat_wrong', '不正解')} / ⏭ {traceSummaryModal.stats.skipped}</div>
                <div className="text-lg font-extrabold text-rose-300">{traceSummaryModal.stats.wrong}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTraceSummaryModal(null)}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 text-slate-950 font-bold text-xs shadow transition"
            >
              {t('studio.trace.close_report', '閉じる')}
            </button>
          </div>
        </div>
      )}

      {/* Zen Mode Kifu Sheet Modal (記録係の棋譜用紙) */}
      {showKifuSheet && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`bg-amber-50/95 text-slate-900 border-2 border-amber-900/30 rounded-xl max-w-md w-full max-h-[85vh] flex flex-col shadow-2xl p-4 font-serif transition-transform duration-300 ${
              kifuSheetViewerSide === 1 && !isFlipped ? 'rotate-180' : ''
            }`}
          >
            <div className="flex items-center justify-between border-b-2 border-amber-900/20 pb-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">📜</span>
                <h3 className="font-bold text-base tracking-wider text-amber-950">
                  {t('studio.match.kifu_sheet_title')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowKifuSheet(false)}
                className="px-2.5 py-1 text-xs rounded bg-amber-200/60 hover:bg-amber-300 font-sans font-bold text-amber-950 transition"
              >
                {t('common.close')}
              </button>
            </div>

            <div className="text-xs text-amber-900/80 mb-2 font-sans flex justify-between">
              <span>{t('studio.match.sente_prefix', '▲ 先手:')} {senteName}</span>
              <span>{t('studio.match.gote_prefix', '△ 後手:')} {goteName}</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 font-mono text-xs pr-1 border border-amber-900/20 rounded p-2 bg-amber-50/60">
              {matchMovesList.map((m, idx) => (
                <div key={`sheet-m-${idx}`} className="flex justify-between py-0.5 border-b border-amber-900/10">
                  <span className="text-amber-800 font-bold">{m.ply}.</span>
                  <span className="font-semibold text-slate-900">{m.moveText}</span>
                </div>
              ))}
              {matchMovesList.length === 0 && (
                <div className="text-center py-8 text-amber-800/60 font-sans italic">
                  {t('studio.match.kifu_sheet_empty', 'まだ指し手はありません')}
                </div>
              )}
            </div>

            <div className="pt-3 text-right">
              <button
                type="button"
                onClick={() => setShowKifuSheet(false)}
                className="px-4 py-1.5 rounded-lg bg-amber-800 hover:bg-amber-900 text-amber-50 text-xs font-sans font-bold transition shadow"
              >
                {t('studio.match.return_to_match', '対局に戻る')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Studio Kifu Management Modal */}
      <StudioKifuManagementModal
        isOpen={isManagementModalOpen}
        onClose={() => setIsManagementModalOpen(false)}
        initialTab={searchParams.get('tab') === 'save' ? 'save' : 'import'}
        onOpenGame={handleOpenGame}
        activeGameId={activeGameId}
        currentGameData={{
          senteName,
          goteName,
          tournament: player.kifu.header['棋戦'] || player.kifu.header['棋戦名'] || player.kifu.header['場所'],
          openingName: player.kifu.header['戦型'] || t('studio.free_study'),
          totalPlies,
          forkCount: kifuSteps.reduce((acc, s) => acc + (s.forks ? s.forks.length : 0), 0),
          jkfJson: JSON.stringify(player.kifu),
          rawKif: kifText,
        }}
        onBatchAnalyzeGames={handleBatchAnalyzeMultipleGames}
        isEngineAnalyzing={Boolean(batchProgress) || engine.isSearching}
        availableEngines={engine.availableEngines}
        activeEngineId={engine.activeEngineId}
        batchProgress={batchProgress}
        onCancelBatchAnalysis={handleCancelBatchAnalysis}
      />

      {/* Match Result / Game Over Modal */}
      <StudioMatchResultModal
        isOpen={isResultModalOpen}
        outcome={matchResult}
        totalPlies={player.getMaxTesuu()}
        senteName={senteName}
        goteName={goteName}
        isPlayerSente={matchPlayerSide === 0}
        onClose={() => setIsResultModalOpen(false)}
        onOpenReview={() => {
          setIsResultModalOpen(false);
          setIsReviewModalOpen(true);
        }}
        onStudy={() => {
          setIsResultModalOpen(false);
          setIsMatchActive(false);
          setIsZenMode(false);
          setActiveMode('STUDY');
        }}
        onRematch={() => {
          setIsResultModalOpen(false);
          handleStartMatch('new');
        }}
      />

      {/* Post-Match Review & AI Graph Analysis Modal */}
      <StudioMatchReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        outcome={matchResult}
        winnerColor={(() => {
          const w = detectGameWinner(player.kifu, kifText);
          return w === 'sente' ? 'b' : w === 'gote' ? 'w' : null;
        })()}
        totalPlies={player.getMaxTesuu()}
        senteName={senteName}
        goteName={goteName}
        isPlayerSente={matchPlayerSide === 0}
        evalHistory={evalHistory}
        getMoveText={(p) => {
          try {
            return player.getReadableKifu(p) || `${p}手目`;
          } catch {
            return `${p}手目`;
          }
        }}
        getMoveAtPly={(p) => {
          try {
            const rawMove = player.kifu.moves[p]?.move;
            return rawMove as JkfMoveData | null | undefined;
          } catch {
            return undefined;
          }
        }}
        onJumpToPlyAndStudy={(targetPly) => {
          setIsReviewModalOpen(false);
          setIsMatchActive(false);
          setIsZenMode(false);
          setActiveMode('STUDY');
          player.goto(targetPly);
          setCurrentPly(player.tesuu);
          bumpVersion();
        }}
        onRematch={() => {
          setIsReviewModalOpen(false);
          handleStartMatch('new');
        }}
      />

      {/* Shogi Rules & Guide Modal */}
      <ShogiRulebookModal
        isOpen={isRulebookModalOpen}
        onClose={() => setIsRulebookModalOpen(false)}
        initialTopic={rulebookInitialTab}
      />

      {/* Tactical Quiz Pool Management Modal */}
      <StudioQuizPoolModal
        isOpen={isQuizPoolModalOpen}
        onClose={() => setIsQuizPoolModalOpen(false)}
        savedGames={loadSavedStudioGames()}
        engine={engine}
        onPoolChanged={() => {
          const fresh = loadQuizPool().filter((c) => c.isEnabled);
          setQuizPool(fresh);
          if (fresh.length > 0) {
            const nextIdx = activeQuizIndex < fresh.length ? activeQuizIndex : 0;
            setActiveQuizIndex(nextIdx);
            const nextCard = fresh[nextIdx];
            if (nextCard) {
              loadQuizPosition(nextCard);
            }
          }
        }}
        onSelectCardForPractice={(cardId) => {
          const fresh = loadQuizPool().filter((c) => c.isEnabled);
          setQuizPool(fresh);
          const foundIdx = fresh.findIndex((c) => c.id === cardId);
          if (foundIdx >= 0) {
            setActiveQuizIndex(foundIdx);
            const card = fresh[foundIdx];
            if (card) {
              loadQuizPosition(card);
            }
            setActiveMode('QUIZ');
            setIsQuizPoolModalOpen(false);
          }
        }}
      />

      {/* Auto-extracted Quiz Notification Toast */}
      {quizCreatedToast && (
        <div className="fixed bottom-16 lg:bottom-6 right-4 sm:right-6 z-50 bg-gradient-to-r from-amber-600 to-amber-700 text-slate-950 font-bold px-4 py-3 rounded-2xl shadow-2xl border border-amber-400 flex items-center gap-3 animate-bounce">
          <span className="text-xl">🎯</span>
          <div>
            <div className="text-xs text-amber-100 font-normal">
              {t('studio.quiz_inline.toast_auto_title', '次の一手クイズ自動生成')}
            </div>
            <div className="text-sm font-extrabold text-white">
              {t('studio.quiz_inline.toast_auto_desc', {
                defaultValue: `好手・悪手から ${quizCreatedToast.count}問 をクイズプールに自動登録しました！`,
                count: quizCreatedToast.count,
              })}
            </div>
          </div>
        </div>
      )}

      {/* Studio Save Tactic Modal */}
      <StudioSaveTacticModal
        isOpen={isSaveTacticModalOpen}
        onClose={() => setIsSaveTacticModalOpen(false)}
        currentMoves={(() => {
          const res: string[] = [];
          for (let p = 1; p <= player.getMaxTesuu(); p++) {
            const m = player.kifu.moves[p]?.move;
            if (m) {
              const u = toUsi(m.from, m.to, m.piece, m.same);
              if (u) res.push(u);
            }
          }
          return res;
        })()}
        currentPly={currentPly}
        rangeStartPly={tacticRangeStart ?? 1}
        rangeEndPly={tacticRangeEnd ?? Math.max(1, currentPly || player.getMaxTesuu() || 1)}
        currentEvaluations={(() => {
          const evMap: Record<number, { scoreCp: number; isMate?: boolean }> = {};
          evalHistory.forEach((ev, p) => {
            evMap[p] = { scoreCp: ev.scoreCp, isMate: ev.isMate };
          });
          localEvalHistory.forEach((ev, p) => {
            if (!evMap[p]) {
              evMap[p] = { scoreCp: ev.scoreCp, isMate: ev.isMate };
            }
          });
          return evMap;
        })()}
        initialSfen={player.kifu.initial?.data ? player.shogi.toSFENString() : undefined}
        jkfJson={JSON.stringify(player.kifu)}
        moveComments={(() => {
          const comments: Array<{ ply: number; comment: string }> = [];
          for (let p = 1; p <= player.getMaxTesuu(); p++) {
            const mf = player.getMoveFormat(p);
            if (mf?.comments && mf.comments.length > 0) {
              comments.push({ ply: p, comment: mf.comments.join('\n') });
            }
          }
          return comments;
        })()}
        defaultTitle={player.kifu.header['戦型'] || player.kifu.header['棋戦'] || (activeGameId ? generateGameTitle(player.kifu.header) : '定跡研究')}
        sourceGameInfo={
          activeGameId || player.kifu.header['先手'] || player.kifu.header['後手'] || player.kifu.header['棋戦']
            ? {
                gameId: activeGameId || undefined,
                gameTitle: generateGameTitle(player.kifu.header),
                tournament: player.kifu.header['棋戦'],
                matchDate: player.kifu.header['開始日時'] || player.kifu.header['対局日'],
              }
            : undefined
        }
        onSuccess={(created) => {
          navigate(`/tactics/${created.id}`);
        }}
      />

      {/* Studio Tactics Library & Save-As-New Modal */}
      <StudioTacticsLibraryModal
        isOpen={isTacticsLibraryOpen}
        onClose={() => setIsTacticsLibraryOpen(false)}
        onLoadTactic={(tacticItem) => {
          const game = createStudioGameFromTactic(tacticItem);
          handleOpenGame(game);
        }}
        currentBoardJkfJson={JSON.stringify(player.kifu)}
        currentTitle={player.kifu.header['戦型'] || player.kifu.header['棋戦'] || '定跡研究'}
        totalPlies={player.getMaxTesuu()}
        evaluations={(() => {
          const evMap: Record<number, { scoreCp: number; isMate?: boolean }> = {};
          evalHistory.forEach((ev, p) => {
            evMap[p] = { scoreCp: ev.scoreCp, isMate: ev.isMate };
          });
          localEvalHistory.forEach((ev, p) => {
            if (!evMap[p]) {
              evMap[p] = { scoreCp: ev.scoreCp, isMate: ev.isMate };
            }
          });
          return evMap;
        })()}
        moveComments={(() => {
          const comments: Array<{ ply: number; comment: string }> = [];
          for (let p = 1; p <= player.getMaxTesuu(); p++) {
            const mf = player.getMoveFormat(p);
            if (mf?.comments && mf.comments.length > 0) {
              comments.push({ ply: p, comment: mf.comments.join('\n') });
            }
          }
          return comments;
        })()}
      />

      {/* Tsume-shogi Initial Setup Dialog (Modal - Zero Layout Shift) */}
      <TsumegoSetupModal
        isOpen={showTsumegoSetupModal}
        onSelectToBox={() => {
          applyEditedSfenInPlace(TSUMEGO_BOX_SFEN);
          setEditSelection(null);
          setShowTsumegoSetupModal(false);
        }}
        onSelectToHand={() => {
          applyEditedSfenInPlace(TSUMEGO_INITIAL_SFEN);
          setEditSelection(null);
          setShowTsumegoSetupModal(false);
        }}
        onCancel={() => setShowTsumegoSetupModal(false)}
      />

      {/* Register & Save Position Modal */}
      <PositionSaveModal
        isOpen={showSavePositionModal}
        currentSfen={player.shogi.toSFENString()}
        initialTarget={editSaveTarget}
        defaultCategory={editDefaultCategory}
        engineSearchFn={engine.isReady ? engine.searchPosition : undefined}
        onClose={() => setShowSavePositionModal(false)}
        onSaved={(result) => {
          if (result.category === 'tsumego') {
            setTsumegoList(loadTsumegoProblems());
            if (result.tsumegoProblem) {
              setSelectedTsumegoId(result.tsumegoProblem.id);
            }
          } else if (result.category === 'quiz') {
            setQuizPool(loadQuizPool().filter((c) => c.isEnabled));
          }
          commitAndExitPositionEditMode();
          setPositionSaveToast(t('position_editor.save_success_toast'));
          window.setTimeout(() => setPositionSaveToast(null), 2500);
        }}
      />

      {/* Save Study / Match Kifu Modal */}
      <StudioSaveKifuModal
        isOpen={isSaveKifuModalOpen}
        jkfJson={JSON.stringify(player.kifu)}
        totalPlies={player.getMaxTesuu()}
        defaultTitle={
          activeGameTitle ||
          player.kifu.header['棋戦'] ||
          player.kifu.header['戦型'] ||
          `${senteName} vs ${goteName}`
        }
        senteName={senteName}
        goteName={goteName}
        activeGameId={activeGameId}
        activeTags={activeGameTags}
        activeForkPointers={player.forkPointers}
        evaluations={(() => {
          const evMap: Record<number, MoveEvaluation> = {};
          evalHistory.forEach((ev, p) => {
            evMap[p] = ev;
          });
          localEvalHistory.forEach((ev, p) => {
            if (!evMap[p]) {
              evMap[p] = ev;
            }
          });
          return evMap;
        })()}
        onClose={() => setIsSaveKifuModalOpen(false)}
        onSaved={handleKifuModalSaved}
      />

      <ConfirmModal
        isOpen={studioConfirmDialog !== null}
        title={studioConfirmDialog?.title ?? ''}
        message={studioConfirmDialog?.message ?? ''}
        confirmLabel={studioConfirmDialog?.confirmLabel}
        isDestructive={studioConfirmDialog?.isDestructive}
        onConfirm={() => studioConfirmDialog?.onConfirm()}
        onCancel={() => setStudioConfirmDialog(null)}
      />

      {boardExportStatus !== 'idle' && (
        <div
          role="status"
          className={`fixed bottom-5 right-5 z-50 px-3.5 py-2 rounded-xl border text-xs font-bold shadow-2xl backdrop-blur-md transition ${
            boardExportStatus === 'copied'
              ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-200'
              : 'bg-rose-950/90 border-rose-500/60 text-rose-200'
          }`}
        >
          {boardExportStatus === 'copied'
            ? `✓ ${t('board_export.copied_short')}`
            : t('board_export.copy_failed_short')}
        </div>
      )}
    </div>
  );
};
