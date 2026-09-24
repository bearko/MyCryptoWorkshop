import { t } from '../i18n';
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

const DEFAULT_STYLE: ThiefStyle = { entry: 'door', exit: 'door', speed: 1, steal: 1, hp: 1, trait: t('入口から忍び込む', 'Sneaks in through the door') };

/** Behaviour per villain hero, based on each hero's story. Keyed by hero id. */
export const THIEF_STYLES: Record<number, ThiefStyle> = {
  2003: { entry: 'door', exit: 'door', speed: 1, steal: 0.8, hp: 1, disguise: true, trait: t('霧に紛れて客のふりをする', 'Blends into the fog, posing as a customer') }, // ジャック・ザ・リッパー
  3013: { entry: 'ceiling', exit: 'ceiling', speed: 1, steal: 0.7, hp: 1, trait: t('天井から忍び込む大泥棒', 'Master thief who drops from the ceiling') }, // 石川五右衛門
  4036: { entry: 'window', exit: 'window', speed: 0.9, steal: 1, hp: 2, trait: t('窓から乗り込む海賊・2回タップ', 'Pirate who boards through the window (2 taps)') }, // 黒髭
  3032: { entry: 'window', exit: 'window', speed: 1.25, steal: 0.9, hp: 1, trait: t('窓から飛び込む女海賊', 'Pirate who leaps in through the window') }, // アン・ボニー
  3036: { entry: 'door', exit: 'door', speed: 1.6, steal: 0.8, hp: 1, trait: t('駆け抜ける女無法者', 'Outlaw who dashes through') }, // ベル・スター
  4006: { entry: 'door', exit: 'door', speed: 1.8, steal: 0.6, hp: 1, trait: t('早撃ちの早業', 'Lightning-fast gunslinger') }, // ビリー・ザ・キッド
  3049: { entry: 'door', exit: 'door', speed: 0.7, steal: 1.2, hp: 3, trait: t('居座る暴君・3回タップ', 'Tyrant who won\'t leave (3 taps)') }, // 董卓
  3007: { entry: 'door', exit: 'door', speed: 0.9, steal: 1, hp: 2, trait: t('尊大な暴君・2回タップ', 'Arrogant tyrant (2 taps)') }, // 皇帝ネロ
  4046: { entry: 'smoke', exit: 'smoke', speed: 0.8, steal: 1, hp: 1, trait: t('煙とともに現れ消える怪僧', 'Mad monk who comes and goes in smoke') }, // ラスプーチン
};

export const thiefStyle = (heroId: number): ThiefStyle => THIEF_STYLES[heroId] ?? DEFAULT_STYLE;
