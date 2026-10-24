import { audioFiles } from './game/catalog';
import { assetUrl } from './render/images';

type Se = 'craft' | 'rare' | 'sale' | 'unlock' | 'build' | 'fail' | 'hit' | 'buff' | 'debuff' | 'win' | 'helper' | 'clean' | 'zap';
type Bgm = 'bgmShop' | 'bgmTree' | 'bgmRaid' | 'bgmCompany';

/** Loudness of each sound at the 100% setting (the final volume is this × the setting). */
const SE_VOLUME: Partial<Record<Se, number>> = { craft: 0.25, sale: 0.35, hit: 0.6, fail: 0.5, clean: 0.4, zap: 0.5 };
const BGM_VOLUME = 0.35;

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

/** Minimal sound manager: looping BGM plus a small pool of one-shot SE players. */
export class Sound {
  /** Volume settings, 0 (off) to 1 (the sounds' own loudness). */
  private bgmLevel = 1;
  private seLevel = 1;
  private bgm: HTMLAudioElement | null = null;
  private bgmKey: Bgm | null = null;
  private lastPlayed = new Map<Se, number>();
  private unlocked = false;

  /** Called on user gestures; only the first call starts the BGM (later taps must not restart it). */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    if (this.bgmKey) this.playBgm(this.bgmKey, true);
  }

  /** いま流している（流すはずの）BGM */
  currentBgm(): Bgm | null {
    return this.bgmKey;
  }

  playBgm(key: Bgm, force = false): void {
    if (this.bgmKey === key && !force && this.bgm && !this.bgm.paused) return;
    this.bgmKey = key;
    this.bgm?.pause();
    this.bgm = null;
    if (this.bgmLevel <= 0 || !this.unlocked) return;
    this.bgm = new Audio(assetUrl(audioFiles[key]));
    this.bgm.loop = true;
    this.bgm.volume = BGM_VOLUME * this.bgmLevel;
    void this.bgm.play().catch(() => undefined);
  }

  /** Applies the volume settings (0..1). The playing BGM follows at once: 0 pauses it, raising it from 0 resumes it. */
  setVolumes({ bgm, se }: { bgm?: number; se?: number }): void {
    if (se !== undefined) this.seLevel = clamp01(se);
    if (bgm === undefined) return;
    this.bgmLevel = clamp01(bgm);
    if (!this.bgm) {
      if (this.bgmLevel > 0 && this.bgmKey) this.playBgm(this.bgmKey, true);
      return;
    }
    if (this.bgmLevel <= 0) {
      this.bgm.pause();
      return;
    }
    this.bgm.volume = BGM_VOLUME * this.bgmLevel;
    if (this.bgm.paused && this.unlocked) void this.bgm.play().catch(() => undefined);
  }

  play(key: Se): void {
    if (this.seLevel <= 0 || !this.unlocked) return;
    // Throttle rapid repeats of the same effect.
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? 0) < 70) return;
    this.lastPlayed.set(key, now);
    const a = new Audio(assetUrl(audioFiles[key]));
    a.volume = (SE_VOLUME[key] ?? 0.45) * this.seLevel;
    void a.play().catch(() => undefined);
  }
}
