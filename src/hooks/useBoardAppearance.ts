/**
 * Shared Board & Piece Appearance Hook.
 * Single source of truth for boardTheme, pieceStyle, showCoordinates,
 * custom asset Data URLs, and vector board palettes across all boards and komadai.
 * Follows Rule 1: strictly English identifiers, comments, and types.
 */

import { useEffect, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { AppSettings, DEFAULT_APP_SETTINGS } from '../utils/appSettingsStorage';
import {
  CustomAssetsState,
  getCachedCustomAssets,
  initCustomAssetsCache,
  subscribeCustomAssets,
} from '../utils/customAssetsStorage';

// Coordinate mappings matching public/assets/board.svg (426.95 mm x 467.66 mm grid)
export const BOARD_WIDTH = 439.215;
export const BOARD_HEIGHT = 479.792;
export const GRID_START_X = 6.403;
export const GRID_START_Y = 6.130;
export const CELL_W = 47.439;
export const CELL_H = 51.962;

// Expanded viewBox with outer margins for coordinate labels
export const VIEW_MIN_X = 0;
export const VIEW_MIN_Y = -22;
export const VIEW_WIDTH = BOARD_WIDTH + 24;
export const VIEW_HEIGHT = BOARD_HEIGHT + 22;

export const BOARD_RANK_LABELS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;
export const BOARD_RANK_LABELS_FLIPPED = ['九', '八', '七', '六', '五', '四', '三', '二', '一'] as const;

export interface VectorBoardPalette {
  gradStart: string;
  gradEnd: string;
  outerStroke: string;
  lineStroke: string;
}

export const VECTOR_BOARD_PALETTES: Record<'wood' | 'dark' | 'slate', VectorBoardPalette> = {
  wood: {
    gradStart: '#f5dfa8',
    gradEnd: '#e8c87e',
    outerStroke: '#7c5323',
    lineStroke: '#4a3519',
  },
  dark: {
    gradStart: '#1e293b',
    gradEnd: '#0f172a',
    outerStroke: '#64748b',
    lineStroke: '#475569',
  },
  slate: {
    gradStart: '#3b4759',
    gradEnd: '#2b3545',
    outerStroke: '#64748b',
    lineStroke: '#94a3b8',
  },
};

export interface BoardAppearanceState {
  boardTheme: 'kaya' | 'wood' | 'dark' | 'slate' | 'custom';
  pieceStyle: 'single' | 'kanji' | 'custom';
  showCoordinates: boolean;
  customBoardDataUrl: string | null;
  vectorPalette: VectorBoardPalette | null;
  boardImageHref: string;
  pieceSpriteHref: string;
}

/**
 * Resolves the user's current board theme, piece sprite sheet, and coordinate visibility.
 */
export function useBoardAppearance(): BoardAppearanceState {
  // Read settings context when mounted under SettingsProvider; fall back to defaults in isolated previews/tests.
  let settings: AppSettings;
  try {
    settings = useSettings().settings;
  } catch {
    settings = DEFAULT_APP_SETTINGS;
  }
  const boardTheme = settings.boardTheme ?? 'kaya';
  const pieceStyle = settings.pieceStyle ?? 'single';
  const showCoordinates = settings.showCoordinates ?? true;

  const [customAssets, setCustomAssets] = useState<CustomAssetsState>(() =>
    getCachedCustomAssets()
  );

  useEffect(() => {
    let active = true;
    void initCustomAssetsCache().then((loaded) => {
      if (active) setCustomAssets(loaded);
    });
    const unsubscribe = subscribeCustomAssets(() => {
      setCustomAssets(getCachedCustomAssets());
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const vectorPalette =
    boardTheme === 'wood' || boardTheme === 'dark' || boardTheme === 'slate'
      ? VECTOR_BOARD_PALETTES[boardTheme]
      : null;

  const assetBase = import.meta.env.BASE_URL === './' ? '/' : import.meta.env.BASE_URL;

  const boardImageHref =
    boardTheme === 'custom' && customAssets.boardDataUrl
      ? customAssets.boardDataUrl
      : `${assetBase}assets/board.svg`;

  const pieceSpriteHref =
    pieceStyle === 'custom' && customAssets.pieceSpriteDataUrl
      ? customAssets.pieceSpriteDataUrl
      : pieceStyle === 'kanji'
        ? `${assetBase}assets/piece_wood_2char.svg`
        : `${assetBase}assets/piece_wood.svg`;

  return {
    boardTheme,
    pieceStyle,
    showCoordinates,
    customBoardDataUrl: customAssets.boardDataUrl,
    vectorPalette,
    boardImageHref,
    pieceSpriteHref,
  };
}
