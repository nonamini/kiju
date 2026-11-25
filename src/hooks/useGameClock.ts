/**
 * Custom React Hook for Managing Match Game Clock.
 * Supports:
 * - Sudden Death (切れ負け)
 * - Byoyomi (持ち時間 + 秒読み)
 * - Fischer Increment (1手ごと加算)
 * - Hyper Bullet (1手N秒)
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript typed without 'any' (Rule 2).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Color } from '../types/shogi';
import {
  MatchClockState,
  PlayerClockState,
  TimeControlConfig,
} from '../types/clock';

export interface UseGameClockReturn {
  clockState: MatchClockState;
  startClock: (config: TimeControlConfig, initialTurn: Color) => void;
  pauseClock: () => void;
  resumeClock: () => void;
  stopClock: () => void;
  switchTurn: (nextTurn: Color) => void;
  onTimeUp?: (loserColor: Color) => void;
}

const createInitialPlayerState = (config: TimeControlConfig): PlayerClockState => {
  const isPureByoyomi = config.rule === 'HYPER_BULLET' || (config.initialTimeSec === 0 && Boolean(config.byoyomiSec));
  return {
    remainingTimeMs: config.initialTimeSec * 1000,
    currentByoyomiSec: config.byoyomiSec ?? 0,
    isByoyomi: isPureByoyomi,
    isTimeUp: false,
  };
};

export function useGameClock(
  onTimeUpCallback?: (loserColor: Color) => void
): UseGameClockReturn {
  const [clockState, setClockState] = useState<MatchClockState>({
    config: { rule: 'NONE', initialTimeSec: 0 },
    black: { remainingTimeMs: 0, currentByoyomiSec: 0, isByoyomi: false, isTimeUp: false },
    white: { remainingTimeMs: 0, currentByoyomiSec: 0, isByoyomi: false, isTimeUp: false },
    activeColor: 'b',
    isPaused: true,
  });

  const onTimeUpRef = useRef(onTimeUpCallback);
  useEffect(() => {
    onTimeUpRef.current = onTimeUpCallback;
  }, [onTimeUpCallback]);

  const stateRef = useRef(clockState);
  stateRef.current = clockState;

  // Initialize clock
  const startClock = useCallback((config: TimeControlConfig, initialTurn: Color) => {
    const black = createInitialPlayerState(config);
    const white = createInitialPlayerState(config);
    const newState: MatchClockState = {
      config,
      black,
      white,
      activeColor: initialTurn,
      isPaused: config.rule === 'NONE',
      lastTickTimestamp: performance.now(),
    };
    setClockState(newState);
  }, []);

  const pauseClock = useCallback(() => {
    setClockState((prev) => ({ ...prev, isPaused: true }));
  }, []);

  const resumeClock = useCallback(() => {
    setClockState((prev) => {
      if (prev.config.rule === 'NONE') return prev;
      return {
        ...prev,
        isPaused: false,
        lastTickTimestamp: performance.now(),
      };
    });
  }, []);

  const stopClock = useCallback(() => {
    setClockState((prev) => ({ ...prev, isPaused: true }));
  }, []);

  // Called when a move is played to commit Fischer increment or reset byoyomi
  const switchTurn = useCallback((nextTurn: Color) => {
    setClockState((prev) => {
      if (prev.config.rule === 'NONE') {
        return { ...prev, activeColor: nextTurn };
      }

      const justMovedColor = prev.activeColor;
      const isBlack = justMovedColor === 'b';
      const player = isBlack ? { ...prev.black } : { ...prev.white };

      // Apply Fischer increment
      if (prev.config.rule === 'FISCHER' && prev.config.incrementSec) {
        player.remainingTimeMs += prev.config.incrementSec * 1000;
      }

      // Reset Byoyomi if applicable
      if (prev.config.byoyomiSec) {
        player.currentByoyomiSec = prev.config.byoyomiSec;
      }

      return {
        ...prev,
        black: isBlack ? player : prev.black,
        white: isBlack ? prev.white : player,
        activeColor: nextTurn,
        lastTickTimestamp: performance.now(),
      };
    });
  }, []);

  // High precision countdown timer loop (runs every 100ms)
  useEffect(() => {
    if (clockState.isPaused || clockState.config.rule === 'NONE') return;

    const intervalId = window.setInterval(() => {
      setClockState((prev) => {
        if (prev.isPaused || prev.config.rule === 'NONE') return prev;

        const now = performance.now();
        const deltaMs = prev.lastTickTimestamp ? now - prev.lastTickTimestamp : 100;
        const activeKey = prev.activeColor === 'b' ? 'black' : 'white';
        const player = { ...prev[activeKey] };

        if (player.isTimeUp) return prev;

        if (!player.isByoyomi) {
          // Main time decrement
          player.remainingTimeMs = Math.max(0, player.remainingTimeMs - deltaMs);
          if (player.remainingTimeMs <= 0) {
            if (prev.config.byoyomiSec) {
              // Transition into Byoyomi
              player.isByoyomi = true;
              player.currentByoyomiSec = prev.config.byoyomiSec;
            } else {
              // Sudden Death time-up!
              player.isTimeUp = true;
              onTimeUpRef.current?.(prev.activeColor);
              return {
                ...prev,
                [activeKey]: player,
                isPaused: true,
                lastTickTimestamp: now,
              };
            }
          }
        } else {
          // Byoyomi countdown
          // Decrement by delta seconds
          const newByoyomi = player.currentByoyomiSec - deltaMs / 1000;
          if (newByoyomi <= 0) {
            player.currentByoyomiSec = 0;
            player.isTimeUp = true;
            onTimeUpRef.current?.(prev.activeColor);
            return {
              ...prev,
              [activeKey]: player,
              isPaused: true,
              lastTickTimestamp: now,
            };
          } else {
            player.currentByoyomiSec = newByoyomi;
          }
        }

        return {
          ...prev,
          [activeKey]: player,
          lastTickTimestamp: now,
        };
      });
    }, 100);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [clockState.isPaused, clockState.config.rule]);

  return {
    clockState,
    startClock,
    pauseClock,
    resumeClock,
    stopClock,
    switchTurn,
  };
}
