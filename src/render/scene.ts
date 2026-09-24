import { catalog, icons, RARITY_COLOR, staffFrames, type Frame } from '../game/catalog';
import { EDITIONS, itemEdition, itemExt } from '../game/items';
import {
  CHRIS_POS,
  COUNTER,
  DOOR,
  FLOOR_Y,
  MAYCRI_POS,
  CEILING_Y,
  HERO_PX,
  MINE_POS,
  PEST_PX,
  POT,
  RUG,
  SCENE_H,
  SCENE_W,
  SHELF_ITEM_PX,
  SHELF_ROW_Y,
  SHELF_TOP,
  SHELF_UNIT_GAP,
  SHELF_UNIT_W,
  SHELF_X0,
  SLOTS_PER_UNIT,
  slotPos,
  STORAGE_POS,
  WINDOW,
  WORKSHOP_H,
} from '../game/layout';
import type { Actor, Shop } from '../game/shop';
import type { Line } from '../game/shop/production';
import { drawRef, img, ready } from './images';

/** Staff sprites are drawn at this scale so they match the ~64px heroes. */
const STAFF_SCALE = 0.55;
const BUBBLE_SCALE = 0.72;
const LINE_ICON = { pot: icons.gems.ifrit, forge: icons.phy, capsule: icons.gems.garuda };
const FONT = '"DotGothic16", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

function frameAt(frames: Frame[], now: number): string {
  const total = frames.reduce((n, f) => n + f.ms, 0);
  let t = now % total;
  for (const f of frames) {
    if (t < f.ms) return f.image;
    t -= f.ms;
  }
  return frames[0].image;
}

function drawImg(ctx: CanvasRenderingContext2D, ref: string, x: number, y: number, w: number, h: number, flip = false): void {
  if (flip) {
    ctx.save();
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    drawRef(ctx, ref, 0, 0, w, h);
    ctx.restore();
  } else {
    drawRef(ctx, ref, x, y, w, h);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draws the storefront (static parts) into an offscreen canvas; redrawn when the shelf size changes. */
function paintStorefront(ctx: CanvasRenderingContext2D, slotCount: number): void {
  const top = WORKSHOP_H;
  // Back wall with vertical planks
  const wall = ctx.createLinearGradient(0, top, 0, FLOOR_Y);
  wall.addColorStop(0, '#3b2517');
  wall.addColorStop(1, '#55351f');
  ctx.fillStyle = wall;
  ctx.fillRect(0, top, SCENE_W, FLOOR_Y - top);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let x = 12; x < SCENE_W; x += 24) ctx.fillRect(x, top, 2, FLOOR_Y - top);
  // Beam separating workshop and storefront, and the skirting board
  ctx.fillStyle = '#24160d';
  ctx.fillRect(0, top, SCENE_W, 10);
  ctx.fillStyle = '#6e4526';
  ctx.fillRect(0, top + 10, SCENE_W, 3);
  ctx.fillStyle = '#2d1b10';
  ctx.fillRect(0, FLOOR_Y - 8, SCENE_W, 8);

  // Window on the back wall, looking out on a land of MCH
  const { x0: wx0, x1: wx1, top: wtop } = WINDOW;
  const ww = wx1 - wx0;
  const wh = WINDOW.y - wtop;
  const view = img(catalog.windowView);
  if (ready(view)) {
    const sw = view.naturalWidth;
    ctx.drawImage(view, 0, view.naturalHeight * 0.3, sw, (sw * wh) / ww, wx0, wtop, ww, wh);
  } else {
    ctx.fillStyle = '#9fd4ff';
    ctx.fillRect(wx0, wtop, ww, wh);
  }
  ctx.strokeStyle = '#2a190e';
  ctx.lineWidth = 5;
  ctx.strokeRect(wx0, wtop, ww, wh);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(wx0 + ww / 2, wtop);
  ctx.lineTo(wx0 + ww / 2, wtop + wh);
  ctx.moveTo(wx0, wtop + wh / 2);
  ctx.lineTo(wx1, wtop + wh / 2);
  ctx.stroke();
  ctx.fillStyle = '#6e4526';
  ctx.fillRect(wx0 - 6, WINDOW.y, ww + 12, 5);

  // Floor planks
  for (let i = 0, y = FLOOR_Y; y < SCENE_H; i++, y += 20) {
    ctx.fillStyle = i % 2 ? '#8b5a33' : '#7d4f2c';
    ctx.fillRect(0, y, SCENE_W, 20);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, y, SCENE_W, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = (i * 97) % 150; x < SCENE_W; x += 150) ctx.fillRect(x, y, 1, 20);
  }
  const shade = ctx.createLinearGradient(0, FLOOR_Y, 0, FLOOR_Y + 30);
  shade.addColorStop(0, 'rgba(0,0,0,0.35)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, FLOOR_Y, SCENE_W, 30);

  // Rug in the middle of a tall storefront
  if (RUG) {
    const { x0, x1, y0, y1 } = RUG;
    ctx.fillStyle = '#5b1f24';
    roundRect(ctx, x0, y0, x1 - x0, y1 - y0, 10);
    ctx.fill();
    ctx.strokeStyle = '#c9974f';
    ctx.lineWidth = 4;
    roundRect(ctx, x0 + 12, y0 + 12, x1 - x0 - 24, y1 - y0 - 24, 6);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(201,151,79,0.5)';
    ctx.lineWidth = 2;
    roundRect(ctx, x0 + 26, y0 + 26, x1 - x0 - 52, y1 - y0 - 52, 4);
    ctx.stroke();
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const r = Math.min(40, (y1 - y0) / 2 - 34);
    if (r > 8) {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 1.6, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 1.6, cy);
      ctx.closePath();
      ctx.stroke();
    }
  }

  // Doorway in the back wall, with a small GUM sign above it
  const dw = DOOR.x1 - DOOR.x0;
  ctx.fillStyle = '#24160d';
  ctx.fillRect(DOOR.x0 - 6, DOOR.top - 6, dw + 12, FLOOR_Y - DOOR.top + 6);
  const light = ctx.createLinearGradient(0, DOOR.top, 0, FLOOR_Y);
  light.addColorStop(0, '#fff2c2');
  light.addColorStop(1, '#ffd98a');
  ctx.fillStyle = light;
  ctx.fillRect(DOOR.x0, DOOR.top, dw, FLOOR_Y - DOOR.top);
  ctx.fillStyle = 'rgba(255,236,170,0.22)';
  ctx.beginPath();
  ctx.moveTo(DOOR.x0, FLOOR_Y);
  ctx.lineTo(DOOR.x1, FLOOR_Y);
  ctx.lineTo(DOOR.x1 + 30, FLOOR_Y + 60);
  ctx.lineTo(DOOR.x0 - 30, FLOOR_Y + 60);
  ctx.closePath();
  ctx.fill();
  const sign = img(icons.gum);
  if (ready(sign)) ctx.drawImage(sign, DOOR.x - 12, DOOR.top - 34, 24, 24);

  // Shelves: two boards of two items each, a little taller than a hero
  const units = Math.ceil(Math.max(slotCount, 1) / SLOTS_PER_UNIT);
  for (let u = 0; u < units; u++) {
    const x0 = SHELF_X0 + u * (SHELF_UNIT_W + SHELF_UNIT_GAP);
    const bottom = FLOOR_Y + 4;
    ctx.fillStyle = '#2d1b10';
    ctx.fillRect(x0 - 3, SHELF_TOP - 3, SHELF_UNIT_W + 6, bottom - SHELF_TOP + 3);
    ctx.fillStyle = '#4b2e1b';
    ctx.fillRect(x0, SHELF_TOP, SHELF_UNIT_W, bottom - SHELF_TOP - 4);
    ctx.fillStyle = '#b07a45';
    ctx.fillRect(x0 - 5, SHELF_TOP - 7, SHELF_UNIT_W + 10, 5);
    for (const ry of SHELF_ROW_Y) {
      ctx.fillStyle = '#a8713f';
      ctx.fillRect(x0 - 3, ry + 16, SHELF_UNIT_W + 6, 5);
      ctx.fillStyle = '#d19a60';
      ctx.fillRect(x0 - 3, ry + 16, SHELF_UNIT_W + 6, 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x0 - 3, ry + 21, SHELF_UNIT_W + 6, 2);
    }
    for (let k = 0; k < SLOTS_PER_UNIT; k++) {
      const index = u * SLOTS_PER_UNIT + k;
      const p = slotPos(index);
      if (index >= slotCount) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        roundRect(ctx, p.x - 14, p.y - 14, 28, 28, 5);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = `16px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('＋', p.x, p.y + 1);
      }
    }
  }
}

export class SceneRenderer {
  private bg: HTMLCanvasElement;
  private bgKey = '';
  private readonly ctx: CanvasRenderingContext2D;
  private scale = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.bg = document.createElement('canvas');
    this.bg.width = SCENE_W;
    this.bg.height = SCENE_H;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.scale = w / SCENE_W;
  }

  /** Converts a client (mouse) position to scene coordinates. */
  toScene(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * SCENE_W,
      y: ((clientY - rect.top) / rect.height) * SCENE_H,
    };
  }

  render(shop: Shop, now: number, hints: { pot: boolean; register: boolean }): void {
    const ctx = this.ctx;
    this.resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const key = `${shop.shelfSlots}|${ready(img(catalog.windowView))}|${SCENE_H}`;
    if (key !== this.bgKey) {
      this.bg.height = SCENE_H;
      const bctx = this.bg.getContext('2d')!;
      bctx.clearRect(0, 0, SCENE_W, SCENE_H);
      bctx.imageSmoothingEnabled = false;
      paintStorefront(bctx, shop.shelfSlots);
      this.bgKey = key;
    }
    ctx.drawImage(this.bg, 0, 0, SCENE_W, SCENE_H);

    this.drawShelfItems(shop, now);
    this.drawCounter(shop, now, hints.register);
    this.drawActors(shop, now);
    if (shop.stats.guardChance > 0) {
      drawImg(ctx, frameAt(staffFrames.maycri, now), MAYCRI_POS.x - 22, MAYCRI_POS.y - 44, 44, 44);
    }
    this.drawWorkshop(shop, now, hints.pot);
    this.drawFlyers(shop);
    this.drawEffects(shop);
    this.drawPopups(shop);
  }

  private drawShelfItems(shop: Shop, now: number): void {
    const ctx = this.ctx;
    shop.slots.forEach((slot, i) => {
      if (slot.item === null) return;
      const e = itemExt(slot.item);
      const p = slot;
      if (e.rarityIndex >= 2) {
        const pulse = 0.55 + 0.25 * Math.sin(now / 300 + i);
        const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 22);
        g.addColorStop(0, RARITY_COLOR[e.rarity] + 'aa');
        g.addColorStop(1, RARITY_COLOR[e.rarity] + '00');
        ctx.globalAlpha = pulse;
        ctx.fillStyle = g;
        ctx.fillRect(p.x - 22, p.y - 22, 44, 44);
        ctx.globalAlpha = 1;
      }
      drawImg(ctx, e.image, p.x - SHELF_ITEM_PX / 2, p.y + 16 - SHELF_ITEM_PX, SHELF_ITEM_PX, SHELF_ITEM_PX);
    });
    // Sparkles go on top so neighbouring items never hide them.
    shop.slots.forEach((slot, i) => {
      if (slot.item === null) return;
      const edition = itemEdition(slot.item);
      const shin = itemExt(slot.item).shin;
      if (edition === 0 && !shin) return;
      const p = slot;
      this.drawSparkle(p.x + SHELF_ITEM_PX / 2 - 2, p.y + 22 - SHELF_ITEM_PX, shin ? '#ff5d8f' : EDITIONS[edition].color, now / 400 + i);
    });
  }

  /** A twinkling four-point star marking edition and 真 items. */
  private drawSparkle(x: number, y: number, color: string, phase: number): void {
    const ctx = this.ctx;
    const r = 10 + 2.5 * Math.sin(phase * 2);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(phase * 0.5);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(40, 20, 0, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const rr = k % 2 === 0 ? r : r * 0.38;
      const a = (k * Math.PI) / 4;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawCounter(shop: Shop, now: number, hint: boolean): void {
    const ctx = this.ctx;
    // Chris stands behind the counter.
    const chris = shop.registerPulse > 0.2 ? staffFrames.chrisCheer : frameAt(staffFrames.chris, now);
    drawImg(ctx, chris, CHRIS_POS.x - 36 * STAFF_SCALE, CHRIS_POS.y - 140 * STAFF_SCALE, 72 * STAFF_SCALE, 140 * STAFF_SCALE);

    const { x0, x1, top, bottom } = COUNTER;
    ctx.fillStyle = '#c28b56';
    ctx.fillRect(x0 - 4, top, x1 - x0 + 8, 8);
    ctx.fillStyle = '#e0ab72';
    ctx.fillRect(x0 - 4, top, x1 - x0 + 8, 2);
    ctx.fillStyle = '#6f4326';
    ctx.fillRect(x0, top + 8, x1 - x0, bottom - top - 8);
    ctx.fillStyle = '#5c371f';
    for (let x = x0 + 6; x < x1 - 10; x += 36) ctx.fillRect(x, top + 14, 28, bottom - top - 20);
    // Register machine
    ctx.fillStyle = '#34495e';
    roundRect(ctx, x1 - 40, top - 18, 30, 19, 3);
    ctx.fill();
    ctx.fillStyle = '#9be7ff';
    ctx.fillRect(x1 - 35, top - 14, 20, 6);
    drawImg(ctx, icons.gum, x0 + 6, top + 13, 18, 18);

    // Checkout progress bars on the counter front
    shop.registerProgress.forEach((p, r) => {
      const y = top + 34 - r * 8;
      const w = x1 - x0 - 40;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x0 + 30, y, w, 5);
      ctx.fillStyle = '#7CFFB2';
      ctx.fillRect(x0 + 30, y, w * Math.min(1, p / shop.stats.cashierTime), 5);
    });

    if (hint || shop.registerPulse > 0) {
      const a = hint ? 0.5 + 0.5 * Math.sin(now / 200) : shop.registerPulse;
      ctx.strokeStyle = `rgba(255,230,120,${a})`;
      ctx.lineWidth = 4;
      roundRect(ctx, x0 - 8, top - 80, x1 - x0 + 16, bottom - top + 86, 10);
      ctx.stroke();
    }
  }

  private drawActors(shop: Shop, now: number): void {
    const ctx = this.ctx;
    const actors = [...shop.actors].sort((a, b) => a.y - b.y);
    for (const a of actors) {
      const walking = Math.abs(a.tx - a.x) + Math.abs(a.ty - a.y) > 3;
      const hop = walking && !a.rope ? Math.abs(Math.sin(a.bob)) * 4 : 0;
      const shake = a.hitFlash > 0 ? Math.sin(now / 20) * 5 * a.hitFlash : 0;
      const x = a.x - HERO_PX / 2 + shake;
      const y = a.y - HERO_PX - hop;
      if (a.rope) {
        ctx.strokeStyle = '#d8c39a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(a.x, CEILING_Y - 8);
        ctx.lineTo(a.x, y + 10);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(a.x, a.y - 1, 18, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const disguised = a.style?.disguise && (a.state === 'enter' || a.state === 'toShelf');
      if (a.kind === 'thief' && a.state !== 'caught' && !disguised) {
        // Villains glow red so they are easy to spot and tap.
        ctx.save();
        ctx.shadowColor = a.hitFlash > 0 ? 'rgba(255,255,255,1)' : 'rgba(255,40,40,0.95)';
        ctx.shadowBlur = 14;
        drawImg(ctx, a.hero.image, x, y, HERO_PX, HERO_PX, a.facing < 0);
        ctx.restore();
        // Remaining taps for tough villains
        if (a.style && a.style.hp > 1) {
          for (let i = 0; i < a.style.hp; i++) {
            ctx.fillStyle = i < a.hp ? '#ff4d4d' : 'rgba(0,0,0,0.5)';
            ctx.beginPath();
            ctx.arc(a.x - (a.style.hp - 1) * 7 + i * 14, a.y + 10, 5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else {
        ctx.globalAlpha = a.state === 'caught' ? Math.max(0, 1 - a.timer / 0.8) : 1;
        drawImg(ctx, a.hero.image, x, y, HERO_PX, HERO_PX, a.facing < 0);
        ctx.globalAlpha = 1;
      }
      this.drawBubble(shop, a, now);
    }
  }

  private drawBubble(shop: Shop, a: Actor, now: number): void {
    const ctx = this.ctx;
    const bx = a.x;
    const by = a.y - HERO_PX - 20;
    if (a.style?.disguise && (a.state === 'enter' || a.state === 'toShelf')) return;
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(BUBBLE_SCALE, BUBBLE_SCALE);
    ctx.translate(-bx, -by);
    this.drawBubbleBody(shop, a, now, bx, by);
    ctx.restore();
  }

  private drawBubbleBody(shop: Shop, a: Actor, now: number, bx: number, by: number): void {
    const ctx = this.ctx;
    const bubble = (w: number, h: number, fill = '#fffaf0') => {
      ctx.fillStyle = fill;
      roundRect(ctx, bx - w / 2, by - h / 2, w, h, 10);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bx - 6, by + h / 2 - 1);
      ctx.lineTo(bx + 6, by + h / 2 - 1);
      ctx.lineTo(bx, by + h / 2 + 9);
      ctx.fill();
    };
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (a.kind === 'thief') {
      if (a.state === 'caught') {
        bubble(56, 40, '#ffe3e3');
        drawImg(ctx, icons.fear, bx - 16, by - 16, 32, 32);
      } else if (a.item !== null) {
        bubble(52, 48, '#3b0d0d');
        drawImg(ctx, itemExt(a.item).image, bx - 22, by - 22, 44, 44);
      } else if (a.state === 'steal') {
        bubble(60, 36, '#3b0d0d');
        ctx.fillStyle = '#ff6b6b';
        ctx.font = `bold 24px ${FONT}`;
        ctx.fillText('ｷﾗｰﾝ', bx, by + 1);
      }
      return;
    }
    if (a.item !== null) {
      bubble(52, 48);
      drawImg(ctx, itemExt(a.item).image, bx - 22, by - 22, 44, 44);
      if (a.state === 'queue' || a.state === 'toQueue') {
        const left = 1 - a.timer / shop.stats.queuePatience;
        if (left < 0.5) {
          ctx.fillStyle = left < 0.25 ? '#ff5d5d' : '#ffb03b';
          ctx.fillRect(bx - 22, by + 20, 44 * Math.max(0, left), 4);
        }
      }
    } else if (a.mood === 'thinking') {
      bubble(56, 36);
      ctx.fillStyle = '#5b4636';
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText('…？', bx, by);
      const left = 1 - a.timer / shop.stats.patience;
      ctx.fillStyle = left < 0.3 ? '#ff5d5d' : '#7CFFB2';
      ctx.fillRect(bx - 24, by + 13, 48 * Math.max(0, left), 4);
    } else if (a.mood === 'angry') {
      bubble(48, 36, '#ffe3e3');
      ctx.fillStyle = '#e03131';
      ctx.font = `bold 24px ${FONT}`;
      ctx.fillText('!!', bx, by + 1);
    } else if (a.mood === 'happy') {
      const fade = Math.max(0, 1 - a.timer / 1.2);
      if (fade > 0) {
        ctx.globalAlpha = fade;
        bubble(48, 36);
        ctx.fillStyle = '#f08c00';
        ctx.font = `bold 24px ${FONT}`;
        ctx.fillText('♪', bx, by + 1 + Math.sin(now / 120) * 2);
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawWorkshop(shop: Shop, now: number, hint: boolean): void {
    const ctx = this.ctx;
    // Mine-chan stirs the pot.
    const pot = shop.lines.find((l) => l.id === 'pot');
    if (pot && pot.stats.helperInterval > 0) {
      const f = frameAt(staffFrames.mine, now);
      const jump = pot.helperPulse * 10;
      drawImg(ctx, f, MINE_POS.x - 48 * STAFF_SCALE, MINE_POS.y - 128 * STAFF_SCALE - jump, 96 * STAFF_SCALE, 128 * STAFF_SCALE);
    }

    // Storage badge on the conveyor
    if (shop.stats.storageCap > 0) {
      const { x, y } = STORAGE_POS;
      ctx.fillStyle = 'rgba(20,12,6,0.78)';
      roundRect(ctx, x - 80, y - 34, 160, 68, 12);
      ctx.fill();
      ctx.strokeStyle = '#d9a75f';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#ffe9c2';
      ctx.font = `20px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`倉庫 ${shop.storage.length}/${shop.stats.storageCap}`, x - 70, y - 14);
      shop.storage.slice(0, 4).forEach((id, i) => drawImg(ctx, itemExt(id).image, x - 72 + i * 36, y + 2, 32, 32));
    }

    for (const line of shop.lines) this.drawLineRing(shop, line, now, hint && line.id === 'pot');

    // Pests roaming the workshop
    for (const p of shop.pestList) {
      const k = p.hopDur > 0 ? p.hopT / p.hopDur : 1;
      const lift = k < 1 ? Math.sin(Math.PI * k) * 60 : 0;
      const wob = k >= 1 ? Math.sin(now / 90 + p.id) * 3 : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 1, 20, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.shadowColor = 'rgba(255,60,200,0.9)';
      ctx.shadowBlur = 16;
      drawImg(ctx, p.image, p.x - PEST_PX / 2 + wob, p.y - PEST_PX - lift, PEST_PX, PEST_PX, p.toX < p.fromX);
      ctx.restore();
      drawImg(ctx, icons.sleep, p.x + 18, p.y - PEST_PX - lift - 14, 24, 24);
    }
  }

  private drawEffects(shop: Shop): void {
    const ctx = this.ctx;
    for (const e of shop.fx) {
      const k = e.t / 0.7;
      if (e.kind === 'smoke') {
        ctx.fillStyle = `rgba(220,210,230,${0.6 * (1 - k)})`;
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2;
          const r = 10 + k * 40;
          ctx.beginPath();
          ctx.arc(e.x + Math.cos(ang) * r, e.y + Math.sin(ang) * r * 0.6, 16 + k * 14, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = `rgba(255,240,150,${1 - k})`;
        ctx.lineWidth = 4;
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(e.x + Math.cos(ang) * (8 + k * 20), e.y + Math.sin(ang) * (8 + k * 20));
          ctx.lineTo(e.x + Math.cos(ang) * (20 + k * 36), e.y + Math.sin(ang) * (20 + k * 36));
          ctx.stroke();
        }
      }
    }
  }

  /** A production line's progress ring, with its heat gauge and state. */
  private drawLineRing(shop: Shop, line: Line, now: number, hint: boolean): void {
    const ctx = this.ctx;
    const { x: cx, y: cy } = line.station.ring;
    const r = 38 + line.pulse * 6;
    ctx.fillStyle = 'rgba(20,10,30,0.72)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // Progress
    ctx.strokeStyle = line.jam > 0 ? '#777' : line.blocked ? '#ff6b6b' : line.holding ? '#ff9f43' : shop.pestList.length ? '#ffb86b' : '#ffd166';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, line.progress));
    ctx.stroke();
    // Heat gauge (outer arc, green → red)
    if (line.heat > 0.01) {
      const hue = 120 - 120 * Math.min(1, line.heat);
      ctx.strokeStyle = `hsl(${hue} 90% 55%)`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 5, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * Math.min(1, line.heat));
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 18px ${FONT}`;
    if (line.jam > 0) {
      ctx.fillStyle = '#ff8a8a';
      ctx.fillText('過熱', cx, cy - 8);
      ctx.fillText(`${line.jam.toFixed(1)}`, cx, cy + 12);
    } else if (line.idle) {
      ctx.fillText('ﾚｼﾋﾟ', cx, cy - 8);
      ctx.fillText('なし', cx, cy + 12);
    } else if (line.blocked) {
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText('満杯', cx, cy);
    } else {
      drawImg(ctx, LINE_ICON[line.id], cx - 20, cy - 20, 40, 40);
    }
    if (line.gem) drawImg(ctx, icons.gems[line.gem], cx + r - 16, cy - r - 4, 24, 24);
    if (hint) {
      const a = 0.5 + 0.5 * Math.sin(now / 200);
      ctx.strokeStyle = `rgba(255,230,120,${a})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(POT.x, POT.y + 20, 120, 110, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,240,180,${0.6 + 0.4 * a})`;
      ctx.font = `bold 26px ${FONT}`;
      ctx.fillText('タップ！', cx, cy - r - 24);
    }
  }

  private drawFlyers(shop: Shop): void {
    const ctx = this.ctx;
    for (const f of shop.flyers) {
      const t = Math.min(1, f.t / f.dur);
      const e = t * t * (3 - 2 * t);
      const x = f.fromX + (f.toX - f.fromX) * e;
      const y = f.fromY + (f.toY - f.fromY) * e - Math.sin(Math.PI * t) * 200;
      const ext = itemExt(f.item);
      const size = 56 + Math.sin(Math.PI * t) * 20;
      if (ext.rarityIndex >= 1) {
        const g = ctx.createRadialGradient(x, y, 2, x, y, size * 0.8);
        g.addColorStop(0, RARITY_COLOR[ext.rarity] + 'cc');
        g.addColorStop(1, RARITY_COLOR[ext.rarity] + '00');
        ctx.fillStyle = g;
        ctx.fillRect(x - size, y - size, size * 2, size * 2);
      }
      drawImg(ctx, ext.image, x - size / 2, y - size / 2, size, size);
    }
  }

  private drawPopups(shop: Shop): void {
    const ctx = this.ctx;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 24px ${FONT}`;
    for (const p of shop.popups) {
      const a = Math.max(0, 1 - p.t / 1.4);
      const y = p.y - p.t * 60;
      ctx.globalAlpha = a;
      const w = ctx.measureText(p.text).width + 34;
      if (p.icon) drawImg(ctx, icons.gum, p.x - w / 2, y - 14, 28, 28);
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(40,20,0,0.9)';
      ctx.strokeText(p.text, p.x - w / 2 + 32, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x - w / 2 + 32, y);
      ctx.globalAlpha = 1;
    }
  }
}
