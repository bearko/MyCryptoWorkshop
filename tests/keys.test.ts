// 営業中のキー（Space・Enter・Esc）を、文字の入力中は奪わない（bearko.games のチャットは shadow root の中）
import { describe, expect, it } from 'vitest';
import { isTypingEvent } from '../src/ui/dom';

const ev = (path: object[]) => ({ target: path[path.length - 1] as EventTarget, composedPath: () => path as EventTarget[] });

describe('isTypingEvent', () => {
  it('チャットの入力欄（shadow root の中）なら入力中', () => {
    const input = { tagName: 'INPUT' };
    const host = { tagName: 'DIV' }; // ev.target はこちら（shadow host）になる
    expect(isTypingEvent({ target: host as unknown as EventTarget, composedPath: () => [input, host] as unknown as EventTarget[] })).toBe(true);
  });
  it('テキストエリア・contenteditable も入力中', () => {
    expect(isTypingEvent(ev([{ tagName: 'textarea' }]))).toBe(true);
    expect(isTypingEvent(ev([{ tagName: 'DIV', isContentEditable: true }]))).toBe(true);
  });
  it('ゲームの画面（body・canvas・ボタン）なら入力中ではない', () => {
    expect(isTypingEvent(ev([{ tagName: 'CANVAS' }, { tagName: 'BODY' }]))).toBe(false);
    expect(isTypingEvent(ev([{ tagName: 'BUTTON' }]))).toBe(false);
    expect(isTypingEvent({ target: null })).toBe(false);
  });
});
