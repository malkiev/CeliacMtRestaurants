import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';
export const authClient=createAuthClient({plugins:[magicLinkClient()]});
export async function request<T=Record<string,unknown>>(url:string,body?:unknown,method?:string):Promise<T>{
  const res=await fetch(url,{method:method||(body?'POST':'GET'),headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const data=await res.json() as T & {error?:string;message?:string};if(!res.ok)throw new Error(data.error||data.message||'Something went wrong. Please try again.');return data;
}
export async function preparePhoto(file:File):Promise<Blob>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Choose a JPG, PNG, or WebP image under 10 MB.');
  const bitmap=await createImageBitmap(file);const scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not process this image.')),'image/jpeg',0.78));
}
