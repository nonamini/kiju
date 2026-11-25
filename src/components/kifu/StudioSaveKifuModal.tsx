/**
 * Modal dialog for saving or overwriting a Studio study/match kifu tree
 * directly into the Unified Kifu Library (`KifuRecord` + optional Firestore sync).
 * Overwrite strictly targets only the original opened KifuRecord after confirmation.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useEffect, useState } from 'react';
import { ForkPointer } from 'json-kifu-format';
import { useTranslation } from 'react-i18next';
import { auth } from '../../services/firebase';
import { uploadKifuRecordToFirestore } from '../../services/firestoreKifuSync';
import { KifuGameKind, KifuRecord } from '../../types/kifuRecord';
import { MoveEvaluation } from '../../types/shogi';
import { inferGameKind, resolveGameKind } from '../../utils/gameKindClassifier';
import {
  loadKifuRecords,
  saveKifuRecord,
  updateKifuRecord,
} from '../../utils/kifuRecordStorage';
import { syncKifuRecordToTacticsNote } from '../../utils/tacticsJkfConverter';

export interface StudioSaveKifuModalProps {
  isOpen: boolean;
  jkfJson: string;
  totalPlies: number;
  defaultTitle: string;
  senteName: string;
  goteName: string;
  activeGameId: string | null;
  activeTags: string[];
  activeForkPointers?: ForkPointer[];
  evaluations?: Record<number, MoveEvaluation>;
  onClose: () => void;
  onSaved: (record: KifuRecord) => void;
}

const GAME_KIND_OPTIONS: ReadonlyArray<{ id: KifuGameKind; labelKey: string }> = [
  { id: 'joseki', labelKey: 'studio_kifu_save.kind_joseki' },
  { id: 'other', labelKey: 'studio_kifu_save.kind_other' },
  { id: 'self', labelKey: 'studio_kifu_save.kind_self' },
  { id: 'pro', labelKey: 'studio_kifu_save.kind_pro' },
  { id: 'ladies', labelKey: 'studio_kifu_save.kind_ladies' },
  { id: 'amateur', labelKey: 'studio_kifu_save.kind_amateur' },
];

export const StudioSaveKifuModal: React.FC<StudioSaveKifuModalProps> = ({
  isOpen,
  jkfJson,
  totalPlies,
  defaultTitle,
  senteName,
  goteName,
  activeGameId,
  activeTags,
  activeForkPointers,
  evaluations,
  onClose,
  onSaved,
}) => {
  const { t } = useTranslation();

  const [saveMode, setSaveMode] = useState<'new' | 'overwrite'>('new');
  const [originalRecord, setOriginalRecord] = useState<KifuRecord | null>(null);
  const [title, setTitle] = useState<string>('');
  const [gameKind, setGameKind] = useState<KifuGameKind>('other');
  const [sente, setSente] = useState<string>('');
  const [gote, setGote] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const matched = activeGameId
      ? (loadKifuRecords().find((r) => !r.deletedAt && r.id === activeGameId) ?? null)
      : null;

    setOriginalRecord(matched);
    setErrorMsg(null);

    if (matched) {
      setSaveMode('overwrite');
      setTitle(matched.title);
      setGameKind(resolveGameKind(matched));
      setSente(matched.senteName);
      setGote(matched.goteName);
    } else {
      setSaveMode('new');
      setTitle(defaultTitle);
      setSente(senteName);
      setGote(goteName);
      setGameKind(
        activeGameId?.startsWith('tactic_')
          ? 'joseki'
          : inferGameKind({ senteName, goteName, tags: activeTags })
      );
    }
  }, [isOpen, activeGameId, defaultTitle, senteName, goteName, activeTags]);

  if (!isOpen) return null;

  const isOverwrite = saveMode === 'overwrite';
  const canOverwrite = !isOverwrite || originalRecord !== null;
  const canSubmit = Boolean(title.trim()) && canOverwrite;

  const handleSaveModeChange = (nextMode: 'new' | 'overwrite') => {
    if (nextMode === 'overwrite' && !originalRecord) return;
    setSaveMode(nextMode);
    setErrorMsg(null);
    if (nextMode === 'overwrite' && originalRecord) {
      setTitle(originalRecord.title);
      setGameKind(resolveGameKind(originalRecord));
      setSente(originalRecord.senteName);
      setGote(originalRecord.goteName);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMsg(t('studio_kifu_save.title_required'));
      return;
    }

    const finalSente = sente.trim() || t('board.sente');
    const finalGote = gote.trim() || t('board.gote');

    let updatedJkfJson = jkfJson;
    try {
      const parsed = JSON.parse(jkfJson) as { header?: Record<string, string> };
      parsed.header = {
        ...(parsed.header ?? {}),
        '棋戦': trimmedTitle,
        '先手': finalSente,
        '後手': finalGote,
      };
      updatedJkfJson = JSON.stringify(parsed);
    } catch {
      // Keep raw jkfJson if JSON parsing fails
    }

    const cleanEvaluations =
      evaluations && Object.keys(evaluations).length > 0 ? evaluations : undefined;
    const mergedTags =
      activeTags.length > 0
        ? [...activeTags]
        : gameKind === 'joseki'
          ? ['定跡']
          : gameKind === 'other'
            ? ['研究']
            : [];
    const cleanForks =
      activeForkPointers && activeForkPointers.length > 0 ? [...activeForkPointers] : undefined;

    const uid = auth?.currentUser?.uid;

    if (isOverwrite) {
      if (!originalRecord) return;
      if (!window.confirm(t('studio_kifu_save.overwrite_confirm', { title: originalRecord.title }))) {
        return;
      }
      const updated = updateKifuRecord(originalRecord.id, {
        title: trimmedTitle,
        senteName: finalSente,
        goteName: finalGote,
        gameKind,
        totalPlies,
        jkfJson: updatedJkfJson,
        tags: mergedTags,
        ...(cleanEvaluations ? { evaluations: cleanEvaluations } : {}),
        ...(cleanForks ? { activeForkPointers: cleanForks } : {}),
      });
      if (updated) {
        if (updated.id.startsWith('tactic_game_')) {
          syncKifuRecordToTacticsNote(updated);
        }
        if (uid) {
          void uploadKifuRecordToFirestore(uid, updated);
        }
        onSaved(updated);
        onClose();
      }
      return;
    }

    const nowIso = new Date().toISOString();
    const newId = `kifu_${Date.now()}`;
    const newRecord: KifuRecord = {
      id: newId,
      title: trimmedTitle,
      contentHash: `studio_${newId}_${totalPlies}`,
      source: 'studio',
      senteName: finalSente,
      goteName: finalGote,
      openingId: 'unknown',
      openingName: trimmedTitle,
      totalPlies,
      jkfJson: updatedJkfJson,
      ...(cleanEvaluations ? { evaluations: cleanEvaluations } : {}),
      ...(cleanForks ? { activeForkPointers: cleanForks } : {}),
      tags: mergedTags,
      gameKind,
      isIncludedInTree: false,
      createdAt: nowIso,
      updatedAt: nowIso,
      reviewStatus: 'read',
    };
    saveKifuRecord(newRecord);
    if (uid) {
      void uploadKifuRecordToFirestore(uid, newRecord);
    }
    onSaved(newRecord);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <span>💾</span>
            <span>{t('studio_kifu_save.modal_title')}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>

        {/* Save Mode: New vs Overwrite (only enabled when editing an existing saved kifu) */}
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => handleSaveModeChange('new')}
              className={`py-1.5 rounded-lg transition ${
                saveMode === 'new'
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('studio_kifu_save.mode_new')}
            </button>
            <button
              type="button"
              disabled={!originalRecord}
              onClick={() => handleSaveModeChange('overwrite')}
              className={`py-1.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed ${
                saveMode === 'overwrite'
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t('studio_kifu_save.mode_overwrite')}
            </button>
          </div>
          {!originalRecord && (
            <p className="text-[11px] text-slate-400">
              {t('studio_kifu_save.overwrite_only_when_saved')}
            </p>
          )}
        </div>

        {/* Read-only Overwrite Target Banner */}
        {isOverwrite && originalRecord && (
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-400">
              {t('studio_kifu_save.overwrite_target_readonly')}
            </label>
            <div className="rounded-lg bg-slate-950/80 border border-sky-500/40 px-3 py-2 text-xs text-slate-100 flex items-center justify-between gap-2">
              <span className="font-semibold truncate">{originalRecord.title}</span>
              <span className="text-[11px] text-slate-400 font-mono shrink-0">
                {t('studio_kifu_save.plies_fmt', { count: originalRecord.totalPlies })}
              </span>
            </div>
          </div>
        )}

        {/* Title Input */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold text-slate-400">
            {t('studio_kifu_save.title_label')}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('studio_kifu_save.title_placeholder')}
            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        {/* Library Category (GameKind) Selector */}
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold text-slate-400">
            {t('studio_kifu_save.kind_label')}
          </label>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {GAME_KIND_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setGameKind(opt.id)}
                className={`px-2.5 py-1.5 rounded-lg border font-semibold transition ${
                  gameKind === opt.id
                    ? 'bg-sky-500/20 border-sky-400/70 text-sky-200'
                    : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400">
            {gameKind === 'joseki'
              ? t('studio_kifu_save.kind_hint_joseki')
              : gameKind === 'other'
                ? t('studio_kifu_save.kind_hint_other')
                : t('studio_kifu_save.kind_hint_match')}
          </p>
        </div>

        {/* Sente / Gote Player Names */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-400">
              {t('studio_kifu_save.sente_label')}
            </label>
            <input
              type="text"
              value={sente}
              onChange={(e) => setSente(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-400">
              {t('studio_kifu_save.gote_label')}
            </label>
            <input
              type="text"
              value={gote}
              onChange={(e) => setGote(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-lg bg-rose-950/60 border border-rose-500/50 px-3 py-2 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
          >
            {t('studio_kifu_save.cancel_btn')}
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition shadow"
          >
            {t('studio_kifu_save.submit_btn')}
          </button>
        </div>
      </form>
    </div>
  );
};
