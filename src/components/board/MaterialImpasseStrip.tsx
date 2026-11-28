/**
 * Compact Material Balance (駒割) & Impasse Points (持将棋点数) Strip (Issue #20).
 * Displays net material difference with surplus piece chips and impasse totals,
 * plus an expandable JSA 27-point declaration law checklist for Sente & Gote.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Shogi } from 'shogi.js';
import {
  computeMaterialAndImpasse,
  ImpasseDeclarationCheck,
} from '../../utils/materialBalance';

export interface MaterialImpasseStripProps {
  shogi: Shogi;
  className?: string;
}

function DeclarationChecklistCard({
  sideSymbol,
  sideLabel,
  accentClass,
  check,
}: {
  sideSymbol: '▲' | '△';
  sideLabel: string;
  accentClass: string;
  check: ImpasseDeclarationCheck;
}) {
  const { t } = useTranslation();

  const items = [
    {
      ok: check.kingEntered,
      label: t('material_impasse.cond_king_entered'),
    },
    {
      ok: check.piecesOk,
      label: t('material_impasse.cond_pieces', { count: check.enemyTerritoryPieceCount }),
    },
    {
      ok: check.notInCheck,
      label: t('material_impasse.cond_not_in_check'),
    },
    {
      ok: check.pointsOk,
      label: t('material_impasse.cond_points', {
        points: check.totalPoints,
        threshold: check.pointsThreshold,
      }),
    },
  ];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/80 px-2.5 py-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className={`font-bold text-[11px] ${accentClass}`}>
          {sideSymbol} {sideLabel} ({check.totalPoints}/{check.pointsThreshold}
          {t('material_impasse.pt_unit')})
        </span>
        {check.canDeclareWin && (
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-[10px] font-bold">
            {t('material_impasse.declare_ready')}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
        {items.map((item, idx) => (
          <div
            key={idx}
            className={`flex items-center gap-1 ${
              item.ok ? 'text-emerald-300' : 'text-slate-400'
            }`}
          >
            <span>{item.ok ? '✓' : '·'}</span>
            <span className="truncate">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const MaterialImpasseStrip: React.FC<MaterialImpasseStripProps> = ({
  shogi,
  className = '',
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const summary = computeMaterialAndImpasse(shogi);

  const senteGainPieces = summary.pieceDiffs.filter((d) => d.diff > 0);
  const goteGainPieces = summary.pieceDiffs.filter((d) => d.diff < 0);

  const diffBadgeClass =
    summary.diff > 0
      ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
      : summary.diff < 0
        ? 'bg-sky-500/15 border-sky-400/40 text-sky-300'
        : 'bg-slate-800/80 border-slate-700 text-slate-300';

  const diffText =
    summary.diff > 0
      ? `▲ +${summary.diff}`
      : summary.diff < 0
        ? `△ +${Math.abs(summary.diff)}`
        : '±0';

  const renderPieceChip = (baseKind: string, count: number) => {
    const absCount = Math.abs(count);
    const label = t(`material_impasse.piece_${baseKind}`);
    return absCount > 1 ? `${label}×${absCount}` : label;
  };

  return (
    <div
      className={`rounded-lg border border-slate-800/90 bg-slate-900/90 text-[11px] text-slate-200 ${className}`}
    >
      <div className="flex items-center justify-between gap-2 px-2.5 py-1 flex-wrap">
        {/* Left: Material balance */}
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="text-[10px] font-semibold text-slate-400 whitespace-nowrap">
            {t('material_impasse.material_label')}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded border font-mono font-bold text-[10px] whitespace-nowrap ${diffBadgeClass}`}
          >
            {diffText}
          </span>
          {senteGainPieces.length > 0 && (
            <span className="text-[10px] text-amber-300 truncate">
              ▲{senteGainPieces.map((p) => renderPieceChip(p.baseKind, p.diff)).join(' ')}
            </span>
          )}
          {goteGainPieces.length > 0 && (
            <span className="text-[10px] text-sky-300 truncate">
              △{goteGainPieces.map((p) => renderPieceChip(p.baseKind, p.diff)).join(' ')}
            </span>
          )}
          {senteGainPieces.length === 0 && goteGainPieces.length === 0 && (
            <span className="text-[10px] text-slate-500 whitespace-nowrap">
              {t('material_impasse.even_material')}
            </span>
          )}
        </div>

        {/* Right: Impasse points + expandable checklist toggle */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          title={t('material_impasse.toggle_checklist')}
          className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-slate-800/80 transition text-[10px] whitespace-nowrap ml-auto"
        >
          <span className="text-slate-400 font-semibold">
            {t('material_impasse.impasse_label')}
          </span>
          <span
            className={`font-mono font-bold ${
              summary.senteDeclaration.canDeclareWin
                ? 'text-emerald-300'
                : 'text-amber-300'
            }`}
          >
            ▲{summary.senteDeclaration.totalPoints}/28
          </span>
          <span className="text-slate-600">·</span>
          <span
            className={`font-mono font-bold ${
              summary.goteDeclaration.canDeclareWin
                ? 'text-emerald-300'
                : 'text-sky-300'
            }`}
          >
            △{summary.goteDeclaration.totalPoints}/27
          </span>
          {(summary.senteDeclaration.canDeclareWin ||
            summary.goteDeclaration.canDeclareWin) && (
            <span className="px-1 py-0.2 rounded bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 font-bold">
              {t('material_impasse.declare_badge')}
            </span>
          )}
          <span className="text-slate-400 text-[9px]">{expanded ? '▲' : '▼'}</span>
        </button>
      </div>

      {expanded && (
        <div className="px-2.5 pb-2 pt-1 border-t border-slate-800/80 space-y-1.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <DeclarationChecklistCard
              sideSymbol="▲"
              sideLabel={t('material_impasse.sente')}
              accentClass="text-amber-300"
              check={summary.senteDeclaration}
            />
            <DeclarationChecklistCard
              sideSymbol="△"
              sideLabel={t('material_impasse.gote')}
              accentClass="text-sky-300"
              check={summary.goteDeclaration}
            />
          </div>
          {summary.isImpasseDrawReady && (
            <div className="text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-2 py-1">
              {t('material_impasse.draw_24_notice')}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
