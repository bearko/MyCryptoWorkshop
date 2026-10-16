// bearko.games 共通基盤への窓口（総合スコア。bearko/mycryptoportfolio の SPEC-002 3.7）
// SDK（https://bearko.games/sdk/v1.js、index.html で読み込む）が読めない・通信に失敗しても何もしない。
import type { SaveData } from '../game/save';

interface BearkoGamesSdk {
  init(opts: { game: string; version?: string }): Promise<unknown>;
  submitScore(metrics: Record<string, unknown>, opts?: { quiet?: boolean }): Promise<{ ok: boolean; error?: string }>;
}

const sdk = (): BearkoGamesSdk | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { BearkoGames?: BearkoGamesSdk }).BearkoGames;

/** 共通基盤に送る成績（純関数）。day：30 日目に届いたことがあれば 30 以上、clearBest：最速クリア（営業日の秒数） */
export function scoreMetrics(save: SaveData): { day: number; clearBest: number | null; total: number; run: number } {
  const p = save.prestige;
  const clears = [p.clearSeconds, ...p.history.map((r) => r.clearSeconds)].filter((s): s is number => s !== null);
  const reached30 = p.runs > 0 || save.ranking.day30 != null || save.day >= 30;
  return {
    day: reached30 ? Math.max(30, save.day) : save.day,
    clearBest: clears.length ? Math.min(...clears) : null,
    // 将来の見直し用（今は点に効かない）
    total: save.totals.revenue,
    run: p.runs + 1,
  };
}

let initedWith: string | null = null;

export function initPlatform(version: string): void {
  const bg = sdk();
  if (!bg) {
    // SDK はゲーム本体のあとに読まれることがあるので、読めたら init する
    if (typeof window !== 'undefined' && initedWith === null) {
      initedWith = '';
      window.addEventListener('load', () => { initedWith = null; if (sdk()) initPlatform(version); }, { once: true });
    }
    return;
  }
  if (initedWith === version) return;
  initedWith = version;
  try {
    Promise.resolve(bg.init({ game: 'workshop', version })).catch((e) => console.warn('[platform] init', e));
  } catch (e) {
    console.warn('[platform] init', e);
  }
}

/** 1 日の終わり・クリアで送る（積み上げなので、1 日の終わりは通知を出さない） */
export function reportScore(save: SaveData, { quiet = true } = {}): void {
  const bg = sdk();
  if (!bg || typeof bg.submitScore !== 'function') return;
  try {
    Promise.resolve(bg.submitScore(scoreMetrics(save), { quiet }))
      .then((r) => { if (!r || !r.ok) console.warn('[platform] score', r && r.error); })
      .catch((e) => console.warn('[platform] score', e));
  } catch (e) {
    console.warn('[platform] score', e);
  }
}
