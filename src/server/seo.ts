import type { Bootstrap } from '../shared/types';
import type { Bindings } from './env';
import { appUrls } from './app-urls';

const pages: Record<string, [string, string]> = {
  '/': [
    'Coeliac-friendly restaurants in Malta & Gozo',
    'Find coeliac-friendly restaurants and gluten-free places to eat in Malta and Gozo, with experiences shared by the coeliac community.',
  ],
  '/shops': [
    'Gluten-free shops and suppliers in Malta & Gozo',
    'Discover shops and suppliers offering gluten-free food in Malta and Gozo, with information shared by the coeliac community.',
  ],
  '/links': [
    'Useful links for the coeliac community',
    'Find local support organisations and useful resources for the coeliac community in Malta and Gozo.',
  ],
  '/about': [
    'About our community',
    'Meet Coeliac.mt, an independent community directory for finding places to eat, shop and order food in Malta and Gozo.',
  ],
  '/privacy': [
    'Privacy and community guidelines',
    'Read how Coeliac.mt handles accounts, contributions, photos and privacy, and how community moderation works.',
  ],
  '/map': [
    'Map of places in Malta & Gozo',
    'Explore the community directory on a map of Malta and Gozo.',
  ],
  '/account': ['Your account', 'Sign in to manage your Coeliac.mt account and contributions.'],
  '/suggest': ['Suggest a place', 'Share a place with the coeliac community in Malta and Gozo.'],
  '/admin': ['Administration', 'Manage the Coeliac.mt directory.'],
  '/moderation': ['Moderation', 'Review community contributions to Coeliac.mt.'],
};

export const sitemapPages = ['/', '/shops', '/links', '/about', '/privacy'];

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!,
  );
}

export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function isIndexableHost(env: Bindings, url: URL): boolean {
  return env.ENVIRONMENT === 'production' && appUrls(env).includes(url.origin);
}

export function pageSeo(env: Bindings, url: URL, initial: Bootstrap) {
  const origin = appUrls(env)[0];
  const path = url.pathname;
  const directory = ['/', '/restaurants', '/shops'].includes(path);
  const canonicalPath = directory
    ? path === '/shops' || url.searchParams.get('category') === 'shops'
      ? '/shops'
      : '/'
    : path;
  const place = path.startsWith('/places/') ? initial.detail?.place : undefined;
  const profile = path.startsWith('/users/') ? initial.profile : undefined;
  const exists = directory || Object.hasOwn(pages, path) || !!place || !!profile;
  const noindex =
    !exists || !isIndexableHost(env, url) || !(sitemapPages.includes(canonicalPath) || place);
  const canonical = origin + (place ? '/places/' + encodeURIComponent(place.slug) : canonicalPath);
  let [title, description] = pages[canonicalPath] || [
    'Page not found',
    'This page could not be found in the Coeliac.mt directory.',
  ];
  if (place) {
    const location = [place.locality, place.island].filter(Boolean).join(', ');
    title = `${place.name}${location ? ' in ' + location : ''}`;
    description = (place.short_description || place.description || '').replace(/\s+/g, ' ').trim();
    if (!description)
      description = `Explore ${place.name}${location ? ' in ' + location : ''} in the Coeliac.mt directory, with business details and community feedback.`;
  } else if (profile) {
    title = `${profile.name}'s profile`;
    description = 'Public community profile on Coeliac.mt.';
  }
  description = description.length > 160 ? description.slice(0, 157).trimEnd() + '…' : description;
  title += ' — Coeliac.mt';
  const photo = place?.photo;
  const image = origin + (photo ? '/photos/' + encodeURIComponent(photo) : '/icon-512.png');
  const imageAlt = photo ? `${place.name} — community photo` : 'Coeliac.mt';
  const structured =
    !noindex && place
      ? {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: title,
          url: canonical,
          about: { '@type': 'Thing', name: place.name, url: canonical },
        }
      : !noindex && canonicalPath === '/'
        ? {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Coeliac.mt',
            url: origin + '/',
          }
        : null;
  const meta = (name: string, content: string, property = false) =>
    `<meta ${property ? 'property' : 'name'}="${name}" content="${escapeHtml(content)}" />`;
  const head = [
    `<title>${escapeHtml(title)}</title>`,
    meta('description', description),
    ...(exists ? [`<link rel="canonical" href="${escapeHtml(canonical)}" />`] : []),
    meta('robots', noindex ? 'noindex, follow' : 'index, follow'),
    meta('og:type', 'website', true),
    meta('og:site_name', 'Coeliac.mt', true),
    meta('og:locale', 'en_GB', true),
    meta('og:title', title, true),
    meta('og:description', description, true),
    meta('og:url', canonical, true),
    meta('og:image', image, true),
    meta('og:image:alt', imageAlt, true),
    meta('twitter:card', photo ? 'summary_large_image' : 'summary'),
    meta('twitter:title', title),
    meta('twitter:description', description),
    meta('twitter:image', image),
    meta('twitter:image:alt', imageAlt),
    ...(structured
      ? [`<script type="application/ld+json">${scriptJson(structured)}</script>`]
      : []),
  ].join('\n');
  return { head, noindex, status: exists ? (200 as const) : (404 as const) };
}

export function injectSeo(template: string, head: string): string {
  return template
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\b[^>]*\bname=["']description["'][^>]*>/gi, '')
    .replace('</head>', () => head + '\n</head>');
}
