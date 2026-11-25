/**
 * React hook for managing tactical quiz pool state with persistence.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { useCallback, useState } from 'react';
import { TacticalQuizCard } from '../types/quiz';
import {
  loadQuizPool,
  mergeQuizCards,
  saveQuizPool,
  setQuizEnabled,
} from '../utils/quizPoolStorage';

export interface UseQuizPoolReturn {
  cards: TacticalQuizCard[];
  addGenerated: (fresh: TacticalQuizCard[]) => void;
  toggle: (id: string, enabled: boolean) => void;
  bulkToggle: (ids: string[], enabled: boolean) => void;
}

export function useQuizPool(): UseQuizPoolReturn {
  const [cards, setCards] = useState<TacticalQuizCard[]>(() => loadQuizPool());

  const addGenerated = useCallback((fresh: TacticalQuizCard[]) => {
    setCards((prev) => {
      const merged = mergeQuizCards(prev, fresh);
      saveQuizPool(merged);
      return merged;
    });
  }, []);

  const toggle = useCallback((id: string, enabled: boolean) => {
    setCards((prev) => {
      const updated = setQuizEnabled(prev, [id], enabled);
      saveQuizPool(updated);
      return updated;
    });
  }, []);

  const bulkToggle = useCallback((ids: string[], enabled: boolean) => {
    setCards((prev) => {
      const updated = setQuizEnabled(prev, ids, enabled);
      saveQuizPool(updated);
      return updated;
    });
  }, []);

  return {
    cards,
    addGenerated,
    toggle,
    bulkToggle,
  };
}
