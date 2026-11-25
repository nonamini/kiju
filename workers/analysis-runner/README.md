# Kifu Analysis Runner (workers/analysis-runner)

GitHub Actions batch worker that analyzes `queued` KifuRecords via a USI
shogi engine (YaneuraOu + Suisho NNUE) and writes `MoveEvaluation` results
back to Firestore. See `docs/spec/cloud_analysis_pipeline.md`.

## Data flow

1. Client calls `queueKifuRecordForCloudAnalysis()` → record gets
   `analysisStatus: 'queued'` + `positionSfens` (per-ply SFEN list
   generated at queue time) and is uploaded to `users/{uid}/games/{id}`.
2. This worker claims up to `MAX_GAMES_PER_RUN` queued docs via a
   Firestore transaction (`analysisStatus: 'processing'` + `analysisJobId`).
3. For each position it sends `position sfen <sfen>` + `go nodes <N>`,
   parses the last `info` line, and stores a sente-normalized
   `MoveEvaluation` under `evaluations[ply]`.
4. On completion: `analysisStatus: 'completed'`, `positionSfens` deleted.
   On failure/timeout: `analysisStatus: 'failed'` + `analysisError`
   (sfens retained for retry). After every finished game, remaining queued
   records get a fresh 1-based `analysisQueuePosition`.

## Setup

```bash
cd workers/analysis-runner
npm install
```

Required env vars:

| Var | Description |
|-----|-------------|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Service-account JSON (Firestore read/write on `users/*/games`) |
| `ENGINE_PATH` | Engine binary path (default `./engine/yaneuraou`) |
| `EVAL_DIR` | NNUE eval directory passed via `setoption name EvalDir` (optional) |
| `MAX_GAMES_PER_RUN` | Max games per invocation (default `2`) |
| `GO_NODES` | Nodes per position (default `200000`) |
| `TIME_BUDGET_SEC` | Runtime self-cap (default `480`) |

Local dry run (requires engine binary + eval files under `./engine/`):

```bash
FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}' \
ENGINE_PATH=./engine/yaneuraou EVAL_DIR=./engine/eval \
npm start
```

## Engine & eval acquisition (#61)

Binaries are **never committed** (GPL license + repo size). CI fetches
pinned release assets via `scripts/fetch-engine.sh` (SHA-256 verified)
and caches them with `actions/cache`.

- YaneuraOu: pinned GitHub release asset for `linux-x64`
- Suisho NNUE: eval file released with the engine bundle; verify the
  Suisho license permits execution-only download (no redistribution —
  the workflow downloads at runtime, which is not redistribution)

## Firestore index

`firestore.indexes.json` declares a COLLECTION_GROUP single-field index
on `games.analysisStatus`, required for the worker's `collectionGroup`
query. Deploy with `firebase deploy --only firestore:indexes`.
