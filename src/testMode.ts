// テストモード（docs/EMPIRE_DESIGN.md「?test=1 の開発環境」）。
// 本番の workshop.bearko.games に開発中の機能を載せたまま、URL に ?test=1 を付けたときだけ見せる。
// テストモードでは本番と別のセーブを使い、ランキング・総合スコア・アチーブメント・RTA に何も送らない。

/** URL の検索部分（`?test=1&...`）がテストモードを指しているか（純関数） */
export function isTestSearch(search: string): boolean {
  try {
    return new URLSearchParams(search).get('test') === '1';
  } catch {
    return false;
  }
}

export const TEST_MODE: boolean = typeof location !== 'undefined' && isTestSearch(location.search);

/** セーブの保存先。テストモードは本番と別のキー（本番のセーブには触れない） */
export function saveKeys(test: boolean): { key: string; backup: string } {
  return test
    ? { key: 'mycryptoworkshop.save.test', backup: 'mycryptoworkshop.save.test.backup' }
    : { key: 'mycryptoworkshop.save', backup: 'mycryptoworkshop.save.backup' };
}

/** テストモードを抜けた URL（同じページ、test だけ外す） */
export function exitTestUrl(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('test');
  return url.toString();
}
