/**
 * Notion-style Structured Filter Rule Builder with Quick-Add Field Buttons (Issue #161).
 * Replaces dense dropdown grids and tag walls with clean per-rule rows supporting
 * multi-value OR matching, NOT exclusion, all-tag AND, and row-level AND/OR combinators.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { TagDefinition, TagGroupId } from '../../types/tagRegistry';
import type {
  FilterRuleCombinator,
  FilterRuleField,
  FilterRuleOperator,
  KifuFilterRule,
} from '../../utils/kifuLibraryFilter';
import { OPENING_CATEGORIES } from '../../utils/openingClassifier';

export interface KifuFilterRuleBuilderProps {
  rules: KifuFilterRule[];
  combinator: FilterRuleCombinator;
  tagRegistry: TagDefinition[];
  groupedTags: Map<TagGroupId, TagDefinition[]>;
  onChangeRules: (rules: KifuFilterRule[]) => void;
  onChangeCombinator: (combinator: FilterRuleCombinator) => void;
  onClearAll: () => void;
}

const RULE_FIELD_ORDER: readonly FilterRuleField[] = [
  'tag',
  'analysisStatus',
  'opening',
  'winner',
  'reviewStatus',
  'gameKind',
  'dateFrom',
  'dateTo',
];

const TAG_GROUP_ORDER: readonly TagGroupId[] = [
  'source',
  'tournament',
  'opening',
  'study',
  'custom',
];

interface FieldOption {
  value: string;
  label: string;
}

export function getFilterRuleFieldLabel(
  field: FilterRuleField,
  t: TFunction
): string {
  switch (field) {
    case 'tag':
      return t('library_page.filter_tag');
    case 'analysisStatus':
      return t('library_page.filter_analysis');
    case 'opening':
      return t('library_page.filter_opening');
    case 'winner':
      return t('library_page.filter_winner');
    case 'reviewStatus':
      return t('library_page.filter_review');
    case 'source':
      return t('library_page.filter_source');
    case 'gameKind':
      return t('library_page.filter_game_kind');
    case 'dateFrom':
      return t('library_page.filter_date_from');
    case 'dateTo':
      return t('library_page.filter_date_to');
  }
}

function getEnumFieldOptions(
  field: Exclude<FilterRuleField, 'tag' | 'dateFrom' | 'dateTo'>,
  t: TFunction
): FieldOption[] {
  switch (field) {
    case 'analysisStatus':
      return [
        { value: 'analyzed', label: t('library.analyzed_badge') },
        { value: 'unanalyzed', label: t('library.unanalyzed_badge') },
        { value: 'queued', label: t('library.queued_badge') },
        { value: 'processing', label: t('library.processing_badge') },
        { value: 'failed', label: t('library.failed_badge') },
      ];
    case 'opening':
      return OPENING_CATEGORIES.map((cat) => ({
        value: cat.id,
        label: t(cat.nameKey),
      }));
    case 'winner':
      return [
        { value: 'sente', label: t('library.sente_win') },
        { value: 'gote', label: t('library.gote_win') },
        { value: 'draw', label: t('library.draw') },
        { value: 'unknown', label: t('library.unknown_result') },
      ];
    case 'reviewStatus':
      return [
        { value: 'unread', label: t('library_page.review_unread') },
        { value: 'reviewed', label: t('library_page.review_reviewed') },
        { value: 'mastered', label: t('library_page.review_mastered') },
      ];
    case 'source':
      return [
        { value: 'studio', label: t('library_page.source_studio') },
        { value: 'tree', label: t('library_page.source_tree') },
        { value: 'import', label: t('library_page.source_import') },
      ];
    case 'gameKind':
      return [
        { value: 'pro', label: t('library_page.game_kind_pro') },
        { value: 'ladies', label: t('library_page.game_kind_ladies') },
        { value: 'amateur', label: t('library_page.game_kind_amateur') },
        { value: 'self', label: t('library_page.game_kind_self') },
        { value: 'joseki', label: t('library_page.game_kind_joseki') },
        { value: 'other', label: t('library_page.game_kind_other') },
      ];
  }
}

export function getFilterRuleValueLabel(
  field: FilterRuleField,
  value: string,
  t: TFunction,
  tagNameById?: Map<string, string>
): string {
  if (field === 'tag') {
    return `#${tagNameById?.get(value) ?? value}`;
  }
  if (field === 'dateFrom' || field === 'dateTo') {
    return value;
  }
  const found = getEnumFieldOptions(field, t).find((o) => o.value === value);
  return found?.label ?? value;
}

function isDateField(field: FilterRuleField): boolean {
  return field === 'dateFrom' || field === 'dateTo';
}

export const KifuFilterRuleBuilder: React.FC<KifuFilterRuleBuilderProps> = ({
  rules,
  combinator,
  tagRegistry,
  groupedTags,
  onChangeRules,
  onChangeCombinator,
  onClearAll,
}) => {
  const { t } = useTranslation();
  const [openPickerRuleId, setOpenPickerRuleId] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState<string>('');

  const tagNameById = useMemo(
    () => new Map(tagRegistry.map((d) => [d.id, d.name])),
    [tagRegistry]
  );

  const handleQuickAddField = (field: FilterRuleField) => {
    const newRule: KifuFilterRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      field,
      operator: 'in',
      values: [],
    };
    onChangeRules([...rules, newRule]);
    setTagQuery('');
    setOpenPickerRuleId(isDateField(field) ? null : newRule.id);
  };

  const updateRule = (ruleId: string, patch: Partial<KifuFilterRule>) => {
    onChangeRules(
      rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r))
    );
  };

  const removeRule = (ruleId: string) => {
    onChangeRules(rules.filter((r) => r.id !== ruleId));
    if (openPickerRuleId === ruleId) {
      setOpenPickerRuleId(null);
    }
  };

  const toggleRuleValue = (rule: KifuFilterRule, val: string) => {
    const nextValues = rule.values.includes(val)
      ? rule.values.filter((v) => v !== val)
      : [...rule.values, val];
    updateRule(rule.id, { values: nextValues });
  };

  const normalizedTagQuery = tagQuery.trim().toLowerCase();

  return (
    <div className="pt-3 border-t border-slate-800 space-y-2.5 text-xs">
      {/* Quick-Add Field Buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-slate-400 mr-0.5">
          {t('library_page.rule_builder.quick_add_label')}
        </span>
        {RULE_FIELD_ORDER.map((field) => (
          <button
            key={field}
            type="button"
            onClick={() => handleQuickAddField(field)}
            className="px-2 py-0.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-500/50 text-slate-300 hover:text-amber-200 text-[11px] font-medium transition"
          >
            ＋ {getFilterRuleFieldLabel(field, t)}
          </button>
        ))}
      </div>

      {/* Combinator & Clear Controls */}
      {rules.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {rules.length >= 2 ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">
                {t('library_page.rule_builder.combinator_label')}
              </span>
              <select
                value={combinator}
                onChange={(e) =>
                  onChangeCombinator(e.target.value as FilterRuleCombinator)
                }
                aria-label={t('library_page.rule_builder.combinator_label')}
                className="rounded bg-slate-950 border border-slate-700 px-2 py-0.5 text-[11px] text-amber-300 font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="and">
                  {t('library_page.rule_builder.combinator_and')}
                </option>
                <option value="or">
                  {t('library_page.rule_builder.combinator_or')}
                </option>
              </select>
            </div>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClearAll}
            className="text-[11px] text-slate-400 hover:text-amber-300 underline"
          >
            {t('library_page.filter_clear')}
          </button>
        </div>
      )}

      {/* Rule Rows */}
      {rules.length === 0 ? (
        <p className="text-[11px] text-slate-500">
          {t('library_page.rule_builder.empty_hint')}
        </p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => {
            const isPickerOpen = openPickerRuleId === rule.id;
            const dateMode = isDateField(rule.field);
            return (
              <div
                key={rule.id}
                className="rounded-lg border border-slate-800 bg-slate-950/65 p-2 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* Field selector */}
                  <select
                    value={rule.field}
                    onChange={(e) => {
                      const nextField = e.target.value as FilterRuleField;
                      const nextOp: FilterRuleOperator =
                        nextField !== 'tag' && rule.operator === 'all'
                          ? 'in'
                          : rule.operator;
                      updateRule(rule.id, {
                        field: nextField,
                        operator: nextOp,
                        values: [],
                      });
                      setTagQuery('');
                      setOpenPickerRuleId(isDateField(nextField) ? null : rule.id);
                    }}
                    className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    {RULE_FIELD_ORDER.map((f) => (
                      <option key={f} value={f}>
                        {getFilterRuleFieldLabel(f, t)}
                      </option>
                    ))}
                  </select>

                  {/* Operator selector */}
                  {dateMode ? (
                    <span className="px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-400">
                      {rule.field === 'dateFrom'
                        ? t('library_page.rule_builder.op_date_from')
                        : t('library_page.rule_builder.op_date_to')}
                    </span>
                  ) : (
                    <select
                      value={rule.operator}
                      onChange={(e) =>
                        updateRule(rule.id, {
                          operator: e.target.value as FilterRuleOperator,
                        })
                      }
                      className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-sky-300 font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="in">
                        {t('library_page.rule_builder.op_in')}
                      </option>
                      {rule.field === 'tag' && (
                        <option value="all">
                          {t('library_page.rule_builder.op_all')}
                        </option>
                      )}
                      <option value="not_in">
                        {t('library_page.rule_builder.op_not_in')}
                      </option>
                    </select>
                  )}

                  {/* Value Editor */}
                  {dateMode ? (
                    <input
                      type="date"
                      value={rule.values[0] ?? ''}
                      onChange={(e) =>
                        updateRule(rule.id, {
                          values: e.target.value ? [e.target.value] : [],
                        })
                      }
                      className="rounded bg-slate-900 border border-slate-700 px-2 py-1 text-[11px] text-slate-100"
                    />
                  ) : (
                    <div className="flex-1 min-w-[180px] flex flex-wrap items-center gap-1">
                      {rule.values.map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => toggleRuleValue(rule, val)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition ${
                            rule.operator === 'not_in'
                              ? 'bg-rose-500/15 border-rose-500/40 text-rose-200 hover:bg-rose-500/25'
                              : 'bg-amber-500/15 border-amber-500/40 text-amber-200 hover:bg-amber-500/25'
                          }`}
                        >
                          <span>
                            {getFilterRuleValueLabel(rule.field, val, t, tagNameById)}
                          </span>
                          <span className="opacity-75">✕</span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setTagQuery('');
                          setOpenPickerRuleId(isPickerOpen ? null : rule.id);
                        }}
                        className={`px-2 py-0.5 rounded-lg border text-[11px] font-semibold transition ${
                          isPickerOpen
                            ? 'bg-amber-600/25 border-amber-500 text-amber-200'
                            : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                        }`}
                      >
                        {isPickerOpen
                          ? t('library_page.rule_builder.close_picker')
                          : `＋ ${t('library_page.rule_builder.pick_values_btn')}`}
                      </button>
                    </div>
                  )}

                  {/* Delete row */}
                  <button
                    type="button"
                    onClick={() => removeRule(rule.id)}
                    className="ml-auto px-2 py-1 rounded bg-rose-950/50 hover:bg-rose-900 text-rose-300 text-[11px] transition"
                    title={t('library_page.action_delete')}
                  >
                    🗑️
                  </button>
                </div>

                {/* Inline Value-Picker Popover Panel */}
                {!dateMode && isPickerOpen && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-2">
                    {rule.field === 'tag' ? (
                      <>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={tagQuery}
                            onChange={(e) => setTagQuery(e.target.value)}
                            placeholder={t(
                              'library_page.rule_builder.tag_search_placeholder'
                            )}
                            autoFocus
                            className="flex-1 rounded bg-slate-900 border border-slate-700 px-2.5 py-1 text-[11px] text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                          <button
                            type="button"
                            onClick={() => setOpenPickerRuleId(null)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold"
                          >
                            {t('library_page.rule_builder.close_picker')}
                          </button>
                        </div>
                        <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                          {TAG_GROUP_ORDER.map((groupId) => {
                            const items = (groupedTags.get(groupId) ?? []).filter(
                              (def) =>
                                !normalizedTagQuery ||
                                def.name.toLowerCase().includes(normalizedTagQuery)
                            );
                            if (items.length === 0) return null;
                            return (
                              <div
                                key={groupId}
                                className="flex flex-wrap items-center gap-1"
                              >
                                <span className="text-[10px] font-bold text-slate-400 min-w-[76px] shrink-0">
                                  {t(`library_page.tag_group_${groupId}`, groupId)}
                                </span>
                                {items.map((def) => {
                                  const selected = rule.values.includes(def.id);
                                  return (
                                    <button
                                      key={def.id}
                                      type="button"
                                      onClick={() => toggleRuleValue(rule, def.id)}
                                      className={`px-2 py-0.5 rounded-full text-[11px] border transition ${
                                        selected
                                          ? 'bg-amber-500/20 border-amber-500/70 text-amber-200 font-semibold'
                                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                                      }`}
                                    >
                                      {selected ? '☑ ' : ''}#{def.name}
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {getEnumFieldOptions(
                            rule.field as Exclude<
                              FilterRuleField,
                              'tag' | 'dateFrom' | 'dateTo'
                            >,
                            t
                          ).map((opt) => {
                            const selected = rule.values.includes(opt.value);
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => toggleRuleValue(rule, opt.value)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] border transition ${
                                  selected
                                    ? 'bg-amber-500/20 border-amber-500/70 text-amber-200 font-semibold'
                                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600'
                                }`}
                              >
                                {selected ? '☑ ' : '☐ '}
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() => setOpenPickerRuleId(null)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold"
                        >
                          {t('library_page.rule_builder.close_picker')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
