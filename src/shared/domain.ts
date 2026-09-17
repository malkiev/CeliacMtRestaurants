import type { Place } from './types';

export const PLACE_TYPES = ['Restaurant', 'Cafe', 'By Order/Takeaway', 'Bakery', 'Butcher', 'Shop'];
export const CUISINES = ['Maltese', 'Mediterranean', 'Italian', 'Indian', 'Asian', 'Japanese', 'Mexican', 'Middle Eastern', 'International', 'Seafood', 'Bakery'];
export const normalise = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ħ/g, 'h').replace(/Ħ/g, 'H').toLowerCase().trim();
export function priceBand(price: number | null) { return price === null ? 0 : price < 15 ? 1 : price < 25 ? 2 : price < 40 ? 3 : 4; }
export function priceLabel(p: Pick<Place, 'price_min'|'price_max'>) { return p.price_min === null ? 'Price not yet added' : `€${p.price_min}${p.price_max !== null && p.price_max !== p.price_min ? `–${p.price_max}` : ''} per person`; }
export function distanceKm(a: {lat:number;lng:number}, b: {lat:number;lng:number}) {
  const rad = (n:number) => n * Math.PI / 180;
  const x = Math.sin(rad(b.lat-a.lat)/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
export function filterPlaces(places: Place[], filters: { q:string; island:string; locality:string; cuisine:string; type:string; price:string; verified:boolean }) {
  return places.filter(p => (!filters.q || normalise(`${p.name} ${p.locality} ${p.cuisines.join(' ')}`).includes(normalise(filters.q))) && (!filters.island || p.island===filters.island) && (!filters.locality || p.locality===filters.locality) && (!filters.cuisine || p.cuisines.includes(filters.cuisine)) && (!filters.type || p.type===filters.type) && (!filters.price || priceBand(p.price_max ?? p.price_min)===Number(filters.price)) && (!filters.verified || !!p.cam_verified));
}
