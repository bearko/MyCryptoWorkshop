import { staffHeroes, type Hero } from './catalog';
import { t } from '../i18n';

/**
 * Shop staff. Each role is hired with a skill node and then stands at its post in the shop
 * (layout.ts STAFF_POSTS). An "ace" node replaces the first hire with a famous hero whose
 * passive skill names the upgrade. What a role does lives in the skill effects (skills.ts)
 * and in shop/staff.ts for the staff who move around.
 */
export type StaffRole =
  | 'stocker'
  | 'host'
  | 'promoter'
  | 'consultant'
  | 'guard'
  | 'accountant'
  | 'exterminator'
  | 'appraiser'
  | 'delivery'
  | 'researcher'
  | 'peddler'
  | 'cleaner'
  | 'charity';

export interface RoleInfo {
  /** Job title. */
  job: string;
  /** What the staff member does, for the skill tree. */
  work: string;
  /** Where they work, for the results screen and help. */
  area: 'shop' | 'workshop';
}

export const ROLES: Record<StaffRole, RoleInfo> = {
  stocker: { job: t('品出し係', 'Stocker'), work: t('倉庫から棚への補充が速くなる', 'Restocks shelves from storage faster'), area: 'shop' },
  host: { job: t('案内係', 'Host'), work: t('客を出迎えて棚へ案内する。客が品選びに迷わなくなり、長く待ってくれる', 'Greets customers and shows them to the shelves. They choose faster and wait longer'), area: 'shop' },
  promoter: { job: t('宣伝係', 'Promoter'), work: t('店先で呼び込みをする。来客ペースが上がる', 'Calls in passers-by. More customers come'), area: 'shop' },
  consultant: { job: t('相談役', 'Consultant'), work: t('客に高い品を勧める。高い品が選ばれやすくなる', 'Recommends pricier items. Customers pick expensive items more often'), area: 'shop' },
  guard: { job: t('警備係', 'Guard'), work: t('店内を見回り、泥棒を追いかけて捕まえる', 'Patrols the shop and chases down thieves'), area: 'shop' },
  accountant: { job: t('会計係', 'Accountant'), work: t('閉店時に売上の一部をボーナスとして上乗せする', 'Adds part of the day\'s sales as a bonus at closing'), area: 'shop' },
  exterminator: { job: t('退治係', 'Exterminator'), work: t('工房に入り込んだエネミーを追い払う', 'Chases off enemies that get into the workshop'), area: 'workshop' },
  appraiser: { job: t('鑑定士', 'Appraiser'), work: t('クラフトした品を鑑定する。エディション付きが出やすくなる', 'Appraises crafted items. Editions come up more often'), area: 'shop' },
  delivery: { job: t('配達係', 'Courier'), work: t('マーケット出品の出荷が速くなり、高く売れる', 'Ships market listings faster and sells them for more'), area: 'workshop' },
  researcher: { job: t('研究者', 'Researcher'), work: t('営業中に研究ポイントを生み出す', 'Produces research points during business hours'), area: 'shop' },
  peddler: { job: t('行商人', 'Peddler'), work: t('倉庫の品を持って町へ売りに行く（客が来なくても売上）', 'Takes stock to sell in town (sales even without customers)'), area: 'shop' },
  cleaner: { job: t('清掃係', 'Cleaner'), work: t('泥や散らかりを片付け、落ちたコインを拾う', 'Cleans up mud and litter and picks up dropped coins'), area: 'shop' },
  charity: { job: t('寄付係', 'Charity Clerk'), work: t('閉店時に倉庫の売れ残りを寄付して名声を得る（名声が多いほど移転の Cp が増える）', 'Donates unsold stock at closing for fame (more fame, more Cp when relocating)'), area: 'shop' },
};

export const STAFF_ROLES = Object.keys(ROLES) as StaffRole[];

/** The hero working a role at a given staff level (1 = first hire, 2 = ace). */
export function staffHero(role: StaffRole, staffLevel: number): Hero {
  const h = staffHeroes[role];
  if (!h) throw new Error(`no staff hero for ${role}`);
  return staffLevel >= 2 ? h.ace : h.hero;
}
