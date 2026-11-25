/**
 * Minimal USI engine client for the cloud analysis worker (#60).
 * Spawns the engine binary, performs the usi/isready handshake, then
 * answers `position sfen` + `go nodes` queries one at a time, parsing
 * the last `info` line and the terminating `bestmove`.
 * Plain Node.js ESM — no React / TypeScript imports (worker self-contained).
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

const USI_MOVE_PATTERN = /^(?:[1-9][1-9a-i][1-9][1-9a-i][+]?|[A-Z]\*[1-9][a-i]|resign|win|null)$/;
// PV tokens look like "7g7f", "P*5e", "2g2f+" — same alphabet as bestmove.
const PV_TOKEN_PATTERN = /[1-9][1-9a-i][1-9][1-9a-i][+]?|[A-Z]\*[1-9][a-i]/g;

export class UsiEngine {
  #proc = null;
  #buffer = '';
  #waiters = [];
  #closing = false;
  #lastInfo = null;
  #multiPvInfos = new Map();
  #ready = false;

  constructor(enginePath) {
    this.enginePath = enginePath;
  }

  #emitLine(line) {
    const waiter = this.#waiters[0];
    if (waiter && waiter.predicate(line)) {
      this.#waiters.shift();
      waiter.resolve(line);
      return true;
    }
    return false;
  }

  #waitFor(predicate, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.#waiters.findIndex((w) => w.resolve === resolve);
        if (idx >= 0) this.#waiters.splice(idx, 1);
        reject(new Error('USI response timeout'));
      }, timeoutMs);
      this.#waiters.push({
        predicate,
        resolve: (line) => {
          clearTimeout(timer);
          resolve(line);
        },
      });
    });
  }

  #send(command) {
    if (!this.#proc || this.#proc.killed) {
      throw new Error('Engine process is not running');
    }
    this.#proc.stdin.write(`${command}\n`);
  }

  async start(evalDir) {
    this.#proc = spawn(this.enginePath, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    this.#proc.stdout.setEncoding('utf8');
    this.#proc.stdout.on('data', (chunk) => {
      this.#buffer += chunk;
      let idx;
      while ((idx = this.#buffer.indexOf('\n')) >= 0) {
        const line = this.#buffer.slice(0, idx).trim();
        this.#buffer = this.#buffer.slice(idx + 1);
        if (line) {
          if (!this.#ready) {
            console.log(`[usi:init] ${line}`);
          }
          // Keep the most recent info line carrying a score for the in-flight search;
          // ignore non-score info lines (e.g. `info string` / `info nodes`).
          if (line.startsWith('info ') && /\bscore (cp|mate)\b/.test(line)) {
            this.#lastInfo = line;
            const mpMatch = line.match(/\bmultipv (\d+)/);
            const mpRank = mpMatch ? parseInt(mpMatch[1], 10) : 1;
            this.#multiPvInfos.set(mpRank, line);
          }
          this.#emitLine(line);
        }
      }
    });
    this.#proc.on('exit', (code) => {
      if (!this.#closing) {
        console.error(`[usi] engine exited unexpectedly with code ${code}`);
      }
      for (const w of this.#waiters.splice(0)) {
        w.resolve('__ENGINE_EXITED__');
      }
    });

    // usi handshake
    this.#send('usi');
    const usiok = await this.#waitFor((l) => l === 'usiok', 30000);
    if (usiok === '__ENGINE_EXITED__') throw new Error('Engine exited during usi handshake');

    if (evalDir) {
      const resolvedEvalDir = path.resolve(evalDir);
      this.#send(`setoption name EvalDir value ${resolvedEvalDir}`);
    }
    this.#send('isready');
    const ready = await this.#waitFor((l) => l === 'readyok', 300000);
    if (ready === '__ENGINE_EXITED__') throw new Error('Engine exited during isready');
    this.#ready = true;
    this.#send('usinewgame');
  }

  /**
   * Analyzes one position. Returns the parsed bestmove plus the last USI
   * info line (depth/score/pv), or null when the engine cannot produce a
   * bestmove (e.g. checkmate/stalemate positions).
   */
  async analyze(sfen, nodes) {
    const bestmovePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('bestmove timeout')), 300000);
      this.#waiters.unshift({
        predicate: (line) => line.startsWith('bestmove'),
        resolve: (line) => {
          clearTimeout(timer);
          resolve(line);
        },
      });
    });

    this.#multiPvInfos.clear();
    this.#send(`position sfen ${sfen}`);
    this.#send(`go nodes ${nodes}`);

    const bestmoveLine = await bestmovePromise;
    const bestmove = bestmoveLine.split(/\s+/)[1] ?? '';
    const info = this.#lastInfo ?? null;
    const multiPvLines = Array.from(this.#multiPvInfos.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, line]) => line);
    this.#lastInfo = null;
    this.#multiPvInfos.clear();

    if (bestmove === '__ENGINE_EXITED__' || !bestmove) return null;
    return { bestMove: bestmove, info, multiPvLines };
  }

  /**
   * Analyzes one position with MultiPV enabled (for tactical quiz choices).
   */
  async analyzeMultiPv(sfen, nodes, multiPv = 3) {
    this.#send(`setoption name MultiPV value ${multiPv}`);
    try {
      return await this.analyze(sfen, nodes);
    } finally {
      this.#send('setoption name MultiPV value 1');
    }
  }

  async stop() {
    this.#closing = true;
    try {
      this.#send('quit');
    } catch {
      // already dead
    }
    if (this.#proc && !this.#proc.killed) {
      this.#proc.kill('SIGTERM');
      setTimeout(() => {
        try {
          this.#proc?.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 3000).unref();
    }
  }
}
