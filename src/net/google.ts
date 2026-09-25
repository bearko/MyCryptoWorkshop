import { lang } from '../i18n';

/**
 * Sign in with Google (Google Identity Services). The script loads only when the ranking screen
 * shows the button; the ID token it hands back goes to the leaderboard server, which checks it.
 */

interface GoogleId {
  initialize(config: { client_id: string; callback: (response: { credential: string }) => void; ux_mode?: 'popup'; auto_select?: boolean }): void;
  renderButton(el: HTMLElement, options: Record<string, string | number>): void;
}

const SCRIPT = 'https://accounts.google.com/gsi/client';

let loading: Promise<GoogleId> | null = null;
let initializedFor: string | null = null;
/** The current screen's handler (the library is initialized once per page). */
let onCredential: (credential: string) => void = () => undefined;

function load(): Promise<GoogleId> {
  loading ??= new Promise<GoogleId>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => {
      const id = (window as { google?: { accounts?: { id?: GoogleId } } }).google?.accounts?.id;
      if (id) resolve(id);
      else reject(new Error('gsi'));
    };
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error('gsi'));
    };
    document.head.append(script);
  });
  return loading;
}

/** Puts Google's sign-in button into `el`; `handler` gets the ID token after a sign-in. */
export async function renderGoogleButton(el: HTMLElement, clientId: string, handler: (credential: string) => void): Promise<void> {
  const id = await load();
  onCredential = handler;
  if (initializedFor !== clientId) {
    id.initialize({ client_id: clientId, callback: (r) => onCredential(r.credential), ux_mode: 'popup', auto_select: false });
    initializedFor = clientId;
  }
  id.renderButton(el, { type: 'standard', theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill', locale: lang });
}
