# Issue #34 Implementation Spec: Opening Mastery Dashboard (戦型別・定跡習熟度ダッシュボード)

Branch: `feature/issue-34-mastery-dashboard`
Depends on: #18 (SRSReviewCard / sm2Scheduler), #20 (MatchRecord), #30-#33 (TacticalQuizCard, WeaknessPosition).
Rule 3: Phase A = mock UI with mock mastery stats & Chart.js, STOP for user approval. Phase B = real aggregation logic.
All code/comments in English (Rule 1). UI strings via `t()` (ja + en). No `any`. Rule 6 circuit breaker applies.

---

## 1. Objectives & Scope
1. **Aggregator (`masteryAggregator.ts`)**:
   - Combines data from:
     - `srsCards`: `SRSReviewCard[]` (from `loadSrsCards`)
     - `matchRecords`: `MatchRecord[]` (from `loadMatchRecords`)
     - `quizCards`: `TacticalQuizCard[]` & `quizProgress`
   - Groups metrics by `OPENING_CATEGORIES` (Kakugawari, Yagura, Aigakari, Furibisha, etc.).
   - Computes:
     - SRS Mastery: `mastered`, `review`, `learning`, `new`, `masteryPct = (mastered / total) * 100`.
     - Sparring performance: `totalMatches`, `wins`, `losses`, `winRatePct = (wins / totalFinished) * 100`.
     - Overall mastery score (0-100) combining SRS retention and practical match win rate.
2. **Dashboard UI (`OpeningMasteryDashboard.tsx`)**:
   - High-level KPIs: Total Repertoire Mastery %, Total Cards Mastered, Sparring Win Rate, Due for Review count.
   - Visual Progress Chart (Chart.js horizontal stacked bar / radar):
     - Displays Mastered (emerald), Review (sky), Learning (amber), and New (slate) segments per opening.
   - Opening cards grid with breakdown and quick actions:
     - "🎯 暗記特訓" -> launches SRS drill for this opening.
     - "⚔️ 実戦スパーリング" -> launches sparring match for this opening.
3. **Integration**:
   - Add tab `'mastery'` in `MockPage.tsx` for Phase A preview.
   - Add main navigation tab or dashboard modal in `App.tsx`.

---

## 2. Data Models (`src/types/mastery.ts`)
```ts
export interface OpeningMasteryStats {
  openingId: string;
  openingNameKey: string;
  totalCards: number;
  masteredCards: number;
  reviewCards: number;
  learningCards: number;
  newCards: number;
  masteryPct: number;
  accuracyPct: number;
  dueCardsCount: number;
  totalMatches: number;
  matchWins: number;
  matchLosses: number;
  matchDraws: number;
  winRatePct: number;
  overallScore: number;
}

export interface OverallMasterySummary {
  totalOpeningsPracticed: number;
  totalCards: number;
  masteredCards: number;
  overallMasteryPct: number;
  totalMatches: number;
  totalWins: number;
  overallWinRatePct: number;
  dueTodayCount: number;
  openings: OpeningMasteryStats[];
}
```

---

## 3. Phase A — Mock UI & Verification
- **A1**: Define `OpeningMasteryStats` & `OverallMasterySummary` in `src/types/mastery.ts`.
- **A2**: Create presentational component `OpeningMasteryDashboard.tsx` with Chart.js progress visualization and mock data.
- **A3**: Add tab in `MockPage.tsx` and stop for user visual inspection and approval.

---

## 4. Phase B — Real Aggregation Logic & Wiring
- **B1**: Implement `aggregateOpeningMastery` in `src/utils/masteryAggregator.ts`.
  - Comprehensive unit tests in `tests/masteryAggregator.test.ts`.
- **B2**: Wire into `src/App.tsx` with live `srsCards`, `matchRecords`, and opening drill triggers.
- **B3**: Run `npm run type-check` and vitest suite.

---

## 5. Done Criteria
- [x] `npm run type-check` = 0 errors, `npm test` green.
- [x] Mock UI approved by user.
- [x] Visual stacked bar chart displays accurate category breakdown.
- [x] Direct drill & sparring action buttons work seamlessly.
