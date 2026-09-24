export type AvatarCrop = { zoom: number; x: number; y: number };
export function drawAvatar(canvas: HTMLCanvasElement, bitmap: ImageBitmap, crop: AvatarCrop) {
  const side = Math.min(bitmap.width, bitmap.height) / Math.max(1, Math.min(3, crop.zoom));
  canvas.width = canvas.height = Math.max(1, Math.min(256, Math.floor(side)));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not process this photo. Try another image.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    bitmap,
    ((bitmap.width - side) * Math.max(0, Math.min(100, crop.x))) / 100,
    ((bitmap.height - side) * Math.max(0, Math.min(100, crop.y))) / 100,
    side,
    side,
    0,
    0,
    canvas.width,
    canvas.height,
  );
}
export async function prepareAvatar(bitmap: ImageBitmap, crop: AvatarCrop): Promise<Blob> {
  const canvas = document.createElement('canvas');
  drawAvatar(canvas, bitmap, crop);
  for (const quality of [0.85, 0.75, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob || blob.type !== 'image/jpeg' || !blob.size)
      throw new Error('Could not process this photo. Try another image.');
    if (blob.size <= 100000) return blob;
  }
  throw new Error('This photo could not be reduced to 100 KB. Choose a simpler image.');
}
