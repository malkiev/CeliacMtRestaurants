import { expect, test } from '@playwright/test';

for (const width of [390, 1280]) {
  test(`photos open in place at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route('**/photos/**', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#c9c4ae"/></svg>',
      }),
    );
    await page.route('**/api/**', (route) =>
      route.fulfill({
        json:
          new URL(route.request().url()).pathname === '/api/me'
            ? null
            : {
                places: [],
                adverts: [],
                links: [],
                config: {},
                detail: {
                  place: {
                    id: 'place',
                    slug: 'place',
                    name: 'Example cafe',
                    type: 'Cafe',
                    island: 'Malta',
                    cuisines: [],
                    price_min: null,
                    rating: null,
                    review_count: 0,
                    photo: 'entrance',
                    business_status: 'open',
                  },
                  photos: [
                    { id: 'entrance', caption: 'Cafe entrance' },
                    { id: 'menu', caption: 'Cafe menu' },
                  ],
                  feedback: [],
                  replies: [],
                },
              },
      }),
    );
    await page.goto('/places/place');
    const thumbnail = page
      .locator('.photo-gallery')
      .getByRole('button', { name: 'View photo: Cafe menu' });
    await thumbnail.click();
    const dialog = page.getByRole('dialog', { name: 'Photo viewer' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('img')).toHaveAttribute('src', '/photos/menu');
    await expect(dialog.locator('figcaption')).toHaveText('Cafe menu');
    await expect(page).toHaveURL(/\/places\/place$/);
    expect(context.pages()).toHaveLength(1);
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(thumbnail).toBeFocused();
    const cover = page
      .locator('.detail-photo')
      .getByRole('button', { name: 'View photo: Cafe entrance' });
    await cover.click();
    await expect(dialog.getByRole('img')).toHaveAttribute('src', '/photos/entrance');
    if (width === 390) await page.screenshot({ path: 'test-results/photo-viewer-mobile.png' });
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
    await expect(cover).toBeFocused();
    await thumbnail.click();
    await page.mouse.click(2, 2);
    await expect(dialog).toHaveCount(0);
    await expect(thumbnail).toBeFocused();
  });
}
