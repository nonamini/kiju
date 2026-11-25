# 棋譜管理機能強化 - 要件定義書 (Kifu Management Enhancement Requirements)

## 1. 背景と目的

現状、棋譜管理は2系統に分断されている。

- **Studio系** (`studioKifuStorage.ts` / `SavedStudioGame`): 対局研究モード用。localStorage + Firestore 双方向同期。タグ・棋士プロフィール・AI評価・解析状態を保持。
- **Tree系** (`ingestedGamesStorage.ts` / `IngestedGame` / `GameMergeInput`): 定跡ツリー構築モード用。localStorage のみ。ツリーへのマージ対象管理 (`isIncluded`) を保持。

### 現状の課題（ユーザー確認済み）
1. **探しにくい** — 検索がタイトル・棋士名・戦型・タグの部分一致のみ。日付・勝者・解析状態での絞り込みや並び替えがない。
2. **重複・二重管理** — 同一棋譜を Studio と Tree で別々に登録してしまう。
3. **UIが使いにくい** — Tree側ライブラリ (`KifuLibraryTable`) には検索ボックスすらない。タグUIも Studio内で2種類が混在。
4. **メタ情報不足** — 棋譜へのメモ・お気に入り・復習状態などの付帯情報がない。

### 方針（ユーザー確認済み）
- **データ統合**: 新しい共通モデル `KifuRecord` を新設し、両機能が参照する構造にする。
- **UI統合**: Studio用・Tree用で別画面のままにせず、**1つの統一ライブラリ画面に集約**する。
- **移行**: Firestore 既存データを含め**一括移行**する（後方互換の段階移行は行わない）。
- **スコープ**: 追加・削除・移動など**フル管理**を含む。
- **優先領域**: 検索・一覧UX と データ基盤。

---

## 2. 共通データモデル `KifuRecord`

```typescript
export interface KifuRecord {
  // === 識別・基本 ===
  id: string;                    // UUID（新規採番）
  title: string;
  contentHash: string;           // 棋譜本体の正規化ハッシュ（重複検出用）
  source: 'studio' | 'tree' | 'import'; // 登録経路

  // === 対局情報 ===
  senteName: string;
  goteName: string;
  sentePlayerId?: string;        // ShogiPlayerProfile.id
  gotePlayerId?: string;
  matchDate?: string;            // ISO 8601 (YYYY-MM-DD)
  tournament?: string;
  openingId: string;             // OPENING_CATEGORIES.id
  openingName: string;
  winner?: 'sente' | 'gote' | 'draw' | 'unknown';
  totalPlies: number;

  // === 棋譜本体 ===
  jkfJson: string;               // JSONKifuFormat
  rawKif?: string;

  // === 分類・メタ情報 ===
  tags: string[];
  notes?: string;                // 自由記述メモ
  favorite?: boolean;
  reviewStatus?: 'unread' | 'read' | 'needs_review';

  // === 解析 ===
  evaluations?: Record<number, MoveEvaluation>;
  analysisEngineId?: string;
  analysisDepth?: number;
  analysisStatus?: 'unanalyzed' | 'analyzing' | 'completed';
  analyzedPliesCount?: number;

  // === Tree連携 ===
  isIncludedInTree: boolean;     // ツリーへのマージ対象フラグ
  activeForkPointers?: ForkPointer[]; // 最後に選択した分岐パス

  // === 監査・移行 ===
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
  originStudioGameId?: string;   // 移行元 SavedStudioGame.id
  originIngestedGameId?: string; // 移行元 IngestedGame.id
}
```

### 設計上の決定事項
- `isIncludedInTree` は棋譜の属性として保持（Treeモードはこのフラグでフィルタしてマージする）。
- `contentHash` は KIF/JKF を正規化（空白・コメント除去等）した上でハッシュ化し、同一棋譜の二重登録を検出する。
- 既存 `SavedStudioGame` / `IngestedGame` は `originXxxId` で追跡可能にし、マイグレーションの冪等性を担保する。
- `evaluations` / `activeForkPointers` など Studio 固有フィールドは共通モデルに昇格（Tree側では未使用のまま保持）。

---

## 3. 機能要件

### P1: データ基盤

| ID | 要件 | 詳細 |
|----|------|------|
| D1 | 共通モデル定義 | `KifuRecord` 型とアクセス層（load/save/delete/list）を `src/utils/kifuRecordStorage.ts`（仮）に新設。localStorage キーは新規（例: `joseki_tree_kifu_records`） |
| D2 | 自動マイグレーション | アプリ起動時に `SavedStudioGame[]` と `IngestedGame[]` を読み込み `KifuRecord` に変換して統合ストレージへ保存。`originXxxId` で冪等化。旧キーは移行完了後に削除（または残置して読み取り専用化） |
| D3 | 重複検出 | インポート/保存時に `contentHash` が既存レコードと一致する場合、警告ダイアログを表示し「既存を開く」「別レコードとして保存」「マージ」を選択可能に |
| D4 | Firestore 一括移行 | `users/{uid}/games/{gameId}` の既存ドキュメントを共通スキーマへ一括変換。マイグレーション実行後は旧スキーマ読み取りを廃止。`firestore.rules` の更新が必要な場合は合わせて対応 |
| D5 | ストレージ抽象化 | localStorage + Firestore の読み書きを `KifuRecord` 単位で統一。同期は既存 `syncStudioGamesWithCloud` を `KifuRecord` ベースにリファクタ |

### P2: 検索・一覧UX（統一ライブラリ画面）

新規コンポーネント `KifuLibraryView`（仮）を作成し、Studio/Tree 両モードから同一画面を開く。モード固有の操作（「この棋譜で研究開始」「ツリーに含める」等）はアクションボタンとして出し分ける。

| ID | 要件 | 詳細 |
|----|------|------|
| S1 | テキスト検索 | タイトル・先手名・後手名・棋戦名・メモ・タグの横断部分一致（現行機能を維持・拡張） |
| S2 | 構造化フィルタ | 対局日範囲 / 勝者（先手・後手・持将棋・不明）/ 戦型（`OPENING_CATEGORIES`）/ タグ（カテゴリ別）/ 解析状態 / 復習状態 / お気に入り / 登録経路（source） |
| S3 | 並び替え | 更新日（降順/昇順）・対局日・手数・評価値（先手勝勢度）・タイトル |
| S4 | 表示切替 | テーブル表示 / カード表示。カードには局面サムネイル（先頭局面 or 最終局面の SVG/PNG）を表示 |
| S5 | 大規模対応 | 100件超を想定しページネーションまたは仮想スクロールを導入 |
| S6 | 一覧アクション | 開く / 名前変更 / 削除 / お気に入りトグル / タグ編集 / Tree含有トグル / エクスポート（KIF/JKF）を行内またはコンテキストメニューから実行 |
| S7 | 空状態・オンボーディング | 棋譜ゼロ時のインポート誘導、フィルタ結果ゼロ時のクリアボタン |

### P3: 管理機能

| ID | 要件 | 詳細 |
|----|------|------|
| M1 | メモ編集 | `notes` フィールドの編集UI（一覧からインライン or 詳細モーダル）。検索対象に含める |
| M2 | お気に入り | `favorite` フラグ + 一覧でのピン留めソート・フィルタ |
| M3 | バックアップ/復元 | 全 `KifuRecord` を JSON エクスポート/インポート。`contentHash` で復元時の重複を自動スキップまたは上書き選択 |
| M4 | 一括操作 | 複数選択 → タグ一括付与/削除、Tree含有一括切替、削除（確認ダイアログ付き） |
| M5 | 棋士別対局一覧 | `ShogiPlayerProfile` から「この棋士が絡む対局」への導線。`sentePlayerId`/`gotePlayerId` でフィルタした統一ライブラリを開く |
| M6 | 復習状態管理 | `reviewStatus` の手動切替（未読→既読→要復習）。将来的に `sm2Scheduler` と連携可能な設計とする |
| M7 | 削除時の整合性 | Tree側で `isIncludedInTree=true` の棋譜を削除する際、マージ済みツリーへの影響を警告（ツリー自体は保持、再マージ時に対象外となる旨を明示） |

### P4: 連携強化

| ID | 要件 | 詳細 |
|----|------|------|
| L1 | Studio→Tree 送込 | Studioで開いている棋譜/局面を Tree モードへ引き継ぐ導線（既存のセッション引き継ぎ機構を拡張） |
| L2 | Tree→Studio 登録 | `KifuLibraryTable` の「登録」操作で `KifuRecord` として保存し、解析・研究用途に使えるようにする |
| L3 | 解析状態の統一 | Tree側で解析した評価値も `KifuRecord.evaluations` に保存し、Studio側と共有。`analysisStatus` の表示を統一ライブラリで一元管理 |

---

## 4. 非機能要件

| ID | 要件 |
|----|------|
| N1 | 型安全: `strict TypeScript`、`any` 禁止（プロジェクトルール準拠） |
| N2 | データ損失防止: マイグレーションはトランザクション的に実行し、失敗時は旧データを保持 |
| N3 | オフライン対応: localStorage を一次ソースとし、Firestore は同期レプリカ（既存方針を踏襲） |
| N4 | パフォーマンス: 500件規模のライブラリで一覧描画・検索が実用速度（仮想スクロールまたはページネーションで担保） |
| N5 | i18n: UI文字列は `react-i18next` 経由（既存パターン踏襲） |
| N6 | Firestore コスト: Spark無料枠を前提に、読み取り回数を抑える設計（一覧はローカル、差分同期のみクラウド） |

---

## 5. 移行計画

```
Phase 0: KifuRecord モデル定義 + アクセス層 + ユニットテスト
Phase 1: ローカルマイグレーション（SavedStudioGame + IngestedGame → KifuRecord）
Phase 2: Firestore 一括マイグレーション + firestore.rules 更新
Phase 3: 統一ライブラリ画面 (KifuLibraryView) 新設 + Studio/Tree からの呼び出し差し替え
Phase 4: 検索・フィルタ・ソート・表示切替の実装
Phase 5: 管理機能（メモ/お気に入り/バックアップ/一括操作/棋士別一覧）
Phase 6: 連携強化（L1〜L3）
```

各 Phase 完了時点で既存機能が動作することを維持する（Feature Flag 不要、段階的リファクタ）。

---

## 6. 決定事項（ユーザー確認済み）

- **UI形態**: Studio用・Tree用で別画面にせず、**1つの統一ライブラリ画面に集約**する。
- **Firestore移行**: 既存 `users/{uid}/games` ドキュメントを**一括変換**する。旧スキーマの読み取り互換は設けない。
- **管理スコープ**: 追加・削除・移動など**フル管理**を含む。
- **優先領域**: 検索・一覧UX と データ基盤。
- **ライブラリ形態（2026-02 確定）**: **フルページ新設**（`/library` ルートの `KifuLibraryPage`）。既存モーダル（`StudioKifuManagementModal` / `StudioKifuLibraryModal` / `KifuLibraryTable`）は**並行運用**とし、段階的に導線を新ページへ移す。
- **タグ管理方針（2026-02 確定）**: タグは**安定ID管理**とする。`KifuRecord` はタグ名ではなく `tagIds` で参照し、表示名はレジストリから解決する。これによりタグ名変更（例: `#新人王` → `#新人王戦`）を行ってもレコードとの紐付けは維持される。タグ辞書（カテゴリ+タグ）はJSONでエクスポート/インポート可能とし、IDベースのマージで既存紐付けを壊さない。
- **棋士情報管理**: 棋士・プレイヤー情報のメンテナンスUIは設定画面には置かず、`player_analysis.md` の棋士図鑑（Epic 14）側に集約する。
- **対局種別分類（2026-02 確定）**: `KifuRecord.gameKind` でプロ棋譜と自分の対局を第一級区別する。値は `'pro' | 'self' | 'other'`。ライブラリは種別ごとのセクション/タブをデフォルト表示とし、ツリービジュアライザーは「プロのみ / 自分のみ / 重ね合わせ」のスコープ切替＋種別色分けで、自分の指しがプロ定跡とどこで一致・分岐するかを視覚化する。単なるフィルターではなく、データモデルとビュー構造の両方で区別する。

## 6.5 対局種別 `gameKind` 設計（Issue #71 で実装）

### 分類定義

```typescript
// KifuRecord に追加
gameKind?: 'pro' | 'self' | 'other';
// 'pro'   = プロ公式棋譜（棋戦・タイトル戦・公式棋譜）
// 'self'  = ログインアカウント本人がプレイヤーとして絡む対局
// 'other' = その他の非プロ対局（家族・知人等の個人ユーザ、AI対局等）
```

### 「自分」の識別

- `ShogiPlayerProfile` に `isOwner?: boolean` を追加。ログインアカウントに紐づく「本人」プロフィールを1件だけ True にできる（プレイヤー編集UIで手動設定。自動設定は初回サインイン時の提案に留める）
- `gameKind='self'` の判定: 先手/後手どちらかの `sentePlayerId`/`gotePlayerId` が `isOwner` プロフィールを指す、またはスパーリング/対局履歴由来のレコード
- AI対局・家族/知人との対局は `other`（本人が指していても相手がAI・個人ユーザなら other。本人プロフが絡む実対局のみ self）

### 自動提案ルール（取込/保存時の初期値。手動上書き可）

1. owner プレイヤーが絡む → `self`
2. それ以外で `category:'pro'` プレイヤーが絡む、または棋戦名がプロ棋戦に一致 → `pro`
3. それ以外 → `other`

プロ名を含むがプロフィール未登録の棋譜は `other` で登録し、ライブラリ上でプロ棋士図鑑（Epic 14）への登録導線を出す。

### ツリーでの扱い

- ツリービジュアライザーにスコープ切替: `プロのみ` / `自分のみ` / `すべて（重ね合わせ）`
- 重ね合わせ時は枝・ノードを gameKind で色分けし、「プロ定跡に対して自分の棋譜が一致している区間」と「分岐した地点」が視覚的に分かるようにする
- `isIncludedInTree` とは独立した表示フィルタとして実装（データは削除しない）

## 6.6 タグIDレジストリ設計（Issue #64 で実装）

### 背景

現行は `KifuRecord.tags: string[]`（タグ名のフラット配列）+ `STRUCTURED_TAG_GROUPS`（組込カテゴリ: source/tournament/opening/study）+ `joseki_tree_custom_tag_groups`（カテゴリ別カスタムタグ名）の3層。タグ名をキーにしているため、**改名すると全レコードの紐付けが切れる**。

### 新データモデル

```typescript
// src/types/tagRegistry.ts（新設）
export type TagGroupId = 'source' | 'tournament' | 'opening' | 'study' | 'custom';

export interface TagDefinition {
  id: string;            // 安定ID（UUID）。改名しても不変
  name: string;          // 表示名。変更自由
  groupId: TagGroupId;   // 所属カテゴリ
  isBuiltin?: boolean;   // STRUCTURED_TAG_GROUPS 由来の組込タグ
  createdAt: string;
  updatedAt: string;
}
```

- **ストレージ**: `joseki_tree_tag_registry` → `TagDefinition[]`（`tagRegistryStorage.ts` 新設、既存ストレージパターン踏襲）
- **`KifuRecord` 拡張**: `tagIds?: string[]` を追加。`tags`（名前配列）は**派生キャッシュ**として存続させ、保存時にレジストリから再生成する（検索・既存View型・Firestore doc の互換性維持）
- **組込タグのシード**: `STRUCTURED_TAG_GROUPS` の全タグを `isBuiltin: true` で初回起動時にレジストリへ登録。組込タグの `id` は `builtin:{groupId}:{name}` の決定的IDとし、環境間で一致させる
- **既存データ移行**: `tags` の名前 → レジストリで `(groupId, name)` 照合 → `tagIds` 生成。未登録名は `custom` グループに自動登録してからID化。Firestore側も pull 時に同じ解決を行う
- **タグ編集UI**: レコードへの付与/剥がしは `tagIds` を更新し、`tags` は保存時に再生成

### タグ辞書のエクスポート/インポート

- **対象**: `TagDefinition[]`（id/name/groupId/isBuiltin）+ カスタムグループ定義。組込タグはエクスポートに含めるが、インポート時は `isBuiltin`/既知id を優先してマージ（重複登録しない）
- **マージ semantics**: id一致 → name/groupId を更新（改名が他環境へ伝播）。name+groupId一致でid不一致 → **既存idを採用**してレコード紐付けを維持。新規 → 新id発行
- **削除**: タグ削除時、そのタグを参照する `KifuRecord.tagIds` からも除去（確認ダイアログで件数表示）。孤立タグ（参照0件）は警告付きで削除可

## 7. 残存する未決事項

- [x] `contentHash` の正規化ルール詳細 → Issue #40 で確定済み
- [x] 統一ライブラリ画面のルーティング/モーダル形態 → **フルページ `/library` に確定**（§6）
- [ ] 局面サムネイル生成方法（JKFから盤面SVGを描画 or 事前生成PNGを保存）→ Issue #55 系のUI実装時に判断
- [ ] `reviewStatus` と `sm2Scheduler` の将来連携の具体仕様
- [ ] Tree側で「ツリーに含める」操作を統一ライブラリに統合する際の UX 詳細 → Issue #63/#68
