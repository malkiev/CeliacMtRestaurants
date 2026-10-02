import { test, expect, type Page } from '@playwright/test';
import type { BusinessType, GlutenFreeItem } from '../src/shared/types';

const foodItems: GlutenFreeItem[] = [
  { key: 'pizza', label: 'Pizza', sort_order: 1, active: 1 },
  { key: 'pasta', label: 'Pasta', sort_order: 2, active: 0 },
];

function fixture() {
  return {
    id: 'place',
    published: 1,
    slug: 'place',
    name: 'Example cafe',
    type: 'Cafe',
    business_types: ['Cafe'],
    services: ['Takeaway/collection'],
    premises: 'unknown',
    catalogue_enabled: false,
    description: 'A welcoming neighbourhood cafe.',
    brand_name: 'Example',
    branch_name: 'Waterfront',
    locality: 'Valletta',
    island: 'Malta',
    address: '1 Example Street',
    latitude: 35.89,
    longitude: 14.5,
    coordinates_checked: 1,
    cuisines: [],
    menu_options: ['unknown'],
    price_min: null,
    price_max: null,
    price_basis: 'Main meal per person',
    menu_info: 'Original menu notes',
    website: 'https://example.test',
    menu_url: '',
    social_url: '',
    phone: '',
    business_status: 'open',
    cam_verified: 0,
    cam_verified_at: null as string | null,
    source_cam: 1,
    updated_at: '2026-01-01',
    rating: null,
    review_count: 0,
    photo: null,
  };
}
async function setup(page: Page, owner = false, patch: Record<string, unknown> = {}, businessTypes?: BusinessType[]) {
  let place = { ...fixture(), ...patch };
  const submitted: Record<string, any>[] = [];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const member = {
      id: 'user',
      name: 'Example User',
      email: 'user@example.test',
      role: owner ? 'member' : 'admin',
      ownerships: owner ? ['place'] : [],
    };
    if (path === '/api/me') return route.fulfill({ json: member });
    if (path === '/api/bootstrap')
      return route.fulfill({
        json: {
          places: [place],
          business_types: businessTypes,
          gluten_free_item_catalog: foodItems,
          links: [],
          adverts: [],
          detail: {
            place,
            photos: [],
            feedback: [
              {
                id: 'imported',
                kind: 'imported',
                body: 'Existing community feedback.',
                rating: null,
                source_ref: 'https://example.test/source',
              },
            ],
            replies: [],
            branches: [
              {
                ...place,
                id: 'branch',
                slug: 'branch',
                branch_name: 'Bay',
                locality: 'San Ġiljan',
              },
            ],
          },
          config: { mapStyle: '', google: false, email: true, local: true },
        },
      });
    if (path === '/api/admin/data')
      return route.fulfill({
        json: { places: [place], users: [], links: [], adverts: [], ownerships: [], business_types: businessTypes, gluten_free_item_catalog: foodItems },
      });
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      submitted.push(body);
      if (path === '/api/admin/places/place/archive') place = { ...place, published: body.archived ? 0 : 1 };
      if (path === '/api/admin/cam')
        place = {
          ...place,
          cam_verified: Number(body.verified),
          cam_verified_at: '2026-02-01',
          updated_at: '2026-02-01',
        };
      if (path === '/api/admin/places')
        place = { ...place, ...body.place, updated_at: '2026-03-01' };
      return route.fulfill({ json: { id: 'place', ok: true, status: 'pending' } });
    }
    return route.fulfill({ json: [] });
  });
  return submitted;
}

test('admin archives and restores an unclassified place on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const submitted = await setup(page, false, { name: 'test', business_types: [] });
  await page.goto('/admin');
  await page.getByLabel('Choose a place').selectOption('place');
  await page.getByRole('button', { name: 'Archive place', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore place', exact: true })).toBeVisible();
  await expect(page.getByLabel('Choose a place').locator('option:checked')).toContainText('(Archived)');
  await expect(page.getByRole('link', { name: 'View place', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/place-archived-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Restore place', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Archive place', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View place', exact: true })).toBeVisible();
  expect(submitted).toEqual([{ archived: true }, { archived: false }]);
});

test('reviews reuse saved dietary conditions without asking for them again', async ({ page }) => {
  const submitted = await setup(page);
  await page.route('**/api/my/profile', route => route.fulfill({ json: {
    id: 'user', name: 'Example User', avatar: { preset: 'initials', url: null },
    conditions: ['Coeliac'], symptoms: null, share_health: true,
  } }));
  await page.goto('/places/place');
  await expect(page.locator('.account-button span')).toHaveText('Example');
  await page.getByRole('button', { name: 'Write a review' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Coeliac');
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await dialog.getByRole('radio', { name: '4 stars' }).check();
  await dialog.getByLabel('When did you visit?').fill('2026-01-01');
  await dialog.getByLabel('Your experience').fill('Helpful staff and clear menu information.');
  await dialog.getByRole('button', { name: 'Publish review' }).click();
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0].payload).toEqual({ body: 'Helpful staff and clear menu information.', rating: 4, visit_date: '2026-01-01' });
});

test('incomplete dietary profiles link to Account and profile failures can be retried', async ({ page }) => {
  const submitted = await setup(page);
  let fail = true;
  await page.route('**/api/my/profile', route => fail
    ? route.fulfill({ status: 503, json: { error: 'Unavailable' } })
    : route.fulfill({ json: { id: 'user', name: 'Example User', avatar: { preset: 'initials', url: null }, conditions: [], symptoms: null, share_health: false } }));
  await page.goto('/places/place');
  await expect(page.locator('.account-button span')).toHaveText('Example');
  await page.getByRole('button', { name: 'Write a review' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toBeVisible();
  fail = false;
  await dialog.getByRole('button', { name: 'Try again' }).click();
  await expect(dialog.getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('href', '/account');
  await expect(dialog.getByRole('button', { name: 'Publish review' })).toHaveCount(0);
  expect(submitted).toHaveLength(0);
});

test('photo form rejects more than five files before uploading', async ({ page }) => {
  const submitted = await setup(page, true);
  await page.goto('/places/place');
  await page.getByRole('button', { name: 'Add photos' }).click();
  await page.locator('input[name="photos"]').setInputFiles(
    Array.from({ length: 6 }, (_, i) => ({
      name: `${i}.jpg`,
      mimeType: 'image/jpeg',
      buffer: Buffer.from('photo'),
    })),
  );
  await page.getByLabel('Caption', { exact: true }).fill('Example photo');
  await page.getByRole('button', { name: 'Send for approval' }).click();
  await expect(page.getByText('Choose between one and five photos.')).toBeVisible();
  expect(submitted).toHaveLength(0);
});

for (const admin of [true, false]) {
  test(`${admin ? 'admin' : 'member'} photo form shows the correct publication result`, async ({
    page,
  }, testInfo) => {
    await setup(page, !admin);
    let uploads = 0;
    await page.route('**/api/photos', async (route) => {
      uploads++;
      expect(route.request().headers()['content-type']).toContain('multipart/form-data');
      await route.fulfill({
        status: 201,
        json: { id: 'photo', status: admin ? 'approved' : 'pending' },
      });
    });
    await page.setViewportSize({ width: 375, height: 850 });
    await page.goto('/places/place');
    await page.getByRole('button', { name: 'Add photos' }).click();
    const data = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 20;
      canvas.height = 20;
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.locator('input[name="photos"]').setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(data, 'base64'),
    });
    await page.getByLabel('Caption', { exact: true }).fill('Example photo');
    await page
      .getByRole('button', { name: admin ? 'Save changes' : 'Send for approval', exact: true })
      .click();
    await expect(
      page.getByText(admin ? 'Your photos are published.' : 'Your photos are awaiting approval.', {
        exact: true,
      }),
    ).toBeVisible();
    expect(uploads).toBe(1);
    await page.screenshot({
      path: testInfo.outputPath('photo-publication-mobile.png'),
      fullPage: true,
    });
  });
}

test('admin loads imported CAM choice and saved decisions, and edits all place fields', async ({
  page,
}) => {
  const submitted = await setup(page);
  await page.goto('/admin');
  await page.getByLabel('Choose a place').selectOption('place');
  const cam = page.getByRole('checkbox', { name: 'Verified by CAM', exact: true });
  await expect(cam).toBeChecked();
  await expect(
    page.getByText('The imported directory records CAM verification.', { exact: false }),
  ).toBeVisible();
  await cam.uncheck();
  await page.getByLabel('Check note (private)').fill('Checked current status');
  await page.getByRole('button', { name: 'Save CAM status' }).click();
  await expect(page.getByText('CAM status saved.')).toBeVisible();
  await expect(cam).not.toBeChecked();
  await page.getByText('About the business (optional)', { exact: true }).click();
  await page.getByLabel('About this place').fill('Updated description');
  await page.getByRole('checkbox', { name: 'Dedicated gluten-free menu', exact: true }).check();
  await expect(page.getByRole('checkbox', { name: "I don't know", exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Save place details' }).click();
  await expect
    .poll(() => submitted.some((body) => body.place?.description === 'Updated description'))
    .toBe(true);
  expect(submitted.find((body) => body.place)?.place.menu_options).toEqual(['dedicated_menu']);
});

test('locality choices follow the island and owners can propose a description', async ({
  page,
}) => {
  const submitted = await setup(page, true);
  await page.goto('/places/place');
  await expect(page.getByRole('link', { name: 'Original source' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'About this place' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Bay' })).toHaveAttribute('href', '/places/branch');
  await page.getByRole('button', { name: 'Edit place details' }).click();
  await page.getByRole('combobox', { name: 'Island', exact: true }).selectOption('Gozo');
  await expect(page.getByRole('combobox', { name: 'Locality', exact: true })).toHaveValue('');
  await expect(
    page
      .getByRole('combobox', { name: 'Locality', exact: true })
      .locator('option[value="Valletta"]'),
  ).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Locality', exact: true }).selectOption('Xagħra');
  await page.getByText('About the business (optional)', { exact: true }).click();
  await page.getByLabel('About this place').fill('Owner description');
  await page.getByRole('button', { name: 'Submit place updates' }).click();
  await expect(page.getByText('Your changes are awaiting moderator approval.')).toBeVisible();
  expect(submitted[0]).toMatchObject({
    kind: 'correction',
    place_id: 'place',
    payload: { description: 'Owner description', locality: 'Xagħra', island: 'Gozo' },
  });
});

const managedTypes: BusinessType[] = [
  { key: 'Cafe', label: 'Cafe', category: 'restaurant', sort_order: 1, active: 0 },
  { key: 'Market', label: 'Local market', category: 'shop', sort_order: 2, active: 1 },
];

test('public forms use managed types and preserve existing inactive selections', async ({ page }) => {
  await setup(page, true, {}, managedTypes);
  await page.goto('/suggest');
  await expect(page.getByRole('checkbox', { name: 'Local market', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Café', exact: true })).toHaveCount(0);
  await page.goto('/places/place');
  await page.getByRole('button', { name: 'Edit place details' }).click();
  await expect(page.getByRole('checkbox', { name: 'Café', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Local market', exact: true })).toBeVisible();
});

test('inactive types keep existing places in their directory section', async ({ page }) => {
  await setup(page, false, {}, managedTypes);
  await page.goto('/restaurants');
  await expect(page.locator('.place-card')).toContainText('Example cafe');
  await page.goto('/shops');
  await expect(page.locator('.place-card')).toHaveCount(0);
});

test('admin type edits use PATCH without sending the stable key', async ({ page }) => {
  await setup(page, false, {}, managedTypes);
  let saved: Record<string, unknown> | undefined;
  await page.route('**/api/admin/business-types/Cafe', async route => {
    expect(route.request().method()).toBe('PATCH');
    saved = route.request().postDataJSON();
    await route.fulfill({ json: { key: 'Cafe', ...saved } });
  });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'types', exact: true }).click();
  await page.getByText('Cafe', { exact: true }).click();
  const form = page.locator('details').filter({ has: page.locator('summary', { hasText: /^Cafe$/ }) });
  await form.getByLabel('Label', { exact: true }).fill('Coffee shop');
  await form.getByRole('button', { name: 'Save type' }).click();
  await expect.poll(() => saved).toEqual({ label: 'Coffee shop', category: 'restaurant', sort_order: 1, active: false });
});

test('admins edit food labels and deactivate choices using the catalog panel', async ({ page }) => {
  await setup(page);
  let saved: Record<string, unknown> | undefined;
  await page.route('**/api/admin/gluten-free-items/pizza', async route => {
    expect(route.request().method()).toBe('PATCH');
    saved = route.request().postDataJSON();
    await route.fulfill({ json: { key: 'pizza', ...saved } });
  });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'food items', exact: true }).click();
  await page.locator('summary').filter({ hasText: /^Pizza$/ }).click();
  const form = page.locator('details').filter({ has: page.locator('summary', { hasText: /^Pizza$/ }) });
  await form.getByLabel('Label', { exact: true }).fill('Pizza bases');
  await form.getByRole('checkbox').uncheck();
  await form.getByRole('button', { name: 'Save food item' }).click();
  await expect.poll(() => saved).toEqual({ label: 'Pizza bases', sort_order: 1, active: false });
});

test('food items appear in forms, detail, search and persistent filters', async ({ page }, testInfo) => {
  await setup(page, true, { gluten_free_items: ['pizza', 'pasta'] });
  await page.goto('/suggest');
  await expect(page.getByRole('checkbox', { name: 'Pizza', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Pasta', exact: true })).toHaveCount(0);
  await page.goto('/places/place');
  await expect(page.getByRole('heading', { name: 'Gluten-free items available' })).toBeVisible();
  await expect(page.getByText('Pizza', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit place details' }).click();
  await expect(page.getByRole('checkbox', { name: 'Pasta', exact: true })).toBeChecked();
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/restaurants');
    await page.getByRole('textbox', { name: 'Search places' }).fill('pizza');
    await expect(page.locator('.place-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'More filters' }).click();
    await page.getByRole('combobox', { name: 'Gluten-free item', exact: true }).selectOption('pizza');
    await page.reload();
    await expect(page.locator('.place-card')).toHaveCount(1);
    await page.locator('.view-toggle').getByRole('link', { name: 'Map', exact: true }).click();
    await expect(page).toHaveURL(/item=pizza/);
    await page.locator('.view-toggle').getByRole('link', { name: 'List', exact: true }).click();
    await expect(page.locator('.place-card')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`food-items-${width}.png`), fullPage: true });
  }
});

test('directory search stays in the viewport without horizontal overflow', async ({
  page,
}, testInfo) => {
  await setup(page);
  for (const path of ['/restaurants', '/shops', '/map']) {
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path);
      const search = page.getByRole('textbox', { name: 'Search places' });
      await expect(search).toBeInViewport({ ratio: 1 });
      await expect(
        page.locator('.results-summary').getByRole('link', { name: 'Add a business' }),
      ).toHaveAttribute('href', '/suggest');
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${path.slice(1)}-${width}.png`),
        fullPage: true,
      });
    }
  }
});

test('minimal mobile submission succeeds with optional sections closed', async ({
  page,
}, testInfo) => {
  const submitted = await setup(page, true);
  await page.setViewportSize({ width: 375, height: 850 });
  await page.goto('/suggest');
  const sections = page.locator('form details');
  await expect(page.getByLabel('Business name', { exact: true })).toBeVisible();
  expect(
    await sections.evaluateAll((nodes) => nodes.every((n) => !(n as HTMLDetailsElement).open)),
  ).toBe(true);
  await page.getByLabel('Business name', { exact: true }).fill('Example order business');
  await page.getByRole('checkbox', { name: 'Food producer', exact: true }).check();
  await page.screenshot({
    path: testInfo.outputPath('minimal-business-form-mobile.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0].payload).toMatchObject({
    business_types: ['Food producer'],
    locality: '',
    premises: 'unknown',
    services: [],
    price_min: null,
    brand_name: '',
    branch_name: '',
  });
});

test('collapsed editing preserves optional fields and opens invalid section', async ({ page }) => {
  const submitted = await setup(page, true);
  await page.goto('/places/place');
  await page.getByRole('button', { name: 'Edit place details' }).click();
  await page.getByText('Prices (optional)', { exact: true }).click();
  await page.getByLabel('Approx. minimum € per person').fill('10');
  await page.getByLabel('What does this estimate cover?').fill('');
  await page.getByText('Prices (optional)', { exact: true }).click();
  await page.getByRole('button', { name: 'Submit place updates' }).click();
  await expect(page.getByLabel('What does this estimate cover?')).toBeFocused();
  expect(submitted).toHaveLength(0);
  await page.getByLabel('What does this estimate cover?').fill('Main meal without drinks');
  await page.getByText('Prices (optional)', { exact: true }).click();
  await page.getByRole('button', { name: 'Submit place updates' }).click();
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0].payload).toMatchObject({
    description: 'A welcoming neighbourhood cafe.',
    website: 'https://example.test',
    brand_name: 'Example',
    branch_name: 'Waterfront',
    services: ['Takeaway/collection'],
    price_min: 10,
  });
});

test('producer has no directions and supports services and premises editing on mobile', async ({
  page,
}, testInfo) => {
  await setup(page, true, {
    business_types: ['Food producer'],
    premises: 'none',
    address: undefined,
    latitude: undefined,
    longitude: undefined,
    coordinates_checked: 0,
  });
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto('/places/place');
  await expect(page.getByRole('link', { name: 'Open Google Maps' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit place details' }).click();
  await page.getByText('Location and contact (optional)', { exact: true }).click();
  await expect(page.getByLabel('Street address')).toBeHidden();
  await page.getByText('Services and ordering (optional)', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Delivery', exact: true }).check();
  await page.getByLabel('Advance orders required').selectOption('yes');
  await page.screenshot({ path: testInfo.outputPath('producer-form-mobile.png'), fullPage: true });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

test('shop importer matches both types and service filter persists on map navigation', async ({
  page,
}) => {
  await setup(page, false, {
    business_types: ['Food shop', 'Importer/distributor'],
    services: ['Delivery'],
  });
  await page.goto('/shops');
  await page.getByRole('button', { name: 'More filters' }).click();
  await page
    .getByRole('combobox', { name: 'Business type', exact: true })
    .selectOption('Food shop');
  await page.getByRole('combobox', { name: 'Service', exact: true }).selectOption('Delivery');
  await expect(page.locator('.place-card')).toHaveCount(1);
  await page
    .getByRole('combobox', { name: 'Business type', exact: true })
    .selectOption('Importer/distributor');
  await expect(page.locator('.place-card')).toHaveCount(1);
  await expect(
    page.locator('.view-toggle').getByRole('link', { name: 'Map', exact: true }),
  ).toHaveAttribute('href', /service=Delivery/);
});

test('admin catalogue control sends a separate action', async ({ page }) => {
  const submitted = await setup(page);
  await page.goto('/admin');
  await page.getByLabel('Choose a place').selectOption('place');
  await page.getByRole('checkbox', { name: 'Product catalogue enabled', exact: true }).check();
  await page.getByRole('button', { name: 'Save catalogue eligibility', exact: true }).click();
  await expect.poll(() => submitted.some((body) => body.enabled === true)).toBe(true);
});
