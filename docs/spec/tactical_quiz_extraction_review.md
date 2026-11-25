# Tactical Quiz Extraction — Quality Review & Repair Spec

Status: Draft (investigation complete, awaiting implementation approval)
Date: 2026-11-08

This document records the specification of the current quiz generation logic,
the defects found in it, and the proposed repair specification.

---

## 1. Current Architecture

Two independent extraction pipelines feed the same quiz pool
(`TacticalQuizCard`, see `src/types/quiz.ts`).

### 1.1 Pipeline A — `extractQuizCards` (`src/utils/quizExtractor.ts`)

Entry points:
- `App.tsx` `handleRegenerateQuizzes` — all sparring match records
- `App.tsx` `handleGenerateQuizFromSpecificGame` — a single game (analyzed tree
  path with evaluations, plain game input, or match record)

Flow:
1. For each ply `n` (2..moves.length), read `moves[n-1].evaluation` (position
   AFTER ply n) and `moves[n-2].evaluation` (position after ply n-1).
   `scoreCp` is Sente-view; `bestMove`/`pv` are for the side to move at ply n+1.
2. `detectTurningPoint(moves, n, cfg)` classifies the position into
   `attack | defense | race | mate` using centipawn thresholds
   (`DEFAULT_QUIZ_CONFIG`). All triggers require a large evaluation swing.
3. Candidates are sorted by `swing` desc, greedily selected with
   `minPlyDistance` spacing, capped at `maxQuizzesPerGame` (5).
4. For each selected candidate a card is built by replaying the game on
   `ShogiBoard` to obtain strictly legal moves.

### 1.2 Pipeline B — `extractStudioQuizCards` (`src/utils/studioQuizExtractor.ts`)

Entry points:
- `autoRegisterStudioQuizzes` — after a Studio match finishes analysis
- `regenerateAllStudioQuizzes` — rebuilds the whole pool from saved games
  (`StudioQuizModal`)

Flow:
1. For each ply `p` (>= 12), compare `evaluations[p-1]` and `evaluations[p]`,
   converted to Sente-normalized win rate via `cpToWinRate`
   (logistic sigmoid, scale 600).
2. Filters: skip decided positions (`prevWr >= 0.98 || <= 0.02`), skip hopeless
   movers (`moverWrBefore < 0.20`), require `winRateSwing >= 0.15` or mate.
3. Type assignment: `mate` / `defense` (eval drop >= 300cp or WR swing against
   mover) / `race` (p >= 60) / `attack`.
4. Question position = BEFORE ply p (`questionPly = p - 1`). SFEN is rebuilt
   precisely via `JKFPlayer`. `bestMove` = engine `bestMove` at that position,
   with legality check against `getAllStrictLegalMoves`.
5. Choices prefer MultiPV candidates with win-rate gap >= 0.05, then the
   actual game move as a distractor, then arbitrary legal moves as fallback.
6. Top 5 by `winRateSwing`, min 8-ply spacing, chronological order.

### 1.3 Judging (`src/utils/quizJudge.ts`, `src/hooks/useQuizSession.ts`)

- Step-0 answer must equal `card.pv[0]` (== `card.bestMove`) for verdict `best`.
- Non-exact moves are scored via precomputed `choice.scoreDelta`, or a live
  engine search (400ms) compared against `scoreCpBefore` with 50cp tolerance.
- Hint choices come from `card.choices` filtered to currently legal moves,
  or deterministic hash-ordered legal moves.
- PV continuation: after each correct solver move, `card.pv[step*2+1]` is
  played as the scripted reply.

---

## 2. Defects Found

### P1 — Blunder moves are marked as the correct answer (critical)

`quizExtractor.ts:347-350` sets `bestMove` to the move actually played in the
game (`moves[n].sfenMove`), falling back to engine PV only when the game move
is missing/resign:

```ts
const bestMove = (gameMoveAtPosition && gameMoveAtPosition !== 'none' && ...)
  ? gameMoveAtPosition
  : (enginePv[0] ?? curEval.bestMove);
```

For `defense`/`only_move` cards this is guaranteed wrong: the detection rule
requires the solver's actual move to have lost >= `defenseLossCp` (200cp)
(`detectTurningPoint`, lines 102-109). The card therefore presents a 200cp+
blunder as `bestMove`/`pv[0]` — the "correct" answer is itself a losing move.
Even for `attack` cards the game move may be suboptimal.

### P2 — Quiz selection is structurally monotone

Both pipelines only trigger on large evaluation swings. Every generated quiz
is therefore one of exactly two shapes:

- "Opponent just blundered — find the refutation" (`attack`, `equal_to_lead`,
  `reversal`, `tactical_shift`)
- "You are under threat — find the only saving move" (`defense`, `only_move`)

There is no quiz type for quiet positions ("find the best move" in an equal
game). Combined with P1, the pool degenerates into a parade of trivially
punishable positions whose marked answer is frequently the game's own mistake.

### P3 — Arbitrary legal move substituted as correct answer (Pipeline B)

`studioQuizExtractor.ts:254-259`: if the engine `bestMove` is not legal in the
reconstructed position, the code silently falls back to `legalMoves[0]` and
marks it `isCorrect`. This produces cards whose "correct" answer has no
engine backing whenever position reconstruction and evaluation drift apart.

### P4im — Weak distractor generation (Pipeline A)

`buildCardChoices` (`quizExtractor.ts:158-201`):

- Distractors are the first legal moves in board enumeration order — no
  engine ranking. Obviously losing moves make the answer self-evident.
- `scoreDelta` is hardcoded (-200/-350), not a real evaluation.
- No minimum-choices guard: if board replay fails (`isBoardValid === false`)
  `legalMoves` is empty, so `choices` may contain only `bestMove` (or an
  unverified `bestMove`), yet the card is still emitted. Downstream
  `pickHintChoices` then filters to < 3 usable choices.

### P5 — PV continuation replays game moves, including blunders

`quizExtractor.ts:366-377`: `pv` prefers the game's actual continuation over
the engine PV. After the solver answers correctly, the scripted "reply" can
be a blunder, producing incoherent lines; combined with P1 the expected line
can be entirely composed of the game's own mistakes.

### P6 — Inconsistent semantics between pipelines

| Aspect | Pipeline A | Pipeline B |
|---|---|---|
| Trigger metric | cp swing thresholds | win-rate swing >= 0.15 |
| Decided-position filter | none (only `defenseMinScoreCp`) | WR >= 0.98 / <= 0.02 excluded |
| Hopeless-mover filter | none | `moverWrBefore < 0.20` excluded |
| Correct answer source | game move (bug, P1) | engine bestMove (+ arbitrary fallback, P3) |
| Distractors | enumeration order, fake deltas | MultiPV with WR gap, real deltas |
| Opening exclusion | none | ply < 12 skipped |
| Spacing | `minPlyDistance` (2 impl / 4 doc) | 8 plies |
| Question position | after opponent's move n | before ply p |

Both pipelines write into the same pool, so quiz quality varies arbitrarily by
source.

### P7 — Minor inconsistencies

- `DEFAULT_QUIZ_CONFIG.minPlyDistance = 2` but `QuizExtractionConfig` doc
  comment says default 4.
- `extractQuizCards` logs extensively (`console.log` per ply) — noisy in
  production.

---

## 3. Repair Proposal

### 3.1 Guiding principle

Unify on Pipeline B's model, which is already closer to correct:

- **The correct answer is always the engine's best move** at the question
  position — never the game's actual move.
- The game's actual move is used only as a *distractor* (it is often a
  realistic mistake) or as context (`actualMove`, `opponentLastMove`).
- Distractors come from MultiPV candidates first, then legal moves.
- Win-rate based filtering for decided/hopeless positions.

### 3.2 Fix P1 — correct answer source (Pipeline A)

In `extractQuizCards`, replace the game-move preference:

```ts
const bestMove = enginePv[0] ?? curEval.bestMove; // engine-authoritative
```

- `enginePv[0]` is the engine's top choice at the position (eval at ply n is
  for the side to move at n+1 — exactly the solver).
- Keep the existing legality check; on failure, skip the card (do NOT
  substitute an arbitrary move — see P3).
- `actualMove` remains `moves[n]?.sfenMove` for display/distractor use.

### 3.3 Fix P3 — remove arbitrary fallback (Pipeline B)

In `extractStudioQuizCards`, when `bestMove` is illegal in the reconstructed
position, **skip the card** instead of substituting `legalMoves[0]`:

```ts
if (!legalUsiSet.has(bestMove)) continue; // stale eval / desynced position
```

This trades recall for correctness; desynced cards are worse than missing
cards.

### 3.4 Fix P4 — choice generation (Pipeline A)

Adopt Pipeline B's ordering for `buildCardChoices`:

1. Correct: `bestMove` (engine).
2. MultiPV candidates (`evaluation.candidates`) excluding bestMove, filtered
   by legality and a minimum win-rate/cp gap so distractors are plausible but
   clearly inferior.
3. The game's actual move, if legal, different, and not already included
   (scoreDelta = real loss vs best).
4. Fallback: legal moves in deterministic hash order (not enumeration order).
5. **Guard**: emit the card only if exactly 3 distinct legal choices exist;
   otherwise skip.

`scoreDelta` must be computed from real evaluations where available
(MultiPV `scoreCp`), not hardcoded constants.

### 3.5 Fix P5 — PV construction

`pv` should be engine-authoritative:

- `pv[0]` = `bestMove` (guaranteed).
- Remaining odd-length steps from `curEval.pv` (engine continuation).
- The game continuation may be appended only as a *display* reference
  (e.g. `actualMove`), never mixed into the expected solution line.

If a future feature wants "follow the game's actual replies", that must be a
separate card mode with its own judging rules — out of scope here.

### 3.6 Fix P2 — diversify quiz types (spec-level decision needed)

The swing-only trigger is the root of monotony. Options, in increasing scope:

- **Option A (minimal)**: Keep swing triggers, but fix P1 so every card's
  answer is a genuine best move. The "punish the blunder" shape remains, but
  answers become correct and instructive.
- **Option B**: Add a quiet-position quiz type — sample positions where
  `|scoreCp|` is moderate (e.g. -300..+300), eval is stable across the last
  few plies, and `bestMove` differs meaningfully from alternatives
  (MultiPV gap >= threshold). Type could reuse `attack` or a new
  `positioning`/`reading` type (requires `TacticalQuizType` extension and UI
  label updates).
- **Option C**: Unify both pipelines into a single extractor parameterized by
  input source (JKF evaluations vs `ShogiMove[]`), eliminating P6 entirely.

Recommendation: implement 3.2–3.5 first (correctness), then evaluate Option B
for variety. Option C is a larger refactor; do it only if both pipelines
remain in active use.

### 3.7 Fix P6/P7 — hygiene

- Reconcile `minPlyDistance` default (code=2, doc=4) — pick 4 and update code.
- Remove per-ply `console.log` debug output or gate behind a debug flag.
- Decide a single spacing rule across pipelines (8 plies recommended).
- If pipelines stay separate, document the semantic differences in
  `data_models.md` so pool consumers know what they get.

---

## 4. Target Specification (post-repair invariants)

Every emitted `TacticalQuizCard` MUST satisfy:

1. `bestMove === pv[0]`, and `bestMove` is the engine's top choice at the
   question position (never the game's actual move).
2. `bestMove` and every `pv` entry are strictly legal on the question board
   (verified via `ShogiBoard` replay / `getAllStrictLegalMoves`).
3. `choices` contains exactly 3 distinct strictly legal USI moves, exactly one
   `isCorrect`, all score deltas derived from real evaluations when available.
4. The position is not already decided for the solver
   (`winRateBefore` within (0.02, 0.98) and mover not hopeless).
5. Cards from the same game are spaced >= `minPlyDistance` plies apart and
   capped at `maxQuizzesPerGame`.
6. Quiz types remain `attack | defense | race | mate`; a `defense` card's
   correct answer must be a move that *preserves* evaluation, never the
   blunder that triggered detection.

## 5. Affected Files

- `src/utils/quizExtractor.ts` — P1, P4, P5, P7
- `src/utils/studioQuizExtractor.ts` — P3, P6 alignment
- `src/types/quiz.ts` — only if a new quiz type is added (Option B)
- `src/utils/quizExtractor.test.ts`, `tests/` — regression tests
- `src/locales/*.json`, quiz UI components — only if labels/types change

## 6. Test Plan

- Unit: `defense`/`only_move` card where the game move was a blunder →
  assert `bestMove` equals engine `bestMove`, not `actualMove`.
- Unit: desynced position (illegal engine bestMove) → card skipped, not
  substituted.
- Unit: choice generation → exactly 3 legal choices, real `scoreDelta`s,
  actual blunder appears as distractor when legal.
- Unit: PV → `pv[0] === bestMove`, odd length, engine continuation.
- Regression: existing `quizExtractor.test.ts` cases updated where they
  asserted game-move-as-answer behavior.
