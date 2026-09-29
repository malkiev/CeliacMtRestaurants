import { expect, test, vi } from 'vitest';
import { api } from '../src/server/api';
import type { Bindings } from '../src/server/env';

vi.mock('../src/server/auth', () => ({
  createAuth: () => ({ api: { getSession: async () => null } }),
}));

test.each([
  ['https://glutenfree.mt', 401],
  ['https://coeliac.mt', 401],
  ['https://coeliac.mt.evil.test', 403],
  ['http://coeliac.mt', 403],
  ['https://www.coeliac.mt', 403],
  ['null', 403],
  [undefined, 403],
] as const)('submission origin %s returns %s', async (origin, status) => {
  const response = await api.request(
    'https://coeliac.mt/submissions',
    {
      method: 'POST',
      headers: origin ? { Origin: origin } : {},
    },
    { APP_URL: 'https://glutenfree.mt,https://coeliac.mt' } as Bindings,
  );
  // Allowed origins proceed to authentication; others are rejected before it.
  expect(response.status).toBe(status);
});
