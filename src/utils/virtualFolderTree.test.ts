import { describe, expect, it } from 'vitest';
import type { KifuRecord } from '../types/kifuRecord';
import {
  buildVirtualFolderTree,
  extractFolderPathFromRelativeFilePath,
  inferMetadataFromFolderPath,
  normalizeFolderPath,
  recordMatchesFolderPath,
  UNCATEGORIZED_FOLDER_KEY,
} from './virtualFolderTree';

function makeRecord(id: string, folderPath?: string): KifuRecord {
  return {
    id,
    title: id,
    contentHash: id,
    source: 'import',
    senteName: 'A',
    goteName: 'B',
    openingId: 'other',
    openingName: 'Other',
    totalPlies: 10,
    jkfJson: '{}',
    tags: [],
    isIncludedInTree: false,
    folderPath,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('virtualFolderTree (Issue #9)', () => {
  it('normalizes folder paths and extracts parent folder from relative paths', () => {
    expect(normalizeFolderPath(' \\研究//角換わり/腰掛け銀/ ')).toBe(
      '研究/角換わり/腰掛け銀'
    );
    expect(normalizeFolderPath('./../foo/../bar')).toBe('foo/bar');
    expect(
      extractFolderPathFromRelativeFilePath('研究/角換わり/sample.kif')
    ).toBe('研究/角換わり');
    expect(extractFolderPathFromRelativeFilePath('sample.kif')).toBe('');
  });

  it('infers tags and gameKind from folder hierarchy names', () => {
    expect(inferMetadataFromFolderPath('研究/角換わり/腰掛け銀')).toEqual({
      tags: ['研究', '角換わり', '腰掛け銀'],
      gameKind: 'other',
    });
    expect(inferMetadataFromFolderPath('プロ公式/竜王戦')).toEqual({
      tags: ['プロ公式', '竜王戦'],
      gameKind: 'pro',
    });
    expect(inferMetadataFromFolderPath('自分の対局/将棋ウォーズ')).toEqual({
      tags: ['自分の対局', '将棋ウォーズ'],
      gameKind: 'self',
    });
  });

  it('builds nested folder trees and filters records by folder or uncategorized', () => {
    const r1 = makeRecord('1', '研究/角換わり');
    const r2 = makeRecord('2', '研究/角換わり/腰掛け銀');
    const r3 = makeRecord('3', '研究/矢倉');
    const r4 = makeRecord('4');

    const tree = buildVirtualFolderTree([r1, r2, r3, r4]);
    expect(tree.uncategorizedCount).toBe(1);
    expect(tree.roots).toHaveLength(1);
    expect(tree.roots[0]?.path).toBe('研究');
    expect(tree.roots[0]?.totalCount).toBe(3);

    const kaku = tree.roots[0]?.children.find((c) => c.name === '角換わり');
    expect(kaku?.directCount).toBe(1);
    expect(kaku?.totalCount).toBe(2);

    expect(recordMatchesFolderPath(r2, '研究')).toBe(true);
    expect(recordMatchesFolderPath(r2, '研究/角換わり')).toBe(true);
    expect(recordMatchesFolderPath(r3, '研究/角換わり')).toBe(false);
    expect(recordMatchesFolderPath(r4, UNCATEGORIZED_FOLDER_KEY)).toBe(true);
    expect(recordMatchesFolderPath(r1, UNCATEGORIZED_FOLDER_KEY)).toBe(false);
  });
});
