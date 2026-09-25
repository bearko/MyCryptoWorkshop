import type { SaveData } from '../game/save';
import { BOARD_LIST, errorText, fetchBoard, submit, withdraw, type BoardInfo, type BoardResult } from '../net/leaderboard';
import { t } from '../i18n';
import { fmt, h } from './dom';

/** Clear times: 5時間12分03秒 / 5h 12m 03s. */
export function clearTime(seconds: number): string {
  const s = Math.round(seconds);
  const hh = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return t(`${hh}時間${mm}分${ss}秒`, `${hh}h ${mm}m ${ss}s`);
}

const scoreText = (board: BoardInfo, score: number) => (board.unit === 'time' ? clearTime(score) : `${fmt(score)} GUM`);

/** The tab the player looked at last (kept while the page is open). */
let lastBoard = BOARD_LIST[0].key;

/**
 * ランキング: join with a nickname (records are sent only after that), rename or withdraw, and
 * browse the boards. `persist` writes the save after the ranking settings change.
 */
export function rankingView(save: SaveData, persist: () => void): HTMLElement {
  const status = h('p.rank-status', { role: 'status' });
  const account = h('div.rank-account');
  const tabs = h('div.rank-tabs', { role: 'tablist' });
  const desc = h('p.rank-desc');
  const list = h('div.rank-list');
  const say = (text: string, bad = false) => {
    status.textContent = text;
    status.classList.toggle('bad', bad);
  };

  const nameInput = (value: string) =>
    h('input.rank-name', { type: 'text', maxlength: '16', value, placeholder: t('ニックネーム', 'Nickname'), 'aria-label': t('ニックネーム', 'Nickname') }) as HTMLInputElement;

  /** Joins or renames: sends the records under the new name; reverts if the server refuses. */
  async function register(input: HTMLInputElement, button: HTMLButtonElement): Promise<void> {
    const name = input.value.trim();
    if (!name) return say(t('ニックネームを入力してください', 'Enter a nickname'), true);
    const before = { ...save.ranking };
    save.ranking.name = name;
    save.ranking.joined = true;
    button.disabled = true;
    say(t('送信中…', 'Sending...'));
    try {
      await submit(save);
      persist();
      say(before.joined ? t('ニックネームを変更しました', 'Nickname changed') : t('ランキングに参加しました！営業日が終わるたびに記録が送られます', "You're on the leaderboards! Your records are sent after each business day"));
      renderAccount();
      void load();
    } catch (e) {
      Object.assign(save.ranking, before);
      button.disabled = false;
      say(errorText(e), true);
    }
  }

  function renderAccount(): void {
    const r = save.ranking;
    if (!r.joined) {
      const input = nameInput(r.name);
      const join = h('button.btn.btn-primary.small', {}, t('参加する', 'Join')) as HTMLButtonElement;
      join.addEventListener('click', () => void register(input, join));
      account.replaceChildren(
        h('div.rank-form', {}, input, join),
        h('p.muted.small-print', {}, t('参加すると、ニックネームと成績（売上・クリア時間・日数など）がランキングサーバーに送られ、世界中に公開されます。いつでもやめられます。', 'Joining sends your nickname and records (sales, clear times, days and so on) to the leaderboard server, where everyone can see them. You can leave at any time.')),
      );
      return;
    }
    const rename = h('button.btn.small', {}, t('名前を変更', 'Rename')) as HTMLButtonElement;
    const leave = h('button.btn.small', {}, t('参加をやめる', 'Leave')) as HTMLButtonElement;
    rename.addEventListener('click', () => {
      const input = nameInput(r.name);
      const ok = h('button.btn.btn-primary.small', {}, t('変更', 'Save')) as HTMLButtonElement;
      ok.addEventListener('click', () => void register(input, ok));
      account.replaceChildren(h('div.rank-form', {}, input, ok));
      input.focus();
    });
    leave.addEventListener('click', async () => {
      // Two presses: the records are deleted from the server.
      if (leave.dataset.armed !== '1') {
        leave.dataset.armed = '1';
        leave.textContent = t('もう一度押すと記録を削除', 'Press again to delete your records');
        return;
      }
      leave.disabled = true;
      try {
        await withdraw(save);
        save.ranking.joined = false;
        persist();
        say(t('ランキングから記録を削除しました', 'Your records were removed from the leaderboards'));
        renderAccount();
        void load();
      } catch (e) {
        leave.disabled = false;
        say(errorText(e), true);
      }
    });
    account.replaceChildren(h('div.rank-form', {}, h('span', {}, t('ニックネーム: ', 'Nickname: '), h('b', {}, r.name)), rename, leave));
  }

  let token = 0;
  async function load(): Promise<void> {
    const board = BOARD_LIST.find((b) => b.key === lastBoard)!;
    for (const tab of tabs.children) tab.setAttribute('aria-selected', String((tab as HTMLElement).dataset.board === board.key));
    desc.textContent = board.desc;
    list.replaceChildren(h('p.muted', {}, t('読み込み中…', 'Loading...')));
    const mine = ++token;
    let result: BoardResult;
    try {
      result = await fetchBoard(board.key, save.ranking.joined ? save.ranking.id : '');
    } catch (e) {
      if (mine === token) list.replaceChildren(h('p.rank-status.bad', {}, errorText(e)));
      return;
    }
    if (mine !== token) return;
    if (!result.entries.length) {
      list.replaceChildren(h('p.muted', {}, t('まだ記録がありません', 'No records yet')));
    } else {
      list.replaceChildren(
        h(
          'ol.rank-rows',
          {},
          ...result.entries.map((e) =>
            h('li', { class: `rank-row ${e.me ? 'me' : ''} ${e.rank <= 3 ? `top top${e.rank}` : ''}` }, h('span.rank-no', {}, `${e.rank}`), h('span.rank-who', {}, e.name), h('b.rank-score', {}, scoreText(board, e.score))),
          ),
        ),
      );
    }
    const foot = !save.ranking.joined
      ? t('参加すると自分の順位が表示されます', 'Join to see your own rank')
      : result.me
        ? t(`あなた: ${result.me.rank}位 / ${result.count}人（${scoreText(board, result.me.score)}）`, `You: #${result.me.rank} of ${result.count} (${scoreText(board, result.me.score)})`)
        : t('この部門の記録はまだありません', 'No record of yours on this board yet');
    list.append(h('p.rank-foot', {}, foot, result.period ? h('small', {}, ` [${result.period}]`) : null));
  }

  for (const board of BOARD_LIST) {
    tabs.append(
      h(
        'button.rank-tab',
        {
          role: 'tab',
          'data-board': board.key,
          onclick: () => {
            lastBoard = board.key;
            void load();
          },
        },
        board.name,
      ),
    );
  }
  renderAccount();
  void load();
  return h('div.ranking', {}, account, status, tabs, desc, list);
}
