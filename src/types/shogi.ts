export type Color = 'b' | 'w'; // 'b': Black (Sente), 'w': White (Gote)

export type PieceType =
  | 'FU' // Pawn
  | 'KY' // Lance
  | 'KE' // Knight
  | 'GI' // Silver
  | 'KI' // Gold
  | 'KA' // Bishop
  | 'HI' // Rook
  | 'OU' // King
  | 'TO' // Promoted Pawn
  | 'NY' // Promoted Lance
  | 'NK' // Promoted Knight
  | 'NG' // Promoted Silver
  | 'UM' // Promoted Bishop
  | 'RY'; // Promoted Rook

export interface Square {
  file: number; // 1 to 9 (1=Rightmost, 9=Leftmost)
  rank: number; // 1 to 9 (1=Top, 9=Bottom)
}

export interface ShogiMove {
  ply: number; // 1-based move index
  color: Color; // Sente or Gote
  from?: Square; // Source square (undefined if piece drop)
  to: Square; // Destination square
  piece: PieceType; // Piece being moved or dropped
  promote?: boolean; // Whether promotion occurred
  isDrop: boolean; // True if dropped from hand
  kifString: string; // KIF move string e.g. "7g7f" notation or standard KIF
  sfenMove: string; // USI coordinate e.g. "7g7f" or "S*5b"
  evaluation?: MoveEvaluation; // Optional attached engine evaluation
}

export interface MultiPvCandidate {
  multipv: number; // 1, 2, 3...
  usi: string; // First move of the PV
  scoreCp: number; // Sente-normalized score (+ for Sente, - for Gote)
  isMate?: boolean;
  matePly?: number;
  pv?: string[]; // Continuation
}

export interface MoveEvaluation {
  scoreCp: number; // Centipawns (+ for Sente, - for Gote)
  isMate?: boolean; // True if mate score
  matePly?: number; // Plies to mate
  depth: number; // Search depth reached
  bestMove?: string; // USI bestmove string (e.g. "2g2f")
  bestMoveKif?: string; // KIF bestmove string
  pv?: string[]; // Principal variation moves (USI format)
  candidates?: MultiPvCandidate[]; // Top-N MultiPV candidate moves from engine analysis
  evaluatedAt: string; // ISO 8601 timestamp
}
