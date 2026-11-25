import { describe, expect, it } from 'vitest';
import {
  formatGoCommand,
  formatPositionCommand,
  parseEngineBestMoveLine,
  parseEngineInfoLine,
} from '../src/engine/engineProtocolParser';

describe('engineProtocolParser unit tests', () => {
  describe('parseEngineInfoLine', () => {
    it('parses standard info line with depth, score, nodes, time, and PV', () => {
      const line =
        'info depth 6 seldepth 6 multipv 1 score cp 100 nodes 1288 nps 12384 time 104 pv 7i7h 8b4b 2h6h';
      const info = parseEngineInfoLine(line, 'b');

      expect(info).not.toBeNull();
      expect(info?.depth).toBe(6);
      expect(info?.seldepth).toBe(6);
      expect(info?.multipv).toBe(1);
      expect(info?.scoreCp).toBe(100);
      expect(info?.nodes).toBe(1288);
      expect(info?.nps).toBe(12384);
      expect(info?.timeMs).toBe(104);
      expect(info?.pv).toEqual(['7i7h', '8b4b', '2h6h']);
      expect(info?.bestMove).toBe('7i7h');
      expect(info?.isMate).toBeUndefined();
    });

    it('negates score when side to move is White (Gote) to keep Sente-positive standard', () => {
      const line = 'info depth 4 score cp 120 pv 8c8d';
      const infoGote = parseEngineInfoLine(line, 'w');
      expect(infoGote?.scoreCp).toBe(-120);

      const infoSente = parseEngineInfoLine(line, 'b');
      expect(infoSente?.scoreCp).toBe(120);
    });

    it('parses mate score accurately for both sides', () => {
      const lineMate3 = 'info depth 5 score mate 3 pv G*5b';
      const info1 = parseEngineInfoLine(lineMate3, 'b');
      expect(info1?.isMate).toBe(true);
      expect(info1?.matePly).toBe(3);
      expect(info1?.scoreCp).toBe(30000);

      const info2 = parseEngineInfoLine(lineMate3, 'w');
      expect(info2?.isMate).toBe(true);
      expect(info2?.matePly).toBe(3);
      expect(info2?.scoreCp).toBe(-30000);
    });

    it('returns null on non-info or uninformative lines', () => {
      expect(parseEngineInfoLine('readyok')).toBeNull();
      expect(parseEngineInfoLine('id name Fairy-Stockfish')).toBeNull();
      expect(parseEngineInfoLine('info string classical evaluation enabled')).toBeNull();
    });
  });

  describe('parseEngineBestMoveLine', () => {
    it('parses bestmove and optional ponder move', () => {
      const res = parseEngineBestMoveLine('bestmove 7i7h ponder 8b4b');
      expect(res).toEqual({
        bestMove: '7i7h',
        ponder: '8b4b',
      });
    });

    it('parses bestmove without ponder', () => {
      const res = parseEngineBestMoveLine('bestmove resign');
      expect(res).toEqual({
        bestMove: 'resign',
        ponder: undefined,
      });
    });

    it('returns null on other lines', () => {
      expect(parseEngineBestMoveLine('readyok')).toBeNull();
      expect(parseEngineBestMoveLine('info depth 1 score cp 0')).toBeNull();
    });
  });

  describe('formatPositionCommand', () => {
    it('formats startpos with and without moves', () => {
      expect(formatPositionCommand()).toBe('position startpos');
      expect(formatPositionCommand('startpos')).toBe('position startpos');
      expect(formatPositionCommand('startpos', ['7g7f', '8c8d'])).toBe(
        'position startpos moves 7g7f 8c8d'
      );
    });

    it('formats custom SFEN position', () => {
      const sfen = 'lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2';
      expect(formatPositionCommand(sfen, ['8c8d'])).toBe(
        `position sfen ${sfen} moves 8c8d`
      );
    });
  });

  describe('formatGoCommand', () => {
    it('formats go with depth, movetime, or byoyomi', () => {
      expect(formatGoCommand({ depth: 10 })).toBe('go depth 10');
      expect(formatGoCommand({ movetime: 1000 })).toBe('go movetime 1000');
      expect(formatGoCommand({ byoyomi: 3000, btime: 60000, wtime: 60000 })).toBe(
        'go byoyomi 3000 btime 60000 wtime 60000'
      );
    });

    it('falls back to default depth 8 if empty options', () => {
      expect(formatGoCommand({})).toBe('go depth 8');
    });
  });
});
