// i18n-check: skip — Japanese number units are used only in Japanese.
import { isEn } from '../i18n';

/** Japanese large-number units, every 10^4. */
const UNITS = ['', '万', '億', '兆', '京', '垓', '𥝱', '穣', '溝', '澗', '正', '載', '極'];
/** English short-scale units, every 10^3. */
const UNITS_EN = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd', 'Td', 'Qad', 'Qid'];

/**
 * Formats GUM and other counts for display: plain digits below 10,000, then units with about
 * four significant digits — Japanese 万/億/兆 (1.23万, 12.3億) or English K/M/B (12.3K, 4.56B).
 * Past the last unit it falls back to scientific notation.
 */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  if (n < 0) return `-${fmt(-n)}`;
  const locale = isEn ? 'en-US' : 'ja-JP';
  if (n < 1e4) return Math.floor(n).toLocaleString(locale);
  const [units, step] = isEn ? [UNITS_EN, 3] : [UNITS, 4];
  const unit = Math.min(units.length - 1, Math.floor(Math.log10(n) / step));
  const v = n / Math.pow(10, unit * step);
  if (v >= Math.pow(10, step)) return n.toExponential(2).replace('e+', 'e');
  // Truncate (never round up past what the player actually has).
  const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
  const scale = Math.pow(10, digits);
  // (The epsilon keeps 4.56 from truncating to 4.55 through float error.)
  const shown = Math.floor(v * scale + 1e-9) / scale;
  const text = digits ? shown.toFixed(digits).replace(/\.?0+$/, '') : Math.floor(shown).toLocaleString(locale);
  return text + units[unit];
}

/** Seconds as a short label: 2.34秒 / 12.3s. */
export function secs(s: number): string {
  return `${s.toFixed(s < 10 ? 2 : 1)}${isEn ? 's' : '秒'}`;
}
