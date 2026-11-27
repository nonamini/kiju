/**
 * Position Reverse Search Modal for SingleScreenStudioPage (Issue #10).
 * Finds all KifuRecords in the library containing the current board position (SFEN),
 * including transpositions converging at different ply counts, and jumps directly to the ply.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict without any (Rule 2).
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { KifuRecord } from '../../types/kifuRecord';
import { loadKifuRecords } from '../../utils/kifuRecordStorage';
import {
  searchLibraryByPositionSfen,
  searchLibraryByPositionSfenAsync,
  SfenReverseMatch,
} from '../../utils/sfenReverseSearch';

export interface PositionReverseSearchModalProps {
  isOpen: boolean;
  targetSfen: string;
  currentGameId?: string | null;
  onClose: () => void;
  onJumpToMatch: (record: KifuRecord, matchedPly: number) => void;
}

export const PositionReverseSearchModal: React.FC<
  PositionReverseSearchModalProps
> = ({ isOpen, targetSfen, currentGameId, onClose, onJumpToMatch }) => {
  const { t } = useTranslation();
  const [matches, setMatches] = useState<SfenReverseMatch[]>([]);

  useEffect(() => {
    if (!isOpen || !targetSfen) {
      setMatches([]);
      return;
    }

    let cancelled = false;
    const records = loadKifuRecords();
    setMatches(searchLibraryByPositionSfen(targetSfen, records));

    void searchLibraryByPositionSfenAsync(targetSfen, records).then((all) => {
      if (!cancelled) {
        setMatches(all);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, targetSfen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('position_reverse_search.title')}
    >
      <div className="w-full max-w-2xl max-h-[85vh] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-amber-300 flex items-center gap-2">
              <span>🔍</span>
              <span>{t('position_reverse_search.title')}</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              {t('position_reverse_search.match_count', { count: matches.length })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {matches.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              {t('position_reverse_search.empty')}
            </div>
          ) : (
            matches.map(({ record, matchedPly, nextMoveLabel }) => {
              const isCurrent = Boolean(currentGameId && record.id === currentGameId);
              return (
                <div
                  key={`${record.id}-${matchedPly}`}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-700 transition"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-100 truncate">
                        {record.title}
                      </span>
                      {isCurrent && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10px] font-semibold">
                          {t('position_reverse_search.current_game_badge')}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>
                        ▲ {record.senteName} vs △ {record.goteName}
                      </span>
                      {record.openingName && (
                        <span className="text-slate-500">· {record.openingName}</span>
                      )}
                      {record.matchDate && (
                        <span className="text-slate-500 font-mono">· {record.matchDate}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono font-semibold">
                        {t('position_reverse_search.matched_ply', { ply: matchedPly })}
                      </span>
                      {nextMoveLabel && (
                        <span className="text-sky-300">
                          {t('position_reverse_search.next_move', { move: nextMoveLabel })}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onJumpToMatch(record, matchedPly);
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shrink-0"
                  >
                    {t('position_reverse_search.jump_btn')}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
