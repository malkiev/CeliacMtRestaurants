import { expect, test } from '@playwright/test';

for (const role of ['admin', 'member', 'moderator']) {
  test(`${role} photo deletion controls on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let deleted = false;
    let attempts = 0;
    await page.route('**/photos/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#c9c4ae"/></svg>',
      }),
    );
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/me')
        return route.fulfill({ json: { id: 'admin', name: 'Example User', role, ownerships: [] } });
      if (route.request().method() === 'DELETE') {
        attempts++;
        if (attempts === 1)
          return route.fulfill({ status: 500, json: { error: 'Please try again.' } });
        deleted = true;
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({
        json: {
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
              photo: deleted ? null : 'photo',
              business_status: 'open',
            },
            photos: deleted ? [] : [{ id: 'photo', place_id: 'place', caption: 'Cafe entrance' }],
            feedback: [],
            replies: [],
          },
        },
      });
    });
    await page.goto('/places/place');
    await expect(page.locator('.account-button span')).toHaveText('Example');
    const button = page.getByRole('button', { name: 'Delete photo', exact: true });
    if (role !== 'admin') {
      await expect(button).toHaveCount(0);
      return;
    }
    await button.click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(attempts).toBe(0);
    await button.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Delete photo', exact: true }).click();
    await expect(dialog.getByText('Please try again.', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/photo-deletion-mobile.png', fullPage: true });
    await dialog.getByRole('button', { name: 'Delete photo', exact: true }).click();
    await expect(page.locator('.photo-gallery')).toHaveCount(0);
    await expect(page.locator('.detail-photo img')).toHaveCount(0);
    expect(attempts).toBe(2);
  });
}
