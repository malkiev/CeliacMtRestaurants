import type { Bootstrap, Detail, Place } from '../shared/types';
import type { Bindings } from './env';
import { isLocal } from './env';
import { normaliseLocality } from '../shared/place-options';
import { getIdentity, getPublicProfile } from './profiles';
import { listGlutenFreeItems } from './gluten-free-items';
import { listBusinessTypes } from './business-types';

export const placeSelect = `SELECT p.*, (SELECT AVG(rating) FROM feedback f WHERE f.place_id=p.id AND f.visible=1 AND f.kind='review') rating, (SELECT COUNT(*) FROM feedback f WHERE f.place_id=p.id AND f.visible=1 AND f.kind='review') review_count, COALESCE((SELECT ph.id FROM place_covers pc JOIN photos ph ON ph.id=pc.photo_id WHERE pc.place_id=p.id AND ph.place_id=p.id AND ph.status='approved'), (SELECT id FROM photos ph WHERE ph.place_id=p.id AND ph.status='approved' ORDER BY created_at,id LIMIT 1)) photo FROM places p`;
export function storedPlace(row: Record<string, unknown>): Place {
  return {
    ...row,
    locality: normaliseLocality(String(row.locality || ''), row.island as 'Malta' | 'Gozo'),
    gluten_free_items: JSON.parse(String(row.gluten_free_items || '[]')),
    cuisines: JSON.parse(String(row.cuisines || '[]')),
    menu_options: JSON.parse(String(row.menu_options || '["unknown"]')),
    business_types: JSON.parse(String(row.business_types || '[]')),
    services: JSON.parse(String(row.services || '[]')),
  } as Place;
}
export function publicPlace(row: Record<string, unknown>): Place {
  const {
    source_cam: _cam,
    source_ref: _ref,
    source_type: _type,
    catalogue_enabled: _catalogue,
    published: _published,
    ...safe
  } = storedPlace(row) as Place & { published?: unknown };
  const place = { ...safe, type: safe.business_types?.[0] || '' };
  if (place.premises === 'none') {
    delete (place as Partial<Place>).address;
    delete (place as Partial<Place>).latitude;
    delete (place as Partial<Place>).longitude;
    place.coordinates_checked = 0;
  }
  if (place.price_applicability === 'not_applicable') {
    place.price_min = null;
    place.price_max = null;
    place.price_basis = '';
    place.price_updated = null;
  }
  return place;
}
export async function getDetail(env: Bindings, slug: string): Promise<Detail | null> {
  const row = await env.DB.prepare(`${placeSelect} WHERE p.slug=? AND p.published=1`)
    .bind(slug)
    .first<Record<string, unknown>>();
  if (!row) return null;
  const place = publicPlace(row);
  const [feedback, replies, photos] = await Promise.all([
    env.DB.prepare(
      "SELECT id,place_id,author_id,author_name,kind,body,rating,visit_date,created_at,source_ref FROM feedback WHERE place_id=? AND visible=1 ORDER BY COALESCE(created_at,'') DESC",
    )
      .bind(place.id)
      .all(),
    env.DB.prepare(
      'SELECT r.id,r.feedback_id,r.author_id,r.author_name,r.body,r.created_at,r.updated_at FROM replies r JOIN feedback f ON f.id=r.feedback_id WHERE r.place_id=? AND r.visible=1 AND f.visible=1',
    )
      .bind(place.id)
      .all(),
    env.DB.prepare(
      "SELECT id,caption,place_id FROM photos WHERE place_id=? AND status='approved' ORDER BY created_at DESC",
    )
      .bind(place.id)
      .all(),
  ]);
  const branches = place.brand_name
    ? (
        await env.DB.prepare(
          `${placeSelect} WHERE p.published=1 AND p.id!=? AND lower(trim(p.brand_name))=lower(?) ORDER BY p.locality,p.branch_name`,
        )
          .bind(place.id, place.brand_name)
          .all<Record<string, unknown>>()
      ).results.map(publicPlace)
    : [];
  const identities = new Map<string, Awaited<ReturnType<typeof getIdentity>>>();
  const authors = [...feedback.results.filter((r) => r.kind !== 'imported'), ...replies.results];
  await Promise.all(
    [
      ...new Set(
        authors.map((r) => r.author_id).filter((id): id is string => typeof id === 'string'),
      ),
    ].map(async (id) => {
      identities.set(id, await getIdentity(env.DB, id));
    }),
  );
  function withIdentity(row: Record<string, unknown>) {
    const { author_id, ...safe } = row;
    const author = row.kind === 'imported' ? null : identities.get(String(author_id)) || null;
    return { ...safe, author, author_name: author?.name || row.author_name };
  }
  return {
    place,
    feedback: feedback.results.map(withIdentity),
    replies: replies.results.map(withIdentity),
    photos: photos.results,
    branches,
  } as Detail;
}
export async function bootstrap(env: Bindings, url: string): Promise<Bootstrap> {
  const path = new URL(url).pathname;
  const [places, links, adverts, detail] = await Promise.all([
    env.DB.prepare(`${placeSelect} WHERE p.published=1 ORDER BY p.name COLLATE NOCASE`).all<
      Record<string, unknown>
    >(),
    env.DB.prepare('SELECT * FROM useful_links WHERE active=1 ORDER BY sort_order,title').all(),
    env.DB.prepare(
      'SELECT * FROM adverts WHERE active=1 AND starts_at<=? AND ends_at>? ORDER BY starts_at DESC',
    )
      .bind(new Date().toISOString(), new Date().toISOString())
      .all(),
    path.startsWith('/places/') ? getDetail(env, decodeURIComponent(path.slice(8))) : null,
  ]);
  return {
    profile: path.startsWith('/users/')
      ? await getPublicProfile(env.DB, decodeURIComponent(path.slice(7)))
      : null,
    business_types: await listBusinessTypes(env.DB),
    gluten_free_item_catalog: await listGlutenFreeItems(env.DB),
    places: places.results.map(publicPlace),
    links: links.results,
    adverts: adverts.results,
    detail,
    config: {
      mapStyle: env.MAP_STYLE_URL || '',
      google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      email: isLocal(env, url) || !!(env.RESEND_API_KEY && env.EMAIL_FROM),
      local: isLocal(env, url),
    },
  } as Bootstrap;
}
export async function owns(db: D1Database, user: string, place: string) {
  return !!(await db
    .prepare('SELECT 1 FROM ownerships WHERE user_id=? AND place_id=? AND active=1')
    .bind(user, place)
    .first());
}
export function audit(db: D1Database, actor: string, action: string, target: string, detail = '') {
  return db
    .prepare('INSERT INTO audit_log(id,actor_id,action,target_id,detail) VALUES(?,?,?,?,?)')
    .bind(crypto.randomUUID(), actor, action, target, detail);
}
