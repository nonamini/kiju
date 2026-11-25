/**
 * Inline Tactics & Move Sequence Player Component.
 * Embedded directly inside tactics note cards to allow users to interactively
 * step through, play, and review move sequences on an authentic Shogi board.
 * Strictly English code, comments, identifiers (Rule 1).
 * Strictly TypeScript strict without any (Rule 2).
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ShogiBoard, INITIAL_HIRATE_SFEN } from '../../utils/shogiBoard';
import { parseUsiMove } from '../../utils/shogiRules';
import { ShogiMove } from '../../types/shogi';
import { formatUsiToJapanese } from '../../utils/usiFormatter';
import { ShogiBoardView } from '../board/ShogiBoardView';
import { KomadaiView } from '../board/KomadaiView';

export interface InlineTacticsPlayerProps {
  initialSfen?: string;
  moves?: string[];
  title?: string;
  className?: string;
}

interface PlyState {
  board: ShogiBoard;
  lastMove?: ShogiMove;
  usiMove?: string;
  displayText: string;
}

export const InlineTacticsPlayer: React.FC<InlineTacticsPlayerProps> = ({
  initialSfen = INITIAL_HIRATE_SFEN,
  moves = [],
  className = '',
}) => {
  const { t } = useTranslation();
  const [currentPlyIndex, setCurrentPlyIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef<number | null>(null);

  // Pre-calculate board states for every ply in sequence
  const plyStates = useMemo<PlyState[]>(() => {
    const states: PlyState[] = [];
    let curBoard: ShogiBoard;
    try {
      curBoard = ShogiBoard.fromSfen(initialSfen);
    } catch {
      curBoard = new ShogiBoard();
    }

    // Ply 0: initial position
    states.push({
      board: curBoard,
      displayText: '開始局面',
    });

    for (let i = 0; i < moves.length; i++) {
      const usi = moves[i];
      if (!usi) continue;
      const nextBoard = ShogiBoard.fromSfen(curBoard.toSfen());
      const moveColor = i % 2 === 0 ? 'b' : 'w';
      const turnNum = i % 2 === 0 ? 0 : 1;
      try {
        const parsed = parseUsiMove(usi, nextBoard, i + 1, moveColor);
        if (parsed) {
          nextBoard.applyMove(parsed);
          const jpName = formatUsiToJapanese(usi, turnNum);
          states.push({
            board: nextBoard,
            lastMove: parsed,
            usiMove: usi,
            displayText: `${i + 1}. ${jpName}`,
          });
          curBoard = nextBoard;
          continue;
        }
      } catch (err) {
        console.warn(`[InlineTacticsPlayer] Failed to apply move ${usi}:`, err);
      }
      // If move failed to parse, push clone without lastMove
      states.push({
        board: nextBoard,
        usiMove: usi,
        displayText: `${i + 1}. ${usi}`,
      });
      curBoard = nextBoard;
    }

    return states;
  }, [initialSfen, moves]);

  // Handle auto-play
  useEffect(() => {
    if (!isPlaying) {
      if (playTimerRef.current !== null) {
        window.clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
      return;
    }

    playTimerRef.current = window.setInterval(() => {
      setCurrentPlyIndex((prev) => {
        if (prev >= plyStates.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1200);

    return () => {
      if (playTimerRef.current !== null) {
        window.clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    };
  }, [isPlaying, plyStates.length]);

  const activeState = plyStates[currentPlyIndex] || plyStates[0];
  const activeBoard = activeState ? activeState.board : new ShogiBoard();
  const totalMoves = moves.length;

  const handleFirst = () => {
    setIsPlaying(false);
    setCurrentPlyIndex(0);
  };
  const handlePrev = () => {
    setIsPlaying(false);
    setCurrentPlyIndex((p) => Math.max(0, p - 1));
  };
  const handleNext = () => {
    setIsPlaying(false);
    setCurrentPlyIndex((p) => Math.min(plyStates.length - 1, p + 1));
  };
  const handleLast = () => {
    setIsPlaying(false);
    setCurrentPlyIndex(plyStates.length - 1);
  };
  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (currentPlyIndex >= plyStates.length - 1) {
        setCurrentPlyIndex(0);
      }
      setIsPlaying(true);
    }
  };

  return (
    <div className={`rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex flex-col gap-2.5 ${className}`}>
      {/* Board & Komadai Section */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
        {/* Gote Komadai */}
        <div className="w-full sm:w-20 shrink-0">
          <KomadaiView
            color={isFlipped ? 'b' : 'w'}
            playerName={isFlipped ? '先手' : '後手'}
            isTurn={activeBoard.getTurn() === (isFlipped ? 'b' : 'w')}
            hand={activeBoard.getHand(isFlipped ? 'b' : 'w')}
          />
        </div>

        {/* 9x9 Board View */}
        <div className="w-full max-w-[280px] sm:max-w-[320px] aspect-square shrink-0">
          <ShogiBoardView
            board={activeBoard}
            isFlipped={isFlipped}
            lastMove={activeState?.lastMove}
            showLastMoveArrow={Boolean(activeState?.lastMove)}
          />
        </div>

        {/* Sente Komadai */}
        <div className="w-full sm:w-20 shrink-0">
          <KomadaiView
            color={isFlipped ? 'w' : 'b'}
            playerName={isFlipped ? '後手' : '先手'}
            isTurn={activeBoard.getTurn() === (isFlipped ? 'w' : 'b')}
            hand={activeBoard.getHand(isFlipped ? 'w' : 'b')}
          />
        </div>
      </div>

      {/* Playback Controls & Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-bold text-amber-300 truncate">
            {activeState?.displayText || '開始局面'}
          </span>
          <span className="text-[10px] text-slate-400 shrink-0">
            ({currentPlyIndex} / {totalMoves}手)
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleFirst}
            disabled={currentPlyIndex === 0}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 text-xs transition"
            title={t('tactics.first_ply_title', '最初へ')}
          >
            |◀
          </button>
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentPlyIndex === 0}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 text-xs transition"
            title={t('tactics.prev_ply_title', '1手戻る')}
          >
            ◀
          </button>
          {totalMoves > 0 && (
            <button
              type="button"
              onClick={togglePlay}
              className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs transition"
              title={
                isPlaying
                  ? t('tactics.pause_title', '一時停止')
                  : t('tactics.autoplay_title', '自動再生')
              }
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={currentPlyIndex >= plyStates.length - 1}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 text-xs transition"
            title={t('tactics.next_ply_title', '1手進む')}
          >
            ▶
          </button>
          <button
            type="button"
            onClick={handleLast}
            disabled={currentPlyIndex >= plyStates.length - 1}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 text-xs transition"
            title={t('tactics.last_ply_title', '最終手へ')}
          >
            ▶|
          </button>
          <button
            type="button"
            onClick={() => setIsFlipped((v) => !v)}
            className="ml-1 p-1 rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition"
            title={t('studio.flip_board', '盤面反転')}
          >
            🔄
          </button>
        </div>
      </div>

      {/* Move chips sequence (clickable) */}
      {totalMoves > 0 && (
        <div className="flex gap-1 overflow-x-auto py-1 max-h-20 scrollbar-thin text-[11px]">
          {plyStates.map((st, idx) => {
            if (idx === 0) return null; // skip initial position chip
            const isSelected = idx === currentPlyIndex;
            return (
              <button
                key={`${idx}-${st.usiMove}`}
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentPlyIndex(idx);
                }}
                className={`shrink-0 px-2 py-0.5 rounded font-mono transition text-[10px] ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 font-bold shadow'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {st.displayText}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
