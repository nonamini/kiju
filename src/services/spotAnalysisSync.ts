/**
 * Firestore Spot Cloud Analysis Service (#62).
 * Allows users to queue individual positions (study branches or resignation
 * mate checks) for deep YaneuraOu cloud analysis and retrieve results.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import { collection, doc, getDocs, setDoc } from 'firebase/firestore/lite';
import { db } from './firebase';
import { MoveEvaluation } from '../types/shogi';

export type SpotAnalysisKind = 'position' | 'mate';
export type SpotAnalysisStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface SpotAnalysisRecord {
  id: string;
  sfen: string;
  kind: SpotAnalysisKind;
  gameId?: string;
  ply?: number;
  label?: string;
  targetNodes: number;
  status: SpotAnalysisStatus;
  result?: MoveEvaluation;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export async function queueSpotAnalysis(
  userId: string,
  params: {
    sfen: string;
    kind: SpotAnalysisKind;
    gameId?: string;
    ply?: number;
    label?: string;
    targetNodes?: number;
  }
): Promise<SpotAnalysisRecord | null> {
  if (!db || !userId) return null;
  const now = new Date().toISOString();
  const id = `spot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record: SpotAnalysisRecord = {
    id,
    sfen: params.sfen,
    kind: params.kind,
    ...(params.gameId ? { gameId: params.gameId } : {}),
    ...(params.ply !== undefined ? { ply: params.ply } : {}),
    ...(params.label ? { label: params.label } : {}),
    targetNodes: params.targetNodes ?? (params.kind === 'mate' ? 1000000 : 500000),
    status: 'queued',
    createdAt: now,
    updatedAt: now,
  };
  const ref = doc(db, 'users', userId, 'spotAnalyses', id);
  await setDoc(ref, record);
  return record;
}

export async function fetchUserSpotAnalyses(
  userId: string
): Promise<SpotAnalysisRecord[]> {
  if (!db || !userId) return [];
  try {
    const colRef = collection(db, 'users', userId, 'spotAnalyses');
    const snap = await getDocs(colRef);
    const list: SpotAnalysisRecord[] = [];
    snap.forEach((d) => {
      const data = d.data() as Partial<SpotAnalysisRecord>;
      if (data && typeof data.sfen === 'string' && typeof data.status === 'string') {
        list.push({
          id: data.id || d.id,
          sfen: data.sfen,
          kind: data.kind === 'mate' ? 'mate' : 'position',
          gameId: data.gameId,
          ply: data.ply,
          label: data.label,
          targetNodes: typeof data.targetNodes === 'number' ? data.targetNodes : 500000,
          status: data.status as SpotAnalysisStatus,
          result: data.result,
          error: data.error,
          createdAt: data.createdAt || '',
          updatedAt: data.updatedAt || '',
        });
      }
    });
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (err) {
    console.warn('[SpotAnalysis] Failed to fetch spot analyses:', err);
    return [];
  }
}
