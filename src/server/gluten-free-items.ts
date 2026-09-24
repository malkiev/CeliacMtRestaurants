import { HTTPException } from 'hono/http-exception';
import type { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from './env';
import type { GlutenFreeItem } from '../shared/types';
import { audit } from './db';

const itemSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
  label: z.string().trim().min(2).max(80),
  sort_order: z.number().int().min(0).max(10000),
  active: z.boolean(),
}).strict();

export async function listGlutenFreeItems(db: D1Database): Promise<GlutenFreeItem[]> {
  return (await db.prepare('SELECT key,label,sort_order,active FROM gluten_free_items ORDER BY sort_order,label').all<GlutenFreeItem>()).results;
}

export async function assertGlutenFreeItems(db: D1Database, values: string[], existing?: Record<string, unknown>) {
  const retained = new Set<string>(JSON.parse(String(existing?.gluten_free_items || '[]')));
  const catalog = new Map((await listGlutenFreeItems(db)).map(item => [item.key, item]));
  const invalid = values.find(key => !catalog.has(key) || (!catalog.get(key)!.active && !retained.has(key)));
  if (invalid) throw new HTTPException(400, { message: `Unknown or inactive gluten-free item: ${invalid}` });
}

export function registerGlutenFreeItemAdmin(api: Hono<AppEnv>) {
  api.get('/admin/gluten-free-items', async c => c.json(await listGlutenFreeItems(c.env.DB)));
  api.post('/admin/gluten-free-items', async c => {
    const value = itemSchema.parse(await c.req.json());
    const db = c.env.DB;
    if (await db.prepare('SELECT key FROM gluten_free_items WHERE key=?').bind(value.key).first())
      throw new HTTPException(409, { message: 'That item key already exists.' });
    await db.batch([
      db.prepare('INSERT INTO gluten_free_items(key,label,sort_order,active) VALUES(?,?,?,?)').bind(value.key,value.label,value.sort_order,+value.active),
      audit(db,c.get('member').id,'create_gluten_free_item',value.key,JSON.stringify(value)),
    ]);
    return c.json(value,201);
  });
  api.patch('/admin/gluten-free-items/:key', async c => {
    const key = c.req.param('key');
    const value = itemSchema.omit({ key: true }).parse(await c.req.json());
    const db = c.env.DB;
    if (!await db.prepare('SELECT key FROM gluten_free_items WHERE key=?').bind(key).first())
      throw new HTTPException(404, { message: 'Item not found.' });
    await db.batch([
      db.prepare('UPDATE gluten_free_items SET label=?,sort_order=?,active=? WHERE key=?').bind(value.label,value.sort_order,+value.active,key),
      audit(db,c.get('member').id,'edit_gluten_free_item',key,JSON.stringify(value)),
    ]);
    return c.json({ key,...value });
  });
}
