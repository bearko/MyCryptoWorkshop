// 経営モードの乱数（mulberry32）。状態は EmpireState.rng に持ち、同じ状態と同じ決定からは同じ月になる。
// 乱数は「いつ・どれだけ」のぶれだけに使い、危機が「起きるかどうか」には使わない（EMPIRE_DESIGN.md 6.2）。

export interface Rng {
  /** 0 以上 1 未満 */
  next(): number;
  /** 次に使う状態（保存用） */
  readonly state: number;
}

export function makeRng(state: number): Rng {
  let s = state >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let x = s;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    },
    get state() {
      return s;
    },
  };
}
