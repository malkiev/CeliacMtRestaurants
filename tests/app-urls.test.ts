import { afterEach, expect, test, vi } from 'vitest';
import { betterAuth } from 'better-auth';
import { appUrls, requestAppUrl } from '../src/server/app-urls';
import { createAuth } from '../src/server/auth';
import type { Bindings } from '../src/server/env';

const env = {
  APP_URL: 'https://glutenfree.mt, https://coeliac.mt/',
  ENVIRONMENT: 'production',
  BETTER_AUTH_SECRET: 'test-secret-with-at-least-32-characters',
  GOOGLE_CLIENT_ID: 'test-client',
  GOOGLE_CLIENT_SECRET: 'test-secret',
} as Bindings;

afterEach(() => vi.restoreAllMocks());

test('normalizes origins, preserves primary order and supports existing single URLs', () => {
  expect(appUrls(env)).toEqual(['https://glutenfree.mt', 'https://coeliac.mt']);
  expect(appUrls({ APP_URL: 'http://127.0.0.1:5173/' })).toEqual(['http://127.0.0.1:5173']);
  expect(appUrls({ APP_URL: 'https://coeliac.mt,https://coeliac.mt/' })).toEqual([
    'https://coeliac.mt',
  ]);
});

test.each([
  '',
  'https://coeliac.mt,',
  'https://coeliac.mt/path',
  'https://user@coeliac.mt',
  'https://*.coeliac.mt',
  'https://coeliac.mt?x=1',
  'https://coeliac.mt#x',
  'ftp://coeliac.mt',
])('rejects invalid configuration %s', (APP_URL) => {
  expect(() => appUrls({ APP_URL })).toThrow();
});

test('uses the visited allowed origin, with a safe primary fallback for proxies', () => {
  expect(requestAppUrl(env, 'https://coeliac.mt/account')).toBe('https://coeliac.mt');
  expect(requestAppUrl(env, 'https://coeliac.mt.evil.test/account')).toBe('https://glutenfree.mt');
  expect(requestAppUrl(env)).toBe('https://glutenfree.mt');
  expect(
    requestAppUrl({ APP_URL: 'http://127.0.0.1:5173' }, 'http://127.0.0.1:8787/api/auth'),
  ).toBe('http://127.0.0.1:5173');
});

test.each(['https://glutenfree.mt', 'https://coeliac.mt'])(
  'Google authorization uses a callback on %s',
  async (origin) => {
    // In-memory adapter avoids external services; disable throttling for this isolated request.
    const auth = betterAuth({
      ...createAuth(env, origin + '/api/auth/sign-in/social').options,
      rateLimit: { enabled: false },
    });
    const response = await auth.handler(
      new Request(origin + '/api/auth/sign-in/social', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', callbackURL: '/account' }),
      }),
    );
    expect(response.status).toBe(200);
    const result = (await response.json()) as { url: string };
    expect(new URL(result.url).searchParams.get('redirect_uri')).toBe(
      origin + '/api/auth/callback/google',
    );
  },
);

test.each(['https://glutenfree.mt', 'https://coeliac.mt'])(
  'email sign-in links stay on %s',
  async (origin) => {
    const send = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const options = createAuth(
      { ...env, RESEND_API_KEY: 'test-key', EMAIL_FROM: 'test@example.test' },
      origin,
    ).options;
    const auth = betterAuth({ ...options, rateLimit: { enabled: false } });
    const response = await auth.handler(
      new Request(origin + '/api/auth/sign-in/magic-link', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'member@example.test', callbackURL: '/account' }),
      }),
    );
    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledOnce();
    const mail = JSON.parse(String(send.mock.calls[0][1]?.body)) as { text: string };
    const link = mail.text.split('\n').find((line) => line.startsWith('https://'))!;
    expect(new URL(link).origin).toBe(origin);
    expect(new URL(link).pathname).toBe('/api/auth/magic-link/verify');
  },
);
