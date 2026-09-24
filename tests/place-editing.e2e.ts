import { test, expect, type Page } from '@playwright/test';

function fixture() {
  return {
    id: 'place',
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
async function setup(page: Page, owner = false, patch: Record<string, unknown> = {}) {
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
        json: { places: [place], users: [], links: [], adverts: [], ownerships: [] },
      });
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      submitted.push(body);
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

test('photo form rejects more than five files before uploading', async ({ page }) => {
  const submitted = await setup(page);
  await page.goto('/places/place');
  await page.getByRole('button', { name: 'Add photos' }).click();
  await page
    .locator('input[name="photos"]')
    .setInputFiles(
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

test('welcome card has clear buttons and fits desktop and small screens', async ({
  page,
}, testInfo) => {
  await setup(page);
  for (const width of [1280, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Find your next favourite' })).toHaveClass(
      /button primary/,
    );
    await expect(page.getByRole('link', { name: 'Get to know us' })).toHaveClass(/button/);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true });
  }
});

test('minimal mobile submission keeps optional sections closed and location grouping last', async ({
  page,
}, testInfo) => {
  const submitted = await setup(page, true);
  await page.setViewportSize({ width: 375, height: 850 });
  await page.goto('/suggest');
  const sections = page.locator('form details');
  await expect(sections).toHaveCount(5);
  await expect(sections.last().locator('summary')).toHaveText(
    'Part of a business with several locations? (optional)',
  );
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
  await page.goto('/');
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
