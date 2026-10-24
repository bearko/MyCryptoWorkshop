// ライバル（docs/EMPIRE_DESIGN.md 6 章）。各ランドに、実業家ヒーローが率いる会社。会社名はすべて架空。

export interface Rival {
  /** ランドのキー（catalog の lands[].key） */
  land: string;
  /** 率いるヒーローの id（MCH） */
  hero: number;
  company: { ja: string; en: string };
}

export const RIVALS: Rival[] = [
  { land: 'Ocean', hero: 5008, company: { ja: '海援商会', en: 'Kaien Trading' } }, // i18n-ja
  { land: 'Strawberry', hero: 4014, company: { ja: 'ブリオッシュ・ロワイヤル', en: 'Brioche Royale' } }, // i18n-ja
  { land: 'Tangerine', hero: 4008, company: { ja: '東方見聞交易', en: 'Travels East Trading' } }, // i18n-ja
  { land: 'Lime', hero: 4007, company: { ja: 'メンロ電灯商会', en: 'Menlo Lamp Co.' } }, // i18n-ja
  { land: 'Graphite', hero: 4034, company: { ja: 'ジェネシス決済', en: 'Genesis Pay' } }, // i18n-ja
  { land: 'Grape', hero: 3003, company: { ja: 'エレキテル本舗', en: 'Elekiter Honpo' } }, // i18n-ja
  { land: 'Sage', hero: 2041, company: { ja: 'プア・リチャード社', en: "Poor Richard's" } }, // i18n-ja
  { land: 'Blueberry', hero: 4041, company: { ja: 'ワーデンクリフ電力', en: 'Wardenclyffe Power' } }, // i18n-ja
  { land: 'Ruby', hero: 5002, company: { ja: '大陸ホールディングス', en: 'Continental Holdings' } }, // i18n-ja
];

/** 本拠のランドのライバル（ランドが無い・知らないときは Ocean の海援商会） */
export function rivalOf(land: string | null | undefined): Rival {
  return RIVALS.find((r) => r.land.toLowerCase() === (land ?? '').toLowerCase()) ?? RIVALS[0];
}
