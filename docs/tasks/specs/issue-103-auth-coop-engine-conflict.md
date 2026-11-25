# Issue #103: Googleログイン（localhost）と Wasm エンジン（COOP）の競合

- **ステータス**: 🟡 案2で実装中（dev側は対応済み・本番デプロイと実機検証が残り）
- **作成日**: 2026-11-10
- **関連PR**: #62（Firestore同期・マージ済）/ #63（本番 authDomain 修正・マージ済）/ #64（localhost プロキシ・**未マージ／方針次第でクローズ**）
- **関連ルール**: `../my-dev-kit/_template/GEMINI.md` Rule 11（Firebase Google Auth Reliability）

---

## 1. 背景・経緯

| # | 事象 | 対応 | 結果 |
|---|---|---|---|
| 1 | Firestore クラウド同期を実装（PR #62） | ログイン時に自動同期 | 本番でログインが「ログイン中…」→ 未ログインに戻る |
| 2 | 本番ログイン失敗 | PR #63: Hosting 上では `authDomain` を `location.hostname`（`joseki-tree-a7a5a.web.app`）に切替。OAuth リダイレクト URI に `https://joseki-tree-a7a5a.web.app/__/auth/handler` を追加 | ✅ 本番ログイン成功 |
| 3 | localhost ログイン失敗 | PR #64: Vite で `/__` を `firebaseapp.com` にプロキシし、`authDomain` を `localhost:5173` に | ❌ `ERR_SSL_PROTOCOL_ERROR`（SDK が `https://localhost:5173/__/auth/handler` を開く） |
| 4 | `ScheduleBlockingTool`（localhost ログイン成功実績あり）と比較 | 本資料 | 根本原因が **COOP ヘッダー** と判明 |

---

## 2. 比較: ScheduleBlockingTool（my-dev-kit Rule 11）vs joseki-tree

| 項目 | ScheduleBlockingTool | joseki-tree（現状） | 影響 |
|---|---|---|---|
| **COOP ヘッダー（dev）** | なし（Rule 11-3 で禁止） | `vite.config.ts` に `Cross-Origin-Opener-Policy: same-origin` / `COEP: credentialless` | 🔴 **根本原因** |
| COOP ヘッダー（本番） | なし | なし（`firebase.json` に未設定） | — |
| ログイン方式 | `signInWithPopup` のみ | Popup → 失敗時 `signInWithRedirect` フォールバック（#64 では isolated 時に Redirect 直行） | 🟡 |
| `authDomain` | `stockia-planner.firebaseapp.com` 固定 | Hosting 上は自ホスト名、dev は `firebaseapp.com`（#64 では `localhost:5173`） | 🟡 |
| OAuth「承認済み JavaScript 生成元」 | `http://localhost`, `http://localhost:5000`, 本番ドメイン | 未確認 | 🟡 要確認 |
| OAuth「承認済みリダイレクト URI」 | `https://<project>.firebaseapp.com/__/auth/handler` | 上記 + `https://joseki-tree-a7a5a.web.app/__/auth/handler`（+ `http://localhost:5173/__/auth/handler` を #64 用に追加済） | — |
| `onAuthStateChanged` | `useEffect(..., [])`、Firestore 同期は別 effect | `useEffect(..., [isConfigured])`（実質不変）、同期はコールバック内 | 🟢 実害なし |

---

## 3. 技術的な原因分析

### 3.1 なぜ localhost でログインできないか
1. dev サーバーが `COOP: same-origin` を返す → 親ウィンドウとポップアップ間の `window.opener` 通信が切断される。
2. `signInWithPopup` が結果を受け取れず失敗 → `signInWithRedirect` にフォールバック。
3. Redirect は `authDomain`（`firebaseapp.com`）経由のクロスサイト遷移となり、ブラウザのストレージ分離（Chrome サードパーティ Cookie 制限 / Safari ITP）で結果が取得できない。
4. PR #64 で同一オリジン化を試みたが、Firebase Auth SDK は `https://${authDomain}/__/auth/handler` を **https 固定** で生成するため（エミュレーター時を除く）、http の dev サーバーでは SSL エラーとなる。

### 3.2 なぜ COOP が付いているか
- Fairy-Stockfish Wasm（`public/engine/stockfish.js`）は **共有メモリ（`SharedArrayBuffer`）必須**のスレッド版ビルド。
  - `new WebAssembly.Memory({ shared: true })` を要求し、`SharedArrayBuffer` でなければ例外。
- `SharedArrayBuffer` は `crossOriginIsolated === true`（COOP `same-origin` + COEP）でのみ利用可能。
- `stockfishBridgeWorker.js` は SAB 不可時に `status: 'offline'` を通知する。

### 3.3 新たに判明した課題（重要）
本番（Firebase Hosting）は COOP/COEP ヘッダーを返していない（HEAD レスポンスで確認済）。
→ **本番では Wasm エンジンが offline になっている可能性が高い**（実機での画面確認は未実施）。

| 環境 | COOP/COEP | Google ログイン | Wasm エンジン |
|---|---|---|---|
| 本番 `joseki-tree-a7a5a.web.app` | なし | ✅ | ❌（推定） |
| localhost `:5173` | あり | ❌ | ✅ |

**ログイン（ポップアップ）とエンジン（Cross-Origin Isolation）は同一ドキュメント上で両立しにくい** というのが本質的な課題。

---

## 4. 対応案

### 案1: my-dev-kit Rule 11 に準拠（推奨・短期）
- PR #64 をクローズし、`vite.config.ts` から COOP/COEP を削除。`authDomain` の localhost 分岐も不要。
- ✅ localhost / 本番ともにログイン可能。dev と本番の挙動が一致。
- ✅ 変更が最小・my-dev-kit の実績ある構成。
- ❌ エンジンは localhost でも offline（本番と同じ状態）。エンジン対応は別 Issue へ。

### 案2: HTTPS dev + Cross-Origin Isolation を本番にも適用
- `@vitejs/plugin-basic-ssl` で `https://localhost:5173` 化、`#64` のプロキシ方式を維持し Redirect ログイン。
- `firebase.json` に COOP/COEP を追加し本番でもエンジン稼働。
- ✅ ログインとエンジンが両環境で動作。
- ❌ 自己署名証明書の警告、OAuth URI の再設定（`https://localhost:5173/__/auth/handler`）。
- ❌ 本番 COEP により外部リソース（Google アイコン画像等）が読み込めなくなるリスク。Redirect 方式の本番再検証が必要。

### 案3（エンジン側の将来検討）
| 方法 | 概要 | 備考 |
|---|---|---|
| シングルスレッド版 Wasm に差し替え | SAB 不要のビルド（例: `stockfish.wasm` の非スレッド版 / Fairy-Stockfish の single-threaded build）を使用 | COOP 不要になり、ログインと完全両立。速度は低下 |
| `Document-Isolation-Policy` ヘッダー | COOP なしで `crossOriginIsolated` を得る新仕様 | Chrome 系の新しめのバージョンのみ。Safari 非対応 |
| エンジン専用ページ/ウィンドウを分離 | 解析画面のみ isolated にする | UX・実装コスト大 |

---

## 5. 推奨方針
**→ 案2 を採用**（2026-11-10 決定）。本番 authDomain が自ホストのため redirect が同一オリジン完結し、`AuthContext` の `crossOriginIsolated` 判定で popup → redirect へ自動切替済みのため変更が最小。

実装済み:
- `vite.config.ts`: `@vitejs/plugin-basic-ssl` で https 化 + `strictPort: true`（OAuth リダイレクト URI が origin 単位のためポート固定）
- `firebase.json`: 全パスに `COOP: same-origin` / `COEP: credentialless` を追加
- `AuthContext.tsx`: 変更不要（isolated 時は既に `signInWithRedirect` 直行）

残タスク:
1. **OAuth コンソール（手動）**: 「承認済み JavaScript 生成元」に `https://localhost:5173` を追加。「承認済みリダイレクト URI」に `https://localhost:5173/__/auth/handler` があるか確認（#64 で追加済のはず）
2. **本番デプロイ**: `firebase deploy --only hosting` 後、実機で ①ログイン（redirect）②エンジン online を確認。特に Safari（COEP `credentialless` は Safari 16.4+）
3. PR #64 はクローズ（プロキシ方式は https 化により不要になったわけではない — `/__` プロキシは引き続き必要。PR #64 の差分を確認し、不要部分のみ整理）
4. 別 Issue「my-dev-kit Rule 11 への追記」: COOP/COEP 利用時は `signInWithPopup` が使えず redirect 必須、かつ dev は https 必須である旨

（旧推奨: 案1で認証安定化→案3調査。案3のシングルスレッド Wasm は `fairy-stockfish-nnue.wasm` が pthread ビルドのみのため自前ビルドが必要と判明）

---

## 6. 未解決事項・確認 TODO
- [x] 方針決定 → **案2**
- [ ] 本番でエンジンが実際に offline か画面で確認（検討タブの評価値表示）※デプロイ後に isolated で online になるはず
- [ ] OAuth「承認済み JavaScript 生成元」に `https://localhost:5173` が入っているか確認・追加
- [ ] OAuth「承認済みリダイレクト URI」に `https://localhost:5173/__/auth/handler` があるか確認
- [x] localhost ログイン方式 → https dev + `/__` プロキシ + authDomain=`localhost:5173`（redirect フロー）
- [ ] my-dev-kit Rule 11 に「Wasm スレッド（SAB）利用時は COOP/COEP が必須で popup ログイン不可・dev は https 必須」旨を追記するか検討（Rule 7）
- [ ] `vite preview` は http のまま（COOP は付くが secure context でないため SAB 不可）。本番相当のローカル検証は preview channel deploy で行う
