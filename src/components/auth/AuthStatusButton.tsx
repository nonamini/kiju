import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';

export const AuthStatusButton: React.FC = () => {
  const { t } = useTranslation();
  const { user, isLoading, isConfigured, signInWithGoogle, signOut } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isDropdownOpen]);

  const handleSignIn = async () => {
    try {
      setIsSigningIn(true);
      await signInWithGoogle();
    } catch {
      // Error handled inside AuthContext
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsDropdownOpen(false);
    } catch {
      // Error handled inside AuthContext
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 rounded border border-shogi-border bg-shogi-card px-2.5 py-1 text-xs text-slate-400">
        <span className="h-2 w-2 rounded-full bg-slate-500 animate-ping" />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  if (user) {
    const initial = (user.displayName || user.email || 'U').charAt(0).toUpperCase();

    return (
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsDropdownOpen((prev) => !prev)}
          className="flex items-center gap-2 rounded-full border border-amber-500/40 bg-shogi-card py-0.5 pl-1 pr-2.5 text-xs text-slate-200 hover:border-amber-400 hover:bg-slate-800 transition"
          aria-expanded={isDropdownOpen}
          aria-label={t('auth.user_profile')}
        >
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'User'}
              className="h-6 w-6 rounded-full object-cover border border-amber-500/60"
            />
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-600 text-[11px] font-bold text-slate-950">
              {initial}
            </div>
          )}
          <span className="max-w-[100px] truncate text-slate-200 sm:max-w-[140px] font-medium">
            {user.displayName || t('auth.anonymous_user')}
          </span>
          <span className={`text-[9px] text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>

        {isDropdownOpen && (
          <div className="absolute right-0 mt-1.5 w-64 origin-top-right rounded-lg border border-shogi-border bg-shogi-panel p-3 shadow-xl ring-1 ring-black/50 z-50">
            {/* User Details */}
            <div className="mb-2 pb-2 border-b border-slate-700/60">
              <div className="text-xs font-semibold text-white truncate">
                {user.displayName || t('auth.anonymous_user')}
              </div>
              {user.email && (
                <div className="text-[11px] text-slate-400 truncate">{user.email}</div>
              )}
              <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                <span>{t('auth.uid_label')}:</span>
                <span className="truncate">{user.uid.slice(0, 10)}...</span>
              </div>
            </div>

            {/* Cloud Status */}
            <div className="mb-3 rounded bg-emerald-950/40 border border-emerald-800/40 px-2 py-1.5 text-[10px] text-emerald-300 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>{isConfigured ? 'Firebase Cloud Sync' : t('auth.not_configured')}</span>
            </div>

            {/* Actions */}
            <div className="space-y-1">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-1.5 rounded bg-slate-800 hover:bg-rose-950/60 hover:text-rose-300 text-slate-300 py-1.5 text-xs font-medium transition border border-slate-700/60 hover:border-rose-800/60"
              >
                <span>🚪</span>
                <span>{t('auth.sign_out')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Not logged in / Guest
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        disabled={isSigningIn}
        onClick={handleSignIn}
        className="flex items-center gap-1.5 rounded border border-shogi-border bg-shogi-card px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-amber-500/70 hover:text-white hover:bg-slate-800 transition disabled:opacity-50 shadow-sm"
        title={isConfigured ? t('auth.login_prompt') : t('auth.not_configured_desc')}
      >
        {/* Google G Logo SVG */}
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>{isSigningIn ? t('auth.signing_in') : t('auth.sign_in_with_google')}</span>
      </button>
    </div>
  );
};
