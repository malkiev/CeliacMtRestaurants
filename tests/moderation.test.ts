import { afterEach, beforeEach, expect, test } from 'vitest';
import { testDatabase } from './sqlite';
import { decide } from '../src/server/moderation';
import { placeSelect } from '../src/server/db';
import type { Member } from '../src/shared/types';

let database: ReturnType<typeof testDatabase>;
const moderator: Member = {
  id: 'mod',
  role: 'moderator',
  name: 'Moderator',
  email: 'mod@example.test',
  ownerships: [],
};
beforeEach(() => {
  database = testDatabase();
  for (const id of ['mod', 'author'])
    database.sqlite
      .prepare(
        'INSERT INTO user(id,name,email,emailVerified,createdAt,updatedAt) VALUES(?,?,?,1,0,0)',
      )
      .run(id, id, `${id}@example.test`);
  database.sqlite.exec(
    "INSERT INTO places(id,slug,name,island) VALUES('place','place','Test place','Malta')",
  );
});
afterEach(() => database.sqlite.close());
function submit(id = 'submission', kind = 'review', target = 'feedback') {
  database.sqlite
    .prepare(
      'INSERT INTO submissions(id,kind,author_id,place_id,target_id,payload,dedupe_key) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      id,
      kind,
      'author',
      'place',
      target,
      JSON.stringify({ body: 'A community experience', rating: 4, visit_date: '2026-01-01' }),
      id,
    );
}
test('members and contributors cannot moderate their own submissions', async () => {
  submit();
  for (const member of [
    { ...moderator, role: 'member' as const },
    { ...moderator, id: 'author' },
  ]) {
    await expect(decide(database.db, member, 'submission', true, '')).rejects.toMatchObject({
      status: 403,
    });
  }
  expect(database.sqlite.prepare('SELECT * FROM feedback').all()).toHaveLength(0);
});
test('business representatives cannot moderate that business', async () => {
  submit();
  database.sqlite.exec("INSERT INTO ownerships VALUES('mod','place','admin','2026-01-01',1)");
  await expect(decide(database.db, moderator, 'submission', true, '')).rejects.toMatchObject({
    status: 403,
  });
});
test('approved review stays public during revision, and only approved scores count', async () => {
  submit();
  await decide(database.db, moderator, 'submission', true, '');
  submit('revision');
  database.sqlite
    .exec(`UPDATE submissions SET payload='{"body":"Updated experience","rating":2,"visit_date":"2026-02-01"}' WHERE id='revision';
    INSERT INTO feedback(id,place_id,kind,body) VALUES('imported','place','imported','Original source wording');`);
  expect(database.sqlite.prepare(placeSelect).get()).toMatchObject({ rating: 4, review_count: 1 });
  await decide(database.db, moderator, 'revision', true, '');
  expect(database.sqlite.prepare(placeSelect).get()).toMatchObject({ rating: 2, review_count: 1 });
  database.sqlite.exec("UPDATE feedback SET visible=0 WHERE kind='review'");
  expect(database.sqlite.prepare(placeSelect).get()).toMatchObject({
    rating: null,
    review_count: 0,
  });
});
test('completed decisions cannot be overwritten or audited twice', async () => {
  submit();
  await decide(database.db, moderator, 'submission', false, 'Please add context');
  await expect(decide(database.db, moderator, 'submission', true, '')).rejects.toMatchObject({
    status: 409,
  });
  expect(database.sqlite.prepare('SELECT * FROM audit_log').all()).toHaveLength(1);
});
test('owner verification requires an admin', async () => {
  submit('claim', 'owner_claim');
  await expect(decide(database.db, moderator, 'claim', true, '')).rejects.toMatchObject({
    status: 403,
  });
  await decide(database.db, { ...moderator, role: 'admin' }, 'claim', true, 'Checked');
  expect(database.sqlite.prepare('SELECT active FROM ownerships').get()).toMatchObject({
    active: 1,
  });
});
test('revoked owners cannot have a pending reply approved', async () => {
  submit('reply', 'reply');
  database.sqlite.exec("INSERT INTO ownerships VALUES('author','place','admin','2026-01-01',0)");
  await expect(decide(database.db, moderator, 'reply', true, '')).rejects.toMatchObject({
    status: 409,
  });
});
