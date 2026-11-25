# Issue #31 Implementation Spec: Quiz pool management + generation dashboard

Branch: `feature/issue-31-quiz-pool-management`
Depends on: #30 (`TacticalQuizCard`, `QuizSourceGame`, `extractQuizCards`).
All code/comments in English (Rule 1). UI strings via `t()` in `ja.json` + `en.json`. No `any`.

## Verified existing names (do NOT invent others)
- `ShogiBoardView` props: `board: ShogiBoard, isFlipped: boolean, lastMove?, showLastMoveArrow?: boolean, hintArrow?: {from?: Square; to: Square}|null, className?`
- `ShogiBoard` (`src/utils/shogiBoard.ts`): `new ShogiBoard()`, `fromSfen(sfen)`, `applyMove(m)`, `clone()`, `toSfen()`, `getTurn()`, `getPly()`, `getHand(color)`
- `IngestedGame.isAnalyzed`, `IngestedGame.title`, `IngestedGame.openingId`
- `MatchRecord` (`moves`, `startSfen`, `openingId`, `id`), `loadMatchRecords()` in `src/utils/matchHistoryStorage.ts`
- `gameMergeInputToQuizSource` in `src/utils/quizSources.ts` (converts `GameMergeInput` to `QuizSourceGame`)
- `matchRecordToQuizSource` in `src/utils/quizSources.ts` (converts `MatchRecord` to `QuizSourceGame`)

## Core Flow & Design Changes
1. **Explicit Ingestion & Extraction (No Arbitrary Sample Games)**:
   - Quizzes are NOT auto-generated from synthetic/sample games.
   - User explicitly selects a game from their own imported KIF games or AI sparring matches via a dropdown selector.
   - Clicking "クイズを生成 (3〜5問)" extracts 3 to 5 key tactical turning points from the chosen game into the pool.
2. **Batch Analysis Integration**:
   - Games with unanalyzed evaluations trigger a prompt banner pointing to batch analysis modal.

## Component Specifications

### 1. `src/components/quiz/QuizPoolManager.tsx`
Props:
```ts
export interface QuizPoolManagerProps {
  cards: TacticalQuizCard[];
  gameTitles?: Record<string, string>; // gameId -> title
  openingNames?: Record<string, string>; // openingId -> display name
  availableGames?: Array<{ id: string; title: string; movesCount: number; isAnalyzed: boolean }>;
  unanalyzedGameCount?: number;
  onToggleCard: (id: string, enabled: boolean) => void;
  onBulkToggle: (ids: string[], enabled: boolean) => void;
  onRequestAnalysis: () => void; // opens batch analysis modal
  onRegenerate: () => void;
  onGenerateFromGame?: (gameId: string) => void;
  onStartPractice?: () => void;
  className?: string;
}
```

UI Sections:
1. **Header**: Title, active/total badge count, "クイズ演習を開始 (Start Practice)" CTA button, and global regenerate button.
2. **Explicit Extraction Section (`availableGames`)**:
   - Dropdown selector listing user's imported games and sparring records.
   - Action button: `[ 🎯 クイズを生成 (3〜5問) ]`.
3. **Unanalyzed Warning Banner**: Displayed when imported games lack engine evaluations.
4. **Filter Bar**:
   - Filter chips for Tactical Types (All, 🔥 攻めの好機, 🛡️ 絶対の受け, ⚖️ 攻防の決断, 👑 寄せ・詰み).
   - Dropdown filters for Openings and Games.
   - Toggle switch for "有効のみ表示 (Enabled only)".
5. **Card Grid**: Preview cards using `QuizPositionPreview` with turning point badge, ply number, and toggle switch.
6. **Bulk Operations Footer**: Enable all / Disable all currently filtered cards.

### 2. Localization Keys (`ja.json` & `en.json`)
- `quiz.pool.generate_from_game`: 棋譜からクイズを抽出 / Generate from game
- `quiz.pool.generate_from_game_desc`: 取り込んだ棋譜や実戦対局から、形勢が急変した重要局面を3〜5問抽出します / Extract 3-5 critical turning points from ingested games or sparring records
- `quiz.pool.select_game_placeholder`: 抽出元の棋譜を選択… / Select a source game...
- `quiz.pool.generate_btn`: クイズを生成 (3〜5問) / Generate Quizzes (3-5)
- `quiz.pool.generated_toast`: 「{{title}}」から {{count}} 問のクイズを生成しました / Generated {{count}} quizzes from "{{title}}"
