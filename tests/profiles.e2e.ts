import { expect, test, type Page } from '@playwright/test';
import jpeg from 'jpeg-js';
import type { OwnProfile } from '../src/shared/profiles';

async function setup(page: Page) {
  let profile: OwnProfile = {
    id: 'user',
    name: 'Example Member',
    avatar: { preset: 'initials', url: null },
    conditions: [],
    symptoms: null,
    share_health: false,
  };
  let failUpload = false;
  const uploads: Uint8Array[] = [];
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me')
      return route.fulfill({
        json: {
          id: 'user',
          name: profile.name,
          email: 'private@example.test',
          role: 'member',
          ownerships: [],
        },
      });
    if (path === '/api/bootstrap')
      return route.fulfill({
        json: {
          places: [],
          adverts: [],
          links: [],
          detail: null,
          profile: {
            id: profile.id,
            name: profile.name,
            avatar: profile.avatar,
            ...(profile.share_health
              ? { conditions: profile.conditions, symptoms: profile.symptoms }
              : {}),
          },
          config: { google: false, email: true, local: false, mapStyle: '' },
        },
      });
    if (path === '/api/my/profile') {
      if (route.request().method() === 'PATCH') {
        const { avatar_preset, ...patch } = route.request().postDataJSON();
        profile = {
          ...profile,
          ...patch,
          ...(avatar_preset ? { avatar: { preset: avatar_preset, url: null } } : {}),
        };
      }
      return route.fulfill({ json: profile });
    }
    if (path === '/api/my/avatar') {
      if (route.request().method() === 'DELETE') profile.avatar = { preset: 'initials', url: null };
      else {
        if (failUpload)
          return route.fulfill({
            status: 503,
            json: { error: 'Upload unavailable. Please try again.' },
          });
        const form = await new Response(new Uint8Array(route.request().postDataBuffer()!), {
          headers: { 'Content-Type': route.request().headers()['content-type'] },
        }).formData();
        const file = form.get('avatar') as File;
        expect(file.type).toBe('image/jpeg');
        expect(file.size).toBeLessThanOrEqual(100000);
        uploads.push(new Uint8Array(await file.arrayBuffer()));
        profile.avatar = { preset: 'initials', url: '/avatars/user?v=photo' };
      }
      return route.fulfill({ json: profile });
    }
    return route.fulfill({ json: [] });
  });
  await page.route('**/avatars/**', (route) => route.fulfill({ status: 404, body: 'Not found' }));
  return {
    uploads,
    getProfile: () => profile,
    setFailUpload: (value: boolean) => {
      failUpload = value;
    },
  };
}

test('profile editing, keyboard presets and opt-in health sharing work on mobile', async ({
  page,
}, testInfo) => {
  const state = await setup(page);
  await page.setViewportSize({ width: 375, height: 850 });
  await page.goto('/account');
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Example Member');
  await expect(page.getByLabel('Show my conditions and symptom frequency')).not.toBeChecked();
  await page.getByLabel('Display name', { exact: true }).fill('Maltese Member');
  await page.getByLabel('Coeliac', { exact: true }).check();
  await page.getByLabel('Wheat allergy', { exact: true }).check();
  await page.getByLabel('How often do you notice symptoms').selectOption('Sometimes');
  await page.getByRole('button', { name: 'Use leaf avatar' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Use leaf avatar' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Saving an avatar must not discard the other unsaved profile edits.
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Maltese Member');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible();
  expect(state.getProfile()).toMatchObject({
    name: 'Maltese Member',
    conditions: ['Coeliac', 'Wheat allergy'],
    symptoms: 'Sometimes',
    share_health: false,
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page
    .locator('.profile-editor')
    .screenshot({ path: testInfo.outputPath('profile-editor-mobile.png') });
  await page.getByRole('link', { name: 'View your public profile' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Maltese Member');
  await expect(page.getByText('Wheat allergy', { exact: true })).toHaveCount(0);
  await expect(page.locator('.public-profile')).not.toContainText('private@example.test');
  await page.goto('/account');
  await page.getByLabel('Show my conditions and symptom frequency').check();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'View your public profile' }).click();
  await expect(page.getByText('Wheat allergy', { exact: true })).toBeVisible();
  await expect(page.getByText('Sometimes', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('public-profile-mobile.png'), fullPage: true });
  await page.goto('/account');
  await page.getByLabel('Show my conditions and symptom frequency').uncheck();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByText('Profile saved.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'View your public profile' }).click();
  await expect(page.getByText('Wheat allergy', { exact: true })).toHaveCount(0);
});

test('photo crop, upload errors, initials fallback and removal', async ({ page }, testInfo) => {
  const state = await setup(page);
  await page.goto('/account');
  const input = page.getByLabel('Or choose a photo');
  await input.setInputFiles({ name: 'bad.gif', mimeType: 'image/gif', buffer: Buffer.from('bad') });
  await expect(page.getByText('Choose a JPEG, PNG, or WebP photo.', { exact: true })).toBeVisible();
  const source = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 400;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'red';
    ctx.fillRect(0, 0, 400, 400);
    ctx.fillStyle = 'blue';
    ctx.fillRect(400, 0, 400, 400);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await input.setInputFiles({
    name: 'portrait.png',
    mimeType: 'image/png',
    buffer: Buffer.from(source, 'base64'),
  });
  await expect(page.getByRole('img', { name: 'Square avatar preview' })).toBeVisible();
  await page.getByLabel('Horizontal position').fill('100');
  await page.getByLabel('Zoom', { exact: true }).fill('2');
  state.setFailUpload(true);
  await page.getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(page.getByText('Upload unavailable. Please try again.')).toBeVisible();
  expect(state.getProfile().avatar.url).toBe(null);
  state.setFailUpload(false);
  await page.getByRole('button', { name: 'Save photo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();
  const decoded = jpeg.decode(state.uploads[0]);
  expect([decoded.width, decoded.height]).toEqual([200, 200]);
  expect(decoded.data[2]).toBeGreaterThan(200);
  expect(decoded.data[0]).toBeLessThan(30);
  await expect(page.locator('.profile-heading .profile-avatar')).toHaveText('EM');
  await page
    .locator('.profile-editor')
    .screenshot({ path: testInfo.outputPath('profile-editor-desktop.png') });
  await page.getByRole('button', { name: 'Remove photo' }).click();
  await expect(page.getByRole('button', { name: 'Use initials' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('avatar processing handles supported formats, strips metadata and bounds dimensions', async ({
  page,
}) => {
  await setup(page);
  await page.goto('/account');
  const results = await page.evaluate(async () => {
    const path = '/src/client/avatar-processing.ts';
    const { prepareAvatar } = await import(/* @vite-ignore */ path);
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 400;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#345678';
    ctx.fillRect(0, 0, 800, 400);
    const results = [];
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      let source = await new Promise<Blob>((resolve) =>
        canvas.toBlob((blob) => resolve(blob!), type),
      );
      if (type === 'image/jpeg') {
        const bytes = new Uint8Array(await source.arrayBuffer());
        const comment = new TextEncoder().encode('private-avatar-metadata');
        source = new Blob(
          [
            bytes.slice(0, 2),
            new Uint8Array([255, 254, 0, comment.length + 2]),
            comment,
            bytes.slice(2),
          ],
          { type },
        );
      }
      const bitmap = await createImageBitmap(source);
      const output: Blob = await prepareAvatar(bitmap, { x: 50, y: 50, zoom: 1 });
      bitmap.close();
      const decoded = await createImageBitmap(output);
      results.push({
        type: output.type,
        size: output.size,
        width: decoded.width,
        height: decoded.height,
        metadata: (await output.text()).includes('private-avatar-metadata'),
      });
      decoded.close();
    }
    return results;
  });
  for (const result of results) {
    expect(result.type).toBe('image/jpeg');
    expect(result.size).toBeLessThanOrEqual(100000);
    expect([result.width, result.height]).toEqual([256, 256]);
    expect(result.metadata).toBe(false);
  }
});
