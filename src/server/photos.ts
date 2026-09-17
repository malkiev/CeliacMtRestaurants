import jpeg from 'jpeg-js';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import type { Hono } from 'hono';
import type { AppEnv, Bindings } from './env';
import { createAuth } from './auth';

export function registerPhotos(api:Hono<AppEnv>){
  api.post('/photos',async c=>{
    const form=await c.req.formData();const file=form.get('photo');const placeId=z.string().min(1).parse(form.get('place_id'));const caption=z.string().trim().min(3).max(200).parse(form.get('caption'));const m=c.get('member');
    if(!(file instanceof File)||file.type!=='image/jpeg'||file.size>800000)throw new HTTPException(400,{message:'Use the photo form to upload a resized JPEG under 800 KB.'});
    if(!await c.env.DB.prepare('SELECT id FROM places WHERE id=? AND published=1').bind(placeId).first())throw new HTTPException(404);
    const count=await c.env.DB.prepare('SELECT COUNT(*) count FROM photos WHERE author_id=? AND created_at>?').bind(m.id,new Date(Date.now()-86400000).toISOString()).first<{count:number}>();
    if((count?.count||0)>=20)throw new HTTPException(429,{message:'You can upload up to 20 photos per day. Please try again tomorrow.'});
    const bytes=new Uint8Array(await file.arrayBuffer());let decoded:ReturnType<typeof jpeg.decode>;
    try{decoded=jpeg.decode(bytes,{useTArray:true,maxResolutionInMP:2,maxMemoryUsageInMB:40,tolerantDecoding:false});}catch{throw new HTTPException(400,{message:'This file is not a supported JPEG image.'});}
    if(decoded.width>1280||decoded.height>1280)throw new HTTPException(400,{message:'Images must be resized to at most 1280 pixels.'});
    // Decode and re-encode server-side as well: never trust client metadata stripping.
    const clean=jpeg.encode({width:decoded.width,height:decoded.height,data:decoded.data},75).data;
    const ratio=Math.min(1,400/Math.max(decoded.width,decoded.height));const w=Math.max(1,Math.round(decoded.width*ratio));const h=Math.max(1,Math.round(decoded.height*ratio));const pixels=Buffer.alloc(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const src=(Math.min(decoded.height-1,Math.floor(y/ratio))*decoded.width+Math.min(decoded.width-1,Math.floor(x/ratio)))*4;const dest=(y*w+x)*4;for(let ch=0;ch<4;ch++)pixels[dest+ch]=decoded.data[src+ch];}
    const thumbnail=jpeg.encode({width:w,height:h,data:pixels},70).data;
    const id=crypto.randomUUID();const key=`uploads/${Date.now()}-${id}.jpg`;const thumb=`uploads/${Date.now()}-${id}-thumb.jpg`;
    await c.env.PHOTOS.put(key,clean,{httpMetadata:{contentType:'image/jpeg'}});await c.env.PHOTOS.put(thumb,thumbnail,{httpMetadata:{contentType:'image/jpeg'}});
    try{await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO photos(id,place_id,author_id,object_key,thumb_key,caption) VALUES(?,?,?,?,?,?)').bind(id,placeId,m.id,key,thumb,caption),
      c.env.DB.prepare("INSERT INTO submissions(id,kind,author_id,place_id,target_id,payload,dedupe_key) VALUES(?,'photo',?,?,?,?,?)").bind(crypto.randomUUID(),m.id,placeId,id,JSON.stringify({caption}),`photo:${id}`),
    ]);}catch(e){await c.env.PHOTOS.delete([key,thumb]);throw e;}
    return c.json({id,status:'pending'},201);
  });
}
export async function photoResponse(env:Bindings,req:Request,id:string){
  const photo=await env.DB.prepare('SELECT * FROM photos WHERE id=?').bind(id).first<{status:string;author_id:string;object_key:string;thumb_key:string}>();
  if(!photo)return new Response('Not found',{status:404});
  if(photo.status!=='approved'){
    const session=await createAuth(env).api.getSession({headers:req.headers});
    const role=session?await env.DB.prepare('SELECT role FROM profiles WHERE user_id=?').bind(session.user.id).first<{role:string}>():null;
    if(!session||(session.user.id!==photo.author_id&&!['admin','moderator'].includes(role?.role||'')))return new Response('Not found',{status:404});
  }
  const object=await env.PHOTOS.get(new URL(req.url).searchParams.get('size')==='thumb'?photo.thumb_key:photo.object_key);
  if(!object)return new Response('Not found',{status:404});
  return new Response(object.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
export async function cleanup(env:Bindings){
  const rejected=await env.DB.prepare("SELECT id,object_key,thumb_key FROM photos WHERE status='rejected' LIMIT 100").all<{id:string;object_key:string;thumb_key:string}>();
  for(const photo of rejected.results){await env.PHOTOS.delete([photo.object_key,photo.thumb_key]);await env.DB.prepare('DELETE FROM photos WHERE id=?').bind(photo.id).run();}
  const objects=await env.PHOTOS.list({prefix:'uploads/',limit:500});
  for(const object of objects.objects){if(object.uploaded.getTime()>Date.now()-86400000)continue;const exists=await env.DB.prepare('SELECT 1 FROM photos WHERE object_key=? OR thumb_key=?').bind(object.key,object.key).first();if(!exists)await env.PHOTOS.delete(object.key);}
  await env.DB.batch([env.DB.prepare('DELETE FROM request_limits WHERE expires_at<?').bind(Date.now()),env.DB.prepare('DELETE FROM local_mail WHERE created_at<?').bind(new Date(Date.now()-600000).toISOString())]);
}
