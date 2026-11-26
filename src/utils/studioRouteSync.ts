/**
 * Pure routing helpers for Keep-Alive synchronization of SingleScreenStudioPage.
 * Distinguishes between returning via history Back (preserve live Studio state)
 * and navigating to a new Studio intent (apply query parameters cleanly).
 */

export interface StudioRouteDecisionInput {
  isRouteActive: boolean;
  locationKey: string;
  lastStudioLocationKey: string | null;
  hasIntent: boolean;
}

export interface StudioRouteDecision {
  shouldApply: boolean;
  nextLastStudioLocationKey: string | null;
}

/**
 * Returns true if the URL search parameters carry an explicit Studio initialization
 * or navigation intent (e.g. opening a game, editing a position, starting quiz/tsumego).
 */
export function hasStudioNavigationIntent(searchParams: URLSearchParams): boolean {
  if (searchParams.get('new') === 'true') return true;
  if (searchParams.get('resume') === 'true') return true;
  if (searchParams.get('gameId')) return true;
  if (searchParams.get('tacticId')) return true;
  if (searchParams.get('editPosition')) return true;
  if (searchParams.get('sfen')) return true;
  if (searchParams.get('tsumegoId')) return true;
  if (searchParams.get('quizId')) return true;
  if (searchParams.get('editQuizId')) return true;
  if (searchParams.get('mode')) return true;
  if (searchParams.get('quiz') === 'true') return true;
  if (searchParams.get('tsumego') === 'true') return true;
  if (searchParams.get('library') === 'true') return true;
  if (searchParams.get('tree') === 'true') return true;
  return false;
}

/**
 * Evaluates whether the Studio page should apply URL query parameters upon route changes.
 * Returning to the same React Router location.key (e.g. via Back from Library)
 * does not re-apply params so live board, ply, branch, and edit state stays intact.
 */
export function evaluateStudioRouteSync(input: StudioRouteDecisionInput): StudioRouteDecision {
  if (!input.isRouteActive) {
    return {
      shouldApply: false,
      nextLastStudioLocationKey: input.lastStudioLocationKey,
    };
  }

  if (
    input.lastStudioLocationKey !== null &&
    input.locationKey === input.lastStudioLocationKey
  ) {
    return {
      shouldApply: false,
      nextLastStudioLocationKey: input.lastStudioLocationKey,
    };
  }

  return {
    shouldApply: input.hasIntent,
    nextLastStudioLocationKey: input.locationKey,
  };
}
