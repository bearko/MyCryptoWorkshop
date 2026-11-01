/**
 * 遺物の展示館の画面（発掘 v2 の 4 段目。docs/ISLAND_PHASE1.md「4. 復興・ダンジョン・展示館」）。
 * 地図の展示館をタップ → 吹き出しの「🏛 展示を見る」で開くシート。研究ノートの出土品から選んで、展示の枠に飾る（同じエクステは 1 枠まで）。
 * 上に展示の価値・来館の見込み・次の節目まで あと N。枠を押すと、その下に飾れる遺物のカード（価値の高い順）。プルダウンは使わない（憲章 2-1）。
 */
import { t } from '../../i18n';
import { RARITY_COLOR, RARITY_JA } from '../../game/catalog';
import { DIG_BALANCE } from './data';
import { exhibit, exhibitable, extName, extRank, extRarity, museumKnown, museumMarks, museumOpen, museumSlots, museumValue, relicValue, researchOf } from './model';
import { extIcon } from './digui';
import { stars } from './digview';
import { open, refreshSheet, type Ctx } from './screens';
import { btn, h, money } from './ui';

const MB = DIG_BALANCE.museum;
/** いま選んでいる枠（その下に、飾れる遺物のカードを出す） */
let pickSlot: number | null = null;
/** 枠を押した直後：飾れる遺物のカードが見えるところまで送る（スマホは画面の下に隠れるので） */
let scrollPick = false;

/** 遺物 1 つのレアリティの札（色と文字。色だけに頼らない） */
function rarityTag(id: number): HTMLElement {
  const r = extRarity(id) as keyof typeof RARITY_JA;
  const tag = h('span', `isl-mus-rar is-${extRank(id)}`, RARITY_JA[r] ?? r);
  tag.style.setProperty('--rc', RARITY_COLOR[r] ?? '#ccc');
  return tag;
}

/** 展示の画面 */
export function openMuseum(ctx: Ctx) {
  pickSlot = null;
  open(
    ctx,
    t('遺物の展示館', 'Relic museum'),
    (body) => {
      const s = ctx.s();
      body.classList.add('is-museum');
      const value = museumValue(s);
      const mk = museumMarks(s);
      const visitors = Math.round(value * MB.visitors);
      // ---- 上：価値・来館の見込み・次の節目
      const sum = h('div', 'isl-mus-sum');
      const chip = (k: string, v: string, cls = '') => {
        const c = h('span', `isl-mus-chip ${cls}`);
        c.append(h('small', '', k), h('b', '', v));
        sum.append(c);
      };
      chip(t('展示の価値', 'Exhibit value'), `${value}`, 'is-gold');
      chip(t('来館の見込み／月', 'Visitors / mo'), t(`${visitors} 人`, `${visitors}`));
      chip(t('入館料／月', 'Admissions / mo'), money(visitors * MB.fee));
      chip(t('次の節目', 'Next milestone'), mk.next != null ? t(`${mk.next}（あと ${mk.left}）`, `${mk.next} (${mk.left} to go)`) : t('すべて達成', 'All reached'), mk.next != null ? 'is-next' : 'is-done');
      body.append(sum);
      // 節目のボーナス（恒久）
      const marks = s.museum?.marks ?? 0;
      const bonus = h('p', 'isl-mus-bonus');
      bonus.append(
        h('b', '', t(`節目 ${marks} / ${MB.marks.length}`, `Milestones ${marks} / ${MB.marks.length}`)),
        document.createTextNode(t(`：会社全体の新商品の認知の上がり方 +${Math.round(museumKnown(s) * 100)}%・ブランド力 +${marks * MB.brand}（節目 ${MB.marks.join('・')} を超えるごとに +5%・★ +1）`, `: new items become known +${Math.round(museumKnown(s) * 100)}% faster company-wide · brand +${marks * MB.brand} (each milestone ${MB.marks.join(', ')} adds +5% and ★ +1)`)),
      );
      body.append(bonus);
      if (!museumOpen(s)) body.append(h('p', 'isl-warn', t('展示館はまだ工事中。飾っておくと、開いた月から来館者が来るよ。', 'The museum is still being built. Exhibits start drawing visitors once it opens.')));
      // ---- 展示の枠（いまの枠 ＋ 次の増築の枠は 🔒）
      const slots = museumSlots(s);
      const items = s.museum?.items ?? [];
      const grid = h('div', 'isl-mus-grid');
      for (let k = 0; k < Math.min(MB.slots[MB.slots.length - 1], slots + 4); k++) {
        if (k >= slots) {
          const c = h('div', 'isl-mus-slot is-locked');
          c.append(h('span', 'isl-mus-lock', '🔒'), h('small', 'isl-dim', t('展示室の増築で', 'Gallery extension')));
          grid.append(c);
          continue;
        }
        const id = items[k] ?? null;
        const c = h('button', `isl-mus-slot ${id != null ? 'is-on' : 'is-empty'} ${pickSlot === k ? 'is-pick' : ''}`);
        c.type = 'button';
        if (id != null) {
          c.append(extIcon(id, 64), h('b', 'isl-mus-name', extName(id)), rarityTag(id), h('small', 'isl-mus-stars', stars(researchOf(s, id))), h('small', 'isl-gold', t(`価値 ${relicValue(s, id)}`, `Value ${relicValue(s, id)}`)));
        } else c.append(h('span', 'isl-mus-plus', '+'), h('small', '', t('飾る', 'Display')));
        c.addEventListener('click', () => {
          pickSlot = pickSlot === k ? null : k;
          scrollPick = pickSlot != null;
          ctx.sfx?.('tap');
          refreshSheet();
        });
        grid.append(c);
      }
      body.append(grid);
      body.append(h('small', 'isl-dim', t(`価値 ＝ レアリティ（C ${MB.val.C}・U ${MB.val.U}・R ${MB.val.R}・E ${MB.val.E}・L ${MB.val.L}）×（1 ＋ ${MB.lvStep} ×（研究 Lv − 1））。来館者は価値 1 につき月 ${MB.visitors} 人・入館料 ${MB.fee} G。展示室の増築は、地図の展示館の「設備投資」から。`, `Value = rarity (C ${MB.val.C}, U ${MB.val.U}, R ${MB.val.R}, E ${MB.val.E}, L ${MB.val.L}) × (1 + ${MB.lvStep} × (research Lv − 1)). ${MB.visitors} visitors a month per value point, ${MB.fee} G each. Extend the gallery from the museum’s capital investment on the map.`)));
      // ---- 枠を選んだら：飾れる遺物（研究ノートの出土品。価値の高い順）
      if (pickSlot != null && pickSlot < slots) {
        const k = pickSlot;
        const pick = h('div', 'isl-mus-pick');
        const head = h('div', 'isl-row');
        head.append(h('b', '', t(`枠 ${k + 1} に飾る遺物を選ぶ`, `Choose a relic for slot ${k + 1}`)));
        if (items[k] != null)
          head.append(
            btn(t('外す', 'Remove'), () => {
              exhibit(s, k, null);
              ctx.save();
              ctx.refresh();
              refreshSheet();
            }),
          );
        pick.append(head);
        const cands = exhibitable(s);
        if (!cands.length) pick.append(h('p', 'isl-dim', t('まだ遺物が無い。荒れ地やダンジョンで掘ってみよう。', 'No relics yet. Dig at a wasteland or a dungeon.')));
        const cg = h('div', 'isl-mus-cands');
        for (const id of cands) {
          const at = items.indexOf(id);
          const c = h('button', `isl-mus-cand ${at >= 0 ? 'is-shown' : ''}`);
          c.type = 'button';
          c.append(extIcon(id, 48), h('b', '', extName(id)), rarityTag(id), h('small', 'isl-gold', t(`価値 ${relicValue(s, id)}`, `Value ${relicValue(s, id)}`)));
          if (at >= 0) {
            c.disabled = true;
            c.append(h('small', 'isl-dim', t(`展示中（枠 ${at + 1}）`, `On display (slot ${at + 1})`)));
          }
          c.addEventListener('click', () => {
            const before = s.museum?.marks ?? 0;
            const e = exhibit(s, k, id);
            if (e) {
              ctx.sfx?.('error');
              ctx.toast(e === 'dup' ? t('同じ遺物は 1 枠まで', 'One slot per relic') : t('いまは飾れません', 'Can’t display that now'));
              return;
            }
            ctx.sfx?.('check');
            const gained = (s.museum?.marks ?? 0) - before;
            if (gained > 0) {
              ctx.sfx?.('levelup');
              ctx.toast(t(`🏛 展示の価値が節目を超えた！ 新商品の認知の上がり方 +${Math.round(gained * MB.known * 100)}%（ブランド力も）`, `🏛 Exhibit milestone! New items become known +${Math.round(gained * MB.known * 100)}% faster (brand up too)`));
            }
            // 次の空いた枠へ（続けて飾れるように）
            const next = (s.museum?.items ?? []).findIndex((x, i) => x == null && i < museumSlots(s));
            pickSlot = next >= 0 ? next : null;
            ctx.save();
            ctx.refresh();
            refreshSheet();
          });
          cg.append(c);
        }
        pick.append(cg);
        body.append(pick);
        if (scrollPick) {
          scrollPick = false;
          requestAnimationFrame(() => pick.scrollIntoView({ block: 'end', behavior: 'smooth' }));
        }
      }
    },
    () => {
      pickSlot = null;
    },
  );
}
