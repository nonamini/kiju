/**
 * Tactics Note & Rulebook Reference Data Types.
 * Strictly English code, comments, identifiers (Rule 1).
 * Strictly TypeScript strict without any (Rule 2).
 */

export type TacticsCategory = 'castles' | 'attacks' | 'custom';

export type TacticsViewMode = 1 | 2 | 3;

export interface TacticsMoveComment {
  ply: number;
  comment: string;
}

export interface TacticsMoveEval {
  ply: number;
  scoreCp: number;
  isMate?: boolean;
}

export interface TacticsBranch {
  id: string;
  name: string;
  comment?: string;
  moves: string[]; // USI moves sequence for this variation
  sfen?: string;
  moveComments?: TacticsMoveComment[];
  sourceGame?: {
    gameId?: string;
    gameTitle?: string;
    startPly: number;
    endPly: number;
    tournament?: string;
    matchDate?: string;
  };
}

export interface TacticsNoteTextBlock {
  id: string;
  type: 'text';
  title?: string;
  content: string;
}

export interface TacticsNoteKifuBlock {
  id: string;
  type: 'kifu';
  kifuId: string;
  caption?: string;
  /** 'player' embeds full interactive TacticsDetailPlayer; 'link' renders a compact reference card. */
  displayMode?: 'player' | 'link';
}

export interface TacticsNoteDiagramBlock {
  id: string;
  type: 'diagram';
  diagramId: string;
  caption?: string;
}

export interface TacticsNoteLegacyBoardBlock {
  id: string;
  type: 'legacy_tactic';
  caption?: string;
}

export interface TacticsNoteProsConsBlock {
  id: string;
  type: 'pros_cons';
  title?: string;
  pros?: string;
  cons?: string;
}

export type TacticsNoteBlock =
  | TacticsNoteTextBlock
  | TacticsNoteKifuBlock
  | TacticsNoteDiagramBlock
  | TacticsNoteLegacyBoardBlock
  | TacticsNoteProsConsBlock;

export interface TacticsNoteItem {
  id: string;
  category: TacticsCategory;
  title: string;
  tag: string;
  summary: string;
  pros?: string;
  cons?: string;
  tip?: string;
  /** Optional free-space blocks holding custom text, library kifu references, and partial diagrams. */
  freeBlocks?: TacticsNoteBlock[];
  /** Optional starting position SFEN (supports custom board arrangements). */
  sfen?: string;
  /** Optional mini-board rows for quick visual layout preview (5x5 or 9x5). */
  boardRows?: string[][];
  /** Optional recorded move sequence in USI format (e.g. ["7g7f", "3c3d", "2g2f"]). */
  moves?: string[];
  /** Optional complete JSON Kifu Format (JKF) JSON string storing entire move tree with all branches and comments. */
  jkfJson?: string;
  /** Optional variations / branches branching off this tactic. */
  branches?: TacticsBranch[];
  /** Optional move comments keyed by ply (e.g. [{ ply: 1, comment: "角道を開ける" }]). */
  moveComments?: TacticsMoveComment[];
  /** Optional pre-computed static evaluation scores per ply (no live engine search needed). */
  evalHistory?: TacticsMoveEval[];
  /** Optional author or source metadata for community sharing. */
  author?: string;
  /** Optional linked original game / kifu information if extracted from studio or pro games. */
  sourceGame?: {
    gameId?: string;
    gameTitle?: string;
    startPly: number;
    endPly: number;
    tournament?: string;
    matchDate?: string;
  };
  /** Flag indicating whether this item has been modified or created by the user. */
  isCustom?: boolean;
  updatedAt?: string;
}

/** Export format schema for community sharing of multiple or single tactics. */
export interface TacticsShareBundle {
  version: '1.0';
  exportedAt: string;
  appName: 'joseki-tree';
  items: TacticsNoteItem[];
}
