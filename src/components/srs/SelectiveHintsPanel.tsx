/**
 * Selective 5-Type Hints Panel Component.
 * Enables user to independently unlock specific clues (Rank, File, Piece, Board/Hand, Answer)
 * without revealing others. Tracks hint usage and penalty scoring for SM-2 spaced repetition.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { ShogiMove } from '../../types/shogi';
import { HintType } from '../../types/srs';
import {
  getAnswerHint,
  getBoardOrHandHint,
  getFileHint,
  getPieceHint,
  getRankHint,
  HINT_PENALTY_WEIGHTS,
} from '../../utils/srsHintEngine';

export interface SelectiveHintsPanelProps {
  expectedMove: ShogiMove | null;
  revealedHints?: Record<HintType, boolean>;
  onRevealHint: (type: HintType) => void;
  hintsUsedCount?: number;
  hintPenaltyScore?: number;
  isInteractive: boolean;
  className?: string;
}

interface HintConfig {
  type: HintType;
  titleKey: string;
  icon: string;
  colorClass: string;
  badgeBg: string;
  getClue: (move: ShogiMove, t: (key: string, opt?: Record<string, unknown>) => string) => string;
}

const DEFAULT_REVEALED_HINTS: Record<HintType, boolean> = {
  rank: false,
  file: false,
  piece: false,
  boardOrHand: false,
  answer: false,
};

const HINT_CONFIGS: HintConfig[] = [
  {
    type: 'rank',
    titleKey: 'srs.hint_rank_title',
    icon: '🧭',
    colorClass: 'border-indigo-500/40 hover:border-indigo-500/70 text-indigo-400',
    badgeBg: 'bg-indigo-950/60 text-indigo-300 border-indigo-500/30',
    getClue: (move, t) => {
      const hint = getRankHint(move, move.color);
      return t(hint.labelKey);
    },
  },
  {
    type: 'file',
    titleKey: 'srs.hint_file_title',
    icon: '↔️',
    colorClass: 'border-cyan-500/40 hover:border-cyan-500/70 text-cyan-400',
    badgeBg: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/30',
    getClue: (move, t) => {
      const hint = getFileHint(move, move.color);
      return t(hint.labelKey);
    },
  },
  {
    type: 'piece',
    titleKey: 'srs.hint_piece_title',
    icon: '♟️',
    colorClass: 'border-emerald-500/40 hover:border-emerald-500/70 text-emerald-400',
    badgeBg: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30',
    getClue: (move, t) => {
      const hint = getPieceHint(move);
      return t(hint.labelKey);
    },
  },
  {
    type: 'boardOrHand',
    titleKey: 'srs.hint_board_title',
    icon: '✋',
    colorClass: 'border-amber-500/40 hover:border-amber-500/70 text-amber-400',
    badgeBg: 'bg-amber-950/60 text-amber-300 border-amber-500/30',
    getClue: (move, t) => {
      const hint = getBoardOrHandHint(move);
      return t(hint.labelKey);
    },
  },
  {
    type: 'answer',
    titleKey: 'srs.hint_answer_title',
    icon: '💡',
    colorClass: 'border-purple-500/50 hover:border-purple-500/80 text-purple-400',
    badgeBg: 'bg-purple-950/60 text-purple-300 border-purple-500/30',
    getClue: (move) => {
      const hint = getAnswerHint(move);
      return `${hint.kifString} (${hint.sfenMove})`;
    },
  },
];

export const SelectiveHintsPanel: React.FC<SelectiveHintsPanelProps> = ({
  expectedMove,
  revealedHints = DEFAULT_REVEALED_HINTS,
  onRevealHint,
  hintsUsedCount = 0,
  hintPenaltyScore = 0,
  isInteractive,
  className = '',
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={`rounded-xl border border-shogi-border bg-slate-900/90 p-4 shadow-lg backdrop-blur-sm ${className}`}
    >
      {/* Header and Stats */}
      <div className="flex items-center justify-between pb-3 border-b border-shogi-border/60">
        <div className="flex items-center gap-2">
          <span className="text-base">💡</span>
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
            {t('srs.hints_panel_title')}
          </h3>
        </div>

        {hintsUsedCount > 0 && (
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="rounded-full border border-amber-500/40 bg-amber-950/40 px-2.5 py-0.5 text-amber-300">
              {t('srs.hints_usage_summary', {
                count: hintsUsedCount,
                penalty: hintPenaltyScore,
              })}
            </span>
          </div>
        )}
      </div>

      <p className="mt-2 text-[11px] text-slate-400">
        {t('srs.hints_panel_desc')}
      </p>

      {/* 5 Hint Action Buttons */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-5 gap-2.5">
        {HINT_CONFIGS.map((config) => {
          const isRevealed = Boolean(revealedHints?.[config.type]);
          const penalty = HINT_PENALTY_WEIGHTS[config.type];
          const clue =
            expectedMove && isRevealed ? config.getClue(expectedMove, t) : null;

          return (
            <div
              key={config.type}
              className={`relative rounded-xl border p-2.5 transition-all duration-200 flex flex-col justify-between min-h-[74px] ${
                isRevealed
                  ? `${config.colorClass} bg-slate-950/80 shadow-inner ring-1 ring-white/10`
                  : 'border-slate-800 bg-slate-900/60 hover:bg-slate-800/60 hover:border-slate-700'
              }`}
            >
              {/* Top Row: Icon + Title + Penalty Badge */}
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm select-none">{config.icon}</span>
                  <span className="text-xs font-semibold text-slate-200 truncate">
                    {t(config.titleKey)}
                  </span>
                </div>

                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${config.badgeBg}`}
                  title={`${penalty} pt penalty`}
                >
                  +{penalty}pt
                </span>
              </div>

              {/* Bottom Row: Unlocked Clue or Reveal Button */}
              <div className="mt-2">
                {isRevealed && clue ? (
                  <div className="rounded-lg bg-black/40 px-2 py-1 border border-white/5 animate-fadeIn">
                    <span className="text-xs font-medium font-sans text-slate-100 block break-words">
                      {clue}
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={!isInteractive || !expectedMove}
                    onClick={() => onRevealHint(config.type)}
                    className="w-full rounded-lg border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700 hover:text-white px-2 py-1 text-[11px] font-medium text-slate-300 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                  >
                    🔍 {t('srs.hint_click_to_reveal')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
