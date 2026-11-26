/**
 * SettingsModal — unified settings screen.
 * Issue #45: modal shell + tab structure + placeholder tabs.
 * Issue #46: General tab language selector persisted via AppSettings.
 * Follow-up issues fill in the remaining tabs (#47 engine defaults,
 * #48-#49 data management, #50 account/sync/app-info).
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import {
  getFolderSyncOptions,
  saveFolderSyncOptions,
  isDirectoryPickerSupported,
  pickSyncDirectory,
  getSavedSyncDirectoryName,
  clearSyncDirectoryHandle,
  writeBackupToSyncDirectory,
  readBackupFromSyncDirectory,
  exportFullBackupBundle,
  mergeFullBackupBundle,
  FullBackupBundle,
} from '../../utils/folderSyncBackup';
import {
  BookProfile,
  loadBookProfiles,
  pickBookFileHandleOnly,
  saveRegisteredBookProfile,
  removeBookProfile,
  isBookFilePickerSupported,
} from '../../utils/yaneuraBookDb';

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import {
  AppSettings,
  CloudAnalysisLevelSetting,
  LibraryGameKindTabSetting,
  LibrarySortDirectionSetting,
  LibrarySortFieldSetting,
  TreeGameKindScopeSetting,
} from '../../utils/appSettingsStorage';
import {
  clearCustomAsset,
  CustomAssetKind,
  CustomAssetsState,
  getCachedCustomAssets,
  initCustomAssetsCache,
  saveCustomAsset,
  subscribeCustomAssets,
} from '../../utils/customAssetsStorage';
import { playPieceMoveSound } from '../../utils/shogiSound';
import {
  DEFAULT_ENGINE_ID,
  deleteCustomEngineProfile,
  EngineId,
  EngineProfile,
  formatEngineSizeBytes,
  getAllEngineProfiles,
  parseEngineTagJson,
  parseEvalOptionsTxt,
  probeWebSocketUsiEngine,
  resolveEngineDescription,
  resolveEngineDisplayName,
  saveCustomEngineProfile,
  subscribeEngineRegistryChange,
} from '../../engine/engineConfig';
import {
  deleteCustomEngineModelBinary,
  saveCustomEngineModelBinary,
} from '../../engine/customEngineModelStore';
import {
  pickLocalUsiExecutable,
  probeLocalUsiExecutable,
} from '../../engine/localUsiRuntime';
import { getSharedEngineBridge } from '../../engine/shogiEngineBridge';
import { useAuth } from '../../hooks/useAuth';
import { AuthStatusButton } from '../auth/AuthStatusButton';
import {
  getLastSyncInfo,
  LastSyncInfo,
  syncKifuRecordsWithCloud,
} from '../../services/firestoreKifuSync';
import {
  getActiveFirebaseConfig,
  getCustomFirebaseConfig,
  saveCustomFirebaseConfig,
  clearCustomFirebaseConfig,
} from '../../services/firebase';
import { parseFirebaseConfigInput } from '../../utils/firebaseConfigParser';
import pkg from '../../../package.json';
import {
  collectStorageUsage,
  downloadBackupFile,
  parseBackupJson,
  resetAllAppData,
  restoreBackupData,
  RestoreResult,
  StorageUsageEntry,
} from '../../utils/appBackup';
import { loadKifuRecords } from '../../utils/kifuRecordStorage';
import {
  exportStandardLocaleJson,
  saveCustomLocaleOverride,
  clearCustomLocaleOverride,
  loadCustomLocaleOverride,
  SupportedLanguage,
} from '../../utils/customLocalesStorage';

type SettingsTab = 'general' | 'appearance' | 'ai' | 'data' | 'account' | 'about';

const TABS: Array<{ id: SettingsTab; labelKey: string }> = [
  { id: 'general', labelKey: 'settings.tab_general' },
  { id: 'appearance', labelKey: 'settings.tab_appearance' },
  { id: 'ai', labelKey: 'settings.tab_ai' },
  { id: 'data', labelKey: 'settings.tab_data' },
  { id: 'account', labelKey: 'settings.tab_account' },
  { id: 'about', labelKey: 'settings.tab_about' },
];

const LANGUAGES: Array<{ id: AppSettings['language']; labelKey: string }> = [
  { id: 'ja', labelKey: 'common.ja' },
  { id: 'en', labelKey: 'common.en' },
];

const SettingsGeneralTab: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customLocaleMsg, setCustomLocaleMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const activeLang = (settings.language === 'en' ? 'en' : 'ja') as SupportedLanguage;
  const hasCustomOverride = Boolean(loadCustomLocaleOverride(activeLang));

  const handleLanguageChange = (lang: AppSettings['language']) => {
    updateSettings({ language: lang });
    void i18n.changeLanguage(lang);
  };

  const handleDownloadStandardDictionary = () => {
    try {
      const jsonContent = exportStandardLocaleJson(activeLang);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `joseki_tree_locale_${activeLang}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export locale JSON:', err);
    }
  };

  const handleImportCustomDictionary = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Invalid JSON dictionary format');
        }
        saveCustomLocaleOverride(activeLang, parsed as Record<string, unknown>);
        setCustomLocaleMsg({ type: 'ok', text: t('settings.general.locale_import_success', 'カスタム言語辞書を適用しました！') });
        setTimeout(() => setCustomLocaleMsg(null), 3000);
      } catch (err) {
        console.error('Failed to import locale JSON:', err);
        setCustomLocaleMsg({ type: 'err', text: t('settings.general.locale_import_error', 'JSONファイルの読み込みに失敗しました') });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleResetLocale = () => {
    if (!window.confirm(t('settings.general.locale_reset_confirm', '言語設定をアプリ標準のデフォルトに戻しますか？'))) return;
    clearCustomLocaleOverride(activeLang);
    setCustomLocaleMsg({ type: 'ok', text: t('settings.general.locale_reset_success', '標準辞書に戻しました') });
    setTimeout(() => setCustomLocaleMsg(null), 2500);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-slate-400 mb-2">
          {t('settings.general.language')}
        </label>
        <div className="flex gap-2">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              type="button"
              onClick={() => handleLanguageChange(lang.id)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                settings.language === lang.id
                  ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                  : 'border-slate-700 bg-slate-950/50 text-slate-300 hover:border-slate-600'
              }`}
            >
              {t(lang.labelKey)}
            </button>
          ))}
        </div>

        {/* Custom Locale Dictionary Override Panel */}
        <div className="mt-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-slate-200">
              <span>📖</span>
              <span>{t('settings.general.locale_custom_title', '言語辞書・表記のカスタマイズ')}</span>
            </div>
            {hasCustomOverride && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                {t('settings.general.locale_custom_active', 'カスタム適用中')}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {t(
              'settings.general.locale_custom_desc',
              'アプリ内の用語・ボタン表記・戦型名などを好みの言葉に自由に変更できます。標準辞書（JSON）をダウンロードして編集し、読み込んでください。'
            )}
          </p>

          {customLocaleMsg && (
            <div
              className={`p-2 rounded-lg text-xs font-semibold ${
                customLocaleMsg.type === 'ok'
                  ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                  : 'bg-rose-950/60 text-rose-300 border border-rose-800'
              }`}
            >
              {customLocaleMsg.text}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleDownloadStandardDictionary}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold transition flex items-center gap-1"
            >
              <span>📥</span>
              <span>{t('settings.general.locale_download_btn', '辞書JSONを出力')}</span>
            </button>

            <label className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold cursor-pointer transition flex items-center gap-1 shadow">
              <span>📤</span>
              <span>{t('settings.general.locale_upload_btn', 'カスタム辞書を適用')}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportCustomDictionary}
                className="hidden"
              />
            </label>

            {hasCustomOverride && (
              <button
                type="button"
                onClick={handleResetLocale}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-800 transition text-[11px]"
              >
                {t('settings.general.locale_reset_btn', '標準に戻す')}
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-400 mb-2">
          {t('settings.general.library_default_tab')}
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {([
            { id: 'all', labelKey: 'library_page.tab_all' },
            { id: 'pro', labelKey: 'library_page.game_kind_pro' },
            { id: 'ladies', labelKey: 'library_page.game_kind_ladies' },
            { id: 'amateur', labelKey: 'library_page.game_kind_amateur' },
            { id: 'self', labelKey: 'library_page.game_kind_self' },
            { id: 'joseki', labelKey: 'library_page.game_kind_joseki' },
            { id: 'other', labelKey: 'library_page.game_kind_other' },
          ] as Array<{ id: LibraryGameKindTabSetting; labelKey: string }>).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => updateSettings({ libraryDefaultGameKindTab: tab.id })}
              className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition ${
                (settings.libraryDefaultGameKindTab ?? 'all') === tab.id
                  ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                  : 'border-slate-700 bg-slate-950/50 text-slate-300 hover:border-slate-600'
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-400 mb-2">
          {t('settings.general.tree_default_scope')}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: 'pro', labelKey: 'settings.general.tree_scope_pro' },
            { id: 'self', labelKey: 'settings.general.tree_scope_self' },
            { id: 'all', labelKey: 'settings.general.tree_scope_all' },
          ] as Array<{ id: TreeGameKindScopeSetting; labelKey: string }>).map((sc) => (
            <button
              key={sc.id}
              type="button"
              onClick={() => updateSettings({ treeDefaultGameKindScope: sc.id })}
              className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${
                (settings.treeDefaultGameKindScope ?? 'pro') === sc.id
                  ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-700 bg-slate-950/50 text-slate-300 hover:border-slate-600'
              }`}
            >
              {t(sc.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-400 mb-2">
          {t('settings.general.library_default_sort')}
        </label>
        <div className="flex gap-2">
          <select
            value={settings.libraryDefaultSortField}
            onChange={(e) =>
              updateSettings({
                libraryDefaultSortField: e.target.value as LibrarySortFieldSetting,
              })
            }
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/60"
          >
            <option value="updatedAt">{t('library_page.col_updated')}</option>
            <option value="matchDate">{t('library_page.col_date')}</option>
            <option value="title">{t('library_page.col_title')}</option>
            <option value="totalPlies">{t('library_page.col_plies')}</option>
          </select>
          <select
            value={settings.libraryDefaultSortDirection}
            onChange={(e) =>
              updateSettings({
                libraryDefaultSortDirection: e.target.value as LibrarySortDirectionSetting,
              })
            }
            className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/60"
          >
            <option value="desc">{t('settings.general.sort_desc')}</option>
            <option value="asc">{t('settings.general.sort_asc')}</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-400 mb-2">
          {t('settings.general.mobile_training_default')}
        </label>
        <select
          value={settings.mobileTrainingDefaultMode ?? 'menu'}
          onChange={(e) =>
            updateSettings({
              mobileTrainingDefaultMode: e.target.value as
                | 'menu'
                | 'AI_MATCH'
                | 'QUIZ'
                | 'TSUMEGO'
                | 'SHOGI_TRACE',
            })
          }
          className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/60"
        >
          <option value="menu">{t('settings.general.mobile_training_menu')}</option>
          <option value="AI_MATCH">{t('studio.tabs.ai_match')}</option>
          <option value="QUIZ">{t('studio.tabs.quiz')}</option>
          <option value="TSUMEGO">{t('studio.tabs.tsumego')}</option>
          <option value="SHOGI_TRACE">{t('studio.tabs.trace')}</option>
        </select>
      </div>

      {/* Configurable External Reference Links */}
      <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5 text-xs">
        <div>
          <p className="font-bold text-slate-200 flex items-center gap-1.5">
            <span>🌐</span>
            <span>{t('settings.general.external_links_title')}</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
            {t('settings.general.external_links_desc')}
          </p>
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] font-semibold text-slate-400">
            {t('settings.general.external_player_link1')}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={settings.externalPlayerLink1Label ?? ''}
              onChange={(e) => updateSettings({ externalPlayerLink1Label: e.target.value })}
              placeholder={t('settings.general.external_link_label_placeholder')}
              className="sm:col-span-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
            />
            <input
              type="url"
              value={settings.externalPlayerLink1BaseUrl ?? ''}
              onChange={(e) => updateSettings({ externalPlayerLink1BaseUrl: e.target.value })}
              placeholder="https://example.com/..."
              className="sm:col-span-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] font-semibold text-slate-400">
            {t('settings.general.external_player_link2')}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={settings.externalPlayerLink2Label ?? ''}
              onChange={(e) => updateSettings({ externalPlayerLink2Label: e.target.value })}
              placeholder={t('settings.general.external_link_label_placeholder')}
              className="sm:col-span-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
            />
            <input
              type="url"
              value={settings.externalPlayerLink2BaseUrl ?? ''}
              onChange={(e) => updateSettings({ externalPlayerLink2BaseUrl: e.target.value })}
              placeholder="https://example.com/..."
              className="sm:col-span-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-[11px] font-semibold text-slate-400">
            {t('settings.general.external_kifu_db_url')}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={settings.externalKifuDbLabel ?? ''}
              onChange={(e) => updateSettings({ externalKifuDbLabel: e.target.value })}
              placeholder={t('settings.general.external_link_label_placeholder')}
              className="sm:col-span-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
            />
            <input
              type="url"
              value={settings.externalKifuDbUrl ?? ''}
              onChange={(e) => updateSettings({ externalKifuDbUrl: e.target.value })}
              placeholder="https://example.com/..."
              className="sm:col-span-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const DEPTH_OPTIONS = [8, 10, 12, 16];

interface EngineMetadataFormValues {
  name: string;
  author: string;
  architecture: string;
  description: string;
}

interface EngineMetadataFieldsProps {
  values: EngineMetadataFormValues;
  onChange: (next: EngineMetadataFormValues) => void;
  onTagLoaded?: (tagFileName: string, rawTag: Record<string, unknown>) => void;
  onTagError?: () => void;
  loadedTagFileName?: string | null;
}

const EngineMetadataFields: React.FC<EngineMetadataFieldsProps> = ({
  values,
  onChange,
  onTagLoaded,
  onTagError,
  loadedTagFileName,
}) => {
  const { t } = useTranslation();
  const tagInputRef = useRef<HTMLInputElement>(null);

  const handleLoadTagFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseEngineTagJson(text);
      onChange({
        name: parsed.displayName ?? values.name,
        author: parsed.author ?? values.author,
        architecture: parsed.architecture ?? values.architecture,
        description: parsed.description ?? values.description,
      });
      onTagLoaded?.(file.name, parsed.raw);
    } catch {
      onTagError?.();
    } finally {
      if (tagInputRef.current) tagInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="px-3 py-1.5 rounded-lg bg-amber-950/50 hover:bg-amber-900/60 text-amber-200 border border-amber-700/60 text-xs font-semibold cursor-pointer transition inline-flex items-center gap-1.5">
          <span>🏷️</span>
          <span>{t('settings.ai.tag_json_load_btn')}</span>
          <input
            ref={tagInputRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => void handleLoadTagFile(e)}
            className="hidden"
          />
        </label>
        {loadedTagFileName && (
          <span className="text-[11px] text-amber-300 font-mono truncate max-w-full">
            ✓ {t('settings.ai.tag_json_loaded', { name: loadedTagFileName })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
            {t('settings.ai.engine_name_label')}
          </label>
          <input
            type="text"
            value={values.name}
            onChange={(e) => onChange({ ...values, name: e.target.value })}
            placeholder={t('settings.ai.engine_name_placeholder')}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-amber-500/60 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
            {t('settings.ai.engine_author_label')}
          </label>
          <input
            type="text"
            value={values.author}
            onChange={(e) => onChange({ ...values, author: e.target.value })}
            placeholder={t('settings.ai.engine_author_placeholder')}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-amber-500/60 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
            {t('settings.ai.engine_arch_label')}
          </label>
          <input
            type="text"
            value={values.architecture}
            onChange={(e) => onChange({ ...values, architecture: e.target.value })}
            placeholder={t('settings.ai.engine_arch_placeholder')}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-amber-500/60 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
            {t('settings.ai.engine_desc_label')}
          </label>
          <input
            type="text"
            value={values.description}
            onChange={(e) => onChange({ ...values, description: e.target.value })}
            placeholder={t('settings.ai.engine_desc_placeholder')}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-amber-500/60 focus:outline-none"
          />
        </div>
      </div>

      <div className="rounded-lg bg-slate-900/70 border border-slate-800 px-2.5 py-1.5 text-[11px] text-slate-400 truncate">
        <span className="text-slate-500 mr-1.5">{t('settings.ai.credit_preview_label')}</span>
        <span className="text-slate-200 font-medium">{values.name || '---'}</span>
        <span>
          {' '}
          — {values.author || 'Custom Author'} ({values.architecture || 'Custom USI'})
        </span>
      </div>
    </div>
  );
};

const SettingsAiTab: React.FC = () => {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const [engines, setEngines] = useState<EngineProfile[]>(() => getAllEngineProfiles());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [bookProfiles, setBookProfiles] = useState<BookProfile[]>(() => loadBookProfiles());
  const [newBookName, setNewBookName] = useState('');
  const [pendingBookHandle, setPendingBookHandle] =
    useState<Awaited<ReturnType<typeof pickBookFileHandleOnly>>>(null);

  // Existing custom engine inline tag/credit editor state
  const [editingEngineId, setEditingEngineId] = useState<string | null>(null);
  const [editMeta, setEditMeta] = useState<EngineMetadataFormValues>({
    name: '',
    author: '',
    architecture: '',
    description: '',
  });
  const [editTagFileName, setEditTagFileName] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // Add custom engine form state (#141, #142, #143): decoupled binary/endpoint and tag/credit metadata
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<'local-exe' | 'custom-nnue' | 'websocket-usi'>(
    'local-exe'
  );
  const [exePath, setExePath] = useState('');
  const [wsUrl, setWsUrl] = useState('ws://localhost:9000');
  const [isProbing, setIsProbing] = useState(false);

  // Section 1: binary files
  const [selectedNnFile, setSelectedNnFile] = useState<File | null>(null);
  const [selectedProgressFile, setSelectedProgressFile] = useState<File | null>(null);
  const [fvScale, setFvScale] = useState<number | undefined>(undefined);
  const nnueInputRef = useRef<HTMLInputElement>(null);
  const auxInputRef = useRef<HTMLInputElement>(null);

  // Section 2: tag / credit metadata (independent from binary selection)
  const [metaValues, setMetaValues] = useState<EngineMetadataFormValues>({
    name: '',
    author: '',
    architecture: '',
    description: '',
  });
  const [loadedTagFileName, setLoadedTagFileName] = useState<string | null>(null);
  const [parsedTagJson, setParsedTagJson] = useState<Record<string, unknown> | undefined>(undefined);

  const [formMessage, setFormMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    setEngines(getAllEngineProfiles());
    return subscribeEngineRegistryChange(() => {
      setEngines(getAllEngineProfiles());
    });
  }, []);

  const handleEngineChange = (engineId: EngineId) => {
    updateSettings({ defaultEngineId: engineId });
    // Apply immediately when the engine bridge is already running (#47).
    getSharedEngineBridge().setConfiguredEngine(engineId);
  };

  const handleDeleteCustomEngine = async (eng: EngineProfile) => {
    if (eng.customModelId) {
      await deleteCustomEngineModelBinary(eng.customModelId);
    }
    deleteCustomEngineProfile(eng.id);
    if (editingEngineId === eng.id) {
      setEditingEngineId(null);
    }
    if (settings.defaultEngineId === eng.id) {
      handleEngineChange(DEFAULT_ENGINE_ID);
    }
    setConfirmDeleteId(null);
  };

  const handleStartEditMeta = (eng: EngineProfile) => {
    setConfirmDeleteId(null);
    if (editingEngineId === eng.id) {
      setEditingEngineId(null);
      return;
    }
    setEditingEngineId(eng.id);
    setEditMeta({
      name: eng.displayName ?? resolveEngineDisplayName(eng, t),
      author: eng.author,
      architecture: eng.architecture,
      description: eng.description ?? '',
    });
    setEditTagFileName(null);
    setEditError(null);
  };

  const handleSaveEditedMeta = (eng: EngineProfile) => {
    const trimmedName = editMeta.name.trim();
    if (!trimmedName) {
      setEditError(t('settings.ai.engine_name_required'));
      return;
    }
    saveCustomEngineProfile({
      ...eng,
      displayName: trimmedName,
      author: editMeta.author.trim() || eng.author,
      architecture: editMeta.architecture.trim() || eng.architecture,
      description: editMeta.description.trim() || undefined,
    });
    setEditingEngineId(null);
    setEditError(null);
  };

  const handleProbeWebSocket = async () => {
    setIsProbing(true);
    setFormMessage(null);
    try {
      const info = await probeWebSocketUsiEngine(wsUrl);
      setMetaValues((prev) => ({
        ...prev,
        name: info.name || prev.name,
        author: info.author || prev.author,
        architecture: prev.architecture || 'External USI (WebSocket)',
      }));
      setFormMessage({ type: 'ok', text: t('settings.ai.ws_probe_ok') });
    } catch {
      setFormMessage({ type: 'err', text: t('settings.ai.ws_probe_fail') });
    } finally {
      setIsProbing(false);
    }
  };

  const handleBrowseLocalExe = async () => {
    setFormMessage(null);
    try {
      const picked = await pickLocalUsiExecutable();
      if (picked) {
        setExePath(picked);
        const fileName = picked.split(/[\\/]/).pop() ?? picked;
        setMetaValues((prev) =>
          prev.name.trim().length > 0
            ? prev
            : { ...prev, name: fileName.replace(/\.(exe|bin)$/i, '') }
        );
      }
    } catch (err) {
      setFormMessage({
        type: 'err',
        text: err instanceof Error ? err.message : t('settings.ai.exe_probe_fail'),
      });
    }
  };

  const handleProbeLocalExe = async () => {
    const trimmed = exePath.trim();
    if (!trimmed) {
      setFormMessage({ type: 'err', text: t('settings.ai.exe_path_required') });
      return;
    }
    setIsProbing(true);
    setFormMessage(null);
    try {
      const info = await probeLocalUsiExecutable(trimmed);
      setMetaValues((prev) => ({
        ...prev,
        name: info.name || prev.name,
        author: info.author || prev.author,
        architecture: prev.architecture || 'Local USI Executable (.exe)',
      }));
      setFormMessage({ type: 'ok', text: t('settings.ai.exe_probe_ok') });
    } catch (err) {
      setFormMessage({
        type: 'err',
        text: err instanceof Error ? err.message : t('settings.ai.exe_probe_fail'),
      });
    } finally {
      setIsProbing(false);
    }
  };

  const handleSelectNnFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedNnFile(file);
    // Only fill display name from filename if user hasn't entered one or loaded tag.json
    setMetaValues((prev) =>
      prev.name.trim().length > 0
        ? prev
        : { ...prev, name: file.name.replace(/\.(bin|nnue)$/i, '') }
    );
    setFormMessage(null);
    if (nnueInputRef.current) nnueInputRef.current.value = '';
  };

  const handleSelectAuxFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    for (const file of files) {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.txt')) {
        try {
          const parsedOpts = parseEvalOptionsTxt(await file.text());
          if (parsedOpts.fvScale !== undefined) {
            setFvScale(parsedOpts.fvScale);
          }
        } catch (err) {
          console.warn('[SettingsAiTab] Failed to parse eval options:', err);
        }
      } else if (lower.endsWith('.bin')) {
        setSelectedProgressFile(file);
      }
    }
    setFormMessage(null);
    if (auxInputRef.current) auxInputRef.current.value = '';
  };

  const handleRegisterCustomEngine = async () => {
    const trimmedName = metaValues.name.trim();
    if (!trimmedName) {
      setFormMessage({ type: 'err', text: t('settings.ai.engine_name_required') });
      return;
    }

    setIsRegistering(true);
    setFormMessage(null);
    const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    try {
      if (addMode === 'local-exe') {
        const trimmedExe = exePath.trim();
        if (!trimmedExe) {
          setFormMessage({ type: 'err', text: t('settings.ai.exe_path_required') });
          return;
        }
        saveCustomEngineProfile({
          id,
          displayName: trimmedName,
          author: metaValues.author.trim() || 'Custom USI Engine',
          architecture: metaValues.architecture.trim() || 'Local USI Executable (.exe)',
          description: metaValues.description.trim() || trimmedExe,
          isBuiltin: false,
          transportType: 'local-exe',
          exePath: trimmedExe,
          sizeBytes: 0,
          sizeFormatted: 'Local .exe',
          createdAt: now,
        });
      } else if (addMode === 'websocket-usi') {
        const trimmedUrl = wsUrl.trim();
        if (!trimmedUrl.startsWith('ws://') && !trimmedUrl.startsWith('wss://')) {
          setFormMessage({ type: 'err', text: t('settings.ai.ws_probe_fail') });
          return;
        }
        saveCustomEngineProfile({
          id,
          displayName: trimmedName,
          author: metaValues.author.trim() || 'Custom USI Engine',
          architecture: metaValues.architecture.trim() || 'External USI (WebSocket)',
          description: metaValues.description.trim() || trimmedUrl,
          isBuiltin: false,
          transportType: 'websocket-usi',
          wsUrl: trimmedUrl,
          sizeBytes: 0,
          sizeFormatted: 'WebSocket',
          createdAt: now,
        });
      } else {
        if (!selectedNnFile) {
          setFormMessage({ type: 'err', text: t('settings.ai.nnue_missing_error') });
          return;
        }
        const nnBuffer = await selectedNnFile.arrayBuffer();
        const progressBuffer = selectedProgressFile
          ? await selectedProgressFile.arrayBuffer()
          : undefined;
        const totalSize = nnBuffer.byteLength + (progressBuffer?.byteLength ?? 0);

        await saveCustomEngineModelBinary({
          id,
          nnFileName: selectedNnFile.name,
          nnBuffer,
          progressFileName: selectedProgressFile?.name,
          progressBuffer,
          tagJson: parsedTagJson,
          sizeBytes: totalSize,
          createdAt: now,
        });

        saveCustomEngineProfile({
          id,
          displayName: trimmedName,
          author: metaValues.author.trim() || 'Custom NNUE Author',
          architecture: metaValues.architecture.trim() || 'User NNUE Model (IndexedDB)',
          description: metaValues.description.trim() || selectedNnFile.name,
          isBuiltin: false,
          transportType: 'custom-nnue',
          customModelId: id,
          fvScale,
          sizeBytes: totalSize,
          sizeFormatted: formatEngineSizeBytes(totalSize),
          createdAt: now,
        });
      }

      setFormMessage({
        type: 'ok',
        text: t('settings.ai.engine_registered', { name: trimmedName }),
      });
      setMetaValues({ name: '', author: '', architecture: '', description: '' });
      setLoadedTagFileName(null);
      setParsedTagJson(undefined);
      setExePath('');
      setSelectedNnFile(null);
      setSelectedProgressFile(null);
      setFvScale(undefined);
    } catch (err) {
      console.error('[SettingsAiTab] Failed to register engine:', err);
      setFormMessage({ type: 'err', text: t('settings.ai.nnue_missing_error') });
    } finally {
      setIsRegistering(false);
    }
  };

  const renderTransportBadge = (eng: EngineProfile) => {
    if (eng.transportType === 'local-exe') {
      return (
        <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30 text-[10px] font-semibold">
          {t('settings.ai.badge_local_exe')}
        </span>
      );
    }
    if (eng.transportType === 'websocket-usi') {
      return (
        <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-semibold">
          {t('settings.ai.badge_websocket_usi')}
        </span>
      );
    }
    if (eng.transportType === 'custom-nnue') {
      return (
        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold">
          {t('settings.ai.badge_custom_nnue')}
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-semibold">
        {t('settings.ai.badge_builtin_wasm')}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Opening Book (.db) Registry */}
      <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
        <h4 className="text-xs font-bold text-slate-200">{t('settings.ai.book_title')}</h4>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {t('settings.ai.book_desc')}
        </p>
        {isBookFilePickerSupported() && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                readOnly
                value={pendingBookHandle?.name ?? ''}
                placeholder="user_book1.db"
                className="flex-1 min-w-[160px] rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    const h = await pickBookFileHandleOnly();
                    if (h) {
                      setPendingBookHandle(h);
                      if (!newBookName.trim()) {
                        setNewBookName(h.name.replace(/\.(db|txt)$/i, ''));
                      }
                    }
                  } catch {
                    // user cancelled
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
              >
                📁 {t('settings.ai.browse_btn', '参照...')}
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input
                type="text"
                value={newBookName}
                onChange={(e) => setNewBookName(e.target.value)}
                placeholder={t('settings.ai.book_name_placeholder', '定跡DB名（任意）')}
                className="flex-1 min-w-[160px] rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-500/60 focus:outline-none"
              />
              <button
                type="button"
                disabled={!pendingBookHandle}
                onClick={async () => {
                  if (!pendingBookHandle) return;
                  await saveRegisteredBookProfile(pendingBookHandle, newBookName);
                  setBookProfiles(loadBookProfiles());
                  setPendingBookHandle(null);
                  setNewBookName('');
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-xs font-bold transition"
              >
                + {t('settings.ai.book_register_btn', '定跡DBを登録')}
              </button>
            </div>
          </div>
        )}
        {bookProfiles.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {bookProfiles.map((bp) => (
              <div
                key={bp.id}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900/70 border border-slate-800 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-slate-200">{bp.name}</span>
                  <span className="ml-2 text-[11px] text-slate-400 font-mono">
                    ({bp.fileName})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await removeBookProfile(bp.id);
                    setBookProfiles(loadBookProfiles());
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-rose-900/50 text-slate-300 hover:text-rose-300 text-[11px]"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-400 mb-2">
          {t('settings.ai.default_engine')}
        </label>
        <div className="space-y-2">
          {engines.map((eng) => {
            const isSelected = settings.defaultEngineId === eng.id;
            const isEditing = editingEngineId === eng.id;
            return (
              <div
                key={eng.id}
                className={`w-full rounded-lg border transition ${
                  isSelected
                    ? 'border-amber-500/60 bg-amber-500/10'
                    : 'border-slate-700 bg-slate-950/50 hover:border-slate-600'
                }`}
              >
                <div className="flex items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => handleEngineChange(eng.id)}
                    className="flex-1 text-left px-3 py-2.5 min-w-0"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold text-slate-100 truncate">
                          {resolveEngineDisplayName(eng, t)}
                        </span>
                        {renderTransportBadge(eng)}
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono shrink-0">
                        {eng.author} · {eng.sizeFormatted}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {resolveEngineDescription(eng, t)}
                    </p>
                  </button>

                  {!eng.isBuiltin && (
                    <div className="flex items-center gap-1.5 pr-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEditMeta(eng)}
                        className={`px-2 py-1 rounded border text-[10px] transition ${
                          isEditing
                            ? 'bg-amber-600/20 border-amber-500/60 text-amber-300'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                        }`}
                        title={t('settings.ai.edit_meta_title')}
                      >
                        ✏️
                      </button>

                      {confirmDeleteId === eng.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleDeleteCustomEngine(eng)}
                            className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold"
                          >
                            {t('settings.ai.delete_engine_confirm')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px]"
                          >
                            {t('settings.ai.delete_engine_cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(eng.id)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-800 text-[10px] transition"
                          title={t('settings.ai.delete_engine')}
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {isEditing && !eng.isBuiltin && (
                  <div className="border-t border-slate-800 px-3 py-3 space-y-2.5 bg-slate-950/60 rounded-b-lg">
                    <p className="text-[11px] font-bold text-amber-300">
                      {t('settings.ai.edit_meta_title')}
                    </p>
                    <EngineMetadataFields
                      values={editMeta}
                      onChange={setEditMeta}
                      loadedTagFileName={editTagFileName}
                      onTagLoaded={(fname) => {
                        setEditTagFileName(fname);
                        setEditError(null);
                      }}
                      onTagError={() => setEditError(t('settings.ai.tag_json_parse_error'))}
                    />
                    {editError && <p className="text-xs text-rose-400">{editError}</p>}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingEngineId(null)}
                        className="rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-1.5 transition"
                      >
                        {t('settings.ai.edit_meta_cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEditedMeta(eng)}
                        className="rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold px-3 py-1.5 transition"
                      >
                        {t('settings.ai.edit_meta_save')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add Custom USI Engine / NNUE Evaluation Panel */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => {
              setIsAddOpen((v) => !v);
              setFormMessage(null);
            }}
            className="text-xs font-semibold text-amber-400 hover:text-amber-300 underline transition"
          >
            {isAddOpen ? t('settings.ai.add_engine_close') : t('settings.ai.add_engine_toggle')}
          </button>

          {isAddOpen && (
            <div className="mt-2.5 rounded-xl border border-slate-700 bg-slate-950/70 p-3.5 space-y-4">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {t('settings.ai.add_engine_desc')}
              </p>

              {/* Section 1: Engine Body / Connection */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-3">
                <p className="text-xs font-bold text-slate-200">{t('settings.ai.step1_body_title')}</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAddMode('local-exe');
                      setFormMessage(null);
                    }}
                    className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition ${
                      addMode === 'local-exe'
                        ? 'border-violet-500/60 bg-violet-500/15 text-violet-300'
                        : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🖥️ {t('settings.ai.mode_local_exe')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddMode('custom-nnue');
                      setFormMessage(null);
                    }}
                    className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition ${
                      addMode === 'custom-nnue'
                        ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                        : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    📂 {t('settings.ai.mode_nnue')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddMode('websocket-usi');
                      setFormMessage(null);
                    }}
                    className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition ${
                      addMode === 'websocket-usi'
                        ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                        : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    🔌 {t('settings.ai.mode_websocket')}
                  </button>
                </div>

                {addMode === 'local-exe' ? (
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        {t('settings.ai.exe_path_label')}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={exePath}
                          onChange={(e) => setExePath(e.target.value)}
                          placeholder={t('settings.ai.exe_path_placeholder')}
                          className="flex-1 min-w-[200px] rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-200 focus:border-violet-500/60 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void handleBrowseLocalExe()}
                          className="shrink-0 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold px-3 py-1.5 transition"
                        >
                          {t('settings.ai.exe_browse_btn')}
                        </button>
                        <button
                          type="button"
                          disabled={isProbing}
                          onClick={() => void handleProbeLocalExe()}
                          className="shrink-0 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 transition"
                        >
                          {isProbing ? t('settings.ai.ws_probing') : t('settings.ai.exe_probe_btn')}
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      {t('settings.ai.exe_hint')}
                    </p>
                  </div>
                ) : addMode === 'websocket-usi' ? (
                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                        {t('settings.ai.ws_url_label')}
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={wsUrl}
                          onChange={(e) => setWsUrl(e.target.value)}
                          placeholder={t('settings.ai.ws_url_placeholder')}
                          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-200 focus:border-sky-500/60 focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={isProbing}
                          onClick={() => void handleProbeWebSocket()}
                          className="shrink-0 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 transition"
                        >
                          {isProbing ? t('settings.ai.ws_probing') : t('settings.ai.ws_probe_btn')}
                        </button>
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-900/80 border border-slate-800 p-2 text-[10px] text-slate-400 space-y-1">
                      <p>{t('settings.ai.ws_bridge_hint')}</p>
                      <code className="block font-mono text-amber-300/90 break-all">
                        node tools/usi-bridge/usi-websocket-bridge.mjs &quot;path/to/engine.exe&quot; --port 9000
                      </code>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {/* Primary binary picker (nn.bin / .nnue) */}
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-200 border border-emerald-700/60 text-xs font-semibold cursor-pointer transition">
                        <span>📂 {t('settings.ai.nnue_file_pick')}</span>
                        <input
                          ref={nnueInputRef}
                          type="file"
                          accept=".bin,.nnue"
                          onChange={handleSelectNnFile}
                          className="hidden"
                        />
                      </label>
                      {selectedNnFile && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-[11px] text-emerald-300 font-mono">
                          <span>
                            ✓ {selectedNnFile.name} ({formatEngineSizeBytes(selectedNnFile.size)})
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedNnFile(null)}
                            className="text-emerald-200 hover:text-white leading-none"
                          >
                            ✕
                          </button>
                        </span>
                      )}
                    </div>

                    {/* Optional auxiliary files (progress.bin / eval_options.txt) */}
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-medium cursor-pointer transition">
                        <span>➕ {t('settings.ai.nnue_aux_pick')}</span>
                        <input
                          ref={auxInputRef}
                          type="file"
                          accept=".bin,.txt"
                          multiple
                          onChange={(e) => void handleSelectAuxFiles(e)}
                          className="hidden"
                        />
                      </label>
                      {selectedProgressFile && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300 font-mono">
                          <span>✓ {selectedProgressFile.name}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedProgressFile(null)}
                            className="text-slate-400 hover:text-white"
                          >
                            ✕
                          </button>
                        </span>
                      )}
                      {fvScale !== undefined && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-amber-300 font-mono">
                          <span>{t('settings.ai.fv_scale_badge', { value: fvScale })}</span>
                          <button
                            type="button"
                            onClick={() => setFvScale(undefined)}
                            className="text-slate-400 hover:text-white"
                          >
                            ✕
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: Display Name, Credits & Tag Metadata (independent from binary selection) */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-2.5">
                <p className="text-xs font-bold text-slate-200">{t('settings.ai.step2_meta_title')}</p>
                <EngineMetadataFields
                  values={metaValues}
                  onChange={setMetaValues}
                  loadedTagFileName={loadedTagFileName}
                  onTagLoaded={(fname, raw) => {
                    setLoadedTagFileName(fname);
                    setParsedTagJson(raw);
                    setFormMessage(null);
                  }}
                  onTagError={() =>
                    setFormMessage({ type: 'err', text: t('settings.ai.tag_json_parse_error') })
                  }
                />
              </div>

              {formMessage && (
                <p
                  className={`text-xs font-medium ${
                    formMessage.type === 'ok' ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {formMessage.text}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={isRegistering}
                  onClick={() => void handleRegisterCustomEngine()}
                  className="rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 text-xs font-bold px-3.5 py-1.5 transition"
                >
                  {t('settings.ai.engine_register_btn')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-400 mb-2">
          {t('settings.ai.default_depth')}
        </label>
        <div className="flex gap-2">
          {DEPTH_OPTIONS.map((depth) => (
            <button
              key={depth}
              type="button"
              onClick={() => updateSettings({ defaultAnalysisDepth: depth })}
              className={`flex-1 rounded-lg border px-2 py-2 text-sm font-mono font-semibold transition ${
                settings.defaultAnalysisDepth === depth
                  ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                  : 'border-slate-700 bg-slate-950/50 text-slate-300 hover:border-slate-600'
              }`}
            >
              {t('settings.ai.depth_option', { depth })}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-400 mb-2">
          {t('settings.ai.default_cloud_level')}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {([
            { id: 'light', labelKey: 'settings.ai.cloud_level_light_desc' },
            { id: 'standard', labelKey: 'settings.ai.cloud_level_standard_desc' },
            { id: 'deep', labelKey: 'settings.ai.cloud_level_deep_desc' },
          ] as Array<{ id: CloudAnalysisLevelSetting; labelKey: string }>).map((lvl) => (
            <button
              key={lvl.id}
              type="button"
              onClick={() => updateSettings({ defaultCloudAnalysisLevel: lvl.id })}
              className={`rounded-lg border px-2.5 py-2 text-xs font-semibold transition ${
                (settings.defaultCloudAnalysisLevel ?? 'standard') === lvl.id
                  ? 'border-sky-500/60 bg-sky-500/10 text-sky-300'
                  : 'border-slate-700 bg-slate-950/50 text-slate-300 hover:border-slate-600'
              }`}
            >
              {t(lvl.labelKey)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

/** Maps a raw storage key to its i18n label key (settings.data.keys.*). */
function storageKeyLabelKey(key: string): string {
  switch (key) {
    case 'joseki_tree_kifu_records':
      return 'settings.data.keys.kifu_records';
    case 'joseki_tree_app_settings':
      return 'settings.data.keys.app_settings';
    case 'joseki_tree_custom_engines':
      return 'settings.data.keys.custom_engines';
    case 'joseki_tree_quiz_pool':
      return 'settings.data.keys.quiz_pool';
    case 'joseki_tree_quiz_progress':
      return 'settings.data.keys.quiz_progress';
    case 'joseki_tree_match_history':
      return 'settings.data.keys.match_history';
    case 'joseki_tree_players':
      return 'settings.data.keys.players';
    case 'joseki_tree_custom_tag_groups':
      return 'settings.data.keys.custom_tag_groups';
    case 'joseki_tree_tsumego_pool_v3':
      return 'settings.data.keys.tsumego_pool';
    case 'joseki_tree_tsumego_attempts':
      return 'settings.data.keys.tsumego_attempts';
    case 'joseki_tree_last_session':
      return 'settings.data.keys.last_session';
    case 'joseki_tree_guest_mode':
      return 'settings.data.keys.guest_mode';
    case 'joseki_tree_studio_saved_games':
    case 'joseki_tree_studio_games':
      return 'settings.data.keys.legacy_studio';
    case 'joseki_tree_ingested_games':
      return 'settings.data.keys.legacy_ingested';
    case 'joseki_tree_last_sync':
      return 'settings.data.keys.last_sync';
    default:
      if (key.startsWith('joseki_tree_srs_cards_')) {
        return 'settings.data.keys.srs_cards';
      }
      return '';
  }
}

const SettingsDataTab: React.FC = () => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [usageRefreshKey, setUsageRefreshKey] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const [syncDirName, setSyncDirName] = useState<string | null>(null);
  const [syncOpts, setSyncOpts] = useState(() => getFolderSyncOptions());
  const [folderSyncMsg, setFolderSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    void getSavedSyncDirectoryName().then(setSyncDirName);
  }, []);

  const usage: StorageUsageEntry[] = React.useMemo(
    () => collectStorageUsage(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usageRefreshKey]
  );
  const totalBytes = usage.reduce((sum, e) => sum + e.bytes, 0);
  const kifuCount = React.useMemo(() => loadKifuRecords().length, [usageRefreshKey]);

  const handleExport = () => {
    downloadBackupFile();
    setIsError(false);
    setMessage(t('settings.data.export_done'));
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const backup = parseBackupJson(text);
      const result: RestoreResult = restoreBackupData(backup.data);
      setIsError(false);
      setMessage(
        t('settings.data.import_done', {
          keys: result.restoredKeys.length,
          added: result.addedKifuRecords,
          skipped: result.skippedKifuDuplicates,
        })
      );
      setUsageRefreshKey((k) => k + 1);
    } catch {
      setIsError(true);
      setMessage(t('settings.data.import_failed'));
    }
  };

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    resetAllAppData();
    setConfirmReset(false);
    setUsageRefreshKey((k) => k + 1);
    setIsError(false);
    setMessage(t('settings.data.reset_done'));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-slate-200">{t('settings.data.usage_title')}</p>
          <span className="text-xs font-mono text-slate-400">{formatBytes(totalBytes)}</span>
        </div>
        {usage.length === 0 ? (
          <p className="text-[11px] text-slate-500">{t('settings.data.usage_empty')}</p>
        ) : (
          <div className="max-h-40 overflow-y-auto">
            <table className="w-full text-[11px]">
              <tbody>
                {usage.map((entry) => {
                  const labelKey = storageKeyLabelKey(entry.key);
                  return (
                    <tr key={entry.key} className="border-t border-slate-800/60">
                      <td className="py-1 pr-2 text-slate-300">
                        <span>{labelKey ? t(labelKey) : entry.key}</span>
                        <span className="block font-mono text-[9px] text-slate-600 truncate" title={entry.key}>
                          {entry.key}
                        </span>
                      </td>
                      <td className="py-1 text-right font-mono text-slate-300 whitespace-nowrap">
                        {formatBytes(entry.bytes)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-200">{t('settings.data.backup_title')}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{t('settings.data.backup_desc')}</p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold px-3 py-2 transition"
          >
            {t('settings.data.export')}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-200">{t('settings.data.restore_title')}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{t('settings.data.restore_desc')}</p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-bold px-3 py-2 transition"
          >
            {t('settings.data.import')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Danger zone: full reset with two-step confirmation (#49) */}
      <div className="rounded-lg border border-rose-900/60 bg-rose-950/20 p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-rose-300">{t('settings.data.reset_title')}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{t('settings.data.reset_desc')}</p>
        </div>
        {confirmReset ? (
          <div className="rounded-lg border border-rose-700/60 bg-rose-950/40 p-3 space-y-2">
            <p className="text-xs text-rose-200">
              {t('settings.data.reset_confirm', { keys: usage.length, kifu: kifuCount })}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-3 py-1.5 transition"
              >
                {t('settings.data.reset_yes')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold px-3 py-1.5 transition"
              >
                {t('settings.data.reset_cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg border border-rose-700/60 bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 text-xs font-bold px-3 py-2 transition"
          >
            {t('settings.data.reset_button')}
          </button>
        )}
      </div>

      {/* Optional Folder Sync & Full JSON Backup */}
      <div className="pt-4 border-t border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-bold text-slate-200">
            {t('settings.folder_sync.title')}
          </h4>
          {syncDirName && (
            <span className="text-[11px] text-emerald-400 font-mono">
              📁 {syncDirName}
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {t('settings.folder_sync.desc')}
        </p>

        {isDirectoryPickerSupported() && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  const name = await pickSyncDirectory();
                  if (name) {
                    setSyncDirName(name);
                    setFolderSyncMsg(t('settings.folder_sync.folder_selected', { name }));
                  }
                } catch {
                  // user cancelled
                }
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
            >
              📁 {t('settings.folder_sync.pick_folder')}
            </button>
            {syncDirName && (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await writeBackupToSyncDirectory();
                    setFolderSyncMsg(
                      ok
                        ? t('settings.folder_sync.backup_done')
                        : t('settings.folder_sync.action_failed')
                    );
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold transition"
                >
                  💾 {t('settings.folder_sync.backup_now')}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await readBackupFromSyncDirectory();
                    setFolderSyncMsg(
                      res
                        ? t('settings.folder_sync.sync_done', {
                            added:
                              res.addedKifu +
                              res.addedTactics +
                              res.addedTsumego +
                              res.addedQuiz,
                            updated:
                              res.updatedKifu +
                              res.updatedTactics +
                              res.updatedTsumego +
                              res.updatedQuiz,
                          })
                        : t('settings.folder_sync.action_failed')
                    );
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-semibold transition"
                >
                  🔄 {t('settings.folder_sync.sync_now')}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await clearSyncDirectoryHandle();
                    setSyncDirName(null);
                  }}
                  className="px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 text-xs transition"
                >
                  {t('settings.folder_sync.clear_folder')}
                </button>
              </>
            )}
          </div>
        )}

        <div className="space-y-1.5 text-xs text-slate-300">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={syncOpts.autoSyncOnStartup}
              onChange={(e) => {
                const next = { ...syncOpts, autoSyncOnStartup: e.target.checked };
                setSyncOpts(next);
                saveFolderSyncOptions(next);
              }}
              className="rounded border-slate-700 bg-slate-900 text-amber-500"
            />
            <span>{t('settings.folder_sync.auto_sync_startup')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={syncOpts.autoBackupOnExit}
              onChange={(e) => {
                const next = { ...syncOpts, autoBackupOnExit: e.target.checked };
                setSyncOpts(next);
                saveFolderSyncOptions(next);
              }}
              className="rounded border-slate-700 bg-slate-900 text-amber-500"
            />
            <span>{t('settings.folder_sync.auto_backup_exit')}</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              const bundle = exportFullBackupBundle();
              const blob = new Blob([JSON.stringify(bundle, null, 2)], {
                type: 'application/json',
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `joseki-tree-backup-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold transition"
          >
            ⬇️ {t('settings.folder_sync.export_json')}
          </button>
          <label className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold transition cursor-pointer">
            ⬆️ {t('settings.folder_sync.import_json')}
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const parsed = JSON.parse(text) as FullBackupBundle;
                  if (parsed && parsed.version === 1 && parsed.appName === 'joseki-tree') {
                    const res = mergeFullBackupBundle(parsed);
                    setFolderSyncMsg(
                      t('settings.folder_sync.sync_done', {
                        added:
                          res.addedKifu +
                          res.addedTactics +
                          res.addedTsumego +
                          res.addedQuiz,
                        updated:
                          res.updatedKifu +
                          res.updatedTactics +
                          res.updatedTsumego +
                          res.updatedQuiz,
                      })
                    );
                  } else {
                    setFolderSyncMsg(t('settings.folder_sync.action_failed'));
                  }
                } catch {
                  setFolderSyncMsg(t('settings.folder_sync.action_failed'));
                }
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {folderSyncMsg && (
          <p className="text-[11px] text-emerald-400">{folderSyncMsg}</p>
        )}
      </div>

      {message && (
        <p className={`text-xs ${isError ? 'text-rose-400' : 'text-emerald-400'}`}>
          {message}
          {message === t('settings.data.reset_done') && (
            <span className="block mt-1 text-slate-400">{t('settings.data.reload_notice')}</span>
          )}
        </p>
      )}
    </div>
  );
};

const SettingsAccountTab: React.FC = () => {
  const { t } = useTranslation();
  const { user, isConfigured, isLoading } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isSyncError, setIsSyncError] = useState(false);
  const [lastSync, setLastSync] = useState<LastSyncInfo | null>(() => getLastSyncInfo());

  // Custom Firebase configuration state (BYOF)
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configInput, setConfigInput] = useState('');
  const [byofMessage, setByofMessage] = useState<string | null>(null);
  const [isByofError, setIsByofError] = useState(false);
  const [isRulesCopied, setIsRulesCopied] = useState(false);
  const [showUid, setShowUid] = useState(false);

  const activeConfig = getActiveFirebaseConfig();
  const hasCustomConfig = Boolean(getCustomFirebaseConfig());

  const canSync = isConfigured && Boolean(user?.uid) && !user?.uid?.startsWith('sandbox-');

  const handleSaveCustomFirebase = () => {
    setByofMessage(null);
    setIsByofError(false);
    const parsed = parseFirebaseConfigInput(configInput);
    if (!parsed) {
      setIsByofError(true);
      setByofMessage(t('settings.account.byof_invalid_config'));
      return;
    }
    saveCustomFirebaseConfig(parsed);
    setConfigInput('');
    setIsConfigOpen(false);
    setByofMessage(t('settings.account.byof_save_success'));
  };

  const handleClearCustomFirebase = () => {
    setByofMessage(null);
    setIsByofError(false);
    clearCustomFirebaseConfig();
    setConfigInput('');
    setIsConfigOpen(false);
    setByofMessage(t('settings.account.byof_clear_success'));
  };

  const handleSync = async () => {
    if (!user?.uid || isSyncing) return;
    setIsSyncing(true);
    setSyncMessage(null);
    setIsSyncError(false);
    try {
      const result = await syncKifuRecordsWithCloud(user.uid);
      setLastSync(getLastSyncInfo());
      setSyncMessage(
        t('settings.account.sync_done', {
          pulled: result.pulled,
          pushed: result.pushed,
          migrated: result.migrated,
        })
      );
    } catch {
      setIsSyncError(true);
      setSyncMessage(t('settings.account.sync_failed'));
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Account status */}
      <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4 space-y-2">
        <p className="text-sm font-semibold text-slate-200">{t('settings.account.status_title')}</p>
        {isLoading ? (
          <p className="text-xs text-slate-400">{t('settings.account.loading')}</p>
        ) : !isConfigured ? (
          <p className="text-xs text-slate-400">{t('settings.account.not_configured')}</p>
        ) : user ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-slate-100 font-medium truncate">
                {user.displayName || user.email || user.uid}
              </p>
              {user.email && user.displayName && (
                <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
              )}
            </div>
            <AuthStatusButton />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">{t('settings.account.signed_out')}</p>
            <AuthStatusButton />
          </div>
        )}
      </div>

      {/* Cloud sync */}
      <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-slate-200">{t('settings.account.sync_title')}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{t('settings.account.sync_desc')}</p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] text-slate-400">
            {lastSync ? (
              <span>
                {t('settings.account.last_sync', {
                  time: new Date(lastSync.syncedAt).toLocaleString(),
                })}
              </span>
            ) : (
              <span>{t('settings.account.never_synced')}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={!canSync || isSyncing}
            className="shrink-0 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 text-xs font-bold px-3 py-2 transition"
          >
            {isSyncing ? t('settings.account.sync_running') : t('settings.account.sync_now')}
          </button>
        </div>

        {!canSync && isConfigured && !isLoading && (
          <p className="text-[11px] text-slate-500">{t('settings.account.sync_requires_login')}</p>
        )}
        {syncMessage && (
          <p className={`text-xs ${isSyncError ? 'text-rose-400' : 'text-emerald-400'}`}>
            {syncMessage}
          </p>
        )}
      </div>

      {/* Custom Firebase configuration (BYOF: Bring Your Own Firebase) */}
      <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-200">{t('settings.account.byof_title')}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{t('settings.account.byof_desc')}</p>
          </div>
          <div className="shrink-0">
            {isConfigured && activeConfig.projectId ? (
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/30">
                {t('settings.account.byof_status_connected', { projectId: activeConfig.projectId })}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400 border border-slate-700">
                {t('settings.account.byof_status_local')}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsConfigOpen((v) => !v)}
          className="text-xs text-amber-400 hover:text-amber-300 underline font-medium transition"
        >
          {isConfigOpen
            ? t('settings.account.byof_close_config')
            : t('settings.account.byof_open_config')}
        </button>

        {isConfigOpen && (
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                {t('settings.account.byof_input_label')}
              </label>
              <textarea
                value={configInput}
                onChange={(e) => setConfigInput(e.target.value)}
                placeholder={t('settings.account.byof_input_placeholder')}
                rows={5}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-amber-500/60 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveCustomFirebase}
                className="rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold px-3 py-1.5 transition"
              >
                {t('settings.account.byof_save_btn')}
              </button>
              {hasCustomConfig && (
                <button
                  type="button"
                  onClick={handleClearCustomFirebase}
                  className="rounded-lg border border-rose-700/60 bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 text-xs font-bold px-3 py-1.5 transition"
                >
                  {t('settings.account.byof_clear_btn')}
                </button>
              )}
            </div>
          </div>
        )}

        {byofMessage && (
          <p className={`text-xs ${isByofError ? 'text-rose-400' : 'text-emerald-400'}`}>
            {byofMessage}
          </p>
        )}

        {user?.uid && (
          <div className="mt-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-400 flex items-center gap-1.5">
                UID:{' '}
                <code className="text-slate-200 font-mono">
                  {showUid ? user.uid : '••••••••••••'}
                </code>
                <button
                  type="button"
                  onClick={() => setShowUid((v) => !v)}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px]"
                  aria-label="Toggle UID visibility"
                >
                  {showUid ? '🙈' : '👁️'}
                </button>
              </span>
              <button
                type="button"
                onClick={() => {
                  const rules = [
                    "rules_version = '2';",
                    'service cloud.firestore {',
                    '  match /databases/{database}/documents {',
                    '    match /users/{userId}/{document=**} {',
                    '      allow read, write: if request.auth != null',
                    '        && request.auth.uid == userId',
                    `        && request.auth.uid == "${user.uid}";`,
                    '    }',
                    '  }',
                    '}',
                  ].join('\n');
                  void navigator.clipboard.writeText(rules);
                  setIsRulesCopied(true);
                  window.setTimeout(() => setIsRulesCopied(false), 2500);
                }}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-[11px] font-semibold transition shrink-0"
              >
                {isRulesCopied
                  ? t('settings.account.byof_copy_rules_done')
                  : t('settings.account.byof_copy_rules_btn')}
              </button>
            </div>
          </div>
        )}

        {/* Optional Folder Sync removed from Account tab (moved to Data Management tab) */}
      </div>
    </div>
  );
};

interface OssLibraryCredit {
  name: string;
  author: string;
  license: string;
}

const OSS_LIBRARY_CREDITS: readonly OssLibraryCredit[] = [
  { name: 'shogi.js', author: 'na2hiro', license: 'MIT' },
  { name: 'json-kifu-format', author: 'na2hiro', license: 'MIT' },
  { name: '@multi-game-engines/adapter-fairy-stockfish-shogi', author: 'hdkz-dev', license: 'MIT' },
  { name: 'React / React DOM', author: 'Meta Platforms, Inc.', license: 'MIT' },
  { name: 'React Router', author: 'Remix Software Inc.', license: 'MIT' },
  { name: 'Chart.js / react-chartjs-2', author: 'Chart.js Contributors', license: 'MIT' },
  { name: 'i18next / react-i18next', author: 'i18next Contributors', license: 'MIT' },
  { name: 'Firebase JS SDK', author: 'Google LLC', license: 'Apache-2.0' },
  { name: 'Tauri', author: 'The Tauri Programme', license: 'MIT / Apache-2.0' },
];

const FAIRY_STOCKFISH_SOURCE_URL = 'https://github.com/fairy-stockfish/fairy-stockfish.wasm';
const SHOGI_IMAGES_URL = 'https://sunfish-shogi.github.io/shogi-images/';

const SettingsAboutTab: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { closeSettings } = useSettings();
  const [engineList, setEngineList] = useState<EngineProfile[]>(() => getAllEngineProfiles());

  useEffect(() => {
    setEngineList(getAllEngineProfiles());
    return subscribeEngineRegistryChange(() => {
      setEngineList(getAllEngineProfiles());
    });
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-200">{t('settings.about.app_title')}</p>
            <p className="text-xs font-bold text-amber-300">{t('app.title')}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              closeSettings();
              navigate('/guide');
            }}
            className="px-2.5 py-1.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 text-xs font-semibold transition shrink-0"
          >
            📘 {t('settings.about.open_guide_btn')}
          </button>
        </div>
        <p className="text-[11px] text-slate-300">{t('app.description')}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 pt-0.5">
          <span>{t('settings.about.version', { version: pkg.version })}</span>
          <span>·</span>
          <span>{t('settings.about.license_label', { license: 'GNU GPL-3.0' })}</span>
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-200">{t('settings.about.engine_credits')}</p>

        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {t('settings.about.client_engines')}
          </p>
          {engineList.map((eng) => (
            <div key={eng.id} className="text-[11px] text-slate-400 space-y-0.5">
              <div>
                <span className="text-slate-300 font-medium">{resolveEngineDisplayName(eng, t)}</span>
                <span className="text-slate-500">
                  {' '}— {eng.author}
                  {eng.architecture ? ` (${eng.architecture})` : ''}
                </span>
              </div>
              {eng.id === 'fairy-stockfish' && (
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 pl-2">
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                    GPL-3.0
                  </span>
                  <a
                    href={FAIRY_STOCKFISH_SOURCE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-300 hover:underline"
                  >
                    {t('settings.about.source_link_label')} ↗
                  </a>
                  <a
                    href={`${import.meta.env.BASE_URL}engine/Copying.txt`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-300 hover:underline"
                  >
                    {t('settings.about.license_text_label')} ↗
                  </a>
                  <a
                    href={`${import.meta.env.BASE_URL}engine/AUTHORS`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-300 hover:underline"
                  >
                    AUTHORS ↗
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-1 pt-2 border-t border-slate-800/80">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {t('settings.about.asset_credits')}
          </p>
          <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <a
              href={SHOGI_IMAGES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-300 hover:underline font-medium"
            >
              sunfish-shogi / shogi-images ↗
            </a>
            <span className="text-slate-500">— {t('settings.about.asset_shogi_images_note')}</span>
          </div>
        </div>

        <div className="space-y-1 pt-2 border-t border-slate-800/80">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {t('settings.about.oss_credits')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
            {OSS_LIBRARY_CREDITS.map((lib) => (
              <div key={lib.name} className="text-[11px] text-slate-400 truncate">
                <span className="text-slate-300 font-medium">{lib.name}</span>
                <span className="text-slate-500"> — {lib.author} ({lib.license})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-700 bg-slate-950/50 p-4 space-y-1.5">
        <p className="text-xs font-semibold text-slate-200">{t('settings.about.disclaimer_title')}</p>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {t('settings.about.disclaimer_body')}
        </p>
      </div>
    </div>
  );
};

const SettingsAppearanceTab: React.FC = () => {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const [customAssets, setCustomAssets] = useState<CustomAssetsState>(() =>
    getCachedCustomAssets()
  );

  useEffect(() => {
    let active = true;
    void initCustomAssetsCache().then((loaded) => {
      if (active) setCustomAssets(loaded);
    });
    const unsubscribe = subscribeCustomAssets(() => {
      setCustomAssets(getCachedCustomAssets());
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleAssetUpload = (kind: CustomAssetKind, file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      void saveCustomAsset(kind, result).then((next) => {
        setCustomAssets(next);
        if (kind === 'board') {
          updateSettings({ boardTheme: 'custom' });
        } else if (kind === 'pieces') {
          updateSettings({ pieceStyle: 'custom' });
        } else {
          updateSettings({ soundEnabled: true });
        }
      });
    };
    reader.readAsDataURL(file);
  };

  const handleAssetReset = (kind: CustomAssetKind) => {
    void clearCustomAsset(kind).then((next) => {
      setCustomAssets(next);
      if (kind === 'board' && settings.boardTheme === 'custom') {
        updateSettings({ boardTheme: 'kaya' });
      } else if (kind === 'pieces' && settings.pieceStyle === 'custom') {
        updateSettings({ pieceStyle: 'single' });
      }
    });
  };

  const assetRows: Array<{
    kind: CustomAssetKind;
    icon: string;
    labelKey: string;
    hintKey: string;
    accept: string;
    isConfigured: boolean;
  }> = [
    {
      kind: 'board',
      icon: '🪵',
      labelKey: 'settings.custom_assets.board_label',
      hintKey: 'settings.custom_assets.board_hint',
      accept: '.svg,image/svg+xml,image/png,image/jpeg,image/webp',
      isConfigured: Boolean(customAssets.boardDataUrl),
    },
    {
      kind: 'pieces',
      icon: '♟️',
      labelKey: 'settings.custom_assets.pieces_label',
      hintKey: 'settings.custom_assets.pieces_hint',
      accept: '.svg,image/svg+xml,image/png,image/jpeg,image/webp',
      isConfigured: Boolean(customAssets.pieceSpriteDataUrl),
    },
    {
      kind: 'sound',
      icon: '🔊',
      labelKey: 'settings.custom_assets.sound_label',
      hintKey: 'settings.custom_assets.sound_hint',
      accept: 'audio/*,.mp3,.wav,.ogg,.m4a',
      isConfigured: Boolean(customAssets.soundDataUrl),
    },
  ];

  return (
    <div className="space-y-4">
      <h4 className="text-xs font-bold text-slate-200">
        {t('settings.general.appearance_title')}
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
            {t('settings.general.board_theme')}
          </label>
          <select
            value={settings.boardTheme ?? 'kaya'}
            onChange={(e) =>
              updateSettings({
                boardTheme: e.target.value as 'kaya' | 'wood' | 'dark' | 'slate' | 'custom',
              })
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500/60 focus:outline-none"
          >
            <option value="kaya">{t('settings.general.board_theme_kaya')}</option>
            <option value="wood">{t('settings.general.board_theme_wood')}</option>
            <option value="dark">{t('settings.general.board_theme_dark')}</option>
            <option value="slate">{t('settings.general.board_theme_slate')}</option>
            <option value="custom">{t('settings.general.board_theme_custom')}</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
            {t('settings.general.piece_style')}
          </label>
          <select
            value={settings.pieceStyle ?? 'single'}
            onChange={(e) =>
              updateSettings({
                pieceStyle: e.target.value as 'single' | 'kanji' | 'custom',
              })
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500/60 focus:outline-none"
          >
            <option value="single">{t('settings.general.piece_style_single')}</option>
            <option value="kanji">{t('settings.general.piece_style_kanji')}</option>
            <option value="custom">{t('settings.general.piece_style_custom')}</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
            {t('settings.general.layout_density')}
          </label>
          <select
            value={settings.studioLayoutDensity ?? 'comfortable'}
            onChange={(e) =>
              updateSettings({
                studioLayoutDensity: e.target.value as 'comfortable' | 'compact',
              })
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500/60 focus:outline-none"
          >
            <option value="comfortable">{t('settings.general.layout_comfortable')}</option>
            <option value="compact">{t('settings.general.layout_compact')}</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs text-slate-300">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.showCoordinates ?? true}
            onChange={(e) => updateSettings({ showCoordinates: e.target.checked })}
            className="rounded border-slate-700 bg-slate-900 text-amber-500"
          />
          <span>{t('settings.general.show_coordinates')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.showEvalBar ?? true}
            onChange={(e) => updateSettings({ showEvalBar: e.target.checked })}
            className="rounded border-slate-700 bg-slate-900 text-amber-500"
          />
          <span>{t('settings.general.show_eval_bar')}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.soundEnabled ?? true}
            onChange={(e) => updateSettings({ soundEnabled: e.target.checked })}
            className="rounded border-slate-700 bg-slate-900 text-amber-500"
          />
          <span>{t('settings.general.sound_enabled')}</span>
        </label>
      </div>

      {/* Default Studio View Tier & Study Visibility Toggles */}
      <div className="pt-3 border-t border-slate-800 space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              {t('settings.general.default_studio_view_tier')}
            </label>
            <select
              value={settings.defaultStudioViewTier ?? 3}
              onChange={(e) =>
                updateSettings({
                  defaultStudioViewTier: Number(e.target.value) as 1 | 2 | 3,
                })
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-amber-500/60 focus:outline-none"
            >
              <option value={1}>{t('settings.general.default_studio_view_tier_1')}</option>
              <option value={2}>{t('settings.general.default_studio_view_tier_2')}</option>
              <option value={3}>{t('settings.general.default_studio_view_tier_3')}</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <div>
            <div className="text-[11px] font-semibold text-slate-300">
              {t('settings.general.default_study_visibility_title')}
            </div>
            <p className="text-[11px] text-slate-500">
              {t('settings.general.default_study_visibility_desc')}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.defaultShowStudyFutureMoves ?? true}
                onChange={(e) =>
                  updateSettings({ defaultShowStudyFutureMoves: e.target.checked })
                }
                className="rounded border-slate-700 bg-slate-900 text-amber-500"
              />
              <span>{t('studio.visibility.future_moves')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.defaultShowStudyEval ?? true}
                onChange={(e) => updateSettings({ defaultShowStudyEval: e.target.checked })}
                className="rounded border-slate-700 bg-slate-900 text-amber-500"
              />
              <span>{t('studio.visibility.eval_score')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.defaultShowStudyBestMove ?? true}
                onChange={(e) =>
                  updateSettings({ defaultShowStudyBestMove: e.target.checked })
                }
                className="rounded border-slate-700 bg-slate-900 text-amber-500"
              />
              <span>{t('studio.visibility.best_move')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.defaultShowStudyCandidates ?? true}
                onChange={(e) =>
                  updateSettings({ defaultShowStudyCandidates: e.target.checked })
                }
                className="rounded border-slate-700 bg-slate-900 text-amber-500"
              />
              <span>{t('studio.visibility.candidates')}</span>
            </label>
          </div>
        </div>
      </div>

      {/* Custom Assets Upload Section */}
      <div className="pt-3 border-t border-slate-800 space-y-2.5">
        <h5 className="text-xs font-bold text-slate-200">
          {t('settings.custom_assets.title')}
        </h5>
        <div className="space-y-2">
          {assetRows.map((row) => (
            <div
              key={row.kind}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                  <span>{row.icon}</span>
                  <span className="truncate">{t(row.labelKey)}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${
                      row.isConfigured
                        ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60'
                        : 'bg-slate-900 text-slate-400 border-slate-700'
                    }`}
                  >
                    {row.isConfigured
                      ? t('settings.custom_assets.status_configured')
                      : t('settings.custom_assets.status_default')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">{t(row.hintKey)}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {row.kind === 'sound' && (
                  <button
                    type="button"
                    onClick={() => playPieceMoveSound()}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-semibold transition"
                  >
                    🔊 {t('settings.custom_assets.test_sound_btn')}
                  </button>
                )}
                <label className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[11px] font-semibold cursor-pointer transition">
                  <span>{t('settings.custom_assets.upload_btn')}</span>
                  <input
                    type="file"
                    accept={row.accept}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      handleAssetUpload(row.kind, file);
                      e.target.value = '';
                    }}
                  />
                </label>
                {row.isConfigured && (
                  <button
                    type="button"
                    onClick={() => handleAssetReset(row.kind)}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-700/60 text-slate-300 hover:text-rose-200 text-[11px] font-semibold transition"
                    title={t('settings.custom_assets.reset_btn')}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const SettingsModal: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isSettingsOpen, closeSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  if (!isSettingsOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-0 md:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full h-full max-h-none rounded-none md:h-auto md:max-w-2xl md:max-h-[90vh] md:rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <span>⚙️</span>
            {t('settings.title')}
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const target =
                  activeTab === 'appearance' || activeTab === 'ai'
                    ? '/guide/customize'
                    : activeTab === 'data' || activeTab === 'account'
                      ? '/guide/sync'
                      : activeTab === 'about'
                        ? '/guide/faq'
                        : '/guide';
                closeSettings();
                navigate(target);
              }}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition"
              title={t('guide.title')}
              aria-label={t('guide.title')}
            >
              ❓
            </button>
            <button
              type="button"
              onClick={closeSettings}
              className="text-slate-400 hover:text-slate-200 text-lg leading-none px-2"
              aria-label={t('settings.close')}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex shrink-0 gap-1 px-4 pt-3 border-b border-slate-800 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-xs font-medium rounded-t-lg whitespace-nowrap transition ${
                activeTab === tab.id
                  ? 'bg-slate-800 text-amber-300 border-b-2 border-amber-500'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'general' ? (
            <SettingsGeneralTab />
          ) : activeTab === 'appearance' ? (
            <SettingsAppearanceTab />
          ) : activeTab === 'ai' ? (
            <SettingsAiTab />
          ) : activeTab === 'data' ? (
            <SettingsDataTab />
          ) : activeTab === 'account' ? (
            <SettingsAccountTab />
          ) : activeTab === 'about' ? (
            <SettingsAboutTab />
          ) : null}
        </div>
      </div>
    </div>
  );
};
