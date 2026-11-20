import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import worker from '../src/server/index';
import { testDatabase } from './sqlite';
import type { Bindings } from '../src/server/env';

const identity = vi.hoisted(() => ({ signedIn: false }));
vi.mock('../src/server/auth', () => ({
  createAuth: () => ({
    api: {
      getSession: async () =>
        identity.signedIn
          ? { user: { id: 'member', email: 'member@example.test', name: 'Member' } }
          : null,
    },
  }),
}));
let database: ReturnType<typeof testDatabase>;
let env: Bindings;
beforeEach(() => {
  identity.signedIn = false;
  database = testDatabase();
  database.sqlite.exec(`
    INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES('member','Member','member@example.test',0,0);
    INSERT INTO profiles(user_id,role) VALUES('member','member');
    INSERT INTO places(id,slug,name,island) VALUES('place','place','Place','Malta');
  `);
  env = { DB: database.db, APP_URL: 'https://coeliac.mt', ENVIRONMENT: 'production' } as Bindings;
});
afterEach(() => database.sqlite.close());

test.each([false, true])(
  'restricted routes deny malformed paths (signed in: %s)',
  async (signedIn) => {
    identity.signedIn = signedIn;
    for (const suffix of ['', '/', '%0A', '%0D', '%E2%80%A8', '%E2%80%A9']) {
      for (const route of ['/api/admin/cam', '/api/moderation/submission/decision']) {
        const response = await worker.fetch(
          new Request(`https://coeliac.mt${route}${suffix}`, {
            method: 'POST',
            headers: { Origin: 'https://coeliac.mt', 'Content-Type': 'application/json' },
            body: JSON.stringify({
              place_id: 'place',
              verified: true,
              note: 'Forged verification',
              approved: true,
            }),
          }),
          env,
        );
        expect([401, 403, 404]).toContain(response.status);
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      }
    }
    expect(
      database.sqlite.prepare("SELECT cam_verified FROM places WHERE id='place'").get()
        ?.cam_verified,
    ).toBe(0);
    expect(database.sqlite.prepare('SELECT * FROM audit_log').all()).toHaveLength(0);
  },
);
