import { beforeEach, describe, expect, it } from 'vitest';
import {
  consumeStudioToTreeHandoff,
  saveStudioToTreeHandoff,
} from './studioTreeHandoff';

describe('studioTreeHandoff', () => {
  beforeEach(() => {
    consumeStudioToTreeHandoff();
  });

  it('saves and consumes a handoff payload once', () => {
    saveStudioToTreeHandoff({
      gameId: 'g-1',
      ply: 14,
      sfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
      createdAt: '2026-11-15T00:00:00.000Z',
    });

    const first = consumeStudioToTreeHandoff();
    expect(first).not.toBeNull();
    expect(first?.gameId).toBe('g-1');
    expect(first?.ply).toBe(14);
    expect(first?.sfen).toContain('lnsgkgsnl');

    // Second read returns null because it was consumed
    expect(consumeStudioToTreeHandoff()).toBeNull();
  });

  it('returns null when no handoff is pending', () => {
    expect(consumeStudioToTreeHandoff()).toBeNull();
  });
});
