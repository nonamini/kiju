# Issue #28 Implementation Spec: Review-mode best move always shown + auto analysis

Branch: `feature/issue-28-review-auto-analysis`
Executor note: change ONLY `SparringArenaPanel.tsx`, `ja.json`, `en.json`. No new files. No new types. Do not touch hooks.
All code/comments in English (Rule 1). UI strings via `t()`.

Target file: `src/components/sparring/SparringArenaPanel.tsx` (line numbers are as of commit 6cd1e40; re-locate by the quoted snippets).

## Verified existing names (do NOT invent others)
- state: `reviewPly`, `isBestMoveRevealed`, `reviewAnalysisMap: Record<number, MoveEvaluation>`, `isAnalyzingReviewPosition`
- derived: `isReviewing`, `isGameActive`, `displayPly`, `totalMoves`, `activeEvaluation`, `bestMoveJapanese`
- handler: `handleAnalyzeReviewPosition` (async, analyzes `reviewPly ?? totalMoves`, writes `reviewAnalysisMap[ply]`)
- sparring: `sparring.isSearching`, `sparring.engineStatus` (`'ready'` when usable), `sparring.moveHistory[i].evaluation?.bestMove`, `sparring.recordHintViewed()`

## Definition
`isReviewContext = isReviewing || !isGameActive`
(same condition the existing on-demand analysis block uses: `(isReviewing || !isGameActive)`).
Live match (`isGameActive && !isReviewing`) keeps the cheat-prevention toggle unchanged.

## Step 1: add derived flag
After `const displayPly = ...` (~L143) add:
```ts
const isReviewContext = isReviewing || !isGameActive;
```
- [ ] done

## Step 2: reset-effect must not hide best move in review context
Two effects (~L101-109) call `setIsBestMoveRevealed(false)`. Leave them as-is (they only matter for live play).
- [ ] no change needed, verify only

## Step 3: best move spotlight block (~L894-934)
Current: ternary on `isBestMoveRevealed`. Change the condition to `isBestMoveRevealed || isReviewContext`.
- In review context hide the "hide" button (`t('sparring.hide_best_move')`), show only the move text.
- If `isReviewContext` and no `activeEvaluation?.bestMove` yet: show `t('sparring.auto_analyzing')` text (small, slate-400) instead of move.
- NEVER call `sparring.recordHintViewed()` in review context (the reveal button is not rendered there, so this is automatic).
- [ ] done

Pseudo-JSX:
```tsx
{(isBestMoveRevealed || isReviewContext) ? (
  <div className="flex items-center gap-2">
    <span className="text-base font-black text-amber-300 font-mono">
      {activeEvaluation?.bestMove ? bestMoveJapanese : t('sparring.auto_analyzing')}
    </span>
    {!isReviewContext && (<button ...hide.../>)}
  </div>
) : ( /* existing reveal button, unchanged */ )}
```
Check how `bestMoveJapanese` is computed (grep it); if it already returns a placeholder when no bestMove, simplify accordingly.

## Step 4: auto-analysis effect
Add near the other effects (after the auto-scroll effect ~L182). Needs a ref for failed plies.

```ts
const autoAnalyzeFailedRef = useRef<Set<number>>(new Set());

useEffect(() => {
  if (!isReviewContext) return;
  if (displayPly <= 0) return;
  if (sparring.engineStatus !== 'ready') return;
  if (isAnalyzingReviewPosition || sparring.isSearching) return;
  if (reviewAnalysisMap[displayPly]) return;
  if (sparring.moveHistory[displayPly - 1]?.evaluation?.bestMove) return;
  if (autoAnalyzeFailedRef.current.has(displayPly)) return;

  const timer = window.setTimeout(() => {
    autoAnalyzeFailedRef.current.add(displayPly); // prevents retry loop; removed on success below
    void handleAnalyzeReviewPosition();
  }, 400); // debounce while user steps quickly
  return () => window.clearTimeout(timer);
}, [isReviewContext, displayPly, sparring.engineStatus, sparring.isSearching,
    isAnalyzingReviewPosition, reviewAnalysisMap, sparring.moveHistory]);
```
Notes:
- Adding the ply to the failed set BEFORE the call is deliberate (circuit breaker). Success is detected by `reviewAnalysisMap[displayPly]` existing, so the set only blocks retries after failure.
- Reset `autoAnalyzeFailedRef.current.clear()` inside the existing effect that runs on `sparring.moveHistory.length` change (~L101) so a new game starts clean.
- `handleAnalyzeReviewPosition` uses `reviewPly ?? totalMoves`; this equals `displayPly` in review context, OK.
- eslint exhaustive-deps: handler is not in deps on purpose; add `// eslint-disable-next-line react-hooks/exhaustive-deps` only if the lint script errors.
- [ ] done

## Step 5: manual analyze button
Keep the existing "🎯 analyze" button (acts as manual re-run). No change.

## Step 6: locale keys
Add to `src/locales/ja.json` and `src/locales/en.json` under `"sparring"`:
| key | ja | en |
|---|---|---|
| `auto_analyzing` | 解析中… | Analyzing... |
- [ ] both files, valid JSON, no trailing comma

## Test / verification (manual, no unit test needed: UI-only)
| Scenario | Expected |
|---|---|
| Live match, player turn | "reveal best move" button visible; count increments on click |
| Finish match -> step back with move list | best move shows without click; hintsViewedCount unchanged |
| Step to an unanalyzed ply | "解析中…" then best move appears within ~1-2s |
| Step quickly across 10 plies | only the last ply is analyzed (debounce) |
| Engine offline | no infinite retry; manual button still works |

## Done criteria
- [ ] `npm run type-check` = 0 errors
- [ ] `npm run lint` clean (if script exists)
- [ ] Commit: `feat(sparring): auto-reveal and auto-analyze in review mode (#28)`
- [ ] If any step fails after 1 retry: STOP and report (Rule 6)
