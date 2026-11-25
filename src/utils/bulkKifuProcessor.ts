/**
 * Bulk KIF file processor for multi-file / folder import (Issues #51, #52).
 * Decodes each file (UTF-8 / Shift-JIS auto-detect), parses it into a
 * ParsedKifResult, classifies the opening, and skips duplicates via the
 * normalized content hash (same mechanism as #44). Processing is strictly
 * sequential per file so the UI stays responsive on large batches.
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import { decodeKifBuffer } from './encoding';
import { parseKif, ParsedKifResult } from './kifParser';
import { classifyOpening } from './openingClassifier';
import { computeKifuRecordContentHash } from './kifuContentHash';
import { loadKifuRecords } from './kifuRecordStorage';

export type BulkKifuFailureReason =
  | 'read' // file could not be read as a buffer
  | 'decode' // encoding detection failed
  | 'parse' // KIF parse error
  | 'empty' // parsed but contains no moves
  | 'unsupported'; // extension is not a recognized kifu format

export interface BulkKifuFileResult {
  fileName: string;
  status: 'success' | 'duplicate' | 'failed';
  reason?: BulkKifuFailureReason;
  parsed?: ParsedKifResult;
}

export interface BulkKifuProcessResult {
  /** Successfully parsed, non-duplicate games ready to ingest. */
  successes: ParsedKifResult[];
  /** Per-file outcomes for the summary report (#52). */
  fileResults: BulkKifuFileResult[];
  counts: { success: number; duplicate: number; failed: number; skipped: number };
}

export interface BulkKifuProcessOptions {
  /** Called after each file finishes, with (processed, total). */
  onProgress?: (processed: number, total: number) => void;
}

const KIFU_FILE_PATTERN = /\.(kif|ki2|kifu|csa|txt|jkf)$/i;

function isKifuFileName(name: string): boolean {
  return KIFU_FILE_PATTERN.test(name);
}

async function processSingleFile(
  file: File,
  seenHashes: Set<string>
): Promise<BulkKifuFileResult> {
  const fileName = file.name || '(unnamed)';

  if (!isKifuFileName(fileName)) {
    return { fileName, status: 'failed', reason: 'unsupported' };
  }

  let text: string;
  try {
    const buffer = await file.arrayBuffer();
    const decoded = decodeKifBuffer(buffer);
    text = decoded.text;
  } catch {
    return { fileName, status: 'failed', reason: 'decode' };
  }

  let parsed: ParsedKifResult;
  try {
    parsed = parseKif(text);
  } catch {
    return { fileName, status: 'failed', reason: 'parse' };
  }

  if (parsed.moves.length === 0) {
    return { fileName, status: 'failed', reason: 'empty' };
  }

  parsed.game.openingId = classifyOpening(parsed.moves, parsed.game.openingId).id;

  // Duplicate detection: existing KifuRecords + earlier files in this batch.
  const hash = computeKifuRecordContentHash({ rawKif: parsed.game.rawKif });
  if (hash && seenHashes.has(hash)) {
    return { fileName, status: 'duplicate' };
  }

  if (hash) seenHashes.add(hash);
  return { fileName, status: 'success', parsed };
}

/**
 * Processes a batch of kifu files sequentially. Never throws for
 * per-file errors; failures are reported in the result summary.
 */
export async function processKifuFiles(
  files: Iterable<File>,
  options: BulkKifuProcessOptions = {}
): Promise<BulkKifuProcessResult> {
  const fileList = Array.from(files);
  const total = fileList.length;

  // Snapshot existing record hashes once so batch processing stays O(1)
  // per file instead of reloading storage each iteration.
  const seenHashes = new Set<string>();
  for (const record of loadKifuRecords()) {
    if (record.contentHash) seenHashes.add(record.contentHash);
  }

  const fileResults: BulkKifuFileResult[] = [];
  const successes: ParsedKifResult[] = [];
  let processed = 0;

  for (const file of fileList) {
    try {
      const result = await processSingleFile(file, seenHashes);
      fileResults.push(result);
      if (result.status === 'success' && result.parsed) {
        successes.push(result.parsed);
      }
    } catch {
      fileResults.push({
        fileName: file.name || '(unnamed)',
        status: 'failed',
        reason: 'read',
      });
    }
    processed += 1;
    options.onProgress?.(processed, total);
  }

  const counts = { success: 0, duplicate: 0, failed: 0, skipped: 0 };
  for (const r of fileResults) {
    if (r.status === 'success') counts.success += 1;
    else if (r.status === 'duplicate') counts.duplicate += 1;
    else counts.failed += 1;
  }

  return { successes, fileResults, counts };
}
