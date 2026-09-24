/**
 * Language (Japanese or English). Chosen once at start-up — from the saved choice, else the
 * browser language — and switching reloads the page, so every module can build its text at
 * load time with t(ja, en).
 */
export type Lang = 'ja' | 'en';

const KEY = 'mycryptoworkshop.lang';

function detect(): Lang {
  // Tests (and tools) can force a language before importing the game.
  const forced = (globalThis as { MCW_LANG?: string }).MCW_LANG;
  if (forced === 'ja' || forced === 'en') return forced;
  if (typeof window === 'undefined') return 'ja';
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ja' || saved === 'en') return saved;
  } catch {
    // Storage blocked: fall back to the browser language.
  }
  return /^ja\b/i.test(navigator.language ?? 'ja') ? 'ja' : 'en';
}

export const lang: Lang = detect();
export const isEn = lang === 'en';

/** Picks the text for the current language. */
export const t = (ja: string, en: string): string => (isEn ? en : ja);

/** Saves the language and reloads the page in it. */
export function setLang(next: Lang): void {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Without storage the choice lasts only for this page load.
  }
  location.reload();
}
