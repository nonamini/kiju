/**
 * Utilities for transforming supported reference URLs (such as YouTube links)
 * into embeddable iframe URLs inside the Split-Screen Study Reference Pane.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict without any (Rule 2).
 */

const YOUTUBE_SHORT_HOSTS = new Set(['youtu.be', 'www.youtu.be']);
const YOUTUBE_WEB_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

/**
 * Parses YouTube timestamp query strings such as "90", "90s", "2m30s", or "1h2m3s"
 * into total seconds, or null if not valid.
 */
export function parseYoutubeTimestampSeconds(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^\d+s?$/i.test(trimmed)) {
    const seconds = Number.parseInt(trimmed.replace(/s$/i, ''), 10);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }

  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(trimmed);
  if (!match || (!match[1] && !match[2] && !match[3])) {
    return null;
  }

  const hours = match[1] ? Number.parseInt(match[1], 10) : 0;
  const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
  const seconds = match[3] ? Number.parseInt(match[3], 10) : 0;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Converts YouTube watch/short/live/shorts/playlist URLs to standard
 * youtube.com/embed/... URLs. Non-YouTube or unsupported URLs are returned unchanged.
 */
export function toEmbeddableReferenceUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return rawUrl;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return rawUrl;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return rawUrl;
  }

  const host = parsed.hostname.toLowerCase();
  const segments = parsed.pathname.split('/').filter(Boolean);

  let videoId: string | null = null;
  let playlistOnlyId: string | null = null;

  if (YOUTUBE_SHORT_HOSTS.has(host)) {
    if (segments[0]) {
      videoId = segments[0];
    }
  } else if (YOUTUBE_WEB_HOSTS.has(host)) {
    const first = segments[0]?.toLowerCase() ?? '';
    if (first === 'watch') {
      videoId = parsed.searchParams.get('v')?.trim() || null;
    } else if (
      (first === 'shorts' || first === 'live' || first === 'embed') &&
      segments[1]
    ) {
      if (first === 'embed' && segments[1].toLowerCase() === 'videoseries') {
        playlistOnlyId = parsed.searchParams.get('list')?.trim() || null;
      } else {
        videoId = segments[1];
      }
    } else if (first === 'playlist') {
      playlistOnlyId = parsed.searchParams.get('list')?.trim() || null;
    }
  } else {
    return rawUrl;
  }

  if (!videoId && !playlistOnlyId) {
    return rawUrl;
  }

  const embedPath = videoId ? `/embed/${encodeURIComponent(videoId)}` : '/embed/videoseries';
  const embedUrl = new URL(`https://www.youtube.com${embedPath}`);

  const listId = parsed.searchParams.get('list')?.trim();
  if (listId) {
    embedUrl.searchParams.set('list', listId);
  } else if (playlistOnlyId) {
    embedUrl.searchParams.set('list', playlistOnlyId);
  }

  const startSeconds =
    parseYoutubeTimestampSeconds(parsed.searchParams.get('start')) ??
    parseYoutubeTimestampSeconds(parsed.searchParams.get('t'));
  if (startSeconds !== null && videoId) {
    embedUrl.searchParams.set('start', String(startSeconds));
  }

  return embedUrl.toString();
}
