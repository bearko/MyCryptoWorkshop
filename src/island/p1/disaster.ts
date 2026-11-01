/**
 * ランクアップの災害と徴収の演出（発掘 v2 の 7 段目。docs/ISLAND_PHASE1.md「ランクアップの災害と復興」）。
 * 全画面の重ね（地図の上）で、順に：① 災害（揺れ・雲・雨・稲光・ひび）→ ② 被害の一覧（Common の町の札が「🏚 被災」に）→
 * ③ ランドの役人の通知（全額徴収）→ ④ 復興協定書にサイン（店の名前が手書きで書かれていく）→ ハンコ（赤い丸印・「ポン」と揺れ）→
 * ⑤ ランドからの復興の支度金。タップで次へ（自動でも進む）。仮の絵は CSS とコード（docs/ISLAND_ART_TODO.md）
 */
import { t, isEn } from '../../i18n';
import { assetUrl } from '../../render/images';
import { sectorDef, TIER_NAME } from './company';
import { sectorIcon } from './landui';
import type { P1State, ResetRec } from './model';
import type { Sfx } from './sfx';
import { btn, h, money } from './ui';

/** 店の名前の幅（全角 2・半角 1。16 まで＝全角 8 文字・英語 16 文字） */
export const nameWidth = (x: string) => [...x].reduce((a, c) => a + (/[\u0000-ÿ｡-ﾟ]/.test(c) ? 1 : 2), 0);
export const NAME_MAX = 16;
/** 店の名前をそろえる（前後の空白を取り、幅 16 まで） */
export function fitName(x: string): string {
  let out = '';
  for (const c of [...x.trim()]) {
    if (nameWidth(out + c) > NAME_MAX) break;
    out += c;
  }
  return out;
}
/** 初期値の案 */
export const defaultName = () => t('マイクリ商会', 'MyCrypto & Co.');

export interface DisasterHooks {
  sfx: (k: Sfx, gain?: number, rate?: number) => void;
  toast: (text: string) => void;
  save: () => void;
}

/** 演出の段 */
type Step = 'storm' | 'damage' | 'notice' | 'sign' | 'stamp' | 'grant';

/**
 * 災害と徴収の演出を出す。終わったら done（行き先の町のマインちゃんの会話へ）。店の名前が無ければサインの段で入力してセーブに残す
 */
export function playDisaster(root: HTMLElement, s: P1State, rec: ResetRec, hooks: DisasterHooks, done: () => void) {
  // isl-modal：会話と同じく、出ているあいだは時間も到着の案内も止める
  const m = h('div', 'isl-modal isl-disaster');
  const sky = h('div', 'isl-disaster-sky');
  // 雲・雨・稲光（仮の絵：CSS）
  for (let k = 0; k < 5; k++) {
    const c = h('div', 'isl-disaster-cloud');
    c.style.setProperty('--k', String(k));
    sky.append(c);
  }
  const rain = h('div', 'isl-disaster-rain');
  const flash = h('div', 'isl-disaster-flash');
  sky.append(rain, flash);
  const stage = h('div', 'isl-disaster-stage');
  const foot = h('div', 'isl-disaster-foot');
  const next = h('small', 'isl-disaster-next', t('▶ タップで進む', '▶ Tap to continue'));
  foot.append(next);
  m.append(sky, stage, foot);
  root.append(m);
  let step: Step = 'storm';
  let timer = 0;
  let busy = false;
  const ids = Object.keys(rec.ruins);
  const later = (ms: number, f: () => void) => {
    clearTimeout(timer);
    timer = window.setTimeout(f, ms);
  };

  const finish = () => {
    clearTimeout(timer);
    rec.seen = true;
    hooks.save();
    m.classList.add('is-out');
    window.setTimeout(() => {
      m.remove();
      done();
    }, 350);
  };

  /** ① 災害：揺れ・雲・雨・稲光・ひび。ランドの Common の町の札を並べる */
  const storm = () => {
    step = 'storm';
    m.classList.add('is-storm');
    stage.replaceChildren();
    const title = h('h2', 'isl-disaster-title', t('🌀 ランドを大きな災害が襲った…', '🌀 A great disaster struck the land…'));
    const map = h('div', 'isl-disaster-map');
    for (const id of ids) {
      const d = sectorDef(id);
      const card = h('div', 'isl-disaster-town');
      card.dataset.id = id;
      const img = h('img');
      img.src = sectorIcon(d.tier);
      img.alt = '';
      card.append(img, h('b', '', d.name), h('small', 'isl-disaster-tag', t(`${TIER_NAME[d.tier]}`, `${TIER_NAME[d.tier]}`)));
      const crack = h('span', 'isl-disaster-crack');
      card.append(crack);
      map.append(card);
    }
    stage.append(title, map);
    hooks.toast(t('🌀 ランドを大きな災害が襲った…', '🌀 A great disaster struck the land…'));
    hooks.sfx('error', 1, 0.6);
    window.setTimeout(() => hooks.sfx('katsun', 1, 0.5), 500);
    later(2600, damage);
  };

  /** ② 被害の一覧：札が順に「🏚 被災」に（建物の数） */
  const damage = () => {
    clearTimeout(timer);
    step = 'damage';
    busy = true;
    const cards = [...stage.querySelectorAll<HTMLElement>('.isl-disaster-town')];
    cards.forEach((c, k) => {
      window.setTimeout(() => {
        c.classList.add('is-hit');
        const id = c.dataset.id!;
        const tag = c.querySelector('.isl-disaster-tag')!;
        tag.textContent = t(`🏚 被災（${rec.ruins[id] ?? 0} 軒）`, `🏚 Hit (${rec.ruins[id] ?? 0})`);
        hooks.sfx('katsun', 0.8, 0.7 + k * 0.05);
      }, 350 * k);
    });
    window.setTimeout(() => {
      busy = false;
      stage.append(h('p', 'isl-disaster-sub', t(`開拓した土地は荒れ地に戻り、建物はすべて廃墟に…（${ids.length} つの町・${Object.values(rec.ruins).reduce((a, b) => a + b, 0)} 軒）`, `Cleared land went back to wasteland and every building was wrecked… (${ids.length} towns · ${Object.values(rec.ruins).reduce((a, b) => a + b, 0)} buildings)`)));
      later(2600, notice);
    }, 350 * cards.length + 300);
  };

  /** ③ ランドの役人の通知：全額徴収 */
  const notice = () => {
    step = 'notice';
    m.classList.remove('is-storm');
    m.classList.add('is-calm');
    stage.replaceChildren();
    const card = h('div', 'isl-disaster-notice');
    const seal = h('div', 'isl-disaster-office', '🏛');
    card.append(
      seal,
      h('b', '', t('ランド復興局からの通知', 'Notice from the Land Recovery Office')),
      h('p', '', t('ランドの復興のため、進出企業の資金を全額徴収します。', 'For the land’s recovery, all funds of companies operating here will be levied.')),
      h('div', 'isl-disaster-levy', t(`徴収額 ${money(rec.levy)}`, `Levy ${money(rec.levy)}`)),
      h('small', 'isl-dim', t('研究ポイント・ヒーロー・研究で開けたパネルは、そのまま残ります。', 'Research points, heroes and research panels stay with you.')),
    );
    stage.append(card);
    hooks.sfx('page');
    later(4200, sign);
  };

  /** ④ 復興協定書：店の名前（無ければ入力）→ 手書きで書かれていく */
  const sign = () => {
    step = 'sign';
    clearTimeout(timer);
    stage.replaceChildren();
    const paper = h('div', 'isl-disaster-paper');
    paper.append(
      h('h3', '', t('復興協定書', 'Recovery Agreement')),
      h('p', '', t(`ランド復興局（以下「甲」）と下記の店（以下「乙」）は、ランドの復興について次のとおり協定する。`, 'The Land Recovery Office ("the Office") and the store below ("the Store") agree as follows on the recovery of the land.')),
      h('p', '', t(`第 1 条　乙は、復興のための徴収（${money(rec.levy)}）に応じる。`, `Art. 1  The Store accepts the recovery levy (${money(rec.levy)}).`)),
      h('p', '', t(`第 2 条　甲は、乙に復興の支度金（${money(rec.grant)}）を支給し、${TIER_NAME[rec.tier]} のセクタ「${sectorDef(rec.to).name}」への進出を認める。`, `Art. 2  The Office pays the Store a recovery grant (${money(rec.grant)}) and permits it to expand into ${sectorDef(rec.to).name} (${TIER_NAME[rec.tier]}).`)),
      h('p', '', t('第 3 条　乙は、被災した町の復興に努める。', 'Art. 3  The Store shall work toward rebuilding the ruined towns.')),
    );
    const line = h('div', 'isl-disaster-line');
    line.append(h('small', '', t('乙（店の名前）', 'The Store (name)')));
    const sig = h('span', 'isl-disaster-sig');
    line.append(sig);
    const stampAt = h('span', 'isl-disaster-stampat', t('印', 'Seal'));
    line.append(stampAt);
    paper.append(line);
    stage.append(paper);
    const write = (name: string) => {
      s.storeName = name;
      hooks.save();
      sig.textContent = name;
      sig.style.setProperty('--n', String([...name].length));
      sig.classList.remove('is-writing');
      void sig.offsetWidth;
      sig.classList.add('is-writing');
      busy = true;
      hooks.sfx('page', 0.6);
      const ms = 220 * [...name].length + 400;
      window.setTimeout(() => {
        busy = false;
        later(1200, () => stamp(paper, stampAt, name));
      }, ms);
    };
    if (s.storeName) {
      write(s.storeName);
      return;
    }
    // 店の名前の入力（初めてのサインだけ。以後は同じ名前）
    busy = true;
    const form = h('div', 'isl-disaster-name');
    form.append(h('b', '', t('店の名前を決めよう（あとのサインでも使います）', 'Name your store (used for later signatures too)')));
    const input = h('input', 'isl-disaster-input');
    input.type = 'text';
    input.value = defaultName();
    input.setAttribute('aria-label', t('店の名前', 'Store name'));
    input.maxLength = 16;
    const hint = h('small', 'isl-dim', t('全角 8 文字・英語 16 文字まで', 'Up to 16 letters (8 full-width)'));
    const ok = btn(t('✍ サインする', '✍ Sign'), () => {
      const name = fitName(input.value) || defaultName();
      form.remove();
      write(name);
    }, 'is-on');
    input.addEventListener('input', () => {
      const v = fitName(input.value);
      if (v !== input.value.trim()) input.value = v;
      hint.classList.toggle('isl-warn', nameWidth(v) >= NAME_MAX);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') ok.click();
    });
    form.append(input, hint, ok);
    stage.append(form);
    window.setTimeout(() => input.focus(), 50);
  };

  /** ハンコ：赤い丸印に店の名前。押すと「ポン」と少し揺れる */
  const stamp = (paper: HTMLElement, at: HTMLElement, name: string) => {
    step = 'stamp';
    const st = h('span', 'isl-disaster-stamp');
    const chars = [...name];
    st.classList.toggle('is-long', chars.length > 4 || isEn);
    st.textContent = name;
    at.replaceChildren(st);
    void st.offsetWidth;
    st.classList.add('is-down');
    window.setTimeout(() => {
      hooks.sfx('place', 1.2, 0.8);
      paper.classList.add('is-bump');
    }, 260);
    later(2200, grant);
  };

  /** ⑤ 支度金 */
  const grant = () => {
    step = 'grant';
    stage.replaceChildren();
    const card = h('div', 'isl-disaster-grant');
    const mi = h('img', 'isl-disaster-mine');
    mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
    mi.alt = '';
    const coins = h('div', 'isl-disaster-coins');
    for (let k = 0; k < 8; k++) {
      const c = h('span', '', '🪙');
      c.style.setProperty('--k', String(k));
      coins.append(c);
    }
    card.append(coins, h('b', '', t('ランドから復興の支度金', 'Recovery grant from the land')), h('div', 'isl-disaster-levy is-gain', `+${money(rec.grant)}`), mi);
    stage.append(card);
    hooks.sfx('levelup');
    hooks.toast(t(`ランドから復興の支度金 ${money(rec.grant)}`, `Recovery grant from the land: ${money(rec.grant)}`));
    later(3600, finish);
  };

  m.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.isl-disaster-name')) return;
    if (busy) return;
    if (step === 'storm') damage();
    else if (step === 'damage') notice();
    else if (step === 'notice') sign();
    else if (step === 'stamp') grant();
    else if (step === 'grant') finish();
  });
  storm();
}
