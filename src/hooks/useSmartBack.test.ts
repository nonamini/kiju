import { afterEach, describe, expect, it } from 'vitest';
import { canNavigateBackInApp } from './useSmartBack';

describe('canNavigateBackInApp', () => {
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

  function stubHistoryState(state: unknown) {
    Object.defineProperty(globalThis, 'window', {
      value: { history: { state } },
      configurable: true,
      writable: true,
    });
  }

  it('returns true when React Router history idx is greater than 0', () => {
    stubHistoryState({ idx: 2, key: 'abc' });
    expect(canNavigateBackInApp()).toBe(true);
  });

  it('returns false on initial entry (idx === 0)', () => {
    stubHistoryState({ idx: 0, key: 'root' });
    expect(canNavigateBackInApp()).toBe(false);
  });

  it('returns false when history state is null or missing idx', () => {
    stubHistoryState(null);
    expect(canNavigateBackInApp()).toBe(false);

    stubHistoryState({ foo: 'bar' });
    expect(canNavigateBackInApp()).toBe(false);
  });
});
