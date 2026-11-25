# 棋樹 (joseki-tree) - Feature Specifications (詳細機能仕様書)

This document outlines the detailed functional requirements and behavior for all 棋樹 (joseki-tree) features.

---

## 1. Kifu Ingestion & Management (棋譜投入・管理機能)

### 1.1 Paste & Ingestion
- **Input Methods**:
  - Multiline text area on the main dashboard for pasting raw KIF text (`Ctrl+Enter` shortcut).
  - File Upload / Drag & Drop support for `.kif` files.
- **Encoding Auto-Detection**:
  - Automatically identifies and handles both **UTF-8** (web paste standard) and **CP932 / Shift-JIS** (traditional Shogi software standard) using browser `TextDecoder('shift-jis')`.
- **Syntax Tolerance & Preprocessing**:
  - **Comment & Header Lines**: Safely ignores leading `#` lines (e.g. `#KIF version=2.0`, `# ---- ぴよ将棋 ----`).
  - **Variation Marker (`+`)**: Safely strips the trailing `+` marker on move lines (e.g. `   6 ３二銀(31)   ( 0:00/00:00:00)+`) to parse clean destination coordinates while registering that variations branch from this ply.
  - **Existing Analysis Comment Extraction**: Automatically extracts evaluation scores and PV lines from ShogiGUI/将棋所 style analysis comments:
    `**解析 0 [○] 候補1 時間 ... 評価値 [±score] 読み筋 [moves...]`
    This preserves external engine evaluations without requiring re-computation.
  - **Termination Handling**: Gracefully handles files that end with a standard resignation (`投了`) as well as files ending abruptly after the final move.
- **Header Parsing**:
  - Automatically extracts: Date (`対局日`), Black player (`先手`), White player (`後手`), Tournament (`棋戦`), Result (`勝敗`), and Ply count (`手数`).
  - Generates a human-readable title: e.g., `2023-10-15_藤井聡太_伊藤匠_竜王戦`.
- **Deduplication**:
  - Computes a content-based SHA-256 hash or move-sequence hash to prevent accidental duplicate entries.
- **Category Assignment**:
  - Auto-detects opening classification from early moves (e.g., Bishop Exchange / 角換わり, Double Wing Attack / 相掛かり, Yagura / 矢倉, R振り飛車, etc.), especially when the `戦型：` header is blank.
  - Fallbacks to the currently selected active category if auto-detection is undetermined.

### 1.2 Library Table & Curation
- **List View**: Displays all stored games within the active opening category.
- **Columns**:
  - `[Include Checkbox]`: Toggle whether this game is included in the merged tree.
  - `[Opening Category]`: Dropdown to reassign the game to a different opening.
  - `[Game Metadata]`: Date, Players, Tournament, Ply count, Winner.
  - `[Analysis Status]`: Badge indicating `Unanalyzed` or `Analyzed`.
  - `[Actions]`: `[Review/Play]`, `[Analyze]`, `[View Board]`, `[Delete]`.

### 1.3 Multi-Branch Merging (マージロジック)
- **Mainline Determination (最多採用手優先)**:
  - At each branching junction, the move chosen by the highest number of included games automatically becomes the **mainline (本譜)**. Less frequent moves branch off as **variations (変化)**.
- **Move Metadata & Comments**:
  - Merged nodes retain statistical comments: e.g., `* [Adopted in 3 games: 2 Wins / 1 Loss]`.
  - Junction nodes document the specific games playing each variation:
    ```text
    * Adopted games:
    * - 2023-10-15 Ryuo: Sota Fujii vs Takumi Ito (Black win)
    * - 2022-11-20 Osho: Yoshiharu Habu vs Akira Watanabe (White win)
    ```
- **Export Capabilities**:
  - **Download KIF**: Downloads a UTF-8 encoded `.kif` file compatible with standard Shogi tools (ShogiGUI, KifuMaster, etc.).
  - **Copy to Clipboard**: Copies the merged KIF text directly for instant pasting into external web tools.
  - **Max Ply Option**: Allows capping the merge depth (e.g., 60 moves) to keep the tree focused on the opening phase.

---

## 2. Interactive Board Viewer & Evaluation Graph (盤面ビューアー・評価値グラフ)

### 2.1 Shogi Board UI
- **Responsive 9x9 Grid**: Clean SVG/CSS rendered board, optimized for both touchscreens (smartphones) and mouse inputs (desktop).
- **High-Fidelity Wood Assets (本格木目盤・駒スプライト)**: Detailed in `docs/spec/board_piece_assets.md`. Uses authentic Kaya wood grain (`board.svg`) and Tsuge boxwood vector pieces with traditional Japanese calligraphy & red promoted marks (`piece_wood.svg`).
- **Komadai (Piece Stands)**: Displays captured pieces for both Black (Sente) and White (Gote) with piece counts.
- **Navigation Controls**:
  - Buttons: `[|<]` First, `[<]` Step Back, `[>]` Step Forward, `[>|]` Last.
  - Keyboard shortcuts: `Left Arrow` (Back), `Right Arrow` (Forward).
  - Move Highlight: Highlights source and destination squares of the previous move.
- **Board Flip (`⟲`)**: Flips the board orientation between Black-perspective and White-perspective.

### 2.2 Branch Navigation
- When a junction has multiple branches, a **Variation Selector** appears below the board.
- Clicking a branch seamlessly switches the board to that alternative timeline.

### 2.3 Evaluation Graph (Chart.js)
- **Plot**: Line chart with Move Ply on the X-axis and Centipawn Score (`score cp`) on the Y-axis (-2000 to +2000 capped).
- **Interactive Sync**:
  - Clicking any data point on the graph immediately jumps the board to that move ply.
  - A vertical line cursor reflects the current board position in real time.

---

## 3. WebAssembly AI Engine & Analysis (AI解析エンジン)

### 3.1 Architecture
- Runs **Fairy-Stockfish (Wasm/NNUE)** inside a dedicated **Web Worker**.
- Zero backend server cost; executes directly on the client's local CPU.
- Communicates via standard **USI protocol** strings (`position`, `go depth / byoyomi`, `info score cp pv`).

### 3.2 Individual Game Analysis
- Can be triggered per single game from the library table.
- Traverses every move with a user-configured search time (e.g., 0.3s - 0.5s per position).
- Appends evaluation comments:
  ```text
  * 【AI Evaluation】+180 (Sente slightly better) / Best: 2g2f
  * 【PV】▲2六歩 △8四歩 ▲2五歩
  ```

### 3.3 Merging Analysis Data
- **Preserve during Merge**: If included games already possess AI evaluation comments, they are preserved in the merged tree without re-calculating.
- **Full Tree Re-analysis**:
  - A dedicated `[Re-analyze Entire Merged Tree]` button clears legacy comments and systematically re-analyzes every unique position in the multi-branch tree with uniform engine settings.
  - Displays a real-time progress bar: `Analyzing: 42 / 98 positions...`.

---

## 4. Active Recall SRS Memorization Mode (暗記モード)

### 4.1 Practice Flow
1. **Setup**: Choose side (Play as Black or White), select scope (entire tree, specific single game, or **resume from current position**).
2. **Opponent Response**:
   - The computer automatically plays the opponent's moves according to the multi-branch tree.
   - At branches, moves are chosen randomly, weighted by historical adoption frequency.
3. **User's Turn**:
   - User interacts with the board to move pieces.
   - **Correct Move**: Matches an authorized variation in the tree. Plays a confirmation sound/visual, and the opponent responds.
   - **Incorrect Move**: Plays an error cue; piece returns to the source square.

### 4.2 Selective 5-Type Hints (自由選択式ヒント)
Instead of forced progressive tiers, users open only the clues they need:
- `[ Rank Position / 上下位置 ]`: Reveals whether destination is in Sente territory (ranks 6-9) or Gote territory (ranks 1-5).
- `[ File Position / 左右位置 ]`: Reveals whether destination is Right (files 1-3), Center (files 4-6), or Left (files 7-9).
- `[ Piece Type / 使う駒 ]`: Reveals the piece involved (e.g., `Silver / 銀`, `Pawn / 歩`).
- `[ Board vs Hand / 盤面・持ち駒 ]`: Reveals whether it is a board piece move (`盤面の駒`) or a drop from the hand (`持ち駒`).
- `[ Show Answer / 答え表示 ]`: Last resort; highlights the target move on the board (e.g., `▲７六歩`).

### 4.3 Spaced Repetition System (SRS Forgetting Curve)
- Implements the **SM-2 algorithm**:
  - Clean recall on 1st attempt: Review interval increases (1d → 3d → 7d → 16d → 35d).
  - Hints used: Review interval remains short or steady (1d - 3d).
  - Failed attempt (mistake): Review interval resets to 1 day (queued for immediate review).
- **Daily Review Dashboard**:
  - Home screen highlights: `Due Today: 15 positions in Kakugawari`.
  - One-click launch into today's targeted drill session.

---

## 5. Sparring Match Mode (対局モード)

### 5.1 Hybrid Match Flow
1. **Opening Phase**: Plays out according to the opening tree (just like Memorization Mode).
2. **Novelty / Out-of-Book Transition**:
   - When the user plays a move not present in the tree (or the recorded moves end), a banner announces: *"Entering uncharted territory. AI engine activated."*
   - From this point forward, Fairy-Stockfish takes over in real-time, calculating responses on the fly.
3. **Configurable Engine Strength**:
   - Depth or thinking time can be adjusted (e.g., 0.5s for fast sparring, 2.0s for high-dan level resistance).

### 5.2 Feedback Loop (Repertoire Integration)
- Upon game conclusion (resignation, checkmate, impasse):
  - Prompts: `[Add this game's novelty line to the merged tree as a new variation?]`.
  - If approved, the user's sparring move sequence is automatically merged into the active opening tree with the tag: `* 【Sparring】YYYY-MM-DD vs Fairy-Stockfish (Result: Win/Loss)`.
- **Match History Log**:
  - Saves full PGN/KIF, date, opponent strength, result, and ply count in Firestore for post-game review.

### 5.3 Mid-Game Start (途中局面からの開始)
- From the Board Viewer or Evaluation Graph, clicking `[Start Sparring from this Position]` launches match mode directly from any middle/endgame board state.
