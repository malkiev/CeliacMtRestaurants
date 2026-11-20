import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, test } from 'vitest';
import worker from '../src/server/index';
import type { Bindings } from '../src/server/env';
import { testDatabase } from './sqlite';
import { PREPARATION_FACILITIES } from '../src/shared/place-options';

let database: ReturnType<typeof testDatabase>;
let env: Bindings;
beforeEach(() => {
  database = testDatabase();
  database.sqlite.exec(`
    INSERT INTO places(id,slug,name,island,locality,published) VALUES('one','cafe','Café Għażiż','Malta','Ħaż-Żebbuġ',1);
    INSERT INTO places(id,slug,name,island,published) VALUES('hidden','hidden','Unpublished business','Gozo',0);
    INSERT INTO user(id,name,email,createdAt,updatedAt) VALUES('member','Member','private@example.test',0,0);
    INSERT INTO profiles(user_id,role) VALUES('member','member');
  `);
  env = {
    DB: database.db,
    APP_URL: 'https://coeliac.mt,https://glutenfree.mt',
    ENVIRONMENT: 'production',
    ASSETS: {
      fetch: async (request: Request) =>
        new Response(
          readFileSync(
            new URL(request.url).pathname === '/offline.html'
              ? 'public/offline.html'
              : 'index.html',
            'utf8',
          ),
          { headers: { 'Content-Type': 'text/html' } },
        ),
    },
  } as unknown as Bindings;
});
afterEach(() => database.sqlite.close());
const fetchPage = (path: string, host = 'coeliac.mt') =>
  worker.fetch(new Request(`https://${host}${path}`), env);
const headOf = (html: string) => html.split('</head>')[0];

test('preparation facilities show only affirmative values, independently of CAM', async () => {
  expect(await (await fetchPage('/places/cafe')).text()).not.toContain('aria-label="Preparation facilities"');
  for (const {key, label} of PREPARATION_FACILITIES) {
    database.sqlite.prepare(`UPDATE places SET ${key}='yes' WHERE id='one'`).run();
    expect(await (await fetchPage('/places/cafe')).text()).toContain(`<li>${label}</li>`);
    database.sqlite.prepare(`UPDATE places SET ${key}='no' WHERE id='one'`).run();
    expect(await (await fetchPage('/places/cafe')).text()).not.toContain('aria-label="Preparation facilities"');
  }
  database.sqlite.exec("UPDATE places SET dedicated_gluten_free_kitchen='yes',dedicated_gluten_free_utensils='yes' WHERE id='one'");
  const html = await (await fetchPage('/places/cafe')).text();
  expect(html).toContain('<li>Dedicated gluten-free kitchen</li>');
  expect(html).toContain('<li>Dedicated gluten-free utensils</li>');
  expect(html).not.toContain('<li>Dedicated gluten-free fryer</li>');
  expect(html).not.toContain('Verified by CAM');
});

test('owner messages are labelled, escaped and separate from directory descriptions', async () => {
  database.sqlite.prepare("UPDATE places SET business_types='[\"Cafe\"]',short_description=?,description=? WHERE id=?")
    .run('Welcome <guests>!\nMeet our team.', 'An independent introduction.', 'one');
  const html = await (await fetchPage('/places/cafe')).text();
  expect(html).toContain('A word from the team');
  expect(html).toContain('Welcome &lt;guests&gt;!\nMeet our team.');
  expect(html.indexOf('id="owner-message-heading"')).toBeLessThan(html.indexOf('Gluten-free items available'));
  expect(headOf(html)).toContain('content="An independent introduction."');
  const grid = await (await fetchPage('/')).text();
  expect(grid).toContain('From the team');
  database.sqlite.prepare("UPDATE places SET description='' WHERE id='one'").run();
  expect(headOf(await (await fetchPage('/places/cafe')).text())).toContain('Welcome &lt;guests&gt;! Meet our team.');
  database.sqlite.prepare("UPDATE places SET short_description='',description='General description' WHERE id='one'").run();
  expect(await (await fetchPage('/places/cafe')).text()).not.toContain('A word from the team');
  const fallback = await (await fetchPage('/')).text();
  expect(fallback).toContain('General description');
  expect(fallback).not.toContain('From the team');
});

test('report-only CSP authorises precisely the rendered inline scripts', async () => {
  const response = await fetchPage('/places/cafe');
  const policy = response.headers.get('Content-Security-Policy-Report-Only')!;
  expect(response.headers.get('Content-Security-Policy')).toBeNull();
  const html = await response.text();
  const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>(.*?)<\/script>/g)]
    .filter(([tag]) => !tag.includes('src='))
    .map(([, body]) => body);
  expect(inlineScripts.length).toBeGreaterThanOrEqual(2);
  for (const body of inlineScripts)
    expect(policy).toContain(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("base-uri 'none'");
  expect(policy).toContain("worker-src 'self'");
  expect(policy.split('; ').find((directive) => directive.startsWith('script-src'))).not.toContain(
    'unsafe-inline',
  );
  expect(policy).not.toContain(createHash('sha256').update('alert(1)').digest('base64'));
});

test('HSTS is restricted to configured production HTTPS origins', async () => {
  expect((await fetchPage('/')).headers.get('Strict-Transport-Security')).toBe('max-age=86400');
  expect((await fetchPage('/', 'glutenfree.mt')).headers.get('Strict-Transport-Security')).toBe(
    'max-age=86400',
  );
  expect(
    (await fetchPage('/', 'preview.example.test')).headers.has('Strict-Transport-Security'),
  ).toBe(false);
  expect(
    (await worker.fetch(new Request('http://coeliac.mt/'), env)).headers.has(
      'Strict-Transport-Security',
    ),
  ).toBe(false);
  env.ENVIRONMENT = 'development';
  const local = await fetchPage('/');
  expect(local.headers.has('Strict-Transport-Security')).toBe(false);
  expect(local.headers.has('Content-Security-Policy-Report-Only')).toBe(false);
});

test('oversized rejected requests still receive security headers', async () => {
  const response = await worker.fetch(
    new Request('https://coeliac.mt/api/submissions', {
      method: 'POST',
      headers: { Origin: 'https://coeliac.mt' },
      body: 'x'.repeat(1024 * 1024 + 1),
    }),
    env,
  );
  expect(response.status).toBe(413);
  expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=86400');
});

test('private feedback provenance stays stored but never reaches public JSON or HTML', async () => {
  database.sqlite.exec(`
    INSERT INTO feedback(id,place_id,kind,body,source_ref)
      VALUES('imported','one','imported','Imported public feedback','private-source-marker');
  `);
  for (const path of ['/api/places/cafe', '/api/bootstrap?path=/places/cafe', '/places/cafe']) {
    const response = await fetchPage(path);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('Imported public feedback');
    expect(body).not.toContain('private-source-marker');
    expect(body).not.toContain('source_ref');
  }
  expect(
    database.sqlite.prepare("SELECT source_ref FROM feedback WHERE id='imported'").get(),
  ).toMatchObject({ source_ref: 'private-source-marker' });
});

test.each(['coeliac.mt', 'glutenfree.mt'])(
  'serves initial metadata on %s with the same canonical origin',
  async (host) => {
    const response = await fetchPage('/places/cafe?utm_source=test', host);
    expect(response.status).toBe(200);
    const head = headOf(await response.text());
    expect(head).toContain('<title>Café Għażiż in Ħaż-Żebbuġ, Malta — Coeliac.mt</title>');
    expect(head).toContain('href="https://coeliac.mt/places/cafe"');
    expect(head).toContain('content="https://coeliac.mt/icon-512.png"');
    expect(head).toContain('name="twitter:card" content="summary"');
    expect(head).not.toContain('utm_source');
    expect(head.match(/name="description"/g)).toHaveLength(1);
    expect(head.match(/<title>/g)).toHaveLength(1);
    const structured = JSON.parse(head.match(/application\/ld\+json">(.*?)<\/script>/)![1]);
    expect(structured).toMatchObject({
      '@type': 'WebPage',
      about: { name: 'Café Għażiż', url: 'https://coeliac.mt/places/cafe' },
    });
    expect(structured).not.toHaveProperty('aggregateRating');
  },
);

test.each([
  ['/', '/'],
  ['/restaurants?q=pizza&locality=Sliema', '/'],
  ['/shops?island=Gozo', '/shops'],
  ['/?category=shops&q=bread', '/shops'],
  ['/links', '/links'],
  ['/about', '/about'],
  ['/privacy', '/privacy'],
])('canonicalises %s to %s', async (path, canonical) => {
  const head = headOf(await (await fetchPage(path)).text());
  expect(head).toContain(`rel="canonical" href="https://coeliac.mt${canonical}"`);
  expect(head).toContain('name="robots" content="index, follow"');
});

test.each([
  '/account',
  '/admin',
  '/moderation',
  '/suggest',
  '/map',
  '/users/member',
  '/offline.html',
])('excludes %s from search', async (path) => {
  const response = await fetchPage(path);
  expect(response.status).toBe(200);
  expect(headOf(await response.text())).toContain('name="robots" content="noindex, follow"');
});

test.each(['/missing', '/places/missing', '/places/hidden', '/users/missing'])(
  'returns a real 404 for %s',
  async (path) => {
    const response = await fetchPage(path);
    expect(response.status).toBe(404);
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
    const html = await response.text();
    expect(html).not.toContain('Unpublished business');
    expect(headOf(html)).not.toContain('rel="canonical"');
  },
);

test('sitemap and robots advertise only canonical public URLs', async () => {
  const response = await fetchPage('/sitemap.xml', 'glutenfree.mt');
  expect(response.headers.get('Content-Type')).toContain('application/xml');
  const xml = await response.text();
  expect([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1])).toEqual([
    'https://coeliac.mt/',
    'https://coeliac.mt/shops',
    'https://coeliac.mt/links',
    'https://coeliac.mt/about',
    'https://coeliac.mt/privacy',
    'https://coeliac.mt/places/cafe',
  ]);
  const robots = await (await fetchPage('/robots.txt')).text();
  expect(robots).toContain('Sitemap: https://coeliac.mt/sitemap.xml');
  expect(robots).toContain('Disallow: /api/');
  expect(robots).not.toContain('Disallow: /account');
});

test('staging and unlisted hosts cannot advertise indexable HTML or sitemap entries', async () => {
  for (const [environment, host] of [
    ['staging', 'coeliac.mt'],
    ['production', 'preview.example.test'],
  ]) {
    env.ENVIRONMENT = environment;
    const response = await fetchPage('/', host);
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(headOf(await response.text())).not.toContain('application/ld+json');
    expect(await (await fetchPage('/sitemap.xml', host)).text()).not.toContain('<loc>');
    expect(await (await fetchPage('/robots.txt', host)).text()).not.toContain('Sitemap:');
  }
});

test('metadata, structured data and bootstrap preserve literal content without injecting HTML', async () => {
  const name = 'Għażiż " & </script><script>alert(1)</script> $&';
  database.sqlite
    .prepare('UPDATE places SET name=?,description=? WHERE id=?')
    .run(name, 'A real description $& with <tags> & quotes "', 'one');
  const html = await (await fetchPage('/places/cafe')).text();
  const head = headOf(html);
  expect(head).not.toContain('<script>alert(1)</script>');
  expect(head).toContain('&lt;tags&gt; &amp; quotes &quot;');
  expect(JSON.parse(head.match(/application\/ld\+json">(.*?)<\/script>/)![1]).about.name).toBe(
    name,
  );
  expect(
    JSON.parse(html.match(/window\.__BOOTSTRAP__=(.*?)<\/script>/)![1]).detail.place.name,
  ).toBe(name);
  expect(html).toContain('$&amp;');
});

test('only an approved photo is selected for sharing', async () => {
  database.sqlite.exec(
    `INSERT INTO photos(id,place_id,object_key,thumb_key,caption,status) VALUES('pending','one','pending.jpg','pending-thumb.jpg','Community photo','pending');`,
  );
  expect(headOf(await (await fetchPage('/places/cafe')).text())).toContain(
    'content="https://coeliac.mt/icon-512.png"',
  );
  database.sqlite.exec("UPDATE photos SET status='approved' WHERE id='pending'");
  const head = headOf(await (await fetchPage('/places/cafe')).text());
  expect(head).toContain('property="og:image" content="https://coeliac.mt/photos/pending"');
  expect(head).toContain('name="twitter:card" content="summary_large_image"');
});
