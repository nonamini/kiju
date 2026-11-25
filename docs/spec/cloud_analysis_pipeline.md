# クラウド棋譜解析パイプライン (Cloud Kifu Analysis Pipeline) - 要件定義書

*対応Issue: #59–62 / 前提: `kifu_management_enhancement.md` (KifuRecord), `data_models.md` §7*

## 1. 目的

スマホ等で取り込んだ棋譜を、PCを起動していなくても自動でAI解析し、評価値を `KifuRecord.evaluations` に書き戻す。方式は **GitHub Actions scheduled workflow + ネイティブ将棋エンジン（やねうら王 + 水匠NNUE）** で、完全無料・クレカ不要を実現する。

## 2. アーキテクチャ

```
[スマホ/PC ブラウザ]
   │ 棋譜インポート → KifuRecord (analysisStatus: 'queued')
   ▼
[Firestore users/{uid}/games/{id}]
   ▲                        │
   │ evaluations書き戻し     │ status='queued' をクエリ
   │                        ▼
[GitHub Actions Workflow] (schedule cron + workflow_dispatch)
   │ checkout → engine/NNUE取得(or cache) → npm ci
   ▼
[Node.js worker] ──spawn──> [yaneuraou binary] (USI protocol)
   │ per position: position sfen + go nodes → parse info/bestmove
   ▼
[Firestore batch write] → status='completed', evaluations={ply: MoveEvaluation}
```

## 3. 構成要素

| 要素 | 技術 | 備考 |
|------|------|------|
| 実行環境 | GitHub Actions `ubuntu-latest` | 2コアCPU。private repo 無料枠 月2,000分 |
| エンジン | やねうら王 Linuxバイナリ | USI対応。GPL（バイナリはリポジトリに置かず実行時取得） |
| 評価関数 | 水匠(Suisho) NNUE | CPU最強クラス。数十MB。ライセンス確認の上で実行時取得+cache |
| ワーカー | Node.js 20 (`workers/analysis-runner/`) | `firebase-admin` + `child_process` でUSI通信 |
| DB | Cloud Firestore | `users/{uid}/games` コレクション |
| 認証 | GitHub Secrets `FIREBASE_SERVICE_ACCOUNT_KEY` | Firestore専用の最小権限サービスアカウント |

## 4. ジョブキュー設計（`KifuRecord` スキーマ拡張）

`analysisStatus` ライフサイクル:
```
unanalyzed → queued → processing → completed
                          └→ failed (analysisError に理由)
```

- `analysisJobId` + `analysisClaimedAt`: ワーカーがトランザクションでclaim。ローカルWasm解析（`analyzing`）とも排他
- `analysisError`: 失敗理由（タイムアウト/パース失敗等）
- Firestore複合インデックス: `analysisStatus == 'queued'` 用

## 5. ワーカー仕様 (`workers/analysis-runner/`)

### 処理フロー
1. `MAX_GAMES_PER_RUN`（既定1〜2）件の `queued` レコードをclaim
2. 各棋譜について全局面（または設定ply範囲）を順に `position sfen <sfen>` + `go nodes <N>` で解析
3. `info depth ... score cp/mate ... pv ...` 行から `MoveEvaluation` を構築
4. `evaluations` マップ + `analysisStatus:'completed'` をバッチ書き込み
5. 時間バジェット超過で新規claimを停止し `quit` で安全終了

### 設定パラメータ（環境変数）
| 変数 | 既定 | 説明 |
|------|------|------|
| `MAX_GAMES_PER_RUN` | 2 | 1実行あたりの局数上限 |
| `GO_NODES` | 500000 | 1局面あたりの探索ノード数 |
| `TIME_BUDGET_SEC` | 480 | 1実行の時間バジェット（timeout-minutes未満に収める） |
| `ENGINE_PATH` | `./engine/yaneuraou` | エンジンバイナリパス |
| `EVAL_DIR` | `./engine/eval` | NNUE評価関数ディレクトリ |

### USIプロトコル
```
usi → id name ... → setoption name EvalDir value <dir> → isready → readyok
position sfen <sfen> → go nodes <N> → info ... → bestmove <move> ...
quit
```

## 6. GitHub Actions ワークフロー (`.github/workflows/analyze-kifu.yml`)

```yaml
name: Kifu Analysis Batch
on:
  schedule:
    # 高頻度・少量バッチ: 30分おき（cron遅延を考慮し実測で調整）
    - cron: '*/30 * * * *'
  workflow_dispatch:
jobs:
  analyze:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    concurrency:
      group: kifu-analysis
      cancel-in-progress: false
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - name: Fetch engine & eval (cache)
        run: ./scripts/fetch-engine.sh   # pinned version + checksum verify
      - run: npm ci --prefix workers/analysis-runner
      - run: node workers/analysis-runner/src/index.js
        env:
          FIREBASE_SERVICE_ACCOUNT_KEY: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_KEY }}
          MAX_GAMES_PER_RUN: '2'
          GO_NODES: '500000'
          TIME_BUDGET_SEC: '480'
```

### 分数試算（private repo 上限 2,000分/月）
- 30分間隔 = 48回/日 ≈ 1,440回/月
- 1回あたり実測 ~2〜4分と仮定 → 月 2,880〜5,760分 → **上限超過の可能性**
- 対策: 実行時間を短く保つ（処理件数・nodesを絞る）、または cron を `0 * * * *`（1時間おき=720回/月）に調整。**実測後に確定**

## 7. エンジン/評価関数の取得方針

- **リポジトリにバイナリを置かない**（GPLライセンス・リポジトリ肥大化対策）
- `scripts/fetch-engine.sh` がピン留めバージョンのリリースアセットをDL → SHA256検証 → `engine/` に配置
- `actions/cache` でバージョンキーキャッシュ（2回目以降スキップ）
- 水匠NNUEのライセンス（非商用研究目的等）を確認し、再配布に該当しない取得方法を選ぶ

## 8. セキュリティ

- GitHub Secrets に専用サービスアカウントJSON（Firestore読み書きのみの最小権限）
- `firestore.rules` はクライアント向けのまま。ワーカーはAdmin SDK経由のためrulesをバイパス — SAキーの管理を厳重に
- エンジンバイナリはチェックサム検証後にのみ実行

## 9. 非機能要件

- N1: 1回の実行は必ず `timeout-minutes` 内に終了（`TIME_BUDGET_SEC` で自己制限）
- N2: キューが空なら即終了（エンジン起動すらスキップして分数節約）
- N3: `workflow_dispatch` で手動実行可能（検証・デバッグ用）
- N4: 失敗時は `analysisStatus:'failed'` + `analysisError` で記録し、次回実行での再試行は手動 or 自動再キュー（仕様は実装時に決定）
