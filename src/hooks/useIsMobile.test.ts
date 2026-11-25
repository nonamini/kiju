import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getMobileMediaQuery,
  matchesMobileBreakpoint,
  subscribeMobileMediaQuery,
  useIsMobile,
} from './useIsMobile';

type ChangeListener = (event: MediaQueryListEvent) => void;

interface MockMediaQueryList {
  matches: boolean;
  media: string;
  listeners: Set<ChangeListener>;
  addEventListener: (type: string, listener: ChangeListener) => void;
  removeEventListener: (type: string, listener: ChangeListener) => void;
  dispatch: (nextMatches: boolean) => void;
}

function createMockMatchMedia(initialMatches: boolean) {
  let activeMql: MockMediaQueryList | null = null;
  let lastQuery = '';

  const matchMedia = (query: string): MockMediaQueryList => {
    lastQuery = query;
    const listeners = new Set<ChangeListener>();
    const mql: MockMediaQueryList = {
      matches: initialMatches,
      media: query,
      listeners,
      addEventListener: (type, listener) => {
        if (type === 'change') listeners.add(listener);
      },
      removeEventListener: (type, listener) => {
        if (type === 'change') listeners.delete(listener);
      },
      dispatch: (nextMatches) => {
        mql.matches = nextMatches;
        const event = { matches: nextMatches, media: query } as MediaQueryListEvent;
        for (const listener of listeners) {
          listener(event);
        }
      },
    };
    activeMql = mql;
    return mql;
  };

  return {
    matchMedia,
    getActiveMql: () => activeMql,
    getLastQuery: () => lastQuery,
  };
}

describe('useIsMobile', () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
    }
  });

  function stubWindowMatchMedia(matchMedia: (query: string) => unknown) {
    Object.defineProperty(globalThis, 'window', {
      value: { matchMedia },
      configurable: true,
      writable: true,
    });
  }

  it('returns false safely in SSR when window is undefined', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(matchesMobileBreakpoint()).toBe(false);
    const HookProbe: React.FC = () =>
      React.createElement('span', null, useIsMobile() ? 'mobile' : 'desktop');
    expect(renderToString(React.createElement(HookProbe))).toContain('desktop');
  });

  it('reads initial match state from window.matchMedia', () => {
    const mobileMock = createMockMatchMedia(true);
    stubWindowMatchMedia(mobileMock.matchMedia);

    expect(matchesMobileBreakpoint()).toBe(true);
    expect(mobileMock.getLastQuery()).toBe(getMobileMediaQuery(768));

    const HookProbe: React.FC<{ bp?: number }> = ({ bp }) =>
      React.createElement('span', null, useIsMobile(bp) ? 'mobile' : 'desktop');
    expect(renderToString(React.createElement(HookProbe))).toContain('mobile');

    const desktopMock = createMockMatchMedia(false);
    stubWindowMatchMedia(desktopMock.matchMedia);
    expect(matchesMobileBreakpoint(1024)).toBe(false);
    expect(desktopMock.getLastQuery()).toBe('(max-width: 1023px)');
    expect(renderToString(React.createElement(HookProbe, { bp: 1024 }))).toContain(
      'desktop'
    );
  });

  it('notifies subscribers on media-query change and cleans up listener', () => {
    const mock = createMockMatchMedia(false);
    stubWindowMatchMedia(mock.matchMedia);

    const observed: boolean[] = [];
    const unsubscribe = subscribeMobileMediaQuery(768, (matches) => {
      observed.push(matches);
    });

    const mql = mock.getActiveMql();
    expect(mql).not.toBeNull();
    expect(mql!.listeners.size).toBe(1);

    mql!.dispatch(true);
    mql!.dispatch(false);
    expect(observed).toEqual([true, false]);

    unsubscribe();
    expect(mql!.listeners.size).toBe(0);
    mql!.dispatch(true);
    expect(observed).toEqual([true, false]);
  });

  it('falls back to legacy addListener and removeListener when addEventListener is absent', () => {
    const listeners = new Set<ChangeListener>();
    const mql = {
      matches: true,
      media: '(max-width: 767px)',
      addListener: (listener: ChangeListener) => {
        listeners.add(listener);
      },
      removeListener: (listener: ChangeListener) => {
        listeners.delete(listener);
      },
    };
    stubWindowMatchMedia(() => mql);

    const observed: boolean[] = [];
    const unsubscribe = subscribeMobileMediaQuery(768, (matches) => {
      observed.push(matches);
    });
    expect(listeners.size).toBe(1);

    for (const listener of listeners) {
      listener({ matches: false, media: mql.media } as MediaQueryListEvent);
    }
    expect(observed).toEqual([false]);

    unsubscribe();
    expect(listeners.size).toBe(0);
  });
});
