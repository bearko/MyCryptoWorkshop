// テストモード（?test=1）のデバッグパネル。テスト用のセーブだけを書き換える（本番のセーブは読むだけ）。
import { newEmpire, type EmpireState } from '../empire/model';
import { freeCells } from '../empire/area';
import { advanceMonth, canPromote, ownCells, plotsFor } from '../empire/sim';
import { newStake } from '../empire/stakeholders';
import { PARTY_ROSTER, scoutId } from '../game/party';
import { planCampaign } from '../empire/rivalai';
import { bestFocus, FOUNDING_LANDS } from '../empire/lands';
import { newCourt } from '../empire/court';
import { newSave, readProductionSave, SaveError, type SaveData } from '../game/save';
import { t } from '../i18n';
import { fmt, h } from './dom';

/** パネルの操作。どれも新しいセーブを返し、呼び出し側が書いて読み直す（純関数でテストできるように） */
export const testActions = {
  /** 本番のセーブをそのまま写す（設定はテスト側のまま） */
  copyProduction(current: SaveData, prod: SaveData): SaveData {
    return { ...prod, settings: current.settings };
  },
  /** 最初から（設定は残す） */
  reset(current: SaveData): SaveData {
    const fresh = newSave();
    fresh.settings = current.settings;
    return fresh;
  },
  addGum(current: SaveData, amount: number): SaveData {
    return { ...current, gum: current.gum + amount };
  },
  addDust(current: SaveData, amount: number): SaveData {
    return { ...current, resources: { ...current.resources, dust: current.resources.dust + amount } };
  },
  /** 営業日を n 日進める（その日の始めから） */
  skipDays(current: SaveData, n: number): SaveData {
    return { ...current, day: Math.max(1, current.day + n) };
  },
  /** 会社を作る（もうあれば作り直す）。種を決めておくと同じ月が出る */
  foundEmpire(current: SaveData, seed = 1): SaveData {
    return { ...current, empire: newEmpire(current.empire?.name || t('テスト', 'Test'), seed, current.empire?.land ?? 'Ocean', current.empire?.focus) };
  },
  addFunds(current: SaveData, amount: number): SaveData {
    return withEmpire(current, (e) => ({ ...e, funds: e.funds + amount }));
  },
  /** ステークホルダーの要望を出す（支持度を 35 に下げ、期限は 2 か月後）。M8 の絵馬と最後通告を試す */
  stakeDemand(current: SaveData): SaveData {
    return withEmpire(current, (e) => {
      const who = e.phase >= 3 ? 'staff' : 'wholesaler';
      const stake = e.stake ?? newStake();
      return { ...e, stake: { ...stake, support: { ...stake.support, [who]: 35 }, demands: [...stake.demands.filter((d) => d.who !== who), { who, since: e.month, due: e.month + 1 }] } };
    });
  },
  /** 英雄の酒場の最初の 6 人をスカウト済みにする（役員会を試す） */
  scoutSome(current: SaveData): SaveData {
    const levels = { ...current.levels };
    for (const d of PARTY_ROSTER.slice(0, 6)) levels[scoutId(d.id)] = Math.max(levels[scoutId(d.id)] ?? 0, 2);
    return { ...current, levels };
  },
  /** 次の株主総会（面談）の月まで進める */
  toMeeting(current: SaveData): SaveData {
    return withEmpire(current, (e) => {
      if (e.phase < 3) return e;
      if (!e.gov) e = advanceMonth(e).state;
      for (let i = 0; i < 24 && e.gov && e.month < e.gov.nextMeeting; i++) e = advanceMonth(e).state;
      return e;
    });
  },
  /** ライバルのセール攻勢を今月から始める（店のいちばん多いエリアで 3 か月） */
  startCampaign(current: SaveData): SaveData {
    return withEmpire(current, (e) => {
      if (!e.nation) return e;
      const c = planCampaign(e.nation, e.month);
      return c ? { ...e, campaign: { ...c, start: e.month, end: e.month + 3 } } : e;
    });
  },
  /** シェアを分割の線（5 割）の上にする：開いているエリアのライバルを減らし、直営を足す */
  overShare(current: SaveData): SaveData {
    return withEmpire(current, (e) => {
      if (!e.nation) return e;
      return { ...e, nation: { ...e.nation, regions: e.nation.regions.map((r) => (r.locked ? r : { ...r, rival: Math.floor(r.rival / 3), direct: Math.max(r.direct, Math.round(r.capacity * 0.75) - r.fcOwner - r.fcHq) })) } };
    });
  },
  /** 本拠のランドを次の創業ランドに切り替える（品ぞろえはそのランドでいちばん合うもの） */
  nextLand(current: SaveData): SaveData {
    return withEmpire(current, (e) => {
      const i = FOUNDING_LANDS.findIndex((k) => k === e.land);
      const land = FOUNDING_LANDS[(i + 1) % FOUNDING_LANDS.length];
      return { ...e, land, focus: bestFocus(land) };
    });
  },
  /** キングから謁見の招待を出す（注目度 100。フェーズ 3 から） */
  inviteAudience(current: SaveData): SaveData {
    return withEmpire(current, (e) => (e.phase >= 3 ? { ...e, court: { ...(e.court ?? newCourt()), attention: 100, stage: 2, invited: true, audience: false } } : e));
  },
  /** 決定を変えずに n か月進める */
  advanceMonths(current: SaveData, n: number): SaveData {
    return withEmpire(current, (e) => {
      for (let i = 0; i < n; i++) e = advanceMonth(e).state;
      return e;
    });
  },
  /**
   * マインちゃんの登場から確かめる：この周回を Day 10 でクリアしたことにして、会社を消す
   * （会社があると誘いは出ず、経営画面が直接開くため）
   */
  meetUnlock(current: SaveData): SaveData {
    return { ...current, prestige: { ...current.prestige, clearDay: 10 }, empire: null };
  },
  /** 会社を消す（マインちゃんの誘いからやり直す） */
  dropEmpire(current: SaveData): SaveData {
    return { ...current, empire: null };
  },
  /** フェーズ 2（エリアチェーン）へ飛ぶ：3 店を出して条件を満たし、格上げしたところ（資金 1 億を残す） */
  jumpPhase2(current: SaveData, seed = 1): SaveData {
    // いまの会社のランドと品ぞろえのまま（会社がなければ工房のランド）
    let e = { ...newEmpire(current.empire?.name || t('テスト', 'Test'), seed, current.empire?.land ?? current.prestige.home ?? 'Ocean', current.empire?.focus), funds: 1e9 };
    e = advanceMonth(e, { open: plotsFor(e).slice(0, 2) }).state;
    for (let i = 0; i < 24 && !canPromote(e); i++) e = advanceMonth(e).state;
    e = advanceMonth(e, { promote: true }).state;
    return { ...current, empire: { ...e, funds: 1e8 } };
  },
  /** フェーズ 3（全国チェーン）へ飛ぶ：フェーズ 2 の条件（12 店・センター）を満たして格上げしたところ（資金 10 億を残す） */
  jumpPhase3(current: SaveData, seed = 1): SaveData {
    let e = { ...testActions.jumpPhase2(current, seed).empire!, funds: 1e10 };
    const free = freeCells(e.area!, new Set(ownCells(e)));
    e = advanceMonth(e, { buildCenter: [free[0]], openAt: free.slice(1, 10) }).state;
    for (let i = 0; i < 12 && !canPromote(e); i++) e = advanceMonth(e).state;
    e = advanceMonth(e, { promote: true }).state;
    return { ...current, empire: { ...e, funds: 1e9 } };
  },
  setSeed(current: SaveData, seed: number): SaveData {
    return withEmpire(current, (e) => ({ ...e, rng: seed >>> 0 }));
  },
};

function withEmpire(current: SaveData, f: (e: EmpireState) => EmpireState): SaveData {
  if (!current.empire) throw new Error(t('先に会社を作ってください', 'Found the company first'));
  return { ...current, empire: f(current.empire) };
}

/** パネルの中身。`apply` はセーブを書いてページを読み直す */
export function testPanelView(save: SaveData, apply: (data: SaveData) => void, exitUrl: string): HTMLElement {
  const msg = h('p.save-msg', {});
  const btn = (label: string, run: () => SaveData | null) =>
    h(
      'button.btn.small',
      {
        onclick: () => {
          try {
            const next = run();
            if (next) apply(next);
          } catch (err) {
            msg.textContent = err instanceof SaveError || err instanceof Error ? err.message : String(err);
            msg.className = 'save-msg error';
          }
        },
      },
      label,
    );
  const copy = () => {
    const prod = readProductionSave();
    if (!prod) {
      msg.textContent = t('本番のセーブがありません', 'There is no production save');
      msg.className = 'save-msg error';
      return null;
    }
    return testActions.copyProduction(save, prod);
  };
  return h(
    'div.test-panel',
    {},
    h('p', {}, t(`テスト用のセーブ：Day ${save.day}・${fmt(save.gum)} GUM・ダスト ${fmt(save.resources.dust)}・${save.prestige.runs + 1} 周目`, `Test save: Day ${save.day} · ${fmt(save.gum)} GUM · ${fmt(save.resources.dust)} dust · run ${save.prestige.runs + 1}`)),
    h('p.test-panel-note', {}, t('ここで変えるのはテスト用のセーブだけです。本番のセーブ・ランキングには触れません。', 'Only the test save changes here. The production save and leaderboards are untouched.')),
    h('h3', {}, t('セーブ', 'Save')),
    h('div.test-panel-row', {}, btn(t('本番のセーブを写す', 'Copy the production save'), copy), btn(t('最初から', 'Start over'), () => testActions.reset(save))),
    h('h3', {}, t('工房', 'Workshop')),
    h(
      'div.test-panel-row',
      {},
      btn('+1M GUM', () => testActions.addGum(save, 1e6)),
      btn('+1B GUM', () => testActions.addGum(save, 1e9)),
      btn(t('+6,000億 GUM', '+600B GUM'), () => testActions.addGum(save, 6e11)),
      btn(t('+10万 ダスト', '+100K dust'), () => testActions.addDust(save, 1e5)),
      btn(t('+1 日', '+1 day'), () => testActions.skipDays(save, 1)),
      btn(t('+7 日', '+7 days'), () => testActions.skipDays(save, 7)),
    ),
    h('h3', {}, t('経営モード', 'Management mode')),
    h('p.test-panel-note', {}, t('テストモードでは、マインちゃんの登場条件（14 日未満のクリア）を最初から満たしている扱いです。会社が無ければ、スキルツリーへ移ったときかホームの「🏢 経営」でマインちゃんが誘いに来ます。', "In test mode the unlock condition (a clear in under 14 days) counts as met. Without a company, Mine-chan visits when you open the skill tree or press 🏢 Company on the home screen.")),
    h(
      'p.test-panel-note',
      {},
      save.empire
        ? t(`${save.empire.name}・${save.empire.month + 1} か月目・資金 ${fmt(save.empire.funds)}・${save.empire.stores.length} 店・乱数 ${save.empire.rng}`, `${save.empire.name} · month ${save.empire.month + 1} · funds ${fmt(save.empire.funds)} · ${save.empire.stores.length} store(s) · rng ${save.empire.rng}`)
        : t('まだ会社がありません', 'No company yet'),
    ),
    h(
      'div.test-panel-row',
      {},
      btn(t('マインちゃんの登場からやり直す（会社を消す）', "Restart from Mine-chan's visit (removes the company)"), () => testActions.meetUnlock(save)),
      save.empire ? btn(t('会社を消す', 'Remove the company'), () => testActions.dropEmpire(save)) : null,
      btn(save.empire ? t('会社を作り直す（種 1）', 'Refound (seed 1)') : t('会社を作る（種 1）', 'Found (seed 1)'), () => testActions.foundEmpire(save, 1)),
      btn(t('フェーズ 2 へ飛ぶ', 'Jump to phase 2'), () => testActions.jumpPhase2(save)),
      btn(t('フェーズ 3 へ飛ぶ', 'Jump to phase 3'), () => testActions.jumpPhase3(save)),
      btn(t('+1 億 資金', '+100M funds'), () => testActions.addFunds(save, 1e8)),
      btn(t('要望を出す（支持度 35）', 'Raise a request (support 35)'), () => testActions.stakeDemand(save)),
      btn(t('英雄を 6 人スカウト済みに', 'Scout 6 heroes'), () => testActions.scoutSome(save)),
      btn(t('次の総会の月まで進める', 'Advance to the next meeting'), () => testActions.toMeeting(save)),
      btn(t('本拠のランドを切り替える', 'Switch home land'), () => testActions.nextLand(save)),
      btn(t('謁見の招待を出す', 'Send an audience invitation'), () => testActions.inviteAudience(save)),
      btn(t('ライバルのセール攻勢を起こす', 'Start a rival price war'), () => testActions.startCampaign(save)),
      btn(t('シェアを 5 割超えに', 'Push share over 50%'), () => testActions.overShare(save)),
      btn(t('+1 か月', '+1 month'), () => testActions.advanceMonths(save, 1)),
      btn(t('+12 か月', '+12 months'), () => testActions.advanceMonths(save, 12)),
      btn(t('乱数の種を 1 に', 'Seed rng = 1'), () => testActions.setSeed(save, 1)),
    ),
    msg,
    h('p', {}, h('a', { href: exitUrl }, t('テストモードを抜ける（通常の画面へ）', 'Leave test mode'))),
  );
}
