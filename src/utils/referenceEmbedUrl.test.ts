import { describe, expect, it } from 'vitest';
import {
  parseYoutubeTimestampSeconds,
  toEmbeddableReferenceUrl,
} from './referenceEmbedUrl';

describe('referenceEmbedUrl', () => {
  it('parses YouTube timestamp formats into seconds', () => {
    expect(parseYoutubeTimestampSeconds('90')).toBe(90);
    expect(parseYoutubeTimestampSeconds('90s')).toBe(90);
    expect(parseYoutubeTimestampSeconds('2m30s')).toBe(150);
    expect(parseYoutubeTimestampSeconds('1h2m3s')).toBe(3723);
    expect(parseYoutubeTimestampSeconds('invalid')).toBeNull();
    expect(parseYoutubeTimestampSeconds(null)).toBeNull();
  });

  it('converts watch, short, shorts, live, and playlist YouTube URLs to youtube-nocookie embeds', () => {
    expect(toEmbeddableReferenceUrl('https://www.youtube.com/watch?v=KQVNG7y-IZg')).toBe(
      'https://www.youtube-nocookie.com/embed/KQVNG7y-IZg'
    );
    expect(toEmbeddableReferenceUrl('https://youtu.be/KQVNG7y-IZg?t=1m30s')).toBe(
      'https://www.youtube-nocookie.com/embed/KQVNG7y-IZg?start=90'
    );
    expect(toEmbeddableReferenceUrl('https://www.youtube.com/shorts/abc123XYZ')).toBe(
      'https://www.youtube-nocookie.com/embed/abc123XYZ'
    );
    expect(toEmbeddableReferenceUrl('https://m.youtube.com/live/live9876')).toBe(
      'https://www.youtube-nocookie.com/embed/live9876'
    );
    expect(
      toEmbeddableReferenceUrl('https://www.youtube.com/playlist?list=PLxyz123')
    ).toBe('https://www.youtube-nocookie.com/embed/videoseries?list=PLxyz123');
    expect(
      toEmbeddableReferenceUrl(
        'https://www.youtube.com/watch?v=KQVNG7y-IZg&list=PLxyz123&t=45s'
      )
    ).toBe(
      'https://www.youtube-nocookie.com/embed/KQVNG7y-IZg?list=PLxyz123&start=45'
    );
    expect(
      toEmbeddableReferenceUrl(
        'https://www.youtube-nocookie.com/embed/KQVNG7y-IZg?start=12'
      )
    ).toBe('https://www.youtube-nocookie.com/embed/KQVNG7y-IZg?start=12');
  });

  it('leaves non-YouTube, unsupported channel URLs, and invalid URLs unchanged', () => {
    expect(toEmbeddableReferenceUrl('https://shogidb2.com/games/123')).toBe(
      'https://shogidb2.com/games/123'
    );
    expect(toEmbeddableReferenceUrl('https://www.youtube.com/@example')).toBe(
      'https://www.youtube.com/@example'
    );
    expect(toEmbeddableReferenceUrl('not a url')).toBe('not a url');
  });
});
