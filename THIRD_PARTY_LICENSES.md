# Third-Party Licenses & Credits

**棋樹 (joseki-tree)** is licensed under the **GNU General Public License v3.0 (GPL-3.0)** (see [LICENSE](./LICENSE)).
It incorporates or uses the following third-party software, assets, and fonts.

---

## 1. Bundled Shogi Engine

### Fairy-Stockfish (`fairy-stockfish-nnue.wasm`)
- **License**: GNU General Public License v3.0 (`GPL-3.0`)
- **Author**: Fabian Fichter and Stockfish / Fairy-Stockfish contributors
- **Repository**: https://github.com/fairy-stockfish/fairy-stockfish.wasm
- **Bundled Distribution Files**:
  - `public/engine/stockfish.js`, `public/engine/stockfish.wasm`, `public/engine/stockfish.worker.js`
  - `public/engine/Copying.txt` (full GPL-3.0 license text)
  - `public/engine/AUTHORS` (upstream authors and contributors)

---

## 2. Board & Piece SVG Assets

### shogi-images
- **License**: CC0 1.0 Universal (Public Domain Dedication) — https://creativecommons.org/publicdomain/zero/1.0/
- **Source**: https://sunfish-shogi.github.io/shogi-images/
- **Used Assets**:
  - `public/assets/board.svg` (modified from `light_458x500.svg`)
  - `public/assets/piece_wood.svg` (from `piece.svg`)
  - `public/assets/piece_wood_2char.svg` (composite derivative combining boxwood grain with 2-kanji calligraphy paths from `shogi-images`)

---

## 3. Open Source Libraries

### Shogi & Engine Adapters (MIT License)
- **shogi.js** — Author: na2hiro (https://github.com/na2hiro/Shogi.js) — `MIT`
- **json-kifu-format** — Author: na2hiro (https://github.com/na2hiro/json-kifu-format) — `MIT`
- **@multi-game-engines/adapter-fairy-stockfish-shogi** — Author: hdkz-dev (https://github.com/hdkz-dev/multi-game-engines) — `MIT`

### Frontend & Tooling (MIT License)
- **React / React DOM** — Meta Platforms, Inc. — `MIT`
- **React Router (`react-router-dom`)** — Remix Software Inc. — `MIT`
- **Chart.js / react-chartjs-2** — Chart.js Contributors — `MIT`
- **i18next / react-i18next** — i18next Contributors — `MIT`
- **Tailwind CSS / Vite / TypeScript / Vitest** — Respective Authors — `MIT` / `Apache-2.0`

### Cloud Sync SDK (Apache License 2.0)
- **Firebase JS SDK (`firebase`)** — Google LLC (https://firebase.google.com/) — `Apache-2.0`

### Desktop Shell (Tauri — MIT / Apache-2.0)
- **Tauri (`tauri`, `tauri-build`)** — The Tauri Programme within The Commons Conservancy — `MIT OR Apache-2.0`
- **serde / serde_json** — Erick Tryzelaar & David Tolnay — `MIT OR Apache-2.0`
- **rfd** — PolyMeilex — `MIT OR Apache-2.0`

---

## 4. Fonts

- **Noto Serif JP** — Google Fonts — `SIL Open Font License 1.1` (loaded via Google Fonts stylesheet in `index.html`)

---

## 5. Optional User-Provided Files (Not Bundled)

The application supports loading external files chosen by the user at runtime (such as local USI engines, `.nnue` / `.bin` evaluation files, `.db` / `.sbk` opening books, custom board/piece SVGs, custom sound effects, or `.kif` / `.csa` / `.sfen` game and tsumego files). None of those optional external files are distributed with this application; users are responsible for complying with the licenses and terms of use of any files they choose to import.
