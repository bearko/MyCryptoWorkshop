import { catalog, icons, lands, merchants, RARITY_COLOR, series, seriesIcon, staffFrames, staffHeroes, storePests, type Frame } from '../game/catalog';
import { landOf } from '../game/conditions';
import { EDITIONS, itemEdition, itemExt } from '../game/items';
import {
  CHRIS_POS,
  COUNTER,
  DOOR,
  FLOOR_Y,
  MAYCRI_POS,
  MAX_SHOWCASE,
  CEILING_Y,
  POTION_BAR,
  POTION_STAND,
  SHOWCASE,
  showcasePos,
  TRIAL,
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
import type { Actor, Shop, StaffMember } from '../game/shop';
import { ROLES } from '../game/staff';
import type { Line } from '../game/shop/production';
import { drawRef, fileOf, img, ready } from './images';

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

/** What is built in the shop; the static storefront is repainted when this changes. */
interface Furnishing {
  /** Scenery in the window (a land's view on its land day). */
  view: string;
  slotCount: number;
  rug: number;
  showcase: number;
  potionStand: boolean;
  bar: boolean;
  trial: boolean;
}

function furnishingOf(shop: Shop): Furnishing {
  const s = shop.stats;
  return {
    view: landOf(shop.condition)?.view ?? homeLand(shop)?.view ?? catalog.windowView,
    slotCount: shop.shelfSlots,
    rug: s.rug,
    showcase: Math.min(MAX_SHOWCASE, s.showcaseSlots),
    potionStand: s.potionStand > 0,
    bar: s.barChance > 0,
    trial: s.trialChance > 0,
  };
}

/** Decorative icons used by the furniture. */
const DECOR = {
  potion: seriesIcon('Goblet', 1),
  potion2: seriesIcon('Goblet', 3),
  sake: seriesIcon('Sake', 2),
  crown: seriesIcon('Crown', 3),
  coin: seriesIcon('Wallet', 1),
  book: seriesIcon('Book', 2),
  monocle: seriesIcon('Monocle', 2),
  robot: seriesIcon('Combined Robots', 1),
  sword: seriesIcon('Enhanced Sword', 2),
  bundle: seriesIcon('Mantle', 0),
  net: seriesIcon('Cat Teaser', 1),
  crownVip: seriesIcon('Crown', 4),
  flag: seriesIcon('Oriflamme', 1),
};

/** The land the workshop moved to (its view and cryptid by default). */
const homeLand = (shop: Shop) => lands.find((l) => l.key === shop.save.prestige.home);

/** Vehicle icons by stats.vehicle (1 carriage, 2 airship, 3 land gate). */
const VEHICLE_ICONS = ['', seriesIcon('Horse', 3), seriesIcon('Spaceship', 2), seriesIcon('Ferris wheel', 3)];
const VEHICLE_NAMES = ['', '乗合馬車', '飛空艇', 'ランドゲート'];

/** Staff who work at a desk, and what lies on it. */
const DESKS: Partial<Record<string, string>> = { accountant: DECOR.coin, researcher: DECOR.book, appraiser: DECOR.monocle };

/** Extra sprites the scene draws (preloaded at boot so the cached storefront is complete). */
export const SCENE_SPRITES = [
  ...Object.values(DECOR),
  ...VEHICLE_ICONS.filter(Boolean),
  ...Object.values(staffHeroes).flatMap((s) => [s.hero.image, s.ace.image]),
  ...storePests.map((p) => p.image),
  ...merchants.map((m) => m.image),
  icons.mai,
  ...lands.map((l) => l.cryptid),
];

/** Draws the storefront (static parts) into an offscreen canvas; redrawn when the furnishing changes. */
function paintStorefront(ctx: CanvasRenderingContext2D, f: Furnishing): void {
  const slotCount = f.slotCount;
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
  const view = img(f.view);
  if (ready(view)) {
    ctx.drawImage(view, wx0, wtop, ww, wh);
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
    // A plain mat until the 高級絨毯 upgrade; each level adds gold trim.
    const { x0, x1, y0, y1 } = RUG;
    const fancy = f.rug > 0;
    ctx.fillStyle = fancy ? '#7a1f2b' : '#5b3a2a';
    roundRect(ctx, x0, y0, x1 - x0, y1 - y0, 10);
    ctx.fill();
    if (fancy) {
      // Fringe on the short sides
      ctx.fillStyle = '#e8c27a';
      for (let y = y0 + 6; y < y1 - 4; y += 8) {
        ctx.fillRect(x0 - 6, y, 6, 3);
        ctx.fillRect(x1, y, 6, 3);
      }
    }
    ctx.strokeStyle = fancy ? '#e8b75a' : 'rgba(201,151,79,0.45)';
    ctx.lineWidth = fancy ? 4 : 2;
    roundRect(ctx, x0 + 10, y0 + 10, x1 - x0 - 20, y1 - y0 - 20, 6);
    ctx.stroke();
    for (let k = 1; k < Math.min(f.rug, 4); k++) {
      const inset = 10 + k * 9;
      if (y1 - y0 - inset * 2 < 16) break;
      ctx.strokeStyle = `rgba(232,183,90,${0.7 - k * 0.12})`;
      ctx.lineWidth = 2;
      roundRect(ctx, x0 + inset, y0 + inset, x1 - x0 - inset * 2, y1 - y0 - inset * 2, 4);
      ctx.stroke();
    }
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const r = Math.min(40, (y1 - y0) / 2 - 34);
    ctx.strokeStyle = fancy ? '#e8b75a' : 'rgba(201,151,79,0.45)';
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

  if (f.showcase > 0) paintShowcase(ctx, f.showcase);
  if (f.potionStand) paintPotionStand(ctx);
  if (f.bar) paintPotionBar(ctx);
  if (f.trial) paintTrialArea(ctx);
}

/** Glass cabinet for valuable items, with lights; locked slots show a plus. */
function paintShowcase(ctx: CanvasRenderingContext2D, slots: number): void {
  const { x0, x1, top } = SHOWCASE;
  const bottom = FLOOR_Y + 4;
  ctx.fillStyle = '#1d120b';
  ctx.fillRect(x0 - 4, top - 4, x1 - x0 + 8, bottom - top + 4);
  ctx.fillStyle = '#6d2c3a';
  ctx.fillRect(x0, top, x1 - x0, bottom - top - 4);
  const glass = ctx.createLinearGradient(x0, top, x1, bottom);
  glass.addColorStop(0, 'rgba(190,230,255,0.28)');
  glass.addColorStop(0.5, 'rgba(190,230,255,0.08)');
  glass.addColorStop(1, 'rgba(190,230,255,0.22)');
  ctx.fillStyle = glass;
  ctx.fillRect(x0 + 4, top + 4, x1 - x0 - 8, bottom - top - 12);
  ctx.fillStyle = '#e8b75a';
  ctx.fillRect(x0 - 6, top - 9, x1 - x0 + 12, 6);
  for (const ry of SHELF_ROW_Y) {
    ctx.fillStyle = '#e8b75a';
    ctx.fillRect(x0 + 2, ry + 16, x1 - x0 - 4, 3);
  }
  drawImg(ctx, DECOR.crown, (x0 + x1) / 2 - 12, top - 34, 24, 24);
  for (let i = slots; i < MAX_SHOWCASE; i++) {
    const p = showcasePos(i);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, p.x - 13, p.y - 13, 26, 26, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = `15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('＋', p.x, p.y + 1);
  }
}

/** Small table by the door with free potions. */
function paintPotionStand(ctx: CanvasRenderingContext2D): void {
  const { x, y } = POTION_STAND;
  ctx.fillStyle = '#4b2e1b';
  ctx.fillRect(x - 26, y - 34, 52, 34);
  ctx.fillStyle = '#b07a45';
  ctx.fillRect(x - 30, y - 38, 60, 6);
  drawImg(ctx, DECOR.potion, x - 28, y - 64, 26, 26);
  drawImg(ctx, DECOR.potion2, x - 2, y - 66, 28, 28);
  ctx.fillStyle = '#fff3c4';
  roundRect(ctx, x - 22, y - 26, 44, 16, 4);
  ctx.fill();
  ctx.fillStyle = '#b03a2e';
  ctx.font = `bold 12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FREE', x, y - 17);
}

/** Bar counter under the register, with bottles on a back shelf. */
function paintPotionBar(ctx: CanvasRenderingContext2D): void {
  const { x0, x1, y } = POTION_BAR;
  // Back shelf with bottles
  ctx.fillStyle = '#3b2415';
  ctx.fillRect(x0, y - 70, x1 - x0, 8);
  for (let i = 0; i < 4; i++) drawImg(ctx, i % 2 ? DECOR.sake : DECOR.potion, x0 + 10 + i * 42, y - 100, 30, 30);
  // Counter
  ctx.fillStyle = '#c28b56';
  ctx.fillRect(x0 - 2, y, x1 - x0 + 4, 8);
  ctx.fillStyle = '#6f4326';
  ctx.fillRect(x0, y + 8, x1 - x0, 22);
  ctx.fillStyle = '#ffe9c2';
  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('POTION BAR', (x0 + x1) / 2, y + 19);
}

/** Straw dummy on a mat, where customers try out what they bought. */
function paintTrialArea(ctx: CanvasRenderingContext2D): void {
  const { dummy, spot } = TRIAL;
  ctx.fillStyle = 'rgba(60,90,40,0.55)';
  roundRect(ctx, spot.x - 40, dummy.y - 26, dummy.x - spot.x + 76, 36, 8);
  ctx.fill();
  // Post and straw body
  ctx.fillStyle = '#6b4424';
  ctx.fillRect(dummy.x - 3, dummy.y - 70, 6, 70);
  ctx.fillRect(dummy.x - 22, dummy.y - 56, 44, 5);
  ctx.fillStyle = '#d9b562';
  roundRect(ctx, dummy.x - 13, dummy.y - 62, 26, 40, 8);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(dummy.x, dummy.y - 72, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#9c7a35';
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    ctx.beginPath();
    ctx.moveTo(dummy.x - 12, dummy.y - 52 + k * 10);
    ctx.lineTo(dummy.x + 12, dummy.y - 52 + k * 10);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffe9c2';
  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('試し斬り', dummy.x - 30, dummy.y + 2);
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

    const furnish = furnishingOf(shop);
    const loaded = ready(img(furnish.view)) && Object.values(DECOR).every((r) => ready(img(fileOf(r))));
    const key = `${JSON.stringify(furnish)}|${loaded}|${SCENE_H}`;
    if (key !== this.bgKey) {
      this.bg.height = SCENE_H;
      const bctx = this.bg.getContext('2d')!;
      bctx.clearRect(0, 0, SCENE_W, SCENE_H);
      bctx.imageSmoothingEnabled = false;
      paintStorefront(bctx, furnish);
      this.bgKey = key;
    }
    ctx.drawImage(this.bg, 0, 0, SCENE_W, SCENE_H);

    this.drawFloorHazards(shop, now);
    this.drawShelfItems(shop, now);
    this.drawCounter(shop, now, hints.register);
    this.drawActors(shop, now);
    this.drawShopEvents(shop, now);
    if (shop.stats.guardChance > 0) {
      drawImg(ctx, frameAt(staffFrames.maycri, now), MAYCRI_POS.x - 22, MAYCRI_POS.y - 44, 44, 44);
    }
    this.drawWorkshop(shop, now, hints.pot);
    this.drawFlyers(shop);
    this.drawWeather(shop, now);
    this.drawEffects(shop);
    this.drawPopups(shop);
  }

  /** Last lightning strike of the cryptid (drawn for a moment). */
  private strike: { x: number; y: number; at: number } | null = null;

  /** Mud, litter and dropped coins on the shop floor (under everyone's feet). */
  private drawFloorHazards(shop: Shop, now: number): void {
    const ctx = this.ctx;
    for (const m of shop.hazards.messes) {
      const grow = Math.min(1, m.t / 0.4);
      if (m.kind === 'mud') {
        ctx.fillStyle = 'rgba(78,52,30,0.85)';
        for (const [dx, dy, r] of [[0, 0, 22], [-16, 4, 12], [15, -3, 13], [6, 7, 10]]) {
          ctx.beginPath();
          ctx.ellipse(m.x + dx, m.y + dy, r * grow, r * 0.45 * grow, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.ellipse(m.x - 5, m.y - 3, 7 * grow, 2 * grow, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Broken chest boards and packing paper
        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.scale(grow, grow);
        ctx.fillStyle = '#8a5a2b';
        ctx.rotate(0.4);
        ctx.fillRect(-20, -4, 26, 7);
        ctx.rotate(-0.9);
        ctx.fillRect(-4, 2, 22, 6);
        ctx.fillStyle = '#e8d6a8';
        ctx.fillRect(6, -10, 10, 8);
        ctx.restore();
      }
    }
    for (const c of shop.hazards.coins) {
      const blink = c.t > 12 ? (Math.sin(now / 80) > 0 ? 1 : 0.3) : 1;
      ctx.globalAlpha = blink;
      drawImg(ctx, icons.gum, c.x - 11, c.y - 16, 22, 22);
      if (Math.sin(now / 200 + c.id) > 0.7) this.drawSparkle(c.x + 9, c.y - 16, '#fff6c8', now / 300 + c.id);
      ctx.globalAlpha = 1;
    }
  }

  /** Shop enemies, chests, the cryptid, visitors and the vehicle banner. */
  private drawShopEvents(shop: Shop, now: number): void {
    const ctx = this.ctx;
    const hz = shop.hazards;
    for (const p of hz.pests) {
      const shake = p.hitFlash > 0 ? Math.sin(now / 20) * 5 : 0;
      const bob = Math.abs(Math.sin(now / 160 + p.id)) * 4;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 1, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.shadowColor = 'rgba(255,60,200,0.9)';
      ctx.shadowBlur = 16;
      drawImg(ctx, p.image, p.x - 32 + shake, p.y - 64 - bob, 64, 64, p.tx < p.x);
      ctx.restore();
      for (let i = 0; i < 2; i++) {
        ctx.fillStyle = i < p.hp ? '#ff4dd2' : 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(p.x - 7 + i * 14, p.y + 10, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // The shop's cryptid floats by the counter; its lightning hits enemies.
    const cryptid = landOf(shop.condition)?.cryptid ?? homeLand(shop)?.cryptid ?? lands[0].cryptid;
    // Floats above the left end of the counter, clear of the queue.
    const cx = COUNTER.x0 + 6;
    const cy = COUNTER.top - 104 + Math.sin(now / 400) * 6;
    if (shop.stats.cryptid > 0) {
      ctx.save();
      ctx.shadowColor = 'rgba(140,220,255,0.9)';
      ctx.shadowBlur = 14;
      drawImg(ctx, cryptid, cx - 24, cy - 24, 48, 48);
      ctx.restore();
    }
    if (hz.strike) this.strike = { ...hz.strike, at: now };
    if (this.strike && now - this.strike.at < 250) {
      const { x, y } = this.strike;
      ctx.strokeStyle = '#bfefff';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#7fdcff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let k = 1; k <= 6; k++) ctx.lineTo(cx + ((x - cx) * k) / 6 + (k < 6 ? (k % 2 ? 14 : -14) : 0), cy + ((y - 40 - cy) * k) / 6);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Treasure chests drifting on balloons
    for (const c of hz.chests) {
      const y = c.y + Math.sin(c.t * 2) * 8;
      ctx.strokeStyle = '#eee';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(c.x, y - 16);
      ctx.lineTo(c.x, y - 48);
      ctx.stroke();
      for (const [dx, col] of [[-12, '#ff6b6b'], [12, '#ffd43b'], [0, '#74c0fc']] as const) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.ellipse(c.x + dx, y - 62 + (dx ? 6 : 0), 13, 16, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#8a5a2b';
      roundRect(ctx, c.x - 20, y - 16, 40, 28, 4);
      ctx.fill();
      ctx.fillStyle = '#a0692f';
      roundRect(ctx, c.x - 21, y - 22, 42, 12, 5);
      ctx.fill();
      ctx.fillStyle = '#ffcf33';
      ctx.fillRect(c.x - 21, y - 12, 42, 4);
      ctx.fillRect(c.x - 3, y - 14, 6, 10);
    }

    // Visitors: a land's cryptid, or a legendary hero with a golden aura
    for (const v of shop.visitors.visits) {
      const fade = Math.min(1, v.t / 0.5, (v.dur - v.t) / 0.8);
      ctx.globalAlpha = Math.max(0, fade);
      const float = Math.sin(now / 300) * 6;
      ctx.save();
      ctx.shadowColor = v.kind === 'legend' ? 'rgba(255,215,90,1)' : 'rgba(140,220,255,1)';
      ctx.shadowBlur = 24;
      if (v.kind === 'cryptid') drawImg(ctx, v.image, v.x - 48, v.y - 110 + float, 96, 96);
      else drawImg(ctx, v.image, v.x - HERO_PX / 2, v.y - HERO_PX, HERO_PX, HERO_PX, true);
      ctx.restore();
      ctx.font = `bold 14px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = v.kind === 'legend' ? '#ffd966' : '#bfefff';
      ctx.fillText(v.kind === 'legend' ? `伝説 ${v.name}` : v.name, v.x, v.y + 14);
      ctx.globalAlpha = 1;
    }

    // Vehicle arrival banner over the door
    const arrival = shop.visitors.arrival;
    if (arrival && arrival.t < 3) {
      const a = Math.min(1, arrival.t / 0.3, (3 - arrival.t) / 0.5);
      ctx.globalAlpha = a;
      const bx = DOOR.x - 60;
      const by = DOOR.top - 50;
      ctx.fillStyle = 'rgba(20,40,70,0.85)';
      roundRect(ctx, bx - 100, by - 22, 160, 44, 10);
      ctx.fill();
      drawImg(ctx, VEHICLE_ICONS[arrival.kind], bx - 96, by - 20, 40, 40);
      ctx.fillStyle = '#e7f5ff';
      ctx.font = `bold 15px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${VEHICLE_NAMES[arrival.kind]} 到着！`, bx - 52, by);
      ctx.globalAlpha = 1;
    }
  }

  /** Rain in the window, fog over the shop, bunting on a festival day. */
  private drawWeather(shop: Shop, now: number): void {
    const ctx = this.ctx;
    const kind = shop.condition.kind;
    if (kind === 'rain') {
      const { x0, x1, top, y } = WINDOW;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, top, x1 - x0, y - top);
      ctx.clip();
      ctx.fillStyle = 'rgba(40,60,90,0.35)';
      ctx.fillRect(x0, top, x1 - x0, y - top);
      ctx.strokeStyle = 'rgba(200,220,255,0.7)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 24; i++) {
        const rx = x0 + ((i * 37 + now / 6) % (x1 - x0 + 20)) - 10;
        const ry = top + ((i * 53 + now / 3) % (y - top + 20)) - 10;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 4, ry + 12);
        ctx.stroke();
      }
      ctx.restore();
    } else if (kind === 'fog') {
      // Drifting fog banks over the shop floor
      for (let i = 0; i < 6; i++) {
        const fx = ((i * 211 + now / 40) % (SCENE_W + 400)) - 200;
        const fy = WORKSHOP_H + 60 + ((i * 97) % Math.max(1, SCENE_H - WORKSHOP_H - 80));
        const g = ctx.createRadialGradient(fx, fy, 10, fx, fy, 180);
        g.addColorStop(0, 'rgba(225,230,235,0.28)');
        g.addColorStop(1, 'rgba(225,230,235,0)');
        ctx.fillStyle = g;
        ctx.fillRect(fx - 180, fy - 180, 360, 360);
      }
    } else if (kind === 'festival') {
      const colors = ['#ff6b6b', '#ffd43b', '#69db7c', '#74c0fc', '#da77f2'];
      const y0 = WORKSHOP_H + 16;
      for (let i = 0, x = 10; x < SCENE_W; i++, x += 34) {
        const sway = Math.sin(now / 500 + i) * 2;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x + 26, y0);
        ctx.lineTo(x + 13, y0 + 22 + sway);
        ctx.closePath();
        ctx.fill();
      }
    }
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

    // Self-checkout machines on the right end of the counter
    for (let i = 0; i < shop.stats.autoRegisters; i++) drawImg(ctx, DECOR.robot, x1 + 4 - i * 26, top - 30, 28, 28);

    // Checkout progress bars on the counter front (machines in blue)
    shop.registerProgress.forEach((p, r) => {
      const y = top + 34 - r * 8;
      const w = x1 - x0 - 40;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x0 + 30, y, w, 5);
      ctx.fillStyle = r >= shop.register.autoFrom ? '#74c0fc' : '#7CFFB2';
      ctx.fillRect(x0 + 30, y, w * Math.min(1, p / shop.register.laneTime(r)), 5);
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
    // Customers, thieves and shop staff, back to front.
    const staff = shop.staffMembers.filter((m) => ROLES[m.role].area === 'shop' && !m.away);
    const all: (Actor | StaffMember)[] = [...shop.actors, ...staff].sort((a, b) => a.y - b.y);
    for (const a of all) {
      if ('role' in a) {
        this.drawStaff(shop, a, now);
        continue;
      }
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
        // Land owners stand on a golden ring; regulars on a pink one.
        ctx.fillStyle =
          a.special === 'owner' ? 'rgba(255,207,51,0.7)' : a.special === 'regular' ? 'rgba(255,140,190,0.6)' : a.special === 'order' ? 'rgba(255,170,60,0.7)' : 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(a.x, a.y - 1, 18, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (a.special === 'owner') drawImg(ctx, DECOR.crownVip, a.x - 12, a.y - HERO_PX - hop - 18, 24, 24);
      const disguised = a.style?.disguise && (a.state === 'enter' || a.state === 'toShelf');
      if (a.kind === 'thief' && a.state !== 'caught' && !disguised) {
        // Villains glow red so they are easy to spot and tap.
        ctx.save();
        // Raid pirates glow orange.
        ctx.shadowColor = a.hitFlash > 0 ? 'rgba(255,255,255,1)' : a.raider ? 'rgba(255,150,20,1)' : 'rgba(255,40,40,0.95)';
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

  /** A staff member: hero sprite on a coloured ring, job plate, desk, and what they are doing. */
  private drawStaff(shop: Shop, m: StaffMember, now: number): void {
    const ctx = this.ctx;
    const moving = Math.hypot(m.x - m.homeX, m.y - m.homeY) > 3 || m.state === 'walk' || m.state === 'return';
    const hop = (moving ? Math.abs(Math.sin(m.bob)) * 4 : 0) + Math.sin(Math.PI * m.pulse) * 8;
    const ring = m.ace ? 'rgba(255,207,51,0.75)' : 'rgba(124,255,178,0.55)';
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.ellipse(m.x, m.y - 1, 22, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (m.ace) {
      ctx.save();
      ctx.shadowColor = 'rgba(255,215,90,0.9)';
      ctx.shadowBlur = 12;
    }
    drawImg(ctx, m.hero.image, m.x - HERO_PX / 2, m.y - HERO_PX - hop, HERO_PX, HERO_PX, m.facing < 0);
    if (m.ace) ctx.restore();

    const desk = DESKS[m.role];
    if (desk) {
      // Desk in front of the legs
      ctx.fillStyle = '#6f4326';
      ctx.fillRect(m.x - 34, m.y - 24, 68, 26);
      ctx.fillStyle = '#c28b56';
      ctx.fillRect(m.x - 38, m.y - 30, 76, 7);
      drawImg(ctx, desk, m.x + 8, m.y - 52, 26, 26);
    }
    if (m.bag.length) drawImg(ctx, itemExt(m.bag[0]).image, m.x - 16, m.y - HERO_PX - hop - 30, 32, 32);

    // Job plate under the feet
    const label = ROLES[m.role].job;
    ctx.font = `13px ${FONT}`;
    const w = ctx.measureText(label).width + 12;
    ctx.fillStyle = m.ace ? 'rgba(90,60,0,0.85)' : 'rgba(20,40,28,0.8)';
    roundRect(ctx, m.x - w / 2, m.y + 4, w, 17, 6);
    ctx.fill();
    ctx.fillStyle = m.ace ? '#ffd966' : '#b8ffd6';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, m.x, m.y + 13);

    const bx = m.x;
    const by = m.y - HERO_PX - hop - 22;
    const chasing = m.role === 'guard' && shop.actors.some((a) => a.kind === 'thief' && a.state !== 'caught');
    let text = '';
    if (m.role === 'promoter' && m.pulse > 0) text = 'いらっしゃい！';
    else if (m.role === 'host' && m.pulse > 0.3) text = 'ようこそ';
    else if (chasing) text = '待てっ！';
    if (text) {
      ctx.font = `bold 15px ${FONT}`;
      const tw = ctx.measureText(text).width + 14;
      // Keep the bubble inside the scene (the promoter stands by the right edge).
      const cx = Math.min(SCENE_W - tw / 2 - 4, Math.max(tw / 2 + 4, bx));
      ctx.fillStyle = chasing ? '#ffe3e3' : '#fffaf0';
      roundRect(ctx, cx - tw / 2, by - 13, tw, 24, 8);
      ctx.fill();
      ctx.fillStyle = chasing ? '#c92a2a' : '#5b4636';
      ctx.fillText(text, cx, by);
    }
    void now;
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
    if (a.state === 'drink' || a.state === 'toBar') {
      bubble(52, 48);
      drawImg(ctx, a.state === 'drink' && Math.sin(now / 150) > 0 ? DECOR.sake : DECOR.potion, bx - 20, by - 20, 40, 40);
      return;
    }
    if (a.state === 'trial' || a.state === 'toTrial') {
      bubble(52, 48);
      drawImg(ctx, DECOR.sword, bx - 20, by - 20, 40, 40);
      if (a.state === 'trial') {
        // Swing arc toward the dummy
        const k = (now / 400) % 1;
        ctx.strokeStyle = `rgba(255,255,255,${1 - k})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(TRIAL.dummy.x, TRIAL.dummy.y - 50, 26 + k * 10, -Math.PI * 0.9, -Math.PI * 0.9 + k * Math.PI * 1.2);
        ctx.stroke();
      }
      return;
    }
    if (a.special === 'order' && a.order && a.item === null && a.state !== 'leave') {
      // The ordered item, with a scroll mark
      bubble(64, 48, '#fff4d6');
      drawImg(ctx, series[a.order.series].items[a.order.minRarity].image, bx - 26, by - 20, 38, 38);
      ctx.fillStyle = '#b8860b';
      ctx.font = `bold 18px ${FONT}`;
      ctx.fillText('注', bx + 20, by);
      return;
    }
    if (a.special === 'collector' && a.item === null && a.wants !== undefined && a.state !== 'leave') {
      // What the collector is looking for
      bubble(64, 48, '#f3e8ff');
      drawImg(ctx, series[a.wants].items[0].image, bx - 26, by - 20, 38, 38);
      ctx.fillStyle = '#7048e8';
      ctx.font = `bold 22px ${FONT}`;
      ctx.fillText('?', bx + 20, by);
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

    // Staff working in the workshop (the exterminator and the delivery clerk)
    for (const m of shop.staffMembers) {
      if (ROLES[m.role].area !== 'workshop') continue;
      this.drawStaff(shop, m, now);
      if (m.role === 'exterminator') drawImg(ctx, DECOR.net, m.x + (m.facing > 0 ? 10 : -38), m.y - HERO_PX - 4, 28, 28);
      if (m.role === 'delivery' && m.pulse > 0) drawImg(ctx, DECOR.bundle, m.x - 14, m.y - HERO_PX - 36, 28, 28);
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
