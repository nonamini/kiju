# 棋樹 (Kiju) — Shogi Game Tree & Study Studio

> **将棋の棋譜大樹（ゲームツリー）可視化 × 棋譜ライブラリ＆AI解析 × 実戦・詰将棋・SRS特訓**

**棋樹（きじゅ / Kiju）** は、将棋の棋譜管理・研究分岐・実戦トレーニングをブラウザまたはデスクトップアプリ上で完結して行えるオープンソースの将棋研究アプリケーションです。

- **Web版アプリ**: https://nonamini.github.io/kiju/
- **アプリ紹介・使い方ページ**: https://nonamini.github.io/kiju/about/
- **リポジトリ**: https://github.com/nonamini/kiju

初期状態からアカウント登録・サーバー送信なしの **ローカルファースト（オフライン動作）** で動き、内蔵の **Fairy-Stockfish (Wasm/NNUE)** によるAI検討・対局に加え、外部USIエンジン・NNUE評価関数・定跡DB（`.db` / `.sbk`）・カスタム盤面/駒SVG・自作バックアップ/同期機能に対応しています。

---

## 🌟 主な機能

- **検討盤 ＆ 多分岐定跡ツリー**: KIF / KI2 / CSA / JKF 取り込み（一括読込・UTF-8/CP932自動判別）、途中変化の分岐ツリー管理、分割研究ワークスペース（定跡ノート・定跡DB `.db`/`.sbk`・研究メモ）、局面編集。
- **統一棋譜ライブラリ ＆ 棋士図鑑**: タグ・戦型・勝敗・解析状態での構造化フィルタ、マイフィルター保存、対局者別の通算成績・戦型傾向の自動集計。
- **実戦トレーニングモード**:
  - **AIスパーリング対局**: 任意局面からの練習・持ち時間設定・新規手順のツリー反映
  - **実戦次の一手クイズ**: AI解析済み棋譜から形勢急変局面を自動出題（段階ヒント付き）
  - **詰将棋**: 収録問題・`.sfen`/`.kif` 問題集取込・自戦棋譜からの詰み局面抽出
  - **棋譜なぞり / SRS復習**: 1手ずつ手順を再現するリコール練習と SM-2 間隔反復
- **外観 ＆ 拡張カスタマイズ**:
  - 盤面テーマ（本榧・木目・ダーク・スレート）と一文字／二文字彫駒、カスタムSVG/PNG盤面・8×4駒スプライト・自作駒音登録
  - ブラウザ内 `.nnue` 追加、デスクトップ版ローカル USI `.exe` 直接実行、WebSocket USI ブリッジ
- **データ管理 ＆ マルチデバイス同期**:
  - JSONエクスポート / インポート（重複スキップマージ）
  - 同期フォルダ自動バックアップ（Google Drive / OneDrive / Dropbox 等、Firebase不要）
  - 自前クラウド同期（ご自身の Google Firebase Spark 無料枠を利用した BYOF 同期）

---

## 📘 使い方ガイド

詳しい使い方はアプリ内の **`/guide`**（ホーム画面「使い方」ボタン、または各画面右上の `❓` ボタン）から機能・目的別に閲覧できます：

1. **3ステップで始める**（サンプル棋譜 / 取り込み → AI検討＆分岐 → 保存）
2. **棋樹（定跡大樹）の見方**（全棋譜の分岐統合・色分け・ノードから検討盤へ直行）
3. **検討盤・AI解析・変化分岐・局面編集**
4. **棋譜の取り込み・一括登録・保存**（テキスト貼付・複数ファイル/フォルダ一括・上書き/別名保存）
5. **棋譜ライブラリ・棋士図鑑**（複合フィルタ・マイフィルター・タグ管理・対局者集計）
6. **定跡ノート・分割研究・定跡DB**（`.db` / `.sbk` 照合・ノート共有）
7. **対局・クイズ・詰将棋・棋譜なぞり**（AIスパーリング・次の一手・`.sfen`/`.kif` 詰将棋）
8. **盤面カスタム・AIエンジン・評価関数**（駒・盤面SVGテンプレート、`.nnue` / USI `.exe`）
9. **バックアップ・フォルダ同期・クラウド**
10. **よくある質問・トラブル対策**（PWAインストール、Windows SmartScreen警告、データ保護）

---

## 🔧 上級者向けノウハウ（自前クラウド同期 ＆ クラウド解析の構築）

通常利用ではアカウント登録なしでブラウザ内にデータが保存されますが、**PC ↔ スマホ間の自動同期** や **手持ちの棋譜を GitHub Actions 上の将棋エンジンで一括解析する環境** をご自身のアカウントだけで構築することもできます。

### 1. 自前 Firebase によるクラウド同期（PC ↔ スマホ）
1. [Firebase Console](https://console.firebase.google.com/) で無料プラン（Spark）のプロジェクトを作成します。
2. **Authentication**（ログインプロバイダ：`Google` を有効化）と **Cloud Firestore**（データベース作成）を有効にします。
3. Authentication の「設定 → 承認済みドメイン」に、利用するドメイン（例：`nonamini.github.io`、またはご自身でホスティングするドメイン）を追加します。
4. Webアプリを登録して取得した Firebase 設定（JSON / Config）を、本アプリの **「設定 → アカウント」** 画面に貼り付けて Google ログインします。

### 2. GitHub Actions によるクラウド一括解析（`Kifu Analysis Batch`）
上記の自前 Firebase でログインすると、検討盤・ライブラリ・棋譜管理モーダルに **「☁️ クラウド解析」** UI が表示されます。実際の解析処理は、フォークしたご自身の GitHub リポジトリ上の GitHub Actions（[.github/workflows/analyze-kifu.yml](.github/workflows/analyze-kifu.yml)）で実行します：

1. 本リポジトリ（`nonamini/kiju`）をご自身の GitHub アカウントへ **Fork** します。
2. フォーク先リポジトリの **Settings → Secrets and variables → Actions** で以下を設定します：
   - **Secrets**:
     - `FIREBASE_SERVICE_ACCOUNT_KEY`: Firebase プロジェクトの「サービス アカウント → 新しい秘密鍵の生成」で取得した JSON の中身
   - **Variables**（解析に使うエンジン・評価関数の取得設定。詳細は [scripts/fetch-engine.sh](scripts/fetch-engine.sh) 参照）:
     - `YANEURAOU_BINARY_URL` / `YANEURAOU_BINARY_SHA256`: Linux 向けビルド済みエンジンバイナリのURL・SHA-256（未指定時は `YANEURAOU_REF` のタグ/ブランチから自動ビルド）
     - `SUISHO_EVAL_URL` / `SUISHO_EVAL_SHA256`: 利用する NNUE 評価関数ファイルのURL・SHA-256
3. アプリ側から棋譜をクラウド解析キューに送信したあと、フォーク先リポジトリの **Actions → `Kifu Analysis Batch`（Run workflow）** を実行すると、`workers/analysis-runner` が Firestore 上のキューを読み取って解析し、評価値・読み筋を自動で書き戻します。

> ※ 本リポジトリには外部の将棋エンジンや評価関数ファイルは一切同梱していません。ご自身で設定するバイナリ・評価関数は各配布元のライセンスに従ってご利用ください。

---

## 🛠️ 開発・ビルドコマンド

### 前提環境
- Node.js 20 以上
- デスクトップ版ビルド（任意）: Rust / Tauri CLI

### セットアップ ＆ コマンド

```bash
npm install

# 開発サーバー起動 (http://localhost:5173)
npm run dev

# 型チェック（TypeScript strict）
npm run type-check

# テスト実行 (Vitest)
npm test

# 本番ビルド
npm run build

# デスクトップアプリ開発 / ビルド (Tauri v2)
npm run tauri:dev
npm run tauri:build
```

---

## 📜 ライセンス ＆ クレジット

- 本プロジェクトは **GNU General Public License v3.0 (GPL-3.0)** のもとで公開されています。全文は [LICENSE](LICENSE) をご覧ください。
- 同梱エンジン（Fairy-Stockfish Wasm）・盤面/駒 SVG アセット（`sunfish-shogi / shogi-images` CC0 1.0 二次加工）・各種オープンソースライブラリの権利表記は [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) にまとめています。
- ユーザーが任意で読み込む棋譜・定跡DB・NNUE評価関数ファイル・ローカルUSIエンジンは本リポジトリに含まれません。各配布元の利用規約・ライセンスに従ってご利用ください。
- Web公開版（GitHub Pages）では機能改善のため、Cookie不使用の匿名利用統計（Umami Cloud：閲覧画面と機能ごとの実行回数・取り込み件数のみ）を計測しています。棋譜の内容・対局者名・ファイル名・個人情報は一切送信されません。
