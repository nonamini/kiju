# Tsumego (詰将棋) Feature Specification

Status: Draft v1
Date: 2026-11-10

This document defines the tsumego (checkmate problem) feature: problem model,
sources, gameplay flow, judging rules, SRS integration, and the phased
implementation roadmap.

---

## 1. Positioning & UX

Tsumego is a **hybrid** feature:

- **Independent navigation entry** — tsumego is a separate learning mode from
  joseki study, tactical quiz, and sparring, because its mental model
  ("solve a curated problem set") and goal differ.
- **Shared infrastructure** — board components, SFEN / legal-move generation,
  Fairy-Stockfish (Wasm), SRS scheduling, and quiz-session move replay are all
  reused.

```
Shared core (existing)
  Board UI / SFEN & legal moves / Fairy-Stockfish Wasm / SM-2 SRS / move replay
        |                                  |
  Tactical Quiz (existing)          Tsumego Mode (new)
  eval-swing detection              N-move mate & escape problems
  3-choice or free input            unique-solution, best-defense replies
```

Key difference from tactical quiz: correctness is judged by **mate
establishment / mate avoidance**, not by evaluation score.

---

## 2. Problem Data Model

New type file: `src/types/tsumego.ts`

```ts
export type TsumegoKind = 'attack' | 'defense';
// attack  = solver delivers checkmate (N手詰)
// defense = solver escapes a mating threat (受け・逃れ)

export type TsumegoSource =
  | 'kifu-extract'   // auto-extracted from game records / sparring
  | 'manual'         // hand-entered existing problem (KIF text or form)
  | 'tanuki-import'  // imported from tanuki-tsume-shogi puzzle JSON
  | 'generated';     // future: auto-generated problems

export interface TsumegoProblem {
  id: string;
  title?: string;
  source: TsumegoSource;
  kind: TsumegoKind;
  startSfen: string;          // position at problem start
  sideToMove: Color;          // the solver
  moveLimit?: number;         // N for N手詰; ply cap for defense problems
  solutionPv: string[];       // USI move sequence (mainline solution)
  acceptAllMatingMoves?: boolean; // true = any move that still mates is correct
  tags: string[];             // e.g. '1手詰', '金', 'ただし', '受け'
  createdAt: number;
  lastReviewedAt?: number;
}
```

### Design notes

- **Multiple correct first moves**: shogi tsumego often admit several mating
  moves. `acceptAllMatingMoves` selects between "unique solution only" and
  "any mating move accepted". When `false`, correctness is determined by
  membership in `solutionPv` at each ply; when `true`, the engine verifies
  that the played move still forces mate within the limit.
- **Defense problems** store the *attacker's* best (fastest-mating) replies
  implicitly: at each solver turn, any move that avoids mate within the limit
  is correct; the opponent replies with the engine-selected fastest mate.
- Problems extracted from kifu carry provenance (`sourceGameId`, `ply`) so the
  user can jump back to the original game position.

---

## 3. Problem Sources

### 3.1 Kifu / game extraction (primary)

Extends the existing mate detection in `extractQuizCards`
(`src/utils/quizExtractor.ts`) and `extractStudioQuizCards`
(`src/utils/studioQuizExtractor.ts`):

1. During analysis, Fairy-Stockfish reports mate scores. Positions where the
   side to move has a forced mate become `attack` tsumego candidates; positions
   where the side to move is being mated become `defense` candidates.
2. The mate distance reported by the engine determines `moveLimit` (N手詰).
3. The engine PV supplies `solutionPv`.
4. Candidates are verified before registration: replay the PV on
   `ShogiBoard`, confirm mate is actually delivered / avoided within the limit,
   and confirm legality of every move.
5. Deduplication: skip positions whose `startSfen` already exists in the pool.

### 3.2 Manual registration

- Accept pasted KIF-style problem text (header + move sequence), reusing the
  existing KIF parser conventions.
- Also a form-based editor: paste `startSfen`, enter solution moves.
- **Verification gate**: before saving, the engine must confirm the claimed
  solution actually mates (attack) or survives (defense) within the limit.
  Unverifiable problems are rejected with a reason.

### 3.3 Tanuki-tsume-shogi import (Phase 3)

[tanuki-tsume-shogi](https://github.com/tokuhirom/tanuki-tsume-shogi) is MIT
licensed and ships pre-generated, validated puzzle JSON (1〜11手詰,
unique-solution, no-piece-surplus rules). Its `puzzles/*.json` /
`public/puzzles/*.json` can be imported as a bulk problem set.

- An import script converts each puzzle record into `TsumegoProblem`
  (`source: 'tanuki-import'`).
- Its Rust `shogi-core` / `generator` crates are also valuable reference
  material for a future auto-generation pipeline (backward generation,
  df-pn solver, diversity filtering) — see `docs/` in that repo.

---

## 3.4 Engine Strategy

Two engine roles exist in tsumego; they do NOT have to be the same engine.

| Role | Engine | Rationale |
|---|---|---|
| Opponent replies & PV during play | **Fairy-Stockfish (existing Wasm)** | Interactive play only needs "most resisting defense" / "fastest mate"; eval + mate-score search is sufficient and already integrated |
| Problem verification, mate-distance confirmation, escape-problem correctness | Fairy-Stockfish mate score (P1–P2, provisional) → dedicated df-pn solver (P3+) | Stockfish-family engines report mate scores but cannot reliably *prove* "no mate within N" or find provably longest defenses at longer lengths |

**Dedicated solver candidate**: `shogi-core` from tanuki-tsume-shogi
(MIT license, Rust, already compiled to Wasm, includes df-pn and
unique-solution checking). This is preferred over
[KomoringHeights](https://github.com/komori-n/KomoringHeights), which was
evaluated and rejected because:

- **GPLv3 license** — incompatible with distributing a browser/Wasm bundle
  under this project's licensing model.
- **Desktop-only USI binary** — not Wasm-ready; the app has no always-on
  server (Firebase Spark serverless), so it cannot be hosted server-side.
- Overkill for interactive replies anyway.

---

## 4. Gameplay Flow

```
Problem select (filter: kind / move count / source / tags)
  -> show start position + "N手詰" / "受け" label
  -> solver plays a move
     |- move on the mating/escaping line
     |    -> opponent replies with engine-selected best defense
     |       (attack: longest resistance; defense: fastest mate)
     |    -> continue until mate / survival confirmed
     |- off-line move
     |    -> incorrect; optional reason hint
     |       ("取られる" / "逃げられる" / "合駒" etc., tanuki-style)
     |- move limit exceeded without mate (attack)
          -> fail
  -> mate established (attack) / mate avoided (defense)
     -> clear; record result into SRS
```

### Judging rules

- **Attack**: solver wins by checkmating within `moveLimit` plies (solver moves
  counted). Any mating continuation is accepted when
  `acceptAllMatingMoves` is true; otherwise the played move must match the
  stored PV at each ply.
- **Defense**: solver wins by making a move after which the opponent cannot
  mate within the limit. The opponent always plays the fastest mating reply
  (engine-selected). Repeating / perpetual-check edge cases follow the
  tsume rules in tanuki's `docs/tsume-rules.md` (no piece surplus, no
  useless interpositions where detectable).
- **Opponent replies**: Fairy-Stockfish in the existing Web Worker, queried
  with mate-distance scoring; deterministic enough for reproducible puzzles.

### UX details

- Hint system reuses the existing 5-stage selective hints (rank zone, file
  zone, piece type, board vs hand, answer reveal).
- Move-limit countdown and "詰みました / 逃げ切りました" result banner.
- Optional "答え表示" reveals the next PV move highlighted on the board.

---

## 5. SRS Integration

- Tsumego results feed the same SM-2 scheduler, but under a **separate
  category** so tsumego review is tracked independently from joseki recall.
- Daily review dashboard gains a tsumego section (or a category filter);
  "本日復習すべき詰将棋" is listed alongside joseki items.
- Scheduling inputs: correctness, hints used, attempt count — same fields as
  existing quiz cards.

---

## 6. Phased Roadmap

| Phase | Scope |
|---|---|
| **P1 — MVP** | `TsumegoProblem` model + Firestore schema; manual registration (KIF paste + form) with engine verification; N手詰 attack-only solve UI; basic SRS under separate category |
| **P2 — Extraction** | Auto-extract attack & defense candidates from kifu library and sparring match records; mate-distance → `moveLimit`; provenance links back to source game |
| **P3 — Breadth** | Defense (escape) problems end-to-end; tanuki puzzle JSON bulk import; reason hints on wrong moves |
| **P4 — Generation (optional)** | Auto-generate problems; evaluate porting tanuki's generator approach or importing pre-generated JSON batches |

---

## 7. Resolved Decisions

| Question | Decision |
|---|---|
| UX integration | Hybrid: independent mode, shared infrastructure |
| Problem sources | Kifu extraction (primary) + manual entry of existing problems; tanuki import at P3 |
| Format | Move-limited (N手詰 shown) |
| Scope | Both attack (mate) and defense (escape) problems |
| SRS | Separate category from joseki review |
| Defense format | Solver plays the escaping move(s) |

## 8. Open Questions (deferred)

- Whether defense problems need an explicit ply cap separate from mate
  distance (e.g. "逃れろ：受けて3手もたせる").
- Rating/difficulty grading of problems (手数 only, or engine-eval based).
- Whether `acceptAllMatingMoves` should be per-problem or global setting.
