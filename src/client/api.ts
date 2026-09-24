import { createAuthClient } from 'better-auth/react';
import { magicLinkClient } from 'better-auth/client/plugins';
export const authClient = createAuthClient({ plugins: [magicLinkClient()] });
export async function request<T = Record<string, unknown>>(
  url: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const res = await fetch(url, {
    method: method || (body ? 'POST' : 'GET'),
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as T & { error?: string; message?: string };
  if (!res.ok)
    throw new Error(data.error || data.message || 'Something went wrong. Please try again.');
  return data;
}
export async function preparePhoto(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Unsupported photo format. Choose a JPEG, PNG, or WebP image.');
  if (file.size > 10 * 1024 * 1024)
    throw new Error('The original photo is over 10 MB. Choose a smaller file.');
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    if (!bitmap.width || !bitmap.height) throw new Error('Invalid image dimensions');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    let longestSide = Math.min(1280, Math.max(bitmap.width, bitmap.height));
    // Preserve useful detail: try quality first, then reduce to no less than 400px.
    const minimumSide = Math.min(400, longestSide);
    while (true) {
      const scale = longestSide / Math.max(bitmap.width, bitmap.height);
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.78, 0.68, 0.58, 0.48]) {
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (result) => (result ? resolve(result) : reject(new Error('Encoding failed'))),
            'image/jpeg',
            quality,
          ),
        );
        if (blob.type !== 'image/jpeg' || !blob.size) throw new Error('Encoding failed');
        if (blob.size <= 800000) return blob;
      }
      if (longestSide === minimumSide) break;
      longestSide = Math.max(minimumSide, Math.floor(longestSide * 0.8));
    }
  } catch {
    throw new Error('Could not process this image. Try another JPEG, PNG, or WebP photo.');
  } finally {
    bitmap?.close();
  }
  throw new Error(
    'This photo could not be reduced to 800 KB while keeping useful detail. Choose a simpler or cropped image.',
  );
}
