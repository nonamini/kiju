# 棋樹 (joseki-tree) - Data Models & Type Definitions (データモデル・型定義仕様)

To eliminate undefined property errors and runtime hallucinations during AI-assisted development, all foundational interfaces and data schemas are strictly specified here.

---

## 1. Core Domain Types (Shogi & Tree)

```typescript
export type Color = 'b' | 'w'; // 'b': Black (Sente / 先手), 'w': White (Gote / 後手)

export type PieceType = 
  | 'FU' // Pawn (歩)
  | 'KY' // Lance (香)
  | 'KE' // Knight (桂)
  | 'GI' // Silver (銀)
  | 'KI' // Gold (金)
  | 'KA' // Bishop (角)
  | 'HI' // Rook (飛)
  | 'OU' // King (王/玉)
  | 'TO' // Promoted Pawn (と)
  | 'NY' // Promoted Lance (成香)
  | 'NK' // Promoted Knight (成桂)
  | 'NG' // Promoted Silver (成銀)
  | 'UM' // Promoted Bishop (馬)
  | 'RY';// Promoted Rook (竜)

export interface Square {
  file: number; // 1 to 9 (筋)
  rank: number; // 1 to 9 (段: 1=一, 9=九)
}

export interface ShogiMove {
  ply: number;            // 1-based move index
  color: Color;          // Sente or Gote
  from?: Square;         // Source square (undefined if piece drop)
  to: Square;            // Destination square
  piece: PieceType;      // Piece being moved or dropped
  promote?: boolean;     // Whether promotion occurred
  isDrop: boolean;       // True if dropped from hand
  kifString: string;     // e.g. "７六歩(77)" or "５二銀打"
  sfenMove: string;      // USI coordinate e.g. "7g7f" or "S*5b"
}

export interface MoveEvaluation {
  scoreCp: number;       // Centipawns (+ for Sente, - for Gote)
  isMate?: boolean;      // True if mate score
  matePly?: number;      // Plies to mate
  depth: number;         // Search depth reached
  bestMove?: string;     // USI bestmove string (e.g. "2g2f")
  bestMoveKif?: string;  // KIF bestmove string (e.g. "２六歩")
  pv?: string[];         // Principal variation moves (USI format)
  evaluatedAt: string;   // ISO 8601 timestamp
}

export interface KifuTreeNode {
  id: string;            // Unique node hash (e.g., SFEN + move)
  sfen: string;          // Board position after this move
  move: ShogiMove;       // The move that led to this position
  comment: string;       // Formatted comment lines
  evaluation?: MoveEvaluation; // Attached engine analysis
  gameCount: number;     // Number of ingested games adopting this move
  wins: {
    sente: number;
    gote: number;
    draw: number;
  };
  gameRefs: Array<{
    gameId: string;
    title: string;
    date: string;
    winner: Color | 'draw';
  }>;
  children: KifuTreeNode[]; // Branches / subsequent variations
  isMainline: boolean;   // True if chosen as the primary branch
}

export interface MergedKifuTree {
  openingId: string;     // e.g., 'kakugawari'
  openingName: string;   // e.g., '角換わり'
  rootSfen: string;      // Typically平手初期局面 "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
  rootNodes: KifuTreeNode[]; // Moves from move 1 (e.g., ▲7六歩, ▲2六歩)
  totalGames: number;
  updatedAt: string;     // ISO 8601
}
```

---

## 2. Ingested Game Model

```typescript
export interface IngestedGame {
  id: string;            // UUID or content SHA-256
  userId: string;        // Firebase Auth UID
  openingId: string;     // Category identifier
  title: string;         // e.g., "2023-10-15_藤井聡太_伊藤匠_竜王戦"
  date?: string;         // YYYY-MM-DD
  senteName: string;     // Player name (Black)
  goteName: string;      // Player name (White)
  tournament?: string;   // Tournament / Event name
  winner?: Color | 'draw' | 'unknown';
  plyCount: number;
  rawKif: string;        // Original KIF string
  isIncluded: boolean;   // Whether to include in merged tree
  isAnalyzed: boolean;   // Whether engine analysis has been run
  createdAt: string;
  updatedAt: string;
}
```

---

## 3. SRS (Active Recall / Memorization) Model

```typescript
export interface SRSReviewCard {
  id: string;            // Unique card ID (e.g., openingId + sfen)
  userId: string;
  openingId: string;
  sfen: string;          // Current position to test
  correctMove: ShogiMove; // Target correct move
  alternativeMoves?: ShogiMove[]; // Allowed alternative variations

  // SM-2 Spaced Repetition Parameters
  intervalDays: number;  // Current repetition interval in days
  repetitionCount: number; // Consecutive successful reviews
  easeFactor: number;    // Multiplier (defaults to 2.5)
  dueDate: string;       // Next scheduled review (YYYY-MM-DD)
  
  // Historical Performance
  totalAttempts: number;
  mistakes: number;
  hintsUsedCount: number;
  lastReviewedAt?: string;
}

export type HintType = 
  | 'rank'        // 上下位置 (1-5 vs 6-9)
  | 'file'        // 左右位置 (1-3, 4-6, 7-9)
  | 'piece'       // 使う駒種 (FU, GI, etc.)
  | 'boardOrHand' // 盤面 vs 持ち駒
  | 'answer';     // 答え表示
```

---

## 4. Sparring Match Record Model

```typescript
export interface MatchRecord {
  id: string;
  userId: string;
  openingId: string;
  startedAt: string;
  endedAt: string;
  userColor: Color;
  startPly: number;      // 0 for initial position, >0 for mid-game start
  startSfen: string;
  moves: ShogiMove[];
  outOfBookPly?: number; // Ply at which play diverged from opening tree
  result: 'win' | 'loss' | 'draw' | 'aborted';
  reason?: 'checkmate' | 'resignation' | 'timeout' | 'impasse';
  aiEngine: string;      // e.g., "Fairy-Stockfish 14 Wasm"
  aiDepth: number;
  isMergedIntoTree: boolean; // True if this game was added to the repertoire
  hintsViewedCount?: number; // Number of times best move hint was revealed
}
```

---

## 5. Cloud Firestore Schema Structure

```
/users/{uid}
  ├── profile (Document)
  │
  ├── openings/{openingId} (Documents: metadata of categories)
  │
  ├── games/{gameId} (Documents: IngestedGame)
  │
  ├── merged_trees/{openingId} (Documents: MergedKifuTree)
  │
  ├── srs_cards/{cardId} (Documents: SRSReviewCard)
  │
  └── match_records/{recordId} (Documents: MatchRecord)
```

---

## 6. TacticalQuizCard (次の一手クイズカード)

Defined in `src/types/quiz.ts`:

```typescript
export type TacticalQuizType = 'attack' | 'defense' | 'race' | 'mate';

export type TurningPointType =
  | 'equal_to_lead'    // Equal position (-150..+150) suddenly tilted decisively
  | 'reversal'         // Advantage/disadvantage flipped with large swing
  | 'only_move'        // Only one continuation preserves evaluation; other moves blunder
  | 'tactical_shift';  // General sharp turning point

export interface QuizChoice {
  usi: string;
  isCorrect: boolean;
  scoreCp?: number;    // Score from solver POV after this move
  scoreDelta?: number; // Difference relative to best move (0 for best, e.g. -250 for blunder)
  label?: string;
}

export interface TacticalQuizCard {
  id: string;               // `${sourceGameId}:${ply}`
  sourceGameId: string;
  openingId: string;
  type: TacticalQuizType;
  turningPointType?: TurningPointType;
  evalSwing?: number;       // Magnitude of score swing that triggered extraction
  ply: number;              // position is AFTER this many plies (>= 2)
  startSfen: string;
  usiMovesToPosition: string[]; // USI moves from startSfen to the quiz position
  sideToMove: Color;        // the quiz solver
  bestMove: string;         // USI, equals pv[0]
  pv: string[];             // USI, odd length 1..5 (solver, reply, solver, ...)
  scoreCpBefore: number;    // E[ply] from solver's point of view
  actualMove?: string;      // USI of the move played in the game at ply+1 (if known)
  opponentLastMove?: ShogiMove; // Opponent move that directly resulted in this quiz position
  choices?: QuizChoice[];   // Deterministic 3-choice options (best move + plausible blunders)
  isEnabled: boolean;       // default true
  createdAt: string;        // ISO 8601
}

export interface QuizSourceGame {
  gameId: string;
  openingId: string;
  startSfen: string;
  moves: ShogiMove[];
}

export interface QuizExtractionConfig {
  maxQuizzesPerGame: number;   // default 5 (caps to 3-5 high-impact questions per game)
  minPlyDistance: number;      // default 4 (minimum distance between extracted positions)
  minSwingCp: number;          // default 250 (swing for equal_to_lead or reversal)
  reversalThresholdCp: number; // default 200
  attackGainCp: number;        // default 200
  defenseThreatCp: number;     // default 200
  defenseMinScoreCp: number;   // default -500 (below this the position is hopeless)
  defenseLossCp: number;       // default 300
  mateScoreCp: number;         // default 2000
  raceMinPly: number;          // default 80
  raceMinScoreCp: number;      // default -300
  raceMaxScoreCp: number;      // default 600
  raceLossCp: number;          // default 200
  maxPvLength: number;         // default 5
}
```


---

## 7. KifuRecord & AppSettings (棋譜統合モデル・アプリ設定)

Unified kifu entity replacing the legacy `SavedStudioGame` / `IngestedGame` split.
Spec: `docs/spec/kifu_management_enhancement.md`. Settings spec: `docs/spec/settings_screen.md`.

```typescript
import { MoveEvaluation } from './shogi';
import { ForkPointer } from 'json-kifu-format';

export type KifuRecordSource = 'studio' | 'tree' | 'import';
export type KifuWinner = 'sente' | 'gote' | 'draw' | 'unknown';
export type KifuReviewStatus = 'unread' | 'read' | 'needs_review';

/** Cloud analysis job lifecycle (extends legacy analysisStatus). */
export type KifuAnalysisStatus =
  | 'unanalyzed'
  | 'queued'        // waiting for cloud/local worker pickup
  | 'processing'    // claimed by a worker (analysisClaimedAt set)
  | 'completed'
  | 'failed'
  | 'analyzing';    // legacy local Wasm analysis in progress

export interface KifuRecord {
  // === Identity & basics ===
  id: string;                       // UUID
  title: string;
  contentHash: string;              // normalized kifu SHA-256 (dedup key)
  source: KifuRecordSource;

  // === Game metadata ===
  senteName: string;
  goteName: string;
  sentePlayerId?: string;           // ShogiPlayerProfile.id
  gotePlayerId?: string;
  matchDate?: string;               // ISO 8601 (YYYY-MM-DD)
  tournament?: string;
  openingId: string;                // OPENING_CATEGORIES.id
  openingName: string;
  winner?: KifuWinner;
  totalPlies: number;

  // === Kifu payload ===
  jkfJson: string;                  // JSONKifuFormat
  rawKif?: string;

  // === Classification & meta ===
  tags: string[];
  notes?: string;
  favorite?: boolean;
  reviewStatus?: KifuReviewStatus;

  // === Analysis ===
  evaluations?: Record<number, MoveEvaluation>;
  analysisEngineId?: string;
  analysisDepth?: number;
  analysisStatus?: KifuAnalysisStatus;
  analyzedPliesCount?: number;
  analysisJobId?: string;           // worker claim token
  analysisClaimedAt?: string;       // ISO 8601
  analysisError?: string;

  // === Tree integration ===
  isIncludedInTree: boolean;
  activeForkPointers?: ForkPointer[];

  // === Audit / migration ===
  createdAt: string;                // ISO 8601
  updatedAt: string;                // ISO 8601
  originStudioGameId?: string;      // migration source id
  originIngestedGameId?: string;    // migration source id
}

export type EngineId = 'fairy-stockfish' | 'tuyouraou11-mini' | 'tuyouraou11-micro';

export interface AppSettings {
  language: 'ja' | 'en';
  defaultEngineId: EngineId;
  defaultAnalysisDepth: number;
  lastActiveMode?: string;
  updatedAt: string;                // ISO 8601
}

export const KIFU_RECORDS_STORAGE_KEY = 'joseki_tree_kifu_records';
export const APP_SETTINGS_STORAGE_KEY = 'joseki_tree_app_settings';
```

### Migration notes
- Legacy keys `joseki_tree_studio_saved_games`, `joseki_tree_studio_games`, `joseki_tree_ingested_games` are converted once into `KifuRecord[]`; `originXxxId` preserves traceability and makes re-runs idempotent.
- `IngestedGame.isIncluded` maps to `KifuRecord.isIncludedInTree`.
- Firestore `users/{uid}/games/{id}` documents are bulk-migrated to this schema (no legacy read path).

---

## 8. FreeBoardDiagram, TacticsNoteBlock & Tsumego Import Extensions (部分盤面図・研究ノートブロック・詰将棋取込)

Added in Issue #162 / #170 / #176. Canonical definitions live in `src/types/freeBoardDiagram.ts`, `src/types/tacticsNote.ts`, and `src/types/tsumego.ts`.

```typescript
export type DiagramHighlightColor = 'amber' | 'emerald' | 'rose' | 'sky';
export type DiagramMarkerSymbol = '○' | '×' | '△' | '★' | '◎';
export type DiagramPieceKind =
  | 'K' | 'R' | 'B' | 'G' | 'S' | 'N' | 'L' | 'P'
  | '+R' | '+B' | '+S' | '+N' | '+L' | '+P';

export interface DiagramPiece {
  col: number;              // 0-based column index (0..cols-1)
  row: number;              // 0-based row index (0..rows-1)
  owner: 'b' | 'w';         // 'b' = Sente, 'w' = Gote
  kind: DiagramPieceKind;
}

export interface DiagramHighlight {
  col: number;
  row: number;
  color: DiagramHighlightColor;
}

export interface DiagramMarker {
  col: number;
  row: number;
  symbol: DiagramMarkerSymbol;
  color?: DiagramHighlightColor;
}

export interface DiagramArrow {
  fromCol: number;
  fromRow: number;
  toCol: number;
  toRow: number;
  color: DiagramHighlightColor;
}

export interface FreeBoardDiagram {
  id: string;
  title: string;
  description?: string;
  cols: number;             // 1..9
  rows: number;             // 1..9
  showCoords?: boolean;
  startFile?: number;       // Leftmost file number (e.g. 5..1 or 9..1)
  startRank?: number;       // Topmost rank (1..9, 1 = 一)
  pieces: DiagramPiece[];
  highlights: DiagramHighlight[];
  markers: DiagramMarker[];
  arrows: DiagramArrow[];
  tags: string[];
  createdAt: string;        // ISO 8601
  updatedAt: string;        // ISO 8601
}

export interface TacticsNoteTextBlock {
  id: string;
  type: 'text';
  title?: string;
  content: string;
}

export interface TacticsNoteKifuBlock {
  id: string;
  type: 'kifu';
  kifuId: string;
  caption?: string;
  displayMode?: 'player' | 'link';
}

export interface TacticsNoteDiagramBlock {
  id: string;
  type: 'diagram';
  diagramId: string;
  caption?: string;
}

export interface TacticsNoteLegacyBoardBlock {
  id: string;
  type: 'legacy_tactic';
  caption?: string;
}

export interface TacticsNoteProsConsBlock {
  id: string;
  type: 'pros_cons';
  title?: string;
  pros?: string;
  cons?: string;
}

export type TacticsNoteBlock =
  | TacticsNoteTextBlock
  | TacticsNoteKifuBlock
  | TacticsNoteDiagramBlock
  | TacticsNoteLegacyBoardBlock
  | TacticsNoteProsConsBlock;

// Extension on TacticsNoteItem:
//   freeBlocks?: TacticsNoteBlock[];
// Extension on TsumegoProblem:
//   importSourceName?: string; // normalized filename stem when imported from SFEN/KIF

export const FREE_BOARD_DIAGRAMS_KEY = 'joseki_tree_free_board_diagrams_v1';
export const TSUMEGO_IMPORTED_HASHES_KEY = 'joseki_tree_tsumego_imported_hashes_v1';
```
