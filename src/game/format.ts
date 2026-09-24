/** Japanese large-number units, every 10^4. */
const UNITS = ['', '万', '億', '兆', '京', '垓', '𥝱', '穣', '溝', '澗', '正', '載', '極'];

/**
 * Formats GUM and other counts for display: plain digits below 10,000, then Japanese units with
 * about four significant digits (1.23万, 12.3億, 123兆, 1,234京). Past 極 it falls back to
 * scientific notation.
 */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  if (n < 0) return `-${fmt(-n)}`;
  if (n < 1e4) return Math.floor(n).toLocaleString('ja-JP');
  const unit = Math.min(UNITS.length - 1, Math.floor(Math.log10(n) / 4));
  const v = n / Math.pow(10, unit * 4);
  if (v >= 1e4) return n.toExponential(2).replace('e+', 'e');
  // Truncate (never round up past what the player actually has).
  const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
  const scale = Math.pow(10, digits);
  const shown = Math.floor(v * scale) / scale;
  const text = digits ? shown.toFixed(digits).replace(/\.?0+$/, '') : Math.floor(shown).toLocaleString('ja-JP');
  return text + UNITS[unit];
}

/** Seconds as a short label: 2.34秒 / 12.3秒. */
export function secs(s: number): string {
  return `${s.toFixed(s < 10 ? 2 : 1)}秒`;
}
