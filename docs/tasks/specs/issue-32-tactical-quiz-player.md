# Issue #32 Implementation Spec: Tactical quiz player (Multi-ply, 3-Choice with Score Loss, Opponent Last Move & Punish Countermoves)

Branch: `feature/issue-32-tactical-quiz-player`
Depends on: #30 (types/extractor), #31 (`useQuizPool`, `QuizPoolManager`, `'quiz'` tab).
All code/comments in English (Rule 1). UI strings via `t()` (ja + en). No `any`.

## Core Features & Pedagogical Design

### 1. Opponent's Last Move & Arrow Rendering
- **Banner Information**: Displays opponent's last move in Japanese standard shogi notation along with ply count:
  - e.g. `直前の相手の手: ▲４五角打 (9手目まで)`.
- **Board Highlight & Directional Arrow**:
  - `ShogiBoardView` supports `showLastMoveArrow` (strictly defaulted to `false` so arrows NEVER leak into Sparring Arena or Study Tree).
  - When `showLastMoveArrow={true}` in `QuizPlayerPanel`, renders a high-visibility cyan directional SVG arrow (`#0284c7`, marker `lastMoveArrowMarker`) for board moves, and a pulsing ring marker for drop moves.

### 2. Current Position Evaluation Badge
- Displays the current evaluation situation at the top of the quiz player:
  - e.g. `⚖️ 形勢: 互角 (+120)` or `🔥 攻めの好機 (+650)`.
  - Contextualizes whether the position is even, advantageous, or defensive.

### 3. Deterministic 3-Choice Options with Score Deltas
- The 3 choices are generated from legal moves:
  - **Best move**: 0 cp difference (`最善 0`).
  - **Plausible / Blunder moves**: Shows score loss relative to best move (e.g. `-380 悪手`).
- When the user selects or inputs a move, the exact evaluation swing and blunder severity are shown immediately.

### 4. Engine Punish Move (咎め手) on Blunders & Retry Flow
- When the user plays a wrong or suboptimal move:
  1. The Wasm AI engine searches the resulting position and plays the opponent's best punishing countermove (`punishMove`).
  2. The board animates the opponent's punishment on the board.
  3. A feedback card details why the move failed and displays the evaluation crash:
     - e.g. `相手の最善の咎め手: ☖５五角 (評価値急落: +350 → -420)`.
  4. Provides a "出題局面に戻してもう一度解く (Reset to Starting Position)" button allowing the user to reset the board back to the initial puzzle state and retry.

## Component Specifications: `src/components/quiz/QuizPlayerPanel.tsx`
Props:
```ts
export interface QuizPlayerPanelProps {
  card: TacticalQuizCard;
  board: ShogiBoard;
  isFlipped: boolean;
  step: number;                         // solver step index (0-based)
  totalSteps: number;                   // total solver steps in quiz
  lastMove?: ShogiMove | null;
  status: 'awaiting_move' | 'ai_replying' | 'judging' | 'wrong_retry' | 'finished';
  verdict: 'best' | 'acceptable' | 'wrong' | null;
  evalLossCp?: number | null;           // score lost compared to best move
  punishInfo?: {
    punishMoveUsi: string;
    punishMoveKif: string;
    scoreBefore: number;
    scoreAfterUser: number;
    explanationKey?: string;
  } | null;
  hintLevel: 0 | 1;                     // 1 = three-choice options shown
  hintChoices: Array<string | QuizChoice>;
  selectedSquare: Square | null;
  targetSquares: Square[];
  onSquareClick: (s: Square) => void;
  onRequestHint: () => void;
  onPickChoice: (usi: string) => void;
  onRevealAnswer: () => void;
  onResetCurrentStep?: () => void;
  onNext: () => void;
  result: { quality: number; explanationKey: string } | null;
  replayBoard: ShogiBoard | null;
  replayIndex: number;
  className?: string;
}
```

## Hook Specification: `src/hooks/useQuizSession.ts`
- Manages multi-ply quiz progression:
  - Solver plays step 0.
  - If correct, opponent replies with pre-computed PV move or actual game move.
  - Solver plays subsequent steps until quiz completion.
  - If solver blunders, queries `engine.searchPosition` to compute the opponent's best response, animates the move, sets `punishInfo`, and enables `onResetCurrentStep`.

## Localization Keys (`ja.json` & `en.json`)
- `quiz.player.last_move_label`: 直前の相手の手 / Opponent's last move
- `quiz.player.until_ply`: ({{ply}}手目まで) / (at ply {{ply}})
- `quiz.player.current_eval`: 形勢 / Position
- `quiz.player.eval_equal`: 互角 / Equal
- `quiz.player.eval_sente_lead`: 先手有利 / Sente leading
- `quiz.player.eval_gote_lead`: 後手有利 / Gote leading
- `quiz.player.punish_title`: 相手の最善の咎め手 / Opponent punishing countermove
- `quiz.player.punish_eval_crash`: 評価値急落 / Score crash
- `quiz.player.reset_step_btn`: 出題局面に戻してもう一度解く / Reset & Retry from Start
