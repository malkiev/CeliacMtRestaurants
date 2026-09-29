import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { bodyLimit } from 'hono/body-limit';
import { ZodError } from 'zod';
import { renderToString } from 'react-dom/server';
import { App } from '../client/App';
import type { AppEnv, Bindings } from './env';
import { api } from './api';
import { appUrls } from './app-urls';
import { bootstrap } from './db';
import { cleanup, photoResponse, registerPhotos } from './photos';
import { avatarResponse } from './profiles';
import { escapeHtml, injectSeo, isIndexableHost, pageSeo, scriptJson, sitemapPages } from './seo';

const app = new Hono<AppEnv>();
app.use(
  '*',
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: (c) => c.json({ error: 'Request is too large' }, 413),
  }),
);
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'DENY');
  c.header('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
});
registerPhotos(api);
app.route('/api', api);
app.get('/photos/:id', (c) => photoResponse(c.env, c.req.raw, c.req.param('id')));
app.get('/avatars/:id', (c) => avatarResponse(c.env, c.req.param('id')));
app.get('/robots.txt', (c) =>
  c.text(
    'User-agent: *\nDisallow: /api/\n' +
      (isIndexableHost(c.env, new URL(c.req.url))
        ? `Sitemap: ${appUrls(c.env)[0]}/sitemap.xml\n`
        : ''),
  ),
);
app.get('/sitemap.xml', async (c) => {
  const indexable = isIndexableHost(c.env, new URL(c.req.url));
  const rows = indexable
    ? await c.env.DB.prepare('SELECT slug FROM places WHERE published=1 ORDER BY slug').all<{
        slug: string;
      }>()
    : { results: [] };
  const paths = indexable
    ? [...sitemapPages, ...rows.results.map((p) => '/places/' + encodeURIComponent(p.slug))]
    : [];
  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${escapeHtml(appUrls(c.env)[0] + p)}</loc></url>`).join('')}</urlset>`,
    200,
    { 'Content-Type': 'application/xml' },
  );
});
app.get('*', async (c) => {
  const path = new URL(c.req.url).pathname;
  if (
    path.startsWith('/assets/') ||
    [
      '/sw.js',
      '/manifest.webmanifest',
      '/icon.svg',
      '/icon-192.png',
      '/icon-512.png',
      '/offline.html',
    ].includes(path)
  )
    return c.env.ASSETS.fetch(c.req.raw);
  const initial = await bootstrap(c.env, c.req.url);
  const template = await c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
  if (!template.ok) return c.text('Run npm run build before starting the production preview.', 503);
  const seo = pageSeo(c.env, new URL(c.req.url), initial);
  const markup = renderToString(
    <App initial={initial} path={path} search={new URL(c.req.url).search} />,
  );
  const json = scriptJson(initial);
  const html = injectSeo(await template.text(), seo.head)
    .replace('<!--app-->', () => markup)
    .replace('<!--bootstrap-->', () => `<script>window.__BOOTSTRAP__=${json}</script>`);
  c.header('Cache-Control', 'no-store');
  if (seo.noindex) c.header('X-Robots-Tag', 'noindex, follow');
  return c.html(html, seo.status);
});
app.onError((err, c) => {
  if (err instanceof ZodError)
    return c.json(
      { error: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
      400,
    );
  if (err instanceof HTTPException)
    return c.json({ error: err.message || 'Request not allowed' }, err.status);
  console.error('Request failed:', err instanceof Error ? err.message : 'Unknown error');
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
});
export default {
  fetch: app.fetch,
  scheduled: (_event: ScheduledController, env: Bindings, ctx: ExecutionContext) =>
    ctx.waitUntil(cleanup(env)),
};
