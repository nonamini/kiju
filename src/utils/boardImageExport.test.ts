import { describe, expect, it } from 'vitest';
import type { FreeBoardDiagram } from '../types/freeBoardDiagram';
import {
  buildFullBoardCellsFromShogi,
  renderFreeDiagramToSvg,
  renderFullBoardToSvg,
} from './boardImageExport';

describe('boardImageExport', () => {
  it('renders a standalone full 9x9 Shogi board SVG with pieces, hands, and caption', () => {
    const cells = buildFullBoardCellsFromShogi({
      get: (x, y) => {
        if (x === 5 && y === 1) return { kind: 'OU', color: 1 };
        if (x === 7 && y === 7) return { kind: 'FU', color: 0 };
        if (x === 2 && y === 2) return { kind: 'RY', color: 0 };
        return null;
      },
    });

    const svg = renderFullBoardToSvg({
      cells,
      senteHands: { KA: 1, FU: 2 },
      goteHands: {},
      showCoordinates: true,
      lastMove: { x: 2, y: 2 },
      caption: 'Kaku-gawari Study <Test>',
    });

    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('▲先手 持ち駒: 角 歩2');
    expect(svg).toContain('△後手 持ち駒: なし');
    expect(svg).toContain('Kaku-gawari Study &lt;Test&gt;');
    expect(svg).toContain('>玉</text>');
    expect(svg).toContain('transform="rotate(180');
    expect(svg).toContain('fill="#b91c1c">龍</text>');
    expect(svg).toContain('rgba(245, 158, 11, 0.35)');
  });

  it('flips hands and coordinates when isFlipped is true', () => {
    const cells = buildFullBoardCellsFromShogi({
      get: (x, y) => (x === 7 && y === 7 ? { kind: 'FU', color: 0 } : null),
    });

    const svg = renderFullBoardToSvg({
      cells,
      senteHands: { HI: 1 },
      goteHands: { KI: 2 },
      isFlipped: true,
      showCoordinates: true,
    });

    const senteIndex = svg.indexOf('▲先手 持ち駒: 飛');
    const goteIndex = svg.indexOf('△後手 持ち駒: 金2');
    expect(senteIndex).toBeGreaterThan(-1);
    expect(goteIndex).toBeGreaterThan(senteIndex);
  });

  it('renders a partial FreeBoardDiagram SVG with pieces, highlights, markers, and arrows', () => {
    const diagram: FreeBoardDiagram = {
      id: 'd1',
      title: 'Mino Castle',
      cols: 5,
      rows: 5,
      showCoords: true,
      startFile: 5,
      startRank: 5,
      pieces: [
        { col: 2, row: 3, owner: 'b', kind: 'K' },
        { col: 1, row: 2, owner: 'b', kind: '+R' },
        { col: 0, row: 0, owner: 'w', kind: 'G' },
      ],
      highlights: [{ col: 2, row: 3, color: 'amber' }],
      markers: [{ col: 3, row: 3, symbol: '◎', color: 'emerald' }],
      arrows: [{ fromCol: 1, fromRow: 2, toCol: 2, toRow: 2, color: 'rose' }],
      tags: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };

    const svg = renderFreeDiagramToSvg(diagram, { caption: 'Mino Castle' });

    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('Mino Castle');
    expect(svg).toContain('>龍</text>');
    expect(svg).toContain('>◎</text>');
    expect(svg).toContain('marker-end="url(#diag-exp-arrow-rose)"');
    expect(svg).toContain('>五</text>');
  });
});
