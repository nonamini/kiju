# Issue #33 Implementation Spec: Weakness Position Detection & Drill Generator (苦手局面特訓)

Branch: `feature/issue-33-weakness-drills`
Depends on: #30 (TacticalQuizCard), #31 (QuizPoolManager), #32 (QuizPlayerPanel / useQuizSession), #20 (MatchRecord / MatchHistoryDashboard).
Rule 3: Phase A = mock UI with mock weakness positions & drill deck, STOP for user approval. Phase B = real aggregation logic.
All code/comments in English (Rule 1). UI strings via `t()` (ja + en). No `any`. Rule 6 circuit breaker applies.

---

## 1. Objectives & Scope
1. **Aggregator (`weaknessDetector.ts`)**:
   - Scan `MatchRecord[]` (specifically `result === 'loss'`).
   - Identify recurring divergence points (`outOfBookPly`) and recurring loss positions.
   - Match against `MergedKifuTree` to identify what move the user played vs what the book recommended.
   - Aggregate into `WeaknessPosition` clusters with metrics: `lossCount`, `lastLossAt`, `divergenceMove`, `bookMoves`.
2. **Convert to Practice Cards (`weaknessToQuiz.ts`)**:
   - Transform `WeaknessPosition` into `TacticalQuizCard` so the user can immediately practice them using the existing `QuizPlayerPanel` (#32).
   - If book moves are present in the tree, use the book move as the target `bestMove` and principal variation.
   - If engine is available, verify or fill PV if out-of-book continuation exists.
3. **UI Surfaces**:
   - **Match History Dashboard (`MatchHistoryDashboard.tsx`)**:
     - Add a tab / section: "⚠️ 苦手局面分析 (Weakness Analysis)" showing recurring loss positions, loss frequency, divergence details, and a "特訓開始" (Start Drill) button.
   - **Post-Match Modal (`PostMatchFeedbackModal.tsx`)**:
     - When a match ends in a loss at a known or recurring weakness, highlight: "⚠️ 2回目の定跡離脱敗戦です" with a direct button "苦手局面を特訓する".
   - **Quiz Tab (`QuizPoolManager.tsx` / `App.tsx`)**:
     - Filter / deck badge: "⚠️ 苦手局面 (Weakness Drill)" allowing users to focus their practice exclusively on positions where they previously stumbled in sparring.

---

## 2. Data Models (`src/types/weakness.ts`)
```ts
export interface WeaknessPosition {
  id: string; // `${openingId}:${ply}:${sfenMove}`
  openingId: string;
  openingName?: string;
  ply: number; // Ply at which divergence / mistake occurred
  sfen: string; // SFEN at this ply
  usiMovesToPosition: string[];
  playerColor: 'b' | 'w';
  lossCount: number; // Number of losses at or following this position
  matchCount: number; // Total matches reaching this position
  lastLossAt: string; // ISO date
  playedMoveUsi: string; // Move the player played (divergence or blunder)
  bookMovesUsi: string[]; // Correct move(s) according to opening tree
  sourceMatchIds: string[];
}
```

---

## 3. Phase A — Mock UI & Verification
- **A1**: Define `WeaknessPosition` type in `src/types/weakness.ts`.
- **A2**: Create presentational component `WeaknessAnalysisView.tsx` with mock data:
  - List of weakness cards (opening name, ply, loss count e.g. "3回敗戦", move played vs book move).
  - Mini board / preview of the position.
  - "⚔️ この局面を特訓" button that launches the quiz player with the weakness card.
- **A3**: Preview in `MockPage.tsx` under a new tab "Weakness Drills" and wire mock button in `MatchHistoryDashboard.tsx`.
- **A4**: STOP for user review & visual approval.

---

## 4. Phase B — Real Detection Logic & Wiring
- **B1**: Implement `detectWeaknessPositions(records: MatchRecord[], trees: Record<string, MergedKifuTree>): WeaknessPosition[]` in `src/utils/weaknessDetector.ts`.
  - Group by `openingId + ply + playedMove` or SFEN.
  - Filter for clusters with `lossCount >= 1` (sorted by `lossCount` descending, then `lastLossAt` descending).
  - Comprehensive unit tests in `tests/weaknessDetector.test.ts`.
- **B2**: Implement `weaknessToQuizCard(weakness: WeaknessPosition, tree?: MergedKifuTree): TacticalQuizCard` in `src/utils/weaknessToQuiz.ts`.
  - Generates PV based on book continuation (or single ply best book move).
  - Unit tests in `tests/weaknessToQuiz.test.ts`.
- **B3**: Wire into `MatchHistoryDashboard.tsx`, `PostMatchFeedbackModal.tsx`, and `App.tsx` / `QuizPoolManager.tsx`.
- **B4**: Type-check (`npm run type-check`), run tests, browser manual verification.

---

## 5. Done Criteria
- [x] `npm run type-check` = 0 errors, `npm test` green.
- [x] Mock UI approved by user.
- [x] Real detection aggregates multiple sparring losses correctly.
- [x] One-click drill launches `QuizPlayerPanel` on weakness positions.
