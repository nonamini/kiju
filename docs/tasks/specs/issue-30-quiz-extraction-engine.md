# Issue #30 Implementation Spec: Tactical quiz extraction engine + data model

Branch: `feature/issue-30-quiz-extraction-engine`
Pure logic only. NO UI, NO Firestore, NO engine calls. All code/comments in English (Rule 1). No `any`.

## Verified existing names (do NOT invent others)
- `ShogiMove` (`src/types/shogi.ts`): `ply, color, from?, to, piece, promote?, isDrop, kifString, sfenMove, evaluation?`
- `MoveEvaluation`: `scoreCp, isMate?, matePly?, depth, bestMove?, bestMoveKif?, pv?, evaluatedAt`
- `Color = 'b' | 'w'`
- `src/types/index.ts` re-exports with `export * from './x';`
- Test runner: `npm test` = `vitest run` (put tests next to source as `*.test.ts`)

## Evaluation semantics (IMPORTANT, existing convention)
`moves[N-1].evaluation` (ply N, 1-based) = analysis of the position AFTER N plies:
- `scoreCp` is always from **Sente (b)** point of view (+ good for Sente).
- `bestMove` / `pv` = best continuation for the side to move at ply N+1 (USI).
Define `E[N] = moves[N-1].evaluation` for N >= 1.

## Step 1: types — `src/types/quiz.ts`
```ts
import { Color, ShogiMove } from './shogi';

export type TacticalQuizType = 'attack' | 'defense' | 'race' | 'mate';
// attack=A (opponent slack), defense=B (must defend), race=C (endgame race), mate=D (mating net)

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

## Step 2: extractor — `src/utils/quizExtractor.ts`
Exports:
```ts
export const DEFAULT_QUIZ_CONFIG: QuizExtractionConfig;

export function extractQuizCards(
  game: QuizSourceGame,
  config?: Partial<QuizExtractionConfig>,
  nowIso?: string
): TacticalQuizCard[];

export function detectTurningPoint(
  moves: ShogiMove[],
  n: number,
  cfg: QuizExtractionConfig
): TurningPointDetectionResult | null;
```

### Extraction & Capping Algorithm (`extractQuizCards`)
1. **Detection**:
   - Traverse `n` from 2 to `moves.length` (position after `n` plies).
   - If evaluation is missing or bestMove is invalid -> skip.
   - Run `detectTurningPoint(moves, n, cfg)`:
     - `mate`: `curS >= cfg.mateScoreCp` or `isMate` for solver.
     - `reversal`: Advantage flipped with swing >= `reversalThresholdCp` and solver now leading (`curS > 0`).
     - `equal_to_lead`: Near-even position (`|prevS| <= 150`) tilted decisively to solver advantage (`curS >= minSwingCp`).
     - `only_move`: Facing threat (`gain <= -defenseThreatCp`) and game continuation blundered (`lossActual >= defenseLossCp`).
     - `tactical_shift`: Opponent made a slack move giving solver >= `attackGainCp`.
2. **Prioritization & Spacing Filter (3〜5 Quizzes Per Game)**:
   - Sort candidates descending by `evalSwing` (largest turning points first).
   - Greedily pick turning points ensuring minimum spacing (`minPlyDistance = 4` plies).
   - Cap total picked cards to `maxQuizzesPerGame = 5` (typically extracting 3 to 5 questions).
3. **Deterministic 3-Choice Generation (`choices`)**:
   - For step 0 (initial puzzle position), compute all legal moves on the position.
   - Slot 1: `bestMove` (`isCorrect: true`, `scoreDelta: 0`).
   - Slot 2: Actual game move if blundered (`isCorrect: false`, `scoreDelta: -lossActual`).
   - Slot 3: Plausible legal distractor from legal board moves.
   - Shuffle or sort choices deterministically using card ID hash.
4. **Game Continuation as Answer Path**:
   - For subsequent steps (step >= 1), use actual game moves from the source game continuation to ensure 100% legal, logical progression.

## Step 3: Tests — `src/utils/quizExtractor.test.ts`
- Verified classification of `equal_to_lead`, `reversal`, `only_move`, `tactical_shift`, `mate`, `race`.
- Verified filtering with `minPlyDistance` and capping to `maxQuizzesPerGame`.
- Verified 3-choice option generation and determinism.
