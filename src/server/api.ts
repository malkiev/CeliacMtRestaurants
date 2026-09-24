import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { AppEnv } from './env';
import type { Member, Submission } from '../shared/types';
import { isLocal } from './env';
import { createAuth } from './auth';
import { audit, bootstrap, getDetail, owns, placeSelect, storedPlace } from './db';
import { adSchema, linkSchema, replySchema, reviewSchema, text } from './validation';
import { decide, submitContribution } from './moderation';
import { saveAdminPlace, parsePlaceInput, setCatalogueEligibility } from './places';
import { checkCover, coverSchema } from './covers';
import { getIdentity, getPublicProfile, registerProfiles } from './profiles';
import { assertBusinessTypes, listBusinessTypes, registerBusinessTypeAdmin } from './business-types';

export const api=new Hono<AppEnv>();
api.use('*',async(c,next)=>{
  c.header('Cache-Control','no-store');
  if(!['GET','HEAD','OPTIONS'].includes(c.req.method)){
    const origin=c.req.header('Origin');
    if(origin!==new URL(c.env.APP_URL).origin)throw new HTTPException(403,{message:'This request must come from the website'});
  }
  await next();
});
api.get('/bootstrap',async c=>{const path=c.req.query('path')||'/';return c.json(await bootstrap(c.env,new URL(path.startsWith('/')&&!path.startsWith('//')?path:'/',c.req.url).href));});
api.get('/places/:slug',async c=>{const d=await getDetail(c.env,c.req.param('slug'));if(!d)throw new HTTPException(404,{message:'Place not found'});return c.json(d);});
api.get('/profiles/:id',async c=>{const profile=await getPublicProfile(c.env.DB,c.req.param('id'));if(!profile)throw new HTTPException(404,{message:'Profile not found'});return c.json(profile);});
api.on(['GET','POST'],'/auth/*',c=>createAuth(c.env).handler(c.req.raw));
api.get('/local-mail',async c=>{
  if(!isLocal(c.env,c.req.url))throw new HTTPException(404);
  return c.json((await c.env.DB.prepare("SELECT id,email,url,created_at FROM local_mail WHERE created_at>? ORDER BY created_at DESC LIMIT 20").bind(new Date(Date.now()-600000).toISOString()).all()).results);
});
api.use('*',async(c,next)=>{
  const session=await createAuth(c.env).api.getSession({headers:c.req.raw.headers});
  if(!session){if(c.req.path==='/api/me')return c.json(null);throw new HTTPException(401,{message:'Please sign in to continue'});}
  const profile=await c.env.DB.prepare('SELECT role FROM profiles WHERE user_id=?').bind(session.user.id).first<{role:Member['role']}>();
  const ownerships=await c.env.DB.prepare('SELECT place_id FROM ownerships WHERE user_id=? AND active=1').bind(session.user.id).all<{place_id:string}>();
  const identity=await getIdentity(c.env.DB,session.user.id);
  if(!identity)throw new HTTPException(401,{message:'Please sign in again'});
  c.set('member',{id:session.user.id,name:identity.name,email:session.user.email,role:profile?.role||'member',ownerships:ownerships.results.map(o=>o.place_id)});
  if(c.req.method!=='GET'){
    const key=`${session.user.id}:${Math.floor(Date.now()/3600000)}`;
    const limit=await c.env.DB.prepare('INSERT INTO request_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,Date.now()+3600000).first<{count:number}>();
    if((limit?.count||0)>80)throw new HTTPException(429,{message:'You have reached the hourly contribution limit. Please try again later.'});
  }
  await next();
});
api.get('/me',c=>c.json(c.get('member')));
registerProfiles(api);
api.get('/my/submissions',async c=>{
  const rows=await c.env.DB.prepare('SELECT s.*,p.name place_name FROM submissions s LEFT JOIN places p ON p.id=s.place_id WHERE author_id=? ORDER BY created_at DESC LIMIT 100').bind(c.get('member').id).all<Submission&{payload:string}>();
  return c.json(rows.results.map(r=>({...r,payload:JSON.parse(r.payload)})));
});
api.get('/my/feedback',async c=>c.json((await c.env.DB.prepare('SELECT f.*,p.name place_name,p.slug FROM feedback f JOIN places p ON p.id=f.place_id WHERE f.author_id=? ORDER BY updated_at DESC').bind(c.get('member').id).all()).results));
api.post('/submissions',async c=>{
  const member=c.get('member'); const db=c.env.DB;
  const input=z.object({kind:z.enum(['review','reply','place','correction','report','owner_claim']),place_id:z.string().optional(),target_id:z.string().optional(),payload:z.unknown()}).parse(await c.req.json());
  if(input.kind!=='place' && (!input.place_id || !await db.prepare('SELECT id FROM places WHERE id=? AND published=1').bind(input.place_id).first()))throw new HTTPException(404,{message:'Place not found'});
  let payload:unknown; let target=input.target_id||null;
  if(input.kind==='review'){
    if(await owns(db,member.id,input.place_id!))throw new HTTPException(403,{message:'Owners cannot review their own business'});
    payload=reviewSchema.parse(input.payload);
    const existing=await db.prepare('SELECT id FROM feedback WHERE place_id=? AND author_id=?').bind(input.place_id,member.id).first<{id:string}>();target=existing?.id||crypto.randomUUID();
  }else if(input.kind==='reply'){
    if(!await owns(db,member.id,input.place_id!))throw new HTTPException(403,{message:'Only a verified owner of this place can reply'});
    if(!target||!await db.prepare('SELECT id FROM feedback WHERE id=? AND place_id=? AND visible=1').bind(target,input.place_id).first())throw new HTTPException(404,{message:'Feedback not found'});
    payload=replySchema.parse(input.payload);
  }else if(input.kind==='correction' && input.payload && typeof input.payload==='object' && 'cover_photo_id' in input.payload){
    const v=coverSchema.parse(input.payload);
    await checkCover(db,member.id,input.place_id!,v.cover_photo_id);
    payload=v;
  }else if(input.kind==='place'||input.kind==='correction'){
    const existing=input.kind==='correction'?await db.prepare('SELECT * FROM places WHERE id=?').bind(input.place_id).first<Record<string,unknown>>():undefined;
    const parsed=parsePlaceInput(input.payload,existing||undefined);
    if(input.kind==='place' && !parsed.business_types.length)throw new HTTPException(400,{message:'Choose at least one business type'});
    // Keep omitted fields omitted so old clients cannot reset newer fields on approval.
    payload=input.kind==='correction'?Object.fromEntries(Object.entries(parsed).filter(([key])=>Object.hasOwn(input.payload as object,key))):parsed;
    await assertBusinessTypes(db, parsed.business_types, input.kind === 'correction');
  }
  else if(input.kind==='owner_claim')payload=z.object({body:text(1000)}).parse(input.payload);
  else{
    payload=z.object({body:text(1000),target_type:z.enum(['feedback','reply','photo'])}).parse(input.payload);
    const table=(payload as {target_type:string}).target_type==='reply'?'replies':(payload as {target_type:string}).target_type==='photo'?'photos':'feedback';
    if(!target||!await db.prepare(`SELECT id FROM ${table} WHERE id=? AND place_id=?`).bind(target,input.place_id).first())throw new HTTPException(404,{message:'Reported content not found'});
  }
  const id=crypto.randomUUID();
  const key=`${input.kind}:${input.kind==='reply'?target:member.id+':'+(input.place_id||'new')}`;
  let status:'pending'|'approved';
  try{status=await submitContribution(db,member,{id,kind:input.kind,author_id:member.id,place_id:input.place_id||null,target_id:target,payload:JSON.stringify(payload),dedupe_key:key});}
  catch(e){if(String(e).includes('UNIQUE'))throw new HTTPException(409,{message:'A submission is already awaiting approval. Withdraw it from your account before submitting a replacement.'});throw e;}
  return c.json({id,status},201);
});
api.delete('/my/submissions/:id',async c=>{
  const id=c.req.param('id');const db=c.env.DB; const m=c.get('member');
  const row=await db.prepare('SELECT * FROM submissions WHERE id=? AND author_id=? AND status=\'pending\'').bind(id,m.id).first<{target_id:string;kind:string}>();
  if(!row)throw new HTTPException(404,{message:'Pending submission not found'});
  await db.batch([db.prepare("UPDATE submissions SET status='withdrawn' WHERE id=? AND author_id=? AND status='pending'").bind(id,m.id),db.prepare("UPDATE photos SET status='rejected' WHERE id=? AND EXISTS(SELECT 1 FROM submissions WHERE id=? AND status='withdrawn')").bind(row.kind==='photo'?row.target_id:'',id)]);
  return c.json({ok:true});
});
api.delete('/my/feedback/:id',async c=>{
  const r=await c.env.DB.prepare('UPDATE feedback SET visible=0 WHERE id=? AND author_id=?').bind(c.req.param('id'),c.get('member').id).run();
  if(!r.meta.changes)throw new HTTPException(404);return c.json({ok:true});
});
api.delete('/my/account',async c=>{
  const m=c.get('member');const input=z.object({confirmation:z.literal('DELETE')}).parse(await c.req.json());void input;
  if(m.role==='admin')throw new HTTPException(409,{message:'Ask another admin to remove your admin role before deleting your account'});
  // Keep a minimal audit record, remove personal content and auth credentials. R2 deletion is retried by daily cleanup.
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE feedback SET visible=0,body='[deleted]',author_name='Deleted member' WHERE author_id=?").bind(m.id),
    c.env.DB.prepare("UPDATE replies SET visible=0,body='[deleted]',author_name='Deleted member' WHERE author_id=?").bind(m.id),
    c.env.DB.prepare("UPDATE photos SET status='rejected',caption='' WHERE author_id=?").bind(m.id),
    c.env.DB.prepare("UPDATE submissions SET status=CASE WHEN status='pending' THEN 'withdrawn' ELSE status END,payload='{}',reason='' WHERE author_id=?").bind(m.id),
    c.env.DB.prepare('DELETE FROM local_mail WHERE email=?').bind(m.email),
    c.env.DB.prepare('UPDATE audit_log SET actor_id=NULL WHERE actor_id=?').bind(m.id),
    c.env.DB.prepare('DELETE FROM user WHERE id=?').bind(m.id),
  ]);return c.json({ok:true});
});

api.use('/moderation/*',async(c,next)=>{if(c.get('member').role==='member')throw new HTTPException(403);await next();});
api.get('/moderation/queue',async c=>{
  const rows=await c.env.DB.prepare("SELECT s.*,COALESCE(up.display_name,u.name) author_name,p.name place_name FROM submissions s LEFT JOIN user u ON u.id=s.author_id LEFT JOIN profiles up ON up.user_id=u.id LEFT JOIN places p ON p.id=s.place_id WHERE s.status='pending' ORDER BY s.created_at LIMIT 100").all<Submission&{payload:string}>();
  return c.json(rows.results.filter(r=>r.kind!=='owner_claim'||c.get('member').role==='admin').map(r=>({...r,payload:JSON.parse(r.payload)})));
});
api.post('/moderation/:id/decision',async c=>{const v=z.object({approved:z.boolean(),reason:z.string().trim().max(1000).default('')}).parse(await c.req.json());await decide(c.env.DB,c.get('member'),c.req.param('id'),v.approved,v.reason);return c.json({ok:true});});
api.get('/moderation/history',async c=>c.json((await c.env.DB.prepare('SELECT a.id,a.action,a.target_id,a.detail,a.created_at,COALESCE(up.display_name,u.name) actor_name FROM audit_log a LEFT JOIN user u ON u.id=a.actor_id LEFT JOIN profiles up ON up.user_id=u.id ORDER BY a.created_at DESC LIMIT 100').all()).results));
api.post('/moderation/places/:id/coordinates',async c=>{
  const m=c.get('member');const id=c.req.param('id');if(await owns(c.env.DB,m.id,id))throw new HTTPException(403);
  if(await c.env.DB.prepare("SELECT 1 FROM places WHERE id=? AND premises='none'").bind(id).first())throw new HTTPException(400,{message:'A business without public premises cannot have a public map pin'});
  const v=z.object({latitude:z.number().min(35.7).max(36.2),longitude:z.number().min(14.1).max(14.7)}).parse(await c.req.json());
  await c.env.DB.batch([c.env.DB.prepare('UPDATE places SET latitude=?,longitude=?,coordinates_checked=1,updated_at=? WHERE id=?').bind(v.latitude,v.longitude,new Date().toISOString(),id),audit(c.env.DB,m.id,'check_coordinates',id,JSON.stringify(v))]);return c.json({ok:true});
});

api.use('/admin/*',async(c,next)=>{if(c.get('member').role!=='admin')throw new HTTPException(403,{message:'Admin access required'});await next();});
registerBusinessTypeAdmin(api);
api.get('/admin/data',async c=>{
  const [users,places,links,adverts,ownerships,businessTypes]=await Promise.all([
    c.env.DB.prepare("SELECT u.id,COALESCE(p.display_name,u.name) name,u.email,COALESCE(p.role,'member') role FROM user u LEFT JOIN profiles p ON p.user_id=u.id ORDER BY u.name LIMIT 500").all(),
    c.env.DB.prepare(`${placeSelect} ORDER BY p.name`).all(),c.env.DB.prepare('SELECT * FROM useful_links ORDER BY sort_order').all(),c.env.DB.prepare('SELECT * FROM adverts').all(),c.env.DB.prepare('SELECT * FROM ownerships').all(),listBusinessTypes(c.env.DB),
  ]);return c.json({users:users.results,places:places.results.map(p=>({...storedPlace(p),catalogue_enabled:!!p.catalogue_enabled})),links:links.results,adverts:adverts.results,ownerships:ownerships.results,business_types:businessTypes});
});
api.post('/admin/places',async c=>{const raw=await c.req.json();const id=z.string().min(1).optional().parse(raw.id);return c.json({id:await saveAdminPlace(c.env.DB,c.get('member'),raw.place,id)});});
api.post('/admin/places/:id/catalogue',async c=>{
  const v=z.object({enabled:z.boolean()}).strict().parse(await c.req.json());
  await setCatalogueEligibility(c.env.DB,c.get('member'),c.req.param('id'),v.enabled);
  return c.json({ok:true});
});
api.post('/admin/roles',async c=>{
  const m=c.get('member');const v=z.object({user_id:z.string(),role:z.enum(['member','moderator','admin'])}).parse(await c.req.json());
  if(v.user_id===m.id)throw new HTTPException(400,{message:'Another admin must change your role'});
  if(!await c.env.DB.prepare('SELECT id FROM user WHERE id=?').bind(v.user_id).first())throw new HTTPException(404);
  await c.env.DB.batch([c.env.DB.prepare('INSERT INTO profiles(user_id,role) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role').bind(v.user_id,v.role),audit(c.env.DB,m.id,'set_role',v.user_id,v.role)]);return c.json({ok:true});
});
api.post('/admin/cam',async c=>{
  const v=z.object({place_id:z.string(),verified:z.boolean(),note:text(1000)}).parse(await c.req.json());
  await c.env.DB.batch([c.env.DB.prepare('UPDATE places SET cam_verified=?,cam_verified_at=?,updated_at=? WHERE id=?').bind(+v.verified,new Date().toISOString(),new Date().toISOString(),v.place_id),audit(c.env.DB,c.get('member').id,v.verified?'cam_verified':'cam_removed',v.place_id,v.note)]);return c.json({ok:true});
});
api.post('/admin/owners',async c=>{
  const v=z.object({user_id:z.string(),place_id:z.string(),active:z.boolean(),note:text(1000)}).parse(await c.req.json());const m=c.get('member');
  if(v.user_id===m.id)throw new HTTPException(403,{message:'Another admin must verify your ownership'});
  await c.env.DB.batch([c.env.DB.prepare('INSERT INTO ownerships(user_id,place_id,verified_by,verified_at,active) VALUES(?,?,?,?,?) ON CONFLICT(user_id,place_id) DO UPDATE SET active=excluded.active,verified_by=excluded.verified_by,verified_at=excluded.verified_at').bind(v.user_id,v.place_id,m.id,new Date().toISOString(),+v.active),audit(c.env.DB,m.id,v.active?'owner_verified':'owner_revoked',v.place_id,JSON.stringify({user_id:v.user_id,note:v.note}))]);return c.json({ok:true});
});
api.post('/admin/links',async c=>{const raw=await c.req.json();const v=linkSchema.parse(raw);const id=z.string().optional().parse(raw.id)||crypto.randomUUID();await c.env.DB.batch([c.env.DB.prepare('INSERT INTO useful_links(id,title,url,description,category,sort_order,last_checked,active) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,url=excluded.url,description=excluded.description,category=excluded.category,sort_order=excluded.sort_order,last_checked=excluded.last_checked,active=excluded.active').bind(id,v.title,v.url,v.description,v.category,v.sort_order,new Date().toISOString(),+v.active),audit(c.env.DB,c.get('member').id,'save_link',id)]);return c.json({ok:true});});
api.post('/admin/adverts',async c=>{const raw=await c.req.json();const v=adSchema.parse(raw);const id=z.string().optional().parse(raw.id)||crypto.randomUUID();await c.env.DB.batch([c.env.DB.prepare('INSERT INTO adverts(id,title,body,url,image_url,placement,starts_at,ends_at,active) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,url=excluded.url,image_url=excluded.image_url,placement=excluded.placement,starts_at=excluded.starts_at,ends_at=excluded.ends_at,active=excluded.active').bind(id,v.title,v.body,v.url,v.image_url,v.placement,v.starts_at,v.ends_at,+v.active),audit(c.env.DB,c.get('member').id,'save_advert',id)]);return c.json({ok:true});});
api.get('/admin/export',async c=>{
  const rows=(await c.env.DB.prepare('SELECT * FROM places ORDER BY name').all()).results;
  const csv=(v:unknown)=>`"${String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')}"`;
  const keys=Object.keys(rows[0]||{});c.header('Content-Disposition','attachment; filename="glutenfree-mt-places.csv"');c.header('Content-Type','text/csv; charset=utf-8');return c.body('\uFEFF'+[keys.map(csv).join(','),...rows.map(r=>keys.map(k=>csv(r[k])).join(','))].join('\r\n'));
});
