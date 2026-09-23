import { catalog, getExtension, icons, RARITY_COLOR, staffFrames, type Frame } from '../game/catalog';
import {
  CHRIS_POS,
  COUNTER,
  CRAFT_RING,
  FLOOR_Y,
  MAYCRI_POS,
  MINE_POS,
  PEST_POS,
  POT,
  SCENE_H,
  SCENE_W,
  SHELF_ROW_Y,
  SHELF_TOP,
  SHELF_UNIT_GAP,
  SHELF_UNIT_W,
  SHELF_X0,
  SLOTS_PER_UNIT,
  slotPos,
  STORAGE_POS,
  WORKSHOP_H,
} from '../game/layout';
import type { Actor, Shop } from '../game/shop';
import { img, ready } from './images';

const HERO_SCALE = 1.9;
const HERO_PX = 64 * HERO_SCALE;
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

function drawImg(ctx: CanvasRenderingContext2D, path: string, x: number, y: number, w: number, h: number, flip = false): void {
  const im = img(path);
  if (!ready(im)) return;
  if (flip) {
    ctx.save();
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(im, 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(im, x, y, w, h);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draws the storefront (static parts) into an offscreen canvas; redrawn when the shelf size changes. */
function paintStorefront(ctx: CanvasRenderingContext2D, slotCount: number): void {
  const top = WORKSHOP_H;
  // Back wall
  const wall = ctx.createLinearGradient(0, top, 0, FLOOR_Y);
  wall.addColorStop(0, '#3b2517');
  wall.addColorStop(1, '#55351f');
  ctx.fillStyle = wall;
  ctx.fillRect(0, top, SCENE_W, FLOOR_Y - top);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  for (let x = 20; x < SCENE_W; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, FLOOR_Y);
    ctx.stroke();
  }
  // Beam separating workshop and storefront
  ctx.fillStyle = '#24160d';
  ctx.fillRect(0, top, SCENE_W, 16);
  ctx.fillStyle = '#6e4526';
  ctx.fillRect(0, top + 16, SCENE_W, 4);

  // Window above the counter, looking out on a land of MCH
  const wx = 40;
  const wy = top + 34;
  const ww = 200;
  const wh = 92;
  const view = img(catalog.windowView);
  if (ready(view)) {
    const sw = view.naturalWidth;
    const sh = (sw * wh) / ww;
    ctx.drawImage(view, 0, view.naturalHeight * 0.3, sw, sh, wx, wy, ww, wh);
  } else {
    ctx.fillStyle = '#9fd4ff';
    ctx.fillRect(wx, wy, ww, wh);
  }
  ctx.strokeStyle = '#2a190e';
  ctx.lineWidth = 8;
  ctx.strokeRect(wx, wy, ww, wh);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(wx + ww / 2, wy);
  ctx.lineTo(wx + ww / 2, wy + wh);
  ctx.moveTo(wx, wy + wh / 2);
  ctx.lineTo(wx + ww, wy + wh / 2);
  ctx.stroke();

  // Floor planks
  for (let i = 0, y = FLOOR_Y; y < SCENE_H; i++, y += 34) {
    ctx.fillStyle = i % 2 ? '#8b5a33' : '#7d4f2c';
    ctx.fillRect(0, y, SCENE_W, 34);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, y, SCENE_W, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = (i * 137) % 220; x < SCENE_W; x += 220) ctx.fillRect(x, y, 2, 34);
  }
  const shade = ctx.createLinearGradient(0, FLOOR_Y, 0, FLOOR_Y + 60);
  shade.addColorStop(0, 'rgba(0,0,0,0.35)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, FLOOR_Y, SCENE_W, 60);

  // Door (right)
  ctx.fillStyle = '#24160d';
  ctx.fillRect(918, top + 50, 82, FLOOR_Y + 190 - (top + 50));
  const light = ctx.createLinearGradient(930, 0, 1000, 0);
  light.addColorStop(0, '#fff2c2');
  light.addColorStop(1, '#ffd98a');
  ctx.fillStyle = light;
  ctx.fillRect(930, top + 62, 70, FLOOR_Y + 178 - (top + 62));
  ctx.fillStyle = 'rgba(255,236,170,0.25)';
  ctx.beginPath();
  ctx.moveTo(930, FLOOR_Y + 190);
  ctx.lineTo(1000, FLOOR_Y + 190);
  ctx.lineTo(1000, SCENE_H);
  ctx.lineTo(820, SCENE_H);
  ctx.closePath();
  ctx.fill();

  // Shelves
  const units = Math.ceil(Math.max(slotCount, 1) / SLOTS_PER_UNIT);
  for (let u = 0; u < units; u++) {
    const x0 = SHELF_X0 + u * (SHELF_UNIT_W + SHELF_UNIT_GAP);
    ctx.fillStyle = '#2d1b10';
    ctx.fillRect(x0 - 4, SHELF_TOP - 6, SHELF_UNIT_W + 8, 222);
    ctx.fillStyle = '#4b2e1b';
    ctx.fillRect(x0, SHELF_TOP, SHELF_UNIT_W, 210);
    ctx.fillStyle = '#b07a45';
    ctx.fillRect(x0 - 8, SHELF_TOP - 12, SHELF_UNIT_W + 16, 10);
    for (const ry of SHELF_ROW_Y) {
      ctx.fillStyle = '#a8713f';
      ctx.fillRect(x0 - 6, ry + 30, SHELF_UNIT_W + 12, 10);
      ctx.fillStyle = '#d19a60';
      ctx.fillRect(x0 - 6, ry + 30, SHELF_UNIT_W + 12, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(x0 - 6, ry + 40, SHELF_UNIT_W + 12, 4);
    }
    ctx.fillStyle = '#2d1b10';
    ctx.fillRect(x0 - 4, SHELF_TOP + 214, 12, 30);
    ctx.fillRect(x0 + SHELF_UNIT_W - 8, SHELF_TOP + 214, 12, 30);
    for (let k = 0; k < SLOTS_PER_UNIT; k++) {
      const index = u * SLOTS_PER_UNIT + k;
      const p = slotPos(index);
      if (index >= slotCount) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        roundRect(ctx, p.x - 28, p.y - 26, 56, 56, 8);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.font = `28px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('＋', p.x, p.y + 2);
      } else {
        ctx.fillStyle = 'rgba(255,220,160,0.08)';
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 26, 28, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Counter back shelf
  ctx.fillStyle = '#3a2416';
  ctx.fillRect(COUNTER.x0 + 6, COUNTER.top - 26, COUNTER.x1 - COUNTER.x0 - 12, 26);
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

    const key = `${shop.slots.length}|${ready(img(catalog.windowView))}`;
    if (key !== this.bgKey) {
      const bctx = this.bg.getContext('2d')!;
      bctx.clearRect(0, 0, SCENE_W, SCENE_H);
      bctx.imageSmoothingEnabled = false;
      paintStorefront(bctx, shop.slots.length);
      this.bgKey = key;
    }
    ctx.drawImage(this.bg, 0, 0, SCENE_W, SCENE_H);

    this.drawShelfItems(shop, now);
    this.drawCounter(shop, now, hints.register);
    this.drawActors(shop, now);
    if (shop.stats.guardChance > 0) {
      drawImg(ctx, frameAt(staffFrames.maycri, now), MAYCRI_POS.x - 40, MAYCRI_POS.y - 80, 80, 80);
    }
    this.drawWorkshop(shop, now, hints.pot);
    this.drawFlyers(shop);
    this.drawPopups(shop);
  }

  private drawShelfItems(shop: Shop, now: number): void {
    const ctx = this.ctx;
    shop.slots.forEach((slot, i) => {
      if (slot.item === null) return;
      const e = getExtension(slot.item);
      const p = slotPos(i);
      if (e.rarityIndex >= 2) {
        const pulse = 0.55 + 0.25 * Math.sin(now / 300 + i);
        const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 40);
        g.addColorStop(0, RARITY_COLOR[e.rarity] + 'aa');
        g.addColorStop(1, RARITY_COLOR[e.rarity] + '00');
        ctx.globalAlpha = pulse;
        ctx.fillStyle = g;
        ctx.fillRect(p.x - 40, p.y - 40, 80, 80);
        ctx.globalAlpha = 1;
      }
      drawImg(ctx, e.image, p.x - 32, p.y - 34, 64, 64);
    });
  }

  private drawCounter(shop: Shop, now: number, hint: boolean): void {
    const ctx = this.ctx;
    // Chris stands behind the counter.
    const chris = shop.registerPulse > 0.2 ? staffFrames.chrisCheer : frameAt(staffFrames.chris, now);
    drawImg(ctx, chris, CHRIS_POS.x - 36, CHRIS_POS.y - 140, 72, 140);

    const { x0, x1, top, bottom } = COUNTER;
    ctx.fillStyle = '#c28b56';
    ctx.fillRect(x0 - 6, top, x1 - x0 + 12, 16);
    ctx.fillStyle = '#e0ab72';
    ctx.fillRect(x0 - 6, top, x1 - x0 + 12, 4);
    ctx.fillStyle = '#6f4326';
    ctx.fillRect(x0, top + 16, x1 - x0, bottom - top - 16);
    ctx.fillStyle = '#5c371f';
    for (let x = x0 + 12; x < x1 - 20; x += 58) ctx.fillRect(x, top + 30, 46, bottom - top - 44);
    // Register machine
    ctx.fillStyle = '#34495e';
    roundRect(ctx, x1 - 70, top - 34, 54, 36, 4);
    ctx.fill();
    ctx.fillStyle = '#9be7ff';
    ctx.fillRect(x1 - 62, top - 28, 38, 12);
    drawImg(ctx, icons.gum, x0 + 20, top + 38, 40, 40);

    // Checkout progress bars
    shop.registerProgress.forEach((p, r) => {
      const y = top + 88 - r * 14;
      const w = x1 - x0 - 90;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x0 + 72, y, w, 9);
      ctx.fillStyle = '#7CFFB2';
      ctx.fillRect(x0 + 72, y, (w * Math.min(1, p / shop.stats.cashierTime)), 9);
    });

    if (hint || shop.registerPulse > 0) {
      const a = hint ? 0.5 + 0.5 * Math.sin(now / 200) : shop.registerPulse;
      ctx.strokeStyle = `rgba(255,230,120,${a})`;
      ctx.lineWidth = 4;
      roundRect(ctx, x0 - 10, top - 150, x1 - x0 + 20, bottom - top + 156, 12);
      ctx.stroke();
    }
  }

  private drawActors(shop: Shop, now: number): void {
    const ctx = this.ctx;
    const actors = [...shop.actors].sort((a, b) => a.y - b.y);
    for (const a of actors) {
      const walking = Math.abs(a.tx - a.x) + Math.abs(a.ty - a.y) > 3;
      const hop = walking ? Math.abs(Math.sin(a.bob)) * 6 : 0;
      const x = a.x - HERO_PX / 2;
      const y = a.y - HERO_PX - hop;
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(a.x, a.y - 2, 30, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      if (a.kind === 'thief' && a.state !== 'caught') {
        // Villains glow red so they are easy to spot and click.
        ctx.save();
        ctx.shadowColor = 'rgba(255,40,40,0.95)';
        ctx.shadowBlur = 18;
        drawImg(ctx, a.hero.image, x, y, HERO_PX, HERO_PX, a.facing < 0);
        ctx.restore();
      } else {
        ctx.globalAlpha = a.state === 'caught' ? 0.6 : 1;
        drawImg(ctx, a.hero.image, x, y, HERO_PX, HERO_PX, a.facing < 0);
        ctx.globalAlpha = 1;
      }
      this.drawBubble(shop, a, now);
    }
  }

  private drawBubble(shop: Shop, a: Actor, now: number): void {
    const ctx = this.ctx;
    const bx = a.x;
    const by = a.y - HERO_PX - 30;
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
        drawImg(ctx, getExtension(a.item).image, bx - 22, by - 22, 44, 44);
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
      drawImg(ctx, getExtension(a.item).image, bx - 22, by - 22, 44, 44);
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
    if (shop.stats.mineInterval > 0) {
      const f = frameAt(staffFrames.mine, now);
      const jump = shop.minePulse * 10;
      drawImg(ctx, f, MINE_POS.x - 48, MINE_POS.y - 128 - jump, 96, 128);
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
      shop.storage.slice(0, 4).forEach((id, i) => drawImg(ctx, getExtension(id).image, x - 72 + i * 36, y + 2, 32, 32));
    }

    // Pot progress ring
    const cx = CRAFT_RING.x;
    const cy = CRAFT_RING.y;
    const r = 38 + shop.potPulse * 6;
    ctx.fillStyle = 'rgba(20,10,30,0.72)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shop.craftBlocked ? '#ff6b6b' : shop.pest ? '#ff9f43' : '#ffd166';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, shop.craftProgress));
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (shop.craftBlocked) {
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText('満杯', cx, cy);
    } else {
      drawImg(ctx, icons.gems.ifrit, cx - 20, cy - 20, 40, 40);
    }
    if (hint) {
      const a = 0.5 + 0.5 * Math.sin(now / 200);
      ctx.strokeStyle = `rgba(255,230,120,${a})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(POT.x, POT.y + 20, 120, 110, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,240,180,${0.6 + 0.4 * a})`;
      ctx.font = `bold 26px ${FONT}`;
      ctx.fillText('クリック！', cx, cy - r - 24);
    }

    // Pest on the pot
    if (shop.pest) {
      const wob = Math.sin(now / 90) * 4;
      const s = 150;
      ctx.save();
      ctx.shadowColor = 'rgba(255,60,200,0.9)';
      ctx.shadowBlur = 20;
      drawImg(ctx, shop.pest.image, PEST_POS.x - s / 2 + wob, PEST_POS.y - s, s, s);
      ctx.restore();
      drawImg(ctx, icons.sleep, PEST_POS.x + 40, PEST_POS.y - s - 10, 36, 36);
    }
  }

  private drawFlyers(shop: Shop): void {
    const ctx = this.ctx;
    for (const f of shop.flyers) {
      const t = Math.min(1, f.t / f.dur);
      const e = t * t * (3 - 2 * t);
      const x = f.fromX + (f.toX - f.fromX) * e;
      const y = f.fromY + (f.toY - f.fromY) * e - Math.sin(Math.PI * t) * 200;
      const ext = getExtension(f.item);
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
    ctx.font = `bold 28px ${FONT}`;
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
