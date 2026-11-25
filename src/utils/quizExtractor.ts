/**
 * Tactical Quiz Extraction Engine.
 * Extracts pedagogical tactical quiz positions (attack, defense, race, mate)
 * from analyzed game records based on evaluation turning points and principal variations.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import {
  QuizChoice,
  QuizExtractionConfig,
  QuizSourceGame,
  TacticalQuizCard,
  TacticalQuizType,
  TurningPointType,
} from '../types/quiz';
import { ShogiMove, Square } from '../types/shogi';
import { INITIAL_HIRATE_SFEN, ShogiBoard } from './shogiBoard';
import { getAllStrictLegalMoves, parseUsiMove } from './shogiRules';

/**
 * Default extraction thresholds according to pedagogical specifications.
 */
export const DEFAULT_QUIZ_CONFIG: QuizExtractionConfig = {
  maxQuizzesPerGame: 5,
  minPlyDistance: 2,
  minSwingCp: 150,
  reversalThresholdCp: 150,
  attackGainCp: 150,
  defenseThreatCp: 150,
  defenseMinScoreCp: -500,
  defenseLossCp: 200,
  mateScoreCp: 2000,
  raceMinPly: 80,
  raceMinScoreCp: -300,
  raceMaxScoreCp: 600,
  raceLossCp: 150,
  maxPvLength: 5,
};

export interface TurningPointDetectionResult {
  type: TacticalQuizType;
  turningPointType: TurningPointType;
  swing: number;
}

/**
 * Detects whether a move constitutes a pedagogical turning point.
 * Criteria:
 * 1. Reversal: Score flips sign with swing >= reversalThresholdCp
 * 2. Equal to Lead: Pre-score was near-even (|prevS| <= 150) and score swung >= minSwingCp
 * 3. Only Move / Defense: Facing threat and game continuation blundered
 * 4. General tactical shift / Attack / Mate / Race
 */
export function detectTurningPoint(
  moves: ShogiMove[],
  n: number,
  cfg: QuizExtractionConfig
): TurningPointDetectionResult | null {
  if (n < 2 || n > moves.length) {
    return null;
  }

  const cur = moves[n - 1]?.evaluation;
  const prev = moves[n - 2]?.evaluation;
  if (!cur || !prev) {
    return null;
  }

  const lastMover = moves[n - 1]?.color;
  if (!lastMover) {
    return null;
  }

  // sign relative to solver (player to move at ply n+1)
  const sign = lastMover === 'b' ? -1 : 1;
  const curS = sign * cur.scoreCp;
  const prevS = sign * prev.scoreCp;
  const gain = curS - prevS;

  const next = moves[n]?.evaluation;
  const lossActual = next !== undefined ? curS - sign * next.scoreCp : null;

  // Mate check
  if (curS >= cfg.mateScoreCp || (cur.isMate && curS > 0)) {
    return { type: 'mate', turningPointType: 'equal_to_lead', swing: Math.max(Math.abs(gain), 1000) };
  }

  // 1. Reversal: Advantage/disadvantage flipped with large swing
  const isSignFlip = (prevS > 50 && curS < -50) || (prevS < -50 && curS > 50);
  if (isSignFlip && Math.abs(gain) >= cfg.reversalThresholdCp) {
    if (curS > 0) {
      return { type: 'attack', turningPointType: 'reversal', swing: Math.abs(gain) };
    }
  }

  // 2. Equal to decisive lead: was roughly equal, now solver gains decisive advantage
  if (Math.abs(prevS) <= 150 && curS >= cfg.minSwingCp && gain >= cfg.attackGainCp) {
    return { type: 'attack', turningPointType: 'equal_to_lead', swing: Math.abs(gain) };
  }

  // 3. Only move / Defense: severe threat, actual game blundered with significant loss
  if (
    gain <= -cfg.defenseThreatCp &&
    curS > cfg.defenseMinScoreCp &&
    lossActual !== null &&
    lossActual >= cfg.defenseLossCp
  ) {
    return { type: 'defense', turningPointType: 'only_move', swing: Math.abs(lossActual) };
  }

  // 4. Attack: opponent made a slack move giving solver >= attackGainCp
  if (gain >= cfg.attackGainCp) {
    return { type: 'attack', turningPointType: 'tactical_shift', swing: Math.abs(gain) };
  }

  // 5. Endgame Race: late game critical turning point
  if (
    n >= cfg.raceMinPly &&
    curS >= cfg.raceMinScoreCp &&
    curS <= cfg.raceMaxScoreCp &&
    cur.pv &&
    cur.pv.length >= 3 &&
    lossActual !== null &&
    lossActual >= cfg.raceLossCp
  ) {
    return { type: 'race', turningPointType: 'tactical_shift', swing: Math.abs(lossActual) };
  }

  return null;
}

/**
 * Classifies a position after move n into one of four tactical categories, or null if neither matches.
 * Backward compatibility wrapper around detectTurningPoint.
 */
export function classifyQuizPosition(
  moves: ShogiMove[],
  n: number,
  cfg: QuizExtractionConfig
): TacticalQuizType | null {
  const result = detectTurningPoint(moves, n, cfg);
  return result ? result.type : null;
}

interface RawCandidate {
  n: number;
  type: TacticalQuizType;
  turningPointType: TurningPointType;
  swing: number;
  curMove: ShogiMove;
  prevMove: ShogiMove;
  curEval: NonNullable<ShogiMove['evaluation']>;
}

/**
 * Builds 3-choice options (1 correct bestMove + 2 plausible/blunder legal distractors).
 */
function buildCardChoices(
  bestMove: string,
  actualMoveUsi: string | undefined,
  legalMoves: { usi: string }[],
  lossActual: number | null
): QuizChoice[] {
  const choices: QuizChoice[] = [
    {
      usi: bestMove,
      isCorrect: true,
      scoreDelta: 0,
    },
  ];

  const legalDistractors = legalMoves
    .map((m) => m.usi)
    .filter((usi) => usi !== bestMove && usi !== 'none' && usi !== 'resign');

  // If actual move was played, was legal, and differed from bestMove, use it as first distractor
  let remainingDistractors = legalDistractors;
  if (actualMoveUsi && actualMoveUsi !== bestMove && legalDistractors.includes(actualMoveUsi)) {
    choices.push({
      usi: actualMoveUsi,
      isCorrect: false,
      scoreDelta: -(lossActual ?? 250),
    });
    remainingDistractors = remainingDistractors.filter((u) => u !== actualMoveUsi);
  }

  // Pick remaining distractors up to 3 choices
  for (const distractorUsi of remainingDistractors) {
    if (choices.length >= 3) break;
    choices.push({
      usi: distractorUsi,
      isCorrect: false,
      scoreDelta: choices.length === 1 ? -200 : -350,
    });
  }

  // Deterministically sort choices by USI so correct answer isn't predictably first
  choices.sort((a, b) => a.usi.localeCompare(b.usi));

  return choices;
}

/**
 * Extracts tactical quiz cards from an ingested and evaluated game record.
 * Limits extraction to maxQuizzesPerGame (typically 3-5 key turning points),
 * ensures legal moves, and attaches 3-choice options.
 */
export function extractQuizCards(
  game: QuizSourceGame,
  config?: Partial<QuizExtractionConfig>,
  nowIso?: string
): TacticalQuizCard[] {
  const cfg: QuizExtractionConfig = { ...DEFAULT_QUIZ_CONFIG, ...config };
  const createdAt = nowIso ?? new Date().toISOString();
  const moves = game.moves;

  console.log('[QuizExtractor] Starting extraction for game:', game.gameId, 'moves:', moves.length);

  // Step 1: Collect all raw turning point candidates
  const candidates: RawCandidate[] = [];

  for (let n = 2; n <= moves.length; n++) {
    const curMove = moves[n - 1];
    const prevMove = moves[n - 2];
    if (!curMove || !prevMove) {
      if (n <= 10) console.log(`[QuizExtractor] Ply ${n}: skipped - no moves`);
      continue;
    }

    const cur = curMove.evaluation;
    const prev = prevMove.evaluation;
    if (!cur || !prev) {
      if (n <= 10) console.log(`[QuizExtractor] Ply ${n}: skipped - no evaluation`);
      continue;
    }

    if (!cur.bestMove || !cur.pv || cur.pv.length === 0) {
      if (n <= 10) console.log(`[QuizExtractor] Ply ${n}: skipped - no bestMove or pv, bestMove=${cur.bestMove}, pvLen=${cur.pv?.length}`);
      continue;
    }
    if (cur.bestMove === 'none' || cur.bestMove === 'resign') {
      if (n <= 10) console.log(`[QuizExtractor] Ply ${n}: skipped - bestMove is ${cur.bestMove}`);
      continue;
    }

    const detection = detectTurningPoint(moves, n, cfg);

    // Debug: log evaluation values for first few plies and any significant changes
    if (n <= 10 || n % 10 === 0 || (cur.scoreCp - prev.scoreCp > 100 || cur.scoreCp - prev.scoreCp < -100)) {
      const lastMover = moves[n - 1]?.color;
      const sign = lastMover === 'b' ? -1 : 1;
      const curS = sign * cur.scoreCp;
      const prevS = sign * prev.scoreCp;
      const gain = curS - prevS;
      console.log(`[QuizExtractor] Ply ${n}: lastMover=${lastMover}, curS=${curS}, prevS=${prevS}, gain=${gain}, detected=${detection ? detection.type : 'null'}`);
    }

    if (!detection) continue;

    candidates.push({
      n,
      type: detection.type,
      turningPointType: detection.turningPointType,
      swing: detection.swing,
      curMove,
      prevMove,
      curEval: cur,
    });
  }

  console.log('[QuizExtractor] Detected candidates:', candidates.length);
  candidates.forEach(c => {
    console.log(`  - Ply ${c.n}: type=${c.type}, swing=${c.swing}`);
  });

  // Step 2: Sort candidates by swing magnitude descending to pick the most dramatic turning points
  candidates.sort((a, b) => b.swing - a.swing);

  // Step 3: Filter by minPlyDistance and limit to maxQuizzesPerGame
  const selectedCandidates: RawCandidate[] = [];
  for (const cand of candidates) {
    if (selectedCandidates.length >= cfg.maxQuizzesPerGame) break;

    const isTooClose = selectedCandidates.some(
      (sel) => Math.abs(sel.n - cand.n) < cfg.minPlyDistance
    );
    if (!isTooClose) {
      selectedCandidates.push(cand);
    }
  }

  console.log('[QuizExtractor] Selected candidates after filtering:', selectedCandidates.length);

  // Sort back to game chronological order (ply ascending)
  selectedCandidates.sort((a, b) => a.n - b.n);

  // Step 4: Construct TacticalQuizCard for each selected candidate
  const cards: TacticalQuizCard[] = [];

  for (const cand of selectedCandidates) {
    console.log(`[QuizExtractor] Processing candidate at ply ${cand.n}`);
    const { n, type, turningPointType, swing, curMove, curEval } = cand;
    const sideToMove = curMove.color === 'b' ? 'w' : 'b';

    // Build PV: preference is given to actual game moves when available, or engine pv
    const usiMovesToPosition = moves.slice(0, n).map((m) => m.sfenMove);

    // Replay board to get strictly legal moves and verify position
    let legalMoves: { usi: string }[] = [];
    let isBoardValid = true;
    try {
      const sfen =
        !game.startSfen || game.startSfen === 'startpos'
          ? INITIAL_HIRATE_SFEN
          : game.startSfen;
      const b = ShogiBoard.fromSfen(sfen);
      let prevTo: Square | undefined = undefined;
      let p = 1;
      for (const usi of usiMovesToPosition) {
        const turn = b.getTurn();
        const m = parseUsiMove(usi, b, p, turn, prevTo);
        if (!m) {
          isBoardValid = false;
          break;
        }
        b.applyMove(m);
        prevTo = m.to;
        p++;
      }
      if (isBoardValid) {
        legalMoves = getAllStrictLegalMoves(b, sideToMove);
      }
    } catch {
      // Test environments with synthetic moves may catch here
    }

    if (!curEval.pv || curEval.pv.length === 0) continue;

    // PV length must be the largest odd number <= min(maxPvLength, pv.length)
    const upperLimit = Math.min(cfg.maxPvLength, curEval.pv.length);
    const pvLen = upperLimit % 2 === 0 ? upperLimit - 1 : upperLimit;
    if (pvLen < 1) continue;

    const enginePv = curEval.pv.slice(0, pvLen);

    // Use game move as bestMove (user's intended behavior)
    const gameMoveAtPosition = moves[n]?.sfenMove;
    const bestMove = (gameMoveAtPosition && gameMoveAtPosition !== 'none' && gameMoveAtPosition !== 'resign')
      ? gameMoveAtPosition
      : (enginePv[0] ?? curEval.bestMove);

    if (!bestMove) {
      console.log(`[QuizExtractor] Skipping ply ${n}: no bestMove`);
      continue;
    }

    // Discard card where bestMove is not strictly legal on the resulting board (when board validation succeeded)
    if (isBoardValid && legalMoves.length > 0) {
      if (!legalMoves.some((m) => m.usi === bestMove)) {
        console.log(`[QuizExtractor] Skipping ply ${n}: bestMove not legal (${bestMove})`);
        continue;
      }
    }

    // Construct PV continuation using game moves as answer path (user's intended behavior)
    const pv: string[] = [];
    for (let step = 0; step < pvLen; step++) {
      const gameMove = moves[n + step]?.sfenMove;
      if (gameMove && gameMove !== 'none' && gameMove !== 'resign') {
        pv.push(gameMove);
      } else {
        const nextEngineMove = enginePv[step];
        if (nextEngineMove) {
          pv.push(nextEngineMove);
        }
      }
    }

    const sign = curMove.color === 'b' ? -1 : 1;
    const scoreCpBefore = sign * curEval.scoreCp;
    const nextMove = moves[n];
    const actualMove = nextMove?.sfenMove;
    const lossActual = nextMove?.evaluation ? scoreCpBefore - sign * nextMove.evaluation.scoreCp : null;

    // Generate 3 choices
    const choices = buildCardChoices(bestMove, actualMove, legalMoves, lossActual);

    cards.push({
      id: `${game.gameId}:${n}`,
      sourceGameId: game.gameId,
      openingId: game.openingId,
      type,
      turningPointType,
      evalSwing: swing,
      ply: n,
      startSfen: game.startSfen,
      usiMovesToPosition,
      sideToMove,
      bestMove,
      pv,
      scoreCpBefore,
      actualMove,
      opponentLastMove: curMove,
      choices,
      isEnabled: true,
      createdAt,
    });
    console.log(`[QuizExtractor] Created card at ply ${n}: type=${type}, bestMove=${bestMove}, pv=${pv}`);
  }

  console.log('[QuizExtractor] Final cards count:', cards.length);
  return cards;
}

