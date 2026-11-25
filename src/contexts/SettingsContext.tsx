/**
 * SettingsContext — app-wide access to AppSettings and the settings modal.
 * Issue #45 foundation: provides settings state, partial updates, and
 * modal open/close control shared by Header and the studio top bar.
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  AppSettings,
  loadAppSettings,
  saveAppSettings,
} from '../utils/appSettingsStorage';

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveAppSettings(next);
      return next;
    });
  }, []);

  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, updateSettings, isSettingsOpen, openSettings, closeSettings }),
    [settings, updateSettings, isSettingsOpen, openSettings, closeSettings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return ctx;
}
