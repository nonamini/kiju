/**
 * Shogi Rulebook Modal Component.
 * Interactive guide explaining tricky official Shogi rules:
 * - 千日手 (Sanyata / Repetition) & 連続王手の千日手 (Perpetual Check)
 * - 入玉 (King Entering) & 持将棋 (Impasse, 24-point & 27-point rules)
 * - 二歩 (Two Pawns), 打ち歩詰め (Pawn-drop Mate), 行き所のない駒
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strict TypeScript without 'any' (Rule 2).
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface ShogiRulebookModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTopic?: 'sanyata' | 'impasse' | 'fouls' | 'promotion';
}

export const ShogiRulebookModal: React.FC<ShogiRulebookModalProps> = ({
  isOpen,
  onClose,
  initialTopic = 'sanyata',
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'sanyata' | 'impasse' | 'fouls' | 'clocks'>(
    initialTopic === 'impasse' ? 'impasse' : initialTopic === 'fouls' ? 'fouls' : 'sanyata'
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-sm animate-fade-in font-sans">
      <div className="bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📖</span>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-amber-300">
                {t('rulebook.title')}
              </h2>
              <p className="text-[11px] text-slate-400">
                {t('rulebook.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-800 p-1.5 rounded-lg transition-colors text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-3 pt-2 gap-1 overflow-x-auto text-xs font-medium">
          <button
            onClick={() => setActiveTab('sanyata')}
            className={`px-3 py-2 rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'sanyata'
                ? 'bg-slate-900 text-amber-400 border-t-2 border-amber-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🔄</span>
            <span>{t('rulebook.tab_sanyata')}</span>
          </button>

          <button
            onClick={() => setActiveTab('impasse')}
            className={`px-3 py-2 rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'impasse'
                ? 'bg-slate-900 text-amber-400 border-t-2 border-amber-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🏰</span>
            <span>{t('rulebook.tab_impasse')}</span>
          </button>

          <button
            onClick={() => setActiveTab('fouls')}
            className={`px-3 py-2 rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'fouls'
                ? 'bg-slate-900 text-amber-400 border-t-2 border-amber-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>🚫</span>
            <span>{t('rulebook.tab_fouls')}</span>
          </button>

          <button
            onClick={() => setActiveTab('clocks')}
            className={`px-3 py-2 rounded-t-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'clocks'
                ? 'bg-slate-900 text-amber-400 border-t-2 border-amber-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>⏱️</span>
            <span>{t('rulebook.tab_clocks')}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed">
          {activeTab === 'sanyata' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-amber-950/20 border border-amber-700/40 rounded-xl">
                <h4 className="font-bold text-amber-300 mb-1 flex items-center gap-1.5 text-sm">
                  <span>🔄</span> {t('rulebook.sanyata_heading')}
                </h4>
                <p className="text-slate-300">
                  {t('rulebook.sanyata_summary')}
                </p>
              </div>

              <div className="space-y-2">
                <h5 className="font-semibold text-slate-200">
                  {t('rulebook.sanyata_condition_title')}
                </h5>
                <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
                  <li>{t('rulebook.sanyata_condition_1')}</li>
                  <li>{t('rulebook.sanyata_condition_2')}</li>
                  <li>{t('rulebook.sanyata_condition_3')}</li>
                </ul>
              </div>

              <div className="p-3 bg-rose-950/30 border border-rose-700/40 rounded-xl">
                <h5 className="font-bold text-rose-300 mb-1 flex items-center gap-1">
                  <span>⚠️</span> {t('rulebook.perpetual_check_title')}
                </h5>
                <p className="text-slate-300">
                  {t('rulebook.perpetual_check_desc')}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'impasse' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-sky-950/20 border border-sky-700/40 rounded-xl">
                <h4 className="font-bold text-sky-300 mb-1 flex items-center gap-1.5 text-sm">
                  <span>🏰</span> {t('rulebook.impasse_heading')}
                </h4>
                <p className="text-slate-300">
                  {t('rulebook.impasse_summary')}
                </p>
              </div>

              <div className="space-y-2">
                <h5 className="font-semibold text-slate-200">
                  {t('rulebook.impasse_point_title')}
                </h5>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700">
                    <div className="font-bold text-amber-300 mb-0.5">
                      {t('rulebook.major_pieces_heading', '大駒 (飛・角・竜・馬)')}
                    </div>
                    <div className="text-slate-300">
                      {t('rulebook.points_per_piece', { points: 5, defaultValue: '1枚につき 5点' })}
                    </div>
                  </div>
                  <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700">
                    <div className="font-bold text-amber-300 mb-0.5">
                      {t('rulebook.minor_pieces_heading', '小駒 (金・銀・桂・香・歩・成駒)')}
                    </div>
                    <div className="text-slate-300">
                      {t('rulebook.points_per_piece', { points: 1, defaultValue: '1枚につき 1点' })}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">
                  ※玉自体は0点です。敵陣3段目以内にある盤上の駒＋自分の持ち駒が対象です。
                </p>
              </div>

              <div className="space-y-2">
                <h5 className="font-semibold text-slate-200">
                  {t('rulebook.impasse_rules_title')}
                </h5>
                <div className="space-y-2">
                  <div className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/60">
                    <span className="font-bold text-slate-100">
                      {t('rulebook.impasse_24_point_rule_title', '① 24点法 (伝統的持将棋)')}
                    </span>
                    <p className="text-xs text-slate-400 mt-1">
                      双方24点以上あれば引き分け（指し直し）。24点未満の側は負けとなります（点数不足負け）。
                    </p>
                  </div>
                  <div className="bg-slate-800/40 p-2.5 rounded-lg border border-slate-700/60">
                    <span className="font-bold text-slate-100">
                      {t('rulebook.impasse_27_point_rule_title', '② 日本将棋連盟 27点宣言法')}
                    </span>
                    <p className="text-xs text-slate-400 mt-1">
                      自分の手番で玉が敵陣に入り、敵陣に10枚以上、玉に王手がかかっていない状態で宣言し、先手28点以上・後手27点以上あれば即座に勝ちとなります。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'fouls' && (
            <div className="space-y-3">
              <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-xl space-y-1">
                <h5 className="font-bold text-rose-300 flex items-center gap-1.5">
                  <span>🚫</span> 二歩 (にふ)
                </h5>
                <p className="text-xs text-slate-300">
                  同じ筋に自分の「歩」（成っていない歩）が既にある場合、さらに持ち駒の歩を打つことはできません（反則負け）。「と金」がある筋に歩を打つことは合法です。
                </p>
              </div>

              <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-xl space-y-1">
                <h5 className="font-bold text-rose-300 flex items-center gap-1.5">
                  <span>🚫</span> 打ち歩詰め (うちふづめ)
                </h5>
                <p className="text-xs text-slate-300">
                  持ち駒の「歩」を打って、相手玉をその一手で即座に「詰み」にすることはできません（反則負け）。ただし、盤上の歩を突いて詰ます「突き歩詰め」は完全に合法です。
                </p>
              </div>

              <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-xl space-y-1">
                <h5 className="font-bold text-rose-300 flex items-center gap-1.5">
                  <span>🚫</span> 行き所のない駒の配置
                </h5>
                <p className="text-xs text-slate-300">
                  歩や香を1段目（後手なら9段目）に打ったり成らずに進めたりすること、また桂馬を1〜2段目に打つ・成らずに進めることは、以降一度も動けなくなるため禁止されています。
                </p>
              </div>

              <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-xl space-y-1">
                <h5 className="font-bold text-rose-300 flex items-center gap-1.5">
                  <span>🚫</span> 王手放置・自滅手
                </h5>
                <p className="text-xs text-slate-300">
                  王手をかけられた状態で王手を解除しない手を指すことや、自ら相手の利きに玉を飛び込ませる手は反則となります。本アプリではこれらはクリックしても着手できないよう安全ガードされています。
                </p>
              </div>
            </div>
          )}

          {activeTab === 'clocks' && (
            <div className="space-y-3">
              <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-xl space-y-1">
                <h5 className="font-bold text-amber-300 flex items-center gap-1.5">
                  <span>⏱️</span> 切れ負け
                </h5>
                <p className="text-xs text-slate-300">
                  持ち時間がゼロになった瞬間に負けとなります。秒読みがない短時間戦（オンライン早指し戦等で一般的な方式）です。
                </p>
              </div>

              <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-xl space-y-1">
                <h5 className="font-bold text-amber-300 flex items-center gap-1.5">
                  <span>⏱️</span> 秒読み
                </h5>
                <p className="text-xs text-slate-300">
                  持ち時間を使い切った後、1手ごとに指定の秒数（例: 30秒）以内に着手すれば対局を続けられます。指定秒数をオーバーすると時間切れ負けとなります。
                </p>
              </div>

              <div className="p-3 bg-slate-800/50 border border-slate-700 rounded-xl space-y-1">
                <h5 className="font-bold text-amber-300 flex items-center gap-1.5">
                  <span>⏱️</span> フィッシャールール (加算方式)
                </h5>
                <p className="text-xs text-slate-300">
                  1手着手するたびに一定の秒数（例: 5秒）が持ち時間に加算されます。素早く着手することで時間を回復できるチェスや公式トーナメント等で採用されている方式です。
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors"
          >
            {t('rulebook.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
