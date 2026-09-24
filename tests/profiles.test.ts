import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { Hono } from 'hono';
import { ZodError } from 'zod';
import { HTTPException } from 'hono/http-exception';
import jpeg from 'jpeg-js';
import { api } from '../src/server/api';
import {
  getPublicProfile,
  getOwnProfile,
  cleanupAvatars,
  avatarResponse,
} from '../src/server/profiles';
import { bootstrap, getDetail } from '../src/server/db';
import { testDatabase } from './sqlite';
import type { Bindings } from '../src/server/env';
import worker from '../src/server/index';

const session = vi.hoisted(() => ({ id: 'one' as string | null }));
vi.mock('../src/server/auth', () => ({
  createAuth: () => ({
    api: {
      getSession: async () =>
        session.id
          ? { user: { id: session.id, name: 'Stale provider name', email: 'one@example.test' } }
          : null,
    },
  }),
}));
let database: ReturnType<typeof testDatabase>;
let app: Hono;
let env: Bindings;
const put = vi.fn();
const remove = vi.fn();
const get = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  session.id = 'one';
  database = testDatabase();
  for (const id of ['one', 'two'])
    database.sqlite
      .prepare('INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES(?,?,?,0,0)')
      .run(id, `Name ${id}`, `${id}@example.test`);
  app = new Hono().route('/api', api);
  app.onError((error, c) =>
    c.json(
      { error: error instanceof ZodError ? 'Invalid profile fields' : error.message },
      error instanceof ZodError ? 400 : error instanceof HTTPException ? error.status : 500,
    ),
  );
  env = {
    DB: database.db,
    APP_URL: 'https://example.test',
    PHOTOS: { put, delete: remove, get },
  } as unknown as Bindings;
});
afterEach(() => database.sqlite.close());
function call(path: string, body?: unknown, method = body ? 'PATCH' : 'GET') {
  return app.request(
    `/api${path}`,
    {
      method,
      headers: { Origin: 'https://example.test', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    },
    env,
  );
}
const health = {
  name: 'My display name',
  conditions: ['Coeliac', 'Wheat allergy'],
  symptoms: 'Sometimes',
  share_health: false,
};
test('private answers never enter public profiles or bootstrap, including after sharing is disabled', async () => {
  expect((await call('/my/profile', health)).status).toBe(200);
  expect(await getOwnProfile(database.db, 'one')).toMatchObject(health);
  for (const shared of [false, true, false]) {
    await call('/my/profile', { share_health: shared });
    session.id = null;
    const response = await call('/profiles/one');
    expect(response.status).toBe(200);
    const profile = await response.json();
    const initial = await bootstrap(env, 'https://example.test/users/one');
    expect(initial.profile).toEqual(profile);
    expect(profile).not.toHaveProperty('share_health');
    expect(profile).not.toHaveProperty('email');
    expect(profile).not.toHaveProperty('role');
    if (shared)
      expect(profile).toMatchObject({ conditions: health.conditions, symptoms: 'Sometimes' });
    else {
      expect(profile).not.toHaveProperty('conditions');
      expect(profile).not.toHaveProperty('symptoms');
      expect(JSON.stringify(initial)).not.toContain('Wheat allergy');
    }
    session.id = 'one';
  }
  expect(await getOwnProfile(database.db, 'one')).toMatchObject({
    conditions: health.conditions,
    symptoms: 'Sometimes',
  });
});
test('defaults, partial saves, provider name changes and clearing health fields', async () => {
  expect(await (await call('/my/profile')).json()).toMatchObject({
    name: 'Name one',
    avatar: { preset: 'initials', url: null },
    conditions: [],
    symptoms: null,
    share_health: false,
  });
  await call('/my/profile', health);
  database.sqlite.exec("UPDATE user SET name='New provider name' WHERE id='one'");
  expect(await (await call('/me')).json()).toMatchObject({ name: 'My display name' });
  await call('/my/profile', { avatar_preset: 'sun' });
  expect(await getOwnProfile(database.db, 'one')).toMatchObject({
    ...health,
    avatar: { preset: 'sun', url: null },
  });
  await call('/my/profile', { conditions: [], symptoms: 'I don’t know' });
  expect(await getOwnProfile(database.db, 'one')).toMatchObject({
    conditions: [],
    symptoms: 'I don’t know',
  });
  await call('/my/profile', { symptoms: null });
  expect((await getOwnProfile(database.db, 'one'))?.symptoms).toBe(null);
});

test('rendered profile HTML omits private health fields and missing profiles return 404', async () => {
  await call('/my/profile', health);
  const runtimeEnv = {
    ...env,
    ASSETS: {
      fetch: async () =>
        new Response(
          '<html><head><title>Test</title></head><body><!--app--><!--bootstrap--></body></html>',
        ),
    },
  } as unknown as Bindings;
  const response = await worker.fetch(new Request('https://example.test/users/one'), runtimeEnv);
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('My display name');
  expect(html).not.toContain('Wheat allergy');
  expect(html).not.toContain('Sometimes');
  expect(html).not.toContain('share_health');
  expect(html).not.toContain('one@example.test');
  expect(
    (await worker.fetch(new Request('https://example.test/users/missing'), runtimeEnv)).status,
  ).toBe(404);
});
test('profile writes require a session and cannot change another user or privileged fields', async () => {
  session.id = null;
  expect((await call('/my/profile', health)).status).toBe(401);
  session.id = 'one';
  for (const patch of [
    { ...health, user_id: 'two' },
    { role: 'admin' },
    { cam_verified: 1 },
    { ownerships: ['place'] },
    { conditions: ['Unknown'] },
    { symptoms: 'Often' },
    { name: ' ' },
    { avatar_preset: 'javascript:alert(1)' },
    { share_health: 'true' },
  ])
    expect((await call('/my/profile', patch)).status).toBe(400);
  expect(
    (
      await app.request(
        '/api/my/profile',
        {
          method: 'PATCH',
          headers: { Origin: 'https://other.test', 'Content-Type': 'application/json' },
          body: JSON.stringify(health),
        },
        env,
      )
    ).status,
  ).toBe(403);
  expect(await getOwnProfile(database.db, 'two')).toMatchObject({
    name: 'Name two',
    conditions: [],
  });
  expect(database.sqlite.prepare('SELECT * FROM submissions').all()).toHaveLength(0);
});
test('current identities decorate reviews and replies while imported provenance is preserved', async () => {
  database.sqlite
    .exec(`INSERT INTO places(id,slug,name,island) VALUES('place','place','Place','Malta');
    INSERT INTO feedback(id,place_id,author_id,author_name,kind,body) VALUES('review','place','one','Old name','review','A review'),('import','place','two','Original attribution','imported','Source wording');
    INSERT INTO replies(id,feedback_id,place_id,author_id,author_name,body,created_at,updated_at) VALUES('reply','review','place','one','Old name','Reply','2026-01-01','2026-01-01');`);
  await call('/my/profile', { ...health, avatar_preset: 'leaf' });
  const detail = await getDetail(env, 'place');
  expect(detail?.feedback.find((row) => row.id === 'review')).toMatchObject({
    author_name: 'My display name',
    author: { id: 'one', avatar: { preset: 'leaf' } },
  });
  expect(detail?.replies[0]).toMatchObject({
    author_name: 'My display name',
    author: { id: 'one' },
  });
  expect(detail?.feedback.find((row) => row.id === 'import')).toMatchObject({
    author_name: 'Original attribution',
    body: 'Source wording',
    author: null,
  });
  expect(JSON.stringify(detail)).not.toContain('Wheat allergy');
});
function bytes(width = 64, height = 64) {
  return new Uint8Array(
    jpeg.encode({ width, height, data: Buffer.alloc(width * height * 4, 255) }, 85).data,
  );
}
function upload(data = bytes(), type = 'image/jpeg') {
  const body = new FormData();
  body.set('avatar', new File([data], 'avatar.jpg', { type }));
  return app.request(
    '/api/my/avatar',
    { method: 'POST', headers: { Origin: 'https://example.test' }, body },
    env,
  );
}
test('avatar rejects invalid format, bytes, dimensions and size before R2 storage', async () => {
  for (const response of [
    await upload(bytes(), 'image/png'),
    await upload(new Uint8Array([1, 2, 3])),
    await upload(bytes(257, 257)),
    await upload(bytes(64, 32)),
    await upload(new Uint8Array(100001)),
  ])
    expect(response.status).toBe(400);
  expect(put).not.toHaveBeenCalled();
});
test('avatar upload strips metadata, preserves role, replaces old files and supports presets and removal', async () => {
  database.sqlite.exec("INSERT INTO profiles(user_id,role) VALUES('one','admin')");
  const original = bytes();
  const comment = Buffer.from('private-avatar-location');
  const annotated = new Uint8Array(
    Buffer.concat([
      original.slice(0, 2),
      Buffer.from([255, 254, 0, comment.length + 2]),
      comment,
      original.slice(2),
    ]),
  );
  expect((await upload(annotated)).status).toBe(201);
  const stored = put.mock.calls[0][1];
  expect(stored.byteLength).toBeLessThanOrEqual(100000);
  expect(Buffer.from(stored).includes(comment)).toBe(false);
  expect(jpeg.decode(stored).width).toBe(64);
  const firstKey = put.mock.calls[0][0];
  expect((await upload()).status).toBe(201);
  expect(remove).toHaveBeenCalledWith(firstKey);
  const nextKey = put.mock.calls[1][0];
  await call('/my/profile', { avatar_preset: 'flower' });
  expect(remove).toHaveBeenCalledWith(nextKey);
  expect(await getPublicProfile(database.db, 'one')).toMatchObject({
    avatar: { preset: 'flower', url: null },
  });
  await upload();
  await call('/my/avatar', undefined, 'DELETE');
  expect((await getOwnProfile(database.db, 'one'))?.avatar).toEqual({
    preset: 'initials',
    url: null,
  });
  expect(database.sqlite.prepare("SELECT role FROM profiles WHERE user_id='one'").get()?.role).toBe(
    'admin',
  );
  expect(database.sqlite.prepare('SELECT * FROM submissions').all()).toHaveLength(0);
});
test('failed storage and database saves preserve the previous avatar with retryable cleanup', async () => {
  await upload();
  const previous = (await getOwnProfile(database.db, 'one'))?.avatar.url;
  put.mockRejectedValueOnce(new Error('R2 unavailable'));
  expect((await upload()).status).toBe(500);
  expect((await getOwnProfile(database.db, 'one'))?.avatar.url).toBe(previous);
  database.sqlite.exec(
    "CREATE TRIGGER fail_profile BEFORE UPDATE ON profiles BEGIN SELECT RAISE(ABORT,'test failure'); END;",
  );
  remove.mockRejectedValue(new Error('Delete unavailable'));
  expect((await upload()).status).toBe(500);
  expect((await getOwnProfile(database.db, 'one'))?.avatar.url).toBe(previous);
  expect(database.sqlite.prepare('SELECT * FROM avatar_cleanup').all()).toHaveLength(1);
  remove.mockResolvedValue(undefined);
  database.sqlite.exec("UPDATE avatar_cleanup SET queued_at='2020-01-01'");
  await cleanupAvatars(env);
  expect(database.sqlite.prepare('SELECT * FROM avatar_cleanup').all()).toHaveLength(0);
});
test('account deletion removes profile and health, makes avatar inaccessible, and schedules R2 cleanup', async () => {
  await call('/my/profile', { ...health, share_health: true });
  await upload();
  const key = put.mock.calls[0][0];
  get.mockResolvedValue({ body: new Blob([bytes()]).stream() });
  expect((await avatarResponse(env, 'one')).status).toBe(200);
  expect((await call('/my/account', { confirmation: 'DELETE' }, 'DELETE')).status).toBe(200);
  expect(await getPublicProfile(database.db, 'one')).toBe(null);
  expect((await avatarResponse(env, 'one')).status).toBe(404);
  expect((await call('/profiles/one')).status).toBe(404);
  expect(database.sqlite.prepare('SELECT * FROM avatar_cleanup').all()).toMatchObject([
    { object_key: key },
  ]);
  database.sqlite.exec("UPDATE avatar_cleanup SET queued_at='2020-01-01'");
  await cleanupAvatars(env);
  expect(remove).toHaveBeenCalledWith(key);
});
