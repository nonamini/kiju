/**
 * Arbitrary-Size Free Board Diagram (部分盤面図) Data Models (Issue #176 Phase 3).
 * Supports custom partial Shogi boards of size 1..9 x 1..9 with pieces,
 * highlights, markers, directional arrows, and optional coordinate offsets.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

export type DiagramHighlightColor = 'amber' | 'emerald' | 'rose' | 'sky';

export type DiagramMarkerSymbol = '○' | '×' | '△' | '★' | '◎';

export type DiagramPieceKind =
  | 'K'
  | 'R'
  | 'B'
  | 'G'
  | 'S'
  | 'N'
  | 'L'
  | 'P'
  | '+R'
  | '+B'
  | '+S'
  | '+N'
  | '+L'
  | '+P';

export interface DiagramPiece {
  /** 0-based column index from left (0..cols-1) */
  col: number;
  /** 0-based row index from top (0..rows-1) */
  row: number;
  /** 'b' = Sente (upright), 'w' = Gote (inverted) */
  owner: 'b' | 'w';
  kind: DiagramPieceKind;
}

export interface DiagramHighlight {
  col: number;
  row: number;
  color: DiagramHighlightColor;
}

export interface DiagramMarker {
  col: number;
  row: number;
  symbol: DiagramMarkerSymbol;
  color?: DiagramHighlightColor;
}

export interface DiagramArrow {
  fromCol: number;
  fromRow: number;
  toCol: number;
  toRow: number;
  color: DiagramHighlightColor;
}

export interface FreeBoardDiagram {
  id: string;
  title: string;
  description?: string;
  /** Width in squares (1..9) */
  cols: number;
  /** Height in squares (1..9) */
  rows: number;
  /** Whether to show Shogi file/rank coordinates around the board */
  showCoords?: boolean;
  /** Leftmost column file number (e.g. 5..1 or 9..1); defaults to cols */
  startFile?: number;
  /** Topmost row rank (1..9, 1 = '一'); defaults to 1 */
  startRank?: number;
  pieces: DiagramPiece[];
  highlights: DiagramHighlight[];
  markers: DiagramMarker[];
  arrows: DiagramArrow[];
  tags: string[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
