/**
 * アイランドの効果音（scripts/island/sfx.py で作った public/island/sfx/*.mp3）。
 * Web Audio で先に読み込んでおき、押したその場で鳴らす（スマホでも遅れない）。BGM は audio.ts の Sound のまま。
 */
import { assetUrl } from '../../render/images';

export type Sfx = 'tap' | 'page' | 'move' | 'place' | 'spend' | 'error' | 'done' | 'craft' | 'sale' | 'levelup' | 'mission' | 'report' | 'win';
const ALL: Sfx[] = ['tap', 'page', 'move', 'place', 'spend', 'error', 'done', 'craft', 'sale', 'levelup', 'mission', 'report', 'win'];

/** 音ごとの大きさ（設定 100% のとき） */
const GAIN: Partial<Record<Sfx, number>> = { tap: 0.35, page: 0.4, move: 0.5, sale: 0.45, craft: 0.5 };

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
      const res = await fetch(assetUrl(`island/sfx/${k}.mp3`));
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

  /** gain：その場だけの大きさ（1 が標準） */
  play(k: Sfx, gain = 1): void {
    const ctx = this.ctx;
    const b = this.buf.get(k);
    if (!ctx || !b || this.level <= 0 || ctx.state !== 'running') return;
    // 同じ音の連打は間引く
    const now = performance.now();
    if (now - (this.last.get(k) ?? 0) < 50) return;
    this.last.set(k, now);
    const src = ctx.createBufferSource();
    src.buffer = b;
    const g = ctx.createGain();
    g.gain.value = Math.min(1, (GAIN[k] ?? 0.6) * this.level * gain);
    src.connect(g).connect(ctx.destination);
    src.start();
  }
}
