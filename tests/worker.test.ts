import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from '../worker/index';

/** env for the Worker; ASSETS answers every non-API request with a marker. */
function env(vars: Partial<Env> = {}): Env {
  return { ASSETS: { fetch: async () => new Response('asset') }, ...vars };
}

describe('Cloudflare Worker entry', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('serves the built site for everything outside /api/leaderboard', async () => {
    const res = await worker.fetch(new Request('https://workshop.bearko.games/'), env());
    expect(await res.text()).toBe('asset');
  });

  it('sends /api/leaderboard to the handler, keyed on cf-connecting-ip, with Upstash from env', async () => {
    const sent: { url: string; auth: string | null; commands: unknown[][] }[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const commands = JSON.parse(String(init?.body)) as unknown[][];
      sent.push({ url: String(input), auth: new Headers(init?.headers).get('authorization'), commands });
      return new Response(JSON.stringify(commands.map(() => ({ result: null }))));
    });
    await worker.fetch(
      new Request('https://workshop.bearko.games/api/leaderboard?board=total', { headers: { 'cf-connecting-ip': '5.6.7.8' } }),
      env({ UPSTASH_REDIS_REST_URL: 'https://example.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'tok' }),
    );
    expect(sent[0].url).toBe('https://example.upstash.io/pipeline');
    expect(sent[0].auth).toBe('Bearer tok');
    expect(JSON.stringify(sent[0].commands)).toContain('lb:ip:5.6.7.8:');
  });
});
