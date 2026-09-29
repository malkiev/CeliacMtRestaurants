import type { Bindings } from './env';

// The first URL is the canonical address; every entry is an explicit trusted origin.
export function appUrls(env: Pick<Bindings, 'APP_URL'>): string[] {
  const urls = env.APP_URL.split(',').map((entry) => {
    const url = new URL(entry.trim());
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      /[*?]/.test(url.hostname)
    )
      throw new Error('APP_URL must contain comma-separated HTTP(S) origins');
    return url.origin;
  });
  return [...new Set(urls)];
}

export function requestAppUrl(env: Pick<Bindings, 'APP_URL'>, requestUrl?: string): string {
  const urls = appUrls(env);
  const origin = requestUrl ? new URL(requestUrl).origin : undefined;
  // Retain the primary URL for local development proxies and internal API calls.
  // Never build authentication links from an unlisted request host or forwarded header.
  return origin && urls.includes(origin) ? origin : urls[0];
}
