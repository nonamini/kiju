/**
 * SVG Piece Sprite Symbols Provider.
 * Embeds high-fidelity vector piece sprites from piece_wood.svg (Row 0-3 x Col 0-7 = 32 pieces).
 * Strictly English code, comments, and identifiers (Rule 1).
 */

export type SpritePieceKey =
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

/**
 * Returns sprite coordinate offset [col (0-7), row (0-3)] in piece_wood.svg.
 * Authentic Tsuge Boxwood pieces order:
 * Col 0: 王 (King - Ou: Row 0, Gyoku: Row 1)
 * Col 1: 飛 (Rook - HI) / 竜 (RY)
 * Col 2: 角 (Bishop - KA) / 馬 (UM)
 * Col 3: 金 (Gold - KI)
 * Col 4: 銀 (Silver - GI) / 成銀 (NG)
 * Col 5: 桂 (Knight - KE) / 成桂 (NK)
 * Col 6: 香 (Lance - KY) / 成香 (NY)
 * Col 7: 歩 (Pawn - FU) / と (TO)
 *
 * Row 0: Sente Standard (Unpromoted)
 * Row 1: Sente Promoted (plus Gyoku at Col 0)
 * Row 2: Gote Standard (Pre-rotated 180°)
 * Row 3: Gote Promoted (Pre-rotated 180°)
 */
export function getPieceSpriteCoords(pieceKind: string, isGote: boolean): { col: number; row: number } {
  const normKind = pieceKind.toUpperCase();
  const baseRow = isGote ? 2 : 0;

  switch (normKind) {
    case 'OU':
    case 'K':
      // Col 0: Sente has Gyoku (Row 1), Gote has Ou (Row 2)
      return { col: 0, row: isGote ? 2 : 1 };

    case 'HI':
    case 'R':
      return { col: 1, row: baseRow };

    case 'RY':
    case '+R':
    case '+HI':
      return { col: 1, row: baseRow + 1 };

    case 'KA':
    case 'B':
      return { col: 2, row: baseRow };

    case 'UM':
    case '+B':
    case '+KA':
      return { col: 2, row: baseRow + 1 };

    case 'KI':
    case 'G':
      return { col: 3, row: baseRow };

    case 'GI':
    case 'S':
      return { col: 4, row: baseRow };

    case 'NG':
    case '+S':
    case '+GI':
      return { col: 4, row: baseRow + 1 };

    case 'KE':
    case 'N':
      return { col: 5, row: baseRow };

    case 'NK':
    case '+N':
    case '+KE':
      return { col: 5, row: baseRow + 1 };

    case 'KY':
    case 'L':
      return { col: 6, row: baseRow };

    case 'NY':
    case '+L':
    case '+KY':
      return { col: 6, row: baseRow + 1 };

    case 'FU':
    case 'P':
      return { col: 7, row: baseRow };

    case 'TO':
    case '+P':
    case '+FU':
      return { col: 7, row: baseRow + 1 };

    default:
      return { col: 7, row: baseRow };
  }
}
