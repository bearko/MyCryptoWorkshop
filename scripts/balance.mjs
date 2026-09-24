#!/usr/bin/env node
// Balance report: plays the game headlessly with several player models and compares the pace
// with the targets in docs/ROADMAP.md §5.
//
//   npm run balance              # 60 days, seed 42
//   npm run balance -- 80 7      # days, seed
//
// Writes reports/balance-<player>.csv (one row per business day).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [days = 60, seed = 42, runs = 0] = process.argv.slice(2).map(Number);

// Load the TypeScript game modules through Vite (same resolution as the game itself).
const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
try {
  const { simulate, simulateRuns, toCsv, PLAYERS } = await server.ssrLoadModule('/src/game/balance/autoplay.ts');
  if (runs > 0) {
    // npm run balance -- <maxDays per run> <seed> <runs>: time to clear in each run (ランド移転).
    const table = [];
    for (const player of PLAYERS.filter((p) => p.name !== 'casual')) {
      for (const r of simulateRuns(runs, days, seed, player)) {
        table.push({ player: player.name, run: r.run, land: r.land ?? '-', clear: r.clearMinutes === null ? `未到達（${days}日）` : `${r.clearMinutes}分（${r.days}日）`, cp: r.cp });
      }
    }
    console.table(table);
    process.exit(0);
  }
  const { evaluate } = await server.ssrLoadModule('/src/game/balance/targets.ts');
  const outDir = join(root, 'reports');
  mkdirSync(outDir, { recursive: true });

  const table = [];
  for (const player of PLAYERS) {
    const rows = simulate(days, seed, player);
    writeFileSync(join(outDir, `balance-${player.name}.csv`), toCsv(rows));
    for (const m of evaluate(rows)) {
      table.push({
        player: player.name,
        milestone: m.label,
        target: `${m.targetMin}分`,
        actual: m.minutes === null ? `未到達（${days}日）` : `${m.minutes}分（Day ${m.day}）`,
        ratio: m.minutes === null ? '-' : `×${(m.minutes / m.targetMin).toFixed(2)}`,
      });
    }
    const last = rows[rows.length - 1];
    console.log(`${player.name.padEnd(7)} ${days}日 / ${Math.round(last.playSeconds / 60)}分  最終日の売上 ${last.revenue}  習得Lv ${last.levelsOwned}  研究pt ${last.research}`);
    if (last.unfinished.length) console.log(`        未習得: ${last.unfinished.slice(0, 12).join(', ')}${last.unfinished.length > 12 ? ' …' : ''}`);
  }
  console.log('');
  console.table(table);
  console.log(`CSV: ${outDir}/balance-*.csv`);
} finally {
  await server.close();
}
