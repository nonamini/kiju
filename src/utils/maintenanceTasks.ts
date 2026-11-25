/**
 * Daily Maintenance Task Generator.
 * Scans KifuRecords and ShogiPlayerProfiles for unmaintained items
 * (missing player links, untagged/unclassified games, unreviewed games)
 * and picks a small daily batch so users can polish data incrementally.
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import type { KifuRecord } from '../types/kifuRecord';
import type { ShogiPlayerProfile } from '../types/player';

export type MaintenanceTaskKind = 'player_link' | 'kifu_tag' | 'kifu_review';

export interface MaintenanceTaskItem {
  id: string;
  kind: MaintenanceTaskKind;
  title: string;
  subtitle: string;
  route: string;
}

export interface MaintenanceProgress {
  done: number;
  total: number;
}

export interface MaintenanceSummary {
  playerLinks: MaintenanceProgress;
  kifuTags: MaintenanceProgress;
  kifuReview: MaintenanceProgress;
  pendingTasks: MaintenanceTaskItem[];
}

export function buildMaintenanceSummary(
  records: KifuRecord[],
  profiles: ShogiPlayerProfile[]
): MaintenanceSummary {
  const pendingTasks: MaintenanceTaskItem[] = [];

  const activeProfiles = profiles.filter((p) => !p.deletedAt);
  const activeRecords = records.filter((r) => !r.deletedAt);
  const proPlayers = activeProfiles.filter((p) => p.category === 'pro');
  let playerLinksDone = 0;
  for (const p of proPlayers) {
    const hasLinks = Boolean(p.ratingUrl?.trim() && p.jsaUrl?.trim());
    if (hasLinks) {
      playerLinksDone += 1;
    } else {
      pendingTasks.push({
        id: `player-${p.id}`,
        kind: 'player_link',
        title: `${p.name} の外部リンク設定`,
        subtitle: 'レーティング・連盟棋士DBのURLを登録しましょう',
        route: `/players?playerId=${encodeURIComponent(p.id)}`,
      });
    }
  }

  let kifuTagsDone = 0;
  let kifuReviewDone = 0;
  for (const r of activeRecords) {
    const hasTags = (r.tags?.length ?? 0) > 0 && r.openingId !== 'other';
    if (hasTags) {
      kifuTagsDone += 1;
    } else {
      pendingTasks.push({
        id: `tag-${r.id}`,
        kind: 'kifu_tag',
        title: `${r.title || `${r.senteName} vs ${r.goteName}`} のタグ・戦型整理`,
        subtitle: '戦型やタグを付けて検索しやすくしましょう',
        route: `/library?q=${encodeURIComponent(r.title || `${r.senteName} vs ${r.goteName}`)}`,
      });
    }

    const isReviewed = r.reviewStatus === 'read';
    if (isReviewed) {
      kifuReviewDone += 1;
    } else {
      pendingTasks.push({
        id: `review-${r.id}`,
        kind: 'kifu_review',
        title: `${r.title || `${r.senteName} vs ${r.goteName}`} を通し確認`,
        subtitle: '棋譜を最後まで並べて確認しましょう',
        route: `/studio?gameId=${encodeURIComponent(r.id)}`,
      });
    }
  }

  return {
    playerLinks: { done: playerLinksDone, total: proPlayers.length },
    kifuTags: { done: kifuTagsDone, total: activeRecords.length },
    kifuReview: { done: kifuReviewDone, total: activeRecords.length },
    pendingTasks,
  };
}

export function pickRandomMaintenanceTasks(
  tasks: MaintenanceTaskItem[],
  count = 3
): MaintenanceTaskItem[] {
  if (tasks.length <= count) return tasks;
  const pool = [...tasks];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  return pool.slice(0, count);
}
