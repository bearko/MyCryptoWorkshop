/**
 * 投資の効き目の監査（scripts/island/audit.ts）。
 * ふだんの `npm test` でも全部の投資を測り、「反映されない投資」（×）が 1 つも無いこと・表に抜けが無いことを確かめる。
 * `npm run island:audit` のときは docs/ISLAND_AUDIT.md の表を書き直す。
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INVESTS } from '../src/island/p1/data';
import { LEARNABLE } from '../src/island/p1/model';
import { INVEST_SPEC, audit, baseTable, specOf, table, writeAudit } from '../scripts/island/audit';

const FULL = process.env.npm_lifecycle_event === 'island:audit' || !!process.env.ISLAND_AUDIT;

describe('投資の効き目の監査', () => {
  it('表に抜けが無い：取れるスキル・設備投資の全部に、効くはずの段（または対象外の理由）がある', () => {
    expect(LEARNABLE().filter((k) => !specOf(k)).map((k) => k.id)).toEqual([]);
    expect(INVESTS.filter((x) => !INVEST_SPEC[x.id]).map((x) => x.id)).toEqual([]);
  });

  it(
    'すべての投資が、SCM の数字と実際の売上の両方に出る（反映されない投資が 0）',
    () => {
      const t0 = performance.now();
      const rows = audit();
      const ms = performance.now() - t0;
      if (FULL) {
        const path = 'docs/ISLAND_AUDIT.md';
        writeAudit(path, rows, existsSync(path) ? readFileSync(path, 'utf8') : null, ms);
        console.log(baseTable());
        console.log(table(rows));
        console.log(`計測 ${(ms / 1000).toFixed(1)} 秒`);
      }
      const bad = rows.filter((r) => r.verdict === '×').map((r) => `${r.item.id}：${r.why ?? ''}`);
      expect(bad).toEqual([]);
    },
    600_000,
  );
});

describe('棚の商品を替えたとき', () => {
  it('外した商品の棚の残りは裏に戻る（売れずに棚をふさがない）', async () => {
    const M = await import('../src/island/p1/model');
    const s = M.newP1(1);
    const uid = 1;
    s.shops[uid] = { uid, shelves: ['Sensu:C', null], staff: null, part: 0, storage: {}, shelf: { 'Sensu:C': 7 }, sat: 1, carry: {}, rev: 0, cost: 0, last: null, aw: 1 } as never;
    expect(M.setShelf(s, uid, 0, 'Scissors:C')).toBe(true);
    expect(s.shops[uid].shelf['Sensu:C']).toBeUndefined();
    expect(s.shops[uid].storage['Sensu:C']).toBe(7);
  });
});
