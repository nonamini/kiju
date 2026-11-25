import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  getRedirectResult,
  signOut as fbSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth, isFirebaseConfigured, subscribeFirebaseConfigChange } from '../services/firebase';
import { AuthContextValue, UserProfile } from '../types/auth';
import { syncKifuRecordsWithCloud } from '../services/firestoreKifuSync';

const AuthContext = createContext<AuthContextValue | null>(null);

const GUEST_STORAGE_KEY = 'joseki_tree_guest_mode';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [configVersion, setConfigVersion] = useState<number>(0);
  const isConfigured = useMemo(() => isFirebaseConfigured(), [configVersion]);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(() => isFirebaseConfigured());
  const [error, setError] = useState<string | null>(null);

  // Subscribe to dynamic Firebase configuration changes
  useEffect(() => {
    const unsubscribe = subscribeFirebaseConfigChange(() => {
      setConfigVersion((v) => v + 1);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isConfigured || !auth) {
      // Offline / Unconfigured fallback
      const savedGuest = localStorage.getItem(GUEST_STORAGE_KEY);
      if (savedGuest) {
        try {
          setUser(JSON.parse(savedGuest) as UserProfile);
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setIsLoading(false);
      return;
    }

    // Check if returning from redirect sign-in flow
    getRedirectResult(auth)
      .then((result) => {
        console.log('[Auth] getRedirectResult resolved:', result?.user ? `user=${result.user.uid}` : 'null');
        if (result?.user) {
          const fbUser = result.user;
          setUser({
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName,
            photoURL: fbUser.photoURL,
            isAnonymous: fbUser.isAnonymous,
          });
          setError(null);
        }
      })
      .catch((err: unknown) => {
        console.error('[Auth] Redirect result error:', err);
        const code = (err as { code?: string })?.code;
        setError(code ?? (err instanceof Error ? err.message : 'Redirect sign-in failed'));
      });

    console.log('[Auth] Subscribing onAuthStateChanged, crossOriginIsolated =', window.crossOriginIsolated);
    const unsubscribe = onAuthStateChanged(
      auth,
      (fbUser: FirebaseUser | null) => {
        console.log('[Auth] onAuthStateChanged fired:', fbUser ? `user=${fbUser.uid}` : 'null');
        if (fbUser) {
          const profile: UserProfile = {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName,
            photoURL: fbUser.photoURL,
            isAnonymous: fbUser.isAnonymous,
          };
          setUser(profile);
          setError(null);

          // Automatically sync local games with Firestore on sign-in (cooldown-guarded)
          syncKifuRecordsWithCloud(fbUser.uid, { mode: 'auto' })
            .then(({ pulled, pushed }) => {
              if (pulled > 0 || pushed > 0) {
                console.info(`[Auth] Firestore auto-sync completed: pulled ${pulled}, pushed ${pushed}`);
              }
            })
            .catch((err) => {
              console.warn('[Auth] Firestore auto-sync failed:', err);
            });
        } else {
          setUser(null);
        }
        setIsLoading(false);
      },
      (err) => {
        console.error('[Auth] State change error:', err);
        setError(err.message);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isConfigured]);

  const signInWithGoogle = async (): Promise<void> => {
    setError(null);
    if (!isConfigured || !auth) {
      // Local simulation for sandbox/development without Firebase credentials
      const dummyGuest: UserProfile = {
        uid: 'sandbox-local-user',
        email: 'sandbox@joseki-tree.local',
        displayName: 'Sandbox Player',
        photoURL: null,
        isAnonymous: false,
      };
      setUser(dummyGuest);
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(dummyGuest));
      return;
    }

    try {
      setIsLoading(true);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      // Under cross-origin isolation (COOP+COEP, required for SharedArrayBuffer),
      // COEP breaks the Firebase Auth iframe relay, so both popup and redirect
      // sign-in hang. Delegate to /login.html, which is served without isolation
      // headers and uses popup sign-in; the session persists via IndexedDB.
      if (typeof window !== 'undefined' && window.crossOriginIsolated) {
        const next = window.location.pathname + window.location.search + window.location.hash;
        window.location.assign(`/login.html?next=${encodeURIComponent(next)}`);
        return;
      }

      // First attempt popup sign-in
      const result = await signInWithPopup(auth, provider);
      const fbUser = result.user;
      const profile: UserProfile = {
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName,
        photoURL: fbUser.photoURL,
        isAnonymous: fbUser.isAnonymous,
      };
      setUser(profile);
    } catch (err: unknown) {
      const errCode = (err as { code?: string })?.code;
      if (errCode === 'auth/popup-closed-by-user' || errCode === 'auth/cancelled-popup-request') {
        return;
      }
      
      console.warn('[Auth] Popup failed, falling back to signInWithRedirect:', err);
      // Fallback to full-page redirect for browsers with strict COOP / extensions
      try {
        const { signInWithRedirect } = await import('firebase/auth');
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await signInWithRedirect(auth, provider);
      } catch (redirectErr: unknown) {
        const message = redirectErr instanceof Error ? redirectErr.message : 'Authentication failed';
        console.error('[Auth] Google redirect error:', redirectErr);
        setError(message);
        throw redirectErr;
      }
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogleRedirect = async (): Promise<void> => {
    setError(null);
    if (!isConfigured || !auth) {
      const dummyGuest: UserProfile = {
        uid: 'sandbox-local-user',
        email: 'sandbox@joseki-tree.local',
        displayName: 'Sandbox Player',
        photoURL: null,
        isAnonymous: false,
      };
      setUser(dummyGuest);
      localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(dummyGuest));
      return;
    }

    try {
      setIsLoading(true);
      // Under cross-origin isolation the Firebase Auth iframe relay is broken
      // by COEP; use the non-isolated /login.html page instead.
      if (typeof window !== 'undefined' && window.crossOriginIsolated) {
        const next = window.location.pathname + window.location.search + window.location.hash;
        window.location.assign(`/login.html?next=${encodeURIComponent(next)}`);
        return;
      }
      const { signInWithRedirect } = await import('firebase/auth');
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithRedirect(auth, provider);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      console.error('[Auth] Google redirect error:', err);
      setError(message);
      setIsLoading(false);
      throw err;
    }
  };

  const signOut = async (): Promise<void> => {
    setError(null);
    try {
      setIsLoading(true);
      if (auth && isConfigured) {
        await fbSignOut(auth);
      }
      localStorage.removeItem(GUEST_STORAGE_KEY);
      setUser(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign out failed';
      console.error('[Auth] Sign out error:', err);
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const continueAsGuest = (): void => {
    localStorage.removeItem(GUEST_STORAGE_KEY);
    setUser(null);
    setError(null);
  };

  const value: AuthContextValue = {
    user,
    isLoading,
    isConfigured,
    error,
    signInWithGoogle,
    signInWithGoogleRedirect,
    signOut,
    continueAsGuest,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
