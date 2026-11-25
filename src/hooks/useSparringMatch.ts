/**
 * React Hook for AI Sparring Match Session.
 * Manages player vs AI sparring loop, opening repertoire following,
 * out-of-book detection, Wasm engine dispatch, and board interaction.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { EngineId } from '../engine/engineConfig';
import { Color, MoveEvaluation, ShogiMove, Square } from '../types/shogi';
import { KifuTreeNode, MergedKifuTree } from '../types/tree';
import { MatchRecord } from '../types/match';
import { saveMatchRecord } from '../utils/matchHistoryStorage';
import { ShogiBoard } from '../utils/shogiBoard';
import {
  createInteractiveMove,
  getStrictLegalDropsForPiece,
  getStrictLegalMovesForSquare,
  isGameOver,
  isKingInCheck,
  parseUsiMove,
  pickFallbackAiMove,
} from '../utils/shogiRules';
import { useShogiEngine } from './useShogiEngine';

export type MatchState = 'idle' | 'player_turn' | 'ai_thinking' | 'finished';
export type MatchWinner = 'player' | 'ai' | 'draw' | null;
export type FinishReason = 'resign' | 'checkmate' | 'manual' | null;

export interface PendingPromotion {
  from: Square;
  to: Square;
}

export interface GameBranch {
  id: string;
  name: string;
  branchPly: number; // 0-based ply where divergence started
  moves: ShogiMove[];
}

export interface UseSparringMatchOptions {
  initialTree?: MergedKifuTree | null;
  defaultSearchTimeMs?: number;
}

export interface UseSparringMatchReturn {
  matchState: MatchState;
  playerColor: Color;
  board: ShogiBoard;
  moveHistory: ShogiMove[];
  currentMove?: ShogiMove;
  isOutOfBook: boolean;
  outOfBookPly: number | null;
  branches: GameBranch[];
  currentBranchId: string;
  switchBranch: (branchId: string) => void;
  winner: MatchWinner;
  finishReason: FinishReason;
  selectedSquare: Square | null;
  selectedHandPiece: string | null;
  validTargetSquares: Square[];
  pendingPromotion: PendingPromotion | null;
  searchTimeMs: number;
  activeEngineId: EngineId;
  engineStatus: import('../engine/types').EngineStatus;
  engineInfo: import('../engine/types').EngineSearchInfo | null;
  evaluation: MoveEvaluation | null;
  hintsViewedCount: number;
  recordHintViewed: () => void;
  completedRecord: MatchRecord | null;
  clearCompletedRecord: () => void;
  startMatch: (options?: {
    playerColor?: Color;
    openingTree?: MergedKifuTree | null;
    initialMoves?: ShogiMove[];
  }) => void;
  resignMatch: () => void;
  undoMove: () => void;
  resetMatch: () => void;
  handleSquareClick: (square: Square) => void;
  handleHandPieceSelect: (pieceKey: string) => void;
  confirmPromotion: (promote: boolean) => void;
  stepMove: (move: ShogiMove, fromPly?: number) => void;
  setSearchTimeMs: (ms: number) => void;
  switchEngine: (engineId: EngineId) => Promise<void>;
  searchPosition: (
    sfen?: string,
    moves?: string[],
    options?: { depth?: number; movetime?: number; byoyomi?: number }
  ) => Promise<import('../engine/types').EngineSearchResult>;
  isSearching: boolean;
}

/**
 * Sanitizes a flat move history that may contain accidental branch concatenations
 * (e.g., ply 110 followed by ply 106). Splits into clean branches.
 */
export function sanitizeMoveBranches(rawMoves: ShogiMove[]): {
  cleanMoves: ShogiMove[];
  detectedBranches: GameBranch[];
} {
  if (rawMoves.length === 0) {
    return { cleanMoves: [], detectedBranches: [] };
  }

  // Check if there is any ply drop
  let splitIndex = -1;
  for (let i = 1; i < rawMoves.length; i++) {
    const prev = rawMoves[i - 1];
    const curr = rawMoves[i];
    if (prev && curr && curr.ply <= prev.ply) {
      splitIndex = i;
      break;
    }
  }

  if (splitIndex === -1) {
    return { cleanMoves: rawMoves, detectedBranches: [] };
  }

  // A divergence occurred!
  const splitMove = rawMoves[splitIndex];
  if (!splitMove) {
    return { cleanMoves: rawMoves, detectedBranches: [] };
  }
  const branchStartPly = splitMove.ply;
  // Common prefix is moves where ply < branchStartPly
  const commonPrefixIndex = rawMoves.findIndex((m) => m && m.ply >= branchStartPly);
  const commonMoves = commonPrefixIndex > 0 ? rawMoves.slice(0, commonPrefixIndex) : [];

  const branch1Moves = rawMoves.slice(0, splitIndex);
  const branch2Moves = [...commonMoves, ...rawMoves.slice(splitIndex)];

  const branch1: GameBranch = {
    id: 'branch-1',
    name: `分岐 1 (${branchStartPly}手目〜)`,
    branchPly: branchStartPly - 1,
    moves: branch1Moves,
  };

  const branch2: GameBranch = {
    id: 'branch-2',
    name: `分岐 2 (${branchStartPly}手目〜)`,
    branchPly: branchStartPly - 1,
    moves: branch2Moves,
  };

  return {
    cleanMoves: branch2Moves,
    detectedBranches: [branch1, branch2],
  };
}

export function useSparringMatch(options: UseSparringMatchOptions = {}): UseSparringMatchReturn {
  const engine = useShogiEngine({ autoInit: true });

  const [matchState, setMatchState] = useState<MatchState>('idle');
  const [playerColor, setPlayerColor] = useState<Color>('b');
  const [board, setBoard] = useState<ShogiBoard>(() => new ShogiBoard());
  const [moveHistory, setMoveHistory] = useState<ShogiMove[]>([]);
  const [branches, setBranches] = useState<GameBranch[]>([]);
  const [currentBranchId, setCurrentBranchId] = useState<string>('main');
  const [isOutOfBook, setIsOutOfBook] = useState<boolean>(false);
  const [outOfBookPly, setOutOfBookPly] = useState<number | null>(null);
  const [winner, setWinner] = useState<MatchWinner>(null);
  const [finishReason, setFinishReason] = useState<FinishReason>(null);

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [selectedHandPiece, setSelectedHandPiece] = useState<string | null>(null);
  const [validTargetSquares, setValidTargetSquares] = useState<Square[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  const [searchTimeMs, setSearchTimeMs] = useState<number>(options.defaultSearchTimeMs ?? 1000);
  const [activeTree, setActiveTree] = useState<MergedKifuTree | null>(options.initialTree ?? null);
  const [currentTreeNode, setCurrentTreeNode] = useState<KifuTreeNode | null>(null);
  const [completedRecord, setCompletedRecord] = useState<MatchRecord | null>(null);

  const [hintsViewedCount, setHintsViewedCount] = useState<number>(0);

  const recordHintViewed = useCallback(() => {
    setHintsViewedCount((prev) => prev + 1);
  }, []);

  const boardRef = useRef<ShogiBoard>(board);
  boardRef.current = board;

  const moveHistoryRef = useRef<ShogiMove[]>(moveHistory);
  moveHistoryRef.current = moveHistory;

  const matchStateRef = useRef<MatchState>(matchState);
  matchStateRef.current = matchState;

  const startedAtRef = useRef<string>(new Date().toISOString());
  const isThinkingRef = useRef<boolean>(false);

  // Clear board selection
  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setSelectedHandPiece(null);
    setValidTargetSquares([]);
    setPendingPromotion(null);
  }, []);

  const clearCompletedRecord = useCallback(() => {
    setCompletedRecord(null);
  }, []);

  /**
   * Finishes the current match and records the match record to localStorage.
   */
  const finishMatch = useCallback(
    (win: MatchWinner, reason: FinishReason, finalMoves?: ShogiMove[]) => {
      engine.stop();
      isThinkingRef.current = false;
      setWinner(win);
      setFinishReason(reason);
      setMatchState('finished');
      clearSelection();

      const now = new Date().toISOString();
      let resultType: MatchRecord['result'] = 'draw';
      if (win === 'player') resultType = 'win';
      else if (win === 'ai') resultType = 'loss';
      else if (reason === 'manual') resultType = 'aborted';

      let matchReason: MatchRecord['reason'] = undefined;
      if (reason === 'checkmate') matchReason = 'checkmate';
      else if (reason === 'resign') matchReason = 'resignation';

      const movesToRecord = finalMoves ?? moveHistoryRef.current;
      const record: MatchRecord = {
        id: `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId: 'local_user',
        openingId: activeTree?.openingId || 'sparring_repertoire',
        startedAt: startedAtRef.current,
        endedAt: now,
        userColor: playerColor,
        startPly: 0,
        startSfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
        moves: [...movesToRecord],
        outOfBookPly: outOfBookPly ?? undefined,
        result: resultType,
        reason: matchReason,
        aiEngine: engine.activeEngineId,
        aiDepth: 12,
        isMergedIntoTree: false,
        hintsViewedCount,
      };

      saveMatchRecord(record);
      setCompletedRecord(record);
    },
    [activeTree, clearSelection, engine, hintsViewedCount, outOfBookPly, playerColor]
  );

  /**
   * Resets the entire match to initial state.
   */
  const resetMatch = useCallback(() => {
    isThinkingRef.current = false;
    engine.stop();
    const freshBoard = new ShogiBoard();
    setBoard(freshBoard);
    setMoveHistory([]);
    setBranches([]);
    setCurrentBranchId('main');
    setMatchState('idle');
    setIsOutOfBook(false);
    setOutOfBookPly(null);
    setWinner(null);
    setFinishReason(null);
    setCurrentTreeNode(null);
    setHintsViewedCount(0);
    clearSelection();
  }, [clearSelection, engine]);

  /**
   * Starts a new sparring match.
   */
  const startMatch = useCallback(
    (opts?: {
      playerColor?: Color;
      openingTree?: MergedKifuTree | null;
      initialMoves?: ShogiMove[];
    }) => {
      resetMatch();
      startedAtRef.current = new Date().toISOString();
      const chosenColor = opts?.playerColor ?? 'b';
      const tree = opts?.openingTree !== undefined ? opts.openingTree : activeTree;

      setPlayerColor(chosenColor);
      setActiveTree(tree);
      setCompletedRecord(null);

      const rawInitMoves = opts?.initialMoves ?? [];
      const { cleanMoves, detectedBranches } = sanitizeMoveBranches(rawInitMoves);
      if (detectedBranches.length > 0) {
        setBranches(detectedBranches);
        setCurrentBranchId(detectedBranches[detectedBranches.length - 1]?.id ?? 'main');
      }

      if (cleanMoves.length > 0) {
        const boardAfterInit = new ShogiBoard();
        for (const m of cleanMoves) {
          boardAfterInit.applyMove(m);
        }
        setBoard(boardAfterInit);
        setMoveHistory(cleanMoves);

        // Find current tree node if in book
        let node: KifuTreeNode | null = null;
        let outOfBook = false;
        let outPly: number | null = null;

        if (tree) {
          let currentList = tree.rootNodes;
          for (let i = 0; i < cleanMoves.length; i++) {
            const mv = cleanMoves[i];
            if (!mv) continue;
            const match = currentList.find(
              (c) => c.move.sfenMove === mv.sfenMove || c.id === mv.sfenMove
            );
            if (match) {
              node = match;
              currentList = match.children;
            } else {
              outOfBook = true;
              outPly = i + 1;
              break;
            }
          }
        } else {
          outOfBook = true;
          outPly = 1;
        }

        setCurrentTreeNode(node);
        setIsOutOfBook(outOfBook);
        setOutOfBookPly(outPly);

        const nextTurn = boardAfterInit.getTurn();
        if (nextTurn === chosenColor) {
          setMatchState('player_turn');
        } else {
          setMatchState('ai_thinking');
        }
      } else {
        setIsOutOfBook(tree ? false : true);
        setOutOfBookPly(tree ? null : 1);
        if (chosenColor === 'b') {
          setMatchState('player_turn');
        } else {
          setMatchState('ai_thinking');
        }
      }
    },
    [activeTree, resetMatch]
  );

  /**
   * Player resigns the match.
   */
  const resignMatch = useCallback(() => {
    if (matchState === 'idle' || matchState === 'finished') return;
    finishMatch('ai', 'resign');
  }, [finishMatch, matchState]);

  /**
   * Undoes the last turn (typically undoes AI move and player move, or 1 move).
   */
  const undoMove = useCallback(() => {
    if (moveHistory.length === 0 || matchState === 'idle') return;
    engine.stop();

    // Replay up to length - 2 if both played, or length - 1
    const stepsToUndo = moveHistory.length >= 2 && matchState === 'player_turn' ? 2 : 1;
    const remainingMoves = moveHistory.slice(0, moveHistory.length - stepsToUndo);

    const freshBoard = new ShogiBoard();
    for (const m of remainingMoves) {
      freshBoard.applyMove(m);
    }

    setBoard(freshBoard);
    setMoveHistory(remainingMoves);
    clearSelection();

    // Check book status
    let node: KifuTreeNode | null = null;
    let outOfBook = false;
    let outPly: number | null = null;

    if (activeTree) {
      let currentList = activeTree.rootNodes;
      for (let i = 0; i < remainingMoves.length; i++) {
        const mv = remainingMoves[i];
        if (!mv) continue;
        const match = currentList.find(
          (c) => c.move.sfenMove === mv.sfenMove || c.id === mv.sfenMove
        );
        if (match) {
          node = match;
          currentList = match.children;
        } else {
          outOfBook = true;
          outPly = i + 1;
          break;
        }
      }
    } else {
      outOfBook = true;
      outPly = 1;
    }

    setCurrentTreeNode(node);
    setIsOutOfBook(outOfBook);
    setOutOfBookPly(outPly);

    const currentTurn = freshBoard.getTurn();
    if (currentTurn === playerColor) {
      setMatchState('player_turn');
    } else {
      setMatchState('ai_thinking');
    }
  }, [activeTree, clearSelection, engine, matchState, moveHistory, playerColor]);

  /**
   * Executes a confirmed move on the board and triggers AI thinking if match ongoing.
   */
  const executePlayerMove = useCallback(
    (move: ShogiMove) => {
      const nextBoard = board.clone();
      nextBoard.applyMove(move);
      setBoard(nextBoard);

      const nextHistory = [...moveHistory, move];
      setMoveHistory(nextHistory);
      clearSelection();

      // Check if opponent (AI) has no legal moves (checkmate or stalemate)
      const aiColor: Color = playerColor === 'b' ? 'w' : 'b';
      const aiStatus = isGameOver(nextBoard, aiColor);
      if (aiStatus.isOver) {
        finishMatch('player', aiStatus.isCheckmate ? 'checkmate' : 'resign', nextHistory);
        return;
      }

      // Check repertoire book
      let nextTreeNode: KifuTreeNode | null = null;

      if (!isOutOfBook && activeTree) {
        const candidates = currentTreeNode ? currentTreeNode.children : activeTree.rootNodes;
        const matchingChild = candidates.find(
          (child) => child.move.sfenMove === move.sfenMove || child.id === move.sfenMove
        );

        if (matchingChild) {
          nextTreeNode = matchingChild;
        } else {
          setIsOutOfBook(true);
          setOutOfBookPly(move.ply);
        }
      }

      setCurrentTreeNode(nextTreeNode);
      setMatchState('ai_thinking');
    },
    [board, clearSelection, currentTreeNode, isOutOfBook, moveHistory, activeTree]
  );

  /**
   * Forcibly steps a move onto the board (e.g., executing an AI best move or mate step).
   * Supports branching from an earlier review ply if fromPly is specified and < moveHistory.length.
   */
  const stepMove = useCallback(
    (move: ShogiMove, fromPly?: number) => {
      let baseHistory = moveHistory;
      let isBranching = false;
      const targetPly = fromPly !== undefined ? fromPly : moveHistory.length;

      if (targetPly < moveHistory.length) {
        isBranching = true;
        baseHistory = moveHistory.slice(0, targetPly);
      }

      // Reconstruct board up to targetPly
      const baseBoard = new ShogiBoard();
      for (const m of baseHistory) {
        baseBoard.applyMove(m);
      }
      const nextBoard = baseBoard.clone();
      nextBoard.applyMove(move);
      setBoard(nextBoard);

      const nextHistory = [...baseHistory, move];
      setMoveHistory(nextHistory);
      clearSelection();

      if (isBranching) {
        setBranches((prevBranches) => {
          const updated = [...prevBranches];
          // Register previous full moveHistory as Branch 1 if not yet registered
          if (updated.length === 0) {
            updated.push({
              id: 'branch-1',
              name: `分岐 1 (${targetPly + 1}手目〜)`,
              branchPly: targetPly,
              moves: moveHistory,
            });
          } else {
            // Update current active branch
            const curIdx = updated.findIndex((b) => b.id === currentBranchId);
            const curBranch = updated[curIdx];
            if (curIdx >= 0 && curBranch) {
              updated[curIdx] = { ...curBranch, moves: moveHistory };
            }
          }
          const newBranchId = `branch-${Date.now()}`;
          const newBranch: GameBranch = {
            id: newBranchId,
            name: `分岐 ${updated.length + 1} (${targetPly + 1}手目〜)`,
            branchPly: targetPly,
            moves: nextHistory,
          };
          updated.push(newBranch);
          setCurrentBranchId(newBranchId);
          return updated;
        });
      } else {
        if (branches.length > 0) {
          setBranches((prev) =>
            prev.map((b) => (b.id === currentBranchId ? { ...b, moves: nextHistory } : b))
          );
        }
      }

      // Check if this move ended the game
      const nextTurn = nextBoard.getTurn();
      const nextTurnSide = nextTurn === playerColor ? 'player' : 'ai';
      const status = isGameOver(nextBoard, nextTurn);
      if (status.isOver) {
        finishMatch(
          nextTurnSide === 'player' ? 'ai' : 'player',
          status.isCheckmate ? 'checkmate' : 'resign',
          nextHistory
        );
        return;
      }

      // Check repertoire book
      let nextTreeNode: KifuTreeNode | null = null;
      if (!isOutOfBook && activeTree) {
        const candidates = currentTreeNode ? currentTreeNode.children : activeTree.rootNodes;
        const matchingChild = candidates.find(
          (child) => child.move.sfenMove === move.sfenMove || child.id === move.sfenMove
        );
        if (matchingChild) {
          nextTreeNode = matchingChild;
        } else {
          setIsOutOfBook(true);
          setOutOfBookPly((prev) => (prev === null ? move.ply : prev));
        }
      }
      setCurrentTreeNode(nextTreeNode);

      // Transition turn based on who's to move next
      if (nextTurn === playerColor) {
        setMatchState('player_turn');
      } else {
        setMatchState('ai_thinking');
      }
    },
    [
      activeTree,
      branches.length,
      clearSelection,
      currentBranchId,
      currentTreeNode,
      finishMatch,
      isOutOfBook,
      moveHistory,
      playerColor,
    ]
  );

  /**
   * Switches the active line to a saved branch.
   */
  const switchBranch = useCallback(
    (branchId: string) => {
      const targetBranch = branches.find((b) => b.id === branchId);
      if (!targetBranch) return;

      const targetMoves = targetBranch.moves;
      const reconstructedBoard = new ShogiBoard();
      for (const m of targetMoves) {
        reconstructedBoard.applyMove(m);
      }

      setBoard(reconstructedBoard);
      setMoveHistory(targetMoves);
      setCurrentBranchId(branchId);
      clearSelection();

      // Check out-of-book status for new branch
      if (activeTree) {
        let node: KifuTreeNode | null = null;
        let outOfBook = false;
        let outPly: number | null = null;
        let currentList = activeTree.rootNodes;
        for (let i = 0; i < targetMoves.length; i++) {
          const mv = targetMoves[i];
          if (!mv) continue;
          const match = currentList.find(
            (c) => c.move.sfenMove === mv.sfenMove || c.id === mv.sfenMove
          );
          if (match) {
            node = match;
            currentList = match.children;
          } else {
            outOfBook = true;
            outPly = i + 1;
            break;
          }
        }
        setCurrentTreeNode(node);
        setIsOutOfBook(outOfBook);
        setOutOfBookPly(outPly);
      }

      const turn = reconstructedBoard.getTurn();
      if (turn === playerColor) {
        setMatchState('player_turn');
      } else {
        setMatchState('ai_thinking');
      }
    },
    [activeTree, branches, clearSelection, playerColor]
  );

  /**
   * Confirm or cancel promotion for pending move.
   */
  const confirmPromotion = useCallback(
    (promote: boolean) => {
      if (!pendingPromotion) return;
      const { from, to } = pendingPromotion;
      const ply = board.getPly();
      const lastMove = moveHistory[moveHistory.length - 1];
      const move = createInteractiveMove(
        board,
        ply,
        playerColor,
        from,
        to,
        promote,
        undefined,
        lastMove?.to
      );
      executePlayerMove(move);
    },
    [board, executePlayerMove, moveHistory, pendingPromotion, playerColor]
  );

  /**
   * Handles clicking a square on the Shogi board.
   */
  const handleSquareClick = useCallback(
    (square: Square) => {
      if (matchState !== 'player_turn') return;
      if (pendingPromotion) return; // Wait for promotion confirmation

      const pieceOnSquare = board.getSquare(square.file, square.rank);
      const isSentePiece = pieceOnSquare ? pieceOnSquare === pieceOnSquare.toUpperCase() : false;
      const pieceColor: Color = isSentePiece ? 'b' : 'w';

      // 1. If a piece in hand was selected for drop:
      if (selectedHandPiece) {
        const isValidDrop = validTargetSquares.some(
          (s) => s.file === square.file && s.rank === square.rank
        );
        if (isValidDrop) {
          const ply = board.getPly();
          const lastMove = moveHistory[moveHistory.length - 1];
          const dropMove = createInteractiveMove(
            board,
            ply,
            playerColor,
            undefined,
            square,
            false,
            selectedHandPiece,
            lastMove?.to
          );
          executePlayerMove(dropMove);
        } else {
          clearSelection();
        }
        return;
      }

      // 2. If a board square was already selected:
      if (selectedSquare) {
        // Clicking same square deselects
        if (selectedSquare.file === square.file && selectedSquare.rank === square.rank) {
          clearSelection();
          return;
        }

        // Clicking another piece of own color changes selection
        if (pieceOnSquare && pieceColor === playerColor) {
          const legalMoves = getStrictLegalMovesForSquare(board, square);
          setSelectedSquare(square);
          setValidTargetSquares(legalMoves.map((m) => m.to));
          return;
        }

        // Check if clicked square is among valid target squares
        const targetMove = getStrictLegalMovesForSquare(board, selectedSquare).find(
          (m) => m.to.file === square.file && m.to.rank === square.rank
        );

        if (targetMove) {
          if (targetMove.forcePromote) {
            // Mandatory promotion
            const ply = board.getPly();
            const lastMove = moveHistory[moveHistory.length - 1];
            const move = createInteractiveMove(
              board,
              ply,
              playerColor,
              selectedSquare,
              square,
              true,
              undefined,
              lastMove?.to
            );
            executePlayerMove(move);
          } else if (targetMove.canPromote) {
            // Optional promotion: ask user
            setPendingPromotion({ from: selectedSquare, to: square });
          } else {
            // No promotion
            const ply = board.getPly();
            const lastMove = moveHistory[moveHistory.length - 1];
            const move = createInteractiveMove(
              board,
              ply,
              playerColor,
              selectedSquare,
              square,
              false,
              undefined,
              lastMove?.to
            );
            executePlayerMove(move);
          }
        } else {
          clearSelection();
        }
        return;
      }

      // 3. Nothing was selected yet: select piece on clicked square if it belongs to player
      if (pieceOnSquare && pieceColor === playerColor) {
        const legalMoves = getStrictLegalMovesForSquare(board, square);
        setSelectedSquare(square);
        setSelectedHandPiece(null);
        setValidTargetSquares(legalMoves.map((m) => m.to));
      }
    },
    [
      board,
      clearSelection,
      executePlayerMove,
      matchState,
      moveHistory,
      pendingPromotion,
      playerColor,
      selectedHandPiece,
      selectedSquare,
      validTargetSquares,
    ]
  );

  /**
   * Handles clicking a piece on player's Komadai (piece stand).
   */
  const handleHandPieceSelect = useCallback(
    (pieceKey: string) => {
      if (matchState !== 'player_turn') return;
      if (pendingPromotion) return;

      if (selectedHandPiece === pieceKey) {
        clearSelection();
        return;
      }

      const validDrops = getStrictLegalDropsForPiece(board, pieceKey, playerColor);
      setSelectedSquare(null);
      setSelectedHandPiece(pieceKey);
      setValidTargetSquares(validDrops);
    },
    [board, clearSelection, matchState, pendingPromotion, playerColor, selectedHandPiece]
  );

  /**
   * AI Thinking Loop: triggers whenever matchState changes to 'ai_thinking'.
   */
  useEffect(() => {
    if (matchState !== 'ai_thinking') return;
    if (isThinkingRef.current) return;

    isThinkingRef.current = true;
    let isCancelled = false;

    const runAiTurn = async () => {
      const currentBrd = boardRef.current;
      const history = moveHistoryRef.current;
      const aiColor: Color = playerColor === 'b' ? 'w' : 'b';
      const ply = currentBrd.getPly();

      // Check if we can follow the book
      let bookMoveToPlay: ShogiMove | null = null;
      let nextChildNode: KifuTreeNode | null = null;

      if (!isOutOfBook && activeTree) {
        const candidates = currentTreeNode ? currentTreeNode.children : activeTree.rootNodes;
        if (candidates.length > 0) {
          // Sort candidates by mainline or gameCount
          const sorted = [...candidates].sort((a, b) => {
            if (a.isMainline && !b.isMainline) return -1;
            if (!a.isMainline && b.isMainline) return 1;
            return b.gameCount - a.gameCount;
          });
          const chosenNode = sorted[0];
          if (chosenNode) {
            bookMoveToPlay = chosenNode.move;
            nextChildNode = chosenNode;
          }
        }
      }

      // 1. Play Book Move (with natural brief delay)
      if (bookMoveToPlay && nextChildNode) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        if (isCancelled) return;

        const nextBoard = currentBrd.clone();
        nextBoard.applyMove(bookMoveToPlay);

        setBoard(nextBoard);
        setMoveHistory([...history, bookMoveToPlay]);
        setCurrentTreeNode(nextChildNode);

        // Check if player is checkmated or has no legal moves
        const nextMoves = [...history, bookMoveToPlay];
        const playerStatus = isGameOver(nextBoard, playerColor);
        if (playerStatus.isOver) {
          finishMatch('ai', playerStatus.isCheckmate ? 'checkmate' : 'resign', nextMoves);
          return;
        }

        setMatchState('player_turn');
        isThinkingRef.current = false;
        return;
      }

      // 2. Out of Book -> Dispatch to Wasm AI Engine
      setIsOutOfBook(true);
      setOutOfBookPly((prev) => (prev === null ? ply : prev));

      try {
        const usiMoves = history.map((m) => m.sfenMove);
        const searchResult = await engine.searchPosition(undefined, usiMoves, {
          movetime: searchTimeMs,
        });

        if (isCancelled) return;

        const bestMoveStr = searchResult.bestMove?.trim();
        const isResignOrNone =
          !bestMoveStr ||
          bestMoveStr === 'resign' ||
          bestMoveStr === 'none' ||
          bestMoveStr === '(none)';

        if (isResignOrNone) {
          // If engine resigned or returned none, check if it was due to Wasm offline or early resign
          // Pick a legal move from strictly legal moves (including evasion when in check)
          const fallbackUsi = pickFallbackAiMove(currentBrd, aiColor);
          if (fallbackUsi) {
            const lastMove = history[history.length - 1];
            const parsedMove = parseUsiMove(fallbackUsi, currentBrd, ply, aiColor, lastMove?.to);
            if (parsedMove) {
              const nextBoard = currentBrd.clone();
              nextBoard.applyMove(parsedMove);
              setBoard(nextBoard);
              const nextMoves = [...history, parsedMove];
              setMoveHistory(nextMoves);

              const playerStatus = isGameOver(nextBoard, playerColor);
              if (playerStatus.isOver) {
                finishMatch('ai', playerStatus.isCheckmate ? 'checkmate' : 'resign', nextMoves);
                return;
              }
              setMatchState('player_turn');
              return;
            }
          }

          const playerStatus = isGameOver(currentBrd, playerColor);
          if (playerStatus.isOver) {
            finishMatch('ai', playerStatus.isCheckmate ? 'checkmate' : 'resign');
          } else {
            finishMatch('player', isKingInCheck(currentBrd, aiColor) ? 'checkmate' : 'resign');
          }
          return;
        }

        const lastMove = history[history.length - 1];
        const parsedMove = parseUsiMove(
          bestMoveStr,
          currentBrd,
          ply,
          aiColor,
          lastMove?.to
        );

        if (parsedMove) {
          if (searchResult.evaluation) {
            parsedMove.evaluation = searchResult.evaluation;
          }

          const nextBoard = currentBrd.clone();
          nextBoard.applyMove(parsedMove);

          setBoard(nextBoard);
          const nextMoves = [...history, parsedMove];
          setMoveHistory(nextMoves);

          // Check if player is checkmated or has no legal moves
          const playerStatus = isGameOver(nextBoard, playerColor);
          if (playerStatus.isOver) {
            finishMatch('ai', playerStatus.isCheckmate ? 'checkmate' : 'resign', nextMoves);
            return;
          }

          setMatchState('player_turn');
        } else {
          // Fallback if move could not be parsed: check if player was checkmated
          const playerStatus = isGameOver(currentBrd, playerColor);
          if (playerStatus.isOver) {
            finishMatch('ai', playerStatus.isCheckmate ? 'checkmate' : 'resign');
          } else {
            finishMatch('player', 'resign');
          }
        }
      } catch (err) {
        console.warn('[AI Sparring] Wasm engine calculation unavailable or timed out, executing fallback heuristic move:', err);
        if (!isCancelled) {
          const fallbackUsi = pickFallbackAiMove(currentBrd, aiColor);
          if (fallbackUsi) {
            const lastMove = history[history.length - 1];
            const parsedMove = parseUsiMove(fallbackUsi, currentBrd, ply, aiColor, lastMove?.to);
            if (parsedMove) {
              const nextBoard = currentBrd.clone();
              nextBoard.applyMove(parsedMove);
              setBoard(nextBoard);
              const nextMoves = [...history, parsedMove];
              setMoveHistory(nextMoves);

              const playerStatus = isGameOver(nextBoard, playerColor);
              if (playerStatus.isOver) {
                finishMatch('ai', playerStatus.isCheckmate ? 'checkmate' : 'resign', nextMoves);
                return;
              }
              setMatchState('player_turn');
              return;
            }
          }

          const playerStatus = isGameOver(currentBrd, playerColor);
          if (playerStatus.isOver) {
            finishMatch('ai', playerStatus.isCheckmate ? 'checkmate' : 'resign');
          } else {
            finishMatch('player', 'resign');
          }
        }
      } finally {
        isThinkingRef.current = false;
      }
    };

    runAiTurn();

    return () => {
      isCancelled = true;
      isThinkingRef.current = false;
    };
  }, [
    activeTree,
    currentTreeNode,
    engine,
    finishMatch,
    isOutOfBook,
    matchState,
    playerColor,
    searchTimeMs,
  ]);

  const currentMove = moveHistory[moveHistory.length - 1];

  return {
    matchState,
    playerColor,
    board,
    moveHistory,
    currentMove,
    isOutOfBook,
    outOfBookPly,
    branches,
    currentBranchId,
    switchBranch,
    winner,
    finishReason,
    selectedSquare,
    selectedHandPiece,
    validTargetSquares,
    pendingPromotion,
    searchTimeMs,
    activeEngineId: engine.activeEngineId,
    engineStatus: engine.status,
    engineInfo: engine.currentInfo,
    evaluation: engine.evaluation,
    hintsViewedCount,
    recordHintViewed,
    completedRecord,
    clearCompletedRecord,
    startMatch,
    resignMatch,
    undoMove,
    resetMatch,
    handleSquareClick,
    handleHandPieceSelect,
    confirmPromotion,
    stepMove,
    setSearchTimeMs,
    switchEngine: engine.switchEngine,
    searchPosition: engine.searchPosition,
    isSearching: engine.isSearching,
  };
}
