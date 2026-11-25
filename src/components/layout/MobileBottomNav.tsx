import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSettings } from '../../contexts/SettingsContext';

interface MobileNavItem {
  id: string;
  icon: string;
  labelKey: string;
  shortLabelKey: string;
  isActive: boolean;
  onSelect: () => void;
}

/**
 * Fixed bottom navigation bar with icons and short labels on mobile (`< 768px`).
 */
export const MobileBottomNav: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { isSettingsOpen, openSettings } = useSettings();

  const isImportIntent =
    location.pathname === '/studio' &&
    new URLSearchParams(location.search).get('modal') === 'import';

  const items: MobileNavItem[] = [
    {
      id: 'home',
      icon: '🏠',
      labelKey: 'mobile_nav.home',
      shortLabelKey: 'mobile_nav.home_short',
      isActive: location.pathname === '/',
      onSelect: () => navigate('/'),
    },
    {
      id: 'studio',
      icon: '♟️',
      labelKey: 'mobile_nav.studio',
      shortLabelKey: 'mobile_nav.studio_short',
      isActive: location.pathname === '/studio' && !isImportIntent,
      onSelect: () => navigate('/studio'),
    },
    {
      id: 'library',
      icon: '📚',
      labelKey: 'mobile_nav.library',
      shortLabelKey: 'mobile_nav.library_short',
      isActive: location.pathname === '/library',
      onSelect: () => navigate('/library'),
    },
    {
      id: 'tactics',
      icon: '📖',
      labelKey: 'mobile_nav.tactics',
      shortLabelKey: 'mobile_nav.tactics_short',
      isActive:
        location.pathname === '/tactics' || location.pathname.startsWith('/tactics/'),
      onSelect: () => navigate('/tactics'),
    },
    {
      id: 'quick_import',
      icon: '📥',
      labelKey: 'mobile_nav.quick_import',
      shortLabelKey: 'mobile_nav.quick_import_short',
      isActive: isImportIntent,
      onSelect: () => navigate('/studio?modal=import'),
    },
    {
      id: 'settings',
      icon: '⚙️',
      labelKey: 'mobile_nav.settings',
      shortLabelKey: 'mobile_nav.settings_short',
      isActive: isSettingsOpen,
      onSelect: openSettings,
    },
  ];

  return (
    <nav
      aria-label={t('mobile_nav.aria_label')}
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur border-t border-slate-800"
    >
      <div className="flex h-14 items-center justify-around px-1">
        {items.map((item) => {
          const label = t(item.labelKey);
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onSelect}
              aria-label={label}
              aria-current={item.isActive ? 'page' : undefined}
              title={label}
              className={`flex h-12 min-w-[3rem] flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 transition active:scale-95 ${
                item.isActive
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
              }`}
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {item.icon}
              </span>
              <span className="text-[10px] leading-none whitespace-nowrap font-medium">
                {t(item.shortLabelKey)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomNav;
