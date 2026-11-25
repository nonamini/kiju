/**
 * Compact Tactics Index Card Component.
 * Matches the user's design image:
 * - High-contrast title in amber/gold
 * - Tag badge (居飛車, 振り飛車, etc.) and Custom badge
 * - Clean summary text
 * - Pros in emerald ("長所：...")
 * - Cons in rose ("弱点：...")
 * - Minimal thumbnail preview or move counter
 * - Entire card clickable to open detail view (/tactics/:id)
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TacticsNoteItem } from '../../types/tacticsNote';

export interface TacticsIndexCardProps {
  item: TacticsNoteItem;
  onEdit?: (item: TacticsNoteItem) => void;
  onDelete?: (item: TacticsNoteItem) => void;
  className?: string;
}

export const TacticsIndexCard: React.FC<TacticsIndexCardProps> = ({
  item,
  onEdit,
  onDelete,
  className = '',
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleCardClick = () => {
    navigate(`/tactics/${item.id}`);
  };

  return (
    <div
      onClick={handleCardClick}
      className={`group p-4 rounded-xl bg-slate-900/95 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-900 shadow-md cursor-pointer transition-all duration-200 flex flex-col justify-between gap-3 ${className}`}
    >
      <div className="flex flex-col gap-2">
        {/* Header: Title and Badges */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-amber-300 group-hover:text-amber-200 transition-colors">
            {item.title}
          </h3>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-semibold">
              {item.tag}
            </span>
            {(() => {
              const moveCount = item.jkfJson
                ? (() => {
                    try {
                      const p = JSON.parse(item.jkfJson);
                      return Array.isArray(p.moves) ? Math.max(0, p.moves.length - 1) : 0;
                    } catch {
                      return 0;
                    }
                  })()
                : (item.moves?.length ?? 0);
              return moveCount > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-bold">
                  {moveCount}手
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[9px]">
                  未入力
                </span>
              );
            })()}
          </div>
        </div>

        {/* Summary */}
        <p className="text-xs text-sky-200/90 leading-relaxed line-clamp-2">
          {item.summary}
        </p>

        {/* Pros & Cons */}
        <div className="flex flex-col gap-1 text-xs mt-1">
          {item.pros && (
            <div className="flex items-baseline gap-1 text-emerald-400">
              <span className="font-bold shrink-0">{t('tactics.pros', '長所')}：</span>
              <span className="line-clamp-1">{item.pros}</span>
            </div>
          )}
          {item.cons && (
            <div className="flex items-baseline gap-1 text-rose-300">
              <span className="font-bold shrink-0">{t('tactics.cons', '弱点')}：</span>
              <span className="line-clamp-1">{item.cons}</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer Info & Quick Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          {(() => {
            const moveCount = item.jkfJson
              ? (() => {
                  try {
                    const p = JSON.parse(item.jkfJson);
                    return Array.isArray(p.moves) ? Math.max(0, p.moves.length - 1) : 0;
                  } catch {
                    return 0;
                  }
                })()
              : (item.moves?.length ?? 0);
            return moveCount > 0 ? (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <span>♟️</span>{' '}
                {t('tactics.moves_recorded_count', '{{count}} 手収録', { count: moveCount })}
              </span>
            ) : (
              <span className="text-slate-500">
                {t('tactics.moves_not_registered', '手順未登録 (0手)')}
              </span>
            );
          })()}
          {item.moveComments && item.moveComments.length > 0 && (
            <span className="text-slate-400">💬 {item.moveComments.length}</span>
          )}
        </div>

        <div
          className="flex items-center gap-1.5"
          onClick={(e) => e.stopPropagation()} // Prevent card navigation when clicking specific action buttons
        >
          {onEdit && (
            <button
              onClick={() => onEdit(item)}
              className="p-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title={t('common.edit', '編集')}
            >
              ✏️
            </button>
          )}
          {onDelete && item.isCustom && (
            <button
              onClick={() => onDelete(item)}
              className="p-1 px-2 rounded bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 transition-colors"
              title={t('common.delete', '削除')}
            >
              🗑️
            </button>
          )}
          <span className="text-amber-400 font-bold ml-1 text-xs group-hover:translate-x-0.5 transition-transform">
            {t('tactics.detail_arrow', '詳細 →')}
          </span>
        </div>
      </div>
    </div>
  );
};
