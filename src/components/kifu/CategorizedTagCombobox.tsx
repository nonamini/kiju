import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TagCategoryGroup } from '../../utils/studioKifuStorage';

interface CategorySelectDropdownProps {
  group: TagCategoryGroup;
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  onAddCustomTag?: (categoryId: TagCategoryGroup['id'], tag: string) => void;
}

const CategorySelectDropdown: React.FC<CategorySelectDropdownProps> = ({
  group,
  selectedTags,
  onChange,
  onAddCustomTag,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  // Tags belonging to this category that are currently selected
  const categorySelected = selectedTags.filter((t) => group.tags.includes(t));

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const toggleTag = (tagName: string) => {
    if (selectedTags.includes(tagName)) {
      onChange(selectedTags.filter((t) => t !== tagName));
    } else {
      onChange([...selectedTags, tagName]);
    }
  };

  const handleAddTag = () => {
    const val = newTagInput.trim();
    if (!val) return;
    if (onAddCustomTag) {
      onAddCustomTag(group.id, val);
    }
    if (!selectedTags.includes(val)) {
      onChange([...selectedTags, val]);
    }
    setNewTagInput('');
  };

  return (
    <div ref={dropdownRef} className="relative flex-1 min-w-[130px]">
      {/* Category Dropdown Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full py-1.5 px-2 rounded-lg border text-left flex items-center justify-between text-xs transition ${
          categorySelected.length > 0
            ? 'bg-amber-950/40 border-amber-500/70 text-amber-200'
            : 'bg-slate-950 border-slate-700 hover:border-slate-600 text-slate-300'
        }`}
      >
        <span className="truncate flex items-center gap-1 min-w-0 pr-1">
          <span className="shrink-0">{group.icon}</span>
          <span className="font-semibold text-[11px] text-slate-400 shrink-0">{group.label}:</span>
          <span className="font-medium text-[11px] text-slate-200 truncate">
            {categorySelected.length > 0 ? categorySelected.join(', ') : '未選択'}
          </span>
        </span>
        <span className="text-[10px] text-slate-400 shrink-0">
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 max-w-[calc(100vw-2rem)] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 space-y-2 backdrop-blur-md">
          <div className="text-[10px] font-bold text-slate-400 pb-1 border-b border-slate-800 flex items-center justify-between">
            <span>
              {t('kifu.category_select_heading', {
                icon: group.icon,
                label: group.label,
                defaultValue: `${group.icon} ${group.label} の選択`,
              })}
            </span>
            {categorySelected.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onChange(selectedTags.filter((t) => !group.tags.includes(t)));
                }}
                className="text-[10px] text-rose-400 hover:underline"
              >
                {t('common.clear', 'クリア')}
              </button>
            )}
          </div>

          {/* Tag List */}
          <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1 text-xs">
            {group.tags.map((tag) => {
              const isChecked = selectedTags.includes(tag);
              return (
                <button
                  type="button"
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`w-full text-left px-2 py-1 rounded flex items-center justify-between transition text-[11px] ${
                    isChecked
                      ? 'bg-amber-500/20 text-amber-300 font-semibold'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <span>#{tag}</span>
                  <span className="text-xs">{isChecked ? '✓' : ''}</span>
                </button>
              );
            })}
          </div>

          {/* Quick Add Custom Tag to THIS Category */}
          <div className="pt-1.5 border-t border-slate-800 flex gap-1">
            <input
              type="text"
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder={t('kifu.add_new_category_tag_placeholder', {
                label: group.label,
                defaultValue: `新${group.label}を追加...`,
              })}
              className="flex-1 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-500"
            />
            <button
              type="button"
              onClick={handleAddTag}
              className="px-2 py-0.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-[10px] rounded transition"
            >
              {t('common.add', '追加')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface CategorizedTagComboboxProps {
  tagGroups: TagCategoryGroup[];
  selectedTags: string[];
  onChange: (tags: string[]) => void;
  onAddCustomTag?: (category: TagCategoryGroup['id'], tag: string) => void;
  placeholder?: string;
}

export const CategorizedTagCombobox: React.FC<CategorizedTagComboboxProps> = ({
  tagGroups,
  selectedTags,
  onChange,
  onAddCustomTag,
}) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5 font-sans">
      {/* 4 Category Comboboxes in a clean grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5">
        {tagGroups.map((group) => (
          <CategorySelectDropdown
            key={group.id}
            group={group}
            selectedTags={selectedTags}
            onChange={onChange}
            onAddCustomTag={onAddCustomTag}
          />
        ))}
      </div>

      {/* Selected tags badges row */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1 items-center pt-0.5">
          <span className="text-[10px] text-slate-500">{t('common.selected_label', '選択中:')}</span>
          {selectedTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-amber-300 border border-slate-700"
            >
              <span>#{tag}</span>
              <button
                type="button"
                onClick={() => onChange(selectedTags.filter((t) => t !== tag))}
                className="hover:text-rose-400 text-[10px] leading-none"
                title={t('common.remove', '解除')}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
