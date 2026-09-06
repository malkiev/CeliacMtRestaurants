import { z } from 'zod';
import { CUISINES, PLACE_TYPES } from '../shared/domain';

export const text = (max=3000) => z.string().trim().min(3).max(max);
export const safeUrl = z.union([z.literal(''),z.string().max(1000).url().refine(v => new URL(v).protocol==='https:', 'Use an HTTPS link')]);
const nullableNumber = z.number().finite().nonnegative().max(1000).nullable();
export const placeSchema = z.object({
  name: text(120), type: z.string().refine(v=>PLACE_TYPES.includes(v)), locality: z.string().trim().max(80), island: z.enum(['Malta','Gozo']), address: z.string().trim().max(250),
  latitude: z.number().min(35.7).max(36.2).nullable(), longitude: z.number().min(14.1).max(14.7).nullable(),
  cuisines: z.array(z.string().refine(v=>CUISINES.includes(v))).max(5), price_min: nullableNumber, price_max: nullableNumber,
  price_basis: text(160), menu_info: z.string().trim().max(500), website: safeUrl, menu_url: safeUrl, social_url: safeUrl, phone: z.string().trim().max(40),
  business_status: z.enum(['open','temporarily_closed','closed']),
}).refine(p=>(p.latitude===null)===(p.longitude===null),'Provide both map coordinates').refine(p=>p.price_max===null || (p.price_min!==null && p.price_max>=p.price_min),'Maximum price must be at least the minimum');
export const reviewSchema = z.object({ body: text(), rating: z.number().int().min(1).max(5), visit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v)) && v <= new Date().toISOString().slice(0,10),'Use a valid past or current visit date') });
export const replySchema = z.object({ body: text() });
export const linkSchema = z.object({title:text(120),url:safeUrl.refine(Boolean),description:text(500),category:text(60),sort_order:z.number().int().min(0).max(1000),active:z.boolean()});
export const adSchema = z.object({title:text(100),body:z.string().trim().max(240),url:safeUrl.refine(Boolean),image_url:safeUrl,placement:z.enum(['list','detail']),starts_at:z.string().datetime(),ends_at:z.string().datetime(),active:z.boolean()}).refine(v=>v.ends_at>v.starts_at,'End must follow start');
