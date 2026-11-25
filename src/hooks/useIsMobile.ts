import { useEffect, useState } from 'react';

export const DEFAULT_MOBILE_BREAKPOINT_PX = 768;

/**
 * Builds the CSS media query string matching viewports narrower than `breakpointPx`.
 */
export function getMobileMediaQuery(breakpointPx: number): string {
  return `(max-width: ${breakpointPx - 1}px)`;
}

function getMediaQueryList(breakpointPx: number): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return null;
  }
  return window.matchMedia(getMobileMediaQuery(breakpointPx));
}

/**
 * Reads the current mobile viewport match state in an SSR-safe manner.
 */
export function matchesMobileBreakpoint(
  breakpointPx: number = DEFAULT_MOBILE_BREAKPOINT_PX
): boolean {
  return getMediaQueryList(breakpointPx)?.matches ?? false;
}

/**
 * Subscribes to viewport media-query changes and returns an unsubscribe cleanup callback.
 */
export function subscribeMobileMediaQuery(
  breakpointPx: number,
  onChange: (matches: boolean) => void
): () => void {
  const mql = getMediaQueryList(breakpointPx);
  if (!mql) {
    return () => {};
  }

  const handleChange = (event: MediaQueryListEvent) => {
    onChange(event.matches);
  };

  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handleChange);
    return () => {
      mql.removeEventListener('change', handleChange);
    };
  }

  mql.addListener(handleChange);
  return () => {
    mql.removeListener(handleChange);
  };
}

/**
 * Reactive hook that returns true when viewport width is strictly below `breakpointPx`.
 */
export function useIsMobile(
  breakpointPx: number = DEFAULT_MOBILE_BREAKPOINT_PX
): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    matchesMobileBreakpoint(breakpointPx)
  );

  useEffect(() => {
    setIsMobile(matchesMobileBreakpoint(breakpointPx));
    return subscribeMobileMediaQuery(breakpointPx, setIsMobile);
  }, [breakpointPx]);

  return isMobile;
}
