#!/usr/bin/env node
// 経営画面の撮影と見た目の検査（docs/design.md 6 章）。?test=1 で開き、フェーズごとに
// 1280×720・1920×1080・390×844 で撮って reports/shots/ に置く。あわせて次を確かめる：
//   - scale：画像とキャンバスの拡大が整数倍か（docs/pixel-rules.md）
//   - covered：ボタンがほかの部品の下に隠れて押せないところがないか
//   - month：「月を進める」がスクロールしなくても画面の中に見えるか
//   - tap：スマホでタップの的が 44px 以上か
//   - text：文字が 12px より小さくないか
// 使い方：node scripts/shots.mjs [出力先]   （playwright と chromium が要る）
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, process.argv[2] ?? 'reports/shots');
mkdirSync(out, { recursive: true });

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  try {
    // グローバルに入っている playwright（NODE_PATH）
    ({ chromium } = createRequire(import.meta.url)('playwright'));
  } catch {
    console.error('playwright が見つかりません（npm i -D playwright && npx playwright install chromium）');
    process.exit(1);
  }
}

const server = await createServer({ root, logLevel: 'error', server: { port: 5199, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0];

const SIZES = [
  ['pc', 1280, 720, false],
  ['hd', 1920, 1080, false],
  ['sp', 390, 844, true],
];
const STEPS = [
  ['p1', '会社を作り直す（種 1）', '会社を作る（種 1）'],
  ['p2', 'フェーズ 2 へ飛ぶ'],
  ['p3', 'フェーズ 3 へ飛ぶ'],
  ['p4', 'フェーズ 4 へ飛ぶ'],
  ['p5', 'フェーズ 5 へ飛ぶ'],
];

/** ページの中で見た目を検査する（文字列の配列を返す） */
function audit(phone) {
  const issues = [];
  const ke = document.querySelector('.ke');
  if (!ke) return ['no .ke'];
  const dpr = window.devicePixelRatio || 1;
  for (const im of ke.querySelectorAll('img')) {
    if (!im.naturalWidth || !im.offsetWidth) continue;
    const s = (im.getBoundingClientRect().width * dpr) / im.naturalWidth;
    if (Math.abs(s - Math.round(s)) > 0.02 && s > 0.98) issues.push(`scale: img ${im.alt || im.src.split('/').pop()} ×${s.toFixed(2)}`);
  }
  for (const c of ke.querySelectorAll('canvas')) {
    if (!c.offsetWidth) continue; // 隠れている地図（フェーズ 5 の会議卓のあいだ）
    const s = Number(c.dataset.artScale);
    if (!Number.isInteger(s)) issues.push(`scale: canvas ×${c.dataset.artScale}`);
  }
  for (const b of ke.querySelectorAll('button, a, [role=button]')) {
    const r = b.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(b).visibility === 'hidden') continue;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
    // スクロールする列の見えている範囲の外（送れば見える）は、隠れているとは数えない
    let clipped = false;
    for (let p = b.parentElement; p && p !== ke; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if (o !== 'auto' && o !== 'scroll') continue;
      const pr = p.getBoundingClientRect();
      if (cy < pr.top || cy > pr.bottom) clipped = true;
      break;
    }
    if (clipped) continue;
    const top = document.elementFromPoint(cx, cy);
    if (top && top !== b && !b.contains(top) && !top.closest('.ke-tip')) issues.push(`covered: "${(b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 20)}" under .${top.className?.baseVal ?? top.className}`.slice(0, 120));
    if (phone && (r.width < 43.5 || r.height < 43.5) && !b.classList.contains('ke-sheet-grip') && !b.closest('.ke-strip')) issues.push(`tap: "${(b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 16)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
  }
  const month = ke.querySelector('.ke-month');
  if (!month) issues.push('month: missing');
  else {
    const r = month.getBoundingClientRect();
    if (r.bottom > innerHeight || r.top < 0) issues.push(`month: off-screen (${Math.round(r.top)}–${Math.round(r.bottom)} / ${innerHeight})`);
  }
  const walker = document.createTreeWalker(ke, NodeFilter.SHOW_TEXT);
  const small = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || !el.offsetWidth) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) small.add(`${el.tagName.toLowerCase()}.${el.className} ${fs}px`);
  }
  for (const s of small) issues.push(`text: ${s}`);
  if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('overflow: horizontal scroll');
  return issues;
}

const report = [];
const browser = await chromium.launch();
try {
  for (const [tag, w, h, phone] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ja-JP', deviceScaleFactor: phone ? 2 : 1, hasTouch: phone, isMobile: phone });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => report.push({ tag, error: e.message }));
    await page.goto(`${url}?test=1`);
    await page.waitForTimeout(1500);
    for (const [step, ...labels] of STEPS) {
      // デバッグパネル（経営画面のヘッダーか、ホームの TEST）
      const inEmpire = await page.locator('.ke-test').count();
      await page.locator(inEmpire ? '.ke-test' : '.test-badge').first().click();
      await page.waitForTimeout(400);
      let clicked = false;
      for (const label of labels) {
        const b = page.getByRole('button', { name: label, exact: true });
        if (await b.count()) {
          await b.first().click();
          clicked = true;
          break;
        }
      }
      if (!clicked) throw new Error(`button not found: ${labels.join(' / ')}`);
      await page.waitForLoadState('load');
      await page.waitForTimeout(1500);
      if (!(await page.locator('.ke').count())) {
        await page.getByRole('button', { name: /経営/ }).first().click();
        await page.waitForTimeout(1200);
      }
      // 1 か月進めて、報告と絵馬が出た状態で撮る
      await page.locator('.ke-month').click();
      await page.waitForTimeout(1600);
      await page.waitForTimeout(400);
      const file = `${tag}_${step}.png`;
      await page.screenshot({ path: resolve(out, file) });
      const issues = await page.evaluate(audit, phone);
      report.push({ tag, step, file, issues });
      console.log(`${file}  ${issues.length ? issues.join(' | ') : 'ok'}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
writeFileSync(resolve(out, 'report.json'), JSON.stringify(report, null, 1));
const bad = report.filter((r) => r.error || r.issues?.length);
console.log(`${report.length} 枚・問題のある画面 ${bad.length}`);
