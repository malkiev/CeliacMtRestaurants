import { HTTPException } from 'hono/http-exception';
import type { z } from 'zod';
import type { Member } from '../shared/types';
import { normaliseLocality } from '../shared/place-options';
import { audit, owns, storedPlace } from './db';
import { placeSchema } from './validation';
import { assertBusinessTypes } from './business-types';

type PlaceInput = z.output<typeof placeSchema>;
const fields = [
  'business_types',
  'services',
  'advance_orders',
  'premises',
  'ordering_info',
  'price_applicability',
  'name',
  'type',
  'locality',
  'island',
  'address',
  'latitude',
  'longitude',
  'cuisines',
  'price_min',
  'price_max',
  'price_basis',
  'menu_info',
  'website',
  'menu_url',
  'social_url',
  'phone',
  'business_status',
  'description',
  'brand_name',
  'branch_name',
  'menu_options',
] as const;
const values = (v: PlaceInput) =>
  fields.map((key) => (Array.isArray(v[key]) ? JSON.stringify(v[key]) : v[key]));

export function updatePlace(
  db: D1Database,
  id: string,
  v: PlaceInput,
  guard = '1',
  guardArgs: string[] = [],
) {
  return db
    .prepare(
      `UPDATE places SET coordinates_checked=CASE WHEN ?='none' THEN 0 WHEN latitude IS ? AND longitude IS ? THEN coordinates_checked ELSE 0 END,
    price_updated=CASE WHEN price_min IS ? AND price_max IS ? AND price_basis=? THEN price_updated ELSE ? END,
    ${fields.map((key) => `${key}=?`).join(',')},updated_at=? WHERE id=? AND ${guard}`,
    )
    .bind(
      v.premises,
      v.latitude,
      v.longitude,
      v.price_min,
      v.price_max,
      v.price_basis,
      v.price_min === null ? null : new Date().toISOString(),
      ...values(v),
      new Date().toISOString(),
      id,
      ...guardArgs,
    );
}

export function insertPlace(
  db: D1Database,
  id: string,
  v: PlaceInput,
  guard = '1',
  guardArgs: string[] = [],
) {
  const slug =
    (v.name + ' ' + (v.branch_name || v.locality))
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ħ/gi, 'h')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') +
    '-' +
    id.slice(0, 8);
  return db
    .prepare(
      `INSERT INTO places(id,slug,${fields.join(',')},cam_verified,price_updated) SELECT ${Array(
        fields.length + 2,
      )
        .fill('?')
        .join(',')},0,? WHERE ${guard}`,
    )
    .bind(
      id,
      slug,
      ...values(v),
      v.price_min === null ? null : new Date().toISOString(),
      ...guardArgs,
    );
}

export async function checkDuplicate(db: D1Database, v: PlaceInput, exceptId = '') {
  const candidates = await db
    .prepare(
      'SELECT id,locality,island,address,branch_name FROM places WHERE lower(trim(name))=lower(?) AND island=? AND id!=?',
    )
    .bind(v.name, v.island, exceptId)
    .all<{ locality: string; island: 'Malta' | 'Gozo'; address: string; branch_name: string }>();
  if (
    candidates.results.some(
      (p) =>
        normaliseLocality(p.locality, p.island) === v.locality &&
        p.branch_name.trim().toLowerCase() === v.branch_name.toLowerCase() &&
        p.address.trim().toLowerCase() === v.address.toLowerCase(),
    )
  ) {
    throw new HTTPException(409, {
      message:
        'This branch already exists. Edit its listing, or provide a distinct branch name and address.',
    });
  }
}

export async function saveAdminPlace(db: D1Database, member: Member, input: unknown, id?: string) {
  if (member.role !== 'admin') throw new HTTPException(403, { message: 'Admin access required' });
  const existing = id
    ? await db.prepare('SELECT * FROM places WHERE id=?').bind(id).first<Record<string, unknown>>()
    : null;
  const v = parsePlaceInput(input, existing || undefined);
  await assertBusinessTypes(db, v.business_types, !!id);
  if (!id && !v.business_types.length)
    throw new HTTPException(400, { message: 'Choose at least one business type' });
  if (id) {
    if (!(await db.prepare('SELECT id FROM places WHERE id=?').bind(id).first()))
      throw new HTTPException(404, { message: 'Place not found' });
    if (await owns(db, member.id, id))
      throw new HTTPException(403, {
        message: 'Submit changes to your own business for an independent moderator to approve',
      });
  }
  await checkDuplicate(db, v, id);
  const placeId = id || crypto.randomUUID();
  await db.batch([
    id ? updatePlace(db, id, v) : insertPlace(db, placeId, v),
    audit(db, member.id, id ? 'edit_place' : 'create_place', placeId, JSON.stringify(v)),
  ]);
  return placeId;
}

export function parsePlaceInput(input: unknown, existing?: Record<string, unknown>) {
  const current = existing ? storedPlace(existing) : {};
  const { catalogue_enabled: _catalogue, ...base } = current as Partial<PlaceInput> & {
    catalogue_enabled?: unknown;
  };
  return placeSchema.parse(input && typeof input === 'object' ? { ...base, ...input } : input);
}

export async function setCatalogueEligibility(
  db: D1Database,
  member: Member,
  id: string,
  enabled: boolean,
) {
  if (member.role !== 'admin') throw new HTTPException(403, { message: 'Admin access required' });
  const row = await db
    .prepare('SELECT catalogue_enabled FROM places WHERE id=?')
    .bind(id)
    .first<{ catalogue_enabled: number }>();
  if (!row) throw new HTTPException(404, { message: 'Business not found' });
  // Capture the old value inside the same transaction as the update.
  await db.batch([
    db
      .prepare(
        "INSERT INTO audit_log(id,actor_id,action,target_id,detail) SELECT ?,?,'catalogue_eligibility',id,json_object('old',catalogue_enabled,'new',?) FROM places WHERE id=?",
      )
      .bind(crypto.randomUUID(), member.id, +enabled, id),
    db
      .prepare('UPDATE places SET catalogue_enabled=?,updated_at=? WHERE id=?')
      .bind(+enabled, new Date().toISOString(), id),
  ]);
}
