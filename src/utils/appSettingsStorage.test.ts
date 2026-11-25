import { beforeEach, describe, expect, it } from 'vitest';
import { getSafeStorage } from './matchHistoryStorage';
import {
  APP_SETTINGS_STORAGE_KEY,
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  saveAppSettings,
} from './appSettingsStorage';

describe('appSettingsStorage', () => {
  beforeEach(() => {
    getSafeStorage().removeItem(APP_SETTINGS_STORAGE_KEY);
  });

  it('returns defaults when nothing is stored', () => {
    const s = loadAppSettings();
    expect(s.language).toBe('ja');
    expect(s.defaultEngineId).toBe('fairy-stockfish');
    expect(s.defaultAnalysisDepth).toBe(12);
    expect(s.defaultCloudAnalysisLevel).toBe('standard');
    expect(s.libraryDefaultGameKindTab).toBe('all');
    expect(s.treeDefaultGameKindScope).toBe('pro');
  });

  it('round-trips settings including default views and cloud level', () => {
    saveAppSettings({
      language: 'en',
      defaultEngineId: 'tuyouraou11-mini',
      defaultAnalysisDepth: 15,
      defaultCloudAnalysisLevel: 'deep',
      libraryDefaultGameKindTab: 'self',
      treeDefaultGameKindScope: 'all',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const s = loadAppSettings();
    expect(s.language).toBe('en');
    expect(s.defaultEngineId).toBe('tuyouraou11-mini');
    expect(s.defaultAnalysisDepth).toBe(15);
    expect(s.defaultCloudAnalysisLevel).toBe('deep');
    expect(s.libraryDefaultGameKindTab).toBe('self');
    expect(s.treeDefaultGameKindScope).toBe('all');
    expect(s.updatedAt).not.toBe('2026-01-01T00:00:00.000Z'); // refreshed on save
  });

  it('falls back per-field for partial/invalid stored data', () => {
    getSafeStorage().setItem(
      APP_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        language: 'fr',
        defaultAnalysisDepth: -3,
        defaultCloudAnalysisLevel: 'ultra',
        libraryDefaultGameKindTab: 'invalid',
        treeDefaultGameKindScope: 'unknown',
      })
    );
    const s = loadAppSettings();
    expect(s.language).toBe('ja'); // invalid -> default
    expect(s.defaultAnalysisDepth).toBe(12); // invalid -> default
    expect(s.defaultEngineId).toBe('fairy-stockfish'); // missing -> default
    expect(s.defaultCloudAnalysisLevel).toBe('standard');
    expect(s.libraryDefaultGameKindTab).toBe('all');
    expect(s.treeDefaultGameKindScope).toBe('pro');
  });

  it('falls back to defaults on corrupt JSON', () => {
    getSafeStorage().setItem(APP_SETTINGS_STORAGE_KEY, '{broken');
    expect(loadAppSettings()).toEqual(DEFAULT_APP_SETTINGS);
  });
});
