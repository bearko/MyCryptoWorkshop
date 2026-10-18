// classList で後から付けるクラスが、別の部品のクラスと同じ名前になっていないこと。
// ランド移転のカードに付けていた「home」が、ホーム画面の .home（全面を覆う固定表示）と
// 重なって、2周目からカードが画面いっぱいに広がり、ボタンが押せなくなったことがある
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });

/** Classes that are the element's own name (or a body switch), styled on purpose. */
const OWN = new Set(['tree-lines', 'color-assist', 'reduce-motion']);

describe('後から付けるクラスの名前', () => {
  it('単独のルールを持つクラスを、修飾子として付けていない', () => {
    const css = readFileSync('src/style.css', 'utf8');
    const added = new Set(
      files('src').flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/classList\.(?:add|toggle)\('([\w-]+)'/g)].map((m) => m[1])),
    );
    expect(added.has('current')).toBe(true);
    const clashes = [...added].filter((c) => !OWN.has(c) && new RegExp(`^\\.${c}[\\s{,:\\[]`, 'm').test(css));
    expect(clashes).toEqual([]);
  });

  it('ランド移転の現在地のカードは .home を使わない', () => {
    const src = readFileSync('src/ui/prestige.ts', 'utf8');
    expect(src).not.toMatch(/classList\.add\('home'\)/);
    expect(readFileSync('src/style.css', 'utf8')).toMatch(/\.land-card\.current b::after/);
  });
});
