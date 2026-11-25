# 棋樹 (joseki-tree) - Task Breakdown & Roadmap (作業可能単位 Issue 一覧)

Each task is structured as a self-contained, atomic GitHub Issue adhering to **Rule 6: Micro-Step Implementation (1PR = 1 Responsibility)**, **Mock-First**, and **GitHub Flow**.

---

## 🏗️ Epic 1: Foundations & Infrastructure (基盤構築)

### Issue #1: Project Scaffolding & Strict TypeScript Setup
- **Labels**: `epic:foundations`, `setup`
- **Branch**: `feature/issue-1-scaffolding-ts`
- **Scope**:
  - Initialize Vite + React 18 + TypeScript environment.
  - Configure `tsconfig.json` with strict 4-tier guardrails (`strict: true`, `noImplicitAny: true`, `strictNullChecks: true`, `noUncheckedIndexedAccess: true`).
  - Establish base directory structure (`src/components`, `src/types`, `src/locales`, `src/mock`, `src/utils`).
  - Verify zero TypeScript diagnostics.
- **Acceptance Criteria**:
  - [ ] `npm run build` and `npm run type-check` pass with 0 warnings/errors.
  - [ ] Development server starts cleanly via `npm run dev`.

### Issue #2: Tailwind CSS & Responsive Layout Base
- **Labels**: `epic:foundations`, `ui`
- **Branch**: `feature/issue-2-tailwind-layout`
- **Scope**:
  - Install and configure Tailwind CSS and PostCSS.
  - Set up design tokens, color palette, dark mode / light mode baseline.
  - Create responsive shell layout (Header, Nav, Main Container, Footer) supporting mobile (375px) and desktop.
- **Acceptance Criteria**:
  - [ ] Tailwind utility classes compile and render expected styling.
  - [ ] Shell layout conforms to mobile and desktop viewports without horizontal overflow.

### Issue #3: i18n Localization Foundation
- **Labels**: `epic:foundations`, `i18n`
- **Branch**: `feature/issue-3-i18n-setup`
- **Scope**:
  - Setup localization architecture (`i18next` / custom lightweight hook).
  - Create initial dictionary schemas: `src/locales/ja.json` and `src/locales/en.json`.
  - Enforce zero hardcoded Japanese strings in JSX/TS logic via `t('key')`.
- **Acceptance Criteria**:
  - [ ] Switching locale dynamically updates rendered UI strings.
  - [ ] All shell text and navigation labels are served strictly via `t()`.

### Issue #4: Shogi Domain Types & Mock Shell Route
- **Labels**: `epic:foundations`, `types`, `mock`
- **Branch**: `feature/issue-4-types-and-mock`
- **Scope**:
  - Implement domain models from `docs/spec/data_models.md` into `src/types/shogi.ts`, `tree.ts`, `srs.ts`, and `match.ts`.
  - Setup `/mock` route with dummy data to preview application wireframe and component arrangement.
- **Acceptance Criteria**:
  - [ ] All domain types match specifications exactly without hallucinated properties.
  - [ ] Navigating to `/mock` presents functional placeholder dashboard and board mock without runtime errors.

### Issue #5: Firebase Configuration & GitHub Actions CI/CD
- **Labels**: `epic:foundations`, `cicd`, `firebase`
- **Branch**: `feature/issue-5-cicd-firebase`
- **Scope**:
  - Configure `firebase.json`, `.firebaserc`, and baseline `firestore.rules`.
  - Create GitHub Actions workflow for PR preview channels (`FirebaseExtended/action-hosting-deploy`).
  - Create GitHub Actions workflow for automatic deployment to live Firebase Hosting on merge to `main`.
- **Acceptance Criteria**:
  - [ ] Opening a PR generates a dedicated preview deployment URL.
  - [ ] Merging a PR into `main` automatically deploys build artifacts to Firebase Hosting.

---

## 📜 Epic 2: KIF Engine & Management (棋譜エンジン・管理)

### Issue #6: KIF Parser Core (UTF-8 & Shift-JIS / Auto-Detection)
- **Labels**: `epic:kif-engine`, `parser`
- **Branch**: `feature/issue-6-kif-parser-core`
- **Scope**:
  - Implement encoding detection and decoding for UTF-8 and CP932 / Shift-JIS via `TextDecoder`.
  - Parse metadata headers (`対局日`, `先手`, `後手`, `棋戦`, `勝敗`).
  - Parse move sequences (ply, color, from, to, piece, promotion, drop).
  - Safely strip variation markers (`+`) and comment lines (`#`).
  - Unit tests covering fixtures in `tests/fixtures/sample_kifs/`.
- **Acceptance Criteria**:
  - [ ] Passes unit tests on all 4 sample fixtures in `tests/fixtures/sample_kifs/`.
  - [ ] Returns valid `IngestedGame` and `ShogiMove[]` structures without errors.

### Issue #7: Engine Evaluation Comment Extractor (`**解析`)
- **Labels**: `epic:kif-engine`, `parser`
- **Branch**: `feature/issue-7-eval-comment-extractor`
- **Scope**:
  - Parse ShogiGUI / 将棋所 style analysis comments:
    `**解析 0 [○] 候補1 時間 ... 評価値 [±score] 読み筋 [moves...]`
  - Map extracted centipawn scores, mate plies, and PV moves to `MoveEvaluation`.
- **Acceptance Criteria**:
  - [ ] Correctly extracts evaluation scores and PV lines from `19890109_90000_羽生善治vs加藤一二三.kif`.
  - [ ] Plies lacking evaluation comments receive `evaluation: undefined`.

### Issue #8: Multi-Branch Tree Merger Algorithm
- **Labels**: `epic:kif-engine`, `tree`
- **Branch**: `feature/issue-8-tree-merger`
- **Scope**:
  - Implement algorithm to merge multiple `IngestedGame` records into a single `MergedKifuTree`.
  - Automatically assign the most popular move at each junction as `isMainline: true`.
  - Aggregate adoption counts, win/loss stats, and referenced games into node comments.
- **Acceptance Criteria**:
  - [ ] Merging multiple games correctly prioritizes highest adoption frequency as mainline.
  - [ ] Child variation nodes preserve all alternative moves and metadata.

### Issue #9: Multi-Branch KIF Serializer
- **Labels**: `epic:kif-engine`, `serializer`
- **Branch**: `feature/issue-9-kif-serializer`
- **Scope**:
  - Convert `MergedKifuTree` back into standard KIF text with `変化：〇手` blocks.
  - Support download as `.kif` (UTF-8) and copy to clipboard.
  - Support maximum ply limit option (e.g., 60 moves) to bound opening scope.
- **Acceptance Criteria**:
  - [ ] Generated KIF text imports successfully into standard Shogi GUI applications.
  - [ ] Clipboard copy and file download actions work seamlessly.

### Issue #10: Kifu Ingestion UI & Opening Categorization
- **Labels**: `epic:kif-engine`, `ui`
- **Branch**: `feature/issue-10-kifu-management-ui`
- **Scope**:
  - Multiline text area for pasting raw KIF with `Ctrl+Enter` shortcut and drag & drop file upload.
  - Automatic opening classification (Kakugawari, Aigakari, Yagura, Furibisha, etc.) based on early moves.
  - Library table showing ingested games with include toggle, category selector, and delete action.
  - Content hash deduplication preventing duplicate records.
- **Acceptance Criteria**:
  - [ ] Parsing and adding game to table executes in < 300ms.
  - [ ] Duplicate game input displays alert without double-counting.

---

## 🎨 Epic 3: Interactive Visuals (盤面ビューアー・グラフ)

### Issue #11: Responsive SVG Shogi Board Component
- **Labels**: `epic:visuals`, `board`
- **Branch**: `feature/issue-11-shogi-board-ui`
- **Scope**:
  - Scalable 9x9 Shogi board rendered with SVG/CSS.
  - Piece stands (Komadai) for Sente and Gote showing captured pieces with counts.
  - Navigation controls (`[|<]`, `[<]`, `[>]`, `[>|]` and Left/Right keyboard arrows).
  - Board flip (`⟲`) button switching perspective between Sente and Gote.
  - Square highlight for last move source and destination.
- **Acceptance Criteria**:
  - [x] Board renders cleanly on smartphone viewports (375px) and desktop screens.
  - [x] Accurately handles moves, promotions, and piece drops.

### Issue #11b: ShogiHome-Inspired Board & Piece Visual Aesthetics Polish
- **Labels**: `epic:visuals`, `board`, `design`
- **Branch**: `feature/issue-11b-board-visual-polish`
- **Reference**: [sunfish-shogi/shogihome](https://github.com/sunfish-shogi/shogihome.git)
- **Scope**:
  - Benchmark and adopt ShogiHome design conventions for board surface and piece fidelity.
  - Authentic piece typography & rendering: High-definition traditional Shogi calligraphy, pentagonal beveling, subtle 3D grain/shadowing.
  - Board texture & grid markers: Kaya woodgrain (榧木目) styling options, refined star dots (`星`), elegant coordinate labels.
  - Komadai (駒台) modernization: Solid wood elevation, polished captured piece badges with count multipliers.
  - Preserve strict single-screen responsive fit across mobile and desktop.
- **Acceptance Criteria**:
  - [x] Board and piece visuals achieve high aesthetic precision matching ShogiHome fidelity.
  - [x] Strict single-screen layout and zero overflow are preserved across all breakpoints.

### Issue #11c: 本格木目SVG盤面・駒スプライト刷新 (High-Fidelity SVG Board & Piece Assets)
- **Labels**: `epic:visuals`, `board`, `assets`
- **Branch**: `feature/issue-11c-svg-board-piece-polish`
- **Specification**: `docs/spec/board_piece_assets.md`
- **Scope**:
  - Integrate `docs/spec/board.svg` (authentic Kaya woodgrain with accurate vertical-ratio cells) into `ShogiBoardView`.
  - Slice and map 32 piece vector symbols from `docs/spec/piece_wood.svg` (Tsuge boxwood texture, black lacquer & red promoted marks).
  - Replace text-based piece rendering with `<use href="#piece-X" />` symbols.
  - Propagate piece sprites to `KomadaiView` for uniform visual styling.
- **Acceptance Criteria**:
  - [ ] Board renders with realistic Kaya wood texture and proper cell aspect ratio.
  - [ ] All 32 piece types display sharp vector calligraphy without font rendering dependencies.
  - [ ] Board flipping (`isFlipped`) and move highlight overlays align seamlessly.
  - [ ] Captured piece stands (Komadai) share the identical piece sprite assets.

### Issue #12: Multi-Branch Navigation & History Sync
- **Labels**: `epic:visuals`, `tree`
- **Branch**: `feature/issue-12-branch-navigation`
- **Scope**:
  - Variation selector pills appearing below board at branching junctions.
  - Clicking a branch seamlessly switches the board to that alternative timeline.
  - Breadcrumb or move tree path reflecting the active branch.
- **Acceptance Criteria**:
  - [ ] Selecting an alternative variation updates board position and move list immediately.
  - [ ] Navigating back and forth maintains correct branch history.

### Issue #13: Interactive Evaluation Graph (Chart.js)
- **Labels**: `epic:visuals`, `chart`
- **Branch**: `feature/issue-13-eval-chart`
- **Scope**:
  - Chart.js line graph: X-axis = Move Ply, Y-axis = Centipawn Score (-2000 to +2000).
  - Synchronized vertical line cursor reflecting current board position.
  - Clicking any data point jumps the board to that specific move.
- **Acceptance Criteria**:
  - [ ] Graph dynamically updates plot points when switching branches.
  - [ ] Clicking a data point navigates board state to that ply.

---

## 🤖 Epic 4: AI Analysis & Wasm Engine (AI局面解析)

### Issue #14: Fairy-Stockfish Wasm Web Worker Bridge
- **Labels**: `epic:wasm-ai`, `engine`
- **Branch**: `feature/issue-14-wasm-worker`
- **Scope**:
  - Bundle `fairy-stockfish-nnue.wasm` inside dedicated Web Worker.
  - Bidirectional USI protocol bridge (`isready`, `position`, `go depth/byoyomi`, `stop`).
  - Zero UI thread blocking during engine search.
- **Acceptance Criteria**:
  - [ ] Engine initializes successfully and responds to `isready` with `readyok`.
  - [x] Returns `bestmove`, score, and PV for arbitrary SFEN positions within configured time.

### Issue #14b: Multi-Engine Technical Spike (Fairy-Stockfish & TuyouraOu11 mini/micro)
- **Labels**: `epic:wasm-ai`, `engine`, `spike`
- **Branch**: `feature/issue-14b-multi-engine-spike`
- **Scope**:
  - Investigate and verify browser Wasm execution of YaneuraOu with TuyouraOu11 evaluation files.
  - Verify Emscripten MEMFS file mounting for `nn.bin` and `progress.bin` for mini (~8.7MB) and micro (~4.8MB).
  - Design multi-engine provider/adapter abstraction layer enabling dynamic switching between:
    1. Built-in Fairy-Stockfish (zero external download, instant boot, lightweight baseline)
    2. TuyouraOu11mini (high positional accuracy, R150+ > Suisho 5)
    3. TuyouraOu11micro (high NPS exploration speed, R150+ > Suisho 5)
  - Implement prototype engine selector in Mock view with download/initialization progress bar.
  - Benchmark and document feasibility, memory footprint, and sparring suitability.
- **Acceptance Criteria**:
  - [x] Engine selector UI allows choosing between the 3 engines with live status.
  - [x] TuyouraOu evaluation files load into virtual memory and initialize via USI (`readyok`).
  - [x] Selected engine successfully computes evaluations and returns valid Shogi moves.



### Issue #15: Tree-Wide Batch Analysis & Progress UI
- **Labels**: `epic:wasm-ai`, `analysis`
- **Branch**: `feature/issue-15-tree-analysis`
- **Scope**:
  - Single game automated move traversal and evaluation attachment.
  - Tree-wide re-analysis iterating all unique nodes in `MergedKifuTree`.
  - Real-time progress bar UI (`Analyzing: X / Y positions...`) with cancel capability.
- **Acceptance Criteria**:
  - [x] Analysis results persist to `MoveEvaluation` on respective tree nodes.
  - [x] Progress bar tracks analysis status accurately without UI stutter.

---

## 🧠 Epic 5: Training Modes (暗記特訓 ＆ AI対局)

### Issue #16: Active Recall SRS Drill Engine & Board Interaction
- **Labels**: `epic:training`, `srs`
- **Branch**: `feature/issue-16-srs-drill-engine`
- **Scope**:
  - Setup screen: Side selection (Sente/Gote), starting ply (move 1 or mid-game position).
  - Turn loop: Computer plays opponent's moves from tree (frequency-weighted random).
  - Move validation: User plays move on board; verified against valid variations.
- **Acceptance Criteria**:
  - [x] Valid user move advances state and triggers computer response.
  - [x] Invalid move rejects piece back to source square with error cue.

### Issue #17: 5-Type Selective Hints Panel
- **Labels**: `epic:training`, `hints`
- **Branch**: `feature/issue-17-selective-hints`
- **Scope**:
  - Implement 5 independent hint buttons:
    1. `[ Rank Position ]` (ranks 1-5 vs 6-9)
    2. `[ File Position ]` (files 1-3, 4-6, 7-9)
    3. `[ Piece Type ]` (Pawn, Silver, Bishop, etc.)
    4. `[ Board vs Hand ]` (Board move vs Drop)
    5. `[ Show Answer ]` (Highlight move coordinates on board)
- **Acceptance Criteria**:
  - [x] Each button reveals only its specific clue without uncovering others.
  - [x] Hint usage is tracked and recorded for SRS difficulty weighting.

### Issue #18: SM-2 Spaced Repetition Scheduling & Daily Review
- **Labels**: `epic:training`, `srs`
- **Branch**: `feature/issue-18-sm2-scheduler`
- **Scope**:
  - SM-2 algorithm: updates `intervalDays`, `repetitionCount`, `easeFactor`, `dueDate`.
  - Daily Review Dashboard: calculates due cards for today and launches targeted session.
- **Acceptance Criteria**:
  - [x] Clean recall schedules next review with expanded interval.
  - [x] Mistakes reset interval to 1 day for immediate review.

### Issue #19: AI Sparring Match Mode & Out-of-Book Transition
- **Labels**: `epic:training`, `sparring`
- **Branch**: `feature/issue-19-sparring-mode`
- **Scope**:
  - Play book opening moves against tree; seamless handover to Fairy-Stockfish upon novelty.
  - Configurable engine strength (search time / depth).
  - Mid-game position launch capability from Board Viewer or Graph.
- **Acceptance Criteria**:
  - [x] Out-of-book move triggers AI takeover notice without delay.
  - [x] Engine plays legal moves through endgame completion.

### Issue #20: Sparring Repertoire Feedback & Match History
- **Labels**: `epic:training`, `sparring`
- **Branch**: `feature/issue-20-repertoire-feedback`
- **Scope**:
  - Post-match dialog: option to merge novel sparring sequence into active opening tree.
  - Match history dashboard displaying game records, win/loss stats, and replay viewer.
- **Acceptance Criteria**:
  - [x] Approved sparring moves merge into `MergedKifuTree` with sparring comment tag.
  - [x] Match history logs save cleanly to `MatchRecord`.

---

## ☁️ Epic 6: Cloud Persistence & Polish (データ永続化・PWA)

### Issue #21: Firebase Auth & User Profile
- **Labels**: `epic:persistence`, `auth`
- **Branch**: `feature/issue-21-firebase-auth`
- **Scope**:
  - Google Single Sign-On integration via Firebase Auth.
  - User session state management and restricted user profile document.
- **Acceptance Criteria**:
  - [x] User can sign in with Google and sign out cleanly.
  - [x] Unauthenticated state provides local offline sandbox mode.

### Issue #22: Cloud Firestore Sync & Security Rules
- **Labels**: `epic:persistence`, `firestore`
- **Branch**: `feature/issue-22-firestore-sync`
- **Scope**:
  - Firestore CRUD operations for `openings`, `games`, `merged_trees`, `srs_cards`, `match_records`.
  - Enforce strict security rules: users can only read/write documents under `/users/{uid}/`.
- **Acceptance Criteria**:
  - [ ] Data changes on desktop sync to mobile client in real-time.
  - [ ] Unauthorized cross-user reads/writes are blocked by Firestore security rules.

### Issue #23: PWA & Mobile Polish
- **Labels**: `epic:persistence`, `pwa`
- **Branch**: `feature/issue-23-pwa-polish`
- **Scope**:
  - Web App Manifest (icons, standalone display, theme color).
  - Service Worker configuration for asset caching.
  - Touch target sizing and mobile usability polish.
- **Acceptance Criteria**:
  - [ ] App is installable as PWA on mobile and desktop devices.
  - [ ] Passes core PWA audit requirements.

---

## 📂 Epic 7: Core UX & Kifu Management Overhaul (最優先: 棋譜管理・取り込み体験の刷新)

### Issue #24: 棋譜取り込み・初回オンボーディング導線の刷新
- **Labels**: `epic:kif-management`, `ux`, `onboarding`
- **Branch**: `feature/issue-24-kif-onboarding-ux`
- **Scope**:
  - Move KifuUploader and quick start actions from page bottom to prominent top/empty-state hero section.
  - Display clear "Start Repertoire Building" onboarding guide when library has 0 games.
  - Add permanent tree summary badge ("ツリー: X局統合中 / Yノード") in Study header.
- **Acceptance Criteria**:
  - [ ] Opening Study tab with 0 games shows immediate, scroll-free call to action for sample loading or KIF upload.
  - [ ] Active tree scale (number of games and nodes) is visible at all times.

### Issue #25: 棋譜合成の明示的コントロール＆フィードバック強化
- **Labels**: `epic:kif-management`, `ux`
- **Branch**: `feature/issue-25-explicit-merge-controls`
- **Scope**:
  - Add explicit "🔄 合成実行 (Re-merge Tree)" button with progress spinner.
  - Provide instant toast/banner notification upon merge: "X局をツリーに統合しました（Yノード生成）".
  - Clarify empty-state message when games exist in library but checkboxes are unselected.
- **Acceptance Criteria**:
  - [ ] Toggling inclusion or clicking re-merge clearly informs user of exactly how many games and nodes were generated.
  - [ ] Unchecked games show distinct "取り込み済み (未統合)" status rather than disappearing.

### Issue #26: 棋譜ライブラリテーブルの整理・検索・一括戦型変更
- **Labels**: `epic:kif-management`, `ui`
- **Branch**: `feature/issue-26-kifu-library-table-polish`
- **Scope**:
  - Streamline 8-column table into focused, scannable cards/table on desktop and mobile.
  - Add real-time text filter/search by player names, title, and date.
  - Support bulk selection for opening category reassignment and batch inclusion toggle.
- **Acceptance Criteria**:
  - [ ] Users can find target games instantly using search input with 50+ games in library.
  - [ ] Multi-select bulk actions allow reclassifying multiple games simultaneously.

---

## 📺 Epic 8: Pro Broadcast Telemetry & Deep Study (プロ中継型・深層研究機能)

### Issue #27: 同一局面の過去対局事例表示（プロ中継風 `gameRefs` ビュー）
- **Labels**: `epic:tree-study`, `feature`
- **Branch**: `feature/issue-27-past-game-refs`
- **Scope**:
  - Expand `MultiBranchTreeExplorer` to render individual past game appearances from `KifuTreeNode.gameRefs`.
  - Display pro broadcast style summary: "この局面は過去X局で出現 (勝敗・対局者・棋戦名)".
  - Add "この対局の手順へジャンプ" action to view the context of specific historic games.
- **Acceptance Criteria**:
  - [ ] Navigating tree nodes displays list of historical games that reached the current board position.
  - [ ] Clicking jump button switches board moves to match selected historical game.

### Issue #28: AI対局振り返りモードの最善手常時表示＆自動解析
- **Labels**: `epic:sparring`, `ux`
- **Branch**: `feature/issue-28-review-auto-analysis`
- **Scope**:
  - Automatically reveal AI best move and win rate without requiring manual hint button clicks during review mode.
  - Auto-trigger on-demand background analysis when stepping through unanalyzed review plies.
  - Reserve "最善手を見る (カンニング)" toggle strictly for live active matches.
- **Acceptance Criteria**:
  - [x] Stepping through moves in review mode automatically analyzes and displays AI best moves.
  - [x] Live match maintains cheat-prevention toggle while review mode provides friction-free study.

### Issue #29: 投了図からのAI深層検証（Resignation Analysis）と新分岐統合
- **Labels**: `epic:sparring`, `ai-engine`, `feature`
- **Branch**: `feature/issue-29-resignation-analysis`
- **Scope**:
  - Add deep analysis action from resignation positions in pro games or sparring matches.
  - Evaluate whether forced checkmate exists or viable defense/draw variations were possible.
  - Provide option to merge AI-verified defensive lines as newly discovered variations in the repertoire tree.
- **Acceptance Criteria**:
  - [x] Engine explores endgame continuation to determine resignation correctness.
  - [x] Verified alternative variations can be merged into active opening tree.

---

## 🎯 Epic 9: Advanced Training & Gamification (次の一手クイズ・応用特訓・習熟度)

### Issue #30: クイズ局面の自動抽出エンジン＆データモデル
- **Labels**: `epic:training`, `quiz`, `logic`
- **Branch**: `feature/issue-30-quiz-extraction-engine`
- **Scope**:
  - Define `TacticalQuizCard` data model with 4 distinct pedagogical types:
    - **Type A (🔥 攻めの好機)**: Opponent blundered/slack move; correct move increases score by +200cp.
    - **Type B (🛡️ 絶対の受け)**: Severe opponent threat; failing to defend drops score by -300cp.
    - **Type C (⚖️ 攻防の決断)**: Endgame race; deciding whether to defend or counter-attack (speed calculation).
    - **Type D (👑 寄せ・詰み)**: Decisive checkmate or mating net (+2000cp or forced mate).
  - Implement heuristic analyzer scanning evaluated games to identify turning points and compute 3-5 move continuation sequences (PV).
- **Acceptance Criteria**:
  - [x] Evaluated games produce typed quiz candidates with principal variation moves.
  - [x] Unit tests verify correct classification of Attack, Defense, Endgame Race, and Mate positions.

### Issue #31: クイズプール管理・生成ダッシュボード
- **Labels**: `epic:training`, `quiz`, `ui`
- **Branch**: `feature/issue-31-quiz-pool-management`
- **Scope**:
  - Create Quiz Pool Manager UI displaying extracted tactical quiz positions.
  - Filter quizzes by opening category, tactical type (A/B/C/D), and source game.
  - Allow toggling individual quizzes on/off for active practice.
  - Prompt user to run batch analysis on unanalyzed games to generate more quiz candidates.
- **Acceptance Criteria**:
  - [x] User can inspect, preview on mini-board, and enable/disable extracted quiz positions.
  - [x] Clear status indicates how many quizzes are available per opening.

### Issue #32: 3〜5手「次の一手」実戦特訓UI（解答・ハイブリッドヒント・判定）
- **Labels**: `epic:training`, `quiz`, `ui`
- **Branch**: `feature/issue-32-tactical-quiz-player`
- **Scope**:
  - Interactive quiz player executing 3-5 move sequence (user move → AI response → user move).
  - Hybrid input: interactive board drag/click as default, with optional "💡 3択に絞る" hint mode.
  - Tolerance judgment: AI best move, close evaluation alternatives (within 50cp), and pro game moves are accepted as valid.
  - Rich post-answer feedback with PV animation and tactical explanation.
- **Acceptance Criteria**:
  - [x] User plays 3-5 move tactical sequence with real-time feedback and tolerance validation.
  - [x] Hint mode provides 3-choice buttons with appropriate SRS retention penalty.

### Issue #33: スパーリング敗戦・定跡離脱からの「苦手局面特訓」自動生成
- **Labels**: `epic:training`, `sparring`, `srs`
- **Branch**: `feature/issue-33-weakness-drills`
- **Scope**:
  - Aggregate user's sparring loss records to detect recurring divergence points and blunders.
  - Automatically flag recurring loss positions and offer "苦手局面集中特訓" (Weakness Practice) deck.
- **Acceptance Criteria**:
  - [x] Positions where user repeatedly loses in sparring are aggregated into targeted drill list.

### Issue #34: 戦型別・定跡習熟度ダッシュボード
- **Labels**: `epic:training`, `dashboard`
- **Branch**: `feature/issue-34-mastery-dashboard`
- **Scope**:
  - Aggregate SRS retention rates and sparring win rates grouped by opening classification.
  - Render visual progress chart (Mastered vs Learning percentages per opening).
- **Acceptance Criteria**:
  - [x] Dashboard displays mastery percentage and review volume for each opening category.

---

## 🔮 Future Enhancements & Backlog

### Issue #35: 棋譜タイトルの編集・メタデータ管理
- **Labels**: `enhancement`, `kifu-management`
- **Scope**:
  - Allow users to edit game titles and player names directly from the quick manager or study view.
  - Persist custom titles locally and in Firestore.
- **Acceptance Criteria**:
  - [x] User can rename imported/sparring games.
  - [x] Updated title is reflected across tree, matches, and quiz pool.

### Issue #36: 局面コメント・メモ記録機能
- **Labels**: `enhancement`, `study`, `notes`
- **Scope**:
  - Allow users to add and edit personal notes/comments on any board position in the study view.
  - Display comments alongside moves during tree exploration.
- **Acceptance Criteria**:
  - [x] User can write and save text notes on specific nodes.
  - [x] Position notes are displayed in tree explorer and exported in KIF comment blocks.

### Issue #37: 棋譜対局評価エンジン（精度レベル判定・5軸レーダーチャート・講評文生成）
- **Labels**: `epic:analysis`, `evaluation`, `logic`
- **Branch**: `feature/issue-37-game-evaluation-engine`
- **Specification**: `docs/spec/game_evaluation.md`
- **Scope**:
  - Implement preprocessing filters (ply <= 30 book truncation, ±2000cp out-of-range clamp, 500cp loss cap).
  - Calculate ACL, critical move accuracy (>=150cp diff), blunder/mistake/inaccuracy counts, and endgame reversal counts.
  - Compute 5-axis normalized scores (0-100) for Opening, Midgame, Endgame, Stability, and Tactics.
  - Map match quality levels (`AI_FLAG`, `LV_5A` ~ `LV_1`) and generate 2-sentence deterministic summary comments based on progression patterns (`WIRE_TO_WIRE`, `COMEBACK`, `SEESAW`, `CRUSH`).
- **Acceptance Criteria**:
  - [ ] Pure TypeScript evaluator matching `GameEvaluationResult` schema with 100% test coverage.
  - [ ] Zero runtime external network/LLM dependencies; runs deterministically in < 10ms per game.



### Issue #38: 対局評価エンジン v2.0 改修（期待勝率落幅 ΔWR 基準化・手数正規化・勝者免責・全体/個別ランク併記）
- **Labels**: `epic:analysis`, `evaluation`, `enhancement`
- **Branch**: `feature/issue-38-game-evaluation-v2-winrate`
- **Specification**: `docs/spec/game_evaluation.md` (v2.0)
- **Scope**:
  - **Win-Rate Drop ($\Delta\text{WR}$) Core**: Convert centipawn evaluations into expected win rate $W(V) = 100 / (1 + \exp(-V/600))$ with a 30cp shallow-search noise floor, replacing raw cp loss thresholds for Blunder ($\Delta\text{WR} \ge 20\text{ pt}$), Mistake ($10\sim 20\text{ pt}$), and Inaccuracy ($5\sim 10\text{ pt}$) to automatically grant winning-margin tolerance.
  - **Game-Length Normalization**: Normalize blunder/mistake penalties per 30 effective moves ($\text{NormFactor} = 30 / \max(15, |M|)$) so long 150+ ply games are not structurally penalized.
  - **5-Axis Radar Recalibration**:
    - `opening`: Apply Bayesian smoothing (`+5` dummy moves in denominator) to prevent 1-move score collapse.
    - `midgame` / `endgame` / `stability`: Use $\Delta\text{WR}$ and normalized error rates to eliminate multi-axis double penalties.
    - `tactics`: Implement hybrid critical position detection ($25\% \le W(V) \le 75\%$ when `secondScore` is omitted) so `tactics` reflects actual performance without requiring slow Multi-PV batch runs.
  - **Level & UI Calibration**: Compute `overallLevel` via winner-weighted average ($0.6 \times \text{Winner} + 0.4 \times \text{Loser}$) instead of `min()`, and display `[全体水準] + [▲先手水準 / △後手水準]` side by side in `StudioMatchReviewModal.tsx`.
- **Acceptance Criteria**:
  - [ ] Pro and high-level games with safe endgame simplifications are no longer downgraded to amateur/kyu levels.
  - [ ] `tactics` score varies realistically even when `secondScore` is undefined.
  - [ ] `StudioMatchReviewModal` displays both overall level and individual Sente/Gote level badges.
  - [ ] `npm run type-check` passes with 0 errors.

---

## 🧱 Epic 10: KifuRecord Unified Data Foundation (棋譜データ統合基盤) 【最優先】

*Spec: `docs/spec/kifu_management_enhancement.md`*

### Issue #39: `KifuRecord` 型定義とアクセス層の新設
- **Labels**: `epic:kifu-record`, `data-model`
- **Branch**: `feature/issue-39-kifurecord-model`
- **Scope**:
  - Define `KifuRecord` interface per spec (unifies `SavedStudioGame` + `IngestedGame` fields, adds `contentHash`, `notes`, `favorite`, `reviewStatus`, `isIncludedInTree`, `originStudioGameId`/`originIngestedGameId`).
  - Create `src/utils/kifuRecordStorage.ts` with `loadKifuRecords()`, `saveKifuRecord()`, `deleteKifuRecord()`, `updateKifuRecord()` under new storage key `joseki_tree_kifu_records`.
  - Unit tests for CRUD round-trip and storage-fallback behavior.
- **Acceptance Criteria**:
  - [ ] `KifuRecord` type compiles under strict TS with zero `any`.
  - [ ] All CRUD operations pass unit tests.

### Issue #40: `contentHash` 正規化・計算ユーティリティ
- **Labels**: `epic:kifu-record`, `logic`
- **Branch**: `feature/issue-40-content-hash`
- **Scope**:
  - Implement deterministic normalization (strip header metadata, whitespace, comment lines; canonicalize move notation) then SHA-256 hash.
  - Edge cases: same game imported as KIF vs JKF should produce identical hash.
- **Acceptance Criteria**:
  - [ ] Identical games in different formats yield the same hash.
  - [ ] Different games never collide in test fixtures.

### Issue #41: ローカルデータ自動マイグレーション
- **Labels**: `epic:kifu-record`, `migration`
- **Branch**: `feature/issue-41-local-migration`
- **Scope**:
  - On app boot, read `joseki_tree_studio_saved_games` (+legacy key) and `joseki_tree_ingested_games`, convert to `KifuRecord`, dedupe by `contentHash`/`originXxxId` (idempotent re-run safe).
  - Preserve all existing fields including `evaluations`, `activeForkPointers`, `isIncluded`→`isIncludedInTree`.
  - Keep old keys read-only until verification period ends.
- **Acceptance Criteria**:
  - [ ] Existing users see zero data loss; all games appear in unified library.
  - [ ] Running migration twice does not duplicate records.

### Issue #42a: レガシー型 ⇄ KifuRecord 変換コーデック
- **Labels**: `epic:kifu-record`, `logic`
- **Branch**: `feature/issue-42a-kifu-codec`
- **Scope**:
  - New `src/utils/kifuRecordCodec.ts` (pure functions, fully unit-tested):
    - `kifuRecordToStudioGameView(rec): SavedStudioGame` / `studioGameToKifuRecordInput(view, base)` — field mapping incl. `forkCount` recompute via `getTreeBranchStats`, `analysisStatus` value-range mapping (6値→3値 and reverse).
    - `kifuRecordToIngestedGameView(rec): IngestedGame` / `ingestedInputToKifuRecordInput(...)` — `winner` `'sente'/'gote'`⇄`'b'/'w'`, `isIncludedInTree`⇄`isIncluded`, `analysisStatus`⇄`isAnalyzed`.
    - `movesEvaluationToRecordMap(moves)` / `applyRecordEvaluationsToMoves(moves, evaluations)` — ply-keyed `MoveEvaluation` ⇄ `move.evaluation` rehydration (the critical data path for tree analysis results).
  - All conversions must be lossless-checked against fixtures from real stored data.
- **Acceptance Criteria**:
  - [ ] Round-trip tests pass for studio games and ingested games incl. evaluations, forks, tags.
  - [ ] No `any`; type-check clean.

### Issue #42b: #41 マイグレーション補完（評価値の収穫）
- **Labels**: `epic:kifu-record`, `migration`, `bugfix`
- **Branch**: `feature/issue-42b-migration-evals`
- **Scope**:
  - `ingestedGameToKifuRecord` must harvest `GameMergeInput.moves[].evaluation` into `KifuRecord.evaluations` (ply → MoveEvaluation) so tree-side analysis results survive the storage cutover.
  - Re-run safety: records migrated before this fix get evaluations backfilled on next migration pass (detect missing `evaluations` when legacy `moves` still exist).
- **Acceptance Criteria**:
  - [ ] Migrated ingested game with evaluated moves produces non-empty `evaluations` map.
  - [ ] Second migration run backfills evaluations without duplicating records.

### Issue #42c: Tree取込系の KifuRecord バック置換（アダプタ維持）
- **Labels**: `epic:kifu-record`, `refactor`
- **Branch**: `feature/issue-42c-tree-kifurecord`
- **Scope**:
  - Replace `ingestedGamesStorage` internals with `KifuRecord` store (`source==='tree'` subset).
  - `loadIngestedGames()` keeps returning `GameMergeInput[]`: internally rehydrates via `rawKif` re-parse (`kifParser`) + `applyRecordEvaluationsToMoves` from #42a. `saveIngestedGames()` diffs the list against stored tree records (upsert/delete by id).
  - Call sites (`App.tsx`, `KifuUploader`, `KifuLibraryTable`, `treeMerger`, `matchHistoryStorage`, `quizSources`) keep working with `GameMergeInput`/`IngestedGame` types unchanged.
- **Acceptance Criteria**:
  - [ ] Tree merge, quiz extraction, batch analysis, and KIF export behave identically before/after.
  - [ ] Evaluated moves rehydrate with `move.evaluation` intact.

### Issue #42d: Studio系の KifuRecord バック置換（ビュー型維持）
- **Labels**: `epic:kifu-record`, `refactor`
- **Branch**: `feature/issue-42d-studio-kifurecord`
- **Scope**:
  - Rework `studioKifuStorage.ts` public API internals to read/write the `KifuRecord` store (`source==='studio'` subset) via #42a codec; `SavedStudioGame` remains the public view type so ~100 call sites (SingleScreenStudioPage, StudioKifuManagementModal, StudioKifuLibraryModal, quiz components) need no changes.
  - `firestoreKifuSync.ts` stays on the legacy document shape for now (cloud schema unchanged until #42e).
  - `migrateExistingGamesPlayers`, `updateStudioGameEvaluations`, tag groups, last-session helpers keep working through the adapter.
- **Acceptance Criteria**:
  - [ ] All studio features (save/load/delete/evaluate/batch analyze/sync) work unchanged.
  - [ ] `forkCount`, `analysisStatus`, evaluations round-trip losslessly.

### Issue #42e: Firestore同期の KifuRecord 化 + クラウド一括移行
- **Labels**: `epic:kifu-record`, `firestore`, `migration`
- **Branch**: `feature/issue-42e-firestore-kifurecord`
- **Decisions (confirmed)**:
  - Sync scope expands to **all KifuRecord sources** (studio+tree+import) — prerequisite for smartphone import → cloud analysis (#59–62).
  - Collection path stays `users/{uid}/games/{id}`; schema discriminated by `recordSchema: 1` field on docs. `firestore.rules` unchanged (path-based only).
  - Old app versions are NOT supported after cutover (single-user operation; `forkCount` etc. may display degraded on stale clients).
- **Scope**:
  - **Phase A — doc normalization (pure, tested)**: `kifuRecordToFirestoreDoc(rec)` → `{...rec, recordSchema: 1}` with undefined sanitized; `firestoreDocToKifuRecord(data, id)` → validates new schema, converts legacy `SavedStudioGame` docs via #42a codec (`studioGameToKifuRecord`), rejects garbage.
  - **Phase B — sync rewrite**: `syncLocalRecordsToCloud` iterates `loadKifuRecords()` (all sources), LWW by `updatedAt`; `pullCloudRecordsToLocal` normalizes docs → `saveKifuRecord` (never `saveStudioGame`, to preserve `source`). `reconcileGamePlayerRefs` operates on KifuRecords directly.
  - **Phase C — caller updates**: `uploadGameToFirestore(userId, gameId)` takes an id and uploads `getKifuRecord(id)` (avoids dropping notes/favorite); `syncStudioGamesWithCloud` → `syncKifuRecordsWithCloud`; update `AuthContext` + `StudioKifuManagementModal` imports.
  - **Phase D — cloud migration (former #43)**: during pull, legacy-schema docs are converted to records, saved locally, and rewritten to Firestore in the new schema within the same sync (idempotent; `updatedAt` bumped so push phase also propagates).
  - Player profile sync (`/users/{uid}/players`) unchanged.
- **Acceptance Criteria**:
  - [ ] All KifuRecord sources (studio/tree/import) sync bidirectionally; second device sees identical library.
  - [ ] Legacy cloud docs are converted and rewritten to `recordSchema: 1` on first sync; no legacy read path remains.
  - [ ] LWW conflict resolution preserved; cross-user access still blocked by rules.
  - [ ] Unit tests cover doc normalization (new/legacy/invalid) and migration rewrite targeting.

### Issue #44: 重複検出ダイアログ（インポート/保存時）
- **Labels**: `epic:kifu-record`, `ux`
- **Branch**: `feature/issue-44-duplicate-detection`
- **Scope**:
  - On save/import, compare `contentHash` against existing records; show dialog with options: 「既存を開く」「別レコードとして保存」「内容をマージ」.
- **Acceptance Criteria**:
  - [ ] Duplicate import never silently creates a second record.

---

## ⚙️ Epic 11: Settings Screen (設定画面) 

*Spec: `docs/spec/settings_screen.md`*

### Issue #45: `appSettingsStorage` + `SettingsContext` + `SettingsModal` 骨格
- **Labels**: `epic:settings`, `ui`
- **Branch**: `feature/issue-45-settings-foundation`
- **Scope**:
  - `src/utils/appSettingsStorage.ts` (`AppSettings` schema, load/save, defaults) + `SettingsContext`/`useSettings()`.
  - `SettingsModal` component with all 5 tabs (全般/AI・エンジン/データ管理/アカウント/アプリ情報); tab contents are "準備中" placeholders until #46-#50.
  - ⚙️ entry points in both `Header` (AppLayout pages) and `SingleScreenStudioPage` top bar (which does not use AppLayout); single modal rendered once via `SettingsProvider` in `App.tsx`.
- **Acceptance Criteria**:
  - [ ] Modal opens from Header; settings persist across reload.

### Issue #46: 言語設定の永続化と Header 言語DD撤去
- **Labels**: `epic:settings`, `i18n`
- **Branch**: `feature/issue-46-language-persistence`
- **Scope**:
  - Inject saved `language` into `i18n.init`; move language selector into Settings > 全般; remove Header language dropdown.
- **Acceptance Criteria**:
  - [ ] Language survives reload; Header no longer shows language dropdown.

### Issue #47: デフォルトエンジン・解析深さの設定適用
- **Labels**: `epic:settings`, `engine`
- **Branch**: `feature/issue-47-engine-defaults`
- **Scope**:
  - Settings > AI・エンジン: engine picker (ENGINE_PROFILES cards) + default depth input.
  - Apply as initial values in `useShogiEngine` init and batch/import analysis modals (per-operation override still allowed).
- **Acceptance Criteria**:
  - [ ] Fresh session uses configured default engine/depth; in-context overrides still work.

### Issue #48: データバックアップ/復元 (JSON export/import)
- **Labels**: `epic:settings`, `data-management`
- **Branch**: `feature/issue-48-backup-restore`
- **Scope**:
  - Export all app storage keys to a single JSON file; import with per-key restore and `contentHash`-aware duplicate handling for kifu records.
  - Exclude session-state keys (`STUDIO_LAST_SESSION`) from backup.
- **Acceptance Criteria**:
  - [ ] Round-trip export→import on a clean profile restores full state.

### Issue #49: 全データリセット + ストレージ使用量表示
- **Labels**: `epic:settings`, `data-management`
- **Branch**: `feature/issue-49-reset-usage`
- **Scope**:
  - Two-step confirmed "全リセット" clearing all `joseki_tree_*` keys; per-key size table (read-only).
- **Acceptance Criteria**:
  - [ ] Reset requires explicit double confirmation listing affected data.

### Issue #50: 手動クラウド同期 + アカウント/アプリ情報
- **Labels**: `epic:settings`, `account`
- **Branch**: `feature/issue-50-sync-account-info`
- **Scope**:
  - Manual "今すぐ同期" button calling `syncKifuRecordsWithCloud` (all `KifuRecord` sources, renamed in #42e), showing last-sync timestamp and pulled/pushed/migrated counts.
  - Account section: auth status, synced-data scope note; App info: version, engine credits, help link.
- **Acceptance Criteria**:
  - [ ] User can verify sync state and trigger sync manually.

---

## 📥 Epic 12: Bulk Kifu Import (棋譜一括インポート)

*Depends on Epic 10 (#40, #44).*

### Issue #51: 複数ファイルD&D + フォルダ一括選択
- **Labels**: `epic:kifu-import`, `ux`
- **Branch**: `feature/issue-51-bulk-import-ui`
- **Scope**:
  - Extend `KifuUploader`/import modal: `<input type="file" multiple>`, drag-drop of multiple files, and directory picker via File System Access API (`showDirectoryPicker`) with graceful fallback.
- **Acceptance Criteria**:
  - [ ] Dropping 20 KIF files processes all; unsupported encodings reported per-file.

### Issue #52: 取込結果サマリ + 重複スキップ
- **Labels**: `epic:kifu-import`, `ux`
- **Branch**: `feature/issue-52-import-summary`
- **Scope**:
  - Batch result summary (成功N / 重複M / 失敗K with per-file error reasons); auto-skip `contentHash` duplicates with option to force-import.
- **Acceptance Criteria**:
  - [ ] User sees exactly which files imported, which were duplicates, which failed and why.

---

## 📊 Epic 13: Motivation Dashboard (モチベーション可視化)

*Depends on Epic 10 (#39). UI/UX重視・対戦成績分析・活動量推移が中心。*

### Issue #53: 活動量集計エンジン
- **Labels**: `epic:motivation`, `logic`
- **Branch**: `feature/issue-53-activity-aggregator`
- **Scope**:
  - Pure TS aggregator over `KifuRecord[]` + `MatchRecord[]` + SRS cards: kifu count, match count, win rate, current streak days, weekly activity series, opening coverage.
  - Unit tests on fixture data.
- **Acceptance Criteria**:
  - [ ] Aggregator returns stable stats regardless of record order.

### Issue #54: 対戦成績分析ビュー
- **Labels**: `epic:motivation`, `ui`
- **Branch**: `feature/issue-54-match-analysis-view`
- **Scope**:
  - Win-rate trend chart (Chart.js), breakdown by opening category and by opponent (AI engine / pro), recent form indicator.
- **Acceptance Criteria**:
  - [ ] Charts render correctly with 0/1/many matches edge cases.

### Issue #55: モチベーションダッシュボード画面統合
- **Labels**: `epic:motivation`, `ui`
- **Branch**: `feature/issue-55-motivation-dashboard`
- **Scope**:
  - New dashboard screen (route or Home section) combining activity stats, match analysis, streak badge, and links into SRS review / library / sparring. Mobile-first layout.
- **Acceptance Criteria**:
  - [ ] Single screen answers "今週どれくらい練習したか" at a glance on mobile.

---

## 📖 Epic 14: Player Encyclopedia (棋士図鑑)

*Depends on Epic 10 (#39) for `sentePlayerId`/`gotePlayerId` linkage.*

### Issue #56: 棋士一覧画面
- **Labels**: `epic:players`, `ui`
- **Branch**: `feature/issue-56-player-list`
- **Scope**:
  - Browse/search `ShogiPlayerProfile` (category filter: pro/user/ai, sort by game count/title/name); grid or table with avatar-less clean cards.
- **Acceptance Criteria**:
  - [ ] 100+ players remain searchable and fast.

### Issue #57: 棋士詳細 — 自動集計成績
- **Labels**: `epic:players`, `logic`
- **Branch**: `feature/issue-57-player-stats`
- **Scope**:
  - Per-player aggregation from `KifuRecord`: total games, win rate, yearly record breakdown, most-used openings, frequent opponents. Pure TS + tests.
- **Acceptance Criteria**:
  - [ ] Stats update automatically as new kifu is imported (no manual refresh).

### Issue #58: 棋士詳細 — メモ/タグ編集 + 関連棋譜導線
- **Labels**: `epic:players`, `ui`
- **Branch**: `feature/issue-58-player-detail-ui`
- **Scope**:
  - Detail page: stats charts + manual memo/style notes editor + filtered kifu list (opens unified library filtered by playerId) + link to settings account player management.
- **Acceptance Criteria**:
  - [ ] From any pro player card, user reaches their games in ≤2 clicks.

---

## ☁️ Epic 15: Cloud Analysis Pipeline (クラウド棋譜解析 — GitHub Actions方式)

*Depends on Epic 10 (#43). Approach: GitHub Actions scheduled workflow + native YaneuraOu engine + Suisho NNUE on `ubuntu-latest`. Truly free (no billing account); private-repo limit is 2,000 Actions minutes/month — keep per-run time small.*

### Issue #59: 解析ジョブキュー設計（`KifuRecord` スキーマ拡張）
- **Labels**: `epic:cloud-analysis`, `data-model`
- **Branch**: `feature/issue-59-analysis-job-queue`
- **Scope**:
  - Extend `analysisStatus` lifecycle: `unanalyzed → queued → processing → completed/failed` + `analysisClaimedAt`/`analysisJobId` for exclusive claim (prevents double-processing across GH Actions runs and local Wasm analysis).
  - Firestore composite index for `analysisStatus == 'queued'` queries; update `firestore.rules` for worker access pattern.
  - Define `analysis` result shape compatible with existing `MoveEvaluation` (`scoreCp`, `matePly`, `depth`, `pv`, `bestMoveKif`).
- **Acceptance Criteria**:
  - [ ] Two concurrent workers cannot claim the same record.
  - [ ] Existing local Wasm `evaluations` merge cleanly with cloud-produced ones (no field conflicts).

### Issue #60: USI 解析ワーカースクリプト (Node.js)
- **Labels**: `epic:cloud-analysis`, `worker`
- **Branch**: `feature/issue-60-usi-worker-script`
- **Scope**:
  - `workers/analysis-runner/` (new dir, plain Node.js ESM): fetch up to N queued `KifuRecord`s via `firebase-admin` (service-account JSON from env/secret); for each game, iterate plies and run `position sfen` + `go nodes <N>` (or depth) per position against the engine binary; parse `info ... score cp/mate ... pv` lines; write `evaluations` + `analysisStatus:'completed'` back via batch writes.
  - Claim mechanism: transaction sets `analysisStatus:'processing'` + `analysisJobId` before analyzing; timeout/error → `failed` with `analysisError` message.
  - Time-budget guard: stop claiming new games when elapsed > budget (e.g., 12 min) so a run never approaches the job timeout.
  - Reuse/port parsing logic from `src/engine/engineProtocolParser.ts` and `src/utils/evalExtractor.ts` (keep worker self-contained — no React imports).
- **Acceptance Criteria**:
  - [ ] Local `node src/index.js` with a test service account processes a fixture kifu end-to-end.
  - [ ] Script exits cleanly within time budget and always sends `quit` to the engine.

### Issue #61: エンジンバイナリ/評価関数の取得・キャッシュ戦略
- **Labels**: `epic:cloud-analysis`, `infra`
- **Branch**: `feature/issue-61-engine-assets`
- **Scope**:
  - Do NOT commit engine binary or NNUE eval file to the repo (license + repo size). Instead: workflow step downloads pinned-version release assets (or `actions/cache` keyed by version) into `engine/` before running the script.
  - Document exact download URLs + checksums in `workers/analysis-runner/README.md`; verify Suisho NNUE license permits the chosen distribution method.
- **Acceptance Criteria**:
  - [ ] Fresh runner obtains working engine+eval in < 2 min; cached runs skip download.
  - [ ] No binary blobs in git history.

### Issue #62: GitHub Actions ワークフロー + Secrets + E2E 検証
- **Labels**: `epic:cloud-analysis`, `infra`, `e2e`
- **Branch**: `feature/issue-62-gh-actions-workflow`
- **Scope**:
  - `.github/workflows/analyze-kifu.yml`: `schedule` cron **high-frequency small-batch** (e.g., `*/20 * * * *` = every 20 min, or `*/30`; tune after measuring runner queue delay) + `workflow_dispatch`; `timeout-minutes: 10`; `concurrency` group to prevent overlapping runs; Node 20 setup; `FIREBASE_SERVICE_ACCOUNT_KEY` from Secrets (dedicated least-privilege SA).
  - Per-run volume cap: process at most 1–2 games per invocation (configurable via env, e.g., `MAX_GAMES_PER_RUN`); each game analyzed with modest `go nodes` so a run finishes in ~2–4 min typical. Frequency × per-run-minutes must stay well under 2,000 min/month (e.g., 20min interval × ~3min/run ≈ 6,500 min/month exceeds limit → prefer ~30–60min interval or reduce per-run time; finalize with measured numbers).
  - E2E: set a `KifuRecord` to `queued` → manual dispatch → verify `completed` + `evaluations` written; verify mobile-imported kifu flows through without PC.
- **Acceptance Criteria**:
  - [ ] Manual dispatch completes successfully and writes evals to Firestore.
  - [ ] Actual minutes consumed per run documented; chosen cron × avg runtime projects under 2,000 min/month.

---

## 🔗 Epic 16: Studio ↔ Tree Integration & Remaining Enhancements

### Issue #63: Studio↔Tree 棋譜相互連携 (spec L1–L3)
- **Labels**: `epic:kifu-record`, `integration`
- **Branch**: `feature/issue-63-studio-tree-link`
- **Scope**:
  - "この局面/棋譜をツリーに送る" from Studio; "ライブラリに登録" from Tree table; unified `analysisStatus`/`evaluations` display.
- **Acceptance Criteria**:
  - [ ] A kifu analyzed in Studio shows the same evals when opened via Tree path.

---

## 📚 Epic 17: Unified Kifu Library (統一棋譜ライブラリ) 【NEW】

*Spec: `docs/spec/kifu_management_enhancement.md` §6/§6.5-6.6. Depends on Epic 10 (#39-#44) and Epic 11 (#45-#50). Full-page `/library` route; old library modals keep running in parallel until cutover.*

### Issue #64: タグIDレジストリ基盤 (`tagRegistryStorage` + `KifuRecord.tagIds`)
- **Labels**: `epic:kifu-library`, `data-model`
- **Branch**: `feature/issue-64-tag-registry`
- **Scope**:
  - `src/types/tagRegistry.ts`: `TagDefinition { id, name, groupId, isBuiltin?, createdAt, updatedAt }`, `TagGroupId` union.
  - `src/utils/tagRegistryStorage.ts`: CRUD (list/get/byName/create/rename/delete), deterministic builtin ids (`builtin:{groupId}:{name}`), seeding from `STRUCTURED_TAG_GROUPS` on first load.
  - `KifuRecord.tagIds?: string[]` 追加。`tags` はレジストリから再生成される派生キャッシュに位置づけ、保存経路で同期。
  - 既存 `tags` 名 → `(groupId,name)` 照合 → `tagIds` 移行（未登録名は `custom` へ自動登録）。codec/ビュー層は名前解決を維持。
- **Acceptance Criteria**:
  - [ ] Renaming a TagDefinition preserves every record's tagIds linkage.
  - [ ] Existing records migrate transparently; `tags` names stay correct for legacy views/Firestore docs.

### Issue #65: `KifuLibraryPage` 骨格 (route `/library`)
- **Labels**: `epic:kifu-library`, `ui`
- **Branch**: `feature/issue-65-library-page-shell`
- **Scope**:
  - New full page `src/pages/KifuLibraryPage.tsx` + route in `App.tsx` (outside AppLayout or with minimal chrome — decide at implementation; must not break Studio deep-links).
  - Lists all `KifuRecord`s via `loadKifuRecords()`: title / date / players / winner / source / tag chips / analysis status / favorite. Sort by updatedAt desc default + column sort.
  - Entry points: Header nav (AppLayout pages), Studio top bar button, HomePage card — opens `/library`.
- **Acceptance Criteria**:
  - [ ] Page renders all sources (studio/tree/import) in one list; opens a record into the appropriate viewer (Studio study or tree context).

### Issue #66: 検索・構造化フィルタ・ソート (spec S1–S6)
- **Labels**: `epic:kifu-library`, `ux`
- **Branch**: `feature/issue-66-library-search-filter`
- **Scope**:
  - S1 text search across title/player names/tournament/notes/tags; S2 filters: date range / winner / opening / tag (by group) / analysisStatus / reviewStatus / favorite / source; S3 sort; S4 display density or card/table toggle if cheap; S5 active-filter chips; S6 row actions (open/rename/delete/favorite/tag edit/tree toggle/export KIF).
  - Performance guard for ~500 records (memoized filter pipeline; pagination or virtualization only if needed).
- **Acceptance Criteria**:
  - [ ] Each spec filter works and combines; 500-record fixture stays interactive.

### Issue #67: レコードへのタグ編集UI
- **Labels**: `epic:kifu-library`, `ui`
- **Branch**: `feature/issue-67-record-tag-editor`
- **Scope**:
  - Per-record tag editor (row action + detail drawer): grouped checkbox list from TagRegistry, instant tagIds update via `updateKifuRecord`, `tags` names regenerated on save.
  - Replaces `CategorizedTagCombobox` usage inside the library context (keep combobox for Studio inline editing).
- **Acceptance Criteria**:
  - [ ] Assign/remove tags per group; renamed tags display new name everywhere immediately.

### Issue #68: 一括操作 (spec M4)
- **Labels**: `epic:kifu-library`, `ux`
- **Branch**: `feature/issue-68-library-bulk-ops`
- **Scope**:
  - Multi-select (checkbox column + shift-range if cheap): bulk tag assign/remove, favorite toggle, `isIncludedInTree` toggle, delete (confirm dialog with count), export selected as KIF/JKF bundle or individual downloads.
  - All bulk writes go through `saveKifuRecords`/`updateKifuRecord` so `tags` regeneration and `updatedAt` stay consistent; cloud sync picks up changes on next sync.
- **Acceptance Criteria**:
  - [ ] Bulk tag ops on 50 records complete without UI freeze; delete requires explicit confirmation.

### Issue #69: タグ辞書管理 + JSON エクスポート/インポート
- **Labels**: `epic:kifu-library`, `data-management`
- **Branch**: `feature/issue-69-tag-dictionary-io`
- **Scope**:
  - Tag dictionary manager UI (in library page settings/popover or dedicated section): list tags by group, rename (id-stable), add, delete (shows referencing-record count; removes tagIds from records after confirm).
  - Export: `{ format: 'joseki-tree-tag-dictionary', version, tags: TagDefinition[] }` JSON download. Import: merge by id (update name/groupId) then by name+groupId (adopt existing id) then create new — per spec §6.5.
  - Include custom tag groups (`joseki_tree_custom_tag_groups`) migration into TagDefinition.groupId='custom' where applicable.
- **Acceptance Criteria**:
  - [ ] Export→import round-trip on clean profile restores identical tag dictionary; renaming `#新人王`→`#新人王戦` keeps record links.

### Issue #70: 旧ライブラリUIの導線整理（並行運用のまま新ページ優先）
- **Labels**: `epic:kifu-library`, `ux`
- **Branch**: `feature/issue-70-library-cutover-links`
- **Scope**:
  - Point primary entry points (Studio "棋譜管理" button, Tree kifu list, HomePage library card) at `/library`; keep old modals reachable via secondary links for one release.
  - Add deprecation note in old modal headers linking to the new page. No removal yet — full retirement is a later decision after user validation.
- **Acceptance Criteria**:
  - [ ] All main flows land on `/library`; old modals still functional for edge cases (import w/ analysis options etc.).

### Issue #71: `gameKind` 対局種別基盤 (`pro`/`self`/`other`)
- **Labels**: `epic:kifu-library`, `data-model`
- **Branch**: `feature/issue-71-gamekind`
- **Scope**:
  - `KifuRecord.gameKind?: 'pro' | 'self' | 'other'` 追加。`ShogiPlayerProfile.isOwner?: boolean` 追加（本人プロフィール識別）。
  - 自動提案: owner絡み→`self`、pro category/棋戦名一致→`pro`、他→`other`。取込・保存・移行の各経路で初期値を設定。手動上書きは `updateKifuRecord` で可能。
  - codec/ビュー層・Firestore doc への伝播（`recordSchema` 内のフィールド追加のみ、旧docは `other` 扱い）。
- **Acceptance Criteria**:
  - [ ] Importing a pro kifu with registered pro players auto-sets `pro`; sparring/owner games set `self`; unknown stays `other`.
  - [ ] Manual override persists and syncs to Firestore.

### Issue #72: ライブラリの種別セクション/タブ + フィルタ連動
- **Labels**: `epic:kifu-library`, `ux`
- **Branch**: `feature/issue-72-library-gamekind-views`
- **Scope**:
  - `KifuLibraryPage` にトップレベルの種別ビュー: 「プロ棋譜」「自分の対局」「その他」「すべて」（デフォルトは「すべて」or 前回選択を記憶）。単なるフィルターチップではなくセクション分け/タブとして実装。
  - #66 の構造化フィルタに `gameKind` を追加。プロ棋士未登録の `other` 棋譜には棋士図鑑登録導線を表示。
- **Acceptance Criteria**:
  - [ ] 自分の対局がプロ棋譜一覧に混ざらないデフォルト表示になる。切替は1クリック。

### Issue #73: ツリービジュアライザーの gameKind スコープ + 重ね合わせ色分け
- **Labels**: `epic:kifu-library`, `ux`, `tree`
- **Branch**: `feature/issue-73-tree-gamekind-scope`
- **Scope**:
  - `JosekiTreeVisualizer` / tree merge 呼出に gameKind スコープ: `プロのみ` / `自分のみ` / `すべて`（デフォルトは要UX判断、恐らく「プロのみ」）。
  - 「すべて」モードでは枝・ノードを gameKind で色分けし、プロ定跡と自分の棋譜の一致区間・分岐点が視覚的に判別できること。
  - `isIncludedInTree` とは独立した表示フィルタ（データ削除なし）。
- **Acceptance Criteria**:
  - [ ] プロのみ表示で自分の棋譜がツリーに現れない。重ね合わせで分岐箇所が色で区別できる。

---

## 🌐 Epic 18: General Distribution & Pluggable USI Engine Architecture (一般配布・公開対応 & 動的USIエンジン基盤)

### Issue #120: ストレージ抽象化 & 自前Firebase動的接続 (BYOF) [Completed]
- **Labels**: `epic:distribution`, `storage`, `firebase`
- **Branch**: `feature/issue-120-dynamic-firebase-storage-adapter`
- **Scope**:
  - Decouple hardcoded Firebase project credentials from source code so public builds run cleanly offline in local IndexedDB/LocalStorage without developer infrastructure dependencies.
  - Allow users to paste and dynamically activate their own `firebaseConfig` (BYOF: Bring Your Own Firebase) via `SettingsModal`.
- **Acceptance Criteria**:
  - [x] Zero hardcoded project credentials remain in source control.
  - [x] Users can switch between local-only mode and personal Firestore sync cleanly.

### Issue #122 / #124: 定跡・手筋ノートの外出し & エディタ・共有機能化 [Completed]
- **Labels**: `epic:distribution`, `tactics`, `ux`
- **Scope**:
  - Replace hardcoded static opening/tactics help with externalized starter templates (`src/data/defaultTactics.ts`) editable by users via `/tactics` and Studio handoff.
  - Support `.json` import/export sharing for community study notebooks and Firestore cloud sync across devices.
- **Acceptance Criteria**:
  - [x] Users can freely create, edit, sync, export, and import tactical study notes.

### Issue #126: 商標・固有名詞クリーンアップ & カスタム言語辞書オーバーライド [Completed]
- **Labels**: `epic:distribution`, `i18n`, `legal`
- **Scope**:
  - Neutralize proprietary service/broadcast names across UI and sample assets; centralize all UI text into i18n JSON files.
  - Support user-importable custom dictionary override JSON (`customLocalesStorage.ts`) so individuals can customize terminology locally without altering public defaults.
- **Acceptance Criteria**:
  - [x] Public defaults use neutral terminology while users can override any UI text cleanly.

### Issue #141: 思考エンジン評価関数の同梱解除 & 動的USIエンジンレジストリ・IndexedDBモデル読込 (Phase 4a)
- **Labels**: `epic:distribution`, `engine`, `legal`
- **Branch**: `feature/issue-141-142-dynamic-usi-engine-registry`
- **Scope**:
  - Remove bundled `public/models/tuyouraou11mini/` and `public/models/tuyouraou11micro/` evaluation binaries so only the license-clean `Fairy-Stockfish 14 Wasm` is bundled by default.
  - Introduce dynamic engine registry (`src/engine/engineConfig.ts`, `src/engine/customEngineModelStore.ts`) persisted in LocalStorage/IndexedDB so any registered engine dynamically updates all engine selectors, default engine settings, analysis badges, and Settings > About credits.
  - Support importing user-supplied `.bin` / `.nnue` (+ optional `progress.bin`, `tag.json`) files directly into IndexedDB via `SettingsModal`.
- **Acceptance Criteria**:
  - [x] Default app bundles zero third-party TuyouraOu NNUE binaries.
  - [x] Engine selectors, defaults, and credits update dynamically for added/deleted engines.

### Issue #142: 外部USIエンジン WebSocket ブリッジ接続対応 (BYOE) (Phase 4b)
- **Labels**: `epic:distribution`, `engine`, `usi`
- **Branch**: `feature/issue-141-142-dynamic-usi-engine-registry`
- **Scope**:
  - Extend `ShogiEngineBridge` to support connecting to arbitrary USI-compliant engines over WebSocket (`ws://...`) alongside built-in Wasm.
  - Add WebSocket USI probing (`probeWebSocketUsiEngine`) in Settings to auto-populate `id name` and `id author` from live engines.
  - Bundle a zero-dependency Node.js companion script (`tools/usi-bridge/usi-websocket-bridge.mjs`) exposing any local USI executable.
- **Acceptance Criteria**:
  - [x] Any USI-compliant engine bridged via WebSocket can be probed, registered, set as default, and used across Studio, Sparring, Batch Analysis, and Quiz verification.

### Issue #143: デスクトップアプリ化 (Tauri) & ローカルUSI `.exe` 直接起動 (Phase 5a)
- **Labels**: `epic:distribution`, `desktop`, `tauri`
- **Branch**: `feature/issue-143-tauri-desktop-usi`
- **Scope**:
  - Package the application with Tauri for Windows (`.msi` / `.exe`) and macOS (`.dmg`).
  - Add a native USI stdio child-process adapter allowing desktop users to select local USI `.exe` binaries via native file dialog with no WebSocket bridge required.
- **Acceptance Criteria**:
  - [x] Desktop installers build cleanly and communicate directly with user-selected USI binaries.

### Issue #144: 2画面スプリット研究ワークスペース（外部定跡参照＋ノート同時入力） (Phase 5b)
- **Labels**: `epic:distribution`, `ux`, `study`
- **Branch**: `feature/issue-144-split-study-workspace`
- **Scope**:
  - Implement a toggleable split-screen workspace pairing an embedded external reference pane with the board, tree, and tactical note editor.
- **Acceptance Criteria**:
  - [x] Users can view external study guides side-by-side while editing trees/notes with responsive mobile fallback.
