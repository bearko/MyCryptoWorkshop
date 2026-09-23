/** Where a thief comes in from and escapes to. */
export type ThiefRoute = 'door' | 'ceiling' | 'window' | 'smoke';

export interface ThiefStyle {
  entry: ThiefRoute;
  exit: ThiefRoute;
  /** Movement speed multiplier. */
  speed: number;
  /** Steal-time multiplier. */
  steal: number;
  /** Taps needed to catch. */
  hp: number;
  /** Looks like a normal customer (no red glow) until it starts stealing. */
  disguise?: boolean;
  /** Short description shown in the log. */
  trait: string;
}

const DEFAULT_STYLE: ThiefStyle = { entry: 'door', exit: 'door', speed: 1, steal: 1, hp: 1, trait: '入口から忍び込む' };

/** Behaviour per villain hero, based on each hero's story. Keyed by hero id. */
export const THIEF_STYLES: Record<number, ThiefStyle> = {
  2003: { entry: 'door', exit: 'door', speed: 1, steal: 0.8, hp: 1, disguise: true, trait: '霧に紛れて客のふりをする' }, // ジャック・ザ・リッパー
  3013: { entry: 'ceiling', exit: 'ceiling', speed: 1, steal: 0.7, hp: 1, trait: '天井から忍び込む大泥棒' }, // 石川五右衛門
  4036: { entry: 'window', exit: 'window', speed: 0.9, steal: 1, hp: 2, trait: '窓から乗り込む海賊・2回タップ' }, // 黒髭
  3032: { entry: 'window', exit: 'window', speed: 1.25, steal: 0.9, hp: 1, trait: '窓から飛び込む女海賊' }, // アン・ボニー
  3036: { entry: 'door', exit: 'door', speed: 1.6, steal: 0.8, hp: 1, trait: '駆け抜ける女無法者' }, // ベル・スター
  4006: { entry: 'door', exit: 'door', speed: 1.8, steal: 0.6, hp: 1, trait: '早撃ちの早業' }, // ビリー・ザ・キッド
  3049: { entry: 'door', exit: 'door', speed: 0.7, steal: 1.2, hp: 3, trait: '居座る暴君・3回タップ' }, // 董卓
  3007: { entry: 'door', exit: 'door', speed: 0.9, steal: 1, hp: 2, trait: '尊大な暴君・2回タップ' }, // 皇帝ネロ
  4046: { entry: 'smoke', exit: 'smoke', speed: 0.8, steal: 1, hp: 1, trait: '煙とともに現れ消える怪僧' }, // ラスプーチン
};

export const thiefStyle = (heroId: number): ThiefStyle => THIEF_STYLES[heroId] ?? DEFAULT_STYLE;
