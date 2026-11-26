# 棋樹 (joseki-tree / kiju) - Release Roadmap (v1.1.0 - v1.4.0)

This roadmap organizes the enhancement Issues ([#9](https://github.com/nonamini/kiju/issues/9)–[#26](https://github.com/nonamini/kiju/issues/26)) into four incremental releases based on dependency order, implementation cost, and user impact.

---

## v1.1.0: Daily Usability & Beginner Assist Phase 1

Focuses on immediate UX wins and pure board/UI logic enhancements with high visibility.

| Order | Issue | Summary | Notes |
|---:|---|---|---|
| 1 | [#26](https://github.com/nonamini/kiju/issues/26) | Studio 1-click Undo (`1手戻す`) & `Ctrl+Z` shortcut | Low-risk daily usability fix |
| 2 | [#16](https://github.com/nonamini/kiju/issues/16) | Board & partial diagram PNG/SVG image export | Helps sharing on SNS, blogs, and print |
| 3 | [#14](https://github.com/nonamini/kiju/issues/14) | BOD text diagram paste/import support | Streamlines importing positions from Japanese sites/SNS |
| 4 | [#20](https://github.com/nonamini/kiju/issues/20) | Material balance (`駒割`) & Jishogi point counter | Pure board state calculation |
| 5 | [#19](https://github.com/nonamini/kiju/issues/19) | Multi-layer piece reach, safety & hanging-piece overlay (`🔰 初心者アシスト`) | Sliding rays, attack/defense counts, safe drops, free captures |

### v1.1.0 Release Checklist
- [ ] Update in-app guide (`study` topic) for Beginner Assist & BOD import
- [ ] Align version in `package.json` and `src-tauri/tauri.conf.json` to `1.1.0`
- [ ] Tag `v1.1.0` & publish GitHub Release notes + Windows installer

---

## v1.2.0: Kifu Library Management & Search

Builds hierarchical management on top of #9 and connects folder/tag filtering directly to study and training.

| Order | Issue | Summary | Notes |
|---:|---|---|---|
| 1 | [#9](https://github.com/nonamini/kiju/issues/9) | Virtual folder tree & folder hierarchy preservation on bulk import | Foundation for hierarchical library management |
| 2 | [#11](https://github.com/nonamini/kiju/issues/11) | Bulk edit enhancements (move folder, normalize player/tournament names) | Follows directly after #9 |
| 3 | [#12](https://github.com/nonamini/kiju/issues/12) | Bulk KIF/CSA ZIP export by folder or filter | Preserves virtual folder hierarchy on export |
| 4 | [#10](https://github.com/nonamini/kiju/issues/10) | Position (SFEN) reverse lookup across Kifu Library | Finds matching games including transpositions |
| 5 | [#15](https://github.com/nonamini/kiju/issues/15) | Folder/tag filtering for quizzes and SRS review | Connects #9 folders to daily training |

### v1.2.0 Release Checklist
- [ ] Update in-app guide (`library`, `import`, `training`) and `public/about/index.html`
- [ ] Bump version to `1.2.0`, tag, and publish Release notes

---

## v1.3.0: AI Assist & Sparring Personalization

Unifies turn-flipped engine checks (#21, #23) and MultiPV candidate selection (#24, #25).

| Order | Issue | Summary | Notes |
|---:|---|---|---|
| 1 | [#21](https://github.com/nonamini/kiju/issues/21) | Opponent threat / attack plan inference & arrow overlay | Establishes turn-flipped light search helper |
| 2 | [#23](https://github.com/nonamini/kiju/issues/23) | Self-king threat/brinkmate warning & spoiler-free opponent mate notice | Extends #21 turn-flipped search |
| 3 | [#22](https://github.com/nonamini/kiju/issues/22) | Blunder refutation warning (`こう咎められる`) & step-by-step hints | Completes Beginner Assist suite |
| 4 | [#24](https://github.com/nonamini/kiju/issues/24) | AI sparring level tuning, playstyle personalities, & side-aware joseki assignment | Engine-agnostic MultiPV + safe-guard opening book |
| 5 | [#25](https://github.com/nonamini/kiju/issues/25) | Studio AI auto-reply mode for practical joseki & variation building | Reuses #24 MultiPV & personality engine layer |

### v1.3.0 Release Checklist
- [ ] Update in-app guide (`study`, `training`) and `public/about/index.html`
- [ ] Bump version to `1.3.0`, tag, and publish Release notes

---

## v1.4.0: Tactics Notes & Community Pack Sharing

Completes the content creation, organization, and sharing ecosystem.

| Order | Issue | Summary | Notes |
|---:|---|---|---|
| 1 | [#18](https://github.com/nonamini/kiju/issues/18) | Tactics note hierarchy & automatic linking to matching library games | Reuses #10 SFEN reverse lookup |
| 2 | [#17](https://github.com/nonamini/kiju/issues/17) | Partial diagram snippets / reusable templates | Speeds up authoring notes and problems |
| 3 | [#13](https://github.com/nonamini/kiju/issues/13) | Quiz & Tsumego pack management with export/import sharing | Community distribution alongside tactics notes |

### v1.4.0 Release Checklist
- [ ] Update in-app guide (`tactics`, `training`) and `public/about/index.html`
- [ ] Bump version to `1.4.0`, tag, and publish Release notes
