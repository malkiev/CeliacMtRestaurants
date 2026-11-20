// Start in report-only mode until production maps, sign-in and PWA flows are checked.
// Hash only application-generated inline scripts; never allow arbitrary inline JavaScript.
export async function contentSecurityPolicy(inlineScripts: string[]): Promise<string> {
  const hashes = await Promise.all(
    inlineScripts.map(async (script) => {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script));
      return `'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`;
    }),
  );
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://api.maptiler.com",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');
}
