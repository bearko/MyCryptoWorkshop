// bearko.games 共通基盤への窓口（総合スコア・トロフィー・RTA。bearko/mycryptoportfolio の SPEC-001・SPEC-002、
// このリポジトリの docs/ROADMAP.md 8.4）
// SDK（https://bearko.games/sdk/v1.js、index.html で読み込む）が読めない・通信に失敗しても何もしない。
import type { SaveData } from '../game/save';
import { computeStats } from '../game/stats';

type Result = { ok: boolean; error?: string };

interface BearkoGamesSdk {
  init(opts: { game: string; version?: string; chat?: { position?: string; offset?: { x: number; y: number } } }): Promise<unknown>;
  openAvatarPicker?(): void;   // bearko.games 共通のアイコンを選ぶ窓（共通基盤 SPEC-005 5.3。SDK 1.7.0）
  submitScore(metrics: Record<string, unknown>, opts?: { quiet?: boolean }): Promise<Result>;
  unlockTrophy?(id: string): Promise<Result>;
  rta?: {
    start(opts: { regulation: string; timer?: 'top' | 'bottom' | false; timerOffset?: number }): Promise<Result>;
    checkpoint(id: string, opts?: { igtMs?: number }): Promise<Result>;
    abort(): Promise<Result>;
    current(): { runId: string; regulation: string } | null;
  };
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
    // 全体チャット（共通基盤 SPEC-004。SDK 1.6.0 から）：右下の 💬 は工房の「Skill tree」のボタンと重なるので、そのぶん上に置く
    Promise.resolve(bg.init({ game: 'workshop', version, chat: { position: 'bottom-right', offset: { x: 16, y: 96 } } })).catch((e) => console.warn('[platform] init', e));
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

/** 共通基盤の呼び出し。SDK がない・失敗しても例外を出さない（console.warn だけ） */
function call(name: string, fn: (bg: BearkoGamesSdk) => Promise<Result> | null | undefined): void {
  const bg = sdk();
  if (!bg) return;
  try {
    Promise.resolve(fn(bg))
      .then((r) => { if (r && r.ok === false) console.warn('[platform]', name, r.error); })
      .catch((e) => console.warn('[platform]', name, e));
  } catch (e) {
    console.warn('[platform]', name, e);
  }
}

// ---------------------------------------------------------------- トロフィー

/** いまのセーブで条件を満たしているトロフィー（純関数）。移転したあとは 1 周目に満たしたものも含む */
export function trophyIds(save: SaveData): string[] {
  const p = save.prestige;
  const stats = computeStats(save.levels);
  const ids: string[] = [];
  if (p.runs > 0 || save.ranking.day30 != null || save.day > 30) ids.push('workshop.day30');
  if (p.runs > 0 || stats.maxRarity >= 4) ids.push('workshop.legendary');
  if (p.runs > 0 || stats.cleared > 0) ids.push('workshop.clear');
  if (p.runs > 0) ids.push('workshop.relocate');
  return ids;
}

const sentTrophies = new Set<string>();
/** 1 つずつ順に送る（未ログインの最初の 1 回で仮アカウントができるので、同時に送ると別々の仮アカウントに入る） */
let trophyQueue: Promise<unknown> = Promise.resolve();

/** 条件を満たしたトロフィーを送る（同じ起動で同じ ID は 1 回だけ。持っているものは共通基盤が無視する） */
export function reportTrophies(save: SaveData): void {
  for (const id of trophyIds(save)) {
    if (sentTrophies.has(id) || typeof sdk()?.unlockTrophy !== 'function') continue;
    sentTrophies.add(id);
    trophyQueue = trophyQueue.then(() => unlockOne(id));
  }
}

async function unlockOne(id: string): Promise<void> {
  try {
    const r = await sdk()?.unlockTrophy?.(id);
    if (r && r.ok === false) console.warn('[platform] trophy', id, r.error);
  } catch (e) {
    console.warn('[platform] trophy', id, e);
  }
}

// ---------------------------------------------------------------- RTA

export const RTA_REGULATION = 'workshop-golden';
/** 区切りの順番（ツリーの前提でこの順にしか取れない） */
export const RTA_CHECKPOINTS = ['epic', 'legendary', 'clear'] as const;
export type RtaCheckpoint = (typeof RTA_CHECKPOINTS)[number];

/** いまのセーブで通っている区切り（純関数） */
export function rtaCheckpointsReached(save: SaveData): RtaCheckpoint[] {
  const stats = computeStats(save.levels);
  const reached: Record<RtaCheckpoint, boolean> = { epic: stats.maxRarity >= 3, legendary: stats.maxRarity >= 4, clear: stats.cleared > 0 };
  return RTA_CHECKPOINTS.filter((id) => reached[id]);
}

/** RTA を出せるか（SDK が読めたときだけ。ローカルで開いたときなどはボタンを出さない） */
export function isRtaAvailable(): boolean {
  return typeof sdk()?.rta?.start === 'function';
}

/** 「RTA で始める」を選んでから、セーブを消して再読み込みし、Day 1 の開店を待つ間の印 */
const RTA_PENDING_KEY = 'mycryptoworkshop.rtaPending';

export function setRtaPending(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(RTA_PENDING_KEY, '1');
    else sessionStorage.removeItem(RTA_PENDING_KEY);
  } catch {
    // sessionStorage が使えないときは RTA を始めない
  }
}

function rtaPending(): boolean {
  try {
    return sessionStorage.getItem(RTA_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

let rtaSent: RtaCheckpoint[] = [];

/** Day 1 の開店で呼ぶ。「RTA で始める」から来た 1 周目のときだけ計測を始める */
export function startRtaIfPending(save: SaveData, timerOffset = 64): void {
  if (!rtaPending()) return;
  setRtaPending(false);
  if (save.day !== 1 || save.prestige.runs > 0) return;
  rtaSent = [];
  // 経過時間は画面の下に出す（上は所持 GUM と残り時間）。timerOffset は下の端からの距離（px）
  call('rta start', (bg) => bg.rta?.start({ regulation: RTA_REGULATION, timer: 'bottom', timerOffset }));
}

/** 習得のたびに呼ぶ。計測中なら、新しく通った区切りを順に送る。igtMs は 1 周目の営業時間 */
export function reportRtaProgress(save: SaveData, igtMs: number): void {
  const rta = sdk()?.rta;
  if (!rta?.current?.() || rta.current()?.regulation !== RTA_REGULATION) return;
  for (const id of rtaCheckpointsReached(save)) {
    if (rtaSent.includes(id)) continue;
    rtaSent.push(id);
    call(`rta ${id}`, (bg) => bg.rta!.checkpoint(id, { igtMs: Math.max(0, Math.round(igtMs)) }));
  }
}

/** リセットなどで、計測中の RTA をやめる */
export function abortRta(): void {
  call('rta abort', (bg) => (bg.rta?.current?.() ? bg.rta.abort() : null));
}

// ---------------------------------------------------------------- bearko.games 共通のアイコン（共通基盤 SPEC-005 5.3）
/** 選ぶ窓を出せるか（SDK が読めて 1.7.0 以上） */
export function canPickAvatar(): boolean {
  const bg = sdk();
  return !!bg && typeof bg.openAvatarPicker === 'function';
}
/** アイコンを選ぶ窓（すべてのゲームとチャットで同じ絵になる）。SDK がない・古いときは何もしない */
export function openAvatarPicker(): boolean {
  const bg = sdk();
  if (!bg || typeof bg.openAvatarPicker !== 'function') return false;
  try {
    bg.openAvatarPicker();
  } catch (e) {
    console.warn('[platform] avatar', e);
  }
  return true;
}
