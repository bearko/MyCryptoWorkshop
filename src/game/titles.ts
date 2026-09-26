import { icons, lands, seriesIcon } from './catalog';
import { BLESSINGS } from './blessings';
import { mul, type Effect } from './effects';
import type { SkillNode } from './skills';
import { t } from '../i18n';

/**
 * 称号 (titles): the end game. Each of the nine lands has six titles, Commander → King, earned
 * with GUM after clearing a run while the workshop is on that land. Titles are kept for good:
 * each one strengthens the land's cryptid (its blessing counts for more, and its visits on the
 * land's day boost sales), and the best one is shown next to the player's name on the
 * leaderboards. Three lands at G5 or above open the last panel, the MCH Verse Pass.
 */

export interface TitleRank {
  key: string;
  name: string;
  /** GUM for this title (the same on every land). */
  cost: number;
  /** How many extra levels of the land's blessing it gives. */
  bless: number;
}

export const TITLE_RANKS: TitleRank[] = [
  { key: 'commander', name: t('コマンダー', 'Commander'), cost: 1e12, bless: 0.5 },
  { key: 'knightCommander', name: t('ナイトコマンダー', 'Knight Commander'), cost: 3e12, bless: 0.5 },
  { key: 'knight', name: t('ナイト', 'Knight'), cost: 1e13, bless: 0.5 },
  { key: 'g5', name: 'G5', cost: 3e13, bless: 1 },
  { key: 'maestro', name: t('マエストロ', 'Maestro'), cost: 6e13, bless: 1 },
  { key: 'king', name: t('キング', 'King'), cost: 1.5e14, bless: 1.5 },
];

/** Index of G5 in TITLE_RANKS (G5 and above count toward the Verse Pass). */
export const G5_RANK = TITLE_RANKS.findIndex((r) => r.key === 'g5');
/** Lands at G5 or above that open the MCH Verse Pass. */
export const VERSE_LANDS = 3;

export const titleId = (land: string, rank: number) => `title_${land}_${TITLE_RANKS[rank].key}`;
/** Hidden marker: the workshop is on this land in the current run (set by relocate). */
export const atLandId = (land: string) => `at_${land}`;
export const VERSE_PASS = 'versePass';

/** The title's name with its land: "Ocean キング". */
export const titleLabel = (land: string, rank: number) => {
  const name = lands.find((l) => l.key === land)?.name ?? land;
  return t(`${name} ${TITLE_RANKS[rank].name}`, `${name} ${TITLE_RANKS[rank].name}`);
};

/** Titles earned on a land (they are earned in order, so this is also the highest rank + 1). */
export function titleCount(levels: Record<string, number>, land: string): number {
  let n = 0;
  while (n < TITLE_RANKS.length && (levels[titleId(land, n)] ?? 0) > 0) n++;
  return n;
}

/** The best title (highest rank; the first land among equals), as a code for the leaderboards. */
export function bestTitle(levels: Record<string, number>): { land: string; rank: number } | null {
  let best: { land: string; rank: number } | null = null;
  for (const land of lands) {
    const n = titleCount(levels, land.key);
    if (n > 0 && (!best || n - 1 > best.rank)) best = { land: land.key, rank: n - 1 };
  }
  return best;
}

/** Title shown on the leaderboards: "verse" (MCH Verse Pass), "<land>:<rank key>", or null. */
export function titleCode(levels: Record<string, number>): string | null {
  if ((levels[VERSE_PASS] ?? 0) > 0) return 'verse';
  const best = bestTitle(levels);
  return best ? `${best.land}:${TITLE_RANKS[best.rank].key}` : null;
}

/** Display text of a title code from the leaderboards. */
export function titleCodeLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code === 'verse') return 'MCH Verse Pass';
  const [land, key] = code.split(':');
  const rank = TITLE_RANKS.findIndex((r) => r.key === key);
  return rank >= 0 && lands.some((l) => l.key === land) ? titleLabel(land, rank) : null;
}

/** An effect counted as `k` levels (for a title's share of the land's blessing). */
function scaled(e: Effect, k: number): Effect {
  if (e.op === 'add' || e.op === 'mul') return { ...e, per: e.per * k };
  if (e.op === 'pow') return { ...e, factor: Math.pow(e.factor, k) };
  return e;
}

/** Sales boost while a land's cryptid visits on its land day, by titles on that land (MCH Verse Pass doubles the bonus). */
export function cryptidVisitBoost(levels: Record<string, number>, land: string): number {
  const bonus = 0.25 * titleCount(levels, land);
  return 1 + bonus * ((levels[VERSE_PASS] ?? 0) > 0 ? 2 : 1);
}

/** Seconds the land-day boost lasts. */
export const CRYPTID_BOOST_SECONDS = 20;

// Layout (grid units): the hall under 伝説の間 (x -6, y 11), one column per land going left,
// Commander at the top (row 11) down to King (row 16), and the Verse Pass below the middle.
const HALL = { x: -6, y: 11 };

export const TITLE_NODES: SkillNode[] = [
  {
    id: 'titleHall', branch: 'title', name: t('称号の間', 'Hall of Titles'),
    desc: t(
      'ランドの称号を目指せるようになる。移転先のランドでゲームクリア（黄金のエクステンション）すると、そのランドの称号を GUM で獲得できる。称号は移転しても消えない',
      'Lets you aim for the titles of the lands. After clearing a run (the Golden Extension) on a land, that land\'s titles can be earned with GUM. Titles are kept when you relocate',
    ),
    icon: seriesIcon('Oriflamme', 4), x: HALL.x, y: HALL.y, max: 1, baseCost: 1e9, growth: 1, requires: ['legendHall'], requiresAll: ['goldenExtension'], effects: [mul('priceMult', 0.05)],
  },
  ...lands.flatMap((land, i) =>
    TITLE_RANKS.map((rank, r): SkillNode => {
      const bless = BLESSINGS[land.key];
      return {
        id: titleId(land.key, r),
        branch: 'title',
        name: t(`称号：${titleLabel(land.key, r)}`, `Title: ${titleLabel(land.key, r)}`),
        desc: t(
          `${land.name}のクリプタイドを強化する: ${bless.name}（${bless.desc}）が ${rank.bless} 回分強くなり、${land.name}の日に来るクリプタイドがいる間 ${CRYPTID_BOOST_SECONDS} 秒、売上 +25%（称号 1 つごと）。ランキングで名前の横に称号が付く`,
          `Strengthens the ${land.name} cryptid: ${bless.name} (${bless.desc}) counts ${rank.bless} more time(s), and while it visits on ${land.name}'s land day, sales +25% for ${CRYPTID_BOOST_SECONDS}s (per title). Shown next to your name on the leaderboards`,
        ),
        icon: land.cryptid,
        x: HALL.x - 1 - i,
        y: HALL.y + r,
        max: 1,
        baseCost: rank.cost,
        growth: 1,
        requires: [r === 0 ? 'titleHall' : titleId(land.key, r - 1)],
        requiresAll: [atLandId(land.key), 'goldenExtension'],
        effects: bless.effects.map((e) => scaled(e, rank.bless)),
      };
    }),
  ),
  {
    id: VERSE_PASS, branch: 'title', name: 'MCH Verse Pass',
    desc: t(
      '伝説の工房の最後の証。販売価格 +100%、移転で得る Cp +50%、クリプタイドの日の売上ボーナスが 2 倍。ランキングの称号が「MCH Verse Pass」になる',
      'The last proof of a legendary workshop. Sale price +100%, Cp from relocating +50%, and the cryptid land-day sales bonus doubles. Your leaderboard title becomes "MCH Verse Pass"',
    ),
    icon: icons.ce, x: HALL.x - 5, y: HALL.y + TITLE_RANKS.length, max: 1, baseCost: 2e14, growth: 1, requires: [],
    requiresCount: {
      ids: lands.map((l) => titleId(l.key, G5_RANK)),
      count: VERSE_LANDS,
      text: t(`${VERSE_LANDS} つのランドで G5 以上の称号を獲得`, `Earn G5 or higher on ${VERSE_LANDS} lands`),
    },
    visibleWith: 'titleHall',
    extraCosts: { research: 30000, dust: 30000, emblem: 100 },
    effects: [mul('priceMult', 1, 'verse'), mul('cpMult', 0.5, 'verse')],
  },
];

/** Hidden markers for the land the workshop is on (one of them is 1 after a relocation). */
export const LAND_MARKER_NODES: SkillNode[] = lands.map((land, i) => ({
  id: atLandId(land.key),
  branch: 'title',
  name: t(`${land.name}で営業中`, `Running the workshop on ${land.name}`),
  desc: '',
  icon: land.cryptid,
  x: 3000 + i,
  y: 3000,
  max: 1,
  baseCost: 0,
  growth: 1,
  requires: [],
  effects: [],
  hidden: true,
}));

/** Marks `land` as the current one (and no other). */
export function setHomeLand(levels: Record<string, number>, land: string | null): void {
  for (const l of lands) delete levels[atLandId(l.key)];
  if (land) levels[atLandId(land)] = 1;
}

