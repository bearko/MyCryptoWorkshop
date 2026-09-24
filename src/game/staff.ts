import { staffHeroes, type Hero } from './catalog';

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
  | 'peddler';

export interface RoleInfo {
  /** Job title. */
  job: string;
  /** What the staff member does, for the skill tree. */
  work: string;
  /** Where they work, for the results screen and help. */
  area: 'shop' | 'workshop';
}

export const ROLES: Record<StaffRole, RoleInfo> = {
  stocker: { job: '品出し係', work: '倉庫から棚への補充が速くなる', area: 'shop' },
  host: { job: '案内係', work: '客を出迎えて棚へ案内する。客が品選びに迷わなくなり、長く待ってくれる', area: 'shop' },
  promoter: { job: '宣伝係', work: '店先で呼び込みをする。来客ペースが上がる', area: 'shop' },
  consultant: { job: '相談役', work: '客に高い品を勧める。高い品が選ばれやすくなる', area: 'shop' },
  guard: { job: '警備係', work: '店内を見回り、泥棒を追いかけて捕まえる', area: 'shop' },
  accountant: { job: '会計係', work: '閉店時に売上の一部をボーナスとして上乗せする', area: 'shop' },
  exterminator: { job: '退治係', work: '工房に入り込んだエネミーを追い払う', area: 'workshop' },
  appraiser: { job: '鑑定士', work: 'クラフトした品を鑑定する。エディション付きが出やすくなる', area: 'shop' },
  delivery: { job: '配達係', work: 'マーケット出品の出荷が速くなり、高く売れる', area: 'workshop' },
  researcher: { job: '研究者', work: '営業中に研究ポイントを生み出す', area: 'shop' },
  peddler: { job: '行商人', work: '倉庫の品を持って町へ売りに行く（客が来なくても売上）', area: 'shop' },
};

export const STAFF_ROLES = Object.keys(ROLES) as StaffRole[];

/** The hero working a role at a given staff level (1 = first hire, 2 = ace). */
export function staffHero(role: StaffRole, staffLevel: number): Hero {
  const h = staffHeroes[role];
  if (!h) throw new Error(`no staff hero for ${role}`);
  return staffLevel >= 2 ? h.ace : h.hero;
}
