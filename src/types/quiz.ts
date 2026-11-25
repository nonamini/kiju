/**
 * Tactical Quiz Data Models & Extraction Types.
 * Defines 4 pedagogical tactical categories (attack, defense, race, mate)
 * and data structures for extracting and practicing tactics from games.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { Color, ShogiMove } from './shogi';

export type TacticalQuizType = 'attack' | 'defense' | 'race' | 'mate';
// attack=A (opponent slack), defense=B (must defend), race=C (endgame race), mate=D (mating net)

export type TurningPointType =
  | 'equal_to_lead' // Equal position (-150..+150) suddenly tilted decisively
  | 'reversal' // Advantage/disadvantage flipped (+ to - or - to + with large swing)
  | 'only_move' // Only one continuation preserves evaluation; other plausible moves blunder
  | 'tactical_shift'; // General sharp turning point

export type QuizChoiceRole = 'best' | 'actual' | 'blunder';

export interface QuizChoice {
  usi: string;
  isCorrect: boolean;
  role?: QuizChoiceRole; // 'best' (AI最善手), 'actual' (実戦の指し手), 'blunder' (悪手・緩手)
  scoreCp?: number; // Score from solver POV after this move
  scoreDelta?: number; // Difference relative to best move (0 for best, e.g. -250 for blunder)
  label?: string;
  continuationPv?: string[]; // USI continuation line after this choice (refutation/follow-up PV)
  explanation?: string; // Summary explanation e.g. "AI推奨最善手", "実戦の進行", "反撃を受けて形勢悪化"
}

export interface TacticalQuizCard {
  id: string; // `${sourceGameId}:${ply}` or `manual_quiz_${timestamp}`
  title?: string; // Custom or game title override
  source?: 'kifu-extract' | 'manual';
  sourceGameId: string;
  openingId: string;
  type: TacticalQuizType;
  engineId?: string; // Engine ID used for generating/verifying this quiz (e.g. 'tuyouraou11-mini')
  turningPointType?: TurningPointType;
  evalSwing?: number; // Absolute or signed magnitude of swing that triggered extraction
  ply: number; // position is AFTER this many plies (>= 2 for kifu-extract, 0 for manual)
  startSfen: string;
  usiMovesToPosition: string[]; // USI moves from startSfen to the quiz position
  sideToMove: Color; // the quiz solver
  bestMove: string; // USI, equals pv[0]
  pv: string[]; // USI, continuation of best move (solver, reply, solver, ...)
  scoreCpBefore: number; // E[ply] from solver's point of view
  winRateBefore?: number; // Sente-normalized win rate (0.0 .. 1.0) before the turn
  winRateSwing?: number; // Absolute win rate swing |WR[i+1] - WR[i]| (>= 0.15)
  actualMove?: string; // USI of the move played in the game at ply+1 (if known)
  opponentLastMove?: ShogiMove; // Opponent move that directly resulted in this quiz position
  explanation?: string; // Optional user or extracted explanation note
  choices?: QuizChoice[]; // Deterministic 3-choice options: AI best, actual game move, blunder distractor
  isEnabled: boolean; // default true
  createdAt: string; // ISO 8601
  updatedAt?: string; // ISO 8601
}

export interface QuizSourceGame {
  gameId: string;
  openingId: string;
  startSfen: string;
  moves: ShogiMove[];
}

export interface QuizExtractionConfig {
  maxQuizzesPerGame: number; // default 5 (target 3-5 per game)
  minPlyDistance: number; // default 4 (minimum distance between extracted positions)
  minSwingCp: number; // default 250 (swing for equal_to_lead or reversal)
  reversalThresholdCp: number; // default 200
  attackGainCp: number; // default 200
  defenseThreatCp: number; // default 200
  defenseMinScoreCp: number; // default -500 (below this the position is hopeless)
  defenseLossCp: number; // default 300
  mateScoreCp: number; // default 2000
  raceMinPly: number; // default 80
  raceMinScoreCp: number; // default -300
  raceMaxScoreCp: number; // default 600
  raceLossCp: number; // default 200
  maxPvLength: number; // default 5
}

