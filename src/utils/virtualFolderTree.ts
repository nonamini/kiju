/**
 * Pure virtual folder hierarchy utilities for KifuRecord management (Issue #9).
 * Supports path normalization, extraction from File.webkitRelativePath / directory walks,
 * automatic gameKind & tag inference from folder names, tree building, and matching.
 * Follows Rule 1: strictly English code, comments, and identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import type { KifuGameKind, KifuRecord } from '../types/kifuRecord';

export const UNCATEGORIZED_FOLDER_KEY = '__uncategorized__';

export interface VirtualFolderNode {
  path: string;
  name: string;
  directCount: number;
  totalCount: number;
  children: VirtualFolderNode[];
}

export interface VirtualFolderTreeResult {
  roots: VirtualFolderNode[];
  uncategorizedCount: number;
  allFolderPaths: string[];
}

/**
 * Normalizes a virtual folder path using `/` separators and trims invalid/empty segments.
 */
export function normalizeFolderPath(raw?: string | null): string {
  if (!raw) return '';
  const segments = raw
    .replace(/\\/g, '/')
    .split('/')
    .map((seg) => seg.trim())
    .filter((seg) => seg.length > 0 && seg !== '.' && seg !== '..');
  return segments.join('/');
}

/**
 * Extracts the parent virtual folder path from a relative file path (e.g. from webkitRelativePath).
 */
export function extractFolderPathFromRelativeFilePath(
  relativePath?: string | null
): string {
  if (!relativePath) return '';
  const parts = relativePath
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p !== '.' && p !== '..');
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('/');
}

/**
 * Infers tags and optional KifuGameKind from virtual folder path segments.
 */
export function inferMetadataFromFolderPath(folderPath: string): {
  tags: string[];
  gameKind?: KifuGameKind;
} {
  const normalized = normalizeFolderPath(folderPath);
  if (!normalized) {
    return { tags: [] };
  }

  const segments = normalized.split('/');
  const lowerFull = normalized.toLowerCase();

  let gameKind: KifuGameKind | undefined;
  if (/女流|ladies/.test(lowerFull)) {
    gameKind = 'ladies';
  } else if (/アマ|amateur/.test(lowerFull)) {
    gameKind = 'amateur';
  } else if (/プロ|公式|pro/.test(lowerFull)) {
    gameKind = 'pro';
  } else if (/自戦|自分|対局|my|self/.test(lowerFull)) {
    gameKind = 'self';
  } else if (/定跡|joseki/.test(lowerFull)) {
    gameKind = 'joseki';
  } else if (/研究|検討|study/.test(lowerFull)) {
    gameKind = 'other';
  }

  const tagSet = new Set<string>();
  for (const seg of segments) {
    if (seg.length > 0 && seg.length <= 32) {
      tagSet.add(seg);
    }
  }

  return {
    tags: Array.from(tagSet),
    gameKind,
  };
}

/**
 * Builds a sorted tree of VirtualFolderNode from records, aggregating direct & descendant counts.
 */
export function buildVirtualFolderTree(
  records: KifuRecord[]
): VirtualFolderTreeResult {
  const directCounts = new Map<string, number>();
  let uncategorizedCount = 0;

  for (const rec of records) {
    if (rec.deletedAt) continue;
    const normalized = normalizeFolderPath(rec.folderPath);
    if (!normalized) {
      uncategorizedCount += 1;
      continue;
    }
    directCounts.set(normalized, (directCounts.get(normalized) ?? 0) + 1);
  }

  const nodeMap = new Map<string, VirtualFolderNode>();
  const ensureNode = (fullPath: string): VirtualFolderNode => {
    const existing = nodeMap.get(fullPath);
    if (existing) return existing;
    const parts = fullPath.split('/');
    const name = parts[parts.length - 1] ?? fullPath;
    const node: VirtualFolderNode = {
      path: fullPath,
      name,
      directCount: directCounts.get(fullPath) ?? 0,
      totalCount: 0,
      children: [],
    };
    nodeMap.set(fullPath, node);
    return node;
  };

  for (const fullPath of directCounts.keys()) {
    const parts = fullPath.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const ancestorPath = parts.slice(0, i).join('/');
      const node = ensureNode(ancestorPath);
      if (i > 1) {
        const parentPath = parts.slice(0, i - 1).join('/');
        const parent = ensureNode(parentPath);
        if (!parent.children.some((c) => c.path === node.path)) {
          parent.children.push(node);
        }
      }
    }
  }

  const roots: VirtualFolderNode[] = [];
  for (const node of nodeMap.values()) {
    if (!node.path.includes('/')) {
      roots.push(node);
    }
  }

  const finalizeNode = (node: VirtualFolderNode): number => {
    node.children.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    let sum = node.directCount;
    for (const child of node.children) {
      sum += finalizeNode(child);
    }
    node.totalCount = sum;
    return sum;
  };

  roots.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  for (const root of roots) {
    finalizeNode(root);
  }

  const allFolderPaths = Array.from(nodeMap.keys()).sort((a, b) =>
    a.localeCompare(b, 'ja')
  );

  return {
    roots,
    uncategorizedCount,
    allFolderPaths,
  };
}

/**
 * Returns true if `record` matches the selected virtual folder (exact or descendant).
 */
export function recordMatchesFolderPath(
  record: KifuRecord,
  selectedFolder?: string
): boolean {
  const raw = selectedFolder?.trim() ?? '';
  if (!raw) return true;

  const recFolder = normalizeFolderPath(record.folderPath);
  if (raw === UNCATEGORIZED_FOLDER_KEY) {
    return recFolder === '';
  }

  const target = normalizeFolderPath(raw);
  if (!target) return true;
  return recFolder === target || recFolder.startsWith(`${target}/`);
}
