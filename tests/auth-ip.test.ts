import { expect, test } from 'vitest';
import { getIP } from '@better-auth/core/utils/ip';
import { createAuth } from '../src/server/auth';
import type { Bindings } from '../src/server/env';

const env = {
  APP_URL: 'https://coeliac.mt',
  ENVIRONMENT: 'production',
  BETTER_AUTH_SECRET: 'test-only-authentication-secret-at-least-32-characters',
} as Bindings;

test('hosted authentication separates clients and ignores spoofed forwarding headers', () => {
  const options = createAuth(env).options;
  const headers = new Headers({
    'CF-Connecting-IP': '192.0.2.10',
    'X-Forwarded-For': '198.51.100.20, 198.51.100.30',
    'X-Real-IP': '198.51.100.40',
  });
  expect(getIP(headers, options)).toBe('192.0.2.10');
  headers.set('X-Forwarded-For', '203.0.113.50');
  expect(getIP(headers, options)).toBe('192.0.2.10');
  headers.set('CF-Connecting-IP', '192.0.2.11');
  expect(getIP(headers, options)).toBe('192.0.2.11');
  headers.delete('CF-Connecting-IP');
  expect(getIP(headers, options)).not.toBe('203.0.113.50');
});

test('local authentication never trusts caller-supplied client IPs', () => {
  const options = createAuth({
    ...env,
    APP_URL: 'http://127.0.0.1:5173',
    ENVIRONMENT: 'development',
  }).options;
  const headers = new Headers({
    'CF-Connecting-IP': '192.0.2.10',
    'X-Forwarded-For': '203.0.113.50',
  });
  const first = getIP(headers, options);
  expect(first).not.toBe('192.0.2.10');
  expect(first).not.toBe('203.0.113.50');
  headers.set('CF-Connecting-IP', '192.0.2.11');
  headers.set('X-Forwarded-For', '203.0.113.51');
  expect(getIP(headers, options)).toBe(first);
});
