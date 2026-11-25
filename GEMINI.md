# 棋樹 (joseki-tree) - AI Assistant Context & Coding Rules

This file instructs AI coding assistants (including Antigravity, Cursor, and Windsurf) working within this workspace.

---

## 1. Project Context
- **Workspace**: `p:\Work\Private\Projects\joseki-tree` (formerly `KifuMerge`)
- **Application**: 棋樹 (joseki-tree) - Web-based multi-branch Shogi opening tree manager, SRS memorization drill, and Wasm AI sparring tool.
- **Stack**: React 18, Vite, TypeScript (strict), Tailwind CSS, Chart.js, Fairy-Stockfish (Wasm/NNUE in Web Worker), Firebase (Spark Plan: Hosting, Firestore, Google Auth).

---

## 2. Compulsory AI Coding Rules (Must Follow)

### Rule 1: No Hardcoded Japanese in Code
- Variable names, functions, files, and **code comments must be strictly in English**.
- **All UI strings must reside in `src/locales/ja.json`** (and `en.json`), accessed via `t('key')`.

### Rule 2: Strict TypeScript & Zero Hallucinated Properties
- Always refer to `docs/spec/data_models.md` for exact property names and interfaces.
- **NEVER invent properties or methods** on objects.
- Run `npm run type-check` (`tsc --noEmit`) before completing any task. Zero errors allowed.
- No `any` type allowed.

### Rule 3: Isolated UI Sandbox vs. Zero "Fake Implementation" in Production App
- **⭕ Allowed (Isolated UI/UX Sandbox Mocks)**:
  - Creating completely isolated prototypes (e.g., under `/mock` route or `src/mock/`) to compare UI/UX options, test visual ideas, or explore interactions is encouraged when needed.
- **❌ Strictly Forbidden (Fake / Stubbed Logic Inside the Production App)**:
  - **NEVER mix temporary mocks, hardcoded dummy datasets, static fake badges, or unimplemented no-op handlers inside the actual production application routes/components.**
  - Every UI element, number, badge, or button rendered in the main app MUST be 100% backed by real domain logic and real externalized data (via Repository / State / Storage) from the moment it appears in the main app.
  - Do not display placeholder UI in the production app for features scheduled in later Issues; add the UI and its real working logic together in that Issue.
- **Trunk-to-Branch (MVP Vertical Slice) Task Breakdown**:
  - Do NOT break tasks down bottom-up (building isolated parts that cannot be used end-to-end until the very end).
  - Always structure tasks so that **Phase 1 builds the minimal end-to-end "Trunk" (MVP flow from start to finish)** using externalized data, and subsequent Issues expand "Branches" (secondary features, adaptive logic, cloud sync) on top of the working trunk.

### Rule 4: GitHub Flow & Issue-Driven Development
- Every piece of work must be tied to an Issue (`feature/issue-<num>-<desc>`).
- Conventional commit messages (e.g., `feat: ... (#X)`).
- **Zero Push to Main & Mandatory Pull Request Creation via `gh pr create`**:
  - Never push directly to `main`.
  - Always create the Pull Request on GitHub using GitHub CLI:
    `gh pr create --base main --head <branch> --title "feat: ... (#X)" --body "..."`
  - Do not merely provide a URL link for the user to create it; execute the PR creation command to completion.
- **Strict Prohibition on AI Merging (User-Only Merging)**:
  - **AI MUST NEVER execute `git merge` or merge PRs into `main` on its own**.
  - Merging is strictly the USER's role after manual verification and behavior testing in the browser/app.
  - Once `gh pr create` is executed, the AI must report the created PR URL and wait for the user to verify and merge before proceeding to the next task/issue.

### Rule 5: Windows PowerShell Safety & `rtk` Output Filtering
- When running terminal commands on this Windows machine, always prefix:
  `powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; <command>"`
- **Mandatory `rtk` (Token Reduction / Output Filtering) Usage**:
  - `rtk` (`rtk-ai.rtk`) is installed globally (`C:\Users\kuni8\AppData\Local\Microsoft\WinGet\Links\rtk.exe`) and configured as a global Antigravity plugin (`~/.gemini/config/plugins/rtk`).
  - Always prefix noisy or verbose CLI commands (`git status`, `git diff`, `git log`, `npm`, `npx`, `tsc`, `vitest`, `gh`, directory listings, etc.) with `rtk` (or if `rtk` is not yet in the current process PATH, prepend `$env:Path += ';C:\Users\kuni8\AppData\Local\Microsoft\WinGet\Links'; rtk ...`).
  - Treat condensed `rtk` output as the complete result; do not re-run commands unless `rtk bypass <cmd>` is strictly needed for debugging.

### Rule 6: Token Economy & Circuit Breaker (Tokens & Budget Safety)
- **CLI Token Reduction via `rtk`**: Always leverage `rtk` when executing shell commands so build logs, diffs, and status checks remain ultra-compact.
- **Circuit Breaker on Errors**: If an error, build failure, or type diagnostic cannot be resolved within **1 retry**, **STOP immediately**. Never enter recursive self-healing loops that burn tokens. Summarize the blocker and present 2 concise options to the user for confirmation.
- **Micro-Step Implementation**: Implement one function, one type interface, or one sub-component at a time. Keep changes atomic so even lightweight/cost-effective models (Flash/Lite) can execute with 100% precision without context overflow.
- **Targeted Diff Edits**: Always modify targeted lines using diff replacement. Never re-emit entire large files unnecessarily.
- **Context Preservation**: Avoid dumping large logs or reading whole massive files into context. Inspect only relevant line ranges.

### Rule 7: Continuous Template Evolution & Shared Library Contribution (Git Isolated)
- **Template Sync Proposal**: If you discover a reusable workflow, architectural improvement, or development rule during development, proactively ask the user: *"Shall we update `../my-dev-kit/_template` with this new pattern?"*
- **Shared Library Harvesting**: When a clean, domain-agnostic component (UI, custom hook, Firebase wrapper, utility) is created, ask the user: *"This piece is generic and high quality. Shall we save a copy into `../my-dev-kit/_shared_library`?"*
- **Git Repository Isolation (Absolute Separation)**:
  - NEVER execute git operations (`add`, `commit`, `push`) against `my-dev-kit` while working on app features.
  - Changes to `my-dev-kit` must ONLY be committed and pushed as a separate, distinct action AFTER a feature/task is finished AND the user explicitly instructs or approves it.
- **Relative Path Adherence**: Always reference template and shared library paths using relative notation (`../my-dev-kit/_template`, `../my-dev-kit/_shared_library`) to remain drive-letter agnostic.

### Rule 8: Inbound Rule Sync on Resume (既存プロジェクト再開時の最新化)
- When starting or resuming work on this project, check if `../my-dev-kit/_template/GEMINI.md` contains newer rules or improvements not yet present here.
- If updates exist, proactively inform the user: *"Notice: `my-dev-kit` contains newer rules (e.g. Rule X). Would you like to sync them into this project?"*

### Rule 9: Project Portfolio Registration (ポートフォリオ台帳の自動更新)
- When requirements specification is finalized or when the app reaches key milestones (e.g., initial deployment, major release), ensure this project is properly registered and updated in `../my-dev-kit/PORTFOLIO.md`.

### Rule 10: Virtual & Cloud Drive Watcher Safety (pCloud / Network Drives)
- **Symptom (Infinite Reload Loop)**: When developing inside workspaces on virtual/cloud drives (e.g. pCloud `P:`, network mounts, exFAT), native OS file-change notifications can misfire constantly, causing Vite to trigger endless `(client) page reload` loops.
- **Mandatory Configuration in `vite.config.ts`**:
  Always enable polling in `server.watch`:
  ```typescript
  server: {
    watch: {
      usePolling: true,
      interval: 500,
    },
  }
  ```
- **`react-i18next` Suspense Guard**: Always set `react: { useSuspense: false }` in `i18n.ts` when using bundled JSON resources to prevent uncaught Suspense exceptions from triggering Vite full-reloads.

### Rule 11: Firebase Google Auth (`signInWithPopup`) Reliability on Both Production & Localhost
- **Symptom**: Google login popup opens, user selects account, popup hangs on processing and closes, returning the app to the unauthenticated state (especially on `localhost` while production works).
- **Mandatory Implementation Rules (Proven in `ScheduleBlockingTool`)**:
  1. **Empty Dependency Array for `onAuthStateChanged`**:
     - Register `onAuthStateChanged(auth, (currentUser) => setUser(currentUser))` inside a `useEffect(..., [])` with an **empty dependency array `[]`**.
     - **NEVER** include `userId` or store state in the `useEffect` dependency array that subscribes to `onAuthStateChanged` (updating `userId` on login will trigger cleanup/unsubscription mid-handshake and reset auth state).
     - Decouple Firestore initial data pull into a separate `useEffect(..., [user, isLoaded])`.
  2. **Direct Popup Invocation**:
     - Instantiate `new GoogleAuthProvider()` and call `await signInWithPopup(auth, provider)` directly inside the user click handler without awaiting any prior async work.
  3. **No Restrictive COOP Headers**:
     - Do NOT set `'Cross-Origin-Opener-Policy': 'same-origin'` in `vite.config.ts` or `firebase.json` (it severs `window.opener` communication between the popup and parent window).
  4. **Localhost Origin & Cloud Console Checklist**:
     - Access the local dev server strictly via `http://localhost:<port>` (not `127.0.0.1` or `192.168.x.x`).
     - If API Key HTTP referrer restrictions are enabled in Google Cloud Console, always include `http://localhost/*` and `http://localhost:*/*` alongside the production domain.
     - Reference `../my-dev-kit/_shared_library/firebase/README.md` and `googleAuthSync.ts` for the standard implementation pattern.

---

## 3. Specifications Index
- Requirements: `docs/spec/requirements.md`
- Features: `docs/spec/features.md`
- Data Models: `docs/spec/data_models.md`
- Game Evaluation & Insights: `docs/spec/game_evaluation.md`
- Remake Architecture (Generic Libraries Core): `docs/spec/library_comparison_and_migration.md`
- Board & Piece Assets Spec: `docs/spec/board_piece_assets.md`
- AI Personality & Custom Engine Spec: `docs/spec/ai_personality.md`
- Game Clock & Time Control Spec: `docs/spec/time_control.md`
- Kifu Management Enhancement (KifuRecord): `docs/spec/kifu_management_enhancement.md`
- Settings Screen: `docs/spec/settings_screen.md`
- Bulk Kifu Import: `docs/spec/bulk_kifu_import.md`
- Motivation Dashboard: `docs/spec/motivation_dashboard.md`
- Player Analysis (棋士図鑑): `docs/spec/player_analysis.md`
- Cloud Kifu Analysis Pipeline: `docs/spec/cloud_analysis_pipeline.md`
- Development Guidelines: `docs/guidelines/ai_coding_rules.md`
- Task Roadmap: `docs/tasks/task_breakdown.md`
