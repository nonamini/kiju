/**
 * Converter between Studio Game (JKF / Evaluated Plies) and Tactical Quiz Cards.
 * Extracts pedagogical quiz cards from analyzed Studio games and persists them to Quiz Pool.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript typed without 'any' (Rule 2).
 */

import { TacticalQuizCard, QuizChoice } from '../types/quiz';
import { Color, MoveEvaluation, PieceType, ShogiMove } from '../types/shogi';
import { ShogiBoard, INITIAL_HIRATE_SFEN } from './shogiBoard';
import { getAllStrictLegalMoves } from './shogiRules';
import {
  clearDeletedQuizId,
  loadQuizPool,
  saveQuizPool,
  mergeQuizCards,
} from './quizPoolStorage';
import { JKFPlayer, Formats } from 'json-kifu-format';

// Map JKF 1-based coordinates to USI rank character
const RANK_TO_CHAR = ['', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

// Map JKF piece kinds to USI drop characters
const JKF_TO_USI_PIECE: Record<string, string> = {
  FU: 'P',
  KY: 'L',
  KE: 'N',
  GI: 'S',
  KI: 'G',
  KA: 'B',
  HI: 'R',
  OU: 'K',
};

/**
 * Converts a Sente-normalized centipawn score to winning probability (0.0 .. 1.0).
 * Uses standard logistic sigmoid with scale parameter 600 (Spec §3.4).
 */
export function cpToWinRate(cpSente: number): number {
  return 1 / (1 + Math.exp(-cpSente / 600));
}

export interface JkfMoveData {
  from?: { x: number; y: number };
  to: { x: number; y: number };
  piece: string;
  promote?: boolean;
}

/**
 * Converts a JKF Move format into standard USI move string.
 */
export function jkfMoveToUsi(move: JkfMoveData): string {
  const tox = move.to.x;
  const toyChar = RANK_TO_CHAR[move.to.y] || 'a';

  if (!move.from || move.from.x === 0 || move.from.y === 0) {
    // Drop move: e.g. "P*5e"
    const pieceChar = JKF_TO_USI_PIECE[move.piece] || 'P';
    return `${pieceChar}*${tox}${toyChar}`;
  }

  // Board move: e.g. "7g7f", "8h2b+"
  const fromx = move.from.x;
  const fromyChar = RANK_TO_CHAR[move.from.y] || 'a';
  const promo = move.promote ? '+' : '';
  return `${fromx}${fromyChar}${tox}${toyChar}${promo}`;
}

export interface StudioQuizExtractionParams {
  gameId: string;
  openingId: string;
  totalPlies: number;
  evaluations: Map<number, MoveEvaluation>;
  getMoveAtPly: (ply: number) => JkfMoveData | null | undefined;
}

/**
 * Extracts tactical quiz cards directly from an evaluated Studio match
 * focusing on dramatic turns (blunders and brilliant moves).
 */
export function extractStudioQuizCards(params: StudioQuizExtractionParams): TacticalQuizCard[] {
  const { gameId, openingId, totalPlies, evaluations, getMoveAtPly } = params;
  const cards: TacticalQuizCard[] = [];

  // Step 1: Pre-build array of all USI moves in the game
  const allGameUsiMoves: string[] = [];
  for (let p = 1; p <= totalPlies; p++) {
    const moveData = getMoveAtPly(p);
    if (moveData) {
      allGameUsiMoves.push(jkfMoveToUsi(moveData));
    }
  }

  // Step 2: Iterate through all moves and find candidate turning points
  interface CandidatePoint {
    ply: number; // The ply where the move happened (1-indexed)
    scoreDiff: number; // Mover's point of view
    winRateSwing: number; // Absolute change in Sente-normalized win rate
    winRateBefore: number; // Sente-normalized win rate at (p - 1)
    type: 'attack' | 'defense' | 'race' | 'mate';
    evalBefore: MoveEvaluation;
    actualMoveUsi: string;
  }

  const candidates: CandidatePoint[] = [];

  for (let p = 1; p <= totalPlies; p++) {
    // Exclude early opening moves (ply < 12) as per Spec §4.2
    if (p < 12) continue;

    const prevEval = evaluations.get(p - 1);
    const currEval = evaluations.get(p);
    if (!prevEval || !currEval) continue;

    // We need bestMove and pv from the position BEFORE the move (at p - 1)
    if (!prevEval.bestMove || !prevEval.pv || prevEval.pv.length === 0) continue;
    if (prevEval.bestMove === 'none' || prevEval.bestMove === 'resign') continue;

    const actualMoveUsi = allGameUsiMoves[p - 1];
    if (!actualMoveUsi) continue;

    // Compute Sente-normalized win rates (Spec §3.3 - §3.4)
    const prevWr = cpToWinRate(prevEval.scoreCp);
    const currWr = cpToWinRate(currEval.scoreCp);

    // Rule: Exclude already decided positions (WR >= 0.98 or WR <= 0.02) as per Spec §4.2
    if (prevWr >= 0.98 || prevWr <= 0.02) continue;

    // Win rate swing: Absolute difference between the two positions
    const winRateSwing = Math.abs(currWr - prevWr);

    // Side to move at (p - 1): Odd p is Sente (b), Even p is Gote (w)
    const moverColor: Color = p % 2 === 1 ? 'b' : 'w';

    // Mover's win rate BEFORE the move (at p - 1)
    const moverWrBefore = moverColor === 'b' ? prevWr : 1 - prevWr;
    // F1 / F4 Filter: Do not extract quizzes from hopeless/decided positions for the mover!
    // If moverWrBefore < 0.20, mover is already facing an overwhelming loss / "longest resistance"
    if (moverWrBefore < 0.20) continue;

    // Evaluation swing from mover's perspective
    // Sente gains when currEval > prevEval; Gote gains when currEval < prevEval
    const diff = moverColor === 'b' ? currEval.scoreCp - prevEval.scoreCp : prevEval.scoreCp - currEval.scoreCp;

    // Trigger condition: Swing >= 0.15 (Spec §4.1) OR Mate
    const isSwingSignificant = winRateSwing >= 0.15 || prevEval.isMate || currEval.isMate;
    if (!isSwingSignificant) continue;

    // Categorize Pedagogical Tactical Type (from mover's POV)
    let catType: 'attack' | 'defense' | 'race' | 'mate' = 'attack';
    if (prevEval.isMate || currEval.isMate || Math.abs(currEval.scoreCp) >= 20000) {
      // Only assign 'mate' if the MOVER is delivering checkmate / attacking!
      // If the mover is being mated, it is 'defense' (holding on)
      const isMoverWinning = (moverColor === 'b' && currEval.scoreCp > 0) || (moverColor === 'w' && currEval.scoreCp < 0);
      catType = isMoverWinning ? 'mate' : 'defense';
    } else if (diff <= -300 || (moverColor === 'b' && currWr - prevWr <= -0.15) || (moverColor === 'w' && prevWr - currWr <= -0.15)) {
      catType = 'defense';
    } else if (p >= 60) {
      catType = 'race';
    } else {
      catType = 'attack';
    }

    candidates.push({
      ply: p,
      scoreDiff: diff,
      winRateSwing,
      winRateBefore: prevWr,
      type: catType,
      evalBefore: prevEval,
      actualMoveUsi,
    });
  }

  // Step 3: Sort by impact (win rate swing descending, fallback to score diff)
  candidates.sort((a, b) => b.winRateSwing - a.winRateSwing || Math.abs(b.scoreDiff) - Math.abs(a.scoreDiff));

  // Step 4: Pick up to 5 cards with at least 8 plies distance (Spec §4.2 spacing rule)
  const selected: CandidatePoint[] = [];
  for (const cand of candidates) {
    if (selected.length >= 5) break;
    const isTooClose = selected.some((s) => Math.abs(s.ply - cand.ply) < 8);
    if (!isTooClose) {
      selected.push(cand);
    }
  }

  // Sort back to chronological order
  selected.sort((a, b) => a.ply - b.ply);

  // Step 5: Convert into full TacticalQuizCard objects
  const nowIso = new Date().toISOString();

  for (const cand of selected) {
    const questionPly = cand.ply - 1; // Position BEFORE the turn

    // Compute exact position SFEN at questionPly using JKFPlayer for 100% precision
    let positionSfen = INITIAL_HIRATE_SFEN;
    let opponentLastMove: ShogiMove | undefined = undefined;

    try {
      const movesArr: Formats.MoveFormat[] = [{}];
      for (let p = 1; p <= questionPly; p++) {
        const md = getMoveAtPly(p);
        if (md) {
          const moveColor: Formats.Color = p % 2 === 1 ? 0 : 1;
          movesArr.push({
            move: {
              color: moveColor,
              piece: md.piece as Formats.Kind,
              to: { x: md.to.x, y: md.to.y },
              from: md.from && md.from.x > 0 ? { x: md.from.x, y: md.from.y } : undefined,
              promote: md.promote,
            },
          });
        }
      }
      const player = new JKFPlayer({ header: {}, moves: movesArr });
      player.goto(questionPly);
      positionSfen = player.shogi.toSFENString();

      // Extract authentic opponent last move if questionPly >= 1
      if (questionPly >= 1) {
        const lastMoveData = getMoveAtPly(questionPly);
        if (lastMoveData) {
          const oppColor: Color = questionPly % 2 === 1 ? 'b' : 'w';
          const isDrop = !lastMoveData.from || lastMoveData.from.x === 0 || lastMoveData.from.y === 0;
          const kifuStates = player.getReadableKifuState();
          const rawKifu = kifuStates[questionPly]?.kifu ?? '';
          const cleanedKif = rawKifu.replace(/^☗/, '▲').replace(/^☖/, '△');

          opponentLastMove = {
            ply: questionPly,
            color: oppColor,
            from: isDrop ? undefined : { file: lastMoveData.from!.x, rank: lastMoveData.from!.y },
            to: { file: lastMoveData.to.x, rank: lastMoveData.to.y },
            piece: (lastMoveData.piece as PieceType) || 'FU',
            isDrop,
            promote: Boolean(lastMoveData.promote),
            kifString: cleanedKif || jkfMoveToUsi(lastMoveData),
            sfenMove: jkfMoveToUsi(lastMoveData),
          };
        }
      }
    } catch (err) {
      console.warn(`Failed extracting precise SFEN at ply ${questionPly} using JKFPlayer:`, err);
    }

    // Side to move at questionPly is authoritatively defined by the SFEN turn field ('b' or 'w')
    const sfenTurn = positionSfen.split(/\s+/)[1];
    const sideToMove: Color = sfenTurn === 'w' ? 'w' : 'b';

    const board = ShogiBoard.fromSfen(positionSfen);
    const legalMoves = getAllStrictLegalMoves(board, sideToMove);
    const legalUsiSet = new Set(legalMoves.map((m) => m.usi));

    // Best move must be strictly legal from this position. If engine bestMove is illegal (e.g. stale or out of sync), fallback to first legal move
    let bestMove = cand.evalBefore.bestMove!;
    if (!legalUsiSet.has(bestMove)) {
      const firstLegal = legalMoves[0];
      if (!firstLegal) continue; // No legal moves (mate or stalemate)
      bestMove = firstLegal.usi;
    }

    let pv = cand.evalBefore.pv && cand.evalBefore.pv.length > 0 ? cand.evalBefore.pv.slice(0, 5) : [bestMove];

    // Ensure PV starts with bestMove
    if (pv[0] !== bestMove) {
      pv = [bestMove, ...pv.slice(1)];
    }
    // Ensure odd length for quiz solver sequence (user, reply, user)
    if (pv.length % 2 === 0) {
      pv.pop();
    }

    // Generate 3 choices: Prioritize 1. Best move, 2. Actual game move, 3. Blunder/trap move
    const choices: QuizChoice[] = [
      {
        usi: bestMove,
        isCorrect: true,
        role: 'best',
        scoreDelta: 0,
        continuationPv: pv,
        explanation: 'AI推奨最善手',
      },
    ];

    try {
      const candidates = cand.evalBefore.candidates;

      // 2. Add actual game move if it differed from bestMove, is legal, and not already in choices
      if (cand.actualMoveUsi !== bestMove && legalUsiSet.has(cand.actualMoveUsi)) {
        // Look up if actual move had a PV in candidates
        const actualCand = candidates?.find((c) => c.usi === cand.actualMoveUsi);
        choices.push({
          usi: cand.actualMoveUsi,
          isCorrect: false,
          role: 'actual',
          scoreDelta: cand.scoreDiff,
          continuationPv: actualCand?.pv || [cand.actualMoveUsi],
          explanation: `実戦の指し手 (${cand.scoreDiff > 0 ? '+' : ''}${cand.scoreDiff} cp)`,
        });
      }

      // 3. Add blunder / slack distractor from candidates (rank 2, 3...) or legal moves
      if (candidates && candidates.length > 1) {
        // Find worst candidate or significant drop
        const blunders = [...candidates]
          .filter((c) => c.usi !== bestMove && legalUsiSet.has(c.usi))
          .sort((a, b) => (sideToMove === 'b' ? a.scoreCp - b.scoreCp : b.scoreCp - a.scoreCp));

        for (const bl of blunders) {
          if (choices.length >= 3) break;
          if (choices.some((ch) => ch.usi === bl.usi)) continue;

          const scoreDelta = sideToMove === 'b'
            ? bl.scoreCp - cand.evalBefore.scoreCp
            : cand.evalBefore.scoreCp - bl.scoreCp;

          choices.push({
            usi: bl.usi,
            isCorrect: false,
            role: 'blunder',
            scoreDelta: Math.round(scoreDelta),
            continuationPv: bl.pv || [bl.usi],
            explanation: scoreDelta <= -300 ? '大悪手（形勢悪化）' : '緩手・疑問手',
          });
        }
      }

      // 4. Fallback if still under 3 choices: Fill with other legal moves
      if (choices.length < 3) {
        for (const lm of legalMoves) {
          if (choices.length >= 3) break;
          if (!choices.some((c) => c.usi === lm.usi)) {
            choices.push({
              usi: lm.usi,
              isCorrect: false,
              role: 'blunder',
              scoreDelta: -300,
              continuationPv: [lm.usi],
              explanation: '疑問手（反撃を受ける）',
            });
          }
        }
      }
    } catch (err) {
      console.warn(`Failed to generate quiz choices at ply ${questionPly}:`, err);
    }

    // Rule: Must have at least 3 distinct strictly legal choices including the best move
    if (choices.length < 3) {
      console.warn(`Skipping quiz at ply ${questionPly}: insufficient legal moves (${choices.length})`);
      continue;
    }

    // Uniqueness & Quality Guard (Spec §2.4):
    // Ensure the choices array strictly contains the bestMove
    if (!choices.some((c) => c.usi === bestMove && c.isCorrect)) {
      console.warn(`Skipping quiz at ply ${questionPly}: correct bestMove missing from choices`);
      continue;
    }

    // Sort choices deterministically by USI so the answer isn't always in the same slot
    choices.sort((a, b) => a.usi.localeCompare(b.usi));

    cards.push({
      id: `${gameId}:${questionPly}`,
      source: 'kifu-extract',
      sourceGameId: gameId,
      openingId: openingId || 'other',
      type: cand.type,
      evalSwing: Math.abs(cand.scoreDiff),
      winRateSwing: cand.winRateSwing,
      winRateBefore: cand.winRateBefore,
      ply: questionPly,
      startSfen: positionSfen,
      usiMovesToPosition: [],
      sideToMove,
      bestMove,
      pv,
      scoreCpBefore: cand.evalBefore.scoreCp,
      actualMove: cand.actualMoveUsi,
      opponentLastMove,
      choices,
      isEnabled: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  return cards;
}

/**
 * Automatically extracts quiz cards from a finished/analyzed Studio match
 * and merges them into the persistent quiz pool storage.
 * Returns the number of newly added or updated cards.
 */
export function autoRegisterStudioQuizzes(params: StudioQuizExtractionParams): number {
  try {
    const extractedCards = extractStudioQuizCards(params);
    if (extractedCards.length === 0) return 0;

    for (const c of extractedCards) {
      clearDeletedQuizId(c.id);
    }
    const existingPool = loadQuizPool();
    const merged = mergeQuizCards(existingPool, extractedCards);
    saveQuizPool(merged);

    return extractedCards.length;
  } catch (err) {
    console.error('Failed to auto register studio quizzes:', err);
    return 0;
  }
}

/**
 * Regenerates all tactical quiz cards across all analyzed saved studio games.
 * Preserves manually created cards and existing isEnabled states while rebuilding extracted cards.
 */
export function regenerateAllStudioQuizzes(savedGames: Array<{
  id: string;
  openingId?: string;
  totalPlies: number;
  jkfJson: string;
  evaluations?: Record<number, MoveEvaluation>;
}>): number {
  try {
    const existingPool = loadQuizPool();
    const existingById = new Map(existingPool.map((c) => [c.id, c]));
    const manualCards = existingPool.filter(
      (c) => c.source === 'manual' || c.sourceGameId === 'manual'
    );
    const manualIds = new Set(manualCards.map((c) => c.id));
    const allFreshCards: TacticalQuizCard[] = [];

    for (const game of savedGames) {
      if (!game.evaluations || Object.keys(game.evaluations).length === 0) continue;

      try {
        const parsedJkf = JSON.parse(game.jkfJson);
        const evalMap = new Map<number, MoveEvaluation>(
          Object.entries(game.evaluations).map(([k, v]) => [Number(k), v])
        );

        // Helper to extract move at ply from JKF moves array
        const getMoveAtPly = (ply: number): JkfMoveData | null | undefined => {
          if (!parsedJkf.moves || !parsedJkf.moves[ply]) return null;
          const m = parsedJkf.moves[ply];
          return m ? m.move : null;
        };

        const cards = extractStudioQuizCards({
          gameId: game.id,
          openingId: game.openingId || 'other',
          totalPlies: game.totalPlies,
          evaluations: evalMap,
          getMoveAtPly,
        });

        for (const card of cards) {
          if (manualIds.has(card.id)) continue;
          clearDeletedQuizId(card.id);
          const prev = existingById.get(card.id);
          allFreshCards.push(
            prev ? { ...card, isEnabled: prev.isEnabled } : card
          );
        }
      } catch (gameErr) {
        console.warn(`Failed extracting quizzes for game ${game.id}:`, gameErr);
      }
    }

    saveQuizPool([...manualCards, ...allFreshCards]);
    return allFreshCards.length;
  } catch (err) {
    console.error('Failed regenerating all studio quizzes:', err);
    return 0;
  }
}
