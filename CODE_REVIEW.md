# 棋樹 (joseki-tree) - Code Review & UX Concerns
**Review Date:** 2026-10-22
**Reviewer:** Third-party AI Code Reviewer
**Focus:** UX/User Flow, Technical Quality, Future Scalability

---

## 📋 Executive Summary

**Overall Assessment:** The application has well-implemented individual features (KIF parsing, tree merging, AI engine, SRS, sparring) with clean TypeScript strictness and proper i18n separation. However, there is a **critical misalignment between the stated concept and implementation**:

**Stated Concept:** "棋譜集め・分岐が主体" (Game record collection and branching as primary activity)
**Actual Implementation:** Game record management has poor UX and low completion quality

**Key Issue:** The core activity (importing, organizing, and managing KIF files) is the weakest part of the UI, while secondary tools (SRS, Sparring) are well-implemented but depend on a foundation that users struggle to use.

**Key Strengths:**
- ✅ TypeScript strict mode properly enforced
- ✅ i18n fully externalized (no hardcoded Japanese in code)
- ✅ Component architecture is modular and well-separated
- ✅ Fairy-Stockfish Wasm integration is clean
- ✅ SparringArenaPanel has excellent broadcast-style layout
- ✅ KIF parsing logic is robust

**Critical UX Issues (Priority Order Reordered):**
- ❌ **棋譜管理機能の完成度が低い（最優先課題）** - Core activity has poor UX, hidden uploader, unclear merge behavior
- ❌ **棋譜追加・合成への導線が弱い** - Uploader is hidden at bottom of Study tab, requires scrolling
- ❌ **棋譜合成の挙動が分かりにくい** - Auto-merge happens invisibly, no explicit merge button
- ❌ **研究画面からAI対局へのジャンプが不明瞭** - Button exists but less prominent than expected
- ❌ **画面間のデザイン一貫性が欠如** - Study vs Sparring layouts feel like different apps
- ❌ **オンボーディング/チュートリアルがない** - New users don't understand the core concept (tree as primary, SRS/Sparring as tools)
- ❌ **対局履歴が研究コンテキストから孤立** - Match history only accessible from Sparring tab, not integrated with study workflow

---

## 🎯 UX/User Flow Concerns (Critical Priority)

### 0. 棋譜管理機能の完成度が低い（最優先課題）

**Core Problem:**
The app's stated concept is "棋譜集め・分岐が主体" (game record collection and branching as primary), but the KIF management interface has the poorest UX in the entire application. This creates a fundamental disconnect: users are told the app is about collecting and organizing games, but the tools to do so are difficult to discover and use.

**Specific Issues with KIF Management:**

**A. Import Workflow is Buried and Confusing**
- **Uploader location**: Hidden at bottom of Study tab (App.tsx lines 596-614), requires scrolling past board, chart, tree explorer
- **Alternative access**: Header button exists (lines 418-430) but small and not obvious to new users
- **Modal accessibility**: KifuManagementModal is well-implemented but only accessible via header button
- **First-time experience**: Users see an empty board with sample data, no clear call-to-action to add their own games

**B. Library Table is Overwhelming and Lacks Context**
- **Table complexity**: 8 columns (include, title, players, opening, plies, winner, analysis, actions) feels like a database admin tool
- **No visual hierarchy**: All columns have equal weight, no clear primary actions
- **Category management**: Dropdowns in each row are functional but tedious for bulk operations
- **No search/filter**: Users with 50+ games cannot quickly find specific matches

**C. Merge Behavior is Invisible and Unpredictable**
- **Auto-merge**: Tree recalculates on every checkbox toggle (App.tsx lines 75-80), but users don't see it happening
- **No merge confirmation**: Toggling a checkbox doesn't show "Tree updated with X games" feedback
- **No merge summary**: Users don't know how many nodes are in the current tree, or which games contributed
- **Empty state confusion**: "まだ取り込まれた棋譜はありません" appears even when games exist but are unchecked

**D. No "Collection Building" Workflow**
- **No import flow guidance**: Users don't know how many games they should import, or what constitutes a "good" repertoire
- **No quality indicators**: No way to mark games as "high quality" or "reference games"
- **No grouping/batching**: Users can't group games by tournament, date range, or player
- **No collection progress**: No indicator like "You have 23 games for 角換わり, aim for 50 to cover major variations"

**E. Export/Share is Tertiary, Not Primary**
- **Export buttons**: Hidden in KifuLibraryTable header (lines 129-143), only visible when games are included
- **No share intent**: No "Send to external tool" workflow, no integration with ShogiDB, KifuMaster, etc.
- **Copy KIF**: Works but doesn't explain what to do with the copied content

**Why This Matters:**
- If users cannot efficiently import and organize games, they cannot use SRS or Sparring effectively
- The tree depends on high-quality input; poor KIF management leads to poor trees
- Competitors (ShogiDB, KifuMaster) have excellent KIF management; this app falls short
- Users may abandon the app before ever reaching the "study" or "sparring" features

**Recommendation: Prioritize KIF Management Overhaul**

**Phase 1 - Immediate (Make it discoverable):**
1. **Move KIF uploader to top of Study tab** or make it a prominent empty state
2. **Add "Import Wizard"**: Step-by-step guide for first-time users
   - Step 1: "Welcome! Let's build your repertoire. Start by importing games."
   - Step 2: Show sample KIF buttons with explanations
   - Step 3: After first import, explain "This game is now in your library. Import more to build a tree."
3. **Add tree summary badge**: "ツリー: X局、Yノード" visible in Study tab header

**Phase 2 - Short-term (Make it usable):**
4. **Redesign KifuLibraryTable**:
   - Reduce to 4-5 essential columns
   - Add bulk category assignment (select multiple → assign to 角換わり)
   - Add search/filter by player name, date, tournament
   - Add "quality rating" (⭐ for reference games)
5. **Add explicit merge controls**:
   - "🔄 ツリーを再構築" button with progress indicator
   - Merge completion toast: "X局をツリーに統合しました（Yノード生成）"
   - Show merge history: "Last merged: 2 minutes ago"

**Phase 3 - Medium-term (Make it powerful):**
6. **Add collection management features**:
   - Create "collections" or "folders" (e.g., "2023 竜王戦", "角換わり本譜")
   - Bulk operations (select all from tournament → include in tree)
   - Import from URL (paste ShogiDB link → auto-fetch)
7. **Add quality indicators**:
   - Mark games as "reference" (highlighted in tree)
   - Show game quality score (based on player strength, tournament importance)
   - Filter tree to show only reference game branches

**Code Reference:**
- App.tsx lines 596-614 (bottom uploader - should move up)
- App.tsx lines 75-80 (auto-merge - needs explicit controls)
- KifuLibraryTable.tsx (overcomplex table - needs redesign)
- KifuManagementModal.tsx (good component, needs better discovery)
- KifuUploader.tsx (well-implemented, needs better placement)

---

### 1. 棋譜取り込み・合成導線のアクセシビリティ

**Current State:**
- KIF uploader and library table are at the **bottom** of the Study tab (lines 596-614 in App.tsx)
- Users must scroll past board, chart, tree explorer to find upload area
- Quick Kifu Management Modal exists (lines 418-430, 632-648) but only accessible via header button or top-right badge

**Issue:**
- New users opening the app see a board with sample data but **no obvious way to add their own KIF files**
- The "📂 棋譜管理・追加" button in header (lines 418-430) is helpful but small
- No visual cue that "this is where you build your repertoire"

**Recommendation:**
- **Add a prominent empty state** in Study tab when `gameInputs.length === 0`:
  - Large hero section: "🎯 Start by importing your KIF files"
  - One-click sample KIF buttons (already exist in KifuUploader) should be more visible
  - Explanation: "Import professional games → Merge into tree → Study → Memorize → Spar"
- **Consider making KifuManagementModal the primary entry point** for first-time users (auto-open on first visit)

**Code Reference:**
- App.tsx lines 596-614 (bottom KifuUploader/KifuLibraryTable)
- App.tsx lines 418-430 (Quick Kifu Manager button)
- KifuManagementModal.tsx (well-implemented, just needs better discovery)

---

### 1.5 棋譜合成の挙動が分かりにくい（自動合成 vs 明示的合成）

**Current State:**
- Tree merging is **automatic** and reactive (App.tsx lines 75-80)
- `mergedTree` recalculates whenever `gameInputs` changes
- Only games with `isIncluded !== false` are merged (treeMerger.ts line 104)
- Users toggle checkboxes in KifuLibraryTable, but there's no visual feedback that merging occurred
- No explicit "Merge" button - users may expect to select games and click "合成"

**Issue:**
- Users don't know **when** merging happens or **which** games are currently merged
- Toggling checkboxes has no confirmation or progress indicator
- The text "局を統合中" (Integrating game records) appears but doesn't explain what's happening
- Users who want explicit control (select games → click merge) can't do that
- Empty state message "まだ取り込まれた棋譜はありません" appears even when games exist but `isIncluded` is false

**Recommendation:**
- **Add explicit merge controls**:
  - Add a "🔄 合成実行" (Merge) button in KifuLibraryTable header
  - Show progress indicator during merge (even if it's fast, provide feedback)
  - Display summary: "Merged X games into tree (Y nodes)"
- **Improve visual feedback**:
  - Show a badge in Study tab: "ツリー: X局統合中"
  - Highlight currently included games in the table
  - Add a tooltip explaining: "Check games to include in merged tree"
- **Consider mode switch**:
  - Option 1: Auto-merge (current default) - good for rapid iteration
  - Option 2: Manual merge - user selects games, clicks "Merge" button
  - Let users choose their preferred workflow

**Code Reference:**
- App.tsx lines 75-80 (automatic tree merge)
- App.tsx lines 222-230 (handleToggleInclude - no feedback)
- treeMerger.ts lines 100-244 (merge algorithm)
- KifuLibraryTable.tsx lines 242-248 (checkbox toggle)

---

### 1.5 同一局面の過去事例表示機能不足（プロ中継ライクな局面履歴）

**Context:**
In professional Shogi broadcasts, when a position is reached, commentators often show:
- "This position has appeared X times in the past"
- List of past games with this position (players, date, result)
- What moves were played in those past games
- Win/loss statistics for this position

**Current Implementation:**
- **Data exists**: `KifuTreeNode.gameRefs` array contains all games that reached this position (tree.ts lines 15-20)
  - Includes: gameId, title, date, winner
- **UI display**: Only shows aggregate statistics (gameCount, win/loss bar) in MultiBranchTreeExplorer (lines 65-104)
- **Missing**: No way to see the individual game references, no way to jump to those games

**Issue:**
- Users cannot see "This position appeared in 3 past games: [list]"
- Users cannot click to jump to those specific games to study the context
- The rich data in `gameRefs` is completely unused in the UI
- This is a key feature for repertoire study - knowing "this line led to wins in 60% of past games"

**Professional Broadcast Comparison:**
**What Pro Broadcasts Show:**
```
この局面は過去5局で出現
1. 2023-10-15 藤井聡太 vs 伊藤匠 (藤井勝)
2. 2022-11-20 羽生善治 vs 渡辺明 (羽生勝)
3. 2021-09-05 佐藤天彦 vs 豊島将之 (豊島勝)
...
```

**What joseki-tree Currently Shows:**
```
先手: 3勝 (60%)
後手: 2勝 (40%)
```
(Aggregate only, no individual game references)

---

## 🔧 Basic Design Specification

### Phase 1 - Game References Display in Tree Explorer

**UI Component Structure:**
Add expandable "Past Games" section in `MultiBranchTreeExplorer.tsx` below the statistics card.

**Component Props Extension:**
```typescript
export interface MultiBranchTreeExplorerProps {
  // ... existing props
  onJumpToGame?: (gameId: string, targetPly: number) => void;
  games?: IngestedGame[]; // Full game data for title/player lookup
}
```

**Implementation Detail:**
```tsx
{/* Past Game References Section */}
{activeNode.gameRefs && activeNode.gameRefs.length > 0 && (
  <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
    <button
      type="button"
      onClick={() => setIsGameRefsExpanded(!isGameRefsExpanded)}
      className="flex items-center justify-between w-full text-left"
    >
      <span className="text-xs font-semibold text-slate-400 flex items-center gap-2">
        <span>📜</span>
        <span>この局面は過去{activeNode.gameRefs.length}局で出現</span>
      </span>
      <span className="text-slate-500">{isGameRefsExpanded ? '▼' : '▶'}</span>
    </button>

    {isGameRefsExpanded && (
      <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
        {activeNode.gameRefs.map((ref) => {
          const game = games?.find((g) => g.id === ref.gameId);
          return (
            <div
              key={ref.gameId}
              className="p-2 rounded bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-200 truncate">
                  {ref.title}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {ref.date}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    ref.winner === 'b'
                      ? 'bg-amber-500/20 text-amber-300'
                      : ref.winner === 'w'
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'bg-slate-700 text-slate-400'
                  }`}
                >
                  {ref.winner === 'b' ? '▲先手勝' : ref.winner === 'w' ? '△後手勝' : '引き分け'}
                </span>
                <button
                  type="button"
                  onClick={() => onJumpToGame?.(ref.gameId, activeNode.move.ply)}
                  className="text-[10px] text-sky-400 hover:text-sky-300 font-medium"
                >
                  この局面へジャンプ →
                </button>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
)}
```

**Parent Component Changes (App.tsx):**
```typescript
// Add handler
const handleJumpToGame = (gameId: string, targetPly: number) => {
  setSelectedGameId(gameId);
  if (displayTree) {
    const path = findPathForGame(displayTree, gameId);
    if (path.length > 0) {
      setActivePath(path);
      setCurrentPly(Math.min(targetPly, path.length));
    }
  }
};

// Pass to MultiBranchTreeExplorer
<MultiBranchTreeExplorer
  // ... existing props
  onJumpToGame={handleJumpToGame}
  games={games}
/>
```

---

### Phase 2 - Next Move Statistics from Past Games

**Data Structure Extension:**
Extend `KifuTreeNode` to track next move statistics:
```typescript
export interface KifuTreeNode {
  // ... existing fields
  nextMoveStats?: {
    [sfenMove: string]: {
      count: number;
      wins: { sente: number; gote: number; draw: number };
    };
  };
}
```

**Tree Merger Update (treeMerger.ts):**
When merging games, accumulate next move statistics:
```typescript
// After line 176 in treeMerger.ts
// Accumulate next move statistics from this game
if (!targetNode.nextMoveStats) {
  targetNode.nextMoveStats = {};
}
// For each subsequent move in this game...
// (Implementation deferred to Phase 2)
```

**UI Display:**
Add "Next Moves in Past Games" section in MultiBranchTreeExplorer:
```tsx
{activeNode.nextMoveStats && Object.keys(activeNode.nextMoveStats).length > 0 && (
  <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
    <span className="text-xs font-semibold text-slate-400 block mb-2">
      過去のゲームでの次の手
    </span>
    <div className="space-y-1">
      {Object.entries(activeNode.nextMoveStats)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([sfenMove, stats]) => {
          const winRate = stats.count > 0
            ? ((stats.wins.sente / stats.count) * 100).toFixed(0)
            : 0;
          return (
            <div
              key={sfenMove}
              className="flex items-center justify-between text-xs p-1.5 rounded bg-slate-900/60"
            >
              <span className="font-mono text-slate-200">{sfenMove}</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">{stats.count}局</span>
                <span className={winRate >= 60 ? 'text-emerald-400' : winRate <= 40 ? 'text-rose-400' : 'text-slate-400'}>
                  {winRate}%勝率
                </span>
              </div>
            </div>
          );
        })}
    </div>
  </div>
)}
```

---

### Phase 3 - Position Novelty Detection

**Novelty Logic:**
A position is "novel" if:
- It appears in only 1 game in the user's collection
- OR it's the first position in the current game that diverges from the mainline

**UI Indicator:**
Add "Novelty" badge in tree explorer:
```tsx
{activeNode.gameCount === 1 && (
  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
    🔥 新手
  </span>
)}
```

**Alternative:**
Mark positions that are "first occurrence in user's collection":
```typescript
// Add to treeMerger
node.isFirstOccurrence = true; // If this is the first time this SFEN appears
```

---

### Phase 4 - Advanced Statistics (Future Enhancement)

**Position-Based Win Rate:**
- "When reaching this position, Sente wins X% of games overall"
- "Average game length from this position: Y moves"

**Implementation:**
Extend tree merger to track:
```typescript
export interface KifuTreeNode {
  // ... existing fields
  positionStats?: {
    totalGamesFromHere: number;
    averageRemainingMoves: number;
    senteWinRateFromHere: number;
  };
}
```

Calculate during merge by traversing all descendant nodes.

---

## 📊 Implementation Priority

**Immediate (Phase 1):**
- Add expandable game references list in MultiBranchTreeExplorer
- Implement `handleJumpToGame` in App.tsx
- Show game count, title, date, winner, jump button

**Short-term (Phase 2):**
- Add next move statistics tracking in treeMerger
- Display next move frequency and win rates in UI

**Medium-term (Phase 3):**
- Add novelty detection badges
- Highlight first-occurrence positions

**Long-term (Phase 4):**
- Add position-based win rate calculations
- Show average game length from position

---

## 🎯 UX Design Considerations

**Visual Hierarchy:**
1. Aggregate statistics (current display) - always visible
2. Game references list - expandable, collapsed by default
3. Next move statistics - separate section, below game refs
4. Novelty badge - inline with position info

**Performance:**
- If gameRefs > 20, show top 10 with "全て表示（{count}局）" button
- Lazy load game details when expanded
- Consider virtual scrolling for very large lists

**Accessibility:**
- Use `<details>` and `<summary>` for expandable sections (native keyboard support)
- Ensure jump buttons have proper focus states
- Color coding for win/loss should use icons + color (not color alone)

---

**Code Reference:**
- tree.ts lines 15-20 (gameRefs data structure)
- MultiBranchTreeExplorer.tsx lines 62-136 (currently only shows aggregate stats)
- treeMerger.ts lines 123-125 (gameRefs population)
- App.tsx (needs handleJumpToGame implementation)

---

### 1.7 AI対局振り返りでの最善手表示挙動の改善

**Current Behavior:**
- **During active match**: AI evaluates positions in real-time, best move is displayed
- **During review phase**: 
  - Positions with recorded evaluation from the match show the best move
  - Positions without recorded evaluation show "形勢未解析" (Unanalyzed)
  - User must click "最善手を見る" or "最善手を見る (カンニング)" button to trigger on-demand analysis
  - Best move visibility is controlled by `isBestMoveRevealed` state (SparringArenaPanel.tsx lines 64-65, 901-926)

**Issue:**
- In review phase, users have to manually click "reveal best move" for every position they want to analyze
- This is cumbersome when reviewing an entire match to study AI's recommendations
- The "cheating" connotation (カンニング) is inappropriate for post-match review
- No auto-analysis when navigating through moves in review mode

**User Expectation:**
- Review phase should show best move constantly by default
- When stepping through moves in review, automatically analyze each position
- No need to click "reveal" buttons in post-match context

**Recommendation:**

**Phase 1 - Auto-Reveal Best Move in Review Mode**
Modify `isBestMoveRevealed` to default to `true` when in review mode:
```typescript
// SparringArenaPanel.tsx
const isBestMoveRevealed = useMemo(() => {
  // Always reveal best move in review mode
  if (isReviewing) return true;
  // Use user preference for active match
  return false; // or user preference state
}, [isReviewing]);
```

Remove the "reveal/hide" toggle UI when in review mode (lines 901-926):
```tsx
{!isReviewing && (
  // Show reveal/hide button only during active match
  {isBestMoveRevealed ? (
    <button onClick={() => setIsBestMoveRevealed(false)}>
      {t('sparring.hide_best_move')}
    </button>
  ) : (
    <button onClick={() => setIsBestMoveRevealed(true)}>
      {t('sparring.reveal_best_move')}
    </button>
  )}
)}
```

**Phase 2 - Auto-Analyze on Review Navigation**
When user navigates to a new position in review mode, automatically trigger analysis:
```typescript
// SparringArenaPanel.tsx
useEffect(() => {
  if (isReviewing && displayPly > 0) {
    // Check if this position already has analysis
    const hasAnalysis = reviewAnalysisMap[displayPly] || 
                        sparring.moveHistory[displayPly - 1]?.evaluation;
    
    if (!hasAnalysis && !isAnalyzingReviewPosition) {
      // Auto-trigger analysis for this position
      handleAnalyzeReviewPosition();
    }
  }
}, [displayPly, isReviewing]);
```

**Phase 3 - Improve UI Labels for Review Context**
Change button labels based on context:
- Active match: "最善手を見る (カンニング)" - keep "cheating" connotation
- Review phase: "この局面を解析" - remove "cheating", make it neutral
- Or remove the button entirely in review mode and show analysis progress indicator

**Implementation Notes:**
- `handleAnalyzeReviewPosition` already exists (lines 207-242) - just needs auto-trigger
- Consider debouncing to avoid rapid-fire analysis when clicking through moves quickly
- Add progress indicator: "解析中..." when auto-analyzing
- Cache results in `reviewAnalysisMap` to avoid re-analyzing the same position

**Code Reference:**
- SparringArenaPanel.tsx lines 64-65 (isBestMoveRevealed state)
- SparringArenaPanel.tsx lines 901-926 (reveal/hide button UI)
- SparringArenaPanel.tsx lines 207-242 (handleAnalyzeReviewPosition)
- SparringArenaPanel.tsx lines 327-333 (evalScoreText - shows "形勢未解析" when no evaluation)

---

## 💡 Future Feature Ideas (User-Requested Priorities)

### High Priority (User Approved)

#### 1.8 苦手局面の自動検出と評価値急変局面のクイズ化
**Idea:**
- **Part A - User's Weakness Detection:**
  - Automatically detect positions where user frequently loses in sparring
  - Create targeted SRS drills for these positions
  - Show statistics: "You lost 5 times after △4二飛 in 角換わり"

- **Part B - Evaluation Fluctuation Quiz from Pro Games:**
  - Detect positions in pro games where evaluation score changes dramatically (e.g., from +200 to -200)
  - These are often critical turning points ("勝負所" or "激変点")
  - Create quizzes for "next 1-5 moves" after these positions
  - Help users understand how to handle critical mid/late-game positions
  - Example: "In this 角換わり game, evaluation dropped from +150 to -50 at move 45. What's the best response?"

**Implementation - Part A (User Weakness):**
- Analyze match history for divergence points leading to losses
- Identify "loss-prone positions" (e.g., positions after which win rate drops significantly)
- Store in Firestore as `lossPronePositions` collection
- Add "Weakness Drill" mode in SRS tab
- Focus on positions with high loss frequency

**Implementation - Part B (Evaluation Fluctuation):**
- Scan all ingested pro games for evaluation fluctuations
- Define threshold: evaluation change > 100cp (1 point) within 1-3 moves
- Flag these as "critical positions" (勝負所)
- For each critical position, create quiz:
  - Show the position on board
  - Ask: "What's the best next move? (1-5 moves ahead)"
  - User answers vs AI's actual recommendation
  - Show explanation: "The correct move maintains evaluation, while your move leads to collapse"
- Store these as separate quiz category: "Critical Position Quiz"
- Filter by game phase (opening, midgame, endgame) and opening type

**Data Structure Extension:**
```typescript
export interface CriticalPosition {
  id: string;
  gameId: string;
  ply: number;
  sfen: string;
  evaluationBefore: number; // cp before the fluctuation
  evaluationAfter: number;  // cp after the fluctuation
  evaluationChange: number;  // absolute change
  gamePhase: 'opening' | 'midgame' | 'endgame';
  bestNextMoves: ShogiMove[]; // AI-recommended next 1-5 moves
  isTurningPoint: boolean; // marked as decisive moment
}
```

**UI Integration:**
- Add "Critical Position Quiz" mode in SRS tab
- Separate from regular opening memorization
- Show context: "From [Game Title], move 45, evaluation dropped +150 → -50"
- Progress tracking: "You've mastered 12/50 critical positions in 角換わり"

**Value:**
- Learn from pro games' decisive moments
- Understand how to handle critical positions
- Beyond memorization: learn pattern recognition and strategic thinking
- Targeted training for mid/late-game (not just opening theory)

**Example Scenario:**
```
User imports 50 角換わり games
System detects 20 positions with evaluation > 100cp fluctuation
Quiz mode shows:
"From 2023-10-15 藤井聡太 vs 伊藤匠, move 42:
Evaluation dropped from +180 to -60
What's the best response?"
User learns: "△4二飛 is critical here; failing leads to collapse"
```

---

#### 1.13 投了図からのAI検証と検証済み分岐の合成
**Idea:**
- Professional games often resign before reaching absolute checkmate
- From the resignation position, use AI to verify: "Was it truly lost?"
- Perform deep analysis to see if alternative lines could have saved the game
- Generate "AI-verified branches" showing:
  - "Original resignation: move 82 (was lost)"
  - "AI analysis: From move 82, best defense leads to draw in 15 moves"
  - "Or: Even with best play, mate in 23 moves (lost anyway)"
- After verification, merge these AI-tested branches back into the repertoire tree

**User Value:**
- "Still playable?" verification: Satisfy curiosity about "could this have been saved?"
- Deep analysis of endgame positions
- Learn from AI's alternative defenses
- Expand repertoire with AI-verified variations that weren't played in the original game

**Implementation:**

**Phase 1 - Resignation Analysis Trigger:**
- Add "Analyze from Resignation" button in match history or tree explorer
- User selects a game and clicks at/near the resignation position
- Trigger deep analysis from that position

**Phase 2 - AI Verification Process:**
```typescript
export interface ResignationAnalysis {
  gameId: string;
  resignationPly: number;
  resignationSfen: string;
  originalResult: 'win' | 'loss' | 'draw';
  
  // AI verification results
  aiAnalysis: {
    depth: number;
    timeMs: number;
    bestLine: {
      moves: ShogiMove[];
      finalEvaluation: number;
      finalState: 'mate' | 'draw' | 'advantage' | 'lost';
      movesToMate?: number;
    };
    
    // Multiple best lines analysis
    alternativeLines: Array<{
      firstMove: ShogiMove;
      moves: ShogiMove[];
      finalEvaluation: number;
      finalState: string;
    }>;
  };
  
  // Human-readable summary
  summary: string; // e.g., "Even with best play, mate in 23 moves. Resignation was correct."
}
```

**Analysis Workflow:**
1. Start from resignation position SFEN
2. Run Fairy-Stockfish with deep search (e.g., depth 20-25, 5-10 seconds)
3. Analyze multiple candidate first moves:
   - Original move that was played
   - AI's top 3 alternative moves
4. For each line, play out to conclusion:
   - Mate search if evaluation > 1000cp
   - Depth-limited search if evaluation is moderate
5. Generate summary:
   - "Resignation was correct" (all lines lose)
   - "Could have drawn" (at least one line leads to draw)
   - "Could have won" (at least one line leads to win - rare but possible)

**Phase 3 - Merge Verified Branches:**
- Create new branches in the tree:
  - Original resignation line (existing)
  - AI-recommended defense line (new)
  - Alternative candidate lines (new)
- Mark these branches with metadata:
  - `isAiVerified: true`
  - `verificationDate: string`
  - `verificationResult: 'correct_resign' | 'could_draw' | 'could_win'`
- Add visual indicators in tree explorer:
  - Badge: "✓ AI検証済み" (AI Verified)
  - Color coding:
    - Green: "Could have saved" (draw or win)
    - Gray: "Resignation correct" (truly lost)
- Allow users to study these AI-verified lines in SRS drills

**UI Components:**

**1. Resignation Analysis Modal:**
```tsx
<ResignationAnalysisModal
  game={selectedGame}
  resignationPly={82}
  onAnalyze={handleResignationAnalysis}
  onMergeBranches={handleMergeVerifiedBranches}
/>
```

**2. Tree Explorer Integration:**
- Show verification status on nodes that end in resignation
- Button: "AI検証" next to resignation marker
- Expandable section showing AI-verified alternatives

**3. Verification Summary Display:**
```
局面: 82手目 △4二銀投了
AI検証結果:
- 元の手順: 投了（負け）
- AI推奨防御: △8二金 → △6二玉 → ...（23手で詰み）
- 別の手順1: △8四歩 → ...（15手で引き分け）
- 結論: 投了は妥当（全ての手順で負け）
```

**Technical Considerations:**

**Performance:**
- Deep analysis is computationally expensive (5-10 seconds per position)
- Should run in background with progress indicator
- Consider queuing multiple analyses
- Cache results to avoid re-analysis

**Data Storage:**
- Store `ResignationAnalysis` in Firestore
- Link to original game and tree node
- Large analysis results may need to be summarized to stay within document size limits

**User Experience:**
- Allow users to select analysis depth:
  - Quick: depth 15, 2 seconds
  - Standard: depth 20, 5 seconds
  - Deep: depth 25, 10 seconds
- Show progress: "Analyzing: checking line 3/5..."
- Allow users to cancel long-running analyses

**Example Use Case:**
```
User imports 2023 竜王戦 game between 藤井聡太 vs 佐藤天彦
Game resigned at move 95 (藤井's advantage)
User wonders: "Could 佐藤 have saved it?"
Clicks "AI検証 from 投了図"
AI analyzes for 8 seconds:
Results:
- Original line: 95手投了 → 藤井勝
- AI alternative 1: △8二金 → 17手で詰み（藤井勝）
- AI alternative 2: △9四歩 → 35手で引き分け
Summary: "引き分け可能な手順が1つ存在しました"
User merges "draw line" into tree
Studies this line in SRS drill
```

**Value:**
- Satisfy curiosity about "what if"
- Learn from AI's alternative defenses
- Expand repertoire with lines that weren't played but are viable
- Deep endgame study from real game positions
- Understand resignation correctness (sometimes players resign too early)

**Implementation Priority:**
- Phase 1: Basic resignation analysis (single line verification)
- Phase 2: Multi-line comparison (multiple candidate moves)
- Phase 3: Merge to tree and SRS integration
- Phase 4: Batch analysis (analyze all resignations in a game or collection)

---

---

#### 1.9 定跡習熟度ダッシュボード
**Idea:**
- Visualize mastery level for each opening (角換わり, 相掛かり, 矢倉, etc.)
- Show progress: "角換わり: 80% mastered (150 positions, 120 successful recalls)"
- Monthly learning progress trends
- Highlight weak openings

**Implementation:**
- Aggregate SRS card data by opening category
- Calculate mastery metric: (success rate × weighted depth) / total attempts
- Store learning history in Firestore
- Visualize with Chart.js (line chart for progress, bar chart for opening comparison)

**Value:**
- Motivation through visible progress
- Identify which openings need more study
- Track learning trajectory over time

---

#### 1.10 振り返りでの最善手自動表示
**Idea:**
- In review phase, always show best move by default
- Auto-analyze positions when navigating through moves
- Remove "reveal" button friction in post-match context

**Implementation:**
- Set `isBestMoveRevealed = true` when in review mode
- Auto-trigger `handleAnalyzeReviewPosition` on position change
- Cache results to avoid re-analysis
- Show progress indicator during auto-analysis

**Value:**
- Seamless review experience
- Faster study of AI recommendations
- Better understanding of position quality

---

#### 1.11 棋譜の差分表示・比較
**Idea:**
- Compare two KIF files side-by-side
- Visualize where they diverge
- Show old theory vs new theory evolution
- Highlight novelties and variations

**Implementation Considerations:**
- Diff algorithm for move sequences
- Visual layout (likely side-by-side boards or merged timeline)
- Handling of different game lengths
- Export diff as annotated KIF

**UI Challenges (TBD):**
- Layout design for complex diffs
- Handling multiple divergence points
- Mobile display considerations

**Value:**
- Understand opening evolution
- Identify novelties quickly
- Compare different lines of play

---

#### 1.12 メタデータ拡張とカスタムフォーマット
**Idea:**
- Extend KIF format or create custom metadata format for better information management
- Store tags, notes, difficulty ratings, quality scores
- Maintain compatibility with .kif export for external tools
- Custom import/export filters

**Implementation Approach:**
**Option A - Extended KIF with Custom Comments:**
- Store metadata in KIF comment sections with standardized prefixes
- Example: `#META:tag=attack,difficulty=hard,quality=9`
- External tools ignore unknown comments, maintaining compatibility

**Option B - JSON Wrapper with KIF Content:**
- Create custom format:
  ```json
  {
    "metadata": {
      "tags": ["attack", "流行"],
      "difficulty": "intermediate",
      "quality": 8,
      "notes": "藤井聡太がよく指す"
    },
    "kif": "#KIF version=2.0\n..."
  }
  ```
- Export as .jsonkif or similar
- Provide conversion tools to/from standard .kif

**Option C - Sidecar File Approach:**
- Keep standard .kif unchanged
- Create .kif.meta file with metadata
- Example: `my_game.kif` + `my_game.kif.meta`
- Tools that don't understand .meta just read .kif

**Tag Management Features:**
- Predefined tags: "攻撃的", "防御的", "新手", "流行", "古典", "奇襲"
- Custom user tags
- Tag filtering in tree explorer
- Tag-based statistics (e.g., "成功率: 攻撃的タグ 85%, 防御的タグ 72%")

**Value:**
- Better organization of repertoire
- Easy filtering for study purposes
- Maintain external tool compatibility
- Scalable metadata without breaking .kif format

---

### Technical Investigation: WebGPU vs WebAssembly for AI Engine

**Current Situation:**
- Fairy-Stockfish runs on WebAssembly (Wasm) with NNUE support
- Already optimized with WASM SIMD (10-20% performance improvement in recent versions)
- Uses CPU-based computation (appropriate for chess/Shogi engines)

**WebGPU Investigation Results:**

**What WebGPU Is Good For:**
- GPU-parallel compute (matrix multiplications, neural network inference)
- Deep learning model inference
- Graphics rendering

**What WebAssembly Is Good For:**
- CPU-bound computations
- General-purpose algorithms
- Near-native performance for logic-heavy tasks

**Chess/Shogi Engine Characteristics:**
- Stockfish and Fairy-Stockfish are CPU-based engines
- NNUE evaluation uses small neural networks (already optimized for CPU)
- Primary bottleneck is search algorithm, not neural network evaluation
- Lichess (chess.org) uses WebAssembly SIMD and achieves excellent performance

**Performance Comparison (from research):**
- WebAssembly SIMD: 10-20% faster than baseline Wasm
- WebGPU: Primarily benefits GPU workloads; minimal benefit for CPU-based search
- Hacker News discussion: "Stockfish runs perfectly in WASM" - no WebGPU need for chess engines

**Fairy-Stockfish Specifics:**
- Current version (1.1.12) already uses NNUE with WASM SIMD
- Benchmark data shows strong performance with current implementation
- No active WebGPU port in the fairy-stockfish.wasm repository

**Conclusion:**
**WebGPU migration is NOT recommended for Fairy-Stockfish because:**
1. Fairy-Stockfish is CPU-based; WebGPU provides minimal benefit
2. Current WASM SIMD implementation is already well-optimized
3. WebGPU port would require significant engineering effort with uncertain ROI
4. No community support or examples of WebGPU-based chess/Shogi engines
5. Browser support for WebGPU is still evolving (older browsers won't work)

**Alternative Performance Improvements:**
- Ensure WASM SIMD is enabled (already in current version)
- Use multi-threaded WebAssembly (Web Workers) - already implemented
- Optimize NNUE evaluation (already in Fairy-Stockfish)
- Consider engine parameter tuning for better time/depth balance

**Recommendation:**
- Keep current WebAssembly implementation
- Focus on UX improvements (better analysis triggers, caching, smart depth adjustment)
- Consider multiple engine instances for different use cases (fast analysis vs deep analysis)

---

### Deferred Ideas (Not Pursuing Now)

**ShogiDB Integration (External API):**
- Concerns about Terms of Service violations
- Scraping ethical and legal issues
- Potential copyright concerns with professional game records
- High maintenance burden if API changes

**AI-Generated Move Explanations (LLM Integration):**
- API cost considerations
- Quality control of generated explanations
- Potential for hallucinations or incorrect explanations
- Added complexity for marginal value

**Community Repository Sharing:**
- Copyright concerns with professional game records
- Privacy and data ownership issues
- Firebase Spark free tier limits
- Moderation and content management overhead

---

### 1.6 コンセプトの明確化: 棋譜集めが主体、暗記・対局は活用手段

**Core Concept (Confirmed):**
- **Primary Activity**: Collecting, organizing, and studying professional Shogi game records (KIF files)
- **Secondary Tools**: SRS memorization (for retention), AI sparring (for practice and discovering new branches)
- **Workflow**: Import pro games → Merge into tree → Study branches → Memorize (SRS) → Test via sparring → Merge new branches back to tree

**This Clarification Resolves the "Two Scenarios" Confusion:**
- The app is **not** trying to support two equal modes (Study vs Practice)
- Instead, it has a **clear hierarchy**: Tree/Repertoire is the core, SRS/Sparring are tools to work with that repertoire
- Match history and sparring are valuable for discovering new branches, but the primary entry point should still be the tree study workflow

**Adjusted Recommendations:**

**Instead of:**
- Mode selection (Study vs Practice)
- Goal-based navigation restructure
- AI-best line extraction as primary feature

**Focus On:**
1. **Strengthen the primary workflow** (Import → Merge → Study)
2. **Clarify the role of secondary tools** (SRS/Sparring as utilities for the tree)
3. **Improve feedback on how sparring feeds back into the tree**
4. **Make match history accessible from study context** (not isolated modal)

**Specific UX Improvements for This Concept:**

**A. Emphasize "Tree is Core" in UI:**
- Add visual hierarchy: Tree tab should feel like the "home" or "main workspace"
- SRS and Sparring tabs should be framed as "tools" or "modes" that operate on the current tree
- Add tree context to SRS/Sparring headers: "角換わりツリーで暗記中" (Memorizing Kakugawari tree)

**B. Integrate Sparring Feedback into Study Flow:**
- When a sparring match is merged, show a clear indicator in the tree explorer
- Add a "Recent Sparring Branches" section in MultiBranchTreeExplorer
- Make it easy to jump from merged branch back to study view
- Consider adding a "Sparring-Derived" badge on tree nodes that came from matches

**C. Match History Should Be Accessible from Study:**
- Instead of a separate modal accessible only from Sparring tab, add a "対局履歴" button in Study tab header
- Allow users to view match history without leaving the study context
- Make it clear that match history is "for discovering new branches to add to your tree"

**D. Clarify Onboarding for This Concept:**
- First-visit modal should explain: "1. Import pro games → 2. Study tree → 3. Memorize with SRS → 4. Test with sparring → 5. Merge discoveries back to tree"
- Emphasize that sparring is for "testing your repertoire and finding new lines to add"
- De-emphasize "start with sparring and build from scratch" as a primary workflow

**Code Reference:**
- App.tsx (tab structure - keep as-is, but add contextual labels)
- MultiBranchTreeExplorer.tsx (add sparring-derived branch indicators)
- MatchHistoryDashboard.tsx (make accessible from Study tab context)
- PostMatchFeedbackModal.tsx (already supports tree merge - good)

---

### 2. 研究画面から暗記・AI対局へのジャンプの視認性

**Current State:**
- Buttons exist in board header (lines 502-521 in App.tsx):
  - `🎯 暗記特訓 (X手目)` - green button
  - `⚔️ AI対局 (X手目)` - sky blue button
- Both buttons show current ply count and are functional

**Issue:**
- Buttons are small (text-xs) and placed in a crowded header with ply counter
- No visual hierarchy - they blend with other controls
- Users may not realize they can start from mid-game positions
- No tooltip or explanation of what "X手目" means in context

**Recommendation:**
- **Increase visual prominence** of these buttons:
  - Make them larger (text-sm instead of text-xs)
  - Add icons with better contrast
  - Consider placing them in a dedicated "Actions" panel below the board
- **Add onboarding tooltips**:
  - First time users see these buttons, show a tooltip: "Start memorization from this position"
  - Explain the difference between starting from initial vs mid-game
- **Add keyboard shortcuts** for power users (e.g., "M" for memorize, "S" for sparring)

**Code Reference:**
- App.tsx lines 502-521 (SRS/Sparring start buttons)
- SparringArenaPanel.tsx lines 88-98 (handles initialMoves correctly - good implementation)

---

### 3. 画面間のデザイン一貫性

**Current State:**
- **SparringArenaPanel** (lines 1-716): Excellent broadcast-style layout
  - Single-screen, no scrolling needed
  - Dark theme with dual-color win rate bar
  - Professional esports aesthetic
- **Study View (App.tsx tree tab)**: Traditional web layout
  - Vertical scrolling with multiple sections
  - Board + Chart + Tree Explorer in grid (lines 460-594)
  - KifuUploader/Library at bottom (lines 596-614)
- **SrsDrillPanel**: Mix of both styles
  - Has dashboard banner (lines 130-140)
  - Board section similar to Study (lines 342-369)

**Issue:**
- Users feel like they're switching between **different apps** when navigating tabs
- Sparring feels "premium" while Study feels "legacy"
- Inconsistent color schemes (amber/dark in Study vs sky/indigo in Sparring)
- No unified design language

**Recommendation:**
- **Unify the layout language** across all tabs:
  - Consider adapting the broadcast-style single-screen layout to Study mode
  - Move KifuUploader/Library into a modal or drawer (already implemented) to keep Study view clean
  - Use consistent color theming (e.g., amber for Sente, indigo for Gote across all screens)
- **Standardize component patterns**:
  - Board controls should look identical in all tabs
  - Komadai (piece stands) should use same styling
  - Navigation buttons should have consistent sizing and spacing

**Code Reference:**
- SparringArenaPanel.tsx lines 418-654 (excellent broadcast layout)
- App.tsx lines 460-614 (Study layout needs unification)
- SrsDrillPanel.tsx lines 142-369 (mixed styles)

---

### 4. オンボーディング・チュートリアルの欠如

**Current State:**
- No onboarding flow for new users
- No explanation of the 4-step cycle
- Sample KIFs exist (KifuUploader lines 20-92) but not prominently displayed
- Mock route exists (/mock) but not integrated into main flow

**Issue:**
- Users don't know:
  - "What is the purpose of this app?"
  - "In what order should I use these features?"
  - "How do I get started?"
- The app assumes prior knowledge of repertoire study tools

**Recommendation:**
- **Add a first-visit onboarding modal**:
  - Explain the 4-step cycle with diagrams
  - Show one-click "Load Sample Data" button
  - Provide a guided tour: "Let's import a KIF file → Merge → Start drill"
- **Add a "Help" or "Guide" button** in header:
  - Links to README or in-app documentation
  - Keyboard shortcuts reference
  - Feature explanations
- **Consider adding a "Tutorial Mode"**:
  - Walks through each feature with step-by-step prompts
  - Highlights buttons and explains their purpose

**Code Reference:**
- KifuUploader.tsx lines 20-92 (sample KIFs exist but hidden)
- MockPage.tsx (not integrated into main flow)
- App.tsx (no onboarding logic)

---

## 🛠️ Technical Quality Concerns

### 5. 型安全性・コード品質

**Assessment:** ✅ **Excellent**

**Strengths:**
- TypeScript strict mode properly configured (tsconfig.json)
- No `any` types found in reviewed code
- Domain types properly imported from `src/types/`
- i18n fully externalized - no hardcoded Japanese in source code
- Component props properly typed with interfaces

**Minor Observations:**
- Some utility functions could benefit from JSDoc comments for clarity
- Consider adding `eslint` with `@typescript-eslint` for additional type safety checks
- Test coverage appears minimal (only `vitest` in package.json, no test files found)

**Recommendation:**
- Add unit tests for critical business logic:
  - `kifParser.ts` - parsing edge cases
  - `treeMerger.ts` - merge logic correctness
  - `sm2Scheduler.ts` - SRS algorithm validation
- Consider adding integration tests for key user flows

**Code Reference:**
- All reviewed files follow TypeScript strict patterns
- package.json line 11 (test script exists but tests not implemented)

---

### 6. パフォーマンス・スケーラビリティ

**Assessment:** ⚠️ **Moderate Concerns**

**Current Implementation:**
- Fairy-Stockfish runs in Web Worker (good - non-blocking)
- Batch analysis processes positions sequentially (useBatchAnalysis.ts)
- Tree merging recalculates on every game input change (App.tsx lines 75-80)
- No visible pagination or virtualization for large datasets

**Potential Issues:**

1. **Tree Merge Performance** (App.tsx lines 75-80):
   - `mergedTree` recalculates on every `gameInputs` change
   - With 50+ games, this could become slow
   - No debouncing or memoization optimization

2. **Board History Calculation** (App.tsx lines 121-134):
   - `boardHistory` recalculates on every `activePath` or `activeMoves` change
   - For long games (100+ moves), this could be expensive
   - Consider incremental updates instead of full recalculation

3. **Firestore Limits** (from requirements.md):
   - Spark Free Tier: 20,000 writes/day, 50,000 reads/day
   - Current implementation doesn't show usage tracking
   - Risk of hitting limits with heavy SRS usage

**Recommendation:**
- **Add debouncing** to tree merge when multiple games are added rapidly
- **Implement virtualization** for large tree explorer lists
- **Add Firestore usage monitoring**:
  - Track read/write counts in analytics
  - Show warnings when approaching limits
  - Consider caching strategies for frequently accessed data
- **Optimize board history**:
  - Use incremental updates when stepping through moves
  - Cache board states at key plies

**Code Reference:**
- App.tsx lines 75-80 (tree merge memoization)
- App.tsx lines 121-134 (board history calculation)
- useBatchAnalysis.ts (sequential processing)

---

### 7. セキュリティ・Firebase設定

**Assessment:** ✅ **Good**

**Strengths:**
- Firebase Auth properly integrated (AuthContext.tsx)
- Firestore security rules exist (firestore.rules)
- No hardcoded secrets in code (uses .env.local)

**Observations:**
- firestore.rules file not reviewed in detail (should verify user-specific data isolation)
- No visible rate limiting on API calls
- Wasm engine runs client-side (good - no server costs)

**Recommendation:**
- Verify firestore.rules enforces:
  - Users can only read/write their own data
  - No cross-user data leakage
- Add error boundary for Firebase initialization failures
- Consider adding analytics (Firebase Analytics) to track usage patterns

**Code Reference:**
- AuthContext.tsx (auth implementation)
- firestore.rules (not reviewed in detail)
- .env.local (exists - good practice)

---

## 🚀 Future Development Concerns

### 8. モバイル最適化

**Current State:**
- Tailwind responsive classes used throughout
- SparringArenaPanel has mobile-specific komadai layout (lines 592-603, 638-649)
- Touch targets appear reasonable (buttons are not too small)

**Potential Issues:**
- Study tab requires significant scrolling on mobile (board + chart + tree + uploader)
- Tree explorer may be cramped on small screens
- Keyboard shortcuts don't work on mobile

**Recommendation:**
- **Implement collapsible sections** for mobile Study view:
  - Chart and Tree Explorer should be in tabs or accordions
  - Keep board always visible, other content toggleable
- **Add mobile-specific navigation**:
  - Bottom tab bar instead of top tabs
  - Larger touch targets for key actions
- **Test on actual mobile devices**:
  - Verify performance on mid-range phones
  - Check Wasm engine performance on mobile CPUs

**Code Reference:**
- SparringArenaPanel.tsx lines 592-649 (mobile komadai - good example)
- App.tsx (Study layout needs mobile optimization)

---

### 9. オフライン対応・PWA

**Current State:**
- Firebase Hosting configured (firebase.json)
- README mentions PWA support
- No visible service worker or manifest configuration

**Issue:**
- Users cannot use the app offline
- No cache strategy for Wasm engine files
- Firebase Auth requires network connection

**Recommendation:**
- **Implement full PWA**:
  - Add service worker for offline caching
  - Add web app manifest for installability
  - Cache Wasm engine files locally
- **Add offline mode detection**:
  - Show warning when offline
  - Disable features requiring network (Firestore sync)
  - Allow local-only study/memorization when offline

**Code Reference:**
- firebase.json (hosting config exists)
- No service worker or manifest found in src/

---

### 10. テスト戦略

**Current State:**
- Vitest configured in package.json
- No test files found in project
- No visible test utilities or fixtures

**Issue:**
- Critical business logic (parsing, merging, SRS) is untested
- Refactoring could introduce regressions
- No automated CI/CD tests

**Recommendation:**
- **Priority 1 - Unit tests for core logic**:
  - `kifParser.test.ts` - edge cases in KIF parsing
  - `treeMerger.test.ts` - merge correctness
  - `sm2Scheduler.test.ts` - SRS algorithm validation
  - `shogiRules.test.ts` - move validation
- **Priority 2 - Component tests**:
  - Board interaction tests
  - Navigation flow tests
- **Priority 3 - E2E tests**:
  - Key user flows (ingest → merge → drill → spar)
  - Use Playwright or Cypress

**Code Reference:**
- package.json line 11 (test script exists)
- No test files in src/ or tests/

---

## 📊 Prioritized Action Items

### High Priority (UX Impact)
1. **Improve KIF upload discovery** - Add empty state hero section, make modal more prominent
2. **Add explicit merge controls** - Merge button, progress indicator, merge summary display
3. **Enhance study-to-action buttons** - Increase visual prominence, add tooltips
4. **Integrate match history into study context** - Add "対局履歴" button in Study tab, not isolated modal
5. **Unify design language** - Adapt broadcast layout to Study mode, standardize components
6. **Add onboarding flow** - First-visit modal explaining core concept: Tree as primary, SRS/Sparring as tools

### Medium Priority (Technical)
5. **Optimize tree merge performance** - Add debouncing, incremental updates
6. **Add Firestore usage monitoring** - Track read/write counts, show warnings
7. **Implement mobile layout optimization** - Collapsible sections, bottom nav
8. **Add unit tests for core logic** - Parser, merger, SRS scheduler

### Low Priority (Future)
9. **Implement full PWA** - Service worker, offline mode
10. **Add E2E tests** - Playwright/Cypress for key flows

---

## 🎨 Design System Recommendations

### Color Theme Unification
Currently inconsistent across screens. Recommend standardizing:

- **Sente (Black)**: Amber/orange tones (current: amber-500/600)
- **Gote (White)**: Indigo/purple tones (current: indigo-500/600)
- **Neutral**: Slate-900/950 for backgrounds
- **Success**: Emerald-500
- **Error**: Rose-500
- **Warning**: Amber-500

### Component Patterns
Standardize across all tabs:
- **Board controls**: Same button sizes, spacing, icons
- **Komadai**: Same piece styling, gradients, dimensions
- **Navigation**: Consistent tab styling and active states
- **Modals**: Use consistent backdrop, border radius, shadows

### Navigation Structure
**Decision:** Keep current feature-based tabs (Tree / SRS / Sparring)

**Rationale:**
- Tree tab is the primary workspace (repertoire management)
- SRS tab is a tool for memorizing the current tree
- Sparring tab is a tool for testing the current tree and discovering new branches
- This hierarchy aligns with the core concept: **Tree is primary, SRS/Sparring are tools**

**Enhancements Needed:**
- Add contextual labels in SRS/Sparring headers to show which tree they're operating on
- Make it clear that these tabs "depend on" the tree (e.g., "No tree selected - import games first")
- Add back-navigation from SRS/Sparring to specific tree positions when possible

### Typography
- **Headings**: text-sm font-bold uppercase tracking-wider (already used consistently)
- **Body**: text-xs or text-sm depending on context
- **Monospace**: font-mono for ply counts, evaluations, moves

---

## 🔍 Code Quality Specific Observations

### Excellent Patterns
- ✅ Strict TypeScript with no `any` types
- ✅ i18n fully externalized (ja.json, en.json)
- ✅ Component props properly typed with interfaces
- ✅ Custom hooks for complex logic (useSrsDrill, useSparringMatch, useBatchAnalysis)
- ✅ Error boundaries implemented (ErrorBoundary.tsx)
- ✅ Web Worker for Wasm engine (non-blocking)

### Areas for Improvement
- ⚠️ Test coverage is minimal
- ⚠️ Some utility functions lack JSDoc comments
- ⚠️ No linting configuration visible (eslint)
- ⚠️ No analytics/usage tracking
- ⚠️ Performance optimizations needed for large datasets

---

## 📝 Conclusion

The **棋樹 (joseki-tree)** application demonstrates solid technical foundations with clean TypeScript code, proper i18n separation, and well-implemented individual features. The core functionality works correctly.

However, the **primary concern is UX/User Flow**. The application feels like a collection of powerful tools rather than a cohesive experience. Users may struggle to:
1. Understand how to start (棋譜追加 hidden at bottom)
2. Navigate between features (weak visual hierarchy)
3. Comprehend the 4-step learning cycle (no onboarding)

**Recommended Focus:**
1. **Short-term (1-2 weeks):** Improve 导线 for KIF upload and study-to-action buttons
2. **Medium-term (1 month):** Unify design language across all tabs, add onboarding
3. **Long-term (2-3 months):** Add tests, optimize performance, implement PWA

The technical foundation is strong. With focused UX improvements, this application can provide an excellent user experience for Shogi repertoire study.

---

**Review Complete.**
