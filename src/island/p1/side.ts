/**
 * 他店でバイト（営業企画 → 他店でバイト）。資金が尽きて詰まないための助け。
 * ヒーローを他社のお店で働かせ、日給をもらう。ときどき能力値が上がる（docs/ISLAND_PHASE1.md「他店でバイト」）。
 */
import { t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { aptitude, RIVALS } from './data';
import { rankEl } from './heroui';
import { assign, sidePay, type P1State } from './model';
import { after, mineTip, open, rivalName, type Ctx } from './screens';
import { sendSide } from './tile';
import { btn, h, heroIcon, heroName, money } from './ui';

export function openSide(ctx: Ctx) {
  open(ctx, t('他店でバイト', 'Part-time at other stores'), (body) => {
    const s: P1State = ctx.s();
    mineTip(ctx, 'side', body);
    body.append(
      h(
        'p',
        'isl-dim',
        t(
          'お金が足りなくなったら、ヒーローに他社のお店で働いてもらいましょう。販売が得意なヒーローほど日給が高く、ときどき能力が上がります。バイト中は自社の仕事をしません。',
          'Short on funds? Send heroes to work at other stores. Better sellers earn more, and sometimes a stat goes up. They skip company work meanwhile.',
        ),
      ),
    );
    const sum = h('div', 'isl-card2 isl-side-sum');
    const workers = s.staff.filter((x) => x.task === 'side');
    const perDay = workers.reduce((a, x) => a + (x.resting ? 0 : sidePay(x)), 0);
    sum.append(
      h('div', '', t('今月のバイト代', 'Earned this month')),
      h('b', 'isl-big isl-gold', money(s.sideMonth ?? 0)),
      h('small', 'isl-dim', workers.length ? t(`いま ${workers.length} 人がバイト中・1 日 ${money(perDay)}`, `${workers.length} working · ${money(perDay)}/day`) : t('いまバイト中のヒーローはいません', 'Nobody is working part-time')),
    );
    body.append(sum);
    const grid = h('div', 'isl-side-grid');
    for (const r of s.rivals) {
      const def = RIVALS.find((x) => x.id === r.id);
      const card = h('div', 'isl-card2 isl-side-card');
      const top = h('div', 'isl-row');
      const im = h('img', 'isl-side-b');
      im.src = assetUrl(`island/b/${def?.store ?? 'general_store'}/rd.png`);
      im.alt = '';
      top.append(im, h('b', '', rivalName(r.id)));
      card.append(top);
      for (const w of s.staff.filter((x) => x.task === 'side' && x.target === r.id)) {
        const row = h('div', 'isl-side-worker');
        row.append(heroIcon(w.hero, 40), h('span', '', heroName(w.hero)), rankEl(aptitude(w.stats, 'side')), h('small', 'isl-gold', t(`日給 ${money(sidePay(w))}`, `${money(sidePay(w))}/day`)));
        row.append(
          btn(t('呼び戻す', 'Call back'), () => {
            assign(s, w.hero, null);
            after(ctx);
          }),
        );
        card.append(row);
      }
      card.append(btn(t('ヒーローをバイトに出す', 'Send a hero'), () => sendSide(ctx, r.id, rivalName(r.id), () => after(ctx)), 'is-on'));
      grid.append(card);
    }
    body.append(grid);
  });
}
