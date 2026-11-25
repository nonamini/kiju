import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DuplicatePlayerGroup,
  findDuplicatePlayerGroups,
  mergePlayerProfiles,
} from '../../utils/playerDeduplicator';
import { ShogiPlayerProfile } from '../../types/player';
import { deletePlayerProfile, isProtectedPlayerProfile } from '../../utils/playerStorage';

export interface PlayerDeduplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMerged: () => void;
  profiles: ShogiPlayerProfile[];
}

export const PlayerDeduplicationModal: React.FC<PlayerDeduplicationModalProps> = ({
  isOpen,
  onClose,
  onMerged,
  profiles,
}) => {
  const { t } = useTranslation();
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicatePlayerGroup[]>(() =>
    findDuplicatePlayerGroups(profiles)
  );
  const [selectedPrimaries, setSelectedPrimaries] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectPrimary = (groupKey: string, primaryId: string) => {
    setSelectedPrimaries((prev) => ({ ...prev, [groupKey]: primaryId }));
  };

  const handleMergeGroup = (group: DuplicatePlayerGroup) => {
    const primaryId = selectedPrimaries[group.key] || group.candidates[0]?.profile.id;
    if (!primaryId) return;

    const sourceIds = group.candidates
      .map((c) => c.profile.id)
      .filter((id) => id !== primaryId);

    const res = mergePlayerProfiles(primaryId, sourceIds);
    setFeedback(
      t('players.dedup_success_msg', {
        name: group.canonicalName,
        count: res.updatedRecordCount,
        defaultValue: `「${group.canonicalName}」を統合しました（${res.updatedRecordCount}局の棋譜を再紐づけ）`,
      })
    );

    const next = findDuplicatePlayerGroups();
    setDuplicateGroups(next);
    onMerged();
  };

  const handleDeleteZeroGameCandidate = (profileId: string) => {
    if (isProtectedPlayerProfile(profileId)) return;
    deletePlayerProfile(profileId);
    const next = findDuplicatePlayerGroups();
    setDuplicateGroups(next);
    onMerged();
  };

  const handleCleanAllZeroGames = () => {
    let deletedCount = 0;
    for (const group of duplicateGroups) {
      for (const candidate of group.candidates) {
        if (candidate.gameCount === 0 && !isProtectedPlayerProfile(candidate.profile.id)) {
          deletePlayerProfile(candidate.profile.id);
          deletedCount += 1;
        }
      }
    }
    setFeedback(
      t('players.clean_zeros_msg', {
        count: deletedCount,
        defaultValue: `対局数0局の重複棋士 ${deletedCount}件 を削除・整理しました`,
      })
    );
    const next = findDuplicatePlayerGroups();
    setDuplicateGroups(next);
    onMerged();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in font-sans"
    >
      <div className="w-full max-w-2xl max-h-[85vh] rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/50">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔍</span>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-amber-300">
                {t('players.dedup_modal_title', '棋士の重複確認と整理・マージ')}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {t('players.dedup_modal_desc', '同名または表記ゆれで複数登録されたプロファイルを統合・削除します')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg p-1.5 transition text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Feedback Message */}
        {feedback && (
          <div className="mx-4 mt-3 p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-600/60 text-emerald-300 text-xs flex items-center justify-between">
            <span>✨ {feedback}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-emerald-400 hover:text-emerald-200"
            >
              ✕
            </button>
          </div>
        )}

        {/* Action Toolbar */}
        <div className="px-4 py-2.5 border-b border-slate-800 bg-slate-950/30 flex items-center justify-between text-xs">
          <span className="text-slate-300 font-semibold">
            {t('players.duplicate_groups_count', {
              count: duplicateGroups.length,
              defaultValue: `重複候補: ${duplicateGroups.length}グループ`,
            })}
          </span>
          {duplicateGroups.length > 0 && (
            <button
              type="button"
              onClick={handleCleanAllZeroGames}
              className="px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-700/60 font-semibold transition flex items-center gap-1 active:scale-95"
            >
              <span>🗑️</span>
              <span>{t('players.clean_all_zero_games_btn', '0局の重複プロファイルを一括削除')}</span>
            </button>
          )}
        </div>

        {/* Body List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {duplicateGroups.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs sm:text-sm space-y-2">
              <span className="text-3xl block">🎉</span>
              <p className="font-semibold text-slate-300">
                {t('players.no_duplicates_found', '重複している棋士プロファイルはありません')}
              </p>
              <p className="text-slate-500">
                {t('players.no_duplicates_hint', 'すべての登録棋士が整理されています')}
              </p>
            </div>
          ) : (
            duplicateGroups.map((group) => {
              const activePrimary = selectedPrimaries[group.key] || group.candidates[0]?.profile.id;
              return (
                <div
                  key={group.key}
                  className="rounded-xl border border-slate-700/80 bg-slate-950/60 p-3.5 space-y-3 shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-amber-300">{group.canonicalName}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {group.candidates.length} 件の重複
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleMergeGroup(group)}
                      className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs transition shadow active:scale-95 flex items-center gap-1"
                    >
                      <span>🔄</span>
                      <span>{t('players.merge_into_primary_btn', '選択先へ統合')}</span>
                    </button>
                  </div>

                  {/* Candidate List */}
                  <div className="space-y-1.5">
                    {group.candidates.map((c) => {
                      const isPrimary = c.profile.id === activePrimary;
                      return (
                        <div
                          key={c.profile.id}
                          className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-3 transition ${
                            isPrimary
                              ? 'bg-amber-950/40 border-amber-500/60 text-slate-200'
                              : 'bg-slate-900 border-slate-800 text-slate-300'
                          }`}
                        >
                          <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                            <input
                              type="radio"
                              name={`primary-${group.key}`}
                              checked={isPrimary}
                              onChange={() => handleSelectPrimary(group.key, c.profile.id)}
                              className="text-amber-500 bg-slate-950 border-slate-700 focus:ring-amber-500"
                            />
                            <div className="truncate">
                              <span className="font-semibold text-slate-100 mr-2">{c.profile.name}</span>
                              {c.profile.title && (
                                <span className="text-[11px] text-slate-400 mr-2">({c.profile.title})</span>
                              )}
                              <span className="text-[10px] text-slate-500 font-mono">ID: {c.profile.id}</span>
                              {c.profile.aliases && c.profile.aliases.length > 0 && (
                                <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                  表記ゆれ: {c.profile.aliases.join(', ')}
                                </div>
                              )}
                            </div>
                          </label>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                c.gameCount > 0
                                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {c.gameCount} 局
                            </span>

                            {c.gameCount === 0 && !isProtectedPlayerProfile(c.profile.id) && (
                              <button
                                type="button"
                                onClick={() => handleDeleteZeroGameCandidate(c.profile.id)}
                                className="px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-rose-950 hover:text-rose-300 border border-slate-700 text-slate-400 transition"
                                title="0局のプロファイルを単独削除"
                              >
                                ✕ 削除
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          >
            {t('common.close', '閉じる')}
          </button>
        </div>
      </div>
    </div>
  );
};
