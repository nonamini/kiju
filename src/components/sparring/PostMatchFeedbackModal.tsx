/**
 * Post-Match Feedback & Repertoire Integration Modal.
 * Displays match outcome summary, diverged ply, duration, and AI opponent.
 * Allows user to merge sparring moves directly into opening tree,
 * copy KIF to clipboard, rematch, or view historical records.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MatchRecord } from '../../types/match';
import { MergedKifuTree, KifuTreeNode } from '../../types/tree';
import { copyKifToClipboard } from '../../utils/exportHelpers';
import { serializeMovesToKif } from '../../utils/kifSerializer';
import { formatShogiMove } from '../../utils/shogiRules';

export interface PostMatchFeedbackModalProps {
  isOpen: boolean;
  record: MatchRecord | null;
  openingTree?: MergedKifuTree | null;
  onClose: () => void;
  onMergeToTree: (record: MatchRecord) => void;
  onRematch: () => void;
  onViewHistory: () => void;
  onViewMergedBranch?: () => void;
  onStartWeaknessDrill?: (record: MatchRecord) => void;
}

export const PostMatchFeedbackModal: React.FC<PostMatchFeedbackModalProps> = ({
  isOpen,
  record,
  openingTree,
  onClose,
  onMergeToTree,
  onRematch,
  onViewHistory,
  onViewMergedBranch,
  onStartWeaknessDrill,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<boolean>(false);
  const [mergeSuccess, setMergeSuccess] = useState<boolean>(false);

  // Compute divergence information (Move played in match vs Book moves at outOfBookPly)
  // Must be declared at top-level before any conditional early returns (React Rules of Hooks)
  const divergenceInfo = useMemo(() => {
    if (!record || !record.outOfBookPly || record.outOfBookPly <= 0 || !openingTree) {
      return null;
    }
    const ply = record.outOfBookPly;
    const playedMove = record.moves[ply - 1];
    if (!playedMove) return null;

    // Traverse openingTree to find node before outOfBookPly
    let currentChildren: KifuTreeNode[] = openingTree.rootNodes;
    for (let p = 1; p < ply; p++) {
      const targetMove = record.moves[p - 1];
      if (!targetMove) break;
      const matchingNode: KifuTreeNode | undefined = currentChildren.find(
        (n) => n.move.sfenMove === targetMove.sfenMove
      );
      if (!matchingNode || !matchingNode.children) {
        currentChildren = [];
        break;
      }
      currentChildren = matchingNode.children;
    }

    const bookCandidates = currentChildren;
    const isPlayerTurnAtDivergence =
      (record.userColor === 'b' && ply % 2 === 1) ||
      (record.userColor === 'w' && ply % 2 === 0);

    return {
      ply,
      playedMove,
      bookCandidates,
      isPlayerTurnAtDivergence,
    };
  }, [record, openingTree]);

  if (!isOpen || !record) return null;

  const isWin = record.result === 'win';
  const isLoss = record.result === 'loss';
  const isDraw = record.result === 'draw';

  // Compute duration in mm:ss format
  let durationStr = '--:--';
  if (record.startedAt && record.endedAt) {
    const diffSec = Math.max(
      0,
      Math.floor((new Date(record.endedAt).getTime() - new Date(record.startedAt).getTime()) / 1000)
    );
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Handle Copy KIF
  const handleCopyKif = async () => {
    const senteName = record.userColor === 'b' ? 'You (Sente)' : `AI (${record.aiEngine})`;
    const goteName = record.userColor === 'b' ? `AI (${record.aiEngine})` : 'You (Gote)';
    const kifContent = serializeMovesToKif(record.moves, {
      senteName,
      goteName,
      title: `Sparring Match vs ${record.aiEngine}`,
      date: record.endedAt?.slice(0, 10),
      result: isWin ? '投了' : isLoss ? '投了' : '持将棋',
    });

    const success = await copyKifToClipboard(kifContent);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // Handle Merge to Tree
  const handleMerge = () => {
    onMergeToTree(record);
    setMergeSuccess(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-shogi-border bg-slate-900 p-6 shadow-2xl">
        {/* Header Ribbon */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">
              {isWin ? '🏆' : isLoss ? '⚔️' : isDraw ? '🤝' : '⏹️'}
            </span>
            <div>
              <h2 className="text-lg font-bold text-white">
                {t('sparring.feedback_modal_title')}
              </h2>
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold mt-1 ${
                  isWin
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : isLoss
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : isDraw
                    ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {isWin
                  ? t('sparring.result_win')
                  : isLoss
                  ? t('sparring.result_loss')
                  : isDraw
                  ? t('sparring.result_draw')
                  : t('sparring.result_aborted')}
                {record.reason ? ` (${record.reason})` : ''}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            ✕
          </button>
        </div>

        {/* Match Metrics Grid */}
        <div className="my-5 grid grid-cols-2 gap-3 sm:grid-cols-4 font-mono text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <span className="text-slate-500 text-[11px] block">{t('sparring.total_plies', { plies: '' })}</span>
            <span className="text-base font-bold text-slate-200 mt-1 block">
              {record.moves.length}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <span className="text-slate-500 text-[11px] block">{t('sparring.diverged_ply', { ply: '' })}</span>
            <span className="text-base font-bold text-amber-400 mt-1 block">
              {record.outOfBookPly ? `${record.outOfBookPly}手目` : '-'}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <span className="text-slate-500 text-[11px] block">{t('sparring.time_spent', { duration: '' })}</span>
            <span className="text-base font-bold text-slate-200 mt-1 block">
              {durationStr}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <span className="text-slate-500 text-[11px] block">
              {record.hintsViewedCount ? t('sparring.hint_viewed_count', { count: record.hintsViewedCount }) : 'AI Engine'}
            </span>
            <span className="text-xs font-bold text-sky-400 mt-1 block truncate" title={record.aiEngine}>
              {record.hintsViewedCount ? `${record.hintsViewedCount}回` : record.aiEngine}
            </span>
          </div>
        </div>

        {/* Divergence Point Comparison Panel */}
        {divergenceInfo && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-950/15 p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-300 flex items-center gap-1.5">
                <span>⚡</span>
                <span>{t('sparring.divergence_comparison_title')}</span>
                <span className="font-mono text-[11px] text-amber-400">({t('sparring.ply_number', { ply: divergenceInfo.ply })})</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-slate-900 border border-slate-800 text-slate-300">
                {divergenceInfo.isPlayerTurnAtDivergence
                  ? t('sparring.divergence_player_played')
                  : t('sparring.divergence_opponent_played')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {/* Actual move played in match */}
              <div className="rounded-lg border border-rose-500/40 bg-slate-900/90 p-2.5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-rose-400 block tracking-wide">
                  ⚔️ {t('sparring.divergence_actual_played')}
                </span>
                <div className="text-base font-black text-rose-200 font-mono">
                  {formatShogiMove(divergenceInfo.playedMove)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {divergenceInfo.playedMove.sfenMove}
                </div>
              </div>

              {/* Original Book Candidates in Repertoire */}
              <div className="rounded-lg border border-emerald-500/40 bg-slate-900/90 p-2.5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-400 block tracking-wide">
                  📖 {t('sparring.divergence_book_candidates')}
                </span>
                {divergenceInfo.bookCandidates.length > 0 ? (
                  <div className="space-y-1">
                    {divergenceInfo.bookCandidates.map((cand, idx) => (
                      <div
                        key={cand.id || idx}
                        className="flex items-center justify-between text-xs font-mono py-0.5"
                      >
                        <span className="font-bold text-emerald-300">
                          {formatShogiMove(cand.move)}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          {cand.isMainline && (
                            <span className="px-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px]">
                              {t('sparring.divergence_mainline_tag')}
                            </span>
                          )}
                          <span>{t('sparring.games_count', { count: cand.gameCount })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic py-1">
                    {t('tree.no_branches')}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Weakness Drill Alert for Loss */}
        {isLoss && divergenceInfo && onStartWeaknessDrill && (
          <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-950/25 p-3 flex flex-col sm:flex-row items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="text-xs font-bold text-rose-200">
                  {t('weakness.post_match_warning', { count: 1 })}
                </p>
                <p className="text-[11px] text-slate-400">
                  {t('weakness.subtitle')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onStartWeaknessDrill(record)}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs whitespace-nowrap shadow-sm hover:shadow-rose-600/30 transition-all flex items-center gap-1.5"
            >
              <span>⚔️</span>
              <span>{t('weakness.post_match_drill_btn')}</span>
            </button>
          </div>
        )}

        {/* Feedback Messages */}
        {mergeSuccess && (
          <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-3 text-xs text-emerald-300 flex items-center gap-2">
            <span>✨</span>
            <span>{t('sparring.merge_success')}</span>
          </div>
        )}

        {copied && (
          <div className="mb-4 rounded-xl border border-sky-500/40 bg-sky-950/30 p-3 text-xs text-sky-300 flex items-center gap-2">
            <span>📋</span>
            <span>{t('sparring.kif_copied')}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5 pt-2">
          {/* Main Action: Merge into Opening Repertoire Tree */}
          {record.isMergedIntoTree || mergeSuccess ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 py-2.5 text-xs font-bold text-emerald-300">
                <span>✓</span>
                <span>{t('sparring.merged_badge')}</span>
              </div>
              {onViewMergedBranch && (
                <button
                  type="button"
                  onClick={onViewMergedBranch}
                  className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-md hover:from-amber-400 hover:to-amber-500 transition active:scale-[0.98]"
                >
                  <span>🌳</span>
                  <span>{t('ingestion.view_merged_branch')}</span>
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleMerge}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-amber-950/40 hover:from-amber-400 hover:to-amber-500 transition active:scale-[0.98]"
            >
              <span>🌳</span>
              <span>{t('sparring.merge_to_tree')}</span>
            </button>
          )}

          {/* Secondary Actions Row */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCopyKif}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
            >
              <span>📋</span>
              <span>{t('sparring.copy_kif')}</span>
            </button>

            <button
              type="button"
              onClick={onViewHistory}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
            >
              <span>📜</span>
              <span>{t('sparring.view_history')}</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800/60 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              {t('common.close')}
            </button>

            <button
              type="button"
              onClick={onRematch}
              className="rounded-lg bg-sky-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-sky-500 transition shadow"
            >
              🔄 {t('sparring.rematch')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
