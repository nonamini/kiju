import { describe, expect, it } from 'vitest';
import {
  evaluateStudioRouteSync,
  hasStudioNavigationIntent,
} from './studioRouteSync';

describe('hasStudioNavigationIntent', () => {
  it('returns false for empty or unrelated query params', () => {
    expect(hasStudioNavigationIntent(new URLSearchParams(''))).toBe(false);
    expect(hasStudioNavigationIntent(new URLSearchParams('foo=bar&tab=import'))).toBe(false);
    expect(hasStudioNavigationIntent(new URLSearchParams('new=false&resume=0'))).toBe(false);
  });

  it('returns true for each supported Studio intent parameter', () => {
    const intentQueries = [
      'new=true',
      'resume=true',
      'gameId=game-1',
      'tacticId=tac-1',
      'editPosition=new',
      'editPosition=1',
      'sfen=lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL%20b%20-%201',
      'tsumegoId=tsu-1',
      'quizId=q-1',
      'mode=match',
      'quiz=true',
      'tsumego=true',
      'library=true',
      'tree=true',
    ];

    for (const query of intentQueries) {
      expect(hasStudioNavigationIntent(new URLSearchParams(query))).toBe(true);
    }
  });
});

describe('evaluateStudioRouteSync', () => {
  it('does not apply and preserves lastStudioLocationKey when route is inactive', () => {
    expect(
      evaluateStudioRouteSync({
        isRouteActive: false,
        locationKey: 'key-2',
        lastStudioLocationKey: 'key-1',
        hasIntent: true,
      })
    ).toEqual({
      shouldApply: false,
      nextLastStudioLocationKey: 'key-1',
    });
  });

  it('handles first visit with and without intent', () => {
    expect(
      evaluateStudioRouteSync({
        isRouteActive: true,
        locationKey: 'init-key',
        lastStudioLocationKey: null,
        hasIntent: true,
      })
    ).toEqual({
      shouldApply: true,
      nextLastStudioLocationKey: 'init-key',
    });

    expect(
      evaluateStudioRouteSync({
        isRouteActive: true,
        locationKey: 'plain-key',
        lastStudioLocationKey: null,
        hasIntent: false,
      })
    ).toEqual({
      shouldApply: false,
      nextLastStudioLocationKey: 'plain-key',
    });
  });

  it('preserves live state when returning via Back to the exact same locationKey', () => {
    expect(
      evaluateStudioRouteSync({
        isRouteActive: true,
        locationKey: 'studio-key-1',
        lastStudioLocationKey: 'studio-key-1',
        hasIntent: true,
      })
    ).toEqual({
      shouldApply: false,
      nextLastStudioLocationKey: 'studio-key-1',
    });
  });

  it('applies params when pushing a new Studio route with intent', () => {
    expect(
      evaluateStudioRouteSync({
        isRouteActive: true,
        locationKey: 'studio-key-2',
        lastStudioLocationKey: 'studio-key-1',
        hasIntent: true,
      })
    ).toEqual({
      shouldApply: true,
      nextLastStudioLocationKey: 'studio-key-2',
    });
  });

  it('preserves live state when pushing plain /studio without intent', () => {
    expect(
      evaluateStudioRouteSync({
        isRouteActive: true,
        locationKey: 'studio-plain-2',
        lastStudioLocationKey: 'studio-key-1',
        hasIntent: false,
      })
    ).toEqual({
      shouldApply: false,
      nextLastStudioLocationKey: 'studio-plain-2',
    });
  });

  it('applies params when navigating Back to an earlier different Studio entry with intent', () => {
    expect(
      evaluateStudioRouteSync({
        isRouteActive: true,
        locationKey: 'studio-key-0',
        lastStudioLocationKey: 'studio-key-2',
        hasIntent: true,
      })
    ).toEqual({
      shouldApply: true,
      nextLastStudioLocationKey: 'studio-key-0',
    });
  });
});
