// Lists Japanese string literals in src/ that are not the first argument of t(ja, en).
// Usage: node scripts/i18n-check.mjs [file...]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const JP = /[぀-ヿ㐀-鿿＀-￯]/;
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = process.argv.slice(2).length ? process.argv.slice(2) : walk('src').filter((f) => f.endsWith('.ts'));
let total = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  // Files whose Japanese is swapped at runtime (checked by tests/i18n.test.ts) opt out.
  if (src.includes('i18n-check: skip')) continue;
  // Drop comments, then find string literals.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const re = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  const hits = [];
  for (const m of code.matchAll(re)) {
    if (!JP.test(m[2])) continue;
    const before = code.slice(Math.max(0, m.index - 40), m.index);
    // t('ja', 'en'): the first argument is fine; so is the second if it is not Japanese.
    if (/\bt\(\s*$/.test(before)) continue;
    const line = code.slice(0, m.index).split('\n').length;
    // The Japanese side of an isEn ? … : … split, marked in the source.
    if (src.split('\n')[line - 1].includes('i18n-ja')) continue;
    hits.push(`${f}:${line}: ${m[0].slice(0, 90)}`);
  }
  total += hits.length;
  if (hits.length) console.log(hits.join('\n'));
}
console.log(`${total} untranslated literal(s)`);
process.exitCode = total ? 1 : 0;
