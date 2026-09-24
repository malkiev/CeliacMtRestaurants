import { z } from 'zod';
import { CUISINES, PLACE_TYPES, SERVICES, businessTypes } from '../shared/domain';
import { LOCALITIES, MENU_OPTIONS, normaliseLocality } from '../shared/place-options';

export const text = (max = 3000) => z.string().trim().min(3).max(max);
export const safeUrl = z.union([
  z.literal(''),
  z
    .string()
    .max(1000)
    .url()
    .refine((v) => new URL(v).protocol === 'https:', 'Use an HTTPS link'),
]);
const nullableNumber = z.number().finite().nonnegative().max(1000).nullable();
const optionalString = (max: number) => z.string().trim().max(max).default('');
export const placeSchema = z
  .object({
    catalogue_enabled: z.never().optional(),
    description: optionalString(2000),
    brand_name: optionalString(120),
    branch_name: optionalString(120),
    business_types: z
      .array(z.string().refine((v) => PLACE_TYPES.includes(v)))
      .max(PLACE_TYPES.length)
      .optional(),
    services: z
      .array(z.string().refine((v) => SERVICES.includes(v)))
      .max(3)
      .default([]),
    advance_orders: z.enum(['unknown', 'yes', 'no']).default('unknown'),
    premises: z.enum(['unknown', 'public', 'none']).default('unknown'),
    ordering_info: optionalString(1000),
    price_applicability: z.enum(['applicable', 'not_applicable']).default('applicable'),
    menu_options: z
      .array(z.string().refine((v) => MENU_OPTIONS.some((option) => option.value === v)))
      .min(1)
      .max(3)
      .default(['unknown']),
    name: text(120),
    type: z
      .string()
      .refine((v) => [...PLACE_TYPES, 'Shop', 'By Order/Takeaway', ''].includes(v))
      .optional(),
    locality: optionalString(80),
    island: z.enum(['Malta', 'Gozo']),
    address: optionalString(250),
    latitude: z.number().min(35.7).max(36.2).nullable().default(null),
    longitude: z.number().min(14.1).max(14.7).nullable().default(null),
    cuisines: z
      .array(z.string().refine((v) => CUISINES.includes(v)))
      .max(5)
      .default([]),
    price_min: nullableNumber.default(null),
    price_max: nullableNumber.default(null),
    price_basis: optionalString(160),
    menu_info: optionalString(500),
    website: safeUrl.default(''),
    menu_url: safeUrl.default(''),
    social_url: safeUrl.default(''),
    phone: optionalString(40),
    business_status: z.enum(['open', 'temporarily_closed', 'closed']).default('open'),
  })
  .transform((p) => {
    const types = [...new Set(businessTypes(p))];
    return {
      ...p,
      type: types[0] || '',
      business_types: types,
      services: [...new Set(p.services)],
      locality: normaliseLocality(p.locality, p.island),
      menu_options: [...new Set(p.menu_options)],
    };
  })
  .refine((p) => !p.locality || LOCALITIES[p.island].includes(p.locality), {
    message: 'Choose a locality on the selected island',
    path: ['locality'],
  })
  .refine((p) => !p.menu_options.includes('unknown') || p.menu_options.length === 1, {
    message: 'Choose either known menu options or I don’t know',
    path: ['menu_options'],
  })
  .refine((p) => p.premises === 'none' || (p.latitude === null) === (p.longitude === null), {
    message: 'Provide both map coordinates',
    path: ['latitude'],
  })
  .refine(
    (p) =>
      p.price_applicability === 'not_applicable' ||
      p.price_max === null ||
      (p.price_min !== null && p.price_max >= p.price_min),
    { message: 'Maximum price must be at least the minimum', path: ['price_max'] },
  )
  .refine(
    (p) =>
      p.price_applicability === 'not_applicable' ||
      (p.price_min === null && p.price_max === null) ||
      p.price_basis.length >= 3,
    { message: 'Describe what the price estimate covers', path: ['price_basis'] },
  );
export const reviewSchema = z.object({
  body: text(),
  rating: z.number().int().min(1).max(5),
  visit_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) => !Number.isNaN(Date.parse(v)) && v <= new Date().toISOString().slice(0, 10),
      'Use a valid past or current visit date',
    ),
});
export const replySchema = z.object({ body: text() });
export const linkSchema = z.object({
  title: text(120),
  url: safeUrl.refine(Boolean),
  description: text(500),
  category: text(60),
  sort_order: z.number().int().min(0).max(1000),
  active: z.boolean(),
});
export const adSchema = z
  .object({
    title: text(100),
    body: z.string().trim().max(240),
    url: safeUrl.refine(Boolean),
    image_url: safeUrl,
    placement: z.enum(['list', 'detail']),
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime(),
    active: z.boolean(),
  })
  .refine((v) => v.ends_at > v.starts_at, 'End must follow start');
