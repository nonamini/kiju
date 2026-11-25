/**
 * Game Clock & Time Control Rules Data Models.
 * Follows Rule 1: Strictly English code, comments, and identifiers.
 * Follows Rule 2: Strict TypeScript without 'any'.
 * Reference: docs/spec/time_control.md
 */

export type TimeControlRule =
  | 'NONE'          // Unlimited time (Free match)
  | 'SUDDEN_DEATH'  // X minutes sudden death (no byoyomi)
  | 'BYOYOMI'       // Main time + byoyomi (e.g. 10m + 30s)
  | 'FISCHER'       // Fischer increment (e.g. 3m + 5s/move)
  | 'HYPER_BULLET'; // Move within X seconds (e.g. 10s per move)

export interface TimeControlConfig {
  rule: TimeControlRule;
  initialTimeSec: number;   // Base time in seconds (e.g., 3m = 180, 10m = 600, 0 for pure bullet)
  byoyomiSec?: number;      // Seconds per move after base time exhausted (e.g., 30)
  incrementSec?: number;    // Fischer increment per move in seconds (e.g., 5)
}

export interface PlayerClockState {
  remainingTimeMs: number;  // Remaining main time in milliseconds
  currentByoyomiSec: number;// Current remaining byoyomi seconds for this turn
  isByoyomi: boolean;       // Whether main time is exhausted and byoyomi is active
  isTimeUp: boolean;        // Whether the player ran out of time
}

export interface MatchClockState {
  config: TimeControlConfig;
  black: PlayerClockState;
  white: PlayerClockState;
  activeColor: 'b' | 'w';
  isPaused: boolean;
  lastTickTimestamp?: number;
}

export const PRESET_TIME_CONTROLS: Record<string, { labelKey: string; config: TimeControlConfig }> = {
  unlimited: {
    labelKey: 'studio.match.clock_preset_unlimited',
    config: { rule: 'NONE', initialTimeSec: 0 },
  },
  wars_10m: {
    labelKey: 'studio.match.clock_preset_wars_10m',
    config: { rule: 'SUDDEN_DEATH', initialTimeSec: 600 },
  },
  wars_3m: {
    labelKey: 'studio.match.clock_preset_wars_3m',
    config: { rule: 'SUDDEN_DEATH', initialTimeSec: 180 },
  },
  byoyomi_10m_30s: {
    labelKey: 'studio.match.clock_preset_byoyomi_10m_30s',
    config: { rule: 'BYOYOMI', initialTimeSec: 600, byoyomiSec: 30 },
  },
  fischer_5m_5s: {
    labelKey: 'studio.match.clock_preset_fischer_5m_5s',
    config: { rule: 'FISCHER', initialTimeSec: 300, incrementSec: 5 },
  },
  bullet_10s: {
    labelKey: 'studio.match.clock_preset_bullet_10s',
    config: { rule: 'HYPER_BULLET', initialTimeSec: 0, byoyomiSec: 10 },
  },
};
