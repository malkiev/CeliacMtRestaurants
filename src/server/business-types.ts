import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Hono } from 'hono';
import type { AppEnv } from './env';
import { audit } from './db';

export const fallbackBusinessTypes = [
  { key: 'Restaurant', label: 'Restaurant', category: 'restaurant' as const, sort_order: 10, active: 1 },
  { key: 'Cafe', label: 'Cafe', category: 'restaurant' as const, sort_order: 20, active: 1 },
  { key: 'Bakery', label: 'Bakery', category: 'restaurant' as const, sort_order: 30, active: 1 },
  { key: 'Bar', label: 'Bar', category: 'restaurant' as const, sort_order: 35, active: 1 },
  { key: 'Wine bar', label: 'Wine bar', category: 'restaurant' as const, sort_order: 40, active: 1 },
  { key: 'Butcher', label: 'Butcher', category: 'shop' as const, sort_order: 50, active: 1 },
  { key: 'Food shop', label: 'Food shop', category: 'shop' as const, sort_order: 60, active: 1 },
  { key: 'Food producer', label: 'Food producer', category: 'shop' as const, sort_order: 70, active: 1 },
  { key: 'Importer/distributor', label: 'Importer/distributor', category: 'shop' as const, sort_order: 80, active: 1 },
];
export type BusinessType = (typeof fallbackBusinessTypes)[number];
const typeSchema = z.object({ key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/), label: z.string().trim().min(2).max(80), category: z.enum(['restaurant','shop']), sort_order: z.number().int().min(0).max(10000), active: z.boolean() }).strict();

export async function listBusinessTypes(db: D1Database, activeOnly = false): Promise<BusinessType[]> {
  try {
    const rows = await db.prepare(`SELECT key,label,category,sort_order,active FROM business_types ${activeOnly ? 'WHERE active=1' : ''} ORDER BY sort_order,label`).all<BusinessType>();
    return rows.results;
  } catch {
    return fallbackBusinessTypes.filter(type => !activeOnly || type.active);
  }
}
export async function assertBusinessTypes(db: D1Database, values: string[], allowInactive = false) {
  const types = await listBusinessTypes(db);
  const known = new Map(types.map(type => [type.key, type]));
  const invalid = values.find(value => !known.has(value) || (!allowInactive && !known.get(value)!.active));
  if (invalid) throw new HTTPException(400, { message: `Unknown or inactive business type: ${invalid}` });
}
export function registerBusinessTypeAdmin(api: Hono<AppEnv>) {
  api.get('/admin/business-types', async c => c.json(await listBusinessTypes(c.env.DB)));
  api.post('/admin/business-types', async c => {
    const value = typeSchema.parse(await c.req.json());
    if (await c.env.DB.prepare('SELECT key FROM business_types WHERE key=?').bind(value.key).first()) throw new HTTPException(409, { message: 'That business type key already exists.' });
    await c.env.DB.batch([c.env.DB.prepare('INSERT INTO business_types(key,label,category,sort_order,active) VALUES(?,?,?,?,?)').bind(value.key,value.label,value.category,value.sort_order,+value.active), audit(c.env.DB,c.get('member').id,'create_business_type',value.key,JSON.stringify(value))]);
    return c.json(value, 201);
  });
  api.patch('/admin/business-types/:key', async c => {
    const key = c.req.param('key'); const value = typeSchema.omit({key:true}).parse(await c.req.json());
    if (!await c.env.DB.prepare('SELECT key FROM business_types WHERE key=?').bind(key).first()) throw new HTTPException(404, { message: 'Business type not found.' });
    await c.env.DB.batch([c.env.DB.prepare('UPDATE business_types SET label=?,category=?,sort_order=?,active=?,updated_at=? WHERE key=?').bind(value.label,value.category,value.sort_order,+value.active,new Date().toISOString(),key), audit(c.env.DB,c.get('member').id,'edit_business_type',key,JSON.stringify(value))]);
    return c.json({key,...value});
  });
}
