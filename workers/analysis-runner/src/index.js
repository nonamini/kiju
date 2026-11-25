/**
 * Cloud kifu analysis worker entrypoint (#60).
 * Claims queued KifuRecords from Firestore, analyzes each precomputed
 * position SFEN via a USI engine, writes MoveEvaluation results back,
 * and maintains per-record queue positions for the remaining queue.
 *
 * Env vars:
 *   FIREBASE_SERVICE_ACCOUNT_KEY  service-account JSON (required)
 *   ENGINE_PATH                   engine binary (default ./engine/yaneuraou)
 *   EVAL_DIR                      NNUE eval dir passed to engine (optional)
 *   MAX_GAMES_PER_RUN             games per invocation (default 2)
 *   GO_NODES                      nodes per position (default 200000)
 *   TIME_BUDGET_SEC               self-imposed runtime cap (default 480)
 */

import { randomUUID } from 'node:crypto';
import { UsiEngine } from './usiEngine.js';
import {
  initFirestore,
  claimNextQueuedRecord,
  writeAnalysisResult,
  refreshQueuePositions,
  claimNextSpotAnalysis,
  writeSpotAnalysisResult,
} from './firestore.js';

const ENGINE_PATH = process.env.ENGINE_PATH || './engine/yaneuraou';
const EVAL_DIR = process.env.EVAL_DIR || '';
const MAX_GAMES_PER_RUN = parseInt(process.env.MAX_GAMES_PER_RUN || '2', 10);
const GO_NODES = parseInt(process.env.GO_NODES || '200000', 10);
const TIME_BUDGET_SEC = parseInt(process.env.TIME_BUDGET_SEC || '480', 10);

const startedAt = Date.now();
const elapsedSec = () => (Date.now() - startedAt) / 1000;

const USI_PV_PATTERN = /[1-9][1-9a-i][1-9][1-9a-i][+]?|[A-Z]\*[1-9][a-i]/g;
const USI_MOVE_PATTERN = /^(?:[1-9][1-9a-i][1-9][1-9a-i][+]?|[A-Z]\*[1-9][a-i])$/;

function parseInfoLine(line) {
  if (!line) return null;
  const depthMatch = line.match(/\bdepth (\d+)/);
  const scoreMatch = line.match(/\bscore (cp|mate) (-?\d+)/);
  const pvMatch = line.match(/\bpv (.*)$/);
  if (!depthMatch && !scoreMatch) return null;

  let scoreCp = 0;
  let isMate = false;
  let matePly;
  if (scoreMatch) {
    const kind = scoreMatch[1];
    const raw = parseInt(scoreMatch[2], 10);
    if (kind === 'mate') {
      isMate = true;
      matePly = Math.abs(raw);
      scoreCp = raw >= 0 ? 30000 : -30000;
    } else {
      scoreCp = raw;
      if (Math.abs(raw) >= 29000) {
        isMate = true;
        matePly = 30000 - Math.abs(raw);
      }
    }
  }

  const pv = pvMatch ? (pvMatch[1].match(USI_PV_PATTERN) ?? []) : [];
  return {
    depth: depthMatch ? parseInt(depthMatch[1], 10) : 0,
    scoreCp,
    isMate: isMate || undefined,
    matePly,
    pv,
  };
}

/** Converts a side-to-move-relative score into sente-normalized cp. */
function toSenteScore(info, sfen) {
  if (!info) return null;
  const turn = sfen.split(/\s+/)[1]; // 'b' = sente to move
  const sign = turn === 'b' ? 1 : -1;
  return {
    scoreCp: info.scoreCp * sign,
    isMate: info.isMate,
    matePly: info.matePly,
    depth: info.depth,
    pv: info.pv,
  };
}

async function analyzeRecord(engine, record) {
  const sfens = record.positionSfens;
  if (!Array.isArray(sfens) || sfens.length < 2) {
    throw new Error('record has no positionSfens payload');
  }

  // Only reuse existing evaluations for partial-retry of a yaneuraou run
  // unless an explicit re-analysis was requested.
  const canReusePartial =
    record.analysisEngineId === 'yaneuraou' && !record.analysisForceReanalyze;
  const existing = canReusePartial ? (record.evaluations ?? {}) : {};
  const evaluations = { ...existing };
  const rawNodes = Number(record.analysisTargetNodes);
  const targetNodes =
    Number.isFinite(rawNodes) && rawNodes > 0
      ? Math.min(Math.max(Math.round(rawNodes), 50000), 2000000)
      : GO_NODES;
  let lastDepth = canReusePartial ? (record.analysisDepth ?? 0) : 0;
  let depthSum = 0;
  let depthCount = 0;
  let analyzed = Object.keys(evaluations).length;

  // sfens[i] = position after i plies; analyze indices 1..N-1, skipping
  // plies that already carry a yaneuraou evaluation (partial-retry friendly).
  for (let ply = 1; ply < sfens.length; ply++) {
    if (elapsedSec() > TIME_BUDGET_SEC) {
      const avgDepth = depthCount > 0 ? Math.round(depthSum / depthCount) : lastDepth;
      return { evaluations, status: 'queued', error: undefined, analyzed, lastDepth: avgDepth, partial: true };
    }
    if (evaluations[ply]) continue;

    const sfen = sfens[ply];
    const result = await engine.analyze(sfen, targetNodes);
    if (!result) continue; // terminal position — nothing to evaluate

    const info = toSenteScore(parseInfoLine(result.info), sfen);
    const bestMove = USI_MOVE_PATTERN.test(result.bestMove) ? result.bestMove : undefined;
    const plyDepth = info?.depth ?? lastDepth;

    evaluations[ply] = {
      scoreCp: info?.scoreCp ?? 0,
      ...(info?.isMate ? { isMate: true } : {}),
      ...(info?.matePly !== undefined ? { matePly: info.matePly } : {}),
      depth: plyDepth,
      ...(bestMove ? { bestMove } : {}),
      ...(info?.pv?.length ? { pv: info.pv } : {}),
      evaluatedAt: new Date().toISOString(),
    };
    if (info?.depth) {
      lastDepth = info.depth;
      depthSum += info.depth;
      depthCount += 1;
    }
    analyzed += 1;
  }

  // Populate MultiPV=3 candidates on up to 5 key turning points for cloud quiz generation (#62)
  const cpToWr = (cp) => 1 / (1 + Math.exp(-cp / 600));
  const turningPoints = [];
  for (let ply = 12; ply < sfens.length; ply++) {
    const prevEval = evaluations[ply - 1];
    const currEval = evaluations[ply];
    if (!prevEval || !currEval) continue;
    const prevWr = cpToWr(prevEval.scoreCp);
    if (prevWr >= 0.98 || prevWr <= 0.02) continue;
    const swing = Math.abs(cpToWr(currEval.scoreCp) - prevWr);
    if (swing >= 0.15 || prevEval.isMate || currEval.isMate) {
      turningPoints.push({ ply, swing });
    }
  }
  turningPoints.sort((a, b) => b.swing - a.swing);
  const selectedQuizPlies = [];
  for (const tp of turningPoints) {
    if (selectedQuizPlies.length >= 5) break;
    if (!selectedQuizPlies.some((p) => Math.abs(p - tp.ply) < 8)) {
      selectedQuizPlies.push(tp.ply);
    }
  }
  for (const ply of selectedQuizPlies) {
    if (elapsedSec() > TIME_BUDGET_SEC) break;
    const qSfen = sfens[ply - 1];
    const targetEval = evaluations[ply - 1];
    if (!qSfen || !targetEval || typeof engine.analyzeMultiPv !== 'function') continue;
    try {
      const mpRes = await engine.analyzeMultiPv(qSfen, targetNodes, 3);
      if (mpRes?.multiPvLines?.length) {
        const candidates = mpRes.multiPvLines
          .map((line, idx) => {
            const parsed = toSenteScore(parseInfoLine(line), qSfen);
            if (!parsed || !parsed.pv?.length) return null;
            return {
              multipv: idx + 1,
              usi: parsed.pv[0],
              scoreCp: parsed.scoreCp,
              ...(parsed.isMate ? { isMate: true } : {}),
              ...(parsed.matePly !== undefined ? { matePly: parsed.matePly } : {}),
              pv: parsed.pv.slice(0, 5),
            };
          })
          .filter(Boolean);
        if (candidates.length > 0) {
          targetEval.candidates = candidates;
        }
      }
    } catch {
      // Non-fatal: quiz still works with primary bestMove/pv
    }
  }

  const avgDepth = depthCount > 0 ? Math.round(depthSum / depthCount) : lastDepth;
  return { evaluations, status: 'completed', error: undefined, analyzed, lastDepth: avgDepth, partial: false };
}

async function main() {
  initFirestore();
  const jobId = randomUUID();
  const engine = new UsiEngine(ENGINE_PATH);

  let engineStarted = false;
  let processed = 0;
  try {
    while (processed < MAX_GAMES_PER_RUN && elapsedSec() < TIME_BUDGET_SEC) {
      const claimed = await claimNextQueuedRecord(jobId);
      if (!claimed) break;

      if (!engineStarted) {
        await engine.start(EVAL_DIR || undefined);
        engineStarted = true;
      }

      const { ref, data: record } = claimed;
      console.log(`[worker] analyzing ${ref.path} (${record.title ?? record.id})`);

      let isPartialBudgetStop = false;
      try {
        const result = await analyzeRecord(engine, record);
        isPartialBudgetStop = Boolean(result.partial);
        await writeAnalysisResult(ref, {
          evaluations: result.evaluations,
          status: result.status,
          error: result.error,
          engineId: 'yaneuraou',
          depth: result.lastDepth,
          analyzedPlies: result.analyzed,
        });
        console.log(`[worker] ${ref.path} -> ${result.status} (${result.analyzed} plies)`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[worker] ${ref.path} failed: ${message}`);
        try {
          await writeAnalysisResult(ref, {
            evaluations: record.evaluations ?? {},
            status: 'failed',
            error: message.slice(0, 500),
            engineId: 'yaneuraou',
            depth: record.analysisDepth ?? 0,
            analyzedPlies: record.analyzedPliesCount ?? 0,
          });
        } catch (writeErr) {
          console.error(`[worker] failed to write failure state: ${writeErr}`);
        }
      }

      // Keep queue positions fresh for the remaining 'queued' records.
      try {
        await refreshQueuePositions();
      } catch (err) {
        console.warn(`[worker] queue position refresh failed: ${err}`);
      }
      processed += 1;
      if (isPartialBudgetStop) {
        console.log('[worker] time budget reached mid-game; saved partial progress and re-queued');
        break;
      }
    }

    // Process queued spot position / mate analyses while time budget remains
    while (elapsedSec() < TIME_BUDGET_SEC) {
      const spotClaim = await claimNextSpotAnalysis(jobId);
      if (!spotClaim) break;
      if (!engineStarted) {
        await engine.start(EVAL_DIR || undefined);
        engineStarted = true;
      }
      const { ref, data: spot } = spotClaim;
      console.log(`[worker] spot analyzing ${ref.path} (${spot.kind})`);
      try {
        const nodes = Math.min(Math.max(Number(spot.targetNodes) || 500000, 50000), 2000000);
        const multiPv = spot.kind === 'position' ? 3 : 1;
        const res = await engine.analyzeMultiPv(spot.sfen, nodes, multiPv);
        if (!res) {
          await writeSpotAnalysisResult(ref, { status: 'failed', error: 'Engine returned no move' });
        } else {
          const primary = toSenteScore(parseInfoLine(res.info), spot.sfen);
          const candidates = (res.multiPvLines || [])
            .map((line, idx) => {
              const parsed = toSenteScore(parseInfoLine(line), spot.sfen);
              if (!parsed?.pv?.length) return null;
              return {
                multipv: idx + 1,
                usi: parsed.pv[0],
                scoreCp: parsed.scoreCp,
                ...(parsed.isMate ? { isMate: true } : {}),
                ...(parsed.matePly !== undefined ? { matePly: parsed.matePly } : {}),
                pv: parsed.pv.slice(0, 5),
              };
            })
            .filter(Boolean);
          await writeSpotAnalysisResult(ref, {
            status: 'completed',
            result: {
              scoreCp: primary?.scoreCp ?? 0,
              ...(primary?.isMate ? { isMate: true } : {}),
              ...(primary?.matePly !== undefined ? { matePly: primary.matePly } : {}),
              depth: primary?.depth ?? 0,
              bestMove: USI_MOVE_PATTERN.test(res.bestMove) ? res.bestMove : undefined,
              pv: primary?.pv,
              ...(candidates.length > 0 ? { candidates } : {}),
              evaluatedAt: new Date().toISOString(),
            },
          });
        }
        processed += 1;
      } catch (err) {
        await writeSpotAnalysisResult(ref, {
          status: 'failed',
          error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        });
      }
    }
  } finally {
    if (engineStarted) {
      await engine.stop();
    }
  }

  console.log(`[worker] done. processed=${processed} elapsed=${elapsedSec().toFixed(1)}s`);
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
