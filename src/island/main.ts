/**
 * 島づくりの入口。ふだんはフェーズ 1（p1/main.ts）。?test=2&mode=free のときだけ自由建築（free.ts）。
 */
const q = new URLSearchParams(location.search);
if (q.get('test') === '2' && q.get('mode') === 'free') void import('./free');
else void import('./p1/main');
