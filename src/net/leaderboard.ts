import type { SaveData } from '../game/save';
import { t } from '../i18n';

/**
 * The worldwide leaderboards (api/leaderboard.ts on Vercel, Upstash Redis behind it).
 * Nothing is sent until the player joins with a nickname.
 */

export type BoardKey = 'clear1' | 'clearBest' | 'day30' | 'total' | 'bestDay' | 'today' | 'week';

export interface BoardInfo {
  key: BoardKey;
  name: string;
  desc: string;
  /** Scores are clear times (lower is better) or GUM. */
  unit: 'time' | 'gum';
}

/** Board order in the ranking screen (keys match BOARDS in api/leaderboard.ts). */
export const BOARD_LIST: BoardInfo[] = [
  { key: 'clear1', name: t('最速クリア', 'Fastest clear'), desc: t('1周目、Day 1 から黄金のエクステンションまでの営業時間', 'Run 1: business time from Day 1 to the Golden Extension'), unit: 'time' },
  { key: 'clearBest', name: t('最速クリア（周回込み）', 'Fastest clear (any run)'), desc: t('ランド移転後の周回も含めた、1周のクリアまでの最短営業時間', 'Shortest business time to clear in any run, relocations included'), unit: 'time' },
  { key: 'day30', name: t('序盤ダッシュ', 'Early dash'), desc: t('1周目の Day 30 終了までの累計売上', 'Run 1 sales by the end of Day 30'), unit: 'gum' },
  { key: 'total', name: t('累計売上', 'Total sales'), desc: t('全周回の累計売上', 'Sales across every run'), unit: 'gum' },
  { key: 'bestDay', name: t('最高日商', 'Best day'), desc: t('1日の売上の自己ベスト', 'Best sales in a single business day'), unit: 'gum' },
  { key: 'today', name: t('今日の日商', "Today's best day"), desc: t('今日（UTC）遊んだ営業日の、1日の売上の最高', 'Best single-day sales played today (UTC)'), unit: 'gum' },
  { key: 'week', name: t('今週の日商', "This week's best day"), desc: t('今週（UTC・月曜始まり）遊んだ営業日の、1日の売上の最高', 'Best single-day sales played this week (UTC, from Monday)'), unit: 'gum' },
];

export interface BoardEntry {
  rank: number;
  name: string;
  score: number;
  me?: boolean;
}

export interface BoardResult {
  board: BoardKey;
  period: string | null;
  count: number;
  entries: BoardEntry[];
  me: { rank: number; score: number } | null;
}

/** Where the API lives: same site on Vercel; builds for other hosts set VITE_LEADERBOARD_URL. */
export const API_URL = new URL((import.meta.env.VITE_LEADERBOARD_URL as string | undefined) || 'api/leaderboard', typeof location === 'undefined' ? 'http://localhost/' : location.href).href;

/** What the server keeps for this player (each board keeps the best value it has seen). */
export function submission(save: SaveData, lastDay: number) {
  const p = save.prestige;
  const clears = [p.clearSeconds, ...p.history.map((r) => r.clearSeconds)].filter((s): s is number => s !== null);
  const clear1 = p.runs === 0 ? p.clearSeconds : (p.history[0]?.clearSeconds ?? null);
  return {
    id: save.ranking.id,
    name: save.ranking.name,
    total: save.totals.revenue,
    bestDay: Math.max(save.bestDayRevenue, p.bestDay),
    lastDay,
    day30: save.ranking.day30,
    clear1,
    clearBest: clears.length ? Math.min(...clears) : null,
    run: p.runs + 1,
    day: save.day,
    playSeconds: save.meta.playSeconds,
  };
}

export class LeaderboardError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function call(method: string, query = '', body?: unknown): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(API_URL + query, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new LeaderboardError('offline');
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data) throw new LeaderboardError('offline');
  if (!res.ok) throw new LeaderboardError(String(data.error ?? res.status));
  return data;
}

export async function fetchBoard(board: BoardKey, me: string, limit = 50): Promise<BoardResult> {
  return (await call('GET', `?board=${board}&limit=${limit}&me=${me}`)) as unknown as BoardResult;
}

/** Sends this player's records (only once joined). */
export async function submit(save: SaveData, lastDay = 0): Promise<void> {
  if (!save.ranking.joined || !save.ranking.name) return;
  await call('POST', '', submission(save, lastDay));
}

/** Removes this player's records from every board. */
export async function withdraw(save: SaveData): Promise<void> {
  await call('DELETE', '', { id: save.ranking.id });
}

/** A message for the player for an error code from the server. */
export function errorText(e: unknown): string {
  const code = e instanceof LeaderboardError ? e.code : 'offline';
  switch (code) {
    case 'bad_name':
      return t('そのニックネームは使えません（1〜16文字、URLや不適切な言葉は不可）', "That nickname can't be used (1–16 characters, no links or offensive words)");
    case 'too_soon':
    case 'rate_limited':
      return t('少し時間をおいてからもう一度どうぞ', 'Please wait a moment and try again');
    case 'banned':
      return t('この記録はランキングに登録できません', "These records can't be entered on the leaderboards");
    case 'not_configured':
      return t('ランキングサーバーはまだ準備中です', 'The leaderboard server is not set up yet');
    default:
      return t('ランキングサーバーに接続できません', "Can't reach the leaderboard server");
  }
}
