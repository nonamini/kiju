/**
 * Standalone SVG & PNG Image Exporter for Full Shogi Boards and Partial Diagrams.
 * Generates self-contained vector SVG (no external fonts or foreignObject) and
 * rasterizes via offscreen HTMLCanvasElement for PNG download or clipboard copy.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type {
  DiagramHighlightColor,
  DiagramPieceKind,
  FreeBoardDiagram,
} from '../types/freeBoardDiagram';
import { clampDiagramDimension } from './freeBoardDiagramStorage';

export interface FullBoardExportCell {
  kind: string;
  color: 0 | 1;
}

export interface FullBoardExportInput {
  /** 9x9 matrix indexed as cells[rankIdx 0..8][fileIdx 0..8] (row 0 = rank 1, col 0 = file 9). */
  cells: ReadonlyArray<ReadonlyArray<FullBoardExportCell | null>>;
  senteHands: Record<string, number>;
  goteHands: Record<string, number>;
  isFlipped?: boolean;
  showCoordinates?: boolean;
  lastMove?: { x: number; y: number } | null;
  caption?: string;
}

export interface ShogiReadableBoard {
  get(x: number, y: number): { kind: string; color: number } | null | undefined;
}

const RANK_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

const FULL_PIECE_META: Record<string, { label: string; promoted: boolean }> = {
  FU: { label: '歩', promoted: false },
  KY: { label: '香', promoted: false },
  KE: { label: '桂', promoted: false },
  GI: { label: '銀', promoted: false },
  KI: { label: '金', promoted: false },
  KA: { label: '角', promoted: false },
  HI: { label: '飛', promoted: false },
  OU: { label: '玉', promoted: false },
  TO: { label: 'と', promoted: true },
  NY: { label: '杏', promoted: true },
  NK: { label: '圭', promoted: true },
  NG: { label: '全', promoted: true },
  UM: { label: '馬', promoted: true },
  RY: { label: '龍', promoted: true },
};

const DIAGRAM_PIECE_META: Record<DiagramPieceKind, { label: string; promoted: boolean }> = {
  K: { label: '玉', promoted: false },
  R: { label: '飛', promoted: false },
  B: { label: '角', promoted: false },
  G: { label: '金', promoted: false },
  S: { label: '銀', promoted: false },
  N: { label: '桂', promoted: false },
  L: { label: '香', promoted: false },
  P: { label: '歩', promoted: false },
  '+R': { label: '龍', promoted: true },
  '+B': { label: '馬', promoted: true },
  '+S': { label: '全', promoted: true },
  '+N': { label: '圭', promoted: true },
  '+L': { label: '杏', promoted: true },
  '+P': { label: 'と', promoted: true },
};

const HAND_ORDER = ['HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU'] as const;

const HIGHLIGHT_FILL: Record<DiagramHighlightColor, string> = {
  amber: 'rgba(251, 191, 36, 0.38)',
  emerald: 'rgba(52, 211, 153, 0.34)',
  rose: 'rgba(251, 113, 133, 0.34)',
  sky: 'rgba(56, 189, 248, 0.34)',
};

const COLOR_STROKE_HEX: Record<DiagramHighlightColor, string> = {
  amber: '#d97706',
  emerald: '#059669',
  rose: '#e11d48',
  sky: '#0284c7',
};

const MARKER_TEXT_HEX: Record<DiagramHighlightColor, string> = {
  amber: '#b45309',
  emerald: '#047857',
  rose: '#be123c',
  sky: '#0369a1',
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatHandSummary(hands: Record<string, number>): string {
  const parts: string[] = [];
  for (const kind of HAND_ORDER) {
    const count = hands[kind] ?? 0;
    if (count <= 0) continue;
    const label = FULL_PIECE_META[kind]?.label ?? kind;
    parts.push(count > 1 ? `${label}${count}` : label);
  }
  return parts.length > 0 ? parts.join(' ') : 'なし';
}

function renderPieceSvg(
  cx: number,
  cy: number,
  cellW: number,
  cellH: number,
  label: string,
  promoted: boolean,
  rotated: boolean,
  gradId: string
): string {
  const pw = cellW * 0.84;
  const ph = cellH * 0.86;
  const left = cx - pw / 2;
  const top = cy - ph / 2;

  const p1 = `${(left + pw * 0.5).toFixed(2)},${(top + ph * 0.04).toFixed(2)}`;
  const p2 = `${(left + pw * 0.93).toFixed(2)},${(top + ph * 0.22).toFixed(2)}`;
  const p3 = `${(left + pw * 0.86).toFixed(2)},${(top + ph * 0.96).toFixed(2)}`;
  const p4 = `${(left + pw * 0.14).toFixed(2)},${(top + ph * 0.96).toFixed(2)}`;
  const p5 = `${(left + pw * 0.07).toFixed(2)},${(top + ph * 0.22).toFixed(2)}`;

  const fontSize = Math.max(14, Math.round(Math.min(cellW, cellH) * 0.54));
  const textColor = promoted ? '#b91c1c' : '#1f1409';
  const textY = cy + fontSize * 0.36;
  const transformAttr = rotated ? ` transform="rotate(180 ${cx.toFixed(2)} ${cy.toFixed(2)})"` : '';

  return (
    `<g${transformAttr}>` +
    `<polygon points="${p1} ${p2} ${p3} ${p4} ${p5}" fill="url(#${gradId})" stroke="#7c521c" stroke-width="1.2" stroke-linejoin="round" />` +
    `<text x="${cx.toFixed(2)}" y="${textY.toFixed(2)}" text-anchor="middle" font-family="'Yu Mincho', 'Hiragino Mincho ProN', 'Noto Serif JP', serif" font-size="${fontSize}" font-weight="800" fill="${textColor}">${escapeXml(label)}</text>` +
    `</g>`
  );
}

/**
 * Extracts a 9x9 FullBoardExportCell matrix from a shogi.js board instance.
 */
export function buildFullBoardCellsFromShogi(
  shogi: ShogiReadableBoard
): (FullBoardExportCell | null)[][] {
  const rows: (FullBoardExportCell | null)[][] = [];
  for (let rank = 1; rank <= 9; rank += 1) {
    const row: (FullBoardExportCell | null)[] = [];
    for (let file = 9; file >= 1; file -= 1) {
      const piece = shogi.get(file, rank);
      if (piece) {
        row.push({
          kind: piece.kind,
          color: piece.color === 1 ? 1 : 0,
        });
      } else {
        row.push(null);
      }
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Generates a standalone vector SVG of a 9x9 Shogi board with hand pieces and optional caption.
 */
export function renderFullBoardToSvg(input: FullBoardExportInput): string {
  const isFlipped = Boolean(input.isFlipped);
  const showCoords = input.showCoordinates ?? true;
  const caption = input.caption?.trim() ?? '';

  const cellW = 52;
  const cellH = 56;
  const boardW = cellW * 9;
  const boardH = cellH * 9;

  const padX = 28;
  const padTop = 20;
  const padBottom = 20;
  const captionH = caption ? 30 : 0;
  const handBarH = 34;
  const handGap = 10;
  const coordTopH = showCoords ? 22 : 0;
  const coordRightW = showCoords ? 24 : 0;

  const totalW = padX * 2 + boardW + coordRightW;
  const totalH =
    padTop + captionH + handBarH + handGap + coordTopH + boardH + handGap + handBarH + padBottom;

  const boardX = padX;
  const topHandY = padTop + captionH;
  const coordTopY = topHandY + handBarH + handGap;
  const boardY = coordTopY + coordTopH;
  const bottomHandY = boardY + boardH + handGap;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">`
  );
  parts.push(
    '<defs>' +
      '<linearGradient id="kiju-board-grad" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="#ebd095" />' +
      '<stop offset="55%" stop-color="#dfb86f" />' +
      '<stop offset="100%" stop-color="#cd9b4a" />' +
      '</linearGradient>' +
      '<linearGradient id="kiju-piece-grad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#fbf0d4" />' +
      '<stop offset="100%" stop-color="#e5c17d" />' +
      '</linearGradient>' +
      '</defs>'
  );

  // Outer backdrop card
  parts.push(
    `<rect x="0" y="0" width="${totalW}" height="${totalH}" rx="12" fill="#0f172a" />`
  );

  if (caption) {
    parts.push(
      `<text x="${(totalW / 2).toFixed(1)}" y="${padTop + 18}" text-anchor="middle" font-family="'Yu Gothic', 'Hiragino Sans', 'Noto Sans JP', sans-serif" font-size="14" font-weight="700" fill="#f8fafc">${escapeXml(caption)}</text>`
    );
  }

  // Top & bottom captured piece bars
  const topLabel = isFlipped
    ? `▲先手 持ち駒: ${formatHandSummary(input.senteHands)}`
    : `△後手 持ち駒: ${formatHandSummary(input.goteHands)}`;
  const bottomLabel = isFlipped
    ? `△後手 持ち駒: ${formatHandSummary(input.goteHands)}`
    : `▲先手 持ち駒: ${formatHandSummary(input.senteHands)}`;

  const renderHandBar = (y: number, text: string, accent: string): string =>
    `<rect x="${boardX}" y="${y}" width="${boardW}" height="${handBarH}" rx="7" fill="#1e293b" stroke="#334155" stroke-width="1" />` +
    `<text x="${boardX + 12}" y="${y + 22}" font-family="'Yu Gothic', 'Hiragino Sans', 'Noto Sans JP', sans-serif" font-size="13" font-weight="600" fill="${accent}">${escapeXml(text)}</text>`;

  parts.push(renderHandBar(topHandY, topLabel, isFlipped ? '#fcd34d' : '#cbd5e1'));
  parts.push(renderHandBar(bottomHandY, bottomLabel, isFlipped ? '#cbd5e1' : '#fcd34d'));

  // Optional file/rank coordinates
  if (showCoords) {
    for (let vCol = 0; vCol < 9; vCol += 1) {
      const fileNum = isFlipped ? vCol + 1 : 9 - vCol;
      const cx = boardX + (vCol + 0.5) * cellW;
      parts.push(
        `<text x="${cx.toFixed(1)}" y="${coordTopY + 15}" text-anchor="middle" font-family="monospace" font-size="12" font-weight="700" fill="#e2e8f0">${fileNum}</text>`
      );
    }
    for (let vRow = 0; vRow < 9; vRow += 1) {
      const rankIdx = isFlipped ? 8 - vRow : vRow;
      const rankChar = RANK_KANJI[rankIdx] ?? '';
      const cy = boardY + (vRow + 0.5) * cellH + 5;
      parts.push(
        `<text x="${boardX + boardW + 14}" y="${cy.toFixed(1)}" text-anchor="middle" font-family="'Yu Mincho', 'Hiragino Mincho ProN', serif" font-size="12" font-weight="700" fill="#e2e8f0">${rankChar}</text>`
      );
    }
  }

  // Board surface & border
  parts.push(
    `<rect x="${boardX}" y="${boardY}" width="${boardW}" height="${boardH}" fill="url(#kiju-board-grad)" stroke="#523511" stroke-width="2.4" />`
  );

  // Last move highlight
  if (
    input.lastMove &&
    input.lastMove.x >= 1 &&
    input.lastMove.x <= 9 &&
    input.lastMove.y >= 1 &&
    input.lastMove.y <= 9
  ) {
    const vCol = isFlipped ? input.lastMove.x - 1 : 9 - input.lastMove.x;
    const vRow = isFlipped ? 9 - input.lastMove.y : input.lastMove.y - 1;
    parts.push(
      `<rect x="${boardX + vCol * cellW}" y="${boardY + vRow * cellH}" width="${cellW}" height="${cellH}" fill="rgba(245, 158, 11, 0.35)" />`
    );
  }

  // Grid lines
  for (let i = 1; i < 9; i += 1) {
    const vx = boardX + i * cellW;
    const hy = boardY + i * cellH;
    parts.push(
      `<line x1="${vx}" y1="${boardY}" x2="${vx}" y2="${boardY + boardH}" stroke="#523511" stroke-width="1" stroke-opacity="0.72" />`
    );
    parts.push(
      `<line x1="${boardX}" y1="${hy}" x2="${boardX + boardW}" y2="${hy}" stroke="#523511" stroke-width="1" stroke-opacity="0.72" />`
    );
  }

  // Hoshi star points
  for (const colIdx of [3, 6]) {
    for (const rowIdx of [3, 6]) {
      parts.push(
        `<circle cx="${boardX + colIdx * cellW}" cy="${boardY + rowIdx * cellH}" r="3" fill="#523511" />`
      );
    }
  }

  // Pieces
  for (let vRow = 0; vRow < 9; vRow += 1) {
    for (let vCol = 0; vCol < 9; vCol += 1) {
      const rIdx = isFlipped ? 8 - vRow : vRow;
      const cIdx = isFlipped ? 8 - vCol : vCol;
      const cell = input.cells[rIdx]?.[cIdx];
      if (!cell) continue;
      const meta = FULL_PIECE_META[cell.kind];
      if (!meta) continue;

      const cx = boardX + (vCol + 0.5) * cellW;
      const cy = boardY + (vRow + 0.5) * cellH;
      const isGote = cell.color === 1;
      const rotated = isFlipped ? !isGote : isGote;
      parts.push(
        renderPieceSvg(
          cx,
          cy,
          cellW,
          cellH,
          meta.label,
          meta.promoted,
          rotated,
          'kiju-piece-grad'
        )
      );
    }
  }

  parts.push('</svg>');
  return parts.join('');
}

/**
 * Generates a standalone vector SVG for an arbitrary-size partial Shogi diagram (FreeBoardDiagram).
 */
export function renderFreeDiagramToSvg(
  diagram: FreeBoardDiagram,
  options?: { caption?: string; cellSizePx?: number }
): string {
  const cols = clampDiagramDimension(diagram.cols);
  const rows = clampDiagramDimension(diagram.rows);
  const startFile = clampDiagramDimension(diagram.startFile ?? cols);
  const startRank = clampDiagramDimension(diagram.startRank ?? 1);
  const showCoords = Boolean(diagram.showCoords);
  const cellSize = options?.cellSizePx ?? 52;
  const caption = options?.caption?.trim() ?? '';

  const boardW = cols * cellSize;
  const boardH = rows * cellSize;
  const padX = 24;
  const padTop = 20;
  const padBottom = 20;
  const captionH = caption ? 28 : 0;
  const coordTopH = showCoords ? 20 : 0;
  const coordRightW = showCoords ? 22 : 0;

  const totalW = Math.max(padX * 2 + boardW + coordRightW, caption ? 260 : 0);
  const boardX = Math.round((totalW - coordRightW - boardW) / 2);
  const coordTopY = padTop + captionH;
  const boardY = coordTopY + coordTopH;
  const totalH = boardY + boardH + padBottom;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">`
  );

  // Gradients & arrow markers
  const defs: string[] = [
    '<linearGradient id="diag-board-grad" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="#e7bf78" />' +
      '<stop offset="55%" stop-color="#d7aa5f" />' +
      '<stop offset="100%" stop-color="#c79348" />' +
      '</linearGradient>',
    '<linearGradient id="diag-piece-grad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#f9e8c3" />' +
      '<stop offset="100%" stop-color="#e6c384" />' +
      '</linearGradient>',
  ];
  for (const color of ['amber', 'emerald', 'rose', 'sky'] as const) {
    defs.push(
      `<marker id="diag-exp-arrow-${color}" markerWidth="6" markerHeight="6" refX="4.5" refY="3" orient="auto">` +
        `<path d="M0,0 L6,3 L0,6 Z" fill="${COLOR_STROKE_HEX[color]}" />` +
        '</marker>'
    );
  }
  parts.push(`<defs>${defs.join('')}</defs>`);

  // Outer card background
  parts.push(
    `<rect x="0" y="0" width="${totalW}" height="${totalH}" rx="12" fill="#0f172a" />`
  );

  if (caption) {
    parts.push(
      `<text x="${(totalW / 2).toFixed(1)}" y="${padTop + 17}" text-anchor="middle" font-family="'Yu Gothic', 'Hiragino Sans', 'Noto Sans JP', sans-serif" font-size="14" font-weight="700" fill="#f8fafc">${escapeXml(caption)}</text>`
    );
  }

  if (showCoords) {
    for (let c = 0; c < cols; c += 1) {
      const fileVal = startFile - c;
      const label = fileVal >= 1 && fileVal <= 9 ? String(fileVal) : '';
      const cx = boardX + (c + 0.5) * cellSize;
      parts.push(
        `<text x="${cx.toFixed(1)}" y="${coordTopY + 14}" text-anchor="middle" font-family="monospace" font-size="11" font-weight="700" fill="#fde68a">${label}</text>`
      );
    }
    for (let r = 0; r < rows; r += 1) {
      const rankIdx = startRank - 1 + r;
      const label = rankIdx >= 0 && rankIdx < RANK_KANJI.length ? RANK_KANJI[rankIdx] : '';
      const cy = boardY + (r + 0.5) * cellSize + 4;
      parts.push(
        `<text x="${boardX + boardW + 12}" y="${cy.toFixed(1)}" text-anchor="middle" font-family="'Yu Mincho', 'Hiragino Mincho ProN', serif" font-size="11" font-weight="700" fill="#fde68a">${label}</text>`
      );
    }
  }

  // Board surface
  parts.push(
    `<rect x="${boardX}" y="${boardY}" width="${boardW}" height="${boardH}" fill="url(#diag-board-grad)" stroke="#6b481b" stroke-width="2" />`
  );

  // Cell highlights
  for (const hl of diagram.highlights) {
    if (hl.col < 0 || hl.col >= cols || hl.row < 0 || hl.row >= rows) continue;
    parts.push(
      `<rect x="${boardX + hl.col * cellSize}" y="${boardY + hl.row * cellSize}" width="${cellSize}" height="${cellSize}" fill="${HIGHLIGHT_FILL[hl.color]}" stroke="${COLOR_STROKE_HEX[hl.color]}" stroke-width="1.5" />`
    );
  }

  // Grid lines
  for (let c = 1; c < cols; c += 1) {
    const vx = boardX + c * cellSize;
    parts.push(
      `<line x1="${vx}" y1="${boardY}" x2="${vx}" y2="${boardY + boardH}" stroke="#6b481b" stroke-width="1" stroke-opacity="0.55" />`
    );
  }
  for (let r = 1; r < rows; r += 1) {
    const hy = boardY + r * cellSize;
    parts.push(
      `<line x1="${boardX}" y1="${hy}" x2="${boardX + boardW}" y2="${hy}" stroke="#6b481b" stroke-width="1" stroke-opacity="0.55" />`
    );
  }

  // Pieces
  for (const piece of diagram.pieces) {
    if (piece.col < 0 || piece.col >= cols || piece.row < 0 || piece.row >= rows) continue;
    const meta = DIAGRAM_PIECE_META[piece.kind];
    if (!meta) continue;
    const cx = boardX + (piece.col + 0.5) * cellSize;
    const cy = boardY + (piece.row + 0.5) * cellSize;
    parts.push(
      renderPieceSvg(
        cx,
        cy,
        cellSize,
        cellSize,
        meta.label,
        meta.promoted,
        piece.owner === 'w',
        'diag-piece-grad'
      )
    );
  }

  // Markers
  const markerFontSize = Math.max(14, Math.round(cellSize * 0.56));
  for (const marker of diagram.markers) {
    if (marker.col < 0 || marker.col >= cols || marker.row < 0 || marker.row >= rows) continue;
    const cx = boardX + (marker.col + 0.5) * cellSize;
    const cy = boardY + (marker.row + 0.5) * cellSize + markerFontSize * 0.36;
    const colorHex = MARKER_TEXT_HEX[marker.color ?? 'rose'];
    parts.push(
      `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="${markerFontSize}" font-weight="900" fill="${colorHex}" fill-opacity="0.9">${escapeXml(marker.symbol)}</text>`
    );
  }

  // Arrows
  for (const arrow of diagram.arrows) {
    const x1 = boardX + (arrow.fromCol + 0.5) * cellSize;
    const y1 = boardY + (arrow.fromRow + 0.5) * cellSize;
    const x2 = boardX + (arrow.toCol + 0.5) * cellSize;
    const y2 = boardY + (arrow.toRow + 0.5) * cellSize;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) continue;
    const trim = Math.min(cellSize * 0.22, dist * 0.25);
    const ux = dx / dist;
    const uy = dy / dist;
    parts.push(
      `<line x1="${(x1 + ux * trim * 0.45).toFixed(2)}" y1="${(y1 + uy * trim * 0.45).toFixed(2)}" x2="${(x2 - ux * trim).toFixed(2)}" y2="${(y2 - uy * trim).toFixed(2)}" stroke="${COLOR_STROKE_HEX[arrow.color]}" stroke-width="${Math.max(2.8, cellSize * 0.08).toFixed(2)}" stroke-opacity="0.9" stroke-linecap="round" marker-end="url(#diag-exp-arrow-${arrow.color})" />`
    );
  }

  parts.push('</svg>');
  return parts.join('');
}

function triggerBlobDownload(blob: Blob, filename: string): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}

/**
 * Downloads an SVG markup string as a `.svg` file.
 */
export function downloadSvgString(svg: string, filename = 'shogi-board.svg'): boolean {
  try {
    const normalized = filename.endsWith('.svg') ? filename : `${filename}.svg`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    return triggerBlobDownload(blob, normalized);
  } catch (error) {
    console.error('Failed to download SVG:', error);
    return false;
  }
}

/**
 * Rasterizes an SVG markup string into a PNG Blob using an offscreen canvas.
 */
export function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('PNG rasterization requires a browser environment'));
      return;
    }

    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      try {
        const width = Math.max(1, img.naturalWidth || img.width || 600);
        const height = Math.max(1, img.naturalHeight || img.height || 600);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to acquire 2D canvas context'));
          return;
        }
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas PNG conversion produced null blob'));
          }
        }, 'image/png');
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG into Image element'));
    };

    img.src = url;
  });
}

/**
 * Rasterizes an SVG markup string to PNG and triggers a browser file download.
 */
export async function downloadPngFromSvg(
  svg: string,
  filename = 'shogi-board.png',
  scale = 2
): Promise<boolean> {
  try {
    const blob = await svgToPngBlob(svg, scale);
    const normalized = filename.endsWith('.png') ? filename : `${filename}.png`;
    return triggerBlobDownload(blob, normalized);
  } catch (error) {
    console.error('Failed to download PNG:', error);
    return false;
  }
}

/**
 * Rasterizes an SVG markup string to PNG and copies it to the system clipboard.
 */
export async function copyPngFromSvgToClipboard(
  svg: string,
  scale = 2
): Promise<boolean> {
  if (
    typeof window === 'undefined' ||
    typeof ClipboardItem === 'undefined' ||
    !navigator.clipboard?.write
  ) {
    return false;
  }
  try {
    const blob = await svgToPngBlob(svg, scale);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch (error) {
    console.error('Failed to copy PNG to clipboard:', error);
    return false;
  }
}
