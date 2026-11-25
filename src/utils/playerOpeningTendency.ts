/**
 * Player Opening Tendency Aggregator & Tag Presets.
 * Aggregates a player's imported kifu records into Ibisha vs Furibisha ratios
 * and detailed opening percentages matching rating-page style breakdowns.
 *
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strict TypeScript, zero any (Rule 2).
 */

import type { KifuRecord } from '../types/kifuRecord';
import type {
  OpeningTendencyEntry,
  PlayerOpeningTendencyManual,
  ShogiPlayerProfile,
} from '../types/player';

export const DEFAULT_PLAYER_STYLE_TAGS: string[] = [
  '居飛車党',
  '振り飛車党',
  'オールラウンダー',
  '攻め将棋',
  '受け将棋',
  '終盤型',
  '序盤巧者',
  '力戦派',
];

const FURIBISHA_KEYWORDS = [
  '振り飛車',
  '四間飛車',
  '三間飛車',
  '中飛車',
  '向かい飛車',
  'ゴキゲン中飛車',
  '石田流',
  '角交換振り飛車',
  '袖飛車',
  '右四間',
  '立石流',
  '鬼殺し',
];

const IBISHA_KEYWORDS = [
  '居飛車',
  '相掛かり',
  '矢倉',
  '角換わり',
  '雁木',
  '横歩取り',
  '対振り飛車',
  '棒銀',
  '右玉',
  '嬉野流',
  'elmo',
  'ミレニアム',
  '穴熊',
];

/**
 * Classifies an opening name into 'ibisha' | 'furibisha'.
 * Defaults to 'ibisha' when ambiguous, unless Furibisha keywords match.
 */
export function classifyOpeningFamily(openingName: string): 'ibisha' | 'furibisha' {
  const normalized = openingName.trim();
  // "対振り飛車" is an Ibisha strategy against Furibisha
  if (normalized.includes('対振り飛車')) {
    return 'ibisha';
  }
  for (const kw of FURIBISHA_KEYWORDS) {
    if (normalized.includes(kw)) {
      return 'furibisha';
    }
  }
  for (const kw of IBISHA_KEYWORDS) {
    if (normalized.includes(kw)) {
      return 'ibisha';
    }
  }
  return 'ibisha';
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Aggregates a player's KifuRecords into Ibisha/Furibisha ratios and opening details.
 */
export function aggregatePlayerOpeningTendency(
  player: ShogiPlayerProfile,
  records: KifuRecord[]
): PlayerOpeningTendencyManual {
  const playerGames = records.filter(
    (rec) =>
      !rec.deletedAt &&
      (rec.sentePlayerId === player.id ||
        rec.gotePlayerId === player.id ||
        rec.senteName === player.name ||
        rec.goteName === player.name)
  );

  const total = playerGames.length;
  if (total === 0) {
    return {
      ibishaRatio: 0,
      furibishaRatio: 0,
      ibishaDetails: [],
      furibishaDetails: [],
    };
  }

  let ibishaCount = 0;
  let furibishaCount = 0;
  const ibishaMap = new Map<string, number>();
  const furibishaMap = new Map<string, number>();

  for (const rec of playerGames) {
    const opening = (rec.openingName || 'その他の戦型').trim();
    const family = classifyOpeningFamily(opening);
    if (family === 'furibisha') {
      furibishaCount += 1;
      furibishaMap.set(opening, (furibishaMap.get(opening) ?? 0) + 1);
    } else {
      ibishaCount += 1;
      ibishaMap.set(opening, (ibishaMap.get(opening) ?? 0) + 1);
    }
  }

  const toSortedDetails = (map: Map<string, number>): OpeningTendencyEntry[] =>
    Array.from(map.entries())
      .map(([name, count]) => ({
        name,
        percentage: roundToOneDecimal((count / total) * 100),
      }))
      .sort((a, b) => b.percentage - a.percentage);

  return {
    ibishaRatio: roundToOneDecimal((ibishaCount / total) * 100),
    furibishaRatio: roundToOneDecimal((furibishaCount / total) * 100),
    ibishaDetails: toSortedDetails(ibishaMap),
    furibishaDetails: toSortedDetails(furibishaMap),
  };
}
