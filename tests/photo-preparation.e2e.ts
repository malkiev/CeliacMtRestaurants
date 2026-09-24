import { expect, test } from '@playwright/test';

test('real browser converts all supported formats and strips source metadata', async ({ page }) => {
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const modulePath = '/src/client/api.ts';
    const { preparePhoto } = await import(/* @vite-ignore */ modulePath);
    const canvas = document.createElement('canvas');
    canvas.width = 1800;
    canvas.height = 900;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#a05030';
    context.fillRect(0, 0, 1800, 900);
    const results = [];
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      const source = await new Promise<Blob>((resolve) =>
        canvas.toBlob((blob) => resolve(blob!), type),
      );
      const bytes = new Uint8Array(await source.arrayBuffer());
      let input = source;
      if (type === 'image/jpeg') {
        // Valid JPEG comment segment: metadata must not survive canvas encoding.
        const comment = new TextEncoder().encode('private-source-metadata');
        input = new Blob(
          [
            bytes.slice(0, 2),
            new Uint8Array([255, 254, 0, comment.length + 2]),
            comment,
            bytes.slice(2),
          ],
          { type },
        );
      }
      const output: Blob = await preparePhoto(new File([input], 'source', { type }));
      const decoded = await createImageBitmap(output);
      const plain: Blob = await preparePhoto(new File([source], 'plain', { type }));
      results.push({
        type: output.type,
        size: output.size,
        width: decoded.width,
        height: decoded.height,
        metadata: new TextDecoder()
          .decode(await output.arrayBuffer())
          .includes('private-source-metadata'),
        samePixels: (await output.text()) === (await plain.text()),
      });
      decoded.close();
    }
    return results;
  });
  for (const result of results) {
    expect(result.type).toBe('image/jpeg');
    expect(result.size).toBeLessThanOrEqual(800000);
    expect([result.width, result.height]).toEqual([1280, 640]);
    expect(result.metadata).toBe(false);
    expect(result.samePixels).toBe(true);
  }
});
