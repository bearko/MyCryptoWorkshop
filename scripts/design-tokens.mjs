#!/usr/bin/env node
// デザインシステム（design/keieimode/tokens.json）から、経営モードの CSS 変数を作る。
//   npm run design:tokens            # src/ui/empire/tokens.css を書き直す
//   node scripts/design-tokens.mjs --check   # ずれていれば失敗（テストから呼ぶ）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'src/ui/empire/tokens.css');

export function tokensCss(tokens) {
  const lines = ['/* design/keieimode/tokens.json から scripts/design-tokens.mjs が作るファイル。手で書き換えない */', '.ke {'];
  for (const t of tokens.color.tokens) lines.push(`  --${t.name}: ${t.value};`);
  for (const [k, v] of Object.entries(tokens.type.families)) lines.push(`  --font-${k}: ${v};`);
  for (const g of tokens.type.groups) {
    for (const s of g.styles) {
      lines.push(`  --type-${s.name}: ${s.fontWeight} ${s.fontSize}/${s.lineHeight} var(--font-${g.family});`);
      lines.push(`  --size-${s.name}: ${s.fontSize};`);
    }
  }
  for (const group of ['spacing', 'radius', 'size', 'border']) {
    for (const t of tokens[group].tokens) lines.push(`  --${t.name}: ${t.value};`);
  }
  lines.push('}', '');
  return lines.join('\n');
}

const css = tokensCss(JSON.parse(readFileSync(resolve(root, 'design/keieimode/tokens.json'), 'utf8')));
if (process.argv.includes('--check')) {
  let cur = '';
  try {
    cur = readFileSync(out, 'utf8');
  } catch {
    // 無ければずれている
  }
  if (cur !== css) {
    console.error('src/ui/empire/tokens.css が tokens.json とずれています。npm run design:tokens で作り直してください');
    process.exit(1);
  }
} else {
  writeFileSync(out, css);
  console.log(`wrote ${out}`);
}
