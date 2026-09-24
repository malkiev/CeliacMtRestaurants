import { HTTPException } from 'hono/http-exception';
import type { Member, Submission } from '../shared/types';
import { owns } from './db';
import { checkDuplicate, insertPlace, updatePlace, parsePlaceInput } from './places';
import { checkCover, coverSchema } from './covers';
import { placeSchema, reviewSchema, replySchema } from './validation';

type Contribution = Pick<Submission, 'id'|'kind'|'author_id'|'place_id'|'target_id'> & {payload:string;dedupe_key:string};

export async function submitContribution(db:D1Database, member:Member, row:Contribution, before:D1PreparedStatement[] = []) {
  const statements=[...before,db.prepare('INSERT INTO submissions(id,kind,author_id,place_id,target_id,payload,dedupe_key) VALUES(?,?,?,?,?,?,?)').bind(row.id,row.kind,row.author_id,row.place_id,row.target_id,row.payload,row.dedupe_key)];
  if(member.role==='admin' && row.kind!=='owner_claim' && row.author_id===member.id){
    await applyDecision(db,member,row,true,'Published directly by admin',statements);
    return 'approved' as const;
  }
  await db.batch(statements);
  return 'pending' as const;
}

export async function decide(db:D1Database, member:Member, id:string, approved:boolean, reason:string) {
  const row=await db.prepare('SELECT * FROM submissions WHERE id=?').bind(id).first<Omit<Submission,'payload'>&{payload:string}>();
  if(!row) throw new HTTPException(404,{message:'Submission not found'});
  if(row.status!=='pending') throw new HTTPException(409,{message:'Another moderator has already handled this submission'});
  const ownAdminChange=member.role==='admin' && row.author_id===member.id && row.kind!=='owner_claim';
  if(member.role==='member' || (!ownAdminChange && (row.author_id===member.id || (row.place_id && await owns(db,member.id,row.place_id))))) throw new HTTPException(403,{message:'An independent moderator must handle this submission'});
  if(row.kind==='owner_claim' && member.role!=='admin') throw new HTTPException(403,{message:'An admin must verify restaurant owners'});
  if(!approved && reason.trim().length<3) throw new HTTPException(400,{message:'Give a short reason so the contributor knows what to change'});
  if(approved && !row.author_id) throw new HTTPException(409,{message:'The contributor has deleted their account'});
  await applyDecision(db,member,row,approved,reason);
}

async function applyDecision(db:D1Database, member:Member, row:Pick<Contribution,'id'|'kind'|'author_id'|'place_id'|'target_id'|'payload'>, approved:boolean, reason:string, before:D1PreparedStatement[] = []) {
  const id=row.id;
  const p=JSON.parse(row.payload); const now=new Date().toISOString(); const token=crypto.randomUUID();
  const guard='EXISTS(SELECT 1 FROM submissions WHERE id=? AND decision_id=?)';
  const stmts=[db.prepare("UPDATE submissions SET status=?,decided_at=?,decided_by=?,decision_id=?,reason=? WHERE id=? AND status='pending'").bind(approved?'approved':'rejected',now,member.id,token,reason,id)];
  const author=await db.prepare('SELECT name FROM user WHERE id=?').bind(row.author_id).first<{name:string}>();
  if(approved){
    if(row.kind==='review'){
      const v=reviewSchema.parse(p);
      if(await owns(db,row.author_id,row.place_id!))throw new HTTPException(409,{message:'Owners cannot review their own business'});
      stmts.push(db.prepare(`INSERT INTO feedback(id,place_id,author_id,author_name,kind,body,rating,visit_date,created_at,updated_at) SELECT ?,?,?,?,'review',?,?,?,?,? WHERE ${guard} ON CONFLICT(place_id,author_id) DO UPDATE SET body=excluded.body,rating=excluded.rating,visit_date=excluded.visit_date,updated_at=excluded.updated_at,author_name=excluded.author_name,visible=1`).bind(row.target_id||crypto.randomUUID(),row.place_id,row.author_id,author?.name||'Community member',v.body,v.rating,v.visit_date,now,now,id,token));
    } else if(row.kind==='reply'){
      const v=replySchema.parse(p);
      if(!await owns(db,row.author_id,row.place_id!))throw new HTTPException(409,{message:'Owner access was revoked; reject this reply'});
      if(!await db.prepare('SELECT 1 FROM feedback WHERE id=? AND place_id=? AND visible=1').bind(row.target_id,row.place_id).first())throw new HTTPException(409,{message:'Original feedback is no longer public'});
      stmts.push(db.prepare(`INSERT INTO replies(id,feedback_id,place_id,author_id,author_name,body,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE ${guard} ON CONFLICT(feedback_id) DO UPDATE SET body=excluded.body,author_id=excluded.author_id,author_name=excluded.author_name,updated_at=excluded.updated_at,visible=1`).bind(crypto.randomUUID(),row.target_id,row.place_id,row.author_id,author?.name||'Restaurant representative',v.body,now,now,id,token));
    } else if(row.kind==='place'){
      const v=placeSchema.parse(p);const placeId=crypto.randomUUID();
      await checkDuplicate(db,v);
      stmts.push(insertPlace(db,placeId,v,guard,[id,token]));
    } else if(row.kind==='correction' && 'cover_photo_id' in p){
      const v=coverSchema.parse(p);
      await checkCover(db,row.author_id,row.place_id!,v.cover_photo_id);
      stmts.push(db.prepare(`INSERT INTO place_covers(place_id,photo_id) SELECT ?,? WHERE ${guard} ON CONFLICT(place_id) DO UPDATE SET photo_id=excluded.photo_id`).bind(row.place_id,v.cover_photo_id,id,token));
    } else if(row.kind==='correction'){
      const existing=await db.prepare('SELECT * FROM places WHERE id=?').bind(row.place_id).first<Record<string,unknown>>();
      if(!existing)throw new HTTPException(404,{message:'Place not found'});
      const v=parsePlaceInput(p,existing);
      await checkDuplicate(db,v,row.place_id!);
      stmts.push(updatePlace(db,row.place_id!,v,guard,[id,token]));
    } else if(row.kind==='owner_claim'){
      stmts.push(db.prepare(`INSERT INTO ownerships(user_id,place_id,verified_by,verified_at,active) SELECT ?,?,?,?,1 WHERE ${guard} ON CONFLICT(user_id,place_id) DO UPDATE SET active=1,verified_by=excluded.verified_by,verified_at=excluded.verified_at`).bind(row.author_id,row.place_id,member.id,now,id,token));
    } else if(row.kind==='report'){
      const table=p.target_type==='reply'?'replies':p.target_type==='photo'?'photos':'feedback';
      stmts.push(db.prepare(`UPDATE ${table} SET ${table==='photos'?"status='rejected'":'visible=0'} WHERE id=? AND ${guard}`).bind(row.target_id,id,token));
    }
  }
  if(row.kind==='photo')stmts.push(db.prepare(`UPDATE photos SET status=? WHERE id=? AND ${guard}`).bind(approved?'approved':'rejected',row.target_id,id,token));
  stmts.push(db.prepare(`INSERT INTO audit_log(id,actor_id,action,target_id,detail) SELECT ?,?,?,?,? WHERE ${guard}`).bind(crypto.randomUUID(),member.id,approved?'approve':'reject',id,reason,id,token));
  const results=await db.batch([...before,...stmts]);
  if(!results[before.length].meta.changes)throw new HTTPException(409,{message:'Another moderator has already handled this submission'});
}
