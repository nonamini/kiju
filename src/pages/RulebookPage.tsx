/**
 * Shogi Rulebook Page (/rulebook).
 * Focuses purely on basic rules and piece movements:
 * 1. Piece Movements (rendered via unified partial FreeBoardDiagramView).
 * 2. Basic Rules & Fouls (Promotion, Nifu, Uchifuzume, Repetition, Impasse).
 * 3. Customizable Tesuji & Board Diagrams (FreeBoardDiagram 1..9 x 1..9 editor & viewer).
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSmartBack } from '../hooks/useSmartBack';
import {
  DIAGRAM_PIECE_LABELS,
  FreeBoardDiagramView,
} from '../components/diagram/FreeBoardDiagramView';
import { FreeBoardDiagramEditorModal } from '../components/diagram/FreeBoardDiagramEditorModal';
import type {
  DiagramHighlight,
  DiagramMarker,
  DiagramPiece,
  DiagramPieceKind,
  FreeBoardDiagram,
} from '../types/freeBoardDiagram';
import { clampDiagramDimension } from '../utils/freeBoardDiagramStorage';
import { getSafeStorage } from '../utils/matchHistoryStorage';

type RulebookTab = 'pieces' | 'rules' | 'illustrations';

interface PieceGuideSpec {
  id: string;
  nameKey: string;
  descKey: string;
  kind: DiagramPieceKind;
  promotedKind?: DiagramPieceKind;
  promotedNameKey?: string;
  grid: readonly string[];
  promotedGrid?: readonly string[];
}

interface LegacyCustomIllustration {
  id?: unknown;
  title?: unknown;
  desc?: unknown;
  rows?: unknown;
}

const STATIC_DIAGRAM_TIMESTAMP = '2026-01-01T00:00:00.000Z';

/**
 * Converts a 5x5 character movement template into a FreeBoardDiagram.
 * Cells: '1' / 'N' = 1-step or jump highlight + circle marker; '*' = slide highlight + star marker.
 */
function buildPieceMovementDiagram(
  id: string,
  kind: DiagramPieceKind,
  grid: readonly string[]
): FreeBoardDiagram {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 5;
  const centerCol = Math.floor(cols / 2);
  const centerRow = Math.floor(rows / 2);

  const pieces: DiagramPiece[] = [
    { col: centerCol, row: centerRow, owner: 'b', kind },
  ];
  const highlights: DiagramHighlight[] = [];
  const markers: DiagramMarker[] = [];

  grid.forEach((rowStr, rIdx) => {
    Array.from(rowStr).forEach((cell, cIdx) => {
      if (cIdx === centerCol && rIdx === centerRow) return;
      if (cell === '1' || cell === 'N') {
        highlights.push({ col: cIdx, row: rIdx, color: 'emerald' });
        markers.push({ col: cIdx, row: rIdx, symbol: '○', color: 'emerald' });
      } else if (cell === '*') {
        highlights.push({ col: cIdx, row: rIdx, color: 'emerald' });
        markers.push({ col: cIdx, row: rIdx, symbol: '★', color: 'emerald' });
      }
    });
  });

  return {
    id,
    title: id,
    cols,
    rows,
    showCoords: false,
    pieces,
    highlights,
    markers,
    arrows: [],
    tags: [],
    createdAt: STATIC_DIAGRAM_TIMESTAMP,
    updatedAt: STATIC_DIAGRAM_TIMESTAMP,
  };
}

const PIECE_GUIDE_SPECS: readonly PieceGuideSpec[] = [
  {
    id: 'king',
    nameKey: 'rulebook.piece_king_name',
    descKey: 'rulebook.piece_king_desc',
    kind: 'K',
    grid: ['.....', '.111.', '.1K1.', '.111.', '.....'],
  },
  {
    id: 'rook',
    nameKey: 'rulebook.piece_rook_name',
    descKey: 'rulebook.piece_rook_desc',
    kind: 'R',
    promotedKind: '+R',
    promotedNameKey: 'rulebook.piece_promoted_rook',
    grid: ['..*..', '..*..', '**R**', '..*..', '..*..'],
    promotedGrid: ['..*..', '.1*1.', '**R**', '.1*1.', '..*..'],
  },
  {
    id: 'bishop',
    nameKey: 'rulebook.piece_bishop_name',
    descKey: 'rulebook.piece_bishop_desc',
    kind: 'B',
    promotedKind: '+B',
    promotedNameKey: 'rulebook.piece_promoted_bishop',
    grid: ['*...*', '.*.*.', '..B..', '.*.*.', '*...*'],
    promotedGrid: ['*...*', '.*1*.', '.1B1.', '.*1*.', '*...*'],
  },
  {
    id: 'gold',
    nameKey: 'rulebook.piece_gold_name',
    descKey: 'rulebook.piece_gold_desc',
    kind: 'G',
    grid: ['.....', '.111.', '.1G1.', '..1..', '.....'],
  },
  {
    id: 'silver',
    nameKey: 'rulebook.piece_silver_name',
    descKey: 'rulebook.piece_silver_desc',
    kind: 'S',
    promotedKind: '+S',
    promotedNameKey: 'rulebook.piece_promoted_silver',
    grid: ['.....', '.111.', '..S..', '.1.1.', '.....'],
    promotedGrid: ['.....', '.111.', '.1G1.', '..1..', '.....'],
  },
  {
    id: 'knight',
    nameKey: 'rulebook.piece_knight_name',
    descKey: 'rulebook.piece_knight_desc',
    kind: 'N',
    promotedKind: '+N',
    promotedNameKey: 'rulebook.piece_promoted_knight',
    grid: ['.N.N.', '.....', '..N..', '.....', '.....'],
    promotedGrid: ['.....', '.111.', '.1G1.', '..1..', '.....'],
  },
  {
    id: 'lance',
    nameKey: 'rulebook.piece_lance_name',
    descKey: 'rulebook.piece_lance_desc',
    kind: 'L',
    promotedKind: '+L',
    promotedNameKey: 'rulebook.piece_promoted_lance',
    grid: ['..*..', '..*..', '..L..', '.....', '.....'],
    promotedGrid: ['.....', '.111.', '.1G1.', '..1..', '.....'],
  },
  {
    id: 'pawn',
    nameKey: 'rulebook.piece_pawn_name',
    descKey: 'rulebook.piece_pawn_desc',
    kind: 'P',
    promotedKind: '+P',
    promotedNameKey: 'rulebook.piece_promoted_pawn',
    grid: ['.....', '..1..', '..P..', '.....', '.....'],
    promotedGrid: ['.....', '.111.', '.1G1.', '..1..', '.....'],
  },
];

const RULEBOOK_STORAGE_KEY = 'joseki_tree_custom_rulebook_illustrations';

const LABEL_TO_DIAGRAM_KIND: ReadonlyMap<string, DiagramPieceKind> = (() => {
  const map = new Map<string, DiagramPieceKind>();
  (
    Object.entries(DIAGRAM_PIECE_LABELS) as Array<
      [DiagramPieceKind, { label: string; promoted: boolean }]
    >
  ).forEach(([kind, meta]) => {
    map.set(meta.label, kind);
  });
  // Legacy kanji aliases
  map.set('\u738b', 'K');
  map.set('\u7adc', '+R');
  return map;
})();

function isModernDiagram(raw: unknown): raw is FreeBoardDiagram {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const obj = raw as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.title === 'string' &&
    typeof obj.cols === 'number' &&
    typeof obj.rows === 'number' &&
    Array.isArray(obj.pieces)
  );
}

/**
 * Migrates legacy 5x5 kanji-grid rulebook illustrations into FreeBoardDiagram objects
 * while passing through already-upgraded FreeBoardDiagram entries unchanged.
 */
function migrateLegacyRulebookIllustrations(raw: unknown): FreeBoardDiagram[] {
  if (!Array.isArray(raw)) return [];
  const nowIso = new Date().toISOString();
  const result: FreeBoardDiagram[] = [];

  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (isModernDiagram(entry)) {
      result.push({
        ...entry,
        cols: clampDiagramDimension(entry.cols),
        rows: clampDiagramDimension(entry.rows),
        highlights: Array.isArray(entry.highlights) ? entry.highlights : [],
        markers: Array.isArray(entry.markers) ? entry.markers : [],
        arrows: Array.isArray(entry.arrows) ? entry.arrows : [],
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : nowIso,
        updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : nowIso,
      });
      continue;
    }

    if (!entry || typeof entry !== 'object') continue;
    const legacy = entry as LegacyCustomIllustration;
    if (typeof legacy.title !== 'string' || !Array.isArray(legacy.rows)) continue;

    const gridRows = legacy.rows;
    const rowCount = clampDiagramDimension(gridRows.length || 5);
    const firstRowLen = Array.isArray(gridRows[0]) ? gridRows[0].length : 5;
    const colCount = clampDiagramDimension(firstRowLen || 5);
    const pieces: DiagramPiece[] = [];

    gridRows.forEach((rowVal, rIdx) => {
      if (!Array.isArray(rowVal) || rIdx >= rowCount) return;
      rowVal.forEach((cellVal, cIdx) => {
        if (typeof cellVal !== 'string' || cIdx >= colCount) return;
        const trimmed = cellVal.trim();
        if (!trimmed) return;
        const kind = LABEL_TO_DIAGRAM_KIND.get(trimmed);
        if (!kind) return;
        pieces.push({
          col: cIdx,
          row: rIdx,
          owner: kind === 'K' ? 'w' : 'b',
          kind,
        });
      });
    });

    result.push({
      id: typeof legacy.id === 'string' && legacy.id ? legacy.id : `ill_migrated_${i}`,
      title: legacy.title,
      description: typeof legacy.desc === 'string' && legacy.desc ? legacy.desc : undefined,
      cols: colCount,
      rows: rowCount,
      showCoords: false,
      pieces,
      highlights: [],
      markers: [],
      arrows: [],
      tags: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  return result;
}

function createDefaultRulebookDiagrams(
  t: (key: string) => string
): FreeBoardDiagram[] {
  const nowIso = new Date().toISOString();
  return [
    {
      id: 'fundoshi_no_kei',
      title: t('rulebook.default_fundoshi_title'),
      description: t('rulebook.default_fundoshi_desc'),
      cols: 5,
      rows: 5,
      showCoords: false,
      pieces: [
        { col: 1, row: 0, owner: 'w', kind: 'R' },
        { col: 3, row: 0, owner: 'w', kind: 'G' },
        { col: 2, row: 2, owner: 'b', kind: 'N' },
      ],
      highlights: [
        { col: 1, row: 0, color: 'amber' },
        { col: 3, row: 0, color: 'amber' },
      ],
      markers: [],
      arrows: [
        { fromCol: 2, fromRow: 2, toCol: 1, toRow: 0, color: 'amber' },
        { fromCol: 2, fromRow: 2, toCol: 3, toRow: 0, color: 'amber' },
      ],
      tags: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'atama_kin',
      title: t('rulebook.default_atama_title'),
      description: t('rulebook.default_atama_desc'),
      cols: 5,
      rows: 5,
      showCoords: false,
      pieces: [
        { col: 2, row: 0, owner: 'w', kind: 'K' },
        { col: 2, row: 1, owner: 'b', kind: 'G' },
      ],
      highlights: [{ col: 2, row: 0, color: 'rose' }],
      markers: [],
      arrows: [],
      tags: [],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];
}

export const RulebookPage: React.FC = () => {
  const handleGoBack = useSmartBack('/');
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<RulebookTab>('pieces');

  const pieceGuides = useMemo(
    () =>
      PIECE_GUIDE_SPECS.map((spec) => ({
        ...spec,
        diagram: buildPieceMovementDiagram(
          `rulebook_piece_${spec.id}`,
          spec.kind,
          spec.grid
        ),
        promotedDiagram:
          spec.promotedKind && spec.promotedGrid
            ? buildPieceMovementDiagram(
                `rulebook_piece_${spec.id}_promoted`,
                spec.promotedKind,
                spec.promotedGrid
              )
            : undefined,
      })),
    []
  );

  const [illustrations, setIllustrations] = useState<FreeBoardDiagram[]>(() => {
    try {
      const raw = getSafeStorage().getItem(RULEBOOK_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        const migrated = migrateLegacyRulebookIllustrations(parsed);
        if (migrated.length > 0) return migrated;
      }
    } catch {
      // Ignore corrupt storage
    }
    return createDefaultRulebookDiagrams(t);
  });

  const [editingDiagram, setEditingDiagram] = useState<FreeBoardDiagram | null>(
    null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSaveIllustration = (saved: FreeBoardDiagram) => {
    const existsIdx = illustrations.findIndex((i) => i.id === saved.id);
    const next =
      existsIdx >= 0
        ? illustrations.map((it, idx) => (idx === existsIdx ? saved : it))
        : [saved, ...illustrations];
    setIllustrations(next);
    getSafeStorage().setItem(RULEBOOK_STORAGE_KEY, JSON.stringify(next));
  };

  const handleDeleteIllustration = (id: string) => {
    const next = illustrations.filter((i) => i.id !== id);
    setIllustrations(next);
    getSafeStorage().setItem(RULEBOOK_STORAGE_KEY, JSON.stringify(next));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-12">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-slate-950/85 backdrop-blur border-b border-slate-800 px-4 sm:px-6 py-3">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleGoBack}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition text-xs flex items-center gap-1"
              >
                ← <span>{t('common.back')}</span>
              </button>
              <Link
                to="/"
                title={t('common.home')}
                aria-label={t('common.home')}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition text-xs"
              >
                🏠
              </Link>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-amber-300">
                {t('rulebook.page_title', '将棋基本ルールブック')}
              </h1>
              <p className="text-[11px] text-slate-400">
                {t('rulebook.page_subtitle', '駒の動かし方・反則ルール・手筋イメージ図')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/tactics"
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold transition flex items-center gap-1 shadow-sm"
            >
              📖 {t('rulebook.open_tactics_notebook_btn', '研究ノート（定跡コレクション）を開く')}
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 gap-1 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('pieces')}
            className={`px-4 py-2 rounded-t-lg font-semibold transition whitespace-nowrap ${
              activeTab === 'pieces'
                ? 'bg-slate-900 text-amber-300 border-t-2 border-amber-400 border-x border-slate-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ♟️ {t('rulebook.tab_pieces')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            className={`px-4 py-2 rounded-t-lg font-semibold transition whitespace-nowrap ${
              activeTab === 'rules'
                ? 'bg-slate-900 text-amber-300 border-t-2 border-amber-400 border-x border-slate-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚖️ {t('rulebook.tab_rules')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('illustrations')}
            className={`px-4 py-2 rounded-t-lg font-semibold transition whitespace-nowrap ${
              activeTab === 'illustrations'
                ? 'bg-slate-900 text-amber-300 border-t-2 border-amber-400 border-x border-slate-800'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🎨 {t('rulebook.tab_illustrations')} ({illustrations.length})
          </button>
        </div>

        {/* Tab 1: Piece Movements via FreeBoardDiagramView */}
        {activeTab === 'pieces' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pieceGuides.map((p) => {
              const frontKanji = DIAGRAM_PIECE_LABELS[p.kind].label;
              return (
                <div
                  key={p.id}
                  className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-amber-300">
                      {t(p.nameKey)}
                    </h2>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {t('rulebook.movement_legend_partial')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {t(p.descKey)}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <div className="space-y-1 text-center">
                      <FreeBoardDiagramView diagram={p.diagram} cellSizePx={30} />
                      <div className="text-[10px] text-slate-400">
                        {t('rulebook.piece_front_side', {
                          kanji: frontKanji,
                          defaultValue: `表（${frontKanji}）`,
                        })}
                      </div>
                    </div>
                    {p.promotedDiagram && p.promotedNameKey && (
                      <>
                        <span className="text-slate-500 text-sm">→</span>
                        <div className="space-y-1 text-center">
                          <FreeBoardDiagramView
                            diagram={p.promotedDiagram}
                            cellSizePx={30}
                          />
                          <div className="text-[10px] text-amber-300">
                            {t('rulebook.piece_promoted_side', {
                              name: t(p.promotedNameKey),
                              defaultValue: `成り（${t(p.promotedNameKey)}）`,
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 2: Basic Rules & Fouls */}
        {activeTab === 'rules' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
              <h2 className="text-sm font-bold text-amber-300">
                {t('rulebook.rules_sec1_title', '1. 成り（プロモーション）のルール')}
              </h2>
              <p className="text-slate-300 leading-relaxed">
                {t(
                  'rulebook.rules_sec1_desc',
                  '敵陣（相手側から数えて1〜3段目）に入る・敵陣内で動く・敵陣から出るときに駒を成ることができます。なお、歩・香が1段目、桂が1〜2段目に進む場合は必ず成らなければなりません。'
                )}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
              <h2 className="text-sm font-bold text-amber-300">
                {t('rulebook.rules_sec2_title', '2. 主な反則（即負け）')}
              </h2>
              <ul className="list-disc list-inside space-y-1 text-slate-300 leading-relaxed">
                <li>
                  <strong>{t('rulebook.foul_nifu_title', '二歩（にふ）')}</strong>：
                  {t('rulebook.foul_nifu_desc', '同じ筋（縦列）に自分の「歩」を2枚以上置くこと（「と金」は歩ではないのでOK）。')}
                </li>
                <li>
                  <strong>{t('rulebook.foul_uchifuzume_title', '打ち歩詰め（うちふづめ）')}</strong>：
                  {t('rulebook.foul_uchifuzume_desc', '持ち駒の「歩」を打って即座に相手玉を詰ますこと（盤上の歩を突いて詰ますのはOK）。')}
                </li>
                <li>
                  <strong>{t('rulebook.foul_no_moves_piece_title', '行き所のない駒')}</strong>：
                  {t('rulebook.foul_no_moves_piece_desc', 'それ以上進めない段に歩・香・桂を打つ／不成で進むこと。')}
                </li>
                <li>
                  <strong>{t('rulebook.foul_ignoring_check_title', '王手放置')}</strong>：
                  {t('rulebook.foul_ignoring_check_desc', '自玉に王手がかかっているのに、それを防がない手を指すこと。')}
                </li>
              </ul>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
              <h2 className="text-sm font-bold text-amber-300">
                {t('rulebook.rules_sec3_title', '3. 千日手・持将棋')}
              </h2>
              <ul className="list-disc list-inside space-y-1 text-slate-300 leading-relaxed">
                <li>
                  <strong>{t('rulebook.sanyata_heading')}</strong>：
                  {t('rulebook.rules_sanyata_desc', '手番・持ち駒を含めまったく同じ局面が4回出現すると引き分け（指し直し）。ただし連続王手の千日手は王手をかけている側の反則負けになります。')}
                </li>
                <li>
                  <strong>{t('rulebook.rules_impasse_title', '持将棋（相入玉）')}</strong>：
                  {t('rulebook.rules_impasse_desc', 'お互いに玉が敵陣に入り詰みが見込めない場合、大駒（飛・角）5点・小駒（金銀桂香歩）1点で点数を数えます（24点法・27点法）。')}
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Tab 3: Custom Partial Board Diagrams */}
        {activeTab === 'illustrations' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-400">
                {t('rulebook.illustrations_subtitle')}
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingDiagram(null);
                  setIsModalOpen(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-bold transition flex items-center gap-1 shadow-sm"
              >
                + {t('rulebook.add_diagram_btn')}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {illustrations.map((ill) => (
                <div
                  key={ill.id}
                  className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-amber-300">
                        {ill.title}
                      </h3>
                      <span className="text-[10px] font-mono text-slate-500 shrink-0">
                        {ill.cols}×{ill.rows}
                      </span>
                    </div>
                    {ill.description && (
                      <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {ill.description}
                      </p>
                    )}

                    <div className="flex justify-center pt-2 overflow-x-auto">
                      <FreeBoardDiagramView
                        diagram={ill}
                        cellSizePx={ill.cols > 6 || ill.rows > 6 ? 26 : 36}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDiagram(ill);
                        setIsModalOpen(true);
                      }}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                    >
                      {t('rulebook.btn_edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteIllustration(ill.id)}
                      className="px-2 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 text-xs transition"
                    >
                      {t('rulebook.btn_delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Arbitrary-Size Partial Board Diagram Editor Modal */}
      <FreeBoardDiagramEditorModal
        isOpen={isModalOpen}
        initialDiagram={editingDiagram}
        persistToLibrary={false}
        onClose={() => {
          setIsModalOpen(false);
          setEditingDiagram(null);
        }}
        onSaved={handleSaveIllustration}
      />
    </div>
  );
};

export default RulebookPage;
