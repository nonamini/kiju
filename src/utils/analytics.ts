/**
 * Privacy-respecting Umami analytics helper (cookieless, production GitHub Pages only).
 * Tracks only anonymous feature usage types and aggregate counts — NEVER kifu content,
 * player names, filenames, or personal identifiers.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

export type AnalyticsEventName =
  | 'kifu_import'
  | 'ai_match_start'
  | 'ai_analysis_run'
  | 'quiz_answer'
  | 'tsumego_solve'
  | 'trace_complete'
  | 'tree_open';

export type AnalyticsPayload = Record<string, string | number | boolean>;

interface UmamiTracker {
  track: (eventName: string, data?: AnalyticsPayload) => void;
}

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

const ALLOWED_ANALYTICS_HOST = 'nonamini.github.io';

/**
 * Converts an exact count into a coarse privacy-preserving bucket label.
 */
export function toCountBucket(count: number): string {
  if (count <= 0) return '0';
  if (count <= 10) return '1-10';
  if (count <= 50) return '11-50';
  if (count <= 200) return '51-200';
  return '201+';
}

/**
 * Emits a custom event to Umami only on the public GitHub Pages host.
 * Silently no-ops on localhost, desktop builds, offline mode, or ad-blocked browsers.
 */
export function trackEvent(
  eventName: AnalyticsEventName,
  data?: AnalyticsPayload
): void {
  try {
    if (typeof window === 'undefined') return;
    if (window.location.hostname !== ALLOWED_ANALYTICS_HOST) return;
    const tracker = window.umami;
    if (!tracker || typeof tracker.track !== 'function') return;
    if (data) {
      tracker.track(eventName, data);
    } else {
      tracker.track(eventName);
    }
  } catch {
    // Ignore analytics failures to never disrupt app behavior.
  }
}
