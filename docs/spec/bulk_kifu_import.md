# 棋譜一括インポート (Bulk Kifu Import) - 要件定義書

*対応Issue: #51, #52 / 前提: `kifu_management_enhancement.md` (KifuRecord, contentHash)*

## 1. 目的

プロ棋譜・アマ棋譜をまとめて大量に取り込み、定跡ツリー構築・研究ライブラリを効率的に拡充する。現在の `KifuUploader` はテキスト貼付＋単一ファイルのみ対応で、数十局の一括取込に耐えない。

## 2. スコープ（ユーザー確認済み）

- ✅ 複数ファイルのドラッグ&ドロップ
- ✅ フォルダ一括選択（File System Access API）
- ❌ テキスト連結の自動分割（対象外）
- ❌ スマホ撮影→OCR（対象外）

## 3. 機能要件

| ID | 要件 | 詳細 |
|----|------|------|
| B1 | 複数ファイル入力 | `<input type="file" multiple accept=".kif,.ki2,.txt">` + ドラッグ&ドロップ複数ファイル対応 |
| B2 | フォルダ一括 | `showDirectoryPicker()`（Chromium系）でディレクトリ選択→配下の棋譜ファイルを再帰収集。非対応ブラウザはファイル複数選択にフォールバック |
| B3 | エンコーディング対応 | 既存 `decodeKifBuffer`（UTF-8/Shift-JIS自動判定）を各ファイルに適用。判定失敗ファイルは失敗として報告 |
| B4 | 形式対応 | KIF/棋譜テキストを `KifuRecord` に変換（`jkfJson` 生成 + `rawKif` 保持）。既存パーサーを再利用 |
| B5 | 重複スキップ | 各棋譜の `contentHash` を既存 `KifuRecord` と照合。一致は「重複」としてサマリに計上し、自動スキップ（強制取込オプションあり） |
| B6 | 取込結果サマリ | 処理後に「成功N件 / 重複M件 / 失敗K件」を表示。失敗ファイルはファイル名＋理由（パース失敗/エンコード不明/形式不正）をリスト表示 |
| B7 | 取込後アクション | 取込んだ棋譜を「そのままライブラリへ保存」と「続けてAI解析キューへ投入（`analysisStatus:'queued'`）」を選択可能に（#59との連携） |
| B8 | 大量取込の進捗 | 100件規模でもUIが固まらないよう、ファイル単位で逐次処理＋進捗表示（`処理中 i/N`） |

## 4. UI配置

- 統一ライブラリ画面（`KifuLibraryView`）の「インポート」タブ/ボタンから起動
- 既存 `StudioKifuImportModal` / `KifuManagementModal` の取込フローを拡張（モーダル内に複数ファイル対応エリアを追加）

## 5. 非機能要件

- N1: 1ファイルあたりのパースは既存ロジックを再利用し、Web Worker化は不要（1件数十ms想定）
- N2: 失敗しても全体を中断しない（per-file try/catch、最後にサマリ）
- N3: localStorage容量に注意（`jkfJson` は大きめ。500件超で容量警告を検討）
- N4: strict TypeScript / `any` 禁止
