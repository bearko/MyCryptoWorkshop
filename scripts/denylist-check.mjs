#!/usr/bin/env node
// 禁止語の検査。PR の差分（足した行）、変わったファイルの名前、PR のタイトルと本文、
// コミットメッセージに、DENYLIST の語が入っていないかを見る。
//
//   DENYLIST="$(cat 語の一覧)" node scripts/denylist-check.mjs <比べる元の ref>
//
// - DENYLIST は 1 行に 1 語。Unicode 正規化（NFKC）と小文字化をしてから照合する
// - 見つかったら「どこか」（ファイル名と行番号、またはコミットの短い id）だけを出して失敗する。
//   一致した語そのものはログに出さない（ログは誰でも読めるため）
// - DENYLIST が空なら失敗する（検査が通ったように見えるのを防ぐ）
// - PR のタイトルと本文は、GitHub Actions のイベント（GITHUB_EVENT_PATH）から読む
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const norm = (s) => s.normalize('NFKC').toLowerCase();
const words = (process.env.DENYLIST ?? '')
  .split(/\r?\n/)
  .map((w) => norm(w.trim()))
  .filter((w) => w.length > 0);

if (words.length === 0) {
  console.error('DENYLIST がありません。リポジトリの Settings → Secrets and variables → Actions に DENYLIST を登録してください。');
  process.exit(1);
}

const base = process.argv[2] ?? 'origin/HEAD';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const hit = (text) => {
  const t = norm(text);
  return words.some((w) => t.includes(w));
};

const found = [];

// 1. 変わったファイルの名前（消したファイルは見ない）
const names = git('diff', '--name-only', '--diff-filter=d', `${base}...HEAD`).split('\n').filter(Boolean);
for (const f of names) if (hit(f)) found.push(`ファイル名: ${f}`);

// 2. 足した行（ファイルと行番号）
const diff = git('diff', '--unified=0', '--no-color', '--diff-filter=d', `${base}...HEAD`);
let file = null;
let line = 0;
for (const l of diff.split('\n')) {
  if (l.startsWith('+++ ')) {
    file = l.startsWith('+++ b/') ? l.slice(6) : null;
  } else if (l.startsWith('@@')) {
    const m = /\+(\d+)/.exec(l);
    line = m ? Number(m[1]) : 0;
  } else if (l.startsWith('+') && file) {
    if (hit(l.slice(1))) found.push(`${file}:${line}`);
    line++;
  }
}

// 3. コミットメッセージ
const log = git('log', '--format=%h%x00%B%x01', `${base}..HEAD`);
for (const entry of log.split('\x01')) {
  const [id, body] = entry.trim().split('\x00');
  if (id && body && hit(body)) found.push(`コミット ${id} のメッセージ`);
}

// 4. PR のタイトルと本文
if (process.env.GITHUB_EVENT_PATH) {
  try {
    const ev = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
    if (ev.pull_request) {
      if (hit(ev.pull_request.title ?? '')) found.push('PR のタイトル');
      if (hit(ev.pull_request.body ?? '')) found.push('PR の本文');
    }
  } catch {
    // イベントが読めなければ、差分とコミットだけを見る
  }
}

if (found.length) {
  console.error(`禁止語が ${found.length} か所にあります（語はログに出しません）:`);
  for (const f of found) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`禁止語なし（${names.length} ファイル・${words.length} 語を確認）`);
