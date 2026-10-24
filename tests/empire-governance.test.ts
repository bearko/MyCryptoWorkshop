// 会社の統治（M8 後半）：役員会・株主総会・定款
import { describe, expect, it } from 'vitest';
import { restoreEmpire, type EmpireState } from '../src/empire/model';
import { advanceMonth } from '../src/empire/sim';
import { BOARD_SEATS, boardMods, capByArticles, MEETING, MEETING_MONTH, PLEDGE, seatBoard, type BoardMember } from '../src/empire/governance';
import { newSave } from '../src/game/save';
import { testActions } from '../src/ui/testPanel';

const phase3 = () => {
  const e = testActions.jumpPhase3(newSave(), 3).empire as EmpireState;
  // 統治の状態は、フェーズ 3 の最初の月に作られる
  return advanceMonth(e).state;
};

/** 総会の月まで、決定なしで進める */
function toMeeting(e: EmpireState): EmpireState {
  while (e.month < e.gov!.nextMeeting) e = advanceMonth(e).state;
  return e;
}

const member = (id: number, kind: BoardMember['kind'], power = 2): BoardMember => ({ id, kind, power });

describe('株主総会', () => {
  it('フェーズ 3 に入ると、半年以上あとの 6 月に最初の総会（面談）が決まる', () => {
    const e = phase3();
    expect(e.gov).toBeDefined();
    expect(e.gov!.nextMeeting % 12).toBe(MEETING_MONTH);
    expect(e.gov!.nextMeeting).toBeGreaterThanOrEqual(e.month + 5);
  });

  it('総会で従業員をたたえると従業員の支持度が上がり、約束が 1 年後の答え合わせに入る', () => {
    const e = toMeeting(phase3());
    const before = e.stake!.support.staff;
    const r = advanceMonth(e, { meeting: { praise: 'staff', rival: 'none', pledge: 'stores' } });
    expect(r.report.notes.some((n) => n.kind === 'meetingHeld')).toBe(true);
    const g = r.state.gov!;
    expect(g.pledge?.kind).toBe('stores');
    expect(g.pledge?.due).toBe(e.month + 12);
    expect(g.nextMeeting).toBe(e.month + 12);
    // 月末の支持度の動きを差し引いても、たたえたぶん上がっている
    expect(r.state.stake!.support.staff).toBeGreaterThan(before);
  });

  it('延期は 1 年に 1 回まで。信任が下がり、2 回目は延ばせずに開かれる', () => {
    const e = toMeeting(phase3());
    const t0 = e.stake!.support.shareholders;
    const a = advanceMonth(e, { postpone: true });
    expect(a.report.notes.some((n) => n.kind === 'meetingPostponed')).toBe(true);
    expect(a.state.gov!.nextMeeting).toBe(e.month + MEETING.postponeMonths);
    expect(a.state.stake!.support.shareholders).toBeLessThan(t0);
    const b = advanceMonth(toMeeting(a.state), { postpone: true });
    expect(b.report.notes.some((n) => n.kind === 'meetingHeld')).toBe(true);
  });

  it('信任が線を割っていると否決され、借入の枠が半分になる', () => {
    let e = toMeeting(phase3());
    e = { ...e, stake: { ...e.stake!, support: { ...e.stake!.support, shareholders: 20 } } };
    const r = advanceMonth(e, { meeting: { praise: 'owners', rival: 'none', pledge: 'noLoss' } });
    const held = r.report.notes.find((n) => n.kind === 'meetingHeld');
    expect(held?.kind === 'meetingHeld' && held.passed).toBe(false);
    expect(r.state.stake!.penalties.some((p) => p.who === 'shareholders')).toBe(true);
  });

  it('約束を守れなかったら、次の総会で信任が下がる', () => {
    let e = toMeeting(phase3());
    e = advanceMonth(e, { meeting: { praise: 'staff', rival: 'none', pledge: 'stores' } }).state;
    e = toMeeting(e);
    // 1 年で 20 店は増やしていない
    const r = advanceMonth(e, { meeting: { praise: 'staff', rival: 'none', pledge: 'noLoss' } });
    const res = r.report.notes.find((n) => n.kind === 'pledgeResult');
    expect(res?.kind === 'pledgeResult' && res.kept).toBe(false);
    expect(PLEDGE.stores).toBeGreaterThan(0);
  });

  it('ライバルを名指しすると、半年はライバルの出店が速まる', () => {
    const e = toMeeting(phase3());
    const r = advanceMonth(e, { meeting: { praise: 'staff', rival: 'declare', pledge: 'noLoss' } });
    expect(r.state.gov!.rivalRushUntil).toBe(e.month + MEETING.rivalRushMonths);
  });
});

describe('役員会', () => {
  it('5 席まで、同じ英雄は 1 席', () => {
    const b = seatBoard([member(1, 'sales'), member(1, 'sales'), member(2, 'craft'), member(3, 'luck'), member(4, 'wait'), member(5, 'vip'), member(6, 'wish')]);
    expect(b).toHaveLength(BOARD_SEATS);
    expect(new Set(b.map((x) => x.id)).size).toBe(BOARD_SEATS);
  });

  it('営業の役員がいると客足が増え、売上が上がる', () => {
    const e = phase3();
    expect(boardMods({ ...e.gov!, board: [member(1, 'sales', 4)] }).demand).toBeGreaterThan(1);
    const base = advanceMonth(e).report.revenue;
    const withBoard = advanceMonth(e, { board: [member(1, 'sales', 4), member(2, 'crowd', 4)] }).report.revenue;
    expect(withBoard).toBeGreaterThan(base);
  });
});

describe('定款', () => {
  it('直営中心なら、加盟店は今月の出店の 3 分の 1 まで', () => {
    const out = capByArticles(
      [
        { region: 0, type: 'direct', count: 4 },
        { region: 0, type: 'fcOwner', count: 5 },
      ],
      { force24: false, mix: 'direct', dividend: 1 },
    );
    expect(out[1].count).toBe(3);
    expect(out[0].count).toBe(4);
  });

  it('上場のときに 24 時間の強制を認めない定款にすると、あとで求めても通らない', () => {
    let e = phase3();
    e = { ...e, nation: { ...e.nation!, listed: false }, history: e.history.map((r) => ({ ...r, revenue: 1e10 })) };
    e = advanceMonth(e, { ipo: true, articles: { force24: false, mix: 'balanced', dividend: 0 } }).state;
    expect(e.nation!.listed).toBe(true);
    e = advanceMonth(e, { force24: true }).state;
    expect(e.nation!.force24).toBe(false);
  });
});

describe('セーブ', () => {
  it('役員会・約束・定款は保存して読み直せる', () => {
    const e = phase3();
    e.gov = { ...e.gov!, board: [member(4007, 'study', 3)], pledge: { kind: 'revenue', made: 30, due: 42, base: 5e9 }, articles: { force24: true, mix: 'franchise', dividend: 2 } };
    const back = restoreEmpire(JSON.parse(JSON.stringify(e)))!;
    expect(back.gov).toEqual(e.gov);
  });
});
