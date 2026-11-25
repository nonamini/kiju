/**
 * Player Profile & Identity Management Types.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strict TypeScript, zero any (Rule 2).
 */

export type PlayerCategory = 'user' | 'ai' | 'pro';

export interface OpeningTendencyEntry {
  name: string;
  percentage: number;
}

export interface PlayerOpeningTendencyManual {
  periodLabel?: string; // e.g. "過去3年の戦型傾向"
  ibishaRatio: number; // 0-100
  furibishaRatio: number; // 0-100
  ibishaDetails: OpeningTendencyEntry[];
  furibishaDetails: OpeningTendencyEntry[];
  updatedAt?: string; // ISO 8601
}

export interface ShogiPlayerProfile {
  id: string; // Unique UUID (or fixed IDs like 'ai-fairy-stockfish', 'user-main')
  name: string; // Clean normalized name (e.g. "藤井聡太", "あなた", "Fairy-Stockfish 14")
  category: PlayerCategory;
  title?: string; // Rank or title (e.g. "竜王・名人", "九段", "アマ三段")
  aliases?: string[]; // Observed raw string variations in kifu headers (e.g. ["藤井聡太 竜王・名人", "藤井 聡太", "藤井竜王"])
  tags?: string[]; // Player style/characteristic tags (e.g. ["居飛車党", "受け将棋"])
  note?: string; // Custom memo (e.g. "居飛車党", "得意戦法: 角換わり")
  manualOpeningTendency?: PlayerOpeningTendencyManual; // Manual opening tendency from rating pages
  isOwner?: boolean; // Identifies the app owner's own player profile (Issue #71)
  createdAt: string; // ISO 8601
  ratingUrl?: string; // Optional link to Shogi rating page
  jsaUrl?: string; // Optional link to JSA player database page
  deletedAt?: string; // ISO 8601 when moved to trash
  updatedAt: string; // ISO 8601
}
