import type { GlutenFreeItem, Place } from './types';

export const PLACE_TYPES = [
  'Restaurant',
  'Cafe',
  'Bar',
  'Wine bar',
  'Bakery',
  'Butcher',
  'Food shop',
  'Food producer',
  'Importer/distributor',
];
export const SERVICES = ['Dine-in', 'Takeaway/collection', 'Delivery'];
export function businessTypes(p: { business_types?: string[]; type?: string }) {
  return (
    p.business_types ??
    (p.type === 'Shop' ? ['Food shop'] : PLACE_TYPES.includes(p.type || '') ? [p.type!] : [])
  );
}
export function businessTypeLabel(p: Place) {
  return (
    businessTypes(p)
      .map((t) => (t === 'Cafe' ? 'Café' : t))
      .join(' · ') || 'Business'
  );
}
export const CUISINES = [
  'Maltese',
  'Mediterranean',
  'Italian',
  'Indian',
  'Asian',
  'Japanese',
  'Mexican',
  'Middle Eastern',
  'International',
  'Seafood',
  'Bakery',
];
export const normalise = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ħ/g, 'h')
    .replace(/Ħ/g, 'H')
    .toLowerCase()
    .trim();
export function priceBand(price: number | null) {
  return price === null ? 0 : price < 15 ? 1 : price < 25 ? 2 : price < 40 ? 3 : 4;
}
export function priceLabel(p: Pick<Place, 'price_min' | 'price_max' | 'price_applicability'>) {
  return p.price_applicability === 'not_applicable'
    ? 'Meal pricing not applicable'
    : p.price_min === null
      ? 'Price not yet added'
      : `€${p.price_min}${p.price_max !== null && p.price_max !== p.price_min ? `–${p.price_max}` : ''} per person`;
}
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (n: number) => (n * Math.PI) / 180;
  const x =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
export function filterPlaces(
  places: Place[],
  filters: {
    q: string;
    island: string;
    locality: string;
    cuisine: string;
    type: string;
    price: string;
    verified?: boolean;
    service?: string;
    item?: string;
  },
  itemCatalog: GlutenFreeItem[] = [],
) {
  return places.filter(
    (p) =>
      (!filters.q ||
        normalise(
          `${p.name} ${p.brand_name || ''} ${p.branch_name || ''} ${p.locality} ${p.cuisines.join(' ')} ${(p.gluten_free_items || []).map(key => itemCatalog.find(item => item.key === key)?.label || key.replaceAll('_', ' ')).join(' ')}`,
        ).includes(normalise(filters.q))) &&
      (!filters.island || p.island === filters.island) &&
      (!filters.locality || p.locality === filters.locality) &&
      (!filters.cuisine || p.cuisines.includes(filters.cuisine)) &&
      (!filters.type || businessTypes(p).includes(filters.type)) &&
      (!filters.item || (p.gluten_free_items || []).includes(filters.item)) &&
      (!filters.service || (p.services || []).includes(filters.service)) &&
      (!filters.price ||
        (p.price_applicability !== 'not_applicable' &&
          priceBand(p.price_max ?? p.price_min) === Number(filters.price))) &&
      (!filters.verified || !!p.cam_verified),
  );
}
