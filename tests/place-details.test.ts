import { beforeEach, afterEach, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { testDatabase } from './sqlite';
import { saveAdminPlace, setPlaceArchived } from '../src/server/places';
import { placeSchema } from '../src/server/validation';
import { decide } from '../src/server/moderation';
import { bootstrap, getDetail, publicPlace } from '../src/server/db';
import type { Bindings } from '../src/server/env';
import type { Member } from '../src/shared/types';

let database: ReturnType<typeof testDatabase>;
const admin: Member = {
  id: 'admin',
  name: 'Admin',
  email: 'admin@example.test',
  role: 'admin',
  ownerships: [],
};
const input = (patch: Record<string, unknown> = {}) => ({
  name: 'Example restaurant',
  type: 'Restaurant',
  locality: 'Valletta',
  island: 'Malta',
  address: '1 Example Street',
  latitude: 35.89,
  longitude: 14.5,
  cuisines: [],
  price_min: null,
  price_max: null,
  price_basis: 'Main meal per person',
  menu_info: 'Ask staff for details',
  menu_options: ['clearly_marked'],
  website: '',
  menu_url: '',
  social_url: '',
  phone: '',
  business_status: 'open',
  description: 'An independently described place.',
  brand_name: 'Example business',
  branch_name: 'Waterfront',
  ...patch,
});
beforeEach(() => {
  database = testDatabase();
  for (const id of ['admin', 'owner', 'member'])
    database.sqlite
      .prepare('INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES(?,?,?,0,0)')
      .run(id, id, id + '@example.test');
});
afterEach(() => database.sqlite.close());

test('archiving hides a place and its branch link, preserves feedback, and is reversible', async () => {
  const id = await saveAdminPlace(database.db, admin, input());
  const branch = await saveAdminPlace(database.db, admin, input({ branch_name: 'Other branch' }));
  const slug = String(database.sqlite.prepare('SELECT slug FROM places WHERE id=?').get(id)?.slug);
  const branchSlug = String(database.sqlite.prepare('SELECT slug FROM places WHERE id=?').get(branch)?.slug);
  database.sqlite.prepare("INSERT INTO feedback(id,place_id,kind,body) VALUES('kept',?,'imported','Original feedback')").run(id);
  const env = { DB: database.db } as Bindings;
  await setPlaceArchived(database.db, admin, id, true);
  await setPlaceArchived(database.db, admin, id, true);
  expect(await getDetail(env, slug)).toBeNull();
  expect((await bootstrap(env, 'https://example.test/')).places.map(p => p.id)).toEqual([branch]);
  expect((await getDetail(env, branchSlug))?.branches).toEqual([]);
  await saveAdminPlace(database.db, admin, { description: 'Edited while archived', published: 1 }, id);
  expect(await getDetail(env, slug)).toBeNull();
  await expect(saveAdminPlace(database.db, admin, input())).rejects.toMatchObject({ status: 409 });
  await setPlaceArchived(database.db, admin, id, false);
  expect((await getDetail(env, slug))?.feedback).toHaveLength(1);
  expect((await getDetail(env, branchSlug))?.branches?.map(p => p.id)).toEqual([id]);
  expect(database.sqlite.prepare("SELECT action FROM audit_log WHERE action IN ('archive_place','restore_place') ORDER BY rowid").all()).toEqual([{ action: 'archive_place' }, { action: 'restore_place' }]);
});

test('only independent admins can archive or restore, including unclassified listings', async () => {
  const id = await saveAdminPlace(database.db, admin, input());
  await saveAdminPlace(database.db, admin, { name: 'test', business_types: [] }, id);
  for (const archived of [true, false]) {
    for (const role of ['member', 'moderator'] as const)
      await expect(setPlaceArchived(database.db, { ...admin, role }, id, archived)).rejects.toMatchObject({ status: 403 });
    await setPlaceArchived(database.db, admin, id, archived);
  }
  await expect(setPlaceArchived(database.db, admin, 'missing', true)).rejects.toMatchObject({ status: 404 });
  database.sqlite.prepare('INSERT INTO ownerships VALUES(?,?,?,?,1)').run('admin', id, 'other-admin', '2026-01-01');
  for (const archived of [true, false])
    await expect(setPlaceArchived(database.db, admin, id, archived)).rejects.toMatchObject({ status: 403 });
});

test('full admin edit preserves CAM and unchanged checked coordinates', async () => {
  const id = await saveAdminPlace(database.db, admin, input());
  database.sqlite
    .prepare('UPDATE places SET cam_verified=1,cam_verified_at=?,coordinates_checked=1 WHERE id=?')
    .run('2026-01-01', id);
  await saveAdminPlace(
    database.db,
    admin,
    input({
      description: 'Updated description',
      menu_options: ['dedicated_menu', 'on_request'],
      cam_verified: 0,
    }),
    id,
  );
  expect(database.sqlite.prepare('SELECT * FROM places WHERE id=?').get(id)).toMatchObject({
    description: 'Updated description',
    menu_options: '["dedicated_menu","on_request"]',
    cam_verified: 1,
    coordinates_checked: 1,
  });
  await saveAdminPlace(database.db, admin, input({ latitude: 35.9 }), id);
  expect(
    database.sqlite.prepare('SELECT coordinates_checked FROM places WHERE id=?').get(id),
  ).toMatchObject({ coordinates_checked: 0 });
});

test('direct edits reject members and admins representing the place', async () => {
  const id = await saveAdminPlace(database.db, admin, input());
  await expect(
    saveAdminPlace(database.db, { ...admin, role: 'member' }, input(), id),
  ).rejects.toMatchObject({ status: 403 });
  database.sqlite
    .prepare('INSERT INTO ownerships VALUES(?,?,?,?,1)')
    .run('admin', id, 'other-admin', '2026-01-01');
  await expect(saveAdminPlace(database.db, admin, input(), id)).rejects.toMatchObject({
    status: 403,
  });
});

test('owner descriptions await independent approval and retain checked pins', async () => {
  const id = await saveAdminPlace(database.db, admin, input());
  database.sqlite
    .prepare('INSERT INTO ownerships VALUES(?,?,?,?,1)')
    .run('owner', id, 'admin', '2026-01-01');
  database.sqlite.prepare('UPDATE places SET coordinates_checked=1 WHERE id=?').run(id);
  database.sqlite
    .prepare(
      "INSERT INTO submissions(id,kind,author_id,place_id,payload,dedupe_key) VALUES('edit','correction','owner',?,?,'edit')",
    )
    .run(id, JSON.stringify(input({ description: 'Owner description' })));
  expect(
    database.sqlite.prepare('SELECT description FROM places WHERE id=?').get(id)?.description,
  ).not.toBe('Owner description');
  await decide(database.db, admin, 'edit', true, '');
  expect(
    database.sqlite
      .prepare('SELECT description,coordinates_checked FROM places WHERE id=?')
      .get(id),
  ).toMatchObject({ description: 'Owner description', coordinates_checked: 1 });
});

test('branches can share a name while keeping feedback and CAM separate', async () => {
  const first = await saveAdminPlace(database.db, admin, input());
  const second = await saveAdminPlace(
    database.db,
    admin,
    input({ locality: 'St. Julians', branch_name: 'Bay', address: '2 Example Street' }),
  );
  database.sqlite.prepare('UPDATE places SET cam_verified=1 WHERE id=?').run(first);
  database.sqlite
    .prepare(
      "INSERT INTO feedback(id,place_id,kind,body,rating) VALUES('review',?,'review','Visit report',4)",
    )
    .run(first);
  const slug = String(
    database.sqlite.prepare('SELECT slug FROM places WHERE id=?').get(second)?.slug,
  );
  const detail = await getDetail({ DB: database.db } as Bindings, slug);
  expect(detail?.place).toMatchObject({
    locality: 'San Ġiljan',
    cam_verified: 0,
    rating: null,
    review_count: 0,
  });
  expect(detail?.branches?.map((p) => p.id)).toEqual([first]);
  expect(detail?.feedback).toHaveLength(0);
  await expect(saveAdminPlace(database.db, admin, input())).rejects.toMatchObject({ status: 409 });
  await expect(
    saveAdminPlace(database.db, admin, input({ branch_name: 'City', address: '3 Example Street' })),
  ).resolves.toBeTypeOf('string');
});

test('locality choices validate the island and unknown menu choice is exclusive', () => {
  expect(placeSchema.parse(input({ locality: 'Gzira' })).locality).toBe('Gżira');
  expect(placeSchema.parse(input({ island: 'Gozo', locality: 'Rabat' })).locality).toBe(
    'Victoria (Rabat)',
  );
  expect(() => placeSchema.parse(input({ island: 'Gozo', locality: 'Valletta' }))).toThrow();
  expect(() => placeSchema.parse(input({ menu_options: ['unknown', 'dedicated_menu'] }))).toThrow();
  expect(() => placeSchema.parse(input({ menu_options: ['invented'] }))).toThrow();
});

test('blank branch fields allow new businesses and identify actual duplicate listings', async () => {
  const minimal = { name: 'Example cafe', island: 'Malta', business_types: ['Cafe'] };
  const first = await saveAdminPlace(database.db, admin, minimal);
  expect(database.sqlite.prepare('SELECT brand_name,branch_name FROM places WHERE id=?').get(first))
    .toMatchObject({ brand_name: '', branch_name: '' });
  await expect(saveAdminPlace(database.db, admin, { ...minimal, name: 'Another cafe' }))
    .resolves.toBeTypeOf('string');
  await expect(saveAdminPlace(database.db, admin, { ...minimal, name: ' EXAMPLE CAFE ' }))
    .rejects.toMatchObject({
      status: 409,
      message: 'This place already exists. Edit the existing listing or suggest a correction. If you are adding another location, provide a different locality, address or location label.',
    });
  await expect(saveAdminPlace(database.db, admin, minimal, first)).resolves.toBe(first);
  for (const location of [{ locality: 'Valletta' }, { address: '2 Example Street' }]) {
    await expect(saveAdminPlace(database.db, admin, { ...minimal, ...location }))
      .resolves.toBeTypeOf('string');
  }
});

test('an imported place without a locality is classified through a correction, not a new listing', async () => {
  database.sqlite.exec(readFileSync('data/seed.sql', 'utf8'));
  const existing = database.sqlite.prepare('SELECT * FROM places WHERE name=?').get('Coeliac’s Zone')!;
  expect(existing).toMatchObject({ locality: '', branch_name: '', address: '' });
  const payload = {
    name: 'Coeliac’s Zone', island: 'Malta',
    business_types: ['Food shop', 'Food producer'],
  };
  await expect(saveAdminPlace(database.db, admin, payload)).rejects.toMatchObject({ status: 409 });
  database.sqlite.prepare(
    "INSERT INTO submissions(id,kind,author_id,place_id,payload,dedupe_key) VALUES('classify','correction','member',?,?,'classify')",
  ).run(existing.id, JSON.stringify(payload));
  await decide(database.db, admin, 'classify', true, '');
  expect(database.sqlite.prepare('SELECT business_types,source_ref FROM places WHERE id=?').get(existing.id))
    .toMatchObject({ business_types: JSON.stringify(payload.business_types), source_ref: existing.source_ref });
  expect(database.sqlite.prepare('SELECT id FROM places WHERE name=?').all(payload.name)).toHaveLength(1);
});

test('repair restores only coordinates matching the latest recorded pin check', async () => {
  const id = await saveAdminPlace(database.db, admin, input());
  database.sqlite
    .prepare(
      "INSERT INTO audit_log(id,action,target_id,detail,created_at) VALUES('check','check_coordinates',?,?,'2026-01-01')",
    )
    .run(id, JSON.stringify({ latitude: 35.89, longitude: 14.5 }));
  const repair = readFileSync('migrations/0004_place_details.sql', 'utf8').split(
    'UPDATE places',
  )[1];
  database.sqlite.exec('UPDATE places' + repair);
  expect(
    database.sqlite.prepare('SELECT coordinates_checked FROM places WHERE id=?').get(id)
      ?.coordinates_checked,
  ).toBe(1);
  database.sqlite
    .prepare('UPDATE places SET latitude=35.9,coordinates_checked=0 WHERE id=?')
    .run(id);
  database.sqlite.exec('UPDATE places' + repair);
  expect(
    database.sqlite.prepare('SELECT coordinates_checked FROM places WHERE id=?').get(id)
      ?.coordinates_checked,
  ).toBe(0);
});

test('import provenance remains stored while canonical localities are returned', async () => {
  const id = await saveAdminPlace(database.db, admin, input());
  database.sqlite
    .prepare(
      "UPDATE places SET locality='St. Julians',source_ref='https://example.test/source' WHERE id=?",
    )
    .run(id);
  const row = database.sqlite.prepare('SELECT * FROM places WHERE id=?').get(id)!;
  expect(publicPlace(row).locality).toBe('San Ġiljan');
  expect(row.source_ref).toBe('https://example.test/source');
});

test('menu migration maps exact statements without replacing notes or chosen tags', async () => {
  const id = await saveAdminPlace(
    database.db,
    admin,
    input({ menu_info: 'Dedicated Gluten Free Menu', menu_options: ['unknown'] }),
  );
  database.sqlite.exec(readFileSync('migrations/0005_menu_tags.sql', 'utf8'));
  expect(
    database.sqlite.prepare('SELECT menu_options,menu_info FROM places WHERE id=?').get(id),
  ).toMatchObject({ menu_options: '["dedicated_menu"]', menu_info: 'Dedicated Gluten Free Menu' });
  database.sqlite.prepare('UPDATE places SET menu_options=? WHERE id=?').run('["on_request"]', id);
  database.sqlite.exec(readFileSync('migrations/0005_menu_tags.sql', 'utf8'));
  expect(
    database.sqlite.prepare('SELECT menu_options FROM places WHERE id=?').get(id)?.menu_options,
  ).toBe('["on_request"]');
});
