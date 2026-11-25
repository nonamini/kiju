import React, { Suspense, lazy, useEffect, useState } from 'react';
import {
  getFolderSyncOptions,
  readBackupFromSyncDirectory,
  writeBackupToSyncDirectory,
} from './utils/folderSyncBackup';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { HomePage } from './pages/HomePage';
import { AuthProvider } from './contexts/AuthContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';

const SingleScreenStudioPage = lazy(() =>
  import('./pages/SingleScreenStudioPage').then((m) => ({
    default: m.SingleScreenStudioPage,
  }))
);
const KifuLibraryPage = lazy(() =>
  import('./pages/KifuLibraryPage').then((m) => ({
    default: m.KifuLibraryPage,
  }))
);
const PlayersPage = lazy(() =>
  import('./pages/PlayersPage').then((m) => ({
    default: m.PlayersPage,
  }))
);
const RulebookPage = lazy(() =>
  import('./pages/RulebookPage').then((m) => ({
    default: m.RulebookPage,
  }))
);
const TacticsIndexPage = lazy(() =>
  import('./pages/TacticsIndexPage').then((m) => ({
    default: m.TacticsIndexPage,
  }))
);
const TacticsDetailPage = lazy(() =>
  import('./pages/TacticsDetailPage').then((m) => ({
    default: m.TacticsDetailPage,
  }))
);
const GuidePage = lazy(() =>
  import('./pages/GuidePage').then((m) => ({
    default: m.GuidePage,
  }))
);
const JosekiTreePage = lazy(() =>
  import('./pages/JosekiTreePage').then((m) => ({
    default: m.JosekiTreePage,
  }))
);
const SettingsModal = lazy(() =>
  import('./components/settings/SettingsModal').then((m) => ({
    default: m.SettingsModal,
  }))
);

// Dev-only routes excluded from production bundle
const DevAppLayout = lazy(() => import('./components/layout/AppLayout'));
const DevLegacyStudyPage = lazy(() => import('./pages/LegacyStudyPage'));
const DevMockPage = lazy(() => import('./mock/MockPage'));

const RouteFallback: React.FC = () => (
  <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
    <div className="w-8 h-8 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
  </div>
);

const LazySettingsHost: React.FC = () => {
  const { isSettingsOpen } = useSettings();
  if (!isSettingsOpen) return null;
  return (
    <Suspense fallback={null}>
      <SettingsModal />
    </Suspense>
  );
};

const AppShell: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const isStudioActive = location.pathname === '/studio';
  const [hasMountedStudio, setHasMountedStudio] = useState<boolean>(isStudioActive);

  useEffect(() => {
    if (isStudioActive && !hasMountedStudio) {
      setHasMountedStudio(true);
    }
  }, [isStudioActive, hasMountedStudio]);

  const shouldRenderStudio = hasMountedStudio || isStudioActive;

  return (
    <>
      <LazySettingsHost />
      {shouldRenderStudio && (
        <div className={isStudioActive ? undefined : 'hidden'}>
          <Suspense fallback={<RouteFallback />}>
            <SingleScreenStudioPage isRouteActive={isStudioActive} />
          </Suspense>
        </div>
      )}
      {!isStudioActive && (
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/library" element={<KifuLibraryPage />} />
            <Route path="/players" element={<PlayersPage />} />
            <Route path="/rulebook" element={<RulebookPage />} />
            <Route path="/tactics" element={<TacticsIndexPage />} />
            <Route path="/tactics/:id" element={<TacticsDetailPage />} />
            <Route path="/guide" element={<GuidePage />} />
            <Route path="/guide/:topic" element={<GuidePage />} />
            <Route path="/tree" element={<JosekiTreePage />} />
            {import.meta.env.DEV ? (
              <Route
                path="/*"
                element={
                  <DevAppLayout currentOpening={t('app.sample_opening')}>
                    <Routes>
                      <Route path="/legacy" element={<DevLegacyStudyPage />} />
                      <Route path="/mock" element={<DevMockPage />} />
                    </Routes>
                  </DevAppLayout>
                }
              />
            ) : (
              <Route path="*" element={<HomePage />} />
            )}
          </Routes>
        </Suspense>
      )}
      {!isStudioActive && <div className="h-14 md:hidden" aria-hidden="true" />}
      <MobileBottomNav />
    </>
  );
};

const routerBasename =
  import.meta.env.BASE_URL && import.meta.env.BASE_URL !== './'
    ? import.meta.env.BASE_URL.replace(/\/$/, '')
    : undefined;

export const App: React.FC = () => {
  React.useEffect(() => {
    const opts = getFolderSyncOptions();
    if (opts.autoSyncOnStartup) {
      void readBackupFromSyncDirectory().catch(() => {});
    }

    const handleHideOrExit = () => {
      if (getFolderSyncOptions().autoBackupOnExit) {
        void writeBackupToSyncDirectory().catch(() => {});
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleHideOrExit();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handleHideOrExit);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handleHideOrExit);
    };
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter basename={routerBasename}>
        <SettingsProvider>
          <AppShell />
        </SettingsProvider>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
