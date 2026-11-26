# 棋樹 (joseki-tree / kiju) - Release Roadmap (v1.1.0 - v1.5.0)

This roadmap organizes the enhancement Issues ([#9](https://github.com/nonamini/kiju/issues/9)–[#33](https://github.com/nonamini/kiju/issues/33)) into five incremental releases based on dependency order, implementation cost, and educational/user impact.

---

## v1.1.0: Daily Usability & "Think-First" Beginner Assist Phase 1

Focuses on immediate UX wins, pure board/UI logic enhancements, and encouraging self-study before relying on AI answers.

| Order | Issue | Status | Summary | Notes |
|---:|---|---|---|---|
| 1 | [#26](https://github.com/nonamini/kiju/issues/26) | Done | Studio 1-click Undo (`1手戻す`) & `Ctrl+Z` shortcut | Low-risk daily usability fix |
| 2 | [#16](https://github.com/nonamini/kiju/issues/16) | Done | Board & partial diagram PNG/SVG image export + KIF copy | Helps sharing on SNS, blogs, and print |
| 3 | [#29](https://github.com/nonamini/kiju/issues/29) | In Progress | Unified Studio mega-menu / mobile bottom sheet & customizable icon quick-access pins | Keeps header compact while preserving 1-click access |
| 4 | [#14](https://github.com/nonamini/kiju/issues/14) | Planned | BOD text diagram paste/import support | Streamlines importing positions from Japanese sites/SNS |
| 5 | [#20](https://github.com/nonamini/kiju/issues/20) | Planned | Material balance (`駒割`) & Jishogi point counter | Pure board state calculation |
| 6 | [#19](https://github.com/nonamini/kiju/issues/19) | Planned | Multi-layer piece reach, safety & hanging-piece overlay (`🔰 初心者アシスト`) | Includes hold-to-peek mode to train manual board sight |
| 7 | [#30](https://github.com/nonamini/kiju/issues/30) | Planned | "Think for Yourself" mode (AI blindfold -> reveal check) | Hides AI eval/candidates until user plays and checks |

### v1.1.0 Release Checklist
- [ ] Update in-app guide (`study` topic) for Beginner Assist, BOD import, and Think-First workflow
- [ ] Align version in `package.json` and `src-tauri/tauri.conf.json` to `1.1.0`
- [ ] Tag `v1.1.0` & publish GitHub Release notes + Windows installer

---

## v1.2.0: Kifu Library Management & Search

Builds hierarchical management on top of #9 and connects folder/tag filtering directly to study and training.

| Order | Issue | Status | Summary | Notes |
|---:|---|---|---|---|
| 1 | [#9](https://github.com/nonamini/kiju/issues/9) | Planned | Virtual folder tree & folder hierarchy preservation on bulk import | Foundation for hierarchical library management |
| 2 | [#11](https://github.com/nonamini/kiju/issues/11) | Planned | Bulk edit enhancements (move folder, normalize player/tournament names) | Follows directly after #9 |
| 3 | [#12](https://github.com/nonamini/kiju/issues/12) | Planned | Bulk KIF/CSA ZIP export by folder or filter | Preserves virtual folder hierarchy on export |
| 4 | [#10](https://github.com/nonamini/kiju/issues/10) | Planned | Position (SFEN) reverse lookup across Kifu Library | Finds matching games including transpositions |
| 5 | [#15](https://github.com/nonamini/kiju/issues/15) | Planned | Folder/tag filtering for quizzes and SRS review | Connects #9 folders to daily training |

### v1.2.0 Release Checklist
- [ ] Update in-app guide (`library`, `import`, `training`) and `public/about/index.html`
- [ ] Bump version to `1.2.0`, tag, and publish Release notes

---

## v1.3.0: AI Assist, Structured Review & Sparring Personalization

Unifies turn-flipped engine checks (#21, #23), structured post-game review (#31), and MultiPV candidate selection (#24, #25).

| Order | Issue | Status | Summary | Notes |
|---:|---|---|---|---|
| 1 | [#21](https://github.com/nonamini/kiju/issues/21) | Planned | Opponent threat / attack plan inference & arrow overlay | Defaults to review / answer-check mode to prevent AI over-reliance |
| 2 | [#23](https://github.com/nonamini/kiju/issues/23) | Planned | Self-king threat/brinkmate warning & spoiler-free opponent mate notice | Extends #21 turn-flipped search |
| 3 | [#22](https://github.com/nonamini/kiju/issues/22) | Planned | Blunder refutation warning (`こう咎められる`) & step-by-step hints | Review / on-demand check rather than automatic interruption |
| 4 | [#31](https://github.com/nonamini/kiju/issues/31) | Planned | Intermediate "5-minute Post-Game Review Guide" & skill-level AI guide | Top-3 turning points -> verbalize -> AI PV check -> quiz/joseki |
| 5 | [#24](https://github.com/nonamini/kiju/issues/24) | Planned | AI sparring level tuning, playstyle personalities, & side-aware joseki assignment | Engine-agnostic MultiPV + safe-guard opening book |
| 6 | [#25](https://github.com/nonamini/kiju/issues/25) | Planned | Studio AI auto-reply mode for practical joseki & variation building | Reuses #24 MultiPV & personality engine layer |

### v1.3.0 Release Checklist
- [ ] Update in-app guide (`study`, `training`) and `public/about/index.html`
- [ ] Bump version to `1.3.0`, tag, and publish Release notes

---

## v1.4.0: Tactics Notes, QR Handover & Community Pack Sharing

Completes the content creation, face-to-face handover, and community sharing ecosystem.

| Order | Issue | Status | Summary | Notes |
|---:|---|---|---|---|
| 1 | [#32](https://github.com/nonamini/kiju/issues/32) | Planned | Serverless QR / share link kifu handover (1-device match support) | Instant library import for over-the-board games |
| 2 | [#18](https://github.com/nonamini/kiju/issues/18) | Planned | Tactics note hierarchy & automatic linking to matching library games | Reuses #10 SFEN reverse lookup |
| 3 | [#17](https://github.com/nonamini/kiju/issues/17) | Planned | Partial diagram snippets / reusable templates | Speeds up authoring notes and problems |
| 4 | [#13](https://github.com/nonamini/kiju/issues/13) | Planned | Quiz & Tsumego pack management with export/import sharing | Community distribution alongside tactics notes |

### v1.4.0 Release Checklist
- [ ] Update in-app guide (`tactics`, `training`) and `public/about/index.html`
- [ ] Bump version to `1.4.0`, tag, and publish Release notes

---

## v1.5.0: Serverless P2P Two-Device Match

Adds direct WebRTC peer-to-peer matches without any matchmaker/lobby server.

| Order | Issue | Status | Summary | Notes |
|---:|---|---|---|---|
| 1 | [#33](https://github.com/nonamini/kiju/issues/33) | Planned | Serverless P2P 2-device match (WebRTC DataChannel & auto-save to both libraries) | Uses invite/answer code or QR exchange; works on GitHub Pages |

### v1.5.0 Release Checklist
- [ ] Update in-app guide (`training`) and `public/about/index.html`
- [ ] Bump version to `1.5.0`, tag, and publish Release notes
