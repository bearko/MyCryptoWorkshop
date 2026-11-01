/**
 * 地図の上の動き（サイクルが回っていることを見せる）：
 * 調達係が卸問屋まで歩く・お客さんが家からお店へ歩く・製造の吹き出しの枠が進む・売上と生産量が浮かぶ。
 * 時計（clock）はゲームの時間で進み、メニューを開いて止めているあいだは動かない。
 */
import { heroById, heroFacesRight } from '../../game/catalog';
import { drawRef } from '../../render/images';
import { center } from '../render';
import type { Mat } from './data';

export interface Walker {
  hero: number;
  path: [number, number][];
  /** 歩き始め（clock）と、かかる時間（ms） */
  t0: number;
  dur: number;
  /** 着いたら（お店なら売上を浮かべる） */
  uid?: number;
  yen?: number;
  done?: boolean;
}

export interface BuyerView {
  hero: number;
  path: [number, number][];
  /** 往復の進み（0〜1。0.5 で卸問屋） */
  k: number;
  /** 帰りに持っている素材 */
  carry: Mat | null;
}

export interface Anim {
  /** ゲームの時計（ms） */
  clock: number;
  /** 1 日のうちどこまで進んだか（0〜1）。止まっているときは 0 */
  frac: number;
  /** ゲームの速さ（1 か 4） */
  speed: number;
  /** 1 日の長さ（ms） */
  dayMs: number;
  /** 街の人通り（自社と関係なく歩いている人。他社のお客さん・駅を行き交う人・散歩する人） */
  crowd: Walker[];
  walkers: Walker[];
  buyer: BuyerView | null;
  /** 注文した素材を運んでくる問屋の人（卸問屋 → 工房。f は 0〜1） */
  couriers?: { hero: number; path: [number, number][]; f: number; carry: Mat }[];
  /** お店ごとの売上の表示（新しいものが下）。t は clock */
  coins: Map<number, { yen: number; t: number }[]>;
  /** 工房の「＋数」 */
  plus: { uid: number; n: number; t: number }[];
  /** チュートリアルの流れの案内：スポットライトを当てるマス（まわりを暗く） */
  spot?: { i: number; j: number; r: number } | null;
  /** チュートリアル：建ててもらう場所の印 */
  mark?: { i: number; j: number; label: string } | null;
  /** 発掘との出会い：光らせる荒れ地の番号（無ければ null） */
  wasteGlow?: number | null;
  /** 復興・ダンジョンの見つかった演出：荒れ地の番号と始まった時刻（performance.now）。土 → 草地（ダンジョンは入り口が地面から現れる） */
  revive?: { site: number; t0: number } | null;
}

export const newAnim = (): Anim => ({ clock: 0, frac: 0, speed: 1, dayMs: 1200, walkers: [], crowd: [], buyer: null, coins: new Map(), plus: [] });

/** 道のりの上の位置（f＝0〜1）と、進む向き */
export function along(path: [number, number][], f: number): { i: number; j: number; di: number; dj: number } {
  if (path.length === 1) return { i: path[0][0], j: path[0][1], di: 0, dj: 1 };
  const x = Math.max(0, Math.min(0.9999, f)) * (path.length - 1);
  const k = Math.floor(x);
  const t = x - k;
  const [ai, aj] = path[k];
  const [bi, bj] = path[k + 1];
  return { i: ai + (bi - ai) * t, j: aj + (bj - aj) * t, di: bi - ai, dj: bj - aj };
}

const HERO = 74;

/**
 * ヒーローを地図の上で歩かせて描く（Workshop のお客さんと同じ：進む向きに体を向け、歩くと小さく跳ねる）。
 * 絵は左向きが基本（facesRight の絵は逆）。体の中心（cx）を足もとに合わせる。
 */
export function drawWalker(ctx: CanvasRenderingContext2D, hero: number, i: number, j: number, di: number, dj: number, bob: number, alpha = 1, carry?: HTMLImageElement | null) {
  const h = heroById.get(hero);
  if (!h) return;
  const c = center(i, j);
  const facing = (di - dj) * 100 < 0 ? -1 : 1;
  const flip = heroFacesRight(hero) ? facing < 0 : facing > 0;
  const hop = Math.abs(Math.sin(bob)) * 7;
  const s = HERO / 64;
  const x = c.x - (flip ? 64 - h.cx : h.cx) * s;
  const y = c.y + 6 - HERO - hop;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + 4, 20, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  if (flip) {
    ctx.translate(x + HERO, y);
    ctx.scale(-1, 1);
    drawRef(ctx, h.image, 0, 0, HERO, HERO);
  } else drawRef(ctx, h.image, x, y, HERO, HERO);
  ctx.restore();
  if (carry && carry.complete && carry.naturalWidth) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(carry, c.x - 16, y - 30, 32, 32);
    ctx.restore();
  }
}

/** 角の丸い四角の外周を、上の辺のまん中から時計回りに d だけ進んだ点（角は丸めずに数える） */
function perim(x: number, y: number, w: number, h: number, d: number): [number, number] {
  const L = 2 * (w + h);
  let r = ((d % L) + L) % L;
  const half = w / 2;
  if (r <= half) return [x + half + r, y];
  r -= half;
  if (r <= h) return [x + w, y + r];
  r -= h;
  if (r <= w) return [x + w - r, y + h];
  r -= w;
  if (r <= h) return [x, y + h - r];
  r -= h;
  return [x + r, y];
}

/**
 * 製造の吹き出しの枠：1 ロットにかかる秒数で外周を分け、上の辺のまん中から時計回りに順に色を付ける。
 * 1 周すると 1 ロットできる。
 */
export function drawRing(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, parts: number, lit: number) {
  if (lit <= 0) return;
  const L = 2 * (w + h);
  const end = (L * Math.min(parts, lit)) / parts;
  ctx.save();
  ctx.strokeStyle = '#fff36b';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  const step = 2;
  let [px, py] = perim(x, y, w, h, 0);
  ctx.moveTo(px, py);
  for (let d = step; d <= end; d += step) {
    [px, py] = perim(x, y, w, h, d);
    ctx.lineTo(px, py);
  }
  [px, py] = perim(x, y, w, h, end);
  ctx.lineTo(px, py);
  ctx.stroke();
  // 区切りの目印
  ctx.fillStyle = '#0f1626';
  for (let k = 1; k < parts; k++) {
    const [qx, qy] = perim(x, y, w, h, (L * k) / parts);
    ctx.fillRect(qx - 1, qy - 1, 2, 2);
  }
  ctx.restore();
}

const FONT = "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', system-ui, sans-serif";

/** 吹き出しの上に浮かぶ文字（縁取りつき） */
export function floatText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#0f1626';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** 売上の連なり：新しいものほど下で濃く、5 つ前より古いものは見せない */
export const COIN_KEEP = 5;
export const COIN_MS = 2600;
export const PLUS_MS = 1200;
