import { audioFiles } from './game/catalog';
import { assetUrl } from './render/images';

type Se = 'craft' | 'rare' | 'sale' | 'unlock' | 'build' | 'fail' | 'hit' | 'buff' | 'debuff' | 'win' | 'helper' | 'clean' | 'zap';
type Bgm = 'bgmShop' | 'bgmTree' | 'bgmRaid';

const SE_VOLUME: Partial<Record<Se, number>> = { craft: 0.25, sale: 0.35, hit: 0.6, fail: 0.5, clean: 0.4, zap: 0.5 };

/** Minimal sound manager: looping BGM plus a small pool of one-shot SE players. */
export class Sound {
  bgmOn = true;
  seOn = true;
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

  playBgm(key: Bgm, force = false): void {
    if (this.bgmKey === key && !force && this.bgm && !this.bgm.paused) return;
    this.bgmKey = key;
    this.bgm?.pause();
    if (!this.bgmOn || !this.unlocked) return;
    this.bgm = new Audio(assetUrl(audioFiles[key]));
    this.bgm.loop = true;
    this.bgm.volume = 0.35;
    void this.bgm.play().catch(() => undefined);
  }

  setBgm(on: boolean): void {
    this.bgmOn = on;
    if (!on) this.bgm?.pause();
    else if (this.bgmKey) this.playBgm(this.bgmKey, true);
  }

  play(key: Se): void {
    if (!this.seOn || !this.unlocked) return;
    // Throttle rapid repeats of the same effect.
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? 0) < 70) return;
    this.lastPlayed.set(key, now);
    const a = new Audio(assetUrl(audioFiles[key]));
    a.volume = SE_VOLUME[key] ?? 0.45;
    void a.play().catch(() => undefined);
  }
}
