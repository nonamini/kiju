/**
 * Tsumego Problem Importer (SFEN & KIF).
 * Supports massive SFEN files (e.g. YaneuraOu 3/5/7/9/11-move datasets) via
 * bounded sampling so the UI stays responsive and localStorage is not exhausted.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { TsumegoProblem } from '../types/tsumego';
import { parseKif } from './kifParser';

export interface TsumegoImportOptions {
  moveLimit?: number;
  maxProblems?: number;
  tag?: string;
  excludeSfenHashes?: ReadonlySet<string>;
}

/**
 * Computes a compact 16-char hex hash of the board, side-to-move, and hands
 * parts of a SFEN string (ignoring the trailing move-number counter).
 */
export function hashTsumegoSfen(startSfen: string): string {
  const normalized = startSfen.trim().split(/\s+/).slice(0, 3).join(' ');
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + ((i + 1) << 3);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Returns true if the problem originated from SFEN dataset import.
 */
export function isSfenImportedTsumego(problem: TsumegoProblem): boolean {
  return (
    problem.id.startsWith('import-sfen-') ||
    problem.source === 'tanuki-import' ||
    problem.tags.includes('SFENインポート')
  );
}

/**
 * Resolves the source filename stem for an imported SFEN tsumego problem,
 * falling back to parsing legacy generated titles (`<name> #<num> (<ply>手詰)`).
 */
export function getImportedTsumegoSourceName(problem: TsumegoProblem): string | null {
  if (problem.importSourceName && problem.importSourceName.trim().length > 0) {
    return problem.importSourceName.trim();
  }
  const titleMatch = problem.title?.match(/^(.+?)\s+#\d+\s+\(\d+手詰\)$/);
  if (titleMatch && titleMatch[1] && titleMatch[1].trim().length > 0) {
    return titleMatch[1].trim();
  }
  return null;
}

/**
 * Determines whether an existing problem should be replaced when re-importing
 * SFEN problems with "replace previous imports" enabled.
 * Strictly limits replacement to SFEN-imported problems matching the incoming file(s).
 */
export function shouldReplaceImportedTsumego(
  existing: TsumegoProblem,
  importedBatch: TsumegoProblem[]
): boolean {
  if (!isSfenImportedTsumego(existing) || importedBatch.length === 0) {
    return false;
  }

  const targetSourceNames = new Set(
    importedBatch
      .map(getImportedTsumegoSourceName)
      .filter((name): name is string => Boolean(name))
  );
  const existingSource = getImportedTsumegoSourceName(existing);
  if (existingSource !== null) {
    return targetSourceNames.has(existingSource);
  }

  const targetMoveLimits = new Set(importedBatch.map((p) => p.moveLimit));
  return targetMoveLimits.has(existing.moveLimit);
}

/**
 * Infer move limit (1, 3, 5, 7, 9, 11...) from filename if not explicitly specified.
 */
export function inferMoveLimitFromFilename(filename: string): number {
  const m = filename.match(/(\d+)\s*(?:手|te|ply|moves?)/i);
  if (m && m[1]) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 99) return n;
  }
  return 3;
}

/**
 * Parse a single SFEN line into { startSfen, solutionPv }.
 * Handles both raw SFEN (`<board> <turn> <hand> <ply>`) and `sfen <board> ... [moves ...]`.
 */
export function parseSfenProblemLine(
  rawLine: string
): { startSfen: string; solutionPv: string[] } | null {
  const line = rawLine.trim();
  if (!line || line.startsWith('#') || line.startsWith('//')) return null;

  let body = line.startsWith('sfen ') ? line.slice(5).trim() : line;
  let solutionPv: string[] = [];

  const movesIdx = body.indexOf(' moves ');
  if (movesIdx !== -1) {
    const movesPart = body.slice(movesIdx + 7).trim();
    body = body.slice(0, movesIdx).trim();
    solutionPv = movesPart.split(/\s+/).filter(Boolean);
  }

  const parts = body.split(/\s+/);
  if (parts.length < 3) return null;
  if (!parts[0]?.includes('/') || (parts[1] !== 'b' && parts[1] !== 'w')) return null;

  const startSfen =
    parts.length >= 4 ? `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}` : `${parts[0]} ${parts[1]} ${parts[2]} 1`;

  return { startSfen, solutionPv };
}

/**
 * Import tsumego problems from a `.sfen` or `.txt` file using streaming + reservoir sampling.
 */
export async function importSfenTsumegoFile(
  file: File,
  options: TsumegoImportOptions = {}
): Promise<TsumegoProblem[]> {
  const moveLimit = options.moveLimit ?? inferMoveLimitFromFilename(file.name);
  const maxProblems = options.maxProblems ?? 50;
  const tag = options.tag ?? `${moveLimit}手詰`;
  const excludeHashes = options.excludeSfenHashes;

  const sampled: { startSfen: string; solutionPv: string[]; lineNo: number }[] = [];
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let leftover = '';
  let validCount = 0;

  const considerLine = (rawLine: string) => {
    const parsed = parseSfenProblemLine(rawLine);
    if (!parsed) return;
    if (excludeHashes && excludeHashes.has(hashTsumegoSfen(parsed.startSfen))) {
      return;
    }
    validCount += 1;
    if (sampled.length < maxProblems) {
      sampled.push({ ...parsed, lineNo: validCount });
    } else {
      // Reservoir sampling for uniform distribution across massive files
      const j = Math.floor(Math.random() * validCount);
      if (j < maxProblems) {
        sampled[j] = { ...parsed, lineNo: validCount };
      }
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = leftover + value;
    const lines = chunk.split(/\r?\n/);
    leftover = lines.pop() ?? '';

    for (const line of lines) {
      considerLine(line);
    }
  }

  if (leftover.trim()) {
    considerLine(leftover);
  }

  const now = Date.now();
  const baseName = file.name.replace(/\.[^.]+$/, '');
  return sampled.map((item, idx) => ({
    id: `import-sfen-${now}-${idx}`,
    title: `${baseName} #${item.lineNo} (${moveLimit}手詰)`,
    source: 'tanuki-import',
    kind: 'attack',
    startSfen: item.startSfen,
    sideToMove: item.startSfen.split(/\s+/)[1] === 'w' ? 'w' : 'b',
    moveLimit,
    solutionPv: item.solutionPv,
    acceptAllMatingMoves: true,
    tags: [tag, 'SFENインポート'],
    importSourceName: baseName,
    createdAt: now,
  }));
}

/**
 * Import a tsumego problem from a `.kif` file.
 */
export async function importKifTsumegoFile(
  file: File,
  options: TsumegoImportOptions = {}
): Promise<TsumegoProblem[]> {
  const text = await file.text();
  const parsed = parseKif(text);
  const startSfen = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';
  const solutionPv = parsed.moves.map((m) => m.sfenMove).filter((u): u is string => Boolean(u));
  const moveLimit =
    options.moveLimit ?? (solutionPv.length > 0 ? solutionPv.length : inferMoveLimitFromFilename(file.name));
  const now = Date.now();
  const baseName = file.name.replace(/\.[^.]+$/, '');

  return [
    {
      id: `import-kif-${now}`,
      title: `${baseName} (${moveLimit}手詰)`,
      source: 'manual',
      kind: 'attack',
      startSfen,
      sideToMove: startSfen.split(/\s+/)[1] === 'w' ? 'w' : 'b',
      moveLimit,
      solutionPv,
      acceptAllMatingMoves: true,
      tags: [`${moveLimit}手詰`, 'KIFインポート'],
      createdAt: now,
    },
  ];
}
