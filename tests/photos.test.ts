import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Hono } from 'hono';
import jpeg from 'jpeg-js';
import { registerPhotos } from '../src/server/photos';
import type { AppEnv, Bindings } from '../src/server/env';
import { testDatabase } from './sqlite';

let database: ReturnType<typeof testDatabase>;
let app: Hono<AppEnv>;
let role: 'member' | 'moderator' | 'admin';
const put = vi.fn();
const remove = vi.fn();
beforeEach(() => {
  role = 'member';
  vi.clearAllMocks();
  database = testDatabase();
  database.sqlite.exec(
    "INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES('user','User','user@example.test',0,0); INSERT INTO places(id,slug,name,island) VALUES('place','place','Place','Malta');",
  );
  app = new Hono<AppEnv>();
  app.use('*', async (c, next) => {
    c.set('member', {
      id: 'user',
      name: 'User',
      email: 'user@example.test',
      role,
      ownerships: [],
    });
    await next();
  });
  registerPhotos(app);
});
afterEach(() => {
  vi.restoreAllMocks();
  database.sqlite.close();
});
function jpegBytes(width = 800, height = 600) {
  return new Uint8Array(
    jpeg.encode({ width, height, data: Buffer.alloc(width * height * 4, 255) }, 75).data,
  );
}
function upload(bytes = jpegBytes(), type = 'image/jpeg') {
  const body = new FormData();
  body.set('photo', new File([bytes], 'photo.jpg', { type }));
  body.set('place_id', 'place');
  body.set('caption', 'Example photo');
  return app.request('/photos', { method: 'POST', body }, {
    DB: database.db,
    PHOTOS: { put, delete: remove },
  } as unknown as Bindings);
}

test('rejects non-JPEG, oversized payloads and invalid JPEG bytes before storage', async () => {
  for (const response of [
    await upload(jpegBytes(), 'image/png'),
    await upload(new Uint8Array(800001)),
    await upload(new Uint8Array([1, 2, 3])),
  ]) {
    expect(response.status).toBe(400);
  }
  expect(put).not.toHaveBeenCalled();
});

test.each([
  [1281, 100],
  [100, 1281],
  [1500, 1500],
])('rejects decoded dimensions %i x %i', async (width, height) => {
  expect((await upload(jpegBytes(width, height))).status).toBe(400);
  expect(put).not.toHaveBeenCalled();
});

test('stores a clean JPEG and 400px thumbnail and queues moderation', async () => {
  expect((await upload()).status).toBe(201);
  expect(put).toHaveBeenCalledTimes(2);
  const original = jpeg.decode(put.mock.calls[0][1]);
  const thumbnail = jpeg.decode(put.mock.calls[1][1]);
  expect([original.width, original.height]).toEqual([800, 600]);
  expect([thumbnail.width, thumbnail.height]).toEqual([400, 300]);
  expect(put.mock.calls[0][2]).toEqual({ httpMetadata: { contentType: 'image/jpeg' } });
  expect(database.sqlite.prepare('SELECT status FROM photos').get()?.status).toBe('pending');
  expect(database.sqlite.prepare('SELECT kind FROM submissions').get()?.kind).toBe('photo');
});

test('admin photos publish immediately with an audit record', async () => {
  role = 'admin';
  const response = await upload();
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ status: 'approved' });
  expect(database.sqlite.prepare('SELECT status FROM photos').get()?.status).toBe('approved');
  expect(database.sqlite.prepare('SELECT status,decided_by FROM submissions').get()).toMatchObject({
    status: 'approved',
    decided_by: 'user',
  });
  expect(database.sqlite.prepare('SELECT actor_id,action FROM audit_log').get()).toMatchObject({
    actor_id: 'user',
    action: 'approve',
  });
});

test('moderator photos still require approval', async () => {
  role = 'moderator';
  expect(await (await upload()).json()).toMatchObject({ status: 'pending' });
  expect(database.sqlite.prepare('SELECT status FROM photos').get()?.status).toBe('pending');
});

test('admin publication failure rolls back all rows and removes stored photos', async () => {
  role = 'admin';
  database.sqlite.exec(
    "CREATE TRIGGER fail_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
  );
  app.onError((_error, c) => c.text('Failed', 500));
  expect((await upload()).status).toBe(500);
  expect(remove).toHaveBeenCalledWith(put.mock.calls.map((call) => call[0]));
  for (const table of ['photos', 'submissions', 'audit_log'])
    expect(database.sqlite.prepare(`SELECT * FROM ${table}`).all()).toHaveLength(0);
});

test('removes both R2 objects when the database insertion fails', async () => {
  database.sqlite.exec(
    "CREATE TRIGGER fail_photo BEFORE INSERT ON submissions BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
  );
  app.onError((_error, c) => c.text('Failed', 500));
  expect((await upload()).status).toBe(500);
  expect(remove).toHaveBeenCalledWith(put.mock.calls.map((call) => call[0]));
  expect(database.sqlite.prepare('SELECT COUNT(*) count FROM photos').get()?.count).toBe(0);
});

test('allows the twentieth daily photo and rejects the twenty-first', async () => {
  const insert = database.sqlite.prepare(
    'INSERT INTO photos(id,place_id,author_id,object_key,thumb_key,caption,created_at) VALUES(?,?,?,?,?,?,?)',
  );
  for (let i = 0; i < 19; i++)
    insert.run(
      String(i),
      'place',
      'user',
      `key${i}`,
      `thumb${i}`,
      'Photo',
      new Date().toISOString(),
    );
  expect((await upload()).status).toBe(201);
  expect((await upload()).status).toBe(429);
  expect(put).toHaveBeenCalledTimes(2);
});
