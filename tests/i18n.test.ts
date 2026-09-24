import { describe, expect, it } from 'vitest';

// Every game module builds its text at load time, so the language is forced before importing.
(globalThis as { MCW_LANG?: string }).MCW_LANG = 'en';

const JAPANESE = /[぀-ヿ㐀-鿿＀-￯]/;

/** Collects every string value found in `value` (objects, arrays, nested), with its path. */
function strings(value: unknown, path: string, out: [string, string][] = [], seen = new Set<unknown>()): [string, string][] {
  if (typeof value === 'string') out.push([path, value]);
  else if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out, seen);
  }
  return out;
}

/** Texts that are still Japanese (asset paths and ids are skipped). */
const japanese = (value: unknown, path: string) =>
  strings(value, path)
    .filter(([p, s]) => JAPANESE.test(s) && !/\.(image|icon|view|cryptid|key|faction|attributes\.\d+|id)$/.test(p))
    .map(([p, s]) => `${p}: ${s}`);

describe('English', () => {
  it('numbers use K / M / B units', async () => {
    const { fmt, secs } = await import('../src/game/format');
    expect(fmt(1234)).toBe('1,234');
    expect(fmt(12345)).toBe('12.3K');
    expect(fmt(4.56e9)).toBe('4.56B');
    expect(secs(3)).toBe('3.00s');
  });

  it('the catalog uses English names', async () => {
    const { series, customers, pests, RARITY_JA, factionName, attributeName } = await import('../src/game/catalog');
    expect(series[0].name).toBe('Blade');
    expect(series[0].items[0].name).toBe('Novice Blade');
    expect(customers.every((c) => !JAPANESE.test(c.name))).toBe(true);
    expect(pests.every((p) => !JAPANESE.test(p.name))).toBe(true);
    expect(RARITY_JA.Legendary).toBe('Legendary');
    expect(factionName('朱雀')).toBe('SUZAKU');
    expect(attributeName('イギリス')).toBe('England');
  });

  it('game data has no Japanese text left', async () => {
    const mods = {
      skills: (await import('../src/game/skills')).SKILLS,
      branches: (await import('../src/game/skills')).BRANCHES,
      stats: (await import('../src/game/statInfo')).STAT_INFO,
      achievements: (await import('../src/game/achievements')).ACHIEVEMENTS,
      conditions: (await import('../src/game/conditions')).CONDITIONS,
      lines: (await import('../src/game/lines')).LINES,
      gems: (await import('../src/game/lines')).GEMS,
      roles: (await import('../src/game/staff')).ROLES,
      editions: (await import('../src/game/items')).EDITIONS,
      thieves: (await import('../src/game/thieves')).THIEF_STYLES,
      affinity: (await import('../src/game/heroes')).AFFINITY,
      sets: (await import('../src/game/heroes')).HERO_SETS.map((s) => ({ name: s.name, reward: s.reward })),
      currencies: (await import('../src/game/currency')).CURRENCIES,
      blessings: (await import('../src/game/blessings')).BLESSINGS,
      families: (await import('../src/game/catalog')).FAMILIES,
      factions: (await import('../src/game/factions')).FACTION_NAME,
    };
    const left = Object.entries(mods).flatMap(([k, v]) => japanese(v, k));
    expect(left.slice(0, 40)).toEqual([]);
  });

  it('every Japanese literal in src/ has an English side (scripts/i18n-check.mjs)', async () => {
    // (Imported by name so the browser tsconfig, without Node types, still compiles.)
    const childProcess = 'node:child_process';
    const { execFileSync } = await import(/* @vite-ignore */ childProcess);
    expect(() => execFileSync('node', ['scripts/i18n-check.mjs'], { encoding: 'utf8' })).not.toThrow();
  });
});
