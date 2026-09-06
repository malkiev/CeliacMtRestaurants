import type { Bootstrap, Detail, Place } from '../shared/types';
import type { Bindings } from './env';
import { isLocal } from './env';

export const placeSelect = `SELECT p.*, (SELECT AVG(rating) FROM feedback f WHERE f.place_id=p.id AND f.visible=1 AND f.kind='review') rating, (SELECT COUNT(*) FROM feedback f WHERE f.place_id=p.id AND f.visible=1 AND f.kind='review') review_count, (SELECT id FROM photos ph WHERE ph.place_id=p.id AND ph.status='approved' ORDER BY created_at LIMIT 1) photo FROM places p`;
export function publicPlace(row: Record<string,unknown>): Place {
  const {source_cam: _cam, source_ref: _ref, published: _published, ...safe}=row;
  return {...safe, cuisines:JSON.parse(String(row.cuisines||'[]'))} as Place;
}
export async function getDetail(env:Bindings, slug:string):Promise<Detail|null> {
  const row=await env.DB.prepare(`${placeSelect} WHERE p.slug=? AND p.published=1`).bind(slug).first<Record<string,unknown>>();
  if (!row) return null;
  const place=publicPlace(row);
  const [feedback,replies,photos]=await Promise.all([
    env.DB.prepare('SELECT id,place_id,author_name,kind,body,rating,visit_date,created_at,source_ref FROM feedback WHERE place_id=? AND visible=1 ORDER BY COALESCE(created_at,\'\') DESC').bind(place.id).all(),
    env.DB.prepare('SELECT r.id,r.feedback_id,r.author_name,r.body,r.created_at,r.updated_at FROM replies r JOIN feedback f ON f.id=r.feedback_id WHERE r.place_id=? AND r.visible=1 AND f.visible=1').bind(place.id).all(),
    env.DB.prepare("SELECT id,caption,place_id FROM photos WHERE place_id=? AND status='approved' ORDER BY created_at DESC").bind(place.id).all(),
  ]);
  return {place,feedback:feedback.results,replies:replies.results,photos:photos.results} as Detail;
}
export async function bootstrap(env:Bindings,url:string):Promise<Bootstrap> {
  const path=new URL(url).pathname;
  const [places,links,adverts,detail]=await Promise.all([
    env.DB.prepare(`${placeSelect} WHERE p.published=1 ORDER BY p.name COLLATE NOCASE`).all<Record<string,unknown>>(),
    env.DB.prepare('SELECT * FROM useful_links WHERE active=1 ORDER BY sort_order,title').all(),
    env.DB.prepare("SELECT * FROM adverts WHERE active=1 AND starts_at<=? AND ends_at>? ORDER BY starts_at DESC").bind(new Date().toISOString(),new Date().toISOString()).all(),
    path.startsWith('/places/') ? getDetail(env,decodeURIComponent(path.slice(8))) : null,
  ]);
  return { places:places.results.map(publicPlace),links:links.results,adverts:adverts.results,detail,config:{ mapStyle:env.MAP_STYLE_URL||'', google:!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET),email:isLocal(env,url)||!!(env.RESEND_API_KEY&&env.EMAIL_FROM),local:isLocal(env,url) } } as Bootstrap;
}
export async function owns(db:D1Database,user:string,place:string) { return !!await db.prepare('SELECT 1 FROM ownerships WHERE user_id=? AND place_id=? AND active=1').bind(user,place).first(); }
export function audit(db:D1Database,actor:string,action:string,target:string,detail='') { return db.prepare('INSERT INTO audit_log(id,actor_id,action,target_id,detail) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,target,detail); }
