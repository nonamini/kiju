/**
 * Standalone login page (/login.html).
 *
 * The main app runs cross-origin isolated (COOP+COEP) so the Wasm engine can use
 * SharedArrayBuffer, but COEP breaks the Firebase Auth iframe relay. This page
 * is served WITHOUT isolation headers so signInWithPopup works normally.
 * The resulting auth session persists in IndexedDB (same origin), so the main
 * app picks it up on the next load.
 */
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from './services/firebase';

const statusEl = document.getElementById('status') as HTMLElement;
const loginBtn = document.getElementById('loginBtn') as HTMLButtonElement;
const errorEl = document.getElementById('error') as HTMLElement;
const cancelLink = document.getElementById('cancelLink') as HTMLAnchorElement;

const params = new URLSearchParams(window.location.search);
const nextParam = params.get('next');
const target =
  nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
    ? nextParam
    : '/';
const rawTauriCallback = params.get('tauri_callback');
const tauriCallback =
  rawTauriCallback && /^http:\/\/127\.0\.0\.1:\d+\/callback$/.test(rawTauriCallback)
    ? rawTauriCallback
    : null;

if (cancelLink) {
  cancelLink.href = target;
}

const goBack = () => {
  window.location.replace(target);
};

if (!isFirebaseConfigured() || !auth) {
  statusEl.innerHTML = '⚠️ Firebase が設定されていません（オフライン環境）';
} else {
  onAuthStateChanged(auth, (user) => {
    if (user && !tauriCallback) {
      statusEl.innerHTML = '✨ ログイン完了！アプリへ移動中...';
      goBack();
      return;
    }
    statusEl.textContent = tauriCallback
      ? 'Googleアカウントで認証してデスクトップ版へ戻ります'
      : 'Googleアカウントで連携してクラウド同期を有効化';
    loginBtn.hidden = false;
  });

  loginBtn.addEventListener('click', async () => {
    if (!auth) return;
    errorEl.hidden = true;
    loginBtn.disabled = true;
    statusEl.innerHTML = '<span class="spinner"></span>Googleで認証中...';
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(auth, provider);
      if (tauriCallback) {
        const cred = GoogleAuthProvider.credentialFromResult(result);
        const idToken = cred?.idToken;
        if (!idToken) {
          throw new Error('Google IDトークンを取得できませんでした');
        }
        statusEl.innerHTML = '✨ 認証成功！デスクトップアプリへ戻ります...';
        window.location.replace(`${tauriCallback}?id_token=${encodeURIComponent(idToken)}`);
        return;
      }
      statusEl.innerHTML = '✨ 認証成功！アプリへ戻ります...';
      goBack();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        statusEl.textContent = 'Googleアカウントで連携してクラウド同期を有効化';
      } else {
        const message = err instanceof Error ? err.message : 'ログインに失敗しました';
        errorEl.textContent = message;
        errorEl.hidden = false;
        statusEl.textContent = 'ログインできませんでした。もう一度お試しください。';
      }
      loginBtn.disabled = false;
    }
  });
}
