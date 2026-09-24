import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { testDatabase } from './sqlite';
import { api } from '../src/server/api';
import { decide } from '../src/server/moderation';
import type { Bindings } from '../src/server/env';

vi.mock('../src/server/auth', () => ({
  createAuth: () => ({
    api: {
      getSession: async () => ({
        user: { id: 'admin', name: 'Admin', email: 'admin@example.test' },
      }),
    },
  }),
}));
let database: ReturnType<typeof testDatabase>;
beforeEach(() => {
  database = testDatabase();
  database.sqlite.exec(`
    INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES('admin','Admin','admin@example.test',0,0);
    INSERT INTO profiles(user_id,role) VALUES('admin','admin');
    INSERT INTO places(id,slug,name,island) VALUES('place','place','Existing place','Malta');
    INSERT INTO feedback(id,place_id,kind,body) VALUES('feedback','place','imported','Community feedback');
  `);
});
afterEach(() => database.sqlite.close());
function submit(kind: string, payload: unknown, target_id?: string) {
  return api.request(
    '/submissions',
    {
      method: 'POST',
      headers: { Origin: 'https://example.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        payload,
        target_id,
        ...(kind === 'place' ? {} : { place_id: 'place' }),
      }),
    },
    { DB: database.db, APP_URL: 'https://example.test' } as Bindings,
  );
}
const review = { body: 'A useful review', rating: 4, visit_date: '2026-01-01' };
test.each(['member', 'moderator'])(
  '%s contributions still wait for moderation even with a forged admin payload',
  async (role) => {
    database.sqlite.prepare('UPDATE profiles SET role=?').run(role);
    expect(
      await (await submit('review', { ...review, role: 'admin', status: 'approved' })).json(),
    ).toMatchObject({ status: 'pending' });
    expect(
      database.sqlite.prepare("SELECT * FROM feedback WHERE kind='review'").all(),
    ).toHaveLength(0);
  },
);
test('admin reviews publish and update immediately, with decision history', async () => {
  for (const rating of [4, 2]) {
    const response = await submit('review', { ...review, rating });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ status: 'approved' });
    expect(
      database.sqlite.prepare("SELECT rating FROM feedback WHERE kind='review'").get()?.rating,
    ).toBe(rating);
  }
  expect(
    database.sqlite.prepare("SELECT * FROM submissions WHERE status='pending'").all(),
  ).toHaveLength(0);
  expect(database.sqlite.prepare('SELECT * FROM audit_log').all()).toHaveLength(2);
});
test('admin places and corrections publish immediately without modifying CAM', async () => {
  expect(
    await (
      await submit('place', { name: 'New cafe', island: 'Gozo', business_types: ['Cafe'] })
    ).json(),
  ).toMatchObject({ status: 'approved' });
  expect(
    database.sqlite.prepare("SELECT published FROM places WHERE name='New cafe'").get()?.published,
  ).toBe(1);
  expect(
    await (
      await submit('correction', { description: 'Updated immediately', cam_verified: 1 })
    ).json(),
  ).toMatchObject({ status: 'approved' });
  expect(
    database.sqlite.prepare("SELECT description,cam_verified FROM places WHERE id='place'").get(),
  ).toMatchObject({ description: 'Updated immediately', cam_verified: 0 });
});
test('admin owner replies and cover selections publish immediately', async () => {
  database.sqlite.exec(
    "INSERT INTO ownerships VALUES('admin','place','other-admin','2026-01-01',1); INSERT INTO photos(id,place_id,author_id,object_key,thumb_key,caption,status) VALUES('photo','place','admin','key','thumb','Photo','approved');",
  );
  expect(
    await (await submit('reply', { body: 'An owner reply' }, 'feedback')).json(),
  ).toMatchObject({ status: 'approved' });
  expect(database.sqlite.prepare('SELECT body,visible FROM replies').get()).toMatchObject({
    body: 'An owner reply',
    visible: 1,
  });
  expect(await (await submit('correction', { cover_photo_id: 'photo' })).json()).toMatchObject({
    status: 'approved',
  });
  expect(database.sqlite.prepare('SELECT photo_id FROM place_covers').get()?.photo_id).toBe(
    'photo',
  );
  expect((await submit('review', review)).status).toBe(403);
});
test('admin reports hide content immediately', async () => {
  expect(
    await (
      await submit('report', { body: 'Remove this content', target_type: 'feedback' }, 'feedback')
    ).json(),
  ).toMatchObject({ status: 'approved' });
  expect(
    database.sqlite.prepare("SELECT visible FROM feedback WHERE id='feedback'").get()?.visible,
  ).toBe(0);
});
test('admin ownership claims still require independent verification', async () => {
  const result = (await (
    await submit('owner_claim', { body: 'I represent this business' })
  ).json()) as { id: string; status: string };
  expect(result.status).toBe('pending');
  await expect(
    decide(
      database.db,
      { id: 'admin', role: 'admin', name: 'Admin', email: 'admin@example.test', ownerships: [] },
      result.id,
      true,
      '',
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect(database.sqlite.prepare('SELECT * FROM ownerships').all()).toHaveLength(0);
});
test('publication failure leaves no pending submission or partial edit', async () => {
  database.sqlite.exec(
    "CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'test failure'); END;",
  );
  const response = await submit('correction', { description: 'Must roll back' });
  expect(response.status).toBe(500);
  expect(database.sqlite.prepare('SELECT * FROM submissions').all()).toHaveLength(0);
  expect(
    database.sqlite.prepare("SELECT description FROM places WHERE id='place'").get()?.description,
  ).toBe('');
});
