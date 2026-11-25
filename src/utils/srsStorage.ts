/**
 * SRS Card Extraction and Local Storage Repository.
 * Extracts active recall cards from repertoire trees, syncs card state,
 * and manages persistence and due date filtering for daily reviews.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { Color, ShogiMove } from '../types/shogi';
import { SRSReviewCard } from '../types/srs';
import { KifuTreeNode, MergedKifuTree } from '../types/tree';
import { ShogiBoard } from './shogiBoard';
import {
  DEFAULT_EASE_FACTOR,
  formatIsoDateOnly,
  getCardMaturity,
  isCardDue,
} from './sm2Scheduler';

const SRS_STORAGE_PREFIX = 'joseki_tree_srs_cards_';

// In-memory fallback for environments without window.localStorage (e.g., Node/Vitest)
const memoryStorage = new Map<string, string>();

function getSafeStorage(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
} {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryStorage.set(key, value);
    },
    removeItem: (key: string) => {
      memoryStorage.delete(key);
    },
    clear: () => {
      memoryStorage.clear();
    },
  };
}

export interface SrsProgressSummary {
  totalCount: number;
  dueCount: number;
  newCount: number;
  learningCount: number;
  reviewCount: number;
  masteredCount: number;
  overdueCount: number;
  totalAttempts: number;
  totalMistakes: number;
  accuracyRatePct: number;
}

/**
 * Generates storage key for a user (defaults to 'guest').
 */
export function getSrsStorageKey(userId: string = 'guest'): string {
  return `${SRS_STORAGE_PREFIX}${userId}`;
}

/**
 * Clears SRS cards from storage for testing or reset.
 */
export function clearAllSrsCards(userId: string = 'guest'): void {
  const storage = getSafeStorage();
  storage.removeItem(getSrsStorageKey(userId));
}

/**
 * Loads SRSReviewCard collection from browser LocalStorage or memory fallback.
 */
export function loadSrsCards(userId: string = 'guest'): SRSReviewCard[] {
  try {
    const storage = getSafeStorage();
    const raw = storage.getItem(getSrsStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Failed to load SRS cards from storage:', err);
    return [];
  }
}

/**
 * Saves SRSReviewCard collection to browser LocalStorage or memory fallback.
 */
export function saveSrsCards(cards: SRSReviewCard[], userId: string = 'guest'): void {
  try {
    const storage = getSafeStorage();
    storage.setItem(getSrsStorageKey(userId), JSON.stringify(cards));
  } catch (err) {
    console.warn('Failed to save SRS cards to storage:', err);
  }
}

/**
 * Extracts and traverses all candidate drill positions from a MergedKifuTree.
 * Merges existing SM-2 parameters for already-learned cards.
 */
export function extractSrsCardsFromTree(options: {
  tree: MergedKifuTree | null;
  targetSide?: Color | 'both';
  openingId?: string;
  userId?: string;
  existingCards?: SRSReviewCard[];
  baseDate?: Date;
}): SRSReviewCard[] {
  const {
    tree,
    targetSide = 'both',
    openingId = 'general',
    userId = 'guest',
    existingCards = [],
    baseDate = new Date(),
  } = options;

  if (!tree || !tree.rootNodes || tree.rootNodes.length === 0) {
    return existingCards;
  }

  const existingMap = new Map<string, SRSReviewCard>();
  for (const card of existingCards) {
    existingMap.set(card.id, card);
    // Also index by sfen for cross-matching
    if (card.sfen) {
      existingMap.set(`${card.openingId}_${card.sfen}`, card);
    }
  }

  const extractedCards: SRSReviewCard[] = [];
  const visitedPositions = new Set<string>();

  function traverse(
    node: KifuTreeNode,
    board: ShogiBoard,
    currentPath: KifuTreeNode[]
  ) {
    const nextBoard = board.clone();
    nextBoard.applyMove(node.move);
    const newPath = [...currentPath, node];

    const turn = nextBoard.getTurn(); // Turn at this new position
    const isPlayerTurn =
      targetSide === 'both' || targetSide === turn;

    // If it's the player's turn to answer next and there are expected responses
    if (isPlayerTurn && node.children.length > 0) {
      const positionSfen = nextBoard.toSfen();
      const positionKey = `${openingId}_${turn}_${positionSfen}`;

      if (!visitedPositions.has(positionKey)) {
        visitedPositions.add(positionKey);

        const primaryChild =
          node.children.find((c) => c.isMainline) ?? node.children[0];
        if (primaryChild) {
          const alternativeMoves: ShogiMove[] = node.children
            .filter((c) => c !== primaryChild)
            .map((c) => c.move);

          const cardId = `${openingId}_${turn}_ply${node.move.ply + 1}_${primaryChild.move.sfenMove}`;
          const existing =
            existingMap.get(cardId) || existingMap.get(`${openingId}_${positionSfen}`);

          if (existing) {
            // Preserve learned SM-2 parameters
            extractedCards.push({
              ...existing,
              correctMove: primaryChild.move,
              alternativeMoves,
              sfen: positionSfen,
            });
          } else {
            // Brand new card scheduled for immediate first review
            extractedCards.push({
              id: cardId,
              userId,
              openingId,
              sfen: positionSfen,
              correctMove: primaryChild.move,
              alternativeMoves,
              intervalDays: 1,
              repetitionCount: 0,
              easeFactor: DEFAULT_EASE_FACTOR,
              dueDate: formatIsoDateOnly(baseDate),
              totalAttempts: 0,
              mistakes: 0,
              hintsUsedCount: 0,
            });
          }
        }
      }
    }

    // Recurse down children
    for (const child of node.children) {
      traverse(child, nextBoard, newPath);
    }
  }

  // Handle move 1 root nodes (initial position)
  const initialBoard = new ShogiBoard();
  const initialTurn = initialBoard.getTurn();
  const isInitialPlayerTurn = targetSide === 'both' || targetSide === initialTurn;

  if (isInitialPlayerTurn && tree.rootNodes.length > 0) {
    const initialSfen = initialBoard.toSfen();
    const positionKey = `${openingId}_${initialTurn}_${initialSfen}`;
    visitedPositions.add(positionKey);

    const primaryRoot =
      tree.rootNodes.find((n) => n.isMainline) ?? tree.rootNodes[0];
    if (primaryRoot) {
      const alternativeMoves = tree.rootNodes
        .filter((n) => n !== primaryRoot)
        .map((n) => n.move);

      const cardId = `${openingId}_${initialTurn}_ply1_${primaryRoot.move.sfenMove}`;
      const existing =
        existingMap.get(cardId) || existingMap.get(`${openingId}_${initialSfen}`);

      if (existing) {
        extractedCards.push({
          ...existing,
          correctMove: primaryRoot.move,
          alternativeMoves,
          sfen: initialSfen,
        });
      } else {
        extractedCards.push({
          id: cardId,
          userId,
          openingId,
          sfen: initialSfen,
          correctMove: primaryRoot.move,
          alternativeMoves,
          intervalDays: 1,
          repetitionCount: 0,
          easeFactor: DEFAULT_EASE_FACTOR,
          dueDate: formatIsoDateOnly(baseDate),
          totalAttempts: 0,
          mistakes: 0,
          hintsUsedCount: 0,
        });
      }
    }
  }

  // Traverse tree branches
  for (const root of tree.rootNodes) {
    traverse(root, initialBoard, []);
  }

  return extractedCards;
}

/**
 * Returns all cards due for review today or earlier.
 * Prioritizes overdue cards, then cards with highest mistake rates.
 */
export function getDueCards(
  cards: SRSReviewCard[],
  targetDate: Date = new Date()
): SRSReviewCard[] {
  const targetDateStr = formatIsoDateOnly(targetDate);
  const due = cards.filter((c) => isCardDue(c, targetDate));

  // Sort due cards: overdue first, then lowest repetition count, then highest mistake count
  return due.sort((a, b) => {
    const aDate = a.dueDate || targetDateStr;
    const bDate = b.dueDate || targetDateStr;
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    if (a.repetitionCount !== b.repetitionCount) return a.repetitionCount - b.repetitionCount;
    return (b.mistakes || 0) - (a.mistakes || 0);
  });
}

/**
 * Computes statistical summary across an SRS card collection.
 */
export function calculateSrsSummary(
  cards: SRSReviewCard[],
  targetDate: Date = new Date()
): SrsProgressSummary {
  const targetDateStr = formatIsoDateOnly(targetDate);

  let dueCount = 0;
  let newCount = 0;
  let learningCount = 0;
  let reviewCount = 0;
  let masteredCount = 0;
  let overdueCount = 0;
  let totalAttempts = 0;
  let totalMistakes = 0;

  for (const card of cards) {
    if (isCardDue(card, targetDate)) {
      dueCount++;
      if (card.dueDate && card.dueDate < targetDateStr) {
        overdueCount++;
      }
    }

    const maturity = getCardMaturity(card);
    if (maturity === 'new') newCount++;
    else if (maturity === 'learning') learningCount++;
    else if (maturity === 'review') reviewCount++;
    else if (maturity === 'mastered') masteredCount++;

    totalAttempts += card.totalAttempts || 0;
    totalMistakes += card.mistakes || 0;
  }

  const correctAttempts = Math.max(0, totalAttempts - totalMistakes);
  const accuracyRatePct =
    totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 100;

  return {
    totalCount: cards.length,
    dueCount,
    newCount,
    learningCount,
    reviewCount,
    masteredCount,
    overdueCount,
    totalAttempts,
    totalMistakes,
    accuracyRatePct,
  };
}
