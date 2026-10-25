// M&A の画面（docs/EMPIRE_DESIGN.md 10.15）：ランドごとのライバル会社の株と、買収の防衛。DOM を返すだけ。
import { combinedShare, DEFENSES, dividendOf, MNA, mboCost, RAID, rivalStores, rivalValue, stepPrice, tobCheck, tobPrice, type Defense, type MnaDecision } from '../../empire/mna';
import { REGULATION } from '../../empire/crowns';
import type { EmpireState } from '../../empire/model';
import { t } from '../../i18n';
import { h } from '../dom';
import { card, type Ctx } from './cards';
import { costButton, row } from './parts';
import { defenseLabel, landRival, money, monthLabel } from './text';

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** 店を持つランド（本拠と渡ったランド）と、その国 */
function lands(e: EmpireState) {
  return [...(e.nation ? [{ land: e.land, nation: e.nation }] : []), ...(e.world?.branches.map((b) => ({ land: b.land, nation: b.nation })) ?? [])];
}

const setMna = (ctx: Ctx, f: (m: MnaDecision) => MnaDecision, sound?: Parameters<Ctx['set']>[1]) =>
  ctx.set((d) => {
    const next = f({ ...d.mna });
    const empty = !next.buy?.length && !next.tob && !next.pmi?.length && !next.defense;
    return { ...d, mna: empty ? undefined : next };
  }, sound);
const toggle = (xs: string[] | undefined, x: string) => (xs?.includes(x) ? xs.filter((y) => y !== x) : [...(xs ?? []), x]);
const lack = (ctx: Ctx, cost: number) => (ctx.fundsLeft() < cost ? t(`資金があと ${money(cost - ctx.fundsLeft())} 足りません`, `${money(cost - ctx.fundsLeft())} short`) : null);

/** 公開買付けが成らない理由 */
function reasonText(r: string | null): string {
  return r === 'regulation'
    ? t(`このランドで自社とライバルを合わせたシェアが ${pct(REGULATION.breakup)} を超えるので、当局が認めません`, `Together you would hold over ${pct(REGULATION.breakup)} of this land; the authorities will refuse`)
    : r === 'trust'
      ? t(`株主の信任が ${MNA.trust} に届いていません`, `Shareholder trust is below ${MNA.trust}`)
      : r === 'funds'
        ? t('払ったあとの資金に余裕がなく、資金の確実さを疑われます', 'Too little cash left after paying; funding looks uncertain')
        : r === 'outbid'
          ? t(`大陸ホールディングスが ${pct(MNA.rivalBid)} の上乗せで対抗してきます`, `Continental Holdings will counter with a ${pct(MNA.rivalBid)} premium`)
          : '';
}

/** M&A の机：ランドごとのライバル会社と、買収の防衛 */
export function mnaCard(ctx: Ctx): HTMLElement {
  const { e, draft } = ctx;
  const d = draft.mna ?? {};
  const raid = e.mna?.raid;
  return card(
    t('M&A', 'M&A'),
    t('ランドのライバル会社の株を集めて、傘下にする', "Buy into each land's rival and bring it into the group"),
    raid ? raidField(ctx) : null,
    h('p.ke-hint', {}, t(`市場では月に ${pct(MNA.step)} ずつ、${pct(MNA.marketCap)} まで。その先は公開買付けで ${pct(MNA.control)} まで。傘下のライバルは出店と値下げ攻勢をやめ、配当を払います。`, `Buy ${pct(MNA.step)} a month on the market up to ${pct(MNA.marketCap)}, then bid for ${pct(MNA.control)}. A controlled rival stops expanding and pays dividends.`)),
    ...lands(e).map(({ land, nation }) => {
      const h0 = e.mna?.holdings[land];
      const stake = h0?.stake ?? 0;
      const share = combinedShare(e, land);
      const buying = !!d.buy?.includes(land);
      const tob = d.tob?.land === land ? d.tob.premium : null;
      return h(
        'div.ke-field.ke-field-stack.ke-auction',
        {},
        h('span.ke-field-label', {}, t(`${land}・${landRival(land)}`, `${land} · ${landRival(land)}`), h('span.ke-hint', {}, h0?.control ? t('傘下', 'Controlled') : t(`持分 ${pct(stake)}`, `Stake ${pct(stake)}`))),
        h(
          'div.ke-paper.is-wide',
          {},
          row(t('ライバルの店・時価', 'Rival stores · value'), `${rivalStores(nation)} · ${money(rivalValue(e, land))}`),
          row(t('合わせたシェア（規制）', 'Combined share (regulation)'), pct(share), share >= REGULATION.breakup ? 'bad' : 'good'),
          h0?.control ? row(t('配当（月）', 'Dividend (month)'), money(dividendOf(e, land)), 'good') : null,
          h0?.control ? row(t('統合', 'Integration'), `${Math.round(h0.integration)} / 100`, h0.integration >= MNA.impairmentBelow ? 'good' : 'bad') : null,
        ),
        h0?.control
          ? h0.integration < 100
            ? costButton(t(`統合の費用を払う（+${MNA.pmiStep}）`, `Pay for integration (+${MNA.pmiStep})`), MNA.pmiCost, () => setMna(ctx, (m) => ({ ...m, pmi: toggle(m.pmi, land) }), 'build'), { pressed: !!d.pmi?.includes(land), disabled: d.pmi?.includes(land) ? null : lack(ctx, MNA.pmiCost) })
            : h('span.ke-done', {}, t('✓ 統合が済みました（配当が倍）', '✓ Integrated (double dividends)'))
          : h(
              'div.ke-actions',
              {},
              stake < MNA.marketCap
                ? costButton(t(`市場で ${pct(MNA.step)} 買う`, `Buy ${pct(MNA.step)}`), stepPrice(e, land), () => setMna(ctx, (m) => ({ ...m, buy: toggle(m.buy, land) }), 'build'), { pressed: buying, disabled: buying ? null : lack(ctx, stepPrice(e, land)) })
                : null,
              ...MNA.premiums.map((p) => {
                const check = tobCheck(e, land, p);
                return costButton(t(`公開買付け（上乗せ ${pct(p)}）`, `Tender offer (+${pct(p)})`), tobPrice(e, land, p), () => setMna(ctx, (m) => ({ ...m, tob: tob === p ? undefined : { land, premium: p } }), 'build'), {
                  pressed: tob === p,
                  disabled: tob === p ? null : (lack(ctx, tobPrice(e, land, p)) ?? (check.ok ? null : reasonText(check.reason))),
                });
              }),
            ),
        h0?.disclosed && !h0.control ? h('span.ke-hint', {}, t('大量保有を報告したので、株価が上がっています', 'Disclosed: the share price is up')) : null,
      );
    }),
  );
}

/** 買われる側：大陸ホールディングスの買い集めと、防衛策 */
function raidField(ctx: Ctx): HTMLElement {
  const { e, draft } = ctx;
  const r = e.mna!.raid!;
  const pick = (v: Defense) => setMna(ctx, (m) => ({ ...m, defense: m.defense === v ? undefined : v }), 'build');
  const cost = (v: Defense) => (v === 'stable' ? RAID.stableCost : v === 'mbo' ? mboCost(e) : 0);
  const note = (v: Defense) =>
    ({
      stable: t('友好的な株主に株を持ってもらう。確実に防げる', 'Friendly holders take shares. A sure defense'),
      pill: t(`株主の信任が ${RAID.pillTrust} 以上なら防げる。信任が ${RAID.pillTrustCost} 下がる`, `Works if shareholder trust is ${RAID.pillTrust}+. Trust falls ${RAID.pillTrustCost}`),
      knight: t(`友好的な会社に ${pct(RAID.knightShare)} を渡す。持分は薄まる`, `Hand ${pct(RAID.knightShare)} to a friendly company. Your stake thins`),
      mbo: t('外の株主から株を買い戻して上場をやめる', 'Buy back outside shares and delist'),
    })[v];
  return h(
    'div.ke-field.ke-field-stack.ke-raid',
    {},
    h('span.ke-field-label', {}, t('大陸ホールディングスの買い集め', 'Continental Holdings is buying in'), h('span.ke-hint.ke-bad', {}, t(`持分 ${pct(r.stake)}`, `Stake ${pct(r.stake)}`))),
    h('p.ke-note', {}, r.tobAt !== null ? t(`${monthLabel(r.tobAt)}に公開買付け。防衛策を 1 つ選んでください（選ぶと取り消せません）`, `Tender offer in ${monthLabel(r.tobAt)}. Choose one defense (final)`) : t(`${pct(MNA.marketCap)} に届くと公開買付けを予告してきます`, `At ${pct(MNA.marketCap)} they will announce a tender offer`)),
    r.defense
      ? h('span.ke-done', {}, t(`✓ ${defenseLabel(r.defense)}`, `✓ ${defenseLabel(r.defense)}`))
      : h(
          'div.ke-actions.ke-actions-stack',
          {},
          ...DEFENSES.map((v) =>
            h('div.ke-defense', {}, costButton(defenseLabel(v), cost(v) || null, () => pick(v), { pressed: draft.mna?.defense === v, disabled: draft.mna?.defense === v ? null : lack(ctx, cost(v)) }), h('span.ke-hint', {}, note(v))),
          ),
        ),
  );
}
