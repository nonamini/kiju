/**
 * Multi-Topic In-App User Guide (/guide and /guide/:topic).
 * Provides a clean purpose-driven hub plus 10 focused per-topic sub-pages
 * wired directly to every screen's contextual ? help button with 1-click return.
 * Responsive layout: compact pill nav on mobile, spacious sticky sidebar + readable typography on desktop.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../contexts/SettingsContext';
import { useSmartBack } from '../hooks/useSmartBack';

export type GuideTopicId =
  | 'quickstart'
  | 'tree'
  | 'study'
  | 'import'
  | 'library'
  | 'tactics'
  | 'training'
  | 'customize'
  | 'sync'
  | 'faq';

interface GuideTopicMeta {
  id: GuideTopicId;
  icon: string;
  accentClass: string;
}

interface GuideCardSpec {
  id: string;
  icon: string;
  titleColorClass: string;
  borderClass?: string;
  titleKey: string;
  bodyKey: string;
  ctaKey?: string;
  route?: string;
}

const GUIDE_TOPICS: readonly GuideTopicMeta[] = [
  {
    id: 'quickstart',
    icon: '🚀',
    accentClass: 'border-amber-500/40 bg-amber-950/20 text-amber-300',
  },
  {
    id: 'tree',
    icon: '🌳',
    accentClass: 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300',
  },
  {
    id: 'study',
    icon: '♟️',
    accentClass: 'border-sky-500/40 bg-sky-950/20 text-sky-300',
  },
  {
    id: 'import',
    icon: '📥',
    accentClass: 'border-amber-500/40 bg-slate-900/70 text-amber-300',
  },
  {
    id: 'library',
    icon: '📚',
    accentClass: 'border-indigo-500/40 bg-indigo-950/20 text-indigo-300',
  },
  {
    id: 'tactics',
    icon: '📘',
    accentClass: 'border-cyan-500/40 bg-cyan-950/20 text-cyan-300',
  },
  {
    id: 'training',
    icon: '⚔️',
    accentClass: 'border-rose-500/40 bg-rose-950/20 text-rose-300',
  },
  {
    id: 'customize',
    icon: '🎨',
    accentClass: 'border-purple-500/40 bg-purple-950/20 text-purple-300',
  },
  {
    id: 'sync',
    icon: '🔄',
    accentClass: 'border-teal-500/40 bg-teal-950/20 text-teal-300',
  },
  {
    id: 'faq',
    icon: '💬',
    accentClass: 'border-slate-700 bg-slate-900/70 text-slate-200',
  },
];

const TOPIC_CARD_GRIDS: Record<
  'tree' | 'study' | 'import' | 'library' | 'tactics' | 'training',
  readonly GuideCardSpec[]
> = {
  tree: [
    {
      id: 'card1',
      icon: '🎨',
      titleColorClass: 'text-emerald-300',
      titleKey: 'guide.topics.tree.card1_title',
      bodyKey: 'guide.topics.tree.card1_body',
    },
    {
      id: 'card2',
      icon: '🔍',
      titleColorClass: 'text-sky-300',
      titleKey: 'guide.topics.tree.card2_title',
      bodyKey: 'guide.topics.tree.card2_body',
    },
    {
      id: 'card3',
      icon: '♟️',
      titleColorClass: 'text-amber-300',
      titleKey: 'guide.topics.tree.card3_title',
      bodyKey: 'guide.topics.tree.card3_body',
    },
  ],
  study: [
    {
      id: 'card1',
      icon: '🌿',
      titleColorClass: 'text-emerald-300',
      titleKey: 'guide.topics.study.card1_title',
      bodyKey: 'guide.topics.study.card1_body',
      ctaKey: 'guide.topics.study.card1_cta',
      route: '/studio',
    },
    {
      id: 'card2',
      icon: '🤖',
      titleColorClass: 'text-sky-300',
      titleKey: 'guide.topics.study.card2_title',
      bodyKey: 'guide.topics.study.card2_body',
      ctaKey: 'guide.topics.study.card2_cta',
      route: '/studio',
    },
    {
      id: 'card3',
      icon: '✂️',
      titleColorClass: 'text-amber-300',
      titleKey: 'guide.topics.study.card3_title',
      bodyKey: 'guide.topics.study.card3_body',
      ctaKey: 'guide.topics.study.card3_cta',
      route: '/studio?modal=import',
    },
    {
      id: 'card4',
      icon: '🛠️',
      titleColorClass: 'text-purple-300',
      titleKey: 'guide.topics.study.card4_title',
      bodyKey: 'guide.topics.study.card4_body',
      ctaKey: 'guide.topics.study.card4_cta',
      route: '/studio?editPosition=new',
    },
  ],
  import: [
    {
      id: 'card1',
      icon: '📋',
      titleColorClass: 'text-amber-300',
      titleKey: 'guide.topics.import.card1_title',
      bodyKey: 'guide.topics.import.card1_body',
    },
    {
      id: 'card2',
      icon: '📂',
      titleColorClass: 'text-emerald-300',
      titleKey: 'guide.topics.import.card2_title',
      bodyKey: 'guide.topics.import.card2_body',
    },
    {
      id: 'card3',
      icon: '⚡',
      titleColorClass: 'text-sky-300',
      titleKey: 'guide.topics.import.card3_title',
      bodyKey: 'guide.topics.import.card3_body',
    },
    {
      id: 'card4',
      icon: '💾',
      titleColorClass: 'text-purple-300',
      titleKey: 'guide.topics.import.card4_title',
      bodyKey: 'guide.topics.import.card4_body',
    },
  ],
  library: [
    {
      id: 'card1',
      icon: '🗂️',
      titleColorClass: 'text-amber-300',
      titleKey: 'guide.topics.library.card1_title',
      bodyKey: 'guide.topics.library.card1_body',
      ctaKey: 'guide.topics.library.card1_cta',
      route: '/library',
    },
    {
      id: 'card2',
      icon: '🏷️',
      titleColorClass: 'text-emerald-300',
      titleKey: 'guide.topics.library.card2_title',
      bodyKey: 'guide.topics.library.card2_body',
      ctaKey: 'guide.topics.library.card2_cta',
      route: '/library',
    },
    {
      id: 'card3',
      icon: '🗑️',
      titleColorClass: 'text-sky-300',
      titleKey: 'guide.topics.library.card3_title',
      bodyKey: 'guide.topics.library.card3_body',
      ctaKey: 'guide.topics.library.card3_cta',
      route: '/library',
    },
    {
      id: 'card4',
      icon: '🏯',
      titleColorClass: 'text-purple-300',
      titleKey: 'guide.topics.library.card4_title',
      bodyKey: 'guide.topics.library.card4_body',
      ctaKey: 'guide.topics.library.card4_cta',
      route: '/players',
    },
  ],
  tactics: [
    {
      id: 'card1',
      icon: '📘',
      titleColorClass: 'text-amber-300',
      titleKey: 'guide.topics.tactics.card1_title',
      bodyKey: 'guide.topics.tactics.card1_body',
      ctaKey: 'guide.topics.tactics.card1_cta',
      route: '/tactics',
    },
    {
      id: 'card2',
      icon: '🪟',
      titleColorClass: 'text-emerald-300',
      titleKey: 'guide.topics.tactics.card2_title',
      bodyKey: 'guide.topics.tactics.card2_body',
      ctaKey: 'guide.topics.tactics.card2_cta',
      route: '/studio',
    },
    {
      id: 'card3',
      icon: '📖',
      titleColorClass: 'text-sky-300',
      titleKey: 'guide.topics.tactics.card3_title',
      bodyKey: 'guide.topics.tactics.card3_body',
      ctaKey: 'guide.topics.tactics.card3_cta',
      route: '/tactics',
    },
    {
      id: 'card4',
      icon: '🌐',
      titleColorClass: 'text-purple-300',
      titleKey: 'guide.topics.tactics.card4_title',
      bodyKey: 'guide.topics.tactics.card4_body',
      ctaKey: 'guide.topics.tactics.card4_cta',
      route: '/tactics',
    },
  ],
  training: [
    {
      id: 'mode1',
      icon: '⚔️',
      titleColorClass: 'text-sky-300',
      borderClass: 'border-sky-500/30',
      titleKey: 'guide.topics.training.mode1_title',
      bodyKey: 'guide.topics.training.mode1_body',
      ctaKey: 'guide.topics.training.mode1_cta',
      route: '/studio?mode=match',
    },
    {
      id: 'mode2',
      icon: '🧩',
      titleColorClass: 'text-purple-300',
      borderClass: 'border-purple-500/30',
      titleKey: 'guide.topics.training.mode2_title',
      bodyKey: 'guide.topics.training.mode2_body',
      ctaKey: 'guide.topics.training.mode2_cta',
      route: '/studio?mode=quiz',
    },
    {
      id: 'mode3',
      icon: '♟️',
      titleColorClass: 'text-amber-300',
      borderClass: 'border-amber-500/30',
      titleKey: 'guide.topics.training.mode3_title',
      bodyKey: 'guide.topics.training.mode3_body',
      ctaKey: 'guide.topics.training.mode3_cta',
      route: '/studio?mode=tsumego',
    },
    {
      id: 'mode4',
      icon: '👆',
      titleColorClass: 'text-emerald-300',
      borderClass: 'border-emerald-500/30',
      titleKey: 'guide.topics.training.mode4_title',
      bodyKey: 'guide.topics.training.mode4_body',
      ctaKey: 'guide.topics.training.mode4_cta',
      route: '/studio?mode=trace',
    },
  ],
};

interface FaqEntry {
  q: string;
  a: string;
}

function resolveTopicId(raw?: string): GuideTopicId | null {
  if (!raw) return null;
  return GUIDE_TOPICS.some((item) => item.id === raw) ? (raw as GuideTopicId) : null;
}

export const GuidePage: React.FC = () => {
  const { topic } = useParams<{ topic?: string }>();
  const navigate = useNavigate();
  const goBack = useSmartBack('/');
  const { t } = useTranslation();
  const { openSettings } = useSettings();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const activeTopicId = resolveTopicId(topic);
  const activeIndex = activeTopicId
    ? GUIDE_TOPICS.findIndex((item) => item.id === activeTopicId)
    : -1;
  const prevTopic = activeIndex > 0 ? GUIDE_TOPICS[activeIndex - 1] : null;
  const nextTopic =
    activeIndex >= 0 && activeIndex < GUIDE_TOPICS.length - 1
      ? GUIDE_TOPICS[activeIndex + 1]
      : null;

  const faqItemsRaw = t('guide.topics.faq.items', { returnObjects: true }) as unknown;
  const faqItems: FaqEntry[] = Array.isArray(faqItemsRaw)
    ? faqItemsRaw.filter(
        (item): item is FaqEntry =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as FaqEntry).q === 'string' &&
          typeof (item as FaqEntry).a === 'string'
      )
    : [];

  const pieceSpriteUrl = `${import.meta.env.BASE_URL}assets/piece_wood.svg`;
  const boardTemplateUrl = `${import.meta.env.BASE_URL}assets/board.svg`;

  const renderCardGrid = (
    cards: readonly GuideCardSpec[],
    colsClass: string = 'grid-cols-1 md:grid-cols-2'
  ) => (
    <div className={`grid ${colsClass} gap-3.5 lg:gap-5`}>
      {cards.map((card) => (
        <div
          key={card.id}
          className={`rounded-xl border ${card.borderClass ?? 'border-slate-800'} bg-slate-900/80 p-4 sm:p-5 lg:p-6 flex flex-col justify-between gap-3.5 lg:gap-4`}
        >
          <div className="space-y-2 lg:space-y-2.5">
            <h3
              className={`text-sm lg:text-base font-bold flex items-center gap-2 ${card.titleColorClass}`}
            >
              <span>{card.icon}</span>
              <span>{t(card.titleKey)}</span>
            </h3>
            <p className="text-xs sm:text-sm lg:text-[15px] text-slate-300 leading-relaxed lg:leading-7">
              {t(card.bodyKey)}
            </p>
          </div>
          {card.ctaKey && card.route && (
            <button
              type="button"
              onClick={() => navigate(card.route!)}
              className={`self-start px-3.5 py-2 lg:px-4 lg:py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs lg:text-sm font-semibold transition ${card.titleColorClass}`}
            >
              {t(card.ctaKey)} →
            </button>
          )}
        </div>
      ))}
    </div>
  );

  const renderTopicContent = (topicId: GuideTopicId) => {
    switch (topicId) {
      case 'quickstart':
        return (
          <div className="space-y-4 lg:space-y-6">
            <p className="text-xs sm:text-sm lg:text-base text-slate-300 leading-relaxed lg:leading-7">
              {t('guide.topics.quickstart.intro')}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 lg:gap-5">
              <div className="rounded-xl border border-amber-500/30 bg-slate-900/80 p-4 sm:p-5 lg:p-6 flex flex-col justify-between gap-4">
                <div className="space-y-2 lg:space-y-2.5">
                  <div className="text-xl lg:text-2xl">📥</div>
                  <h3 className="text-sm lg:text-base font-bold text-amber-300">
                    {t('guide.topics.quickstart.step1_title')}
                  </h3>
                  <p className="text-xs sm:text-sm lg:text-[15px] text-slate-300 leading-relaxed lg:leading-7">
                    {t('guide.topics.quickstart.step1_body')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/studio?modal=import')}
                  className="px-3.5 py-2 lg:px-4 lg:py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs lg:text-sm transition"
                >
                  {t('guide.topics.quickstart.step1_cta')} →
                </button>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-slate-900/80 p-4 sm:p-5 lg:p-6 flex flex-col justify-between gap-4">
                <div className="space-y-2 lg:space-y-2.5">
                  <div className="text-xl lg:text-2xl">♟️</div>
                  <h3 className="text-sm lg:text-base font-bold text-emerald-300">
                    {t('guide.topics.quickstart.step2_title')}
                  </h3>
                  <p className="text-xs sm:text-sm lg:text-[15px] text-slate-300 leading-relaxed lg:leading-7">
                    {t('guide.topics.quickstart.step2_body')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/studio')}
                  className="px-3.5 py-2 lg:px-4 lg:py-2.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold text-xs lg:text-sm transition"
                >
                  {t('guide.topics.quickstart.step2_cta')} →
                </button>
              </div>

              <div className="rounded-xl border border-sky-500/30 bg-slate-900/80 p-4 sm:p-5 lg:p-6 flex flex-col justify-between gap-4">
                <div className="space-y-2 lg:space-y-2.5">
                  <div className="text-xl lg:text-2xl">📁</div>
                  <h3 className="text-sm lg:text-base font-bold text-sky-300">
                    {t('guide.topics.quickstart.step3_title')}
                  </h3>
                  <p className="text-xs sm:text-sm lg:text-[15px] text-slate-300 leading-relaxed lg:leading-7">
                    {t('guide.topics.quickstart.step3_body')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/library')}
                  className="px-3.5 py-2 lg:px-4 lg:py-2.5 rounded-lg bg-sky-600/90 hover:bg-sky-500 text-white font-bold text-xs lg:text-sm transition"
                >
                  {t('guide.topics.quickstart.step3_cta')} →
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 lg:p-6 space-y-1.5">
              <h4 className="text-xs sm:text-sm lg:text-base font-bold text-slate-200 flex items-center gap-2">
                <span>🔒</span>
                <span>{t('guide.topics.quickstart.reassurance_title')}</span>
              </h4>
              <p className="text-xs sm:text-sm lg:text-[15px] text-slate-300 leading-relaxed lg:leading-7">
                {t('guide.topics.quickstart.reassurance_body')}
              </p>
            </div>
          </div>
        );

      case 'tree':
        return (
          <div className="space-y-4 lg:space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs sm:text-sm lg:text-base text-slate-300 leading-relaxed lg:leading-7 flex-1">
                {t('guide.topics.tree.intro')}
              </p>
              <button
                type="button"
                onClick={() => navigate('/tree')}
                className="px-4 py-2 lg:px-5 lg:py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs lg:text-sm transition shadow shrink-0"
              >
                🌳 {t('guide.topics.tree.cta_open_tree')} →
              </button>
            </div>
            {renderCardGrid(TOPIC_CARD_GRIDS.tree, 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3')}
          </div>
        );

      case 'import':
        return (
          <div className="space-y-4 lg:space-y-6">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => navigate('/studio?modal=import')}
                className="px-4 py-2 lg:px-5 lg:py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs lg:text-sm transition shadow"
              >
                📥 {t('guide.topics.import.cta_open_import')} →
              </button>
            </div>
            {renderCardGrid(TOPIC_CARD_GRIDS.import)}
          </div>
        );

      case 'study':
        return renderCardGrid(TOPIC_CARD_GRIDS.study);

      case 'library':
        return renderCardGrid(TOPIC_CARD_GRIDS.library);

      case 'tactics':
        return renderCardGrid(TOPIC_CARD_GRIDS.tactics);

      case 'training':
        return (
          <div className="space-y-4 lg:space-y-6">
            <p className="text-xs sm:text-sm lg:text-base text-slate-300 leading-relaxed lg:leading-7">
              {t('guide.topics.training.intro')}
            </p>
            {renderCardGrid(TOPIC_CARD_GRIDS.training)}
          </div>
        );

      case 'customize':
        return (
          <div className="space-y-4 lg:space-y-6">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={openSettings}
                className="px-3.5 py-2 lg:px-4 lg:py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs lg:text-sm transition shadow"
              >
                ⚙️ {t('guide.topics.customize.cta_open_settings')}
              </button>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 lg:p-6 space-y-3">
              <h3 className="text-sm lg:text-base font-bold text-amber-300">
                {t('guide.topics.customize.section1_title')}
              </h3>
              <p className="text-xs sm:text-sm lg:text-[15px] text-slate-300 leading-relaxed lg:leading-7">
                {t('guide.topics.customize.section1_body')}
              </p>

              <div className="pt-2 grid grid-cols-1 xl:grid-cols-2 gap-4 lg:gap-5">
                {/* Piece Sprite Template */}
                <div className="space-y-2.5 flex flex-col">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs lg:text-sm font-semibold text-slate-200">
                      {t('guide.topics.customize.sprite_title')}
                    </p>
                    <a
                      href={pieceSpriteUrl}
                      download="piece_wood.svg"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 text-xs font-semibold transition"
                    >
                      <span>📥</span>
                      <span>{t('guide.topics.customize.sprite_download')}</span>
                    </a>
                  </div>
                  <div className="rounded-xl border border-slate-700/80 bg-amber-50/95 p-3 sm:p-4 shadow-inner flex-1 flex items-center justify-center">
                    <img
                      src={pieceSpriteUrl}
                      alt={t('guide.topics.customize.sprite_title')}
                      className="w-full h-auto block"
                    />
                  </div>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    {t('guide.topics.customize.sprite_hint')}
                  </p>
                </div>

                {/* Board Image Template */}
                <div className="space-y-2.5 flex flex-col">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs lg:text-sm font-semibold text-slate-200">
                      {t('guide.topics.customize.board_title')}
                    </p>
                    <a
                      href={boardTemplateUrl}
                      download="board.svg"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 text-xs font-semibold transition"
                    >
                      <span>📥</span>
                      <span>{t('guide.topics.customize.board_download')}</span>
                    </a>
                  </div>
                  <div className="rounded-xl border border-slate-700/80 bg-slate-950/70 p-3 sm:p-4 shadow-inner flex-1 flex items-center justify-center">
                    <img
                      src={boardTemplateUrl}
                      alt={t('guide.topics.customize.board_title')}
                      className="max-h-60 w-auto mx-auto block rounded shadow"
                    />
                  </div>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    {t('guide.topics.customize.board_hint')}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 lg:gap-5">
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 lg:p-6 space-y-2">
                <h3 className="text-sm lg:text-base font-bold text-sky-300">
                  {t('guide.topics.customize.section2_title')}
                </h3>
                <p className="text-xs sm:text-sm lg:text-[15px] text-slate-300 leading-relaxed lg:leading-7">
                  {t('guide.topics.customize.section2_body')}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 lg:p-6 space-y-2">
                <h3 className="text-sm lg:text-base font-bold text-emerald-300">
                  {t('guide.topics.customize.section3_title')}
                </h3>
                <p className="text-xs sm:text-sm lg:text-[15px] text-slate-300 leading-relaxed lg:leading-7">
                  {t('guide.topics.customize.section3_body')}
                </p>
              </div>
            </div>
          </div>
        );

      case 'sync':
        return (
          <div className="space-y-4 lg:space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs sm:text-sm lg:text-base text-slate-300 leading-relaxed lg:leading-7 flex-1">
                {t('guide.topics.sync.intro')}
              </p>
              <button
                type="button"
                onClick={openSettings}
                className="px-3.5 py-2 lg:px-4 lg:py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs lg:text-sm transition shadow shrink-0"
              >
                ⚙️ {t('guide.topics.sync.cta_open_settings')}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 lg:gap-5">
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 sm:p-5 lg:p-6 space-y-2.5">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] lg:text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  {t('guide.topics.sync.opt1_badge')}
                </span>
                <h3 className="text-sm lg:text-base font-bold text-slate-100">
                  {t('guide.topics.sync.opt1_title')}
                </h3>
                <p className="text-xs sm:text-sm lg:text-[15px] text-slate-300 leading-relaxed lg:leading-7">
                  {t('guide.topics.sync.opt1_body')}
                </p>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-slate-900/80 p-4 sm:p-5 lg:p-6 space-y-2.5">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] lg:text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {t('guide.topics.sync.opt2_badge')}
                </span>
                <h3 className="text-sm lg:text-base font-bold text-slate-100">
                  {t('guide.topics.sync.opt2_title')}
                </h3>
                <p className="text-xs sm:text-sm lg:text-[15px] text-slate-300 leading-relaxed lg:leading-7">
                  {t('guide.topics.sync.opt2_body')}
                </p>
              </div>

              <div className="rounded-xl border border-sky-500/30 bg-slate-900/80 p-4 sm:p-5 lg:p-6 space-y-2.5">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] lg:text-xs font-bold bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  {t('guide.topics.sync.opt3_badge')}
                </span>
                <h3 className="text-sm lg:text-base font-bold text-slate-100">
                  {t('guide.topics.sync.opt3_title')}
                </h3>
                <p className="text-xs sm:text-sm lg:text-[15px] text-slate-300 leading-relaxed lg:leading-7">
                  {t('guide.topics.sync.opt3_body')}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-violet-500/30 bg-slate-900/80 p-4 sm:p-5 lg:p-6 space-y-4">
              <div className="space-y-1.5">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] lg:text-xs font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30">
                  {t('guide.topics.sync.cloud_adv_badge')}
                </span>
                <h3 className="text-sm lg:text-base font-bold text-slate-100">
                  {t('guide.topics.sync.cloud_adv_title')}
                </h3>
                <p className="text-xs sm:text-sm lg:text-[15px] text-slate-300 leading-relaxed lg:leading-7">
                  {t('guide.topics.sync.cloud_adv_desc')}
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs sm:text-sm">
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5 space-y-2.5">
                  <p className="font-bold text-amber-300">
                    {t('guide.topics.sync.cloud_adv_secrets_title')}
                  </p>
                  <div className="space-y-1">
                    <code className="inline-block px-1.5 py-0.5 rounded bg-slate-800 text-amber-200 font-mono text-[11px]">
                      FIREBASE_SERVICE_ACCOUNT_KEY
                    </code>
                    <p className="text-slate-300 leading-relaxed">
                      {t('guide.topics.sync.cloud_adv_secret_firebase')}
                    </p>
                  </div>

                  <p className="font-bold text-emerald-300 pt-1">
                    {t('guide.topics.sync.cloud_adv_eval_title')}
                  </p>
                  <ul className="space-y-2">
                    <li>
                      <code className="inline-block px-1.5 py-0.5 rounded bg-slate-800 text-sky-200 font-mono text-[11px]">
                        USI_EVAL_URL
                      </code>
                      <p className="text-slate-300 mt-0.5 leading-relaxed">
                        {t('guide.topics.sync.cloud_adv_var_eval_url')}
                      </p>
                    </li>
                    <li>
                      <code className="inline-block px-1.5 py-0.5 rounded bg-slate-800 text-sky-200 font-mono text-[11px]">
                        USI_EVAL_SHA256
                      </code>
                      <p className="text-slate-300 mt-0.5 leading-relaxed">
                        {t('guide.topics.sync.cloud_adv_var_eval_sha')}
                      </p>
                    </li>
                  </ul>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5 space-y-2.5">
                  <p className="font-bold text-sky-300">
                    {t('guide.topics.sync.cloud_adv_vars_title')}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-400">
                    {t('guide.topics.sync.cloud_adv_method_a')}
                  </p>
                  <ul className="space-y-1.5">
                    <li>
                      <code className="inline-block px-1.5 py-0.5 rounded bg-slate-800 text-sky-200 font-mono text-[11px]">
                        USI_ENGINE_BINARY_URL
                      </code>
                      <p className="text-slate-300 mt-0.5 leading-relaxed">
                        {t('guide.topics.sync.cloud_adv_var_binary_url')}
                      </p>
                    </li>
                    <li>
                      <code className="inline-block px-1.5 py-0.5 rounded bg-slate-800 text-sky-200 font-mono text-[11px]">
                        USI_ENGINE_BINARY_SHA256
                      </code>
                      <p className="text-slate-300 mt-0.5 leading-relaxed">
                        {t('guide.topics.sync.cloud_adv_var_binary_sha')}
                      </p>
                    </li>
                  </ul>

                  <p className="text-[11px] font-semibold text-slate-400 pt-1">
                    {t('guide.topics.sync.cloud_adv_method_b')}
                  </p>
                  <ul className="space-y-1.5">
                    <li>
                      <code className="inline-block px-1.5 py-0.5 rounded bg-slate-800 text-sky-200 font-mono text-[11px]">
                        USI_ENGINE_REPO_URL
                      </code>
                      <p className="text-slate-300 mt-0.5 leading-relaxed">
                        {t('guide.topics.sync.cloud_adv_var_repo_url')}
                      </p>
                    </li>
                    <li>
                      <code className="inline-block px-1.5 py-0.5 rounded bg-slate-800 text-sky-200 font-mono text-[11px]">
                        USI_ENGINE_REF
                      </code>
                      <p className="text-slate-300 mt-0.5 leading-relaxed">
                        {t('guide.topics.sync.cloud_adv_var_ref')}
                      </p>
                    </li>
                    <li>
                      <code className="inline-block px-1.5 py-0.5 rounded bg-slate-800 text-sky-200 font-mono text-[11px]">
                        USI_ENGINE_BUILD_CMD
                      </code>
                      <p className="text-slate-300 mt-0.5 leading-relaxed">
                        {t('guide.topics.sync.cloud_adv_var_build_cmd')}
                      </p>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        );

      case 'faq':
        return (
          <div className="space-y-3 lg:space-y-3.5">
            {faqItems.map((item, idx) => {
              const isExpanded = openFaqIndex === idx;
              return (
                <div
                  key={item.q}
                  className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isExpanded ? null : idx)}
                    className="w-full px-4 py-3 lg:px-6 lg:py-4 text-left flex items-center justify-between gap-3 hover:bg-slate-800/60 transition"
                  >
                    <span className="text-xs sm:text-sm lg:text-base font-bold text-slate-100">
                      Q. {item.q}
                    </span>
                    <span className="text-slate-400 text-xs lg:text-sm shrink-0">
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="px-4 pb-3.5 pt-2 lg:px-6 lg:pb-5 lg:pt-3 text-xs sm:text-sm lg:text-[15px] text-slate-300 leading-relaxed lg:leading-7 border-t border-slate-800/70">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-16 md:pb-0">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 sm:px-6 lg:px-10 py-3 lg:py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={goBack}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs lg:text-sm font-semibold transition shrink-0"
            >
              ← {t('guide.back_prev')}
            </button>
            {activeTopicId && (
              <button
                type="button"
                onClick={() => navigate('/guide', { replace: true })}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 text-xs lg:text-sm font-medium transition shrink-0"
              >
                {t('guide.all_topics')}
              </button>
            )}
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base lg:text-lg font-bold text-amber-300 truncate">
                📘 {t('guide.title')}
              </h1>
              <p className="text-[11px] lg:text-xs text-slate-400 truncate hidden sm:block">
                {t('guide.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/studio')}
              className="px-3 py-1.5 lg:px-4 lg:py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs lg:text-sm transition shadow"
            >
              {t('guide.topics.quickstart.step2_cta')}
            </button>
            <button
              type="button"
              onClick={openSettings}
              className="px-2.5 py-1.5 lg:px-3 lg:py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs lg:text-sm transition"
              title={t('settings.title')}
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8 lg:py-10 space-y-6 lg:space-y-8">
        {!activeTopicId ? (
          /* Purpose-Driven Hub View */
          <>
            <section className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-950/50 via-slate-900 to-slate-900 p-5 sm:p-6 lg:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 lg:gap-6 shadow-xl">
              <div className="space-y-2">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] lg:text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {t('guide.hub_quickstart_badge')}
                </span>
                <h2 className="text-lg sm:text-xl lg:text-2xl font-extrabold text-slate-100">
                  🚀 {t('guide.topics.quickstart.title')}
                </h2>
                <p className="text-xs sm:text-sm lg:text-base text-slate-300 leading-relaxed">
                  {t('guide.topics.quickstart.short_desc')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/guide/quickstart', { replace: true })}
                className="px-5 py-2.5 lg:px-6 lg:py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm lg:text-base shadow-lg transition shrink-0"
              >
                {t('guide.hub_quickstart_btn')} →
              </button>
            </section>

            <section className="space-y-3.5 lg:space-y-4">
              <h2 className="text-xs lg:text-sm font-bold uppercase tracking-wider text-slate-400">
                {t('guide.hub_topics_heading')}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 lg:gap-5">
                {GUIDE_TOPICS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(`/guide/${item.id}`, { replace: true })}
                    className={`text-left rounded-xl border p-4 sm:p-5 lg:p-6 transition hover:-translate-y-0.5 hover:shadow-lg flex flex-col justify-between gap-3.5 ${item.accentClass}`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xl lg:text-2xl">{item.icon}</span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] lg:text-xs font-bold bg-slate-950/60 border border-current/20">
                          {t(`guide.topics.${item.id}.badge`)}
                        </span>
                      </div>
                      <h3 className="text-sm lg:text-base font-bold text-slate-100">
                        {t(`guide.topics.${item.id}.title`)}
                      </h3>
                      <p className="text-xs lg:text-sm text-slate-300 leading-relaxed">
                        {t(`guide.topics.${item.id}.short_desc`)}
                      </p>
                    </div>
                    <span className="text-[11px] lg:text-xs font-semibold opacity-90">→</span>
                  </button>
                ))}
              </div>
            </section>
          </>
        ) : (
          /* Single Focused Topic View: mobile horizontal pills + desktop sticky sidebar */
          <div className="space-y-5 lg:space-y-0 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8 lg:items-start">
            {/* Compact Topic Pill Switcher (< lg) */}
            <nav
              aria-label={t('guide.all_topics')}
              className="lg:hidden flex items-center gap-1.5 overflow-x-auto pb-1"
            >
              {GUIDE_TOPICS.map((item) => {
                const isSelected = item.id === activeTopicId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(`/guide/${item.id}`, { replace: true })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition shrink-0 flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{t(`guide.topics.${item.id}.title`)}</span>
                  </button>
                );
              })}
            </nav>

            {/* Desktop Sticky Topic Sidebar (lg:) */}
            <aside
              aria-label={t('guide.all_topics')}
              className="hidden lg:flex lg:flex-col lg:sticky lg:top-20 lg:gap-1.5 rounded-2xl border border-slate-800/80 bg-slate-900/50 p-2.5"
            >
              {GUIDE_TOPICS.map((item) => {
                const isSelected = item.id === activeTopicId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(`/guide/${item.id}`, { replace: true })}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition flex items-center gap-2.5 border ${
                      isSelected
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 font-bold shadow-sm'
                        : 'bg-transparent text-slate-300 border-transparent hover:bg-slate-800/70 hover:text-slate-100 font-medium'
                    }`}
                  >
                    <span className="text-base shrink-0">{item.icon}</span>
                    <span className="leading-snug">{t(`guide.topics.${item.id}.title`)}</span>
                  </button>
                );
              })}
            </aside>

            {/* Right Content Column */}
            <div className="min-w-0 space-y-6 lg:space-y-7">
              <div className="space-y-1.5 lg:space-y-2 pb-2 border-b border-slate-800/60">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl lg:text-3xl">
                    {GUIDE_TOPICS[activeIndex]?.icon ?? '📘'}
                  </span>
                  <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-100">
                    {t(`guide.topics.${activeTopicId}.title`)}
                  </h2>
                </div>
                <p className="text-xs sm:text-sm lg:text-base text-slate-400 leading-relaxed">
                  {t(`guide.topics.${activeTopicId}.short_desc`)}
                </p>
              </div>

              {renderTopicContent(activeTopicId)}

              {/* Previous / Next Topic Footer */}
              <div className="pt-5 border-t border-slate-800 flex items-center justify-between gap-3 text-xs lg:text-sm">
                {prevTopic ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/guide/${prevTopic.id}`, { replace: true })}
                    className="px-3.5 py-2 lg:px-4 lg:py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold transition"
                  >
                    ← {t('guide.prev_topic')}: {t(`guide.topics.${prevTopic.id}.title`)}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate('/guide', { replace: true })}
                    className="px-3.5 py-2 lg:px-4 lg:py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold transition"
                  >
                    ← {t('guide.back_to_hub')}
                  </button>
                )}

                {nextTopic && (
                  <button
                    type="button"
                    onClick={() => navigate(`/guide/${nextTopic.id}`, { replace: true })}
                    className="px-3.5 py-2 lg:px-4 lg:py-2.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-semibold transition"
                  >
                    {t('guide.next_topic')}: {t(`guide.topics.${nextTopic.id}.title`)} →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
