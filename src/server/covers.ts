import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { owns } from './db';

export const coverSchema = z.object({ cover_photo_id: z.string().min(1) }).strict();

export async function checkCover(db: D1Database, userId: string, placeId: string, photoId: string) {
  if (!await owns(db, userId, placeId)) {
    throw new HTTPException(403, { message: 'Only a current verified owner can choose this place’s cover photo' });
  }
  if (!await db.prepare("SELECT id FROM photos WHERE id=? AND place_id=? AND status='approved'").bind(photoId, placeId).first()) {
    throw new HTTPException(409, { message: 'Choose an approved photo belonging to this place' });
  }
}
