/**
 * Sparring Match History Dashboard Component.
 * Displays aggregate performance statistics (wins, losses, win rate),
 * historical game records with replay viewer / move list,
 * tree merging capabilities, and record management (delete, clear).
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MatchRecord } from '../../types/match';
import {
  calculateMatchHistoryStats,
  deleteMatchRecord,
  clearAllMatchRecords,
} from '../../utils/matchHistoryStorage';
import { formatShogiMove } from '../../utils/shogiRules';
import { serializeMovesToKif } from '../../utils/kifSerializer';
import { copyKifToClipboard } from '../../utils/exportHelpers';
import { WeaknessPosition } from '../../types/weakness';
import { MergedKifuTree } from '../../types/tree';
import { detectWeaknessPositions } from '../../utils/weaknessDetector';
import { WeaknessAnalysisView } from '../quiz/WeaknessAnalysisView';

export interface MatchHistoryDashboardProps {
  isOpen: boolean;
  records: MatchRecord[];
  onClose: () => void;
  onRecordsChange: (updated: MatchRecord[]) => void;
  onMergeRecordToTree: (record: MatchRecord) => void;
  onStartWeaknessDrill?: (position: WeaknessPosition) => void;
  trees?: Record<string, MergedKifuTree>;
}

export const MatchHistoryDashboard: React.FC<MatchHistoryDashboardProps> = ({
  isOpen,
  records,
  onClose,
  onRecordsChange,
  onMergeRecordToTree,
  onStartWeaknessDrill,
  trees,
}) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'matches' | 'weaknesses'>('matches');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const stats = useMemo(() => calculateMatchHistoryStats(records), [records]);
  const weaknessPositions = useMemo(
    () => detectWeaknessPositions(records, { trees }),
    [records, trees]
  );

  if (!isOpen) return null;

  const selectedRecord = records.find((r) => r.id === selectedRecordId) ?? null;

  // Handle single deletion
  const handleDelete = (id: string) => {
    const updated = deleteMatchRecord(id);
    onRecordsChange(updated);
    if (selectedRecordId === id) {
      setSelectedRecordId(null);
    }
  };

  // Handle clear all
  const handleClearAll = () => {
    if (window.confirm(t('sparring.history_clear_confirm'))) {
      clearAllMatchRecords();
      onRecordsChange([]);
      setSelectedRecordId(null);
    }
  };

  // Handle copy KIF for record
  const handleCopyKif = async (record: MatchRecord) => {
    const senteName = record.userColor === 'b' ? 'You (Sente)' : `AI (${record.aiEngine})`;
    const goteName = record.userColor === 'b' ? `AI (${record.aiEngine})` : 'You (Gote)';
    const kifContent = serializeMovesToKif(record.moves, {
      senteName,
      goteName,
      title: `Sparring Match vs ${record.aiEngine}`,
      date: record.endedAt?.slice(0, 10),
      result: record.result === 'win' ? '投了' : record.result === 'loss' ? '投了' : '持将棋',
    });

    const ok = await copyKifToClipboard(kifContent);
    if (ok) {
      setCopiedId(record.id);
      setTimeout(() => setCopiedId(null), 2500);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative flex flex-col w-full max-w-4xl max-h-[90vh] rounded-2xl border border-shogi-border bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header Ribbon */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📜</span>
            <div>
              <h2 className="text-lg font-bold text-white">
                {t('sparring.history_dashboard_title')}
              </h2>
              <span className="text-xs text-slate-400">
                {t('sparring.history_win_loss', {
                  wins: stats.wins,
                  losses: stats.losses,
                  draws: stats.draws,
                })}
                {' · '}
                <strong className="text-amber-400">{t('sparring.history_win_rate', { rate: stats.winRatePct })}</strong>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {records.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-900/40 transition"
              >
                {t('sparring.history_clear_all')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Aggregate Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-6 pb-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <span className="text-slate-500 text-[11px] block">{t('sparring.history_total_matches')}</span>
            <span className="text-xl font-bold font-mono text-slate-100 mt-1 block">
              {stats.totalMatches}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <span className="text-slate-500 text-[11px] block">{t('sparring.result_win')}</span>
            <span className="text-xl font-bold font-mono text-emerald-400 mt-1 block">
              {stats.wins}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <span className="text-slate-500 text-[11px] block">{t('sparring.result_loss')}</span>
            <span className="text-xl font-bold font-mono text-rose-400 mt-1 block">
              {stats.losses}
            </span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <span className="text-slate-500 text-[11px] block">{t('sparring.history_win_rate', { rate: '' })}</span>
            <span className="text-xl font-bold font-mono text-amber-400 mt-1 block">
              {stats.winRatePct}%
            </span>
          </div>
        </div>

        {/* View Mode Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-1 pb-2 border-b border-slate-800">
          <button
            type="button"
            onClick={() => setViewMode('matches')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              viewMode === 'matches'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>📜</span>
            <span>{t('sparring.history_dashboard_title')}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">
              {records.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('weaknesses')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              viewMode === 'weaknesses'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>⚠️</span>
            <span>{t('weakness.title')}</span>
            {weaknessPositions.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-500/30 text-rose-300 font-bold">
                {weaknessPositions.length}
              </span>
            )}
          </button>
        </div>

        {/* Content Area */}
        {viewMode === 'weaknesses' ? (
          <div className="flex-1 overflow-y-auto p-6">
            <WeaknessAnalysisView
              positions={weaknessPositions}
              onStartDrill={(pos) => {
                if (onStartWeaknessDrill) {
                  onStartWeaknessDrill(pos);
                  onClose();
                }
              }}
            />
          </div>
        ) : (
          /* Split View (List on left, Replay on right) */
          <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 p-6 gap-6 pt-3">
            {/* Records List Column */}
            <div className={`overflow-y-auto space-y-2.5 pr-2 ${selectedRecord ? 'md:col-span-7' : 'md:col-span-12'}`}>
              {records.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-slate-500">
                  <span className="text-3xl block mb-2">📭</span>
                  <p className="text-xs">{t('sparring.history_no_records')}</p>
              </div>
            ) : (
              records.map((rec) => {
                const isSelected = rec.id === selectedRecordId;
                const isWin = rec.result === 'win';
                const isLoss = rec.result === 'loss';
                const isDraw = rec.result === 'draw';

                return (
                  <div
                    key={rec.id}
                    className={`rounded-xl border p-3.5 transition-all ${
                      isSelected
                        ? 'border-amber-500 bg-slate-800/90 shadow-md ring-1 ring-amber-500/40'
                        : 'border-slate-800 bg-slate-950/50 hover:bg-slate-800/40 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-bold ${
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
                        </span>
                        <span className="text-xs font-semibold text-slate-200">
                          {rec.userColor === 'b' ? '▲ 先手' : '△ 後手'} vs {rec.aiEngine}
                        </span>
                        {rec.isMergedIntoTree && (
                          <span className="rounded-full bg-emerald-950/80 border border-emerald-500/30 px-2 py-0.2 text-[10px] text-emerald-300">
                            ✓ {t('sparring.merged_badge')}
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] text-slate-500 font-mono">
                        {rec.endedAt ? rec.endedAt.slice(0, 16).replace('T', ' ') : ''}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                      <div className="flex items-center gap-3 font-mono text-[11px]">
                        <span>{rec.moves.length} moves</span>
                        {rec.outOfBookPly && (
                          <span className="text-amber-400">
                            {t('sparring.diverged_ply', { ply: rec.outOfBookPly })}
                          </span>
                        )}
                      </div>

                      {/* Action buttons on card */}
                      <div className="flex items-center gap-2">
                        {!rec.isMergedIntoTree && (
                          <button
                            type="button"
                            onClick={() => onMergeRecordToTree(rec)}
                            className="rounded px-2 py-1 text-[11px] font-bold bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition"
                          >
                            🌳 {t('sparring.history_merge_btn')}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleCopyKif(rec)}
                          className="rounded px-2 py-1 text-[11px] text-slate-300 bg-slate-800 hover:bg-slate-700 transition"
                          title="Copy KIF"
                        >
                          {copiedId === rec.id ? '✓' : '📋'}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setSelectedRecordId((prev) => (prev === rec.id ? null : rec.id))
                          }
                          className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
                            isSelected
                              ? 'bg-sky-600 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {t('sparring.history_replay_btn')}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(rec.id)}
                          className="rounded px-2 py-1 text-[11px] text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition"
                          title="Delete"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Replay / Move Inspection Drawer Column */}
          {selectedRecord && (
            <div className="md:col-span-5 flex flex-col rounded-xl border border-slate-800 bg-slate-950/80 p-4 overflow-hidden">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    📋 {t('sparring.move_history')}
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {selectedRecord.moves.length} moves
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRecordId(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Scrollable Move History List */}
              <div className="flex-1 overflow-y-auto space-y-1 font-mono text-xs mt-3 pr-1">
                {selectedRecord.moves.map((m, idx) => {
                  const isOutOfBook =
                    selectedRecord.outOfBookPly !== undefined &&
                    m.ply >= selectedRecord.outOfBookPly;
                  const isFirstOutOfBook = m.ply === selectedRecord.outOfBookPly;
                  const prevDest =
                    idx > 0 ? selectedRecord.moves[idx - 1]?.to : undefined;

                  return (
                    <React.Fragment key={`replay-${m.ply}`}>
                      {isFirstOutOfBook && (
                        <div className="my-1.5 rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10px] text-amber-300 font-sans font-bold flex items-center justify-between">
                          <span>⚡ {t('sparring.out_of_book')}</span>
                          <span>{t('sparring.out_of_book_at_ply', { ply: m.ply })}</span>
                        </div>
                      )}
                      <div
                        className={`flex items-center justify-between px-2.5 py-1 rounded ${
                          isOutOfBook
                            ? 'bg-slate-900/60 text-slate-300'
                            : 'bg-emerald-950/20 text-emerald-300/90'
                        }`}
                      >
                        <span className="w-8 text-slate-500">{m.ply}.</span>
                        <span className="flex-1 font-sans">
                          {formatShogiMove(m, prevDest)}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {m.sfenMove}
                        </span>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Action Buttons for Selected Record */}
              <div className="pt-3 border-t border-slate-800 flex items-center gap-2 mt-2">
                {!selectedRecord.isMergedIntoTree && (
                  <button
                    type="button"
                    onClick={() => onMergeRecordToTree(selectedRecord)}
                    className="flex-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition"
                  >
                    🌳 {t('sparring.history_merge_btn')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCopyKif(selectedRecord)}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
                >
                  📋 {copiedId === selectedRecord.id ? t('kifu.copied') : t('sparring.copy_kif')}
                </button>
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
};
