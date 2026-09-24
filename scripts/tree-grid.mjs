#!/usr/bin/env node
// Prints the skill tree's node grid (one letter per branch) to help place new nodes.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
try {
  const { TREE_NODES: SKILLS } = await server.ssrLoadModule('/src/game/skills.ts');
  const xs = SKILLS.map((n) => n.x);
  const ys = SKILLS.map((n) => n.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const cells = new Map();
  for (const n of SKILLS) {
    const k = `${n.x},${n.y}`;
    cells.set(k, cells.has(k) ? '!' : n.id === 'root' ? 'O' : n.branch[0].toUpperCase());
  }
  console.log(`${SKILLS.length} nodes, x ${x0}..${x1}, y ${y0}..${y1}  ('!' = overlap)`);
  console.log('    ' + Array.from({ length: x1 - x0 + 1 }, (_, i) => String(Math.abs(x0 + i) % 10)).join(''));
  for (let y = y0; y <= y1; y++) {
    let s = String(y).padStart(3) + ' ';
    for (let x = x0; x <= x1; x++) s += cells.get(`${x},${y}`) ?? '.';
    console.log(s);
  }
} finally {
  await server.close();
}
