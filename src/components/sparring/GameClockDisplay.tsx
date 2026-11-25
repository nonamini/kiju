/**
 * Digital Shogi Game Clock Display Component.
 * Renders main time, byoyomi countdown with urgent animations,
 * active player indicators, and rule badge.
 * Follows Rule 1: Strictly English code, comments, and identifiers.
 * Follows Rule 2: Strict TypeScript without 'any'.
 */

import React from 'react';
import { Color } from '../../types/shogi';
import { PlayerClockState, TimeControlConfig } from '../../types/clock';

export interface GameClockDisplayProps {
  color: Color;
  playerName: string;
  isTurn: boolean;
  clockState: PlayerClockState;
  config: TimeControlConfig;
  className?: string;
}

const formatMinutesSeconds = (ms: number): string => {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const GameClockDisplay: React.FC<GameClockDisplayProps> = ({
  color: _color,
  playerName,
  isTurn,
  clockState,
  config,
  className = '',
}) => {
  if (config.rule === 'NONE') {
    return null;
  }

  const isLowTime =
    (clockState.isByoyomi && clockState.currentByoyomiSec <= 10) ||
    (!clockState.isByoyomi && clockState.remainingTimeMs <= 30000);

  const byoyomiSecInt = Math.ceil(clockState.currentByoyomiSec);

  return (
    <div
      className={`flex items-center justify-between px-3 py-1.5 rounded-lg border transition-all ${
        clockState.isTimeUp
          ? 'bg-rose-950/90 border-rose-500 text-rose-300'
          : isTurn
          ? isLowTime
            ? 'bg-rose-950/60 border-rose-500/80 shadow-[0_0_12px_rgba(244,63,94,0.4)] animate-pulse'
            : 'bg-slate-900 border-amber-500/80 shadow-[0_0_10px_rgba(245,158,11,0.25)]'
          : 'bg-slate-950/60 border-slate-800 text-slate-400'
      } ${className}`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            isTurn ? (isLowTime ? 'bg-rose-500 animate-ping' : 'bg-emerald-400') : 'bg-slate-600'
          }`}
        />
        <span className="text-xs font-semibold truncate max-w-[100px]">
          {playerName}
        </span>
      </div>

      <div className="flex items-center gap-2 font-mono">
        {clockState.isTimeUp ? (
          <span className="text-xs font-bold text-rose-400 tracking-wider">
            TIME UP
          </span>
        ) : clockState.isByoyomi ? (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-amber-400/80 uppercase font-sans font-bold">
              秒読み
            </span>
            <span
              className={`text-base font-extrabold ${
                byoyomiSecInt <= 10 ? 'text-rose-400 text-lg' : 'text-amber-300'
              }`}
            >
              {byoyomiSecInt}s
            </span>
          </div>
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-sm font-bold ${
                isLowTime ? 'text-rose-400' : isTurn ? 'text-slate-100' : 'text-slate-400'
              }`}
            >
              {formatMinutesSeconds(clockState.remainingTimeMs)}
            </span>
            {config.byoyomiSec && (
              <span className="text-[10px] text-slate-500 font-sans">
                +{config.byoyomiSec}s
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
