# 棋樹 (joseki-tree) - AI Coding & Development Guidelines (AI実装・開発規範)

All AI agents and contributors must strictly adhere to these guidelines. Violations will result in runtime errors, character corruption, or broken deployment pipelines.

---

## 1. TypeScript Strictness & Undefined Error Prevention (型安全性・4重ガードレール)

### 1.1 Strict Type Constraints
- **Zero `any` Policy**: The `any` type is strictly forbidden. Use explicit types, generics, or `unknown` with type guards.
- **`tsconfig.json` Compiler Settings**:
  - `strict: true`
  - `noImplicitAny: true`
  - `strictNullChecks: true`
  - `noUncheckedIndexedAccess: true`
- **Domain Type Adherence**:
  - Always import domain models from `src/types/` (defined in `docs/spec/data_models.md`).
  - **Never invent or guess property names** (e.g., guessing `node.branches` when the interface specifies `node.children`).

### 1.2 Compulsory Verification
- Before submitting any code change, always run:
  ```bash
  npm run type-check   # tsc --noEmit
  ```
- Any TypeScript diagnostic error must be resolved immediately before staging/committing.

---

## 2. Localization (i18n) & Language Integrity (言語処理・文字化け防止)

### 2.1 Code & Comments in English Only
- All function names, variable names, class names, file names, and **in-code comments must be written in English**.
- No Japanese characters or full-width characters inside `.ts` / `.tsx` source code logic files.

### 2.2 Externalized UI Text (Zero Hardcoded Japanese)
- **All user-facing UI text must be stored in `src/locales/ja.json`** (and `src/locales/en.json`).
- Reference UI text using the translation hook:
  ```tsx
  // BAD: Direct hardcoded Japanese in JSX
  <button>手番の選択</button>

  // GOOD: Sourced via i18n
  <button>{t('match.select_turn')}</button>
  ```
- **Rationale**: Completely prevents Windows/CLI encoding corruption (mojibake) and allows effortless text updates or multi-language support.

---

## 3. Mock-First Prototyping Workflow (モック先行開発フロー)

To prevent costly UI rework, follow this 3-step sequence for any new feature or visual adjustment:

```
[ Step 1: Mock Preview ]
Create/update mock components using mock data in `/src/mock/` or the `/mock` route.
Confirm layout, button sizes, mobile touch targets, and responsive behavior.
      ↓
[ Step 2: User Alignment & Approval ]
User reviews the mock on desktop and mobile. Iterations are made on layout and feel.
      ↓
[ Step 3: Production Integration ]
Promote mock components to production routes and hook them into Firestore & Wasm engine.
```

---

## 4. Git Flow & CI/CD Discipline (ソースコード管理・デプロイ)

### 4.1 Issue-Driven Development
- Every feature or bugfix originates from a GitHub Issue (e.g., `#3`).
- Branch naming convention: `feature/issue-<number>-<short-description>` (e.g., `feature/issue-3-board-viewer`).

### 4.2 Commit Messages
- Use Conventional Commits:
  - `feat: add selective hint panel with 5 independent clue buttons (#3)`
  - `fix: resolve move index offset on branch navigation (#4)`
  - `refactor: extract board orientation flip logic (#5)`

### 4.3 Pull Request & Deployment
1. AI pushes branch to GitHub and opens a Pull Request (`Closes #X`).
2. Run local verification (`npm run dev`) or inspect the Firebase PR preview channel.
3. User manually approves or instructs AI to merge.
4. Merge to `main` triggers GitHub Actions (`action-hosting-deploy`), which automatically builds and publishes the live site to Firebase Hosting.

---

## 5. Shell Execution on Windows
- When executing PowerShell terminal commands, always prefix with encoding safety:
  ```powershell
  powershell -NoProfile -Command "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; <command>"
  ```

---

## 6. Token Economy & Circuit Breaker (トークン節約・安全停止原則)

### 6.1 Circuit Breaker (The 1-Retry Rule)
- When confronting a build error, type mismatch, or unexpected runtime crash:
  - Attempt at most **1 automated fix**.
  - If the fix fails or reveals deeper ambiguities, **STOP immediately**.
  - Do NOT burn context in recursive trial-and-error loops.
  - Report: (1) Brief summary of the root cause, and (2) 2-3 actionable options for user direction.

### 6.2 Micro-Step Implementation (Low-Model Friendly)
- Deconstruct tasks so they can be implemented **one atomic unit at a time** (e.g., single function, single interface, single hook).
- Benefits:
  - Prevents model hallucinations.
  - Allows cost-effective, high-speed lightweight models (e.g., Gemini Flash / Lite) to execute with 100% precision.
  - Prevents truncation or context exhaustion during long generation turns.

### 6.3 Targeted Diff Editing
- Never rewrite or re-emit an entire 500-line file to change 5 lines.
- Always use surgical, targeted block replacements to preserve token bandwidth.

### 6.4 Context Budgeting
- Do not dump hundreds of lines of terminal output or whole directories into context.
- Grep or slice strictly relevant line ranges (e.g., `Get-Content ... -Head 30`).

---

## 7. Continuous Template Evolution & Shared Library Contribution (自己進化・共通資産還元)

### 7.1 Proactive Template Sync
- When a new best practice, configuration trick (e.g., specific Vite/Tailwind optimizations), or workflow rule is discovered during project execution:
  - Do not keep it isolated inside this project.
  - Proactively ask the user: *"Would you like to sync this improvement to `../my-dev-kit/_template` for future projects?"*

### 7.2 Component & Logic Harvesting (`_shared_library`)
- If a high-quality, reusable component or module is built:
  - UI components (Buttons, Modals, Toast notifications, Drawers).
  - Firebase helpers (Auth hooks, Firestore generic query wrappers).
  - Custom React hooks (useMediaQuery, useDebounce, useLocalStorage).
  - Pure utility functions (Formatting, validation, i18n keys).
- Proactively ask: *"This module is completely generic. Shall we register a clean version into `../my-dev-kit/_shared_library`?"*

### 7.3 Git Repository Isolation (No Mixed Commits)
- The app repository and the `my-dev-kit` repository are strictly separated.
- **Rule**: Never run git operations on `my-dev-kit` during an ongoing feature task. Only touch, commit, and push `my-dev-kit` as an independent step when explicitly requested or approved by the user.

### 7.4 Relative Path Principle
- Always reference `../my-dev-kit/_template` and `../my-dev-kit/_shared_library` via relative paths so workspaces remain portable across different drive letters, machines, and OS environments.

---

## 8. Inbound Rule Sync on Resume (既存プロジェクト再開時の最新化)
- When opening an existing app for maintenance or new features:
  - Check `../my-dev-kit/_template/GEMINI.md` to see if global rules have evolved.
  - If new rules (e.g. token optimization, security guidelines) were added since this project was started, proactively propose syncing them to keep this repository updated with the latest team standards.

---

## 9. Project Portfolio Registration (ポートフォリオ台帳の自動更新)
- Keep `../my-dev-kit/PORTFOLIO.md` synchronized:
  - On specification completion: Register the app name, tech stack, category, and planned scale.
  - On deployment: Update live URLs and operational status.


### Rule 10: Virtual & Cloud Drive Watcher Safety (pCloud / Network Drives)
- **Symptom (Infinite Reload Loop)**: When developing inside workspaces on virtual/cloud drives (e.g. pCloud `P:`, network mounts, exFAT), native OS file-change notifications can misfire constantly, causing Vite to trigger endless `(client) page reload` loops.
- **Mandatory Configuration in `vite.config.ts`**:
  Always enable polling in `server.watch`:
  `	ypescript
  server: {
    watch: {
      usePolling: true,
      interval: 500,
    },
  }
  `
- **`react-i18next` Suspense Guard**: Always set `react: { useSuspense: false }` in `i18n.ts` when using bundled JSON resources to prevent uncaught Suspense exceptions from triggering Vite full-reloads.