import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';
import { testDatabase } from './sqlite';
import { saveAdminPlace, setCatalogueEligibility, parsePlaceInput } from '../src/server/places';
import { placeSchema } from '../src/server/validation';
import { publicPlace, bootstrap } from '../src/server/db';
import { decide } from '../src/server/moderation';
import { filterPlaces, priceLabel } from '../src/shared/domain';
import type { Member } from '../src/shared/types';
import type { Bindings } from '../src/server/env';

const session = vi.hoisted(() => ({ id: 'admin' }));
vi.mock('../src/server/auth', () => ({
  createAuth: () => ({
    api: {
      getSession: async () => ({
        user: { id: session.id, name: session.id, email: session.id + '@example.test' },
      }),
    },
  }),
}));
import { api } from '../src/server/api';

let database: ReturnType<typeof testDatabase>;
const admin: Member = {
  id: 'admin',
  name: 'Admin',
  email: 'admin@example.test',
  role: 'admin',
  ownerships: [],
};
const input = { name: 'Example producer', business_types: ['Food producer'], island: 'Malta' };
const filters = {
  q: '',
  island: '',
  locality: '',
  cuisine: '',
  type: '',
  price: '',
  verified: false,
  service: '',
};
beforeEach(() => {
  database = testDatabase();
  session.id = 'admin';
  for (const [id, role] of [
    ['admin', 'admin'],
    ['owner', 'member'],
    ['mod', 'moderator'],
  ]) {
    database.sqlite
      .prepare('INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES(?,?,?,0,0)')
      .run(id, id, id + '@example.test');
    database.sqlite.prepare('INSERT INTO profiles(user_id,role) VALUES(?,?)').run(id, role);
  }
});
afterEach(() => database.sqlite.close());
const row = (id: string) => database.sqlite.prepare('SELECT * FROM places WHERE id=?').get(id)!;
function post(path: string, body: unknown) {
  const app = new Hono().route('/api', api);
  app.onError((error, c) =>
    c.json({ error: error.message }, 'status' in error ? (Number(error.status) as 400) : 400),
  );
  return app.request(
    'http://localhost/api' + path,
    {
      method: 'POST',
      headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { DB: database.db, APP_URL: 'http://localhost' },
  );
}

test('minimal listing, multiple categories, service filters and non-meal pricing', async () => {
  const id = await saveAdminPlace(database.db, admin, {
    ...input,
    business_types: ['Food shop', 'Importer/distributor'],
    services: ['Delivery'],
    price_applicability: 'not_applicable',
    price_min: 20,
  });
  const place = publicPlace(row(id));
  expect(place).toMatchObject({
    services: ['Delivery'],
    premises: 'unknown',
    advance_orders: 'unknown',
    price_min: null,
  });
  expect(
    filterPlaces([place], { ...filters, type: 'Food shop', service: 'Delivery' }),
  ).toHaveLength(1);
  expect(filterPlaces([place], { ...filters, type: 'Importer/distributor' })).toHaveLength(1);
  expect(filterPlaces([place], { ...filters, service: 'Dine-in' })).toHaveLength(0);
  expect(filterPlaces([place], { ...filters, price: '2' })).toHaveLength(0);
  expect(priceLabel(place)).toBe('Meal pricing not applicable');
  await expect(
    saveAdminPlace(database.db, admin, { ...input, business_types: [] }),
  ).rejects.toMatchObject({ status: 400 });
  expect(() => placeSchema.parse({ ...input, price_min: 10 })).toThrow(
    'Describe what the price estimate covers',
  );
});

test('bootstrap retains inactive type categories for existing directory listings', async () => {
  database.sqlite.prepare("UPDATE business_types SET active=0 WHERE key='Food producer'").run();
  const result = await bootstrap({
    DB: database.db,
    APP_URL: 'http://localhost',
    ENVIRONMENT: 'development',
  } as Bindings, 'http://localhost/shops');
  expect(result.business_types).toContainEqual(expect.objectContaining({
    key: 'Food producer', category: 'shop', active: 0,
  }));
});

test('no public premises omit private location from detail and directory bootstrap', async () => {
  const id = await saveAdminPlace(database.db, admin, {
    ...input,
    premises: 'none',
    address: 'Private address',
    latitude: 35.89,
    longitude: 14.5,
    brand_name: 'Example',
  });
  database.sqlite
    .prepare('UPDATE places SET coordinates_checked=1,catalogue_enabled=1 WHERE id=?')
    .run(id);
  const env = {
    DB: database.db,
    APP_URL: 'http://localhost',
    ENVIRONMENT: 'development',
  } as Bindings;
  const result = await bootstrap(env, 'http://localhost/places/' + row(id).slug);
  for (const p of [result.places[0], result.detail!.place]) {
    expect(p).not.toHaveProperty('address');
    expect(p).not.toHaveProperty('latitude');
    expect(p).not.toHaveProperty('longitude');
    expect(p).not.toHaveProperty('catalogue_enabled');
    expect(p).not.toHaveProperty('source_type');
    expect(p.coordinates_checked).toBe(0);
  }
  expect(row(id).address).toBe('Private address');
  session.id = 'mod';
  expect(
    (await post('/moderation/places/' + id + '/coordinates', { latitude: 35.9, longitude: 14.5 }))
      .status,
  ).toBe(400);
});

test('legacy corrections retain newer fields and private location; ordinary edits cannot change catalogue flag', async () => {
  const id = await saveAdminPlace(database.db, admin, {
    ...input,
    services: ['Delivery'],
    premises: 'none',
    address: 'Private address',
    ordering_info: 'Order two days ahead',
  });
  await setCatalogueEligibility(database.db, admin, id, true);
  database.sqlite
    .prepare(
      "INSERT INTO submissions(id,kind,author_id,place_id,payload,dedupe_key) VALUES('old','correction','owner',?,?,'old')",
    )
    .run(id, JSON.stringify({ name: 'Updated business', type: 'By Order/Takeaway' }));
  await decide(database.db, admin, 'old', true, '');
  expect(row(id)).toMatchObject({
    name: 'Updated business',
    business_types: '["Food producer"]',
    services: '["Delivery"]',
    premises: 'none',
    address: 'Private address',
    catalogue_enabled: 1,
    ordering_info: 'Order two days ahead',
  });
  await saveAdminPlace(database.db, admin, { description: 'Ordinary update' }, id);
  expect(row(id).catalogue_enabled).toBe(1);
  expect(() => parsePlaceInput({ catalogue_enabled: false }, row(id))).toThrow();
});

test('catalogue endpoint enforces admin role, audits both transitions and rejects submission injection', async () => {
  const id = await saveAdminPlace(database.db, admin, input);
  for (const actor of ['owner', 'mod']) {
    session.id = actor;
    expect((await post('/admin/places/' + id + '/catalogue', { enabled: true })).status).toBe(403);
    expect(
      (
        await post('/submissions', {
          kind: 'correction',
          place_id: id,
          payload: { catalogue_enabled: true },
        })
      ).status,
    ).toBe(400);
  }
  session.id = 'admin';
  for (const enabled of [true, false])
    expect((await post('/admin/places/' + id + '/catalogue', { enabled })).status).toBe(200);
  const audit = database.sqlite
    .prepare("SELECT * FROM audit_log WHERE action='catalogue_eligibility' ORDER BY rowid")
    .all();
  expect(audit.map((r) => JSON.parse(String(r.detail)))).toEqual([
    { old: 0, new: 1 },
    { old: 1, new: 0 },
  ]);
  expect(audit.every((r) => r.actor_id === 'admin' && r.target_id === id && r.created_at)).toBe(
    true,
  );
  expect(row(id).catalogue_enabled).toBe(0);
});

test('older API corrections leave absent new fields out of the pending payload', async () => {
  const id = await saveAdminPlace(database.db, admin, { ...input, services: ['Delivery'] });
  session.id = 'owner';
  const response = await post('/submissions', {
    kind: 'correction',
    place_id: id,
    payload: { name: 'Updated producer', type: 'By Order/Takeaway' },
  });
  expect(response.status).toBe(201);
  const submission = database.sqlite.prepare('SELECT * FROM submissions').get()!;
  expect(JSON.parse(String(submission.payload))).not.toHaveProperty('services');
  await saveAdminPlace(database.db, admin, { services: ['Takeaway/collection'] }, id);
  await decide(database.db, admin, String(submission.id), true, '');
  expect(row(id).services).toBe('["Takeaway/collection"]');
});

test('migration preserves ambiguous source type without guessing', () => {
  const old = new DatabaseSync(':memory:');
  try {
    for (const f of readdirSync('migrations')
      .filter((f) => f.endsWith('.sql') && f < '0006')
      .sort())
      old.exec(readFileSync('migrations/' + f, 'utf8'));
    old.exec(
      "INSERT INTO places(id,slug,name,island,type) VALUES('one','one','Producer','Malta','By Order/Takeaway'),('two','two','Shop','Malta','Shop')",
    );
    old.exec(readFileSync('migrations/0006_business_classification.sql', 'utf8'));
    expect(old.prepare("SELECT * FROM places WHERE id='one'").get()).toMatchObject({
      business_types: '[]',
      source_type: 'By Order/Takeaway',
      services: '[]',
      premises: 'unknown',
      catalogue_enabled: 0,
    });
    expect(
      old.prepare("SELECT business_types FROM places WHERE id='two'").get()?.business_types,
    ).toBe('["Food shop"]');
  } finally {
    old.close();
  }
});
