/**
 * Fairy-Stockfish WebAssembly Engine Worker Protocol & Types.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { MoveEvaluation } from '../types/shogi';

export type EngineStatus =
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'searching'
  | 'error'
  | 'offline'
  | 'terminated';

export interface EngineSearchInfo {
  depth: number;
  seldepth?: number;
  scoreCp?: number; // Centipawn score (+ Sente advantage, - Gote advantage)
  isMate?: boolean;
  matePly?: number;
  nodes?: number;
  nps?: number;
  timeMs?: number;
  pv?: string[]; // Principal variation in USI format (e.g. ["7g7f", "8c8d"])
  pvKif?: string; // Japanese move string representation
  bestMove?: string;
  multipv?: number;
  rawLine: string;
}

export interface EngineSearchResult {
  bestMove: string;
  ponder?: string;
  evaluation?: MoveEvaluation;
}

export type EngineId = string;

// Commands from UI Thread -> Web Worker
export type EngineCommand =
  | { type: 'INIT'; wasmPath?: string }
  | { type: 'ISREADY' }
  | { type: 'SET_OPTION'; name: string; value: string | number | boolean }
  | { type: 'POSITION'; sfen?: string; moves?: string[] }
  | { type: 'GO'; depth?: number; movetime?: number; byoyomi?: number; btime?: number; wtime?: number }
  | { type: 'STOP' }
  | { type: 'RAW_COMMAND'; command: string }
  | {
      type: 'SWITCH_ENGINE';
      engineId: EngineId;
      engineName?: string;
      nnFileName?: string;
      nnBuffer?: ArrayBuffer;
      fvScale?: number;
    }
  | { type: 'QUIT' };

// Messages from Web Worker -> UI Thread
export type EngineMessage =
  | { type: 'STATUS_CHANGE'; status: EngineStatus; message?: string }
  | { type: 'READY_OK'; engineName: string }
  | { type: 'PROGRESS'; percent: number; message: string }
  | { type: 'ENGINE_SWITCHED'; engineId: EngineId; engineName: string }
  | { type: 'INFO'; info: EngineSearchInfo }
  | { type: 'BESTMOVE'; result: EngineSearchResult }
  | { type: 'RAW_OUTPUT'; line: string }
  | { type: 'ERROR'; error: string };

