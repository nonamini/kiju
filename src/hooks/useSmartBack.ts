/**
 * Navigation helper hook that returns to the previous in-app route when
 * React Router history has an entry behind the current location, falling back
 * to a specified route (e.g., Home '/') when opened directly in a new tab.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Checks whether React Router has in-app history prior to the active entry.
 */
export function canNavigateBackInApp(): boolean {
  if (typeof window === 'undefined' || !window.history) return false;
  const state = window.history.state as { idx?: unknown } | null;
  return typeof state?.idx === 'number' && state.idx > 0;
}

/**
 * Returns a callback that navigates back to the calling screen when in-app
 * history exists, otherwise navigates to `fallbackPath`.
 */
export function useSmartBack(fallbackPath = '/'): () => void {
  const navigate = useNavigate();

  return useCallback(() => {
    if (canNavigateBackInApp()) {
      navigate(-1);
      return;
    }
    navigate(fallbackPath);
  }, [navigate, fallbackPath]);
}
