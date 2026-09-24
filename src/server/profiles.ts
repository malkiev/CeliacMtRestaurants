import { HTTPException } from 'hono/http-exception';
import type { Hono } from 'hono';
import { z } from 'zod';
import jpeg from 'jpeg-js';
import type { AppEnv, Bindings } from './env';
import {
  AVATAR_PRESETS,
  CONDITIONS,
  SYMPTOMS,
  type Identity,
  type OwnProfile,
  type PublicProfile,
} from '../shared/profiles';

// Only this projection is used for contribution identities. Never select health fields here.
export const identitySelect = `SELECT u.id, COALESCE(p.display_name,u.name) name,
  COALESCE(p.avatar_preset,'initials') avatar_preset,p.avatar_key
  FROM user u LEFT JOIN profiles p ON p.user_id=u.id`;
type IdentityRow = {
  id: string;
  name: string;
  avatar_preset: Identity['avatar']['preset'];
  avatar_key: string | null;
};
function identity(row: IdentityRow): Identity {
  return {
    id: row.id,
    name: row.name,
    avatar: {
      preset: row.avatar_preset,
      url: row.avatar_key
        ? `/avatars/${encodeURIComponent(row.id)}?v=${encodeURIComponent(row.avatar_key.split('/').pop()!)}`
        : null,
    },
  };
}
export async function getIdentity(db: D1Database, id: string): Promise<Identity | null> {
  const row = await db.prepare(`${identitySelect} WHERE u.id=?`).bind(id).first<IdentityRow>();
  return row ? identity(row) : null;
}
export async function getOwnProfile(db: D1Database, id: string): Promise<OwnProfile | null> {
  const row = await db
    .prepare(
      `SELECT u.id,COALESCE(p.display_name,u.name) name,
    COALESCE(p.avatar_preset,'initials') avatar_preset,p.avatar_key,
    COALESCE(p.conditions,'[]') conditions,p.symptoms,COALESCE(p.share_health,0) share_health
    FROM user u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=?`,
    )
    .bind(id)
    .first<
      IdentityRow & { conditions: string; symptoms: OwnProfile['symptoms']; share_health: number }
    >();
  return row
    ? {
        ...identity(row),
        conditions: JSON.parse(row.conditions),
        symptoms: row.symptoms,
        share_health: !!row.share_health,
      }
    : null;
}
export async function getPublicProfile(db: D1Database, id: string): Promise<PublicProfile | null> {
  const profile = await getOwnProfile(db, id);
  if (!profile) return null;
  // Explicit allowlist: private answers and the sharing flag never leave this function.
  return {
    id: profile.id,
    name: profile.name,
    avatar: profile.avatar,
    ...(profile.share_health ? { conditions: profile.conditions, symptoms: profile.symptoms } : {}),
  };
}

const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    conditions: z
      .array(z.enum(CONDITIONS))
      .max(CONDITIONS.length)
      .transform((values) => [...new Set(values)])
      .optional(),
    symptoms: z.enum(SYMPTOMS).nullable().optional(),
    share_health: z.boolean().optional(),
    avatar_preset: z.enum(AVATAR_PRESETS).optional(),
  })
  .strict();

async function removeUnusedAvatar(env: Bindings, key: string) {
  if (await env.DB.prepare('SELECT 1 FROM profiles WHERE avatar_key=?').bind(key).first()) return;
  try {
    await env.PHOTOS.delete(key);
    await env.DB.prepare('DELETE FROM avatar_cleanup WHERE object_key=?').bind(key).run();
  } catch {
    // Keep the durable record for the scheduled retry; saving a profile still succeeds.
  }
}
export async function cleanupAvatars(env: Bindings) {
  // A newly queued key may still be uploading. Every upload queues its key before R2.put.
  const rows = await env.DB.prepare(
    'SELECT object_key FROM avatar_cleanup WHERE queued_at<? ORDER BY queued_at LIMIT 100',
  )
    .bind(new Date(Date.now() - 86400000).toISOString())
    .all<{ object_key: string }>();
  for (const row of rows.results) await removeUnusedAvatar(env, row.object_key);
}

export function registerProfiles(api: Hono<AppEnv>) {
  api.get('/my/profile', async (c) => {
    const profile = await getOwnProfile(c.env.DB, c.get('member').id);
    if (!profile) throw new HTTPException(404);
    return c.json(profile);
  });
  api.patch('/my/profile', async (c) => {
    const v = profileSchema.parse(await c.req.json());
    const id = c.get('member').id;
    const old = await c.env.DB.prepare('SELECT avatar_key FROM profiles WHERE user_id=?')
      .bind(id)
      .first<{ avatar_key: string | null }>();
    const assignments: string[] = [];
    const values: (string | number | null)[] = [];
    if (v.name !== undefined) {
      assignments.push('display_name=?');
      values.push(v.name);
    }
    if (v.conditions !== undefined) {
      assignments.push('conditions=?');
      values.push(JSON.stringify(v.conditions));
    }
    if (v.symptoms !== undefined) {
      assignments.push('symptoms=?');
      values.push(v.symptoms);
    }
    if (v.share_health !== undefined) {
      assignments.push('share_health=?');
      values.push(+v.share_health);
    }
    if (v.avatar_preset !== undefined) {
      assignments.push('avatar_preset=?', 'avatar_key=NULL');
      values.push(v.avatar_preset);
    }
    if (!assignments.length)
      throw new HTTPException(400, { message: 'Choose a profile field to update.' });
    await c.env.DB.batch([
      c.env.DB.prepare(
        'INSERT INTO profiles(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING',
      ).bind(id),
      c.env.DB.prepare(`UPDATE profiles SET ${assignments.join(',')} WHERE user_id=?`).bind(
        ...values,
        id,
      ),
    ]);
    if (v.avatar_preset !== undefined && old?.avatar_key)
      await removeUnusedAvatar(c.env, old.avatar_key);
    return c.json(await getOwnProfile(c.env.DB, id));
  });
  api.post('/my/avatar', async (c) => {
    const form = await c.req.formData();
    const file = form.get('avatar');
    if (
      [...form.keys()].some((key) => key !== 'avatar') ||
      !(file instanceof File) ||
      file.type !== 'image/jpeg' ||
      !file.size ||
      file.size > 100000
    )
      throw new HTTPException(400, {
        message: 'Use the avatar picker to upload a JPEG of at most 100 KB.',
      });
    let decoded: ReturnType<typeof jpeg.decode>;
    try {
      decoded = jpeg.decode(new Uint8Array(await file.arrayBuffer()), {
        useTArray: true,
        maxResolutionInMP: 0.07,
        maxMemoryUsageInMB: 10,
        tolerantDecoding: false,
      });
    } catch {
      throw new HTTPException(400, { message: 'This avatar is not a supported JPEG image.' });
    }
    if (!decoded.width || decoded.width > 256 || decoded.height !== decoded.width)
      throw new HTTPException(400, {
        message: 'Choose a square avatar no larger than 256 pixels.',
      });
    const clean = jpeg.encode(
      { width: decoded.width, height: decoded.height, data: decoded.data },
      75,
    ).data;
    if (clean.byteLength > 100000)
      throw new HTTPException(400, { message: 'Choose a simpler avatar under 100 KB.' });
    const id = c.get('member').id;
    const old = await c.env.DB.prepare('SELECT avatar_key FROM profiles WHERE user_id=?')
      .bind(id)
      .first<{ avatar_key: string | null }>();
    const key = `avatars/${crypto.randomUUID()}.jpg`;
    await c.env.DB.prepare('INSERT INTO avatar_cleanup(object_key) VALUES(?)').bind(key).run();
    try {
      await c.env.PHOTOS.put(key, clean, { httpMetadata: { contentType: 'image/jpeg' } });
      await c.env.DB.batch([
        c.env.DB.prepare(
          "INSERT INTO profiles(user_id,avatar_key) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET avatar_key=excluded.avatar_key,avatar_preset='initials'",
        ).bind(id, key),
        c.env.DB.prepare('DELETE FROM avatar_cleanup WHERE object_key=?').bind(key),
      ]);
    } catch (error) {
      await removeUnusedAvatar(c.env, key);
      throw error;
    }
    if (old?.avatar_key) await removeUnusedAvatar(c.env, old.avatar_key);
    return c.json(await getOwnProfile(c.env.DB, id), 201);
  });
  api.delete('/my/avatar', async (c) => {
    const id = c.get('member').id;
    const old = await c.env.DB.prepare('SELECT avatar_key FROM profiles WHERE user_id=?')
      .bind(id)
      .first<{ avatar_key: string | null }>();
    await c.env.DB.prepare(
      "UPDATE profiles SET avatar_key=NULL,avatar_preset='initials' WHERE user_id=?",
    )
      .bind(id)
      .run();
    if (old?.avatar_key) await removeUnusedAvatar(c.env, old.avatar_key);
    return c.json(await getOwnProfile(c.env.DB, id));
  });
}
export async function avatarResponse(env: Bindings, id: string) {
  const row = await env.DB.prepare('SELECT avatar_key FROM profiles WHERE user_id=?')
    .bind(id)
    .first<{ avatar_key: string | null }>();
  if (!row?.avatar_key)
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const object = await env.PHOTOS.get(row.avatar_key);
  if (!object)
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new Response(object.body, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
