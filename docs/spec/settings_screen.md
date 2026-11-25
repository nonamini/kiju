# 設定画面 (Settings Screen) - 要件定義書

## 1. 背景と目的

アプリ内の設定・環境設定が以下のように散在しており、ユーザーが「どこで何を設定するか」分かりにくい。

| 項目 | 現在の所在 | 問題 |
|------|-----------|------|
| 言語 (ja/en) | `Header.tsx` ドロップダウン | `i18n.ts` が `lng:'ja'` 固定。`changeLanguage` が永続化されずリロードで初期化される |
| AIエンジン選択 | `StudioAiEvalPanel` / `useShogiEngine` | 永続化なし。毎回選択が必要 |
| 解析深さ | `BatchAnalysisModal` 等で都度指定 | デフォルト値がない |
| 持ち時間・秒読み | 対局ごとに `TimeControlConfig` 指定 | プリセット保存不可 |
| クラウド同期 | `firestoreKifuSync` 自動実行のみ | 手動同期・状態確認UIなし |
| データ管理 | localStorage に10+の独立キー | バックアップ/復元/リセットUIなし |
| アカウント | `AuthStatusButton` のみ | 同期状態・プロフィール確認場所なし |

### 方針（ユーザー確認済み）
- **形態**: モーダル（既存の管理系UIと統一。`SettingsModal`）
- **初回必須カテゴリ**: 全般+AI設定、データ管理、アカウント
- **既存散在設定**: 設定画面に集約。普段使いUIには「その場限りの変更」のみ残す

### 仕分け原則
> 「次回起動時もこの値でよいか？」が Yes → 設定画面 / No（その場限り）→ 普段使いUI

---

## 2. 設定画面に置くもの（環境・既定値・管理系）

| カテゴリ | 項目 | 詳細 |
|---------|------|------|
| **全般** | 言語 | ja/en。`i18n.changeLanguage` + `appSettings` に永続化。起動時に復元 |
| | 起動時画面/モード | `/` か `/studio` か、最後のモード復元など（要検討） |
| **AI・エンジン** | デフォルトエンジン | `EngineId`。`useShogiEngine` 初期化時に適用 |
| | デフォルト解析深さ | バッチ解析・局面解析の初期値 |
| | エンジンモデル状態 | 各エンジンのDL/キャッシュ状態の表示（読み取り専用） |
| **データ管理** | バックアップ | 全localStorageデータをJSONエクスポート |
| | 復元 | JSONインポート。`contentHash`/IDで重複処理 |
| | 全リセット | 全ローカルデータ削除（確認ダイアログ2段階） |
| | ストレージ使用量 | 各キーのサイズ表示（読み取り専用） |
| | クラウド同期 | 手動同期ボタン、最終同期日時、同期結果（pulled/pushed件数）表示 |
| **アカウント** | ログイン状態 | 現在のユーザー表示、ログイン/ログアウト導線 |
| | 同期対象データ | 棋譜・棋士プロフィール等の同期範囲確認 |
| | プロフィール一覧 | `ShogiPlayerProfile` の一覧・管理への導線 |
| **アプリ情報** | バージョン・クレジット | `package.json` version、エンジン作者表記 |
| | ヘルプ | `ShogiRulebookModal` / 使い方へのリンク |

## 3. 普段使いに残すもの（その場限り・コンテキスト依存）

| 項目 | 場所 | 理由 |
|------|------|------|
| 対局ごとの持ち時間・秒読み | 対局設定UI | 対局ごとに変わる |
| 解析時のエンジン・深さの一時変更 | `StudioAiEvalPanel` / `BatchAnalysisModal` | 「この棋譜だけ深く」等の都度判断 |
| 棋譜検索・フィルタ・並び替え | 統一ライブラリ画面 | 閲覧のたびに変わる |
| 定跡選択 | Headerのオープニングピル | 毎回の作業開始点 |
| SRS/クイズのヒント・出題範囲 | 各ドリル画面 | ドリル中の操作 |
| 棋士名の入力・登録 | 棋譜登録フロー | 文脈内で完結 |

---

## 4. データモデル `AppSettings`

```typescript
// src/utils/appSettingsStorage.ts（新設）
export interface AppSettings {
  language: 'ja' | 'en';
  defaultEngineId: EngineId;        // engineConfig.ts の EngineId
  defaultAnalysisDepth: number;    // e.g. 12
  defaultTimeControl?: TimeControlConfig; // 対局プリセット（将来拡張）
  lastActiveMode?: string;         // 起動時復元用（将来拡張）
  updatedAt: string;               // ISO 8601
}

export const APP_SETTINGS_STORAGE_KEY = 'joseki_tree_app_settings';
```

- `loadAppSettings()` / `saveAppSettings()` / `DEFAULT_APP_SETTINGS` を提供
- `SettingsContext` (React Context) でアプリ全体に配信し、`useSettings()` フックで参照
- localStorage 一次ソース。言語は i18n 初期化時に `lng` として注入

## 5. UI構成

```
SettingsModal（Header右端に⚙️アイコン追加）
├── タブ or アコーディオン
│   ├── 全般      … 言語セレクタ、起動時設定
│   ├── AI・エンジン … エンジン選択カード（ENGINE_PROFILES）、深さスライダー/数値
│   ├── データ管理  … バックアップ/復元/リセットボタン、使用量テーブル、同期状態
│   ├── アカウント  … AuthStatusButton埋め込み、プロフィール導線
│   └── アプリ情報  … バージョン、クレジット、ヘルプリンク
```

### Header 変更
- 右側の言語ドロップダウンを**削除**し ⚙️ 設定アイコンに置き換え（混雑緩和）
- `AuthStatusButton` は設定画面内にも配置（Headerにも残すかは実装時判断）

## 6. 機能要件

| ID | 要件 | 優先度 |
|----|------|--------|
| G1 | `appSettingsStorage.ts` + `SettingsContext` 新設 | 高 |
| G2 | 言語設定の永続化（現行バグ修正）+ 設定画面から変更 | 高 |
| G3 | デフォルトエンジン・解析深さの設定と `useShogiEngine`/解析系への適用 | 高 |
| G4 | データバックアップ(JSONエクスポート)/復元(インポート) | 高 |
| G5 | 全データリセット（2段階確認） | 高 |
| G6 | ストレージ使用量の可視化 | 中 |
| G7 | 手動クラウド同期 + 最終同期日時・結果表示 | 中 |
| G8 | アカウント情報・プロフィール管理導線 | 中 |
| G9 | アプリ情報（バージョン/クレジット/ヘルプ） | 低 |
| G10 | Header言語ドロップダウンの設定画面への移行 | 高 |
| G11 | 持ち時間プリセット保存（`defaultTimeControl`） | 低（将来） |

## 7. 実装フェーズ

```
Phase A: 基盤 — appSettingsStorage + SettingsContext + SettingsModal骨格 + Header⚙️追加
Phase B: 全般+AI — 言語永続化(G2/G10)、エンジン・深さ既定値(G3)
Phase C: データ管理 — バックアップ/復元/リセット(G4/G5/G6/G7)
Phase D: アカウント+情報 — G8/G9
Phase E: （将来）持ち時間プリセット等の拡張
```

## 8. 非機能要件・注意点

- N1: strict TypeScript / `any` 禁止（プロジェクトルール）
- N2: リセット・復元は破壊的操作のため確認UIを二重化し、実行前に対象データ一覧を明示
- N3: バックアップは全ストレージキーを走査する汎用エクスポートとし、将来の `KifuRecord` 統合（kifu_management_enhancement.md）とも整合させる
- N4: i18n — 設定画面の文言も `ja.json`/`en.json` に追加
- N5: 既存の `STUDIO_LAST_SESSION` 等の「状態」系キーはバックアップ対象外とするか要検討（セッション状態は復元不要）
