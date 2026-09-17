export type Role = 'member' | 'moderator' | 'admin';
export type Place = {
  id: string; slug: string; name: string; type: string; locality: string; island: 'Malta' | 'Gozo'; address: string;
  latitude: number | null; longitude: number | null; coordinates_checked: number; cuisines: string[];
  price_min: number | null; price_max: number | null; price_basis: string; price_updated: string | null;
  menu_info: string; website: string; menu_url: string; social_url: string; phone: string;
  cam_verified: number; cam_verified_at: string | null; business_status: string; updated_at: string;
  rating: number | null; review_count: number; photo: string | null; source_cam?: number; source_ref?: string;
};
export type Feedback = { id: string; place_id: string; author_id?: string | null; author_name: string; kind: 'review'|'imported'; body: string; rating: number|null; visit_date: string|null; created_at: string|null; source_ref: string|null };
export type Reply = { id: string; feedback_id: string; author_name: string; body: string; created_at: string; updated_at: string };
export type Photo = { id: string; caption: string; place_id: string };
export type UsefulLink = { id: string; title: string; url: string; description: string; category: string; sort_order: number; last_checked: string|null; active: number };
export type Advert = { id: string; title: string; body: string; url: string; image_url: string; placement: 'list'|'detail'; starts_at: string; ends_at: string; active: number };
export type Detail = { place: Place; feedback: Feedback[]; replies: Reply[]; photos: Photo[] };
export type Bootstrap = { places: Place[]; links: UsefulLink[]; adverts: Advert[]; detail: Detail|null; config: { mapStyle: string; google: boolean; email: boolean; local: boolean } };
export type Member = { id: string; name: string; email: string; role: Role; ownerships: string[] };
export type Submission = { id: string; kind: 'review'|'reply'|'place'|'correction'|'photo'|'report'|'owner_claim'; author_id: string; author_name: string; place_id: string|null; place_name?: string; target_id: string|null; payload: Record<string, unknown>; status: string; created_at: string; reason: string; decided_at: string|null };
