/**
 * Player Detail & Statistics Modal (Issue #58, Epic 14).
 * Displays auto-aggregated win rates, Sente/Gote split, yearly breakdown,
 * top openings, frequent opponents, an inline style/tendency memo editor,
 * recent related games, and links to Unified Kifu Library (/library?playerId=...)
 * and Settings.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { MatchPattern } from '../../types/evaluation';
import type { KifuRecord } from '../../types/kifuRecord';
import type {
  PlayerCategory,
  PlayerOpeningTendencyManual,
  ShogiPlayerProfile,
} from '../../types/player';
import {
  aggregatePlayerOpeningTendency,
  DEFAULT_PLAYER_STYLE_TAGS,
} from '../../utils/playerOpeningTendency';
import { PlayerOpeningTendencySection } from './PlayerOpeningTendencySection';
import { useSettings } from '../../contexts/SettingsContext';
import { auth } from '../../services/firebase';
import {
  ensureKifuRecordPayload,
  uploadPlayerToFirestore,
} from '../../services/firestoreKifuSync';
import { updateKifuRecord } from '../../utils/kifuRecordStorage';
import { aggregatePlayerStats } from '../../utils/playerStatsAggregator';
import {
  aggregatePlayerEvaluation,
  computeKifuEvaluationSummary,
  getQualityLevelBadgeMeta,
} from '../../utils/playerEvaluationAggregator';
import {
  loadPlayerProfiles,
  upsertPlayerProfile,
} from '../../utils/playerStorage';
import { RadarChart } from '../eval/RadarChart';

function getPatternLabelKey(pattern: MatchPattern): string {
  switch (pattern) {
    case 'WIRE_TO_WIRE':
      return 'players_page.pattern_wire';
    case 'COMEBACK':
      return 'players_page.pattern_comeback';
    case 'SEESAW':
      return 'players_page.pattern_seesaw';
    case 'CRUSH':
    default:
      return 'players_page.pattern_crush';
  }
}

export interface PlayerDetailModalProps {
  player: ShogiPlayerProfile | null;
  records: KifuRecord[];
  profiles: ShogiPlayerProfile[];
  onClose: () => void;
  onUpdated: () => void;
}

function getCategoryIcon(cat: PlayerCategory): string {
  if (cat === 'user') return '👤';
  if (cat === 'ai') return '🤖';
  return '🏯';
}

function toSafeExternalHref(raw?: string): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || trimmed === 'none') return null;
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return trimmed;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;
  return `https://${trimmed}`;
}

export const PlayerDetailModal: React.FC<PlayerDetailModalProps> = ({
  player,
  records,
  profiles,
  onClose,
  onUpdated,
}) => {
  const { t } = useTranslation();
  const { settings, openSettings } = useSettings();
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState('');
  const [ratingUrl, setRatingUrl] = useState('');
  const [jsaUrl, setJsaUrl] = useState('');
  const [memoSaved, setMemoSaved] = useState(false);
  const [isHydratingEval, setIsHydratingEval] = useState(false);
  const attemptedHydrationRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setNote(player?.note ?? '');
    setTags(player?.tags ?? []);
    setCustomTagInput('');
    setRatingUrl(player?.ratingUrl ?? '');
    setJsaUrl(player?.jsaUrl ?? '');
    setMemoSaved(false);
  }, [player?.id, player?.note, player?.tags, player?.ratingUrl, player?.jsaUrl]);

  // Lazily hydrate already-analyzed games missing cached evaluationSummary
  useEffect(() => {
    if (!player) return;
    const candidates = records.filter(
      (r) =>
        (r.sentePlayerId === player.id || r.gotePlayerId === player.id) &&
        !r.evaluationSummary &&
        !attemptedHydrationRef.current.has(r.id) &&
        (r.analysisStatus === 'completed' || (r.analyzedPliesCount ?? 0) >= 4)
    );
    if (candidates.length === 0) return;

    let cancelled = false;
    setIsHydratingEval(true);
    for (const c of candidates) {
      attemptedHydrationRef.current.add(c.id);
    }

    const uid = auth?.currentUser?.uid;
    void (async () => {
      let updatedAny = false;
      for (const rec of candidates) {
        if (cancelled) break;
        const full = await ensureKifuRecordPayload(uid, rec.id);
        if (!full) continue;
        const summary = computeKifuEvaluationSummary(full);
        if (summary) {
          updateKifuRecord(rec.id, { evaluationSummary: summary });
          updatedAny = true;
        }
      }
      if (!cancelled) {
        setIsHydratingEval(false);
        if (updatedAny) {
          onUpdated();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [player, records, onUpdated]);

  const stats = useMemo(
    () => (player ? aggregatePlayerStats(player.id, records, profiles, 5) : null),
    [player, records, profiles]
  );

  const playerEval = useMemo(
    () => (player ? aggregatePlayerEvaluation(player.id, records) : null),
    [player, records]
  );

  const relatedGames = useMemo(() => {
    if (!player) return [];
    return records
      .filter(
        (r) => r.sentePlayerId === player.id || r.gotePlayerId === player.id
      )
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, 8);
  }, [player, records]);

  const autoTendency = useMemo(
    () => (player ? aggregatePlayerOpeningTendency(player, records) : null),
    [player, records]
  );

  if (!player || !stats || !autoTendency) return null;

  const persistPlayerPatch = (patch: Partial<ShogiPlayerProfile>) => {
    const updated: ShogiPlayerProfile = {
      ...player,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    upsertPlayerProfile(updated);
    const uid = auth?.currentUser?.uid;
    if (uid) {
      const saved = loadPlayerProfiles().find((p) => p.id === updated.id);
      if (saved) void uploadPlayerToFirestore(uid, saved);
    }
    onUpdated();
  };

  const handleToggleTag = (tag: string) => {
    const nextTags = tags.includes(tag)
      ? tags.filter((tItem) => tItem !== tag)
      : [...tags, tag];
    setTags(nextTags);
    persistPlayerPatch({ tags: nextTags });
  };

  const handleAddCustomTag = () => {
    const val = customTagInput.trim().replace(/^#/, '');
    if (!val) return;
    if (!tags.includes(val)) {
      const nextTags = [...tags, val];
      setTags(nextTags);
      persistPlayerPatch({ tags: nextTags });
    }
    setCustomTagInput('');
  };

  const handleSaveManualTendency = (next: PlayerOpeningTendencyManual) => {
    persistPlayerPatch({ manualOpeningTendency: next });
  };

  const handleSaveMemo = (e: React.FormEvent) => {
    e.preventDefault();
    persistPlayerPatch({
      tags,
      note: note.trim() || undefined,
      ratingUrl: ratingUrl.trim() || undefined,
      jsaUrl: jsaUrl.trim() || undefined,
    });
    setMemoSaved(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('players_page.detail_title')}
    >
      <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/50 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg">{getCategoryIcon(player.category)}</span>
              <h2 className="text-base sm:text-lg font-bold text-slate-100 truncate">
                {player.name}
              </h2>
              {player.title && (
                <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-semibold">
                  {player.title}
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full bg-slate-800 text-sky-300 border border-slate-700 text-xs font-mono">
                {t('players_page.game_count', { count: stats.totalGames })}
              </span>
            </div>
            {player.aliases && player.aliases.length > 0 && (
              <p className="text-[11px] text-slate-400 mt-1 truncate">
                {t('players_page.aliases_label')}: {player.aliases.join(', ')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onClose();
                openSettings();
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition"
            >
              ⚙️ {t('players_page.open_settings')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Summary Stats Cards: Overall / As Sente / As Gote */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                label: t('players_page.stat_overall'),
                wins: stats.wins,
                losses: stats.losses,
                games: stats.totalGames,
                winRate: stats.winRate,
                accent: 'text-amber-300',
                bar: 'bg-amber-500',
              },
              {
                label: `☗ ${t('players_page.stat_sente')}`,
                wins: stats.asSente.wins,
                losses: stats.asSente.losses,
                games: stats.asSente.games,
                winRate: stats.asSente.winRate,
                accent: 'text-emerald-300',
                bar: 'bg-emerald-500',
              },
              {
                label: `☖ ${t('players_page.stat_gote')}`,
                wins: stats.asGote.wins,
                losses: stats.asGote.losses,
                games: stats.asGote.games,
                winRate: stats.asGote.winRate,
                accent: 'text-sky-300',
                bar: 'bg-sky-500',
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold">
                  <span>{card.label}</span>
                  <span className="font-mono">
                    {t('players_page.game_count', { count: card.games })}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className={`text-lg font-extrabold font-mono ${card.accent}`}>
                    {card.winRate}%
                  </span>
                  <span className="text-slate-300 font-mono">
                    {t('players_page.win_loss_fmt', {
                      wins: card.wins,
                      losses: card.losses,
                    })}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full ${card.bar}`}
                    style={{ width: `${Math.min(100, Math.max(0, card.winRate))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* AI Overall Evaluation & 5-Axis Radar Chart (#58b) */}
          <div className="rounded-xl border border-amber-500/30 bg-slate-950/75 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="text-base">🤖</span>
                <h3 className="font-bold text-slate-100 text-xs sm:text-sm">
                  {t('players_page.ai_eval_title')}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {isHydratingEval && (
                  <span className="text-[11px] text-amber-300 animate-pulse">
                    ⏳ {t('players_page.ai_eval_hydrating')}
                  </span>
                )}
                {playerEval && (() => {
                  const badge = getQualityLevelBadgeMeta(playerEval.overallLevel);
                  return (
                    <>
                      <span className="px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-300">
                        {t('players_page.ai_eval_analyzed_badge', {
                          analyzed: playerEval.analyzedGamesCount,
                          total: playerEval.totalGamesCount,
                        })}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${badge.badgeClass}`}
                      >
                        {t(badge.labelKey, badge.defaultLabel)}
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>

            {!playerEval ? (
              <p className="text-slate-400 text-[11px] leading-relaxed py-2">
                {isHydratingEval
                  ? t('players_page.ai_eval_hydrating')
                  : t('players_page.ai_eval_empty')}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="flex flex-col items-center justify-center p-2 bg-slate-900/60 rounded-xl border border-slate-800">
                  <RadarChart scores={playerEval.radarChart} size={220} />
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl bg-slate-900/90 border border-slate-700/80 p-3 space-y-1.5">
                    <div className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                      <span>💬</span>
                      <span>{t('players_page.ai_eval_comment_title')}</span>
                    </div>
                    <p className="leading-relaxed text-slate-300 text-[11px] sm:text-xs">
                      {playerEval.overallComment}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 font-mono">
                    <div
                      className="bg-slate-900/70 p-2.5 rounded-lg border border-slate-800"
                      title={`ACL: ${playerEval.avgAcl}`}
                    >
                      <div className="text-[10px] text-slate-400">
                        {t('players_page.ai_eval_mean_wr_loss')}
                      </div>
                      <div className="text-xs font-bold text-amber-300 mt-0.5">
                        {playerEval.avgMeanWinRateLoss}%
                      </div>
                    </div>
                    <div className="bg-slate-900/70 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400">
                        {t('players_page.ai_eval_critical_acc')}
                      </div>
                      <div className="text-xs font-bold text-emerald-400 mt-0.5">
                        {playerEval.avgCriticalAccuracy}%
                      </div>
                    </div>
                    <div className="bg-slate-900/70 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400">
                        {t('players_page.ai_eval_avg_blunders')}
                      </div>
                      <div
                        className={`text-xs font-bold mt-0.5 ${
                          playerEval.avgBlundersPerGame > 0.5
                            ? 'text-rose-400'
                            : 'text-slate-200'
                        }`}
                      >
                        {t('players_page.ai_eval_avg_blunders_fmt', {
                          count: playerEval.avgBlundersPerGame,
                        })}
                      </div>
                    </div>
                    <div className="bg-slate-900/70 p-2.5 rounded-lg border border-slate-800">
                      <div className="text-[10px] text-slate-400">
                        {t('players_page.ai_eval_dominant_pattern')}
                      </div>
                      <div className="text-xs font-bold text-sky-300 mt-0.5 truncate">
                        {t(getPatternLabelKey(playerEval.dominantPattern))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Top Openings & Frequent Opponents */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-2.5">
              <h3 className="font-bold text-slate-200">
                ⚔️ {t('players_page.stat_openings')}
              </h3>
              {stats.topOpenings.length === 0 ? (
                <p className="text-slate-500">—</p>
              ) : (
                <div className="space-y-1.5">
                  {stats.topOpenings.map((op) => (
                    <div
                      key={op.openingId}
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-900/70 px-2.5 py-1.5 border border-slate-800/80"
                    >
                      <span className="text-slate-200 truncate">
                        {op.openingName}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 shrink-0">
                        {t('players_page.game_count', { count: op.games })} ·{' '}
                        <span className="text-amber-300">{op.winRate}%</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-2.5">
              <h3 className="font-bold text-slate-200">
                🤝 {t('players_page.stat_opponents')}
              </h3>
              {stats.topOpponents.length === 0 ? (
                <p className="text-slate-500">—</p>
              ) : (
                <div className="space-y-1.5">
                  {stats.topOpponents.map((opp) => (
                    <div
                      key={opp.opponentKey}
                      className="flex items-center justify-between gap-2 rounded-lg bg-slate-900/70 px-2.5 py-1.5 border border-slate-800/80"
                    >
                      <span className="text-slate-200 truncate">
                        {opp.opponentName}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 shrink-0">
                        {t('players_page.win_loss_fmt', {
                          wins: opp.wins,
                          losses: opp.losses,
                        })}{' '}
                        (<span className="text-sky-300">{opp.winRate}%</span>)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Yearly Breakdown */}
          {stats.yearly.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-2.5">
              <h3 className="font-bold text-slate-200">
                📅 {t('players_page.stat_yearly')}
              </h3>
              <div className="space-y-1.5">
                {stats.yearly.map((y) => (
                  <div
                    key={y.year}
                    className="grid grid-cols-12 items-center gap-2 text-[11px]"
                  >
                    <span className="col-span-2 font-mono text-slate-300">
                      {y.year}
                    </span>
                    <div className="col-span-6 h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-amber-500"
                        style={{
                          width: `${Math.min(100, Math.max(0, y.winRate))}%`,
                        }}
                      />
                    </div>
                    <span className="col-span-4 text-right font-mono text-slate-400">
                      {t('players_page.win_loss_fmt', {
                        wins: y.wins,
                        losses: y.losses,
                      })}{' '}
                      ({y.winRate}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rating-page style Opening Tendency Section */}
          <PlayerOpeningTendencySection
            autoTendency={autoTendency}
            manualTendency={player.manualOpeningTendency}
            onSaveManual={handleSaveManualTendency}
          />

          {/* Player Style Tags Editor */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200">
                🏷️ {t('players_page.player_tags_label', '棋士タグ（棋風・戦型タイプ）')}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(new Set([...DEFAULT_PLAYER_STYLE_TAGS, ...tags])).map((tag) => {
                const active = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition ${
                      active
                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    }`}
                  >
                    #{tag} {active ? '✓' : '+'}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <input
                type="text"
                value={customTagInput}
                onChange={(e) => setCustomTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomTag();
                  }
                }}
                placeholder={t('players_page.add_custom_tag_placeholder', 'カスタムタグを追加 (例: 矢倉党)...')}
                className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
              />
              <button
                type="button"
                onClick={handleAddCustomTag}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-semibold transition"
              >
                {t('common.add', '追加')}
              </button>
            </div>
          </div>

          {/* Style & Tendency Memo Editor */}
          <form
            onSubmit={handleSaveMemo}
            className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-2.5"
          >
            {(() => {
              const showLink1 =
                Boolean(toSafeExternalHref(settings.externalPlayerLink1BaseUrl)) ||
                ratingUrl.trim() !== '';
              const showLink2 =
                Boolean(toSafeExternalHref(settings.externalPlayerLink2BaseUrl)) ||
                jsaUrl.trim() !== '';
              if (!showLink1 && !showLink2) return null;

              const link1Label =
                settings.externalPlayerLink1Label?.trim() ||
                t('players_page.detail.rating_url_label');
              const link2Label =
                settings.externalPlayerLink2Label?.trim() ||
                t('players_page.detail.jsa_url_label');

              return (
                <div
                  className={`grid grid-cols-1 ${showLink1 && showLink2 ? 'sm:grid-cols-2 ' : ''}gap-2.5 pb-1`}
                >
                  {showLink1 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                        <span>📊 {link1Label}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRatingUrl(ratingUrl === 'none' ? '' : 'none');
                              setMemoSaved(false);
                            }}
                            className={`text-[10px] px-1.5 py-0.5 rounded border transition ${
                              ratingUrl === 'none'
                                ? 'bg-slate-700 text-amber-300 border-amber-500/50'
                                : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                            }`}
                          >
                            {ratingUrl === 'none'
                              ? t('players_page.detail.no_link')
                              : t('players_page.detail.disable_link')}
                          </button>
                          {ratingUrl !== 'none' &&
                            (() => {
                              const effectiveHref = toSafeExternalHref(
                                ratingUrl.trim() || settings.externalPlayerLink1BaseUrl
                              );
                              if (!effectiveHref) return null;
                              return (
                                <a
                                  href={effectiveHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sky-400 hover:underline"
                                >
                                  {ratingUrl.trim()
                                    ? t('players_page.detail.open_link')
                                    : t('players_page.detail.open_site')}{' '}
                                  ↗
                                </a>
                              );
                            })()}
                        </div>
                      </div>
                      <input
                        type="text"
                        disabled={ratingUrl === 'none'}
                        value={
                          ratingUrl === 'none' ? t('players_page.detail.no_link_value') : ratingUrl
                        }
                        onChange={(e) => {
                          setRatingUrl(e.target.value);
                          setMemoSaved(false);
                        }}
                        placeholder="https://example.com/..."
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 disabled:opacity-50 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  )}
                  {showLink2 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                        <span>🏯 {link2Label}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setJsaUrl(jsaUrl === 'none' ? '' : 'none');
                              setMemoSaved(false);
                            }}
                            className={`text-[10px] px-1.5 py-0.5 rounded border transition ${
                              jsaUrl === 'none'
                                ? 'bg-slate-700 text-amber-300 border-amber-500/50'
                                : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                            }`}
                          >
                            {jsaUrl === 'none'
                              ? t('players_page.detail.no_link')
                              : t('players_page.detail.disable_link')}
                          </button>
                          {jsaUrl !== 'none' &&
                            (() => {
                              const effectiveHref = toSafeExternalHref(
                                jsaUrl.trim() || settings.externalPlayerLink2BaseUrl
                              );
                              if (!effectiveHref) return null;
                              return (
                                <a
                                  href={effectiveHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-400 hover:underline"
                                >
                                  {jsaUrl.trim()
                                    ? t('players_page.detail.open_link')
                                    : t('players_page.detail.open_site')}{' '}
                                  ↗
                                </a>
                              );
                            })()}
                        </div>
                      </div>
                      <input
                        type="text"
                        disabled={jsaUrl === 'none'}
                        value={jsaUrl === 'none' ? t('players_page.detail.no_link_value') : jsaUrl}
                        onChange={(e) => {
                          setJsaUrl(e.target.value);
                          setMemoSaved(false);
                        }}
                        placeholder="https://example.com/..."
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 disabled:opacity-50 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-200">
                📝 {t('players_page.memo_label')}
              </label>
              {memoSaved && (
                <span className="text-[11px] text-emerald-400">
                  ✓ {t('players_page.memo_saved')}
                </span>
              )}
            </div>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setMemoSaved(false);
              }}
              placeholder={t('players_page.memo_placeholder')}
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition"
              >
                {t('common.save')}
              </button>
            </div>
          </form>

          {/* Related Games Preview + Unified Library Link */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-slate-200">
                📜 {t('players_page.related_games')} ({stats.totalGames})
              </h3>
              <Link
                to={`/library?playerId=${encodeURIComponent(player.id)}`}
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold transition"
              >
                📚 {t('players_page.open_in_library')} →
              </Link>
            </div>
            {relatedGames.length === 0 ? (
              <p className="text-slate-500">{t('library_page.empty')}</p>
            ) : (
              <div className="space-y-1.5">
                {relatedGames.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-900/70 px-3 py-2 border border-slate-800/80"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-200 truncate">
                        {rec.title}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {(rec.matchDate || rec.createdAt || '').slice(0, 10)} ·{' '}
                        {rec.openingName}
                      </div>
                    </div>
                    <Link
                      to={`/studio?gameId=${encodeURIComponent(rec.id)}`}
                      onClick={onClose}
                      className="px-2.5 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-semibold shrink-0"
                    >
                      {t('library_page.go_studio')}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
