# 棋士図鑑・棋士解析 (Player Encyclopedia & Analysis) - 要件定義書

*対応Issue: #56–58 / 前提: `kifu_management_enhancement.md` (KifuRecord) + 既存 `playerStorage.ts`*

## 1. 目的

登録済み棋士（プロ・ユーザー・AI）の「図鑑」として閲覧・分析できる体験を提供する。棋譜から自動集計される成績と、ユーザーが書く手動メモを組み合わせる。

## 2. 既存基盤

- `ShogiPlayerProfile`（`types/player.ts`）: `id, name, category('user'|'ai'|'pro'), title, note, aliases`
- `playerStorage.ts`: 名寄せ（`normalizePlayerName`/`matchPlayerProfile`/`resolveOrRegisterPlayer`）完備
- `KifuRecord.sentePlayerId` / `gotePlayerId` で棋譜と紐付け済み

## 3. 機能要件

### 3.1 棋士一覧（#56）
| ID | 要件 |
|----|------|
| P1 | `ShogiPlayerProfile[]` を一覧表示。カテゴリフィルタ（pro/user/ai）、ソート（対局数/名前/タイトル） |
| P2 | テキスト検索（名前・別名・タイトル）|
| P3 | 各カードに対局数バッジ（`KifuRecord` から集計） |

### 3.2 棋士詳細 — 自動集計（#57）
| ID | 要件 | 集計元 |
|----|------|--------|
| P4 | 総対局数・勝率・先手/後手別成績 | `KifuRecord` where sentePlayerId/gotePlayerId = player.id |
| P5 | 年別成績（`matchDate` ベースの年次集計） | 同上 |
| P6 | よく使う戦型 TOP-N（`openingId` 集計） | 同上 |
| P7 | 頻繁な対戦相手 TOP-N | 同上（相手側 playerId） |

集計は `src/utils/playerStatsAggregator.ts`（新設、仮）に純粋関数として実装し単体テスト必須。

### 3.3 棋士詳細 — 手動情報 + 導線（#58）
| ID | 要件 |
|----|------|
| P8 | 棋風・傾向メモの編集UI（`ShogiPlayerProfile.note` 拡張 or 専用フィールド） |
| P9 | 関連棋譜一覧: その棋士が絡む `KifuRecord` を統一ライブラリでフィルタ表示（`playerId` フィルタ） |
| P10 | 設定画面アカウント > プロフィール管理への導線 |

## 4. UI構成

```
棋士一覧 (/players or モーダル)
  └─ 棋士詳細
       ├─ ヘッダ: 名前・タイトル・カテゴリ・対局数
       ├─ 成績サマリ: 勝率・年別グラフ・戦型TOP
       ├─ 手動メモ編集
       └─ 関連棋譜リスト → 統一ライブラリへ
```

## 5. 非機能要件

- N1: 集計はローカル完結（棋譜増加時は集計結果をメモ化）
- N2: i18n対応
- N3: strict TypeScript / `any` 禁止
- N4: プロ棋士の外部DB連携（将棋DB等）は将来拡張。今回は自前データのみ
