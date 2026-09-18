import { afterEach, beforeEach, expect, test } from 'vitest';
import { testDatabase } from './sqlite';
import { checkCover } from '../src/server/covers';
import { decide } from '../src/server/moderation';
import { placeSelect } from '../src/server/db';
import type { Member } from '../src/shared/types';

let database: ReturnType<typeof testDatabase>;
const moderator: Member = { id: 'mod', role: 'moderator', name: 'Mod', email: 'mod@example.test', ownerships: [] };
beforeEach(() => {
  database = testDatabase();
  database.sqlite.exec(`
    INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES('owner','Owner','owner@example.test',0,0),('mod','Mod','mod@example.test',0,0);
    INSERT INTO places(id,slug,name,island) VALUES('place','place','Place','Malta'),('other','other','Other','Malta');
    INSERT INTO ownerships VALUES('owner','place','mod','2026-01-01',1);
    INSERT INTO photos(id,place_id,author_id,object_key,thumb_key,caption,status,created_at) VALUES
      ('first','place','owner','first','first-thumb','First photo','approved','2026-01-01'),
      ('cover','place','owner','cover','cover-thumb','Cover photo','approved','2026-02-01'),
      ('pending','place','owner','pending','pending-thumb','Pending photo','pending','2026-03-01'),
      ('other-photo','other','owner','other','other-thumb','Other place','approved','2026-01-01');
    INSERT INTO submissions(id,kind,author_id,place_id,payload,dedupe_key) VALUES
      ('choice','correction','owner','place','{"cover_photo_id":"cover"}','choice');
  `);
});
afterEach(() => database.sqlite.close());
const cover = () => database.sqlite.prepare(`${placeSelect} WHERE p.id='place'`).get()?.photo;

test('only a current owner can nominate an approved photo from their place', async () => {
  await expect(checkCover(database.db, 'owner', 'place', 'cover')).resolves.toBeUndefined();
  await expect(checkCover(database.db, 'mod', 'place', 'cover')).rejects.toMatchObject({ status: 403 });
  for (const id of ['pending', 'other-photo', 'missing']) {
    await expect(checkCover(database.db, 'owner', 'place', id)).rejects.toMatchObject({ status: 409 });
  }
});

test('cover stays unchanged until independent approval, and hidden covers fall back', async () => {
  expect(cover()).toBe('first');
  await expect(decide(database.db, { ...moderator, id: 'owner' }, 'choice', true, '')).rejects.toMatchObject({ status: 403 });
  await decide(database.db, moderator, 'choice', true, '');
  expect(cover()).toBe('cover');
  database.sqlite.exec("UPDATE photos SET status='rejected' WHERE id='cover'");
  expect(cover()).toBe('first');
});

test('rejected choices leave the existing cover untouched', async () => {
  await decide(database.db, moderator, 'choice', false, 'Choose a clearer photo');
  expect(cover()).toBe('first');
});

test('ownership and photo approval are rechecked at moderation time', async () => {
  database.sqlite.exec("UPDATE ownerships SET active=0");
  await expect(decide(database.db, moderator, 'choice', true, '')).rejects.toMatchObject({ status: 403 });
  database.sqlite.exec("UPDATE ownerships SET active=1; UPDATE photos SET status='rejected' WHERE id='cover'");
  await expect(decide(database.db, moderator, 'choice', true, '')).rejects.toMatchObject({ status: 409 });
  expect(cover()).toBe('first');
  expect(database.sqlite.prepare("SELECT status FROM submissions WHERE id='choice'").get()?.status).toBe('pending');
});
