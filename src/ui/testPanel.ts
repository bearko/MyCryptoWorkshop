// テストモード（?test=1）のデバッグパネル。テスト用のセーブだけを書き換える（本番のセーブは読むだけ）。
// フェーズへ飛ぶ道具は、フェーズ 2 以降ができてから足す。
import { newEmpire, type EmpireState } from '../empire/model';
import { advanceMonth } from '../empire/sim';
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
  /** 営業日を n 日進める（その日の始めから） */
  skipDays(current: SaveData, n: number): SaveData {
    return { ...current, day: Math.max(1, current.day + n) };
  },
  /** 会社を作る（もうあれば作り直す）。種を決めておくと同じ月が出る */
  foundEmpire(current: SaveData, seed = 1): SaveData {
    return { ...current, empire: newEmpire(current.empire?.name || t('テスト商店', 'Test Store'), seed) };
  },
  addFunds(current: SaveData, amount: number): SaveData {
    return withEmpire(current, (e) => ({ ...e, funds: e.funds + amount }));
  },
  /** 決定を変えずに n か月進める */
  advanceMonths(current: SaveData, n: number): SaveData {
    return withEmpire(current, (e) => {
      for (let i = 0; i < n; i++) e = advanceMonth(e).state;
      return e;
    });
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
    h('p', {}, t(`テスト用のセーブ：Day ${save.day}・${fmt(save.gum)} GUM・${save.prestige.runs + 1} 周目`, `Test save: Day ${save.day} · ${fmt(save.gum)} GUM · run ${save.prestige.runs + 1}`)),
    h('p.test-panel-note', {}, t('ここで変えるのはテスト用のセーブだけです。本番のセーブ・ランキングには触れません。', 'Only the test save changes here. The production save and leaderboards are untouched.')),
    h('h3', {}, t('セーブ', 'Save')),
    h('div.test-panel-row', {}, btn(t('本番のセーブを写す', 'Copy the production save'), copy), btn(t('最初から', 'Start over'), () => testActions.reset(save))),
    h('h3', {}, t('工房', 'Workshop')),
    h(
      'div.test-panel-row',
      {},
      btn('+1M GUM', () => testActions.addGum(save, 1e6)),
      btn('+1B GUM', () => testActions.addGum(save, 1e9)),
      btn(t('+1 日', '+1 day'), () => testActions.skipDays(save, 1)),
      btn(t('+7 日', '+7 days'), () => testActions.skipDays(save, 7)),
    ),
    h('h3', {}, t('経営モード', 'Management mode')),
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
      btn(save.empire ? t('会社を作り直す（種 1）', 'Refound (seed 1)') : t('会社を作る（種 1）', 'Found (seed 1)'), () => testActions.foundEmpire(save, 1)),
      btn(t('+1 億 資金', '+100M funds'), () => testActions.addFunds(save, 1e8)),
      btn(t('+1 か月', '+1 month'), () => testActions.advanceMonths(save, 1)),
      btn(t('+12 か月', '+12 months'), () => testActions.advanceMonths(save, 12)),
      btn(t('乱数の種を 1 に', 'Seed rng = 1'), () => testActions.setSeed(save, 1)),
    ),
    msg,
    h('p', {}, h('a', { href: exitUrl }, t('テストモードを抜ける（通常の画面へ）', 'Leave test mode'))),
  );
}
