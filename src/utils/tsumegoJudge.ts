/**
 * Tsumego Move Judge & Verification Utility.
 *
 * Implements checkmate problem rules:
 * 1. Attack rule: EVERY solver move MUST be a legal check. Non-check moves are rejected.
 * 2. Wrong-check refutation: verifies whether the defender can escape within the remaining
 *    ply limit and returns the actual escaping/capturing move so the UI can demonstrate it.
 * 3. Solution line matching & alternative mates:
 *    - When `acceptAllMatingMoves` is true, alternative lines that still force mate are accepted.
 *    - In strict mode (`acceptAllMatingMoves: false`), off-PV moves are refuted via `errorCode: 'off_pv'`.
 *
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import { Color, Square } from '../types/shogi';
import { TsumegoProblem } from '../types/tsumego';
import { ShogiBoard } from './shogiBoard';
import {
  LegalUsiMove,
  findKing,
  getAllStrictLegalMoves,
  isKingInCheck,
  parseUsiMove,
} from './shogiRules';

export interface TsumegoJudgeResult {
  isCheck: boolean; // true if the move gave check to the opponent king
  isCorrect: boolean; // true if move advances the checkmate sequence
  isCompleted: boolean; // true if the problem has been fully checkmated
  isRefuted?: boolean; // true when a legal check failed because defender has an escape or off-PV reply
  boardAfterPlayerSfen?: string; // SFEN right after solver move before opponent reply
  opponentReply?: string; // USI move string of the defending king's response
  refutationMove?: string; // USI move string showing how defender escapes / captures
  nextBoardSfen: string; // Final SFEN state after move + opponent reply/refutation
  errorCode?: 'illegal' | 'not_check' | 'parse_failed' | 'refuted' | 'off_pv';
  errorMessage?: string; // Optional non-localized diagnostic text
}

interface SearchBudget {
  nodes: number;
  maxNodes: number;
  deadline: number;
  aborted: boolean;
}

function applyMoveUsiOnClone(board: ShogiBoard, usi: string, side: Color): ShogiBoard | null {
  try {
    const next = board.clone();
    const parsed = parseUsiMove(usi, next, next.getPly(), side);
    if (!parsed) return null;
    next.applyMove(parsed);
    return next;
  } catch {
    return null;
  }
}

/**
 * Checks whether a given USI move gives check to the opponent's king.
 */
export function doesMoveGiveCheck(
  board: ShogiBoard,
  usiMove: string,
  sideToMove: Color
): boolean {
  const next = applyMoveUsiOnClone(board, usiMove, sideToMove);
  if (!next) return false;
  const opponentColor: Color = sideToMove === 'b' ? 'w' : 'b';
  return isKingInCheck(next, opponentColor);
}

/**
 * Checks if a move is legal under standard shogi rules.
 */
export function isMoveLegal(
  board: ShogiBoard,
  usiMove: string,
  sideToMove: Color
): boolean {
  const legalMoves = getAllStrictLegalMoves(board, sideToMove);
  return legalMoves.some((m) => m.usi === usiMove);
}

/**
 * Ranks defensive evasions so natural human-like refutations come first:
 * 3: non-King captures attacking piece, 2: King captures attacking piece,
 * 1: King escapes, 0: interposition/drop/other evasion.
 */
function rankDefenseEvasions(
  boardAfterPlayer: ShogiBoard,
  legalEvasions: LegalUsiMove[],
  attackToSquare: Square
): LegalUsiMove[] {
  const getTier = (eva: LegalUsiMove): number => {
    const isCaptureAttack =
      eva.to.file === attackToSquare.file && eva.to.rank === attackToSquare.rank;
    const mover = eva.from ? boardAfterPlayer.getSquare(eva.from.file, eva.from.rank) : null;
    const isKing = mover?.toUpperCase() === 'K';
    if (isCaptureAttack) return isKing ? 2 : 3;
    return isKing ? 1 : 0;
  };

  return [...legalEvasions].sort((a, b) => {
    const tierDiff = getTier(b) - getTier(a);
    if (tierDiff !== 0) return tierDiff;
    return b.scoreWeight - a.scoreWeight;
  });
}

/**
 * Bounded check-only AND/OR search testing if `attacker` has a forced mate
 * within `remainingPly` plies starting from `attacker`'s turn.
 */
function hasForcedMateWithin(
  board: ShogiBoard,
  attacker: Color,
  defender: Color,
  remainingPly: number,
  budget: SearchBudget
): boolean {
  const solveAttacker = (curBoard: ShogiBoard, remPly: number): boolean => {
    if (remPly <= 0 || budget.aborted) return false;
    budget.nodes += 1;
    if (budget.nodes > budget.maxNodes || Date.now() > budget.deadline) {
      budget.aborted = true;
      return false;
    }

    const defenderKing = findKing(curBoard, defender);
    if (!defenderKing) return false;

    const legal = getAllStrictLegalMoves(curBoard, attacker);
    const checks: Array<{ board: ShogiBoard; priority: number }> = [];

    for (const mv of legal) {
      const nextBoard = applyMoveUsiOnClone(curBoard, mv.usi, attacker);
      if (!nextBoard || !isKingInCheck(nextBoard, defender)) continue;
      const dist =
        Math.abs(mv.to.file - defenderKing.file) + Math.abs(mv.to.rank - defenderKing.rank);
      const isCapture = Boolean(curBoard.getSquare(mv.to.file, mv.to.rank));
      checks.push({
        board: nextBoard,
        priority: (isCapture ? 10 : 0) + (mv.dropPiece ? 4 : 0) - dist,
      });
    }

    checks.sort((a, b) => b.priority - a.priority);

    for (const chk of checks) {
      if (budget.aborted) return false;
      if (remPly <= 1) {
        if (getAllStrictLegalMoves(chk.board, defender).length === 0) {
          return true;
        }
        continue;
      }
      if (solveDefender(chk.board, remPly - 1)) {
        return true;
      }
    }

    return false;
  };

  const solveDefender = (curBoard: ShogiBoard, remPly: number): boolean => {
    if (budget.aborted) return false;
    budget.nodes += 1;
    if (budget.nodes > budget.maxNodes || Date.now() > budget.deadline) {
      budget.aborted = true;
      return false;
    }

    const evasions = getAllStrictLegalMoves(curBoard, defender);
    if (evasions.length === 0) return true;
    if (remPly <= 0) return false;

    for (const eva of evasions) {
      if (budget.aborted) return false;
      const nextBoard = applyMoveUsiOnClone(curBoard, eva.usi, defender);
      if (!nextBoard) continue;
      if (!solveAttacker(nextBoard, remPly - 1)) {
        return false;
      }
    }

    return !budget.aborted;
  };

  return solveAttacker(board, remainingPly);
}

function buildRefutedResult(
  boardAfterPlayer: ShogiBoard,
  boardAfterPlayerSfen: string,
  defendingSide: Color,
  refutationUsi: string,
  errorCode: 'refuted' | 'off_pv',
  errorMessage: string
): TsumegoJudgeResult {
  const afterRefutation = applyMoveUsiOnClone(boardAfterPlayer, refutationUsi, defendingSide);
  return {
    isCheck: true,
    isCorrect: false,
    isCompleted: false,
    isRefuted: true,
    boardAfterPlayerSfen,
    refutationMove: refutationUsi,
    nextBoardSfen: afterRefutation ? afterRefutation.toSfen() : boardAfterPlayerSfen,
    errorCode,
    errorMessage,
  };
}

/**
 * Evaluates a solver's move against a Tsumego problem.
 */
export function judgeTsumegoMove(
  problem: TsumegoProblem,
  currentPly: number,
  currentBoard: ShogiBoard,
  playedUsi: string
): TsumegoJudgeResult {
  const solverSide = problem.sideToMove;
  const defendingSide: Color = solverSide === 'b' ? 'w' : 'b';

  // 1. Guard: Check if move is legal on current board
  if (!isMoveLegal(currentBoard, playedUsi, solverSide)) {
    return {
      isCheck: false,
      isCorrect: false,
      isCompleted: false,
      nextBoardSfen: currentBoard.toSfen(),
      errorCode: 'illegal',
      errorMessage: 'Illegal move',
    };
  }

  // 2. Attack rule: For attack problems, EVERY solver move MUST give check
  const isCheck = doesMoveGiveCheck(currentBoard, playedUsi, solverSide);
  if (problem.kind === 'attack' && !isCheck) {
    return {
      isCheck: false,
      isCorrect: false,
      isCompleted: false,
      nextBoardSfen: currentBoard.toSfen(),
      errorCode: 'not_check',
      errorMessage: 'Move must give check',
    };
  }

  const parsedUserMove = parseUsiMove(
    playedUsi,
    currentBoard,
    currentBoard.getPly(),
    solverSide
  );
  if (!parsedUserMove) {
    return {
      isCheck,
      isCorrect: false,
      isCompleted: false,
      nextBoardSfen: currentBoard.toSfen(),
      errorCode: 'parse_failed',
      errorMessage: 'Failed to parse move',
    };
  }

  const boardAfterPlayer = currentBoard.clone();
  boardAfterPlayer.applyMove(parsedUserMove);
  const boardAfterPlayerSfen = boardAfterPlayer.toSfen();
  const nextPly = currentPly + 1;

  // 3. Immediate checkmate wins unconditionally
  const opponentLegalMoves = getAllStrictLegalMoves(boardAfterPlayer, defendingSide);
  if (opponentLegalMoves.length === 0) {
    return {
      isCheck: true,
      isCorrect: true,
      isCompleted: true,
      boardAfterPlayerSfen,
      nextBoardSfen: boardAfterPlayerSfen,
    };
  }

  const rankedEvasions = rankDefenseEvasions(
    boardAfterPlayer,
    opponentLegalMoves,
    parsedUserMove.to
  );
  const remainingAfterPlayer = problem.moveLimit - nextPly;

  // 4. Out of remaining plies yet defender still has legal evasions -> refuted
  if (remainingAfterPlayer <= 0) {
    const refutationUsi = rankedEvasions[0]!.usi;
    return buildRefutedResult(
      boardAfterPlayer,
      boardAfterPlayerSfen,
      defendingSide,
      refutationUsi,
      'refuted',
      'Defender has a legal escape within move limit'
    );
  }

  const hasRecordedPv = problem.solutionPv.length > 0;
  const expectedMove = problem.solutionPv[currentPly];

  // 5. Matches recorded PV move: advance along PV (or top ranked evasion if PV ended early)
  if (hasRecordedPv && playedUsi === expectedMove) {
    const pvReply = problem.solutionPv[nextPly];
    const replyIsLegal = Boolean(pvReply && opponentLegalMoves.some((m) => m.usi === pvReply));
    const opponentReply = replyIsLegal && pvReply ? pvReply : rankedEvasions[0]!.usi;
    const afterOpponent = applyMoveUsiOnClone(boardAfterPlayer, opponentReply, defendingSide);
    return {
      isCheck: true,
      isCorrect: true,
      isCompleted: false,
      boardAfterPlayerSfen,
      opponentReply,
      nextBoardSfen: afterOpponent ? afterOpponent.toSfen() : boardAfterPlayerSfen,
    };
  }

  // 6. Off-PV check with plies remaining: verify if any evasion escapes forced mate
  const budget: SearchBudget = {
    nodes: 0,
    maxNodes: 4000,
    deadline: Date.now() + 250,
    aborted: false,
  };

  for (const eva of rankedEvasions) {
    const afterEva = applyMoveUsiOnClone(boardAfterPlayer, eva.usi, defendingSide);
    if (!afterEva) continue;
    const stillMates = hasForcedMateWithin(
      afterEva,
      solverSide,
      defendingSide,
      remainingAfterPlayer - 1,
      budget
    );
    if (!stillMates) {
      return buildRefutedResult(
        boardAfterPlayer,
        boardAfterPlayerSfen,
        defendingSide,
        eva.usi,
        'refuted',
        'Defender escapes checkmate'
      );
    }
  }

  // All evasions still lead to forced mate within remaining plies
  if (!hasRecordedPv || problem.acceptAllMatingMoves) {
    let chosenReply = rankedEvasions[0]!.usi;
    if (remainingAfterPlayer >= 4) {
      const nonImmediate = rankedEvasions.find((eva) => {
        const afterEva = applyMoveUsiOnClone(boardAfterPlayer, eva.usi, defendingSide);
        if (!afterEva) return false;
        const quickBudget: SearchBudget = {
          nodes: 0,
          maxNodes: 1000,
          deadline: Date.now() + 80,
          aborted: false,
        };
        return !hasForcedMateWithin(afterEva, solverSide, defendingSide, 1, quickBudget);
      });
      if (nonImmediate) {
        chosenReply = nonImmediate.usi;
      }
    }

    const afterOpponent = applyMoveUsiOnClone(boardAfterPlayer, chosenReply, defendingSide);
    return {
      isCheck: true,
      isCorrect: true,
      isCompleted: false,
      boardAfterPlayerSfen,
      opponentReply: chosenReply,
      nextBoardSfen: afterOpponent ? afterOpponent.toSfen() : boardAfterPlayerSfen,
    };
  }

  return buildRefutedResult(
    boardAfterPlayer,
    boardAfterPlayerSfen,
    defendingSide,
    rankedEvasions[0]!.usi,
    'off_pv',
    'Move differs from the expected solution line'
  );
}
