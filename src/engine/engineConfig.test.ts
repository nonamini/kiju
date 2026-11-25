import { beforeEach, describe, expect, it } from 'vitest';
import { getSafeStorage } from '../utils/matchHistoryStorage';
import {
  BUILTIN_FAIRY_STOCKFISH_PROFILE,
  CUSTOM_ENGINES_STORAGE_KEY,
  DEFAULT_ENGINE_ID,
  deleteCustomEngineProfile,
  ENGINE_PROFILES,
  formatEngineSizeBytes,
  getAllEngineProfiles,
  getEngineProfile,
  loadCustomEngineProfiles,
  parseEngineTagJson,
  parseEvalOptionsTxt,
  resolveEngineDescription,
  resolveEngineDisplayName,
  saveCustomEngineProfile,
  subscribeEngineRegistryChange,
} from './engineConfig';
import {
  deleteCustomEngineModelBinary,
  loadCustomEngineModelBinary,
  saveCustomEngineModelBinary,
} from './customEngineModelStore';

describe('engineConfig dynamic USI registry (#141, #142)', () => {
  beforeEach(() => {
    getSafeStorage().removeItem(CUSTOM_ENGINES_STORAGE_KEY);
    loadCustomEngineProfiles();
  });

  it('includes only the license-clean built-in Fairy-Stockfish engine by default', () => {
    const engines = getAllEngineProfiles();
    expect(engines).toHaveLength(1);
    expect(engines[0]?.id).toBe(DEFAULT_ENGINE_ID);
    expect(engines[0]?.isBuiltin).toBe(true);
    expect(engines[0]?.transportType).toBe('builtin-wasm');
    expect(Object.keys(ENGINE_PROFILES)).toEqual([DEFAULT_ENGINE_ID]);
  });

  it('registers, resolves credits/display names, notifies subscribers, and deletes custom engines', () => {
    let notified = 0;
    const unsub = subscribeEngineRegistryChange(() => {
      notified++;
    });

    saveCustomEngineProfile({
      id: 'ws-suisho',
      displayName: 'Suisho 5 (YaneuraOu)',
      author: 'Sugimura / Isozaki',
      architecture: 'External USI (WebSocket)',
      description: 'Local GPU/CPU workstation',
      transportType: 'websocket-usi',
      wsUrl: 'ws://localhost:9000',
      sizeBytes: 0,
      sizeFormatted: 'WebSocket',
    });

    saveCustomEngineProfile({
      id: 'nnue-custom',
      displayName: 'My Custom NNUE',
      author: 'Custom Author',
      architecture: 'SFNN_custom',
      transportType: 'custom-nnue',
      customModelId: 'nnue-custom',
      sizeBytes: 5 * 1024 * 1024,
      sizeFormatted: formatEngineSizeBytes(5 * 1024 * 1024),
    });

    expect(notified).toBe(2);
    const list = getAllEngineProfiles();
    expect(list.map((e) => e.id)).toEqual([DEFAULT_ENGINE_ID, 'ws-suisho', 'nnue-custom']);
    expect(ENGINE_PROFILES['ws-suisho']?.wsUrl).toBe('ws://localhost:9000');

    const wsProfile = getEngineProfile('ws-suisho');
    expect(wsProfile).toBeDefined();
    expect(resolveEngineDisplayName(wsProfile)).toBe('Suisho 5 (YaneuraOu)');
    expect(resolveEngineDescription(wsProfile!)).toBe('Local GPU/CPU workstation');
    expect(resolveEngineDisplayName('nnue-custom')).toBe('My Custom NNUE');

    // Deleting built-in engine is ignored
    deleteCustomEngineProfile(DEFAULT_ENGINE_ID);
    expect(getEngineProfile(DEFAULT_ENGINE_ID)).toEqual(BUILTIN_FAIRY_STOCKFISH_PROFILE);

    // Deleting custom engine removes it cleanly
    deleteCustomEngineProfile('ws-suisho');
    expect(getEngineProfile('ws-suisho')).toBeUndefined();
    expect(getAllEngineProfiles().map((e) => e.id)).toEqual([DEFAULT_ENGINE_ID, 'nnue-custom']);

    unsub();
  });

  it('provides graceful display fallbacks for legacy historical engine IDs', () => {
    expect(resolveEngineDisplayName('tuyouraou11-mini')).toBe('TuyouraOu 11 mini');
    expect(resolveEngineDisplayName('tuyouraou11-micro')).toBe('TuyouraOu 11 micro');
    expect(resolveEngineDisplayName('yaneuraou')).toBe('YaneuraOu (Cloud)');
    expect(
      resolveEngineDisplayName('yaneuraou', (key) =>
        key === 'studio.kifu_mgmt.cloud_engine_yaneuraou' ? 'やねうら王 (水匠)' : key
      )
    ).toBe('やねうら王 (水匠)');
  });

  it('stores, loads, and deletes custom evaluation model binaries via customEngineModelStore', async () => {
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
    await saveCustomEngineModelBinary({
      id: 'model-1',
      nnFileName: 'nn.bin',
      nnBuffer: buffer,
      sizeBytes: 4,
      createdAt: '2026-11-19T00:00:00.000Z',
    });

    const loaded = await loadCustomEngineModelBinary('model-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.nnFileName).toBe('nn.bin');
    expect(loaded?.nnBuffer.byteLength).toBe(4);

    await deleteCustomEngineModelBinary('model-1');
    const afterDelete = await loadCustomEngineModelBinary('model-1');
    expect(afterDelete).toBeNull();
  });

  it('parses Shogi evaluation tag.json metadata and eval_options.txt independently', () => {
    const sampleTagJson = JSON.stringify({
      arch: 'SFNN_ka2_4096_8_64_progress8',
      banner: 'banner.png',
      name: 'つようら王11mini',
      description: 'つようら王11の軽量版。',
      author: 'やねうら王プロジェクト',
      'homepage-label': '公式サイト',
      homepage: 'https://example.com/',
    });

    const meta = parseEngineTagJson(sampleTagJson);
    expect(meta.displayName).toBe('つようら王11mini');
    expect(meta.author).toBe('やねうら王プロジェクト');
    expect(meta.architecture).toBe('SFNN_ka2_4096_8_64_progress8');
    expect(meta.description).toBe('つようら王11の軽量版。');
    expect(meta.homepageLabel).toBe('公式サイト');
    expect(meta.homepage).toBe('https://example.com/');

    expect(parseEvalOptionsTxt('FV_SCALE 24\n')).toEqual({ fvScale: 24 });
    expect(parseEvalOptionsTxt('')).toEqual({});
  });

  it('registers, persists exePath, resolves credits, and deletes local-exe USI profiles (#143)', () => {
    saveCustomEngineProfile({
      id: 'local-yaneuraou',
      displayName: 'YaneuraOu Local',
      author: 'Motohiro Isozaki',
      architecture: 'Local USI Executable (.exe)',
      description: 'C:\\shogi\\YaneuraOu.exe',
      transportType: 'local-exe',
      exePath: 'C:\\shogi\\YaneuraOu.exe',
      sizeBytes: 0,
      sizeFormatted: 'Local .exe',
    });

    const loaded = getEngineProfile('local-yaneuraou');
    expect(loaded).toBeDefined();
    expect(loaded?.transportType).toBe('local-exe');
    expect(loaded?.exePath).toBe('C:\\shogi\\YaneuraOu.exe');
    expect(loaded?.sizeFormatted).toBe('Local .exe');
    expect(resolveEngineDisplayName('local-yaneuraou')).toBe('YaneuraOu Local');

    deleteCustomEngineProfile('local-yaneuraou');
    expect(getEngineProfile('local-yaneuraou')).toBeUndefined();
  });
});
