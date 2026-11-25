import { describe, it, expect } from 'vitest';
import { parseKifSnippet } from './kifSnippetParser';

describe('kifSnippetParser', () => {
  it('parses snippet with standard KIF move lines', () => {
    const snippet = `
1 ７六歩(77) (00:00/00:00:00)
2 ８四歩(83) (00:00/00:00:00)
3 ４八銀(39) (00:00/00:00:00)
4 ３四歩(33) (00:00/00:00:00)
5 ３六歩(37) (00:00/00:00:00)
6 ８五歩(84) (00:00/00:00:00)
7 ３七銀(48) (00:00/00:00:00)
8 ３二金(41) (00:00/00:00:00)
9 ７八金(69) (00:00/00:00:00)
10 ８六歩(85) (00:00/00:00:00)
11 同　歩(87) (00:00/00:00:00)
12 同　飛(82) (00:00/00:00:00)
13 ２六歩(27) (00:00/00:00:00)
14 ５二玉(51) (00:00/00:00:00)
15 ２五歩(26) (00:00/00:00:00)
16 ７四歩(73) (00:00/00:00:00)
17 ６八玉(59) (00:00/00:00:00)
18 ７二銀(71) (00:00/00:00:00)
19 ８七歩打 (00:00/00:00:00)
20 ７六飛(86) (00:00/00:00:00)
`;
    const res = parseKifSnippet(snippet);
    expect(res.usiMoves.length).toBe(20);
    expect(res.usiMoves[0]).toBe('7g7f');
    expect(res.usiMoves[1]).toBe('8c8d');
    expect(res.usiMoves[2]).toBe('3i4h');
    expect(res.usiMoves[18]).toBe('P*8g');
    expect(res.usiMoves[19]).toBe('8f7f');
  });

  it('extracts comments alongside moves', () => {
    const snippet = `
1 ７六歩(77)
* 序盤の角道オープン
2 ３四歩(33)
* 互いに角道を開ける
`;
    const res = parseKifSnippet(snippet);
    expect(res.usiMoves.length).toBe(2);
    expect(res.moveComments.length).toBe(2);
    expect(res.moveComments[0]).toEqual({ ply: 1, comment: '序盤の角道オープン' });
    expect(res.moveComments[1]).toEqual({ ply: 2, comment: '互いに角道を開ける' });
  });
});
