# モチベーションダッシュボード (Motivation Dashboard) - 要件定義書

*対応Issue: #53–55 / 前提: `kifu_management_enhancement.md` (KifuRecord)*

## 1. 目的

「どれくらい練習・研究したか」を一目で実感できる可視化を提供し、継続モチベーションを維持する。ユーザー重視点: **UI/UX重視・対戦成績分析・活動量・成長推移**。

## 2. データソース

- `KifuRecord[]` — 取込棋譜数・対局日・戦型・勝敗
- `MatchRecord[]`（`matchHistoryStorage`）— AIスパーリング対戦成績
- `SRSReviewCard[]`（`srsStorage`）— 復習活動・連続日数
- `QuizCard` 系 — クイズ実施状況（あれば）

## 3. 表示項目

### 3.1 活動量・成長推移
| 指標 | 内容 |
|------|------|
| 連続練習日数 | SRS/対局/取込いずれかの活動があった連続日数（現在のストリーク + 最長記録） |
| 今週の活動量 | 棋譜取込数・対局数・復習枚数の週次バー |
| 累計成長 | 総棋譜数・総対局数・総復習数のタイムライン |
| 定跡カバレッジ | `OPENING_CATEGORIES` ごとの取込局数/習熟度のカバー率 |

### 3.2 対戦成績分析
| 指標 | 内容 |
|------|------|
| 勝率推移 | `MatchRecord` の時系列勝率グラフ（Chart.js、既存 `EvaluationChart` と同系） |
| 戦型別成績 | 戦型ごとの勝率・対局数ヒートマップ/バー |
| 対戦相手別 | AIエンジン別・棋士別の勝敗内訳 |
| 直近フォーム | 直近10戦の勝敗インジケータ |

## 4. 集計ロジック

- `src/utils/activityAggregator.ts`（新設、仮）: 純粋関数で `KifuRecord[] + MatchRecord[] + SRSReviewCard[] → ActivityStats` を返す。単体テスト必須（fixtureデータで順序非依存を検証）
- 既存 `masteryAggregator.ts`（戦型別SRS+対局集計）は再利用・拡張

## 5. UI構成

- 新規ダッシュボード画面（`/dashboard` ルート or HomePage のセクション — 実装時に判断）
- モバイルファースト。カード型レイアウトで「今週の活動」「ストリーク」「勝率推移」「定跡カバレッジ」を並べる
- 各カードから関連画面へ導線（復習→SRSダッシュボード、棋譜→ライブラリ、対局→スパーリング）

## 6. 非機能要件

- N1: 集計はローカルデータのみ（Firestore不要）
- N2: 500件規模の棋譜・対局でも初期描画が実用速度（集計はメモ化）
- N3: i18n対応（`ja.json`/`en.json` に文言追加）
- N4: strict TypeScript / `any` 禁止
