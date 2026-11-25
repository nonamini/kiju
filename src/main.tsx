import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './locales/i18n';
import { initKifuRecordStorage } from './utils/kifuRecordStorage';
import { migrateLegacyKifuData } from './utils/kifuRecordMigration';
import { registerPwaServiceWorker } from './utils/pwaServiceWorker';
import './index.css';

async function bootstrap(): Promise<void> {
  // Hydrate large kifu records from IndexedDB (and migrate from localStorage)
  // before legacy migration and React mount so synchronous reads stay fast.
  await initKifuRecordStorage();

  // One-time migration of legacy kifu storages into unified KifuRecord.
  // Idempotent and safe to run on every boot.
  migrateLegacyKifuData();

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Failed to find root element');
  }

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

  void registerPwaServiceWorker();
}

void bootstrap();
