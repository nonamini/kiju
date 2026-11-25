/**
 * Firestore access layer for the analysis worker (#59/#60).
 * Records live at users/{uid}/games/{gameId}; the worker uses the Admin SDK
 * (service account) so security rules are bypassed.
 */

import admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { STALE_CLAIM_MS, isStaleProcessingClaim } from './claimPolicy.js';

let db = null;

export function initFirestore() {
  if (db) return db;
  const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY env var is required');
  }
  const credential = admin.credential.cert(JSON.parse(keyJson));
  admin.initializeApp({ credential });
  db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

function gamesCollection() {
  return db.collectionGroup('games');
}

export { STALE_CLAIM_MS, isStaleProcessingClaim };

async function tryClaimDoc(doc, jobId, allowStaleProcessing) {
  const claimed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(doc.ref);
    const data = fresh.data();
    if (!fresh.exists) return null;
    const isQueued = data?.analysisStatus === 'queued';
    const isStale = allowStaleProcessing && isStaleProcessingClaim(data);
    if (!isQueued && !isStale) return null;
    tx.update(doc.ref, {
      analysisStatus: 'processing',
      analysisJobId: jobId,
      analysisClaimedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return data;
  });
  if (!claimed) return null;
  // doc.ref.parent.parent is users/{uid}
  const uid = doc.ref.parent.parent?.id ?? '';
  return { ref: doc.ref, data: claimed, uid };
}

/**
 * Atomically claims one queued record (or reclaims a stale 'processing' record):
 * sets analysisStatus='processing' with a job id + claim timestamp.
 * Returns {ref, data, uid} or null when nothing is claimable.
 */
export async function claimNextQueuedRecord(jobId) {
  const queuedSnap = await gamesCollection()
    .where('analysisStatus', '==', 'queued')
    .limit(25)
    .get();

  const sortedQueued = [...queuedSnap.docs].sort((a, b) => {
    const da = a.data();
    const dbData = b.data();
    const posA = typeof da.analysisQueuePosition === 'number' ? da.analysisQueuePosition : 999999;
    const posB = typeof dbData.analysisQueuePosition === 'number' ? dbData.analysisQueuePosition : 999999;
    if (posA !== posB) return posA - posB;
    return String(da.updatedAt ?? '').localeCompare(String(dbData.updatedAt ?? ''));
  });

  for (const doc of sortedQueued) {
    const result = await tryClaimDoc(doc, jobId, false);
    if (result) return result;
  }

  // Fallback: reclaim stale 'processing' records left behind by timed-out runners
  const processingSnap = await gamesCollection()
    .where('analysisStatus', '==', 'processing')
    .limit(15)
    .get();

  const staleDocs = processingSnap.docs
    .filter((doc) => isStaleProcessingClaim(doc.data()))
    .sort((a, b) =>
      String(a.data().analysisClaimedAt ?? '').localeCompare(
        String(b.data().analysisClaimedAt ?? '')
      )
    );

  for (const doc of staleDocs) {
    const result = await tryClaimDoc(doc, jobId, true);
    if (result) {
      console.log(`[worker] reclaimed stale processing claim ${doc.ref.path}`);
      return result;
    }
  }

  return null;
}

/**
 * Writes analysis results back to a claimed record. On success the
 * positionSfens payload is deleted (no longer needed); on failure it is
 * retained so a re-queue can reuse it.
 */
export async function writeAnalysisResult(ref, { evaluations, status, error, engineId, depth, analyzedPlies }) {
  const update = {
    evaluations,
    analysisStatus: status,
    analysisError: error ?? FieldValue.delete(),
    analysisJobId: FieldValue.delete(),
    analysisClaimedAt: FieldValue.delete(),
    analysisForceReanalyze: FieldValue.delete(),
    analysisEngineId: engineId,
    analysisDepth: depth,
    analyzedPliesCount: analyzedPlies,
    updatedAt: new Date().toISOString(),
  };
  if (status === 'completed') {
    update.positionSfens = FieldValue.delete();
  }
  await ref.update(update);
}

/**
 * Recomputes 1-based queue positions for all remaining 'queued' records,
 * ordered by queue time (updatedAt). Called after every finished game so
 * the app can display "N games ahead".
 */
export async function refreshQueuePositions() {
  const snapshot = await gamesCollection()
    .where('analysisStatus', '==', 'queued')
    .get();
  const docs = snapshot.docs
    .map((d) => ({ ref: d.ref, data: d.data() }))
    .sort((a, b) => String(a.data.updatedAt ?? '').localeCompare(String(b.data.updatedAt ?? '')));

  const batch = db.batch();
  let position = 1;
  for (const { ref, data } of docs) {
    if (data.analysisQueuePosition !== position) {
      batch.update(ref, { analysisQueuePosition: position });
    }
    position += 1;
  }
  if (docs.length > 0) await batch.commit();
  return docs.length;
}

/**
 * Claims one queued spot analysis request (users/{uid}/spotAnalyses/{id}).
 */
export async function claimNextSpotAnalysis(jobId) {
  const snap = await db
    .collectionGroup('spotAnalyses')
    .where('status', '==', 'queued')
    .limit(10)
    .get();

  for (const doc of snap.docs) {
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const data = fresh.data();
      if (!fresh.exists || data?.status !== 'queued') return null;
      tx.update(doc.ref, {
        status: 'processing',
        jobId,
        claimedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return data;
    });
    if (claimed) return { ref: doc.ref, data: claimed };
  }
  return null;
}

/**
 * Writes spot analysis result back to users/{uid}/spotAnalyses/{id}.
 */
export async function writeSpotAnalysisResult(ref, { status, result, error }) {
  await ref.update({
    status,
    result: result ?? FieldValue.delete(),
    error: error ?? FieldValue.delete(),
    updatedAt: new Date().toISOString(),
  });
}
