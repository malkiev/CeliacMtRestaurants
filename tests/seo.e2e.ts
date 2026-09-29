import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { createServer } from 'vite';
import type { Bindings } from '../src/server/env';
import { testDatabase } from './sqlite';

test('server-rendered SEO survives hydration and mobile filtering', async ({ page }) => {
  const database = testDatabase();
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { default: worker } = await vite.ssrLoadModule('/src/server/index.tsx');
    database.sqlite.exec(`INSERT INTO places(id,slug,name,island,business_types,published)
      VALUES('one','cafe','Example cafe','Malta','["Cafe"]',1);`);
    const template = await vite.transformIndexHtml('/', readFileSync('index.html', 'utf8'));
    const env = {
      DB: database.db,
      APP_URL: 'https://coeliac.mt,https://glutenfree.mt',
      ENVIRONMENT: 'production',
      ASSETS: { fetch: async () => new Response(template) },
    } as unknown as Bindings;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      // Development HMR and external fonts can be unavailable in isolated browsers.
      // Still fail on React hydration diagnostics as well as all uncaught page errors.
      if (
        message.type() === 'error' &&
        /hydration|hydrated|didn't match|does not match/i.test(message.text())
      )
        errors.push(message.text());
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/me', (route) => route.fulfill({ json: null }));
    await page.route('**/sw.js', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: '' }),
    );
    await page.route('**/*', async (route) => {
      if (!route.request().isNavigationRequest()) return route.fallback();
      const url = new URL(route.request().url());
      const response = await worker.fetch(
        new Request('https://glutenfree.mt' + url.pathname + url.search),
        env,
      );
      await route.fulfill({
        status: response.status,
        contentType: 'text/html',
        body: await response.text(),
      });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Example cafe' })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://coeliac.mt/',
    );
    await page.getByRole('textbox', { name: 'Search places' }).fill('No matching place');
    await expect(page.getByText('No places found this time')).toBeVisible();
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Example cafe' })).toBeVisible();
    await page.getByRole('heading', { name: 'Example cafe' }).click();
    await expect(page).toHaveURL(/\/places\/cafe$/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://coeliac.mt/places/cafe',
    );
    await expect(page).toHaveTitle('Example cafe in Malta — Coeliac.mt');
    expect(errors).toEqual([]);
  } finally {
    await vite.close();
    database.sqlite.close();
  }
});
