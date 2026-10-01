import { test, expect, type Page } from '@playwright/test';
import type { Bootstrap, Place } from '../src/shared/types';

function places(type: string): Place[] {
  return Array.from({ length: 29 }, (_, index) => ({
    id: `${type}-${index}`,
    slug: `${type}-${index}`,
    name: `${type} ${String(index + 1).padStart(2, '0')}`,
    type,
    description: '',
    brand_name: '',
    branch_name: '',
    menu_options: [],
    locality: index < 15 ? 'Valletta' : 'Victoria',
    island: index < 15 ? 'Malta' : 'Gozo',
    address: '',
    latitude: null,
    longitude: null,
    coordinates_checked: 0,
    cuisines: [],
    price_min: null,
    price_max: null,
    price_basis: '',
    price_updated: null,
    menu_info: '',
    website: '',
    menu_url: '',
    social_url: '',
    phone: '',
    cam_verified: 0,
    cam_verified_at: null,
    business_status: 'open',
    updated_at: '',
    rating: (index % 5) + 1,
    review_count: 1,
    photo: null,
  }));
}

async function setup(page: Page) {
  const data: Bootstrap = {
    places: [...places('Restaurant'), ...places('Food shop')],
    links: [],
    adverts: [],
    detail: null,
    config: { mapStyle: '', google: false, email: false, local: true },
  };
  await page.route('**/api/**', (route) =>
    route.fulfill({
      json: new URL(route.request().url()).pathname === '/api/bootstrap' ? data : null,
    }),
  );
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  for (const path of ['/', '/restaurants', '/shops']) {
    test(`${path} reveals all results on scroll at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await setup(page);
      await page.goto(path);
      const cards = page.locator('.place-card');
      await expect(cards).toHaveCount(12);
      await page.locator('.load-more').scrollIntoViewIfNeeded();
      await expect(cards).toHaveCount(24);
      await page.locator('.load-more').scrollIntoViewIfNeeded();
      await expect(cards).toHaveCount(29);
      await expect(page.getByRole('status')).toHaveText('Showing 29 of 29');
      await expect(page.getByRole('button', { name: 'Explore more places' })).toHaveCount(0);
      const names = await cards.locator('h3').allTextContents();
      expect(new Set(names).size).toBe(29);
      expect(
        names.every((name) => name.startsWith(path === '/shops' ? 'Food shop' : 'Restaurant')),
      ).toBe(true);
      await page.locator('.site-footer').scrollIntoViewIfNeeded();
      await expect(cards).toHaveCount(29);

      await page.getByRole('combobox', { name: 'Locality', exact: true }).selectOption('Valletta');
      await expect(cards).toHaveCount(12);
      await page.locator('.load-more').scrollIntoViewIfNeeded();
      await expect(cards).toHaveCount(15);
      await expect(page.getByRole('status')).toHaveText('Showing 15 of 15');
      await page.getByRole('combobox', { name: 'Sort places' }).selectOption('rating');
      await expect(cards.first().locator('h3')).toHaveText(
        path === '/shops' ? 'Food shop 05' : 'Restaurant 05',
      );
      await page.getByRole('textbox', { name: 'Search places' }).fill('No matching business');
      await expect(cards).toHaveCount(0);
      await expect(page.getByText('No places found this time')).toBeVisible();
    });
  }
}

test('manual loading remains available without IntersectionObserver', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'IntersectionObserver', { value: undefined, configurable: true });
  });
  await setup(page);
  await page.goto('/shops');
  await expect(page.locator('.place-card')).toHaveCount(12);
  const more = page.getByRole('button', { name: 'Explore more places' });
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.place-card')).toHaveCount(24);
  await more.click();
  await expect(page.locator('.place-card')).toHaveCount(29);
});
