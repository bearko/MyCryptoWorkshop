/**
 * アイランドの効果音（scripts/island/sfx.py で作った public/island/sfx/*.mp3。発掘の出土は MCH の効果音 mch/Audio/SE/Actions/）。
 * Web Audio で先に読み込んでおき、押したその場で鳴らす（スマホでも遅れない）。BGM は audio.ts の Sound のまま。
 */
import { assetUrl } from '../../render/images';

export type Sfx = 'tap' | 'page' | 'move' | 'place' | 'spend' | 'error' | 'done' | 'craft' | 'sale' | 'levelup' | 'mission' | 'report' | 'win' | 'check' | 'clear' | 'drum' | 'dig' | 'treasure' | 'mining' | 'katsun';
const ALL: Sfx[] = ['tap', 'page', 'move', 'place', 'spend', 'error', 'done', 'craft', 'sale', 'levelup', 'mission', 'report', 'win', 'check', 'clear', 'drum', 'dig', 'treasure', 'mining', 'katsun'];
/** MCH の効果音を使うもの（sync-assets で public/mch/ に入っているもの）。ほかは island/sfx/<名前>.mp3 */
const MCH: Partial<Record<Sfx, string>> = {
  // エクステの出土（新発見・研究 Lv が上がった・石板）
  treasure: 'mch/Audio/SE/Actions/open_treasure.mp3',
  // お題の出土（大きい演出）
  mining: 'mch/Audio/SE/Actions/cp-mining-complete.mp3',
};

/** 音ごとの大きさ（設定 100% のとき） */
const GAIN: Partial<Record<Sfx, number>> = { tap: 0.35, page: 0.4, move: 0.5, sale: 0.45, craft: 0.5, drum: 0.5, dig: 0.45, treasure: 0.55, mining: 0.6, katsun: 0.5 };

export class IslandSfx {
  private ctx: AudioContext | null = null;
  private buf = new Map<Sfx, AudioBuffer>();
  private loading = false;
  private last = new Map<Sfx, number>();
  /** 設定の音量（0 で消す） */
  level = 1;

  /** 操作のたびに呼ぶ（最初の操作で音の準備をし、止まっていれば動かす） */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    if (!this.loading) {
      this.loading = true;
      for (const k of ALL) void this.load(k);
    }
  }

  private async load(k: Sfx) {
    try {
      const res = await fetch(assetUrl(MCH[k] ?? `island/sfx/${k}.mp3`));
      const data = await res.arrayBuffer();
      const b = await this.ctx!.decodeAudioData(data);
      this.buf.set(k, b);
    } catch {
      // 読めなければ鳴らさないだけ
    }
  }

  /** 確認用：音の準備の様子 */
  info() {
    return { state: this.ctx?.state ?? 'none', loaded: this.buf.size, total: ALL.length };
  }

  /** gain：その場だけの大きさ（1 が標準）・rate：再生の速さ（1 が標準。下げると低く重い音。発掘の奥の層） */
  play(k: Sfx, gain = 1, rate = 1): void {
    const ctx = this.ctx;
    const b = this.buf.get(k);
    if (!ctx || !b || this.level <= 0 || ctx.state !== 'running') return;
    // 同じ音の連打は間引く
    const now = performance.now();
    if (now - (this.last.get(k) ?? 0) < 50) return;
    this.last.set(k, now);
    const src = ctx.createBufferSource();
    src.buffer = b;
    if (rate !== 1) src.playbackRate.value = Math.max(0.5, Math.min(2, rate));
    const g = ctx.createGain();
    g.gain.value = Math.min(1, (GAIN[k] ?? 0.6) * this.level * gain);
    src.connect(g).connect(ctx.destination);
    src.start();
  }
}
