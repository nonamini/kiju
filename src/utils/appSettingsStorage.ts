/**
 * Persistent application settings storage (Issue #45).
 * Single source of truth for environment-level defaults that should
 * survive reloads: language, default engine, default analysis depth.
 * Uses the shared getSafeStorage() helper (localStorage + memory fallback).
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import { getSafeStorage } from './matchHistoryStorage';
import { scheduleAutoBackupToSyncDirectory } from './folderSyncBackup';
import { EngineId } from '../engine/engineConfig';

export const APP_SETTINGS_STORAGE_KEY = 'joseki_tree_app_settings';

export type LibrarySortFieldSetting =
  | 'updatedAt'
  | 'matchDate'
  | 'title'
  | 'totalPlies'
  | 'source';

export type LibrarySortDirectionSetting = 'asc' | 'desc';

export type LibraryGameKindTabSetting =
  | 'all'
  | 'pro'
  | 'ladies'
  | 'amateur'
  | 'self'
  | 'joseki'
  | 'other';

export type TreeGameKindScopeSetting = 'all' | 'pro' | 'self';

export type CloudAnalysisLevelSetting = 'light' | 'standard' | 'deep';

export type MobileTrainingDefaultModeSetting =
  | 'menu'
  | 'AI_MATCH'
  | 'QUIZ'
  | 'TSUMEGO'
  | 'SHOGI_TRACE';

export interface AppSettings {
  language: 'ja' | 'en';
  defaultEngineId: EngineId;
  defaultAnalysisDepth: number;
  defaultCloudAnalysisLevel?: CloudAnalysisLevelSetting;
  libraryDefaultSortField?: LibrarySortFieldSetting;
  libraryDefaultSortDirection?: LibrarySortDirectionSetting;
  libraryDefaultGameKindTab?: LibraryGameKindTabSetting;
  treeDefaultGameKindScope?: TreeGameKindScopeSetting;
  mobileTrainingDefaultMode?: MobileTrainingDefaultModeSetting;
  boardTheme?: 'kaya' | 'wood' | 'dark' | 'slate' | 'custom';
  pieceStyle?: 'single' | 'kanji' | 'custom';
  showCoordinates?: boolean;
  showEvalBar?: boolean;
  soundEnabled?: boolean;
  studioLayoutDensity?: 'comfortable' | 'compact';
  defaultStudioViewTier?: 1 | 2 | 3;
  defaultShowStudyFutureMoves?: boolean;
  defaultShowStudyEval?: boolean;
  defaultShowStudyBestMove?: boolean;
  defaultShowStudyCandidates?: boolean;
  externalPlayerLink1BaseUrl?: string;
  externalPlayerLink1Label?: string;
  externalPlayerLink2BaseUrl?: string;
  externalPlayerLink2Label?: string;
  externalKifuDbUrl?: string;
  externalKifuDbLabel?: string;
  studioQuickPins?: string[];
  updatedAt: string; // ISO 8601
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  language: 'ja',
  defaultEngineId: 'fairy-stockfish',
  defaultAnalysisDepth: 12,
  defaultCloudAnalysisLevel: 'standard',
  libraryDefaultSortField: 'updatedAt',
  libraryDefaultSortDirection: 'desc',
  libraryDefaultGameKindTab: 'all',
  treeDefaultGameKindScope: 'pro',
  mobileTrainingDefaultMode: 'menu',
  boardTheme: 'kaya',
  pieceStyle: 'single',
  showCoordinates: true,
  showEvalBar: true,
  soundEnabled: true,
  studioLayoutDensity: 'comfortable',
  defaultStudioViewTier: 3,
  defaultShowStudyFutureMoves: true,
  defaultShowStudyEval: true,
  defaultShowStudyBestMove: true,
  defaultShowStudyCandidates: true,
  externalPlayerLink1BaseUrl: '',
  externalPlayerLink1Label: '',
  externalPlayerLink2BaseUrl: '',
  externalPlayerLink2Label: '',
  externalKifuDbUrl: '',
  externalKifuDbLabel: '',
  studioQuickPins: ['act:import', 'act:library', 'act:flip', 'act:split'],
  updatedAt: new Date(0).toISOString(),
};

const VALID_LANGUAGES = new Set(['ja', 'en']);
const VALID_SORT_FIELDS = new Set(['updatedAt', 'matchDate', 'title', 'totalPlies', 'source']);
const VALID_SORT_DIRS = new Set(['asc', 'desc']);
const VALID_CLOUD_LEVELS = new Set(['light', 'standard', 'deep']);
const VALID_GAME_KIND_TABS = new Set([
  'all',
  'pro',
  'ladies',
  'amateur',
  'self',
  'joseki',
  'other',
]);
const VALID_TREE_SCOPES = new Set(['all', 'pro', 'self']);
const VALID_MOBILE_TRAINING_MODES = new Set(['menu', 'AI_MATCH', 'QUIZ', 'TSUMEGO', 'SHOGI_TRACE']);
const VALID_BOARD_THEMES = new Set(['kaya', 'wood', 'dark', 'slate', 'custom']);
const VALID_PIECE_STYLES = new Set(['single', 'kanji', 'custom']);
const VALID_LAYOUT_DENSITIES = new Set(['comfortable', 'compact']);

/**
 * Loads persisted settings, merging over defaults field-by-field so that
 * newly added fields get their defaults even for older stored payloads.
 * Corrupt or missing data falls back to DEFAULT_APP_SETTINGS.
 */
export function loadAppSettings(): AppSettings {
  try {
    const storage = getSafeStorage();
    const raw = storage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_APP_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULT_APP_SETTINGS };
    }
    return {
      language:
        typeof parsed.language === 'string' && VALID_LANGUAGES.has(parsed.language)
          ? (parsed.language as AppSettings['language'])
          : DEFAULT_APP_SETTINGS.language,
      defaultEngineId:
        typeof parsed.defaultEngineId === 'string' &&
        parsed.defaultEngineId.trim().length > 0
          ? parsed.defaultEngineId.trim()
          : DEFAULT_APP_SETTINGS.defaultEngineId,
      defaultAnalysisDepth:
        typeof parsed.defaultAnalysisDepth === 'number' &&
        parsed.defaultAnalysisDepth > 0
          ? parsed.defaultAnalysisDepth
          : DEFAULT_APP_SETTINGS.defaultAnalysisDepth,
      defaultCloudAnalysisLevel:
        typeof parsed.defaultCloudAnalysisLevel === 'string' &&
        VALID_CLOUD_LEVELS.has(parsed.defaultCloudAnalysisLevel)
          ? (parsed.defaultCloudAnalysisLevel as CloudAnalysisLevelSetting)
          : DEFAULT_APP_SETTINGS.defaultCloudAnalysisLevel,
      libraryDefaultSortField:
        typeof parsed.libraryDefaultSortField === 'string' &&
        VALID_SORT_FIELDS.has(parsed.libraryDefaultSortField)
          ? (parsed.libraryDefaultSortField as LibrarySortFieldSetting)
          : DEFAULT_APP_SETTINGS.libraryDefaultSortField,
      libraryDefaultSortDirection:
        typeof parsed.libraryDefaultSortDirection === 'string' &&
        VALID_SORT_DIRS.has(parsed.libraryDefaultSortDirection)
          ? (parsed.libraryDefaultSortDirection as LibrarySortDirectionSetting)
          : DEFAULT_APP_SETTINGS.libraryDefaultSortDirection,
      libraryDefaultGameKindTab:
        typeof parsed.libraryDefaultGameKindTab === 'string' &&
        VALID_GAME_KIND_TABS.has(parsed.libraryDefaultGameKindTab)
          ? (parsed.libraryDefaultGameKindTab as LibraryGameKindTabSetting)
          : DEFAULT_APP_SETTINGS.libraryDefaultGameKindTab,
      treeDefaultGameKindScope:
        typeof parsed.treeDefaultGameKindScope === 'string' &&
        VALID_TREE_SCOPES.has(parsed.treeDefaultGameKindScope)
          ? (parsed.treeDefaultGameKindScope as TreeGameKindScopeSetting)
          : DEFAULT_APP_SETTINGS.treeDefaultGameKindScope,
      mobileTrainingDefaultMode:
        typeof parsed.mobileTrainingDefaultMode === 'string' &&
        VALID_MOBILE_TRAINING_MODES.has(parsed.mobileTrainingDefaultMode)
          ? (parsed.mobileTrainingDefaultMode as MobileTrainingDefaultModeSetting)
          : DEFAULT_APP_SETTINGS.mobileTrainingDefaultMode,
      boardTheme:
        typeof parsed.boardTheme === 'string' && VALID_BOARD_THEMES.has(parsed.boardTheme)
          ? (parsed.boardTheme as AppSettings['boardTheme'])
          : DEFAULT_APP_SETTINGS.boardTheme,
      pieceStyle:
        typeof parsed.pieceStyle === 'string' && VALID_PIECE_STYLES.has(parsed.pieceStyle)
          ? (parsed.pieceStyle as AppSettings['pieceStyle'])
          : DEFAULT_APP_SETTINGS.pieceStyle,
      showCoordinates:
        typeof parsed.showCoordinates === 'boolean'
          ? parsed.showCoordinates
          : DEFAULT_APP_SETTINGS.showCoordinates,
      showEvalBar:
        typeof parsed.showEvalBar === 'boolean'
          ? parsed.showEvalBar
          : DEFAULT_APP_SETTINGS.showEvalBar,
      soundEnabled:
        typeof parsed.soundEnabled === 'boolean'
          ? parsed.soundEnabled
          : DEFAULT_APP_SETTINGS.soundEnabled,
      studioLayoutDensity:
        typeof parsed.studioLayoutDensity === 'string' &&
        VALID_LAYOUT_DENSITIES.has(parsed.studioLayoutDensity)
          ? (parsed.studioLayoutDensity as AppSettings['studioLayoutDensity'])
          : DEFAULT_APP_SETTINGS.studioLayoutDensity,
      defaultStudioViewTier:
        parsed.defaultStudioViewTier === 1 ||
        parsed.defaultStudioViewTier === 2 ||
        parsed.defaultStudioViewTier === 3
          ? parsed.defaultStudioViewTier
          : DEFAULT_APP_SETTINGS.defaultStudioViewTier,
      defaultShowStudyFutureMoves:
        typeof parsed.defaultShowStudyFutureMoves === 'boolean'
          ? parsed.defaultShowStudyFutureMoves
          : DEFAULT_APP_SETTINGS.defaultShowStudyFutureMoves,
      defaultShowStudyEval:
        typeof parsed.defaultShowStudyEval === 'boolean'
          ? parsed.defaultShowStudyEval
          : DEFAULT_APP_SETTINGS.defaultShowStudyEval,
      defaultShowStudyBestMove:
        typeof parsed.defaultShowStudyBestMove === 'boolean'
          ? parsed.defaultShowStudyBestMove
          : DEFAULT_APP_SETTINGS.defaultShowStudyBestMove,
      defaultShowStudyCandidates:
        typeof parsed.defaultShowStudyCandidates === 'boolean'
          ? parsed.defaultShowStudyCandidates
          : DEFAULT_APP_SETTINGS.defaultShowStudyCandidates,
      externalPlayerLink1BaseUrl:
        typeof parsed.externalPlayerLink1BaseUrl === 'string'
          ? parsed.externalPlayerLink1BaseUrl.trim()
          : DEFAULT_APP_SETTINGS.externalPlayerLink1BaseUrl,
      externalPlayerLink1Label:
        typeof parsed.externalPlayerLink1Label === 'string'
          ? parsed.externalPlayerLink1Label.trim()
          : DEFAULT_APP_SETTINGS.externalPlayerLink1Label,
      externalPlayerLink2BaseUrl:
        typeof parsed.externalPlayerLink2BaseUrl === 'string'
          ? parsed.externalPlayerLink2BaseUrl.trim()
          : DEFAULT_APP_SETTINGS.externalPlayerLink2BaseUrl,
      externalPlayerLink2Label:
        typeof parsed.externalPlayerLink2Label === 'string'
          ? parsed.externalPlayerLink2Label.trim()
          : DEFAULT_APP_SETTINGS.externalPlayerLink2Label,
      externalKifuDbUrl:
        typeof parsed.externalKifuDbUrl === 'string'
          ? parsed.externalKifuDbUrl.trim()
          : DEFAULT_APP_SETTINGS.externalKifuDbUrl,
      externalKifuDbLabel:
        typeof parsed.externalKifuDbLabel === 'string'
          ? parsed.externalKifuDbLabel.trim()
          : DEFAULT_APP_SETTINGS.externalKifuDbLabel,
      studioQuickPins: Array.isArray(parsed.studioQuickPins)
        ? parsed.studioQuickPins
            .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .slice(0, 8)
        : [...(DEFAULT_APP_SETTINGS.studioQuickPins ?? [])],
      updatedAt:
        typeof parsed.updatedAt === 'string' ? parsed.updatedAt : DEFAULT_APP_SETTINGS.updatedAt,
    };
  } catch (err) {
    console.error('Failed to load app settings:', err);
    return { ...DEFAULT_APP_SETTINGS };
  }
}

/**
 * Persists settings. Always refreshes updatedAt.
 */
export function saveAppSettings(settings: AppSettings): void {
  scheduleAutoBackupToSyncDirectory();
  try {
    const storage = getSafeStorage();
    storage.setItem(
      APP_SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...settings, updatedAt: new Date().toISOString() })
    );
  } catch (err) {
    console.error('Failed to save app settings:', err);
  }
}
