import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { preparePhoto } from '../src/client/api';

const bitmap = { width: 2560, height: 1280, close: vi.fn() };
const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
const canvas = { width: 0, height: 0, getContext: vi.fn(() => context), toBlob: vi.fn() };
const decode = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  bitmap.width = 2560;
  bitmap.height = 1280;
  decode.mockResolvedValue(bitmap);
  canvas.getContext.mockReturnValue(context);
  canvas.toBlob.mockImplementation((callback: BlobCallback) =>
    callback(new Blob(['jpeg'], { type: 'image/jpeg' })),
  );
  vi.stubGlobal('createImageBitmap', decode);
  vi.stubGlobal('document', { createElement: () => canvas });
});
afterEach(() => vi.unstubAllGlobals());
const photo = (type = 'image/jpeg', size = 10) =>
  new File([new Uint8Array(size)], 'photo', { type });

test('rejects unsupported formats and oversized originals before decoding', async () => {
  await expect(preparePhoto(photo('image/gif'))).rejects.toThrow('Unsupported photo format');
  await expect(preparePhoto(photo('image/jpeg', 10 * 1024 * 1024 + 1))).rejects.toThrow(
    'original photo is over 10 MB',
  );
  expect(decode).not.toHaveBeenCalled();
  await expect(preparePhoto(photo('image/jpeg', 10 * 1024 * 1024))).resolves.toBeInstanceOf(Blob);
});

test.each(['image/jpeg', 'image/png', 'image/webp'])(
  'converts %s through a fresh canvas at 1280px',
  async (type) => {
    const output = await preparePhoto(photo(type));
    expect(output.type).toBe('image/jpeg');
    expect([canvas.width, canvas.height]).toEqual([1280, 640]);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1280, 640);
    expect(bitmap.close).toHaveBeenCalledOnce();
  },
);

test('preserves portrait aspect ratio and never upscales small images', async () => {
  bitmap.width = 1000;
  bitmap.height = 2000;
  await preparePhoto(photo());
  expect([canvas.width, canvas.height]).toEqual([640, 1280]);
  bitmap.width = 1;
  bitmap.height = 3000;
  await preparePhoto(photo());
  expect([canvas.width, canvas.height]).toEqual([1, 1280]);
  bitmap.width = 100;
  bitmap.height = 50;
  await preparePhoto(photo());
  expect([canvas.width, canvas.height]).toEqual([100, 50]);
});

test('reduces quality before dimensions and accepts exactly 800000 bytes', async () => {
  const attempts: { width: number; quality: number }[] = [];
  canvas.toBlob.mockImplementation((callback: BlobCallback, _type: string, quality: number) => {
    attempts.push({ width: canvas.width, quality });
    callback(
      new Blob([new Uint8Array(attempts.length < 6 ? 800001 : 800000)], { type: 'image/jpeg' }),
    );
  });
  expect((await preparePhoto(photo())).size).toBe(800000);
  expect(attempts.slice(0, 4).map((a) => a.width)).toEqual([1280, 1280, 1280, 1280]);
  expect(attempts[1].quality).toBeLessThan(attempts[0].quality);
  expect(attempts[4].width).toBe(1024);
});

test('stops bounded retries with a distinct size error and releases the bitmap', async () => {
  canvas.toBlob.mockImplementation((callback: BlobCallback) =>
    callback(new Blob([new Uint8Array(800001)], { type: 'image/jpeg' })),
  );
  await expect(preparePhoto(photo())).rejects.toThrow('could not be reduced to 800 KB');
  expect(canvas.width).toBe(400);
  expect(bitmap.close).toHaveBeenCalledOnce();
});

test('reports decode and encode failures clearly', async () => {
  decode.mockRejectedValueOnce(new Error('decoder details'));
  await expect(preparePhoto(photo())).rejects.toThrow('Could not process this image');
  canvas.toBlob.mockImplementation((callback: BlobCallback) => callback(null));
  await expect(preparePhoto(photo())).rejects.toThrow('Could not process this image');
  expect(bitmap.close).toHaveBeenCalledOnce();
});
