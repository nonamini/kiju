/**
 * Record Metadata Editor Modal for KifuLibraryPage (Issue #70 follow-up).
 * Restores full metadata editing from the legacy library modal:
 * title, Sente/Gote player profile association & display names, winner outcome,
 * match date, tournament, opening name, review status, and notes.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  KifuGameKind,
  KifuRecord,
  KifuReviewStatus,
  KifuWinner,
} from '../../types/kifuRecord';
import type { ShogiPlayerProfile } from '../../types/player';
import { auth } from '../../services/firebase';
import { uploadKifuRecordToFirestore } from '../../services/firestoreKifuSync';
import { inferGameKind, resolveGameKind } from '../../utils/gameKindClassifier';
import { updateKifuRecord } from '../../utils/kifuRecordStorage';
import { loadPlayerProfiles } from '../../utils/playerStorage';

export interface RecordMetadataEditorModalProps {
  record: KifuRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

function normalizeDateForInput(raw?: string): string {
  if (!raw) return '';
  const m = raw.trim().match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
  if (!m) return '';
  const [, y, mo, d] = m;
  return `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
}

export const RecordMetadataEditorModal: React.FC<
  RecordMetadataEditorModalProps
> = ({ record, isOpen, onClose, onUpdated }) => {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<ShogiPlayerProfile[]>([]);
  const [title, setTitle] = useState('');
  const [sentePlayerId, setSentePlayerId] = useState('');
  const [senteName, setSenteName] = useState('');
  const [gotePlayerId, setGotePlayerId] = useState('');
  const [goteName, setGoteName] = useState('');
  const [winner, setWinner] = useState<KifuWinner>('unknown');
  const [matchDate, setMatchDate] = useState('');
  const [tournament, setTournament] = useState('');
  const [openingName, setOpeningName] = useState('');
  const [reviewStatus, setReviewStatus] = useState<KifuReviewStatus>('unread');
  const [gameKind, setGameKind] = useState<KifuGameKind>('other');
  const [gameKindManuallyEdited, setGameKindManuallyEdited] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen || !record) return;
    const loadedProfiles = loadPlayerProfiles();
    setProfiles(loadedProfiles);
    setTitle(record.title || '');
    setSentePlayerId(record.sentePlayerId || '');
    setSenteName(record.senteName || '');
    setGotePlayerId(record.gotePlayerId || '');
    setGoteName(record.goteName || '');
    setWinner(record.winner || 'unknown');
    setMatchDate(normalizeDateForInput(record.matchDate));
    setTournament(record.tournament || '');
    setOpeningName(record.openingName || '');
    setReviewStatus(record.reviewStatus || 'unread');
    setGameKind(resolveGameKind(record, loadedProfiles));
    setGameKindManuallyEdited(false);
    setNotes(record.notes || '');
  }, [isOpen, record]);

  if (!isOpen || !record) return null;

  const maybeReinferGameKind = (next: {
    sentePlayerId: string;
    gotePlayerId: string;
    senteName: string;
    goteName: string;
    tournament: string;
  }) => {
    if (gameKindManuallyEdited) return;
    setGameKind(
      inferGameKind(
        {
          sentePlayerId: next.sentePlayerId || undefined,
          gotePlayerId: next.gotePlayerId || undefined,
          senteName: next.senteName,
          goteName: next.goteName,
          tournament: next.tournament || undefined,
          tags: record.tags,
        },
        profiles
      )
    );
  };

  const handleSelectSenteProfile = (profileId: string) => {
    setSentePlayerId(profileId);
    const prof = profiles.find((p) => p.id === profileId);
    const nextSenteName = prof ? prof.name : senteName;
    if (prof) {
      setSenteName(prof.name);
    }
    maybeReinferGameKind({
      sentePlayerId: profileId,
      gotePlayerId,
      senteName: nextSenteName,
      goteName,
      tournament,
    });
  };

  const handleSelectGoteProfile = (profileId: string) => {
    setGotePlayerId(profileId);
    const prof = profiles.find((p) => p.id === profileId);
    const nextGoteName = prof ? prof.name : goteName;
    if (prof) {
      setGoteName(prof.name);
    }
    maybeReinferGameKind({
      sentePlayerId,
      gotePlayerId: profileId,
      senteName,
      goteName: nextGoteName,
      tournament,
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    updateKifuRecord(record.id, {
      title: trimmedTitle,
      sentePlayerId: sentePlayerId || undefined,
      senteName: senteName.trim() || record.senteName,
      gotePlayerId: gotePlayerId || undefined,
      goteName: goteName.trim() || record.goteName,
      winner,
      matchDate: matchDate.trim() || undefined,
      tournament: tournament.trim() || undefined,
      openingName: openingName.trim() || record.openingName,
      reviewStatus,
      gameKind,
      notes: notes.trim() || undefined,
    });
    const uid = auth?.currentUser?.uid;
    if (uid) {
      void uploadKifuRecordToFirestore(uid, record.id);
    }
    onUpdated();
    onClose();
  };

  const userProfiles = profiles.filter((p) => p.category === 'user');
  const aiProfiles = profiles.filter((p) => p.category === 'ai');
  const proProfiles = profiles.filter((p) => p.category === 'pro');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('library_page.meta_editor_title')}
    >
      <form
        onSubmit={handleSave}
        className="w-full max-w-xl max-h-[90vh] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-amber-300 flex items-center gap-2">
            <span>📝</span>
            <span>{t('library_page.meta_editor_title')}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          <div>
            <label className="block text-slate-400 mb-1">
              {t('library_page.col_title')}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            <div className="space-y-1.5">
              <label className="block font-semibold text-amber-300">
                ☗ {t('library_page.meta_sente_player')}
              </label>
              <select
                value={sentePlayerId}
                onChange={(e) => handleSelectSenteProfile(e.target.value)}
                className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-slate-200"
              >
                <option value="">
                  {t('library_page.meta_unlinked_profile')}
                </option>
                <optgroup label={t('library_page.meta_group_user')}>
                  {userProfiles.map((p) => (
                    <option key={`s-${p.id}`} value={p.id}>
                      {p.name} {p.title ? `(${p.title})` : ''}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t('library_page.meta_group_ai')}>
                  {aiProfiles.map((p) => (
                    <option key={`s-${p.id}`} value={p.id}>
                      {p.name} {p.title ? `(${p.title})` : ''}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t('library_page.meta_group_pro')}>
                  {proProfiles.map((p) => (
                    <option key={`s-${p.id}`} value={p.id}>
                      {p.name} {p.title ? `(${p.title})` : ''}
                    </option>
                  ))}
                </optgroup>
              </select>
              <input
                type="text"
                value={senteName}
                onChange={(e) => setSenteName(e.target.value)}
                placeholder={t('library_page.meta_player_name_placeholder')}
                className="w-full rounded bg-slate-900 border border-slate-700 px-2.5 py-1 text-slate-100"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-semibold text-sky-300">
                ☖ {t('library_page.meta_gote_player')}
              </label>
              <select
                value={gotePlayerId}
                onChange={(e) => handleSelectGoteProfile(e.target.value)}
                className="w-full rounded bg-slate-900 border border-slate-700 px-2 py-1 text-slate-200"
              >
                <option value="">
                  {t('library_page.meta_unlinked_profile')}
                </option>
                <optgroup label={t('library_page.meta_group_user')}>
                  {userProfiles.map((p) => (
                    <option key={`g-${p.id}`} value={p.id}>
                      {p.name} {p.title ? `(${p.title})` : ''}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t('library_page.meta_group_ai')}>
                  {aiProfiles.map((p) => (
                    <option key={`g-${p.id}`} value={p.id}>
                      {p.name} {p.title ? `(${p.title})` : ''}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t('library_page.meta_group_pro')}>
                  {proProfiles.map((p) => (
                    <option key={`g-${p.id}`} value={p.id}>
                      {p.name} {p.title ? `(${p.title})` : ''}
                    </option>
                  ))}
                </optgroup>
              </select>
              <input
                type="text"
                value={goteName}
                onChange={(e) => setGoteName(e.target.value)}
                placeholder={t('library_page.meta_player_name_placeholder')}
                className="w-full rounded bg-slate-900 border border-slate-700 px-2.5 py-1 text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">
                {t('library_page.meta_game_kind')}
              </label>
              <select
                value={gameKind}
                onChange={(e) => {
                  setGameKind(e.target.value as KifuGameKind);
                  setGameKindManuallyEdited(true);
                }}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-slate-100"
              >
                <option value="pro">{t('library_page.game_kind_pro')}</option>
                <option value="ladies">{t('library_page.game_kind_ladies')}</option>
                <option value="amateur">{t('library_page.game_kind_amateur')}</option>
                <option value="self">{t('library_page.game_kind_self')}</option>
                <option value="joseki">{t('library_page.game_kind_joseki')}</option>
                <option value="other">{t('library_page.game_kind_other')}</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">
                {t('library_page.filter_winner')}
              </label>
              <select
                value={winner}
                onChange={(e) => setWinner(e.target.value as KifuWinner)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-slate-100"
              >
                <option value="unknown">{t('library.unknown_result')}</option>
                <option value="sente">{t('library.sente_win')}</option>
                <option value="gote">{t('library.gote_win')}</option>
                <option value="draw">{t('library.draw')}</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">
                {t('library_page.filter_review')}
              </label>
              <select
                value={reviewStatus}
                onChange={(e) =>
                  setReviewStatus(e.target.value as KifuReviewStatus)
                }
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-slate-100"
              >
                <option value="unread">{t('library_page.review_unread')}</option>
                <option value="reviewed">
                  {t('library_page.review_reviewed')}
                </option>
                <option value="mastered">
                  {t('library_page.review_mastered')}
                </option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">
                {t('library_page.col_date')}
              </label>
              <input
                type="date"
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">
                {t('library_page.meta_tournament')}
              </label>
              <input
                type="text"
                value={tournament}
                onChange={(e) => setTournament(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">
                {t('library_page.filter_opening')}
              </label>
              <input
                type="text"
                value={openingName}
                onChange={(e) => setOpeningName(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">
              {t('library_page.meta_notes')}
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-1.5 text-slate-100"
            />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-800 flex justify-end gap-2 bg-slate-950/50">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
          >
            {t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
};
