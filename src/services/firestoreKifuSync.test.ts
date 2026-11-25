import { describe, expect, it } from 'vitest';
import {
  CLOUD_ANALYSIS_ENGINE_ID,
  canQueueRecordForCloudAnalysis,
  isCloudAnalyzedRecord,
  shouldPreferRemoteRecord,
} from './firestoreKifuSync';

describe('canQueueRecordForCloudAnalysis', () => {
  it('allows unanalyzed and failed records', () => {
    expect(canQueueRecordForCloudAnalysis({ analysisStatus: 'unanalyzed' })).toBe(true);
    expect(canQueueRecordForCloudAnalysis({ analysisStatus: 'failed' })).toBe(true);
    expect(canQueueRecordForCloudAnalysis({})).toBe(true);
  });

  it('allows locally completed records so they can be upgraded by cloud engine', () => {
    expect(
      canQueueRecordForCloudAnalysis({
        analysisStatus: 'completed',
        analysisEngineId: 'fairy-stockfish',
      })
    ).toBe(true);
    expect(
      canQueueRecordForCloudAnalysis({
        analysisStatus: 'completed',
        analysisEngineId: 'tuyouraou11-mini',
      })
    ).toBe(true);
  });

  it('blocks records already completed by cloud engine or currently queued/processing/analyzing', () => {
    expect(
      isCloudAnalyzedRecord({
        analysisStatus: 'completed',
        analysisEngineId: CLOUD_ANALYSIS_ENGINE_ID,
      })
    ).toBe(true);
    expect(
      canQueueRecordForCloudAnalysis({
        analysisStatus: 'completed',
        analysisEngineId: CLOUD_ANALYSIS_ENGINE_ID,
      })
    ).toBe(false);
    expect(
      canQueueRecordForCloudAnalysis(
        {
          analysisStatus: 'completed',
          analysisEngineId: CLOUD_ANALYSIS_ENGINE_ID,
        },
        { allowReanalyze: true }
      )
    ).toBe(true);
    expect(canQueueRecordForCloudAnalysis({ analysisStatus: 'queued' })).toBe(false);
    expect(canQueueRecordForCloudAnalysis({ analysisStatus: 'processing' })).toBe(false);
    // Stale 'analyzing' from interrupted local Wasm runs is eligible for cloud queue.
    expect(canQueueRecordForCloudAnalysis({ analysisStatus: 'analyzing' })).toBe(true);
  });
});

describe('shouldPreferRemoteRecord', () => {
  it('prefers remote yaneuraou-completed record even when local updatedAt is newer', () => {
    const local = {
      updatedAt: '2026-11-14T16:30:00.000Z',
      analysisStatus: 'completed' as const,
      analysisEngineId: 'tuyouraou11-mini',
    };
    const remote = {
      updatedAt: '2026-11-14T15:01:00.000Z',
      analysisStatus: 'completed' as const,
      analysisEngineId: CLOUD_ANALYSIS_ENGINE_ID,
    };
    expect(shouldPreferRemoteRecord(local, remote)).toBe(true);
  });

  it('prefers remote processing over local queued even when local updatedAt is newer', () => {
    const local = {
      updatedAt: '2026-11-14T16:30:00.000Z',
      analysisStatus: 'queued' as const,
      analysisEngineId: 'tuyouraou11-mini',
    };
    const remote = {
      updatedAt: '2026-11-14T15:01:00.000Z',
      analysisStatus: 'processing' as const,
    };
    expect(shouldPreferRemoteRecord(local, remote)).toBe(true);
  });

  it('falls back to updatedAt comparison when both or neither are cloud-completed', () => {
    expect(
      shouldPreferRemoteRecord(
        {
          updatedAt: '2026-11-14T16:30:00.000Z',
          analysisStatus: 'completed',
          analysisEngineId: CLOUD_ANALYSIS_ENGINE_ID,
        },
        {
          updatedAt: '2026-11-14T15:01:00.000Z',
          analysisStatus: 'completed',
          analysisEngineId: CLOUD_ANALYSIS_ENGINE_ID,
        }
      )
    ).toBe(false);
  });
});
