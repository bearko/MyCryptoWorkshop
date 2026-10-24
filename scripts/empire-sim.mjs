#!/usr/bin/env node
// 経営モードのバランス測定（docs/EMPIRE_DESIGN.md 9 章）。3 つの戦略のボットを種ごとに回す。
//
//   npm run sim:empire              # 36 か月、種 1〜20
//   npm run sim:empire -- 60 50     # 月数、種の数

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [months = 36, seeds = 20] = process.argv.slice(2).map(Number);

const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
try {
  const { BOTS, runBot } = await server.ssrLoadModule('/src/empire/balance.ts');
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  };
  const table = BOTS.map((bot) => {
    const rs = Array.from({ length: seeds }, (_, i) => runBot(bot, i + 1, months));
    const done = rs.filter((r) => r.phase1Month !== null).map((r) => r.phase1Month);
    return {
      bot: bot.name,
      'フェーズ1 到達': `${done.length}/${seeds}`,
      '所要月（中央値）': median(done) ?? '-',
      '店数（中央値）': median(rs.map((r) => r.stores)),
      '資金（中央値）': median(rs.map((r) => r.funds)).toLocaleString('ja-JP'),
      '赤字月（合計）': rs.reduce((a, r) => a + r.redMonths, 0),
    };
  });
  console.log(`${months} か月・種 ${seeds} 個`);
  console.table(table);
} finally {
  await server.close();
}
