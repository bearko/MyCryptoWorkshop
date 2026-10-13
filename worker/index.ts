// Cloudflare Workers entry point.
// /api/leaderboard goes to the handler in api/leaderboard.ts (Web-standard Request/Response,
// so it runs here unchanged); everything else is served from the built site (env.ASSETS).

import { createHandler, upstash, type Store } from '../api/leaderboard';

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  KV_REST_API_URL?: string;
  KV_REST_API_TOKEN?: string;
  GOOGLE_CLIENT_ID?: string;
  LEADERBOARD_REQUIRE_GOOGLE?: string;
  LEADERBOARD_ADMIN_TOKEN?: string;
}

let handler: ((req: Request) => Promise<Response>) | undefined;

function leaderboard(env: Env): (req: Request) => Promise<Response> {
  if (!handler) {
    const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
    const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
    const store: Store | null = url && token ? upstash(url, token) : null;
    handler = createHandler(() => store, {
      adminToken: env.LEADERBOARD_ADMIN_TOKEN || undefined,
      googleClientId: env.GOOGLE_CLIENT_ID || undefined,
      requireGoogle: env.LEADERBOARD_REQUIRE_GOOGLE === '1',
    });
  }
  return handler;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/leaderboard') {
      // The rate limit keys on x-forwarded-for; on Cloudflare the client address is cf-connecting-ip.
      const headers = new Headers(request.headers);
      const ip = request.headers.get('cf-connecting-ip');
      if (ip) headers.set('x-forwarded-for', ip);
      return leaderboard(env)(new Request(request, { headers }));
    }
    return env.ASSETS.fetch(request);
  },
};
