# Security review — 2 October 2026

## Remediation status

All three findings below are fixed in the working tree, pending deployment. Public feedback responses now omit source references while retaining database provenance. Anonymous photo access requires both an approved photo and a published place; existing author, moderator and admin access is preserved. Photo denials also use `Cache-Control: no-store`.

Wrangler is pinned to 4.146.0 with matching Cloudflare Worker type definitions and a regenerated lockfile. The updated dependency audit reports zero vulnerabilities. Regression coverage checks public API and rendered HTML privacy, plus original/thumbnail access across publication states, moderation states and viewer roles. Admin contributions continue to bypass review as intended.

Validation passed: 127 behavioural tests, TypeScript checks, production build, Wrangler deployment dry run, dependency-tree checks and `git diff --check`. Browser tests were not rerun because there are no UI changes. The production build retains its existing large-chunk warning for MapLibre.

No schema migration, new service or hosting-cost change is required. These fixes do not remove copies of information previously downloaded by visitors. Additional hardening and account-level checks listed below remain follow-up work outside the three findings.

## Scope and validation

Reviewed repository application code, authentication configuration, public data projections, moderation, photo/profile handling, service worker, migrations, deployment configuration and dependency advisories. No production data was changed, and no live exploitation, load testing, or Cloudflare account configuration inspection was performed. Findings describe the checked-out code; deployed behaviour may differ.

The initial review passed 124 tests across 12 files. Three temporary isolated SQLite checks confirmed the two application findings below and the intended admin publication bypass; the temporary file was removed after review. The project owner confirmed that admin contributions should bypass review, so that behaviour is not classified as a security finding. Authentication and object storage were not exercised against live services. The findings below describe the pre-fix code.

## Findings

### 1. Medium: private import provenance is returned publicly

**Location:** `src/server/db.ts:53` and `src/server/db.ts:89`.

The public feedback query selects `source_ref`. The identity projection removes only `author_id`, leaving `source_ref` in the response. It reaches unauthenticated `/api/places/:slug` responses and place-page bootstrap data, including initial HTML. Hiding the source link in the UI does not remove the data.

This conflicts with `data/README.md`, which requires source references to remain private. Actual exposure depends on which source references have been imported; this review did not inspect private exports or production records. A source reference can reveal an internal document identifier or link, though disclosure does not itself bypass the source document's access controls.

**Reproduction:** Insert a published place and visible imported feedback with a synthetic private source marker. Calling `getDetail` returns that marker in JSON.

**Fix:** Use an explicit public feedback projection that omits provenance. Preserve the stored reference for authorised administrative use. Add tests covering both JSON and server-rendered bootstrap data.

### 2. Medium: approved photos remain accessible after their place is unpublished

**Location:** `src/server/photos.ts:52`.

The photo handler checks the photo's approval status but never checks its parent place's publication status. Anyone retaining a photo URL can retrieve an approved photo even when its place is no longer publicly accessible. IDs need not be guessed: previously published gallery links provide them.

**Reproduction:** An unpublished place returns no public detail, but its approved photo returns HTTP 200 to an unauthenticated request using a stub object store.

**Fix:** Join the parent place and require both an approved photo and a published place for anonymous access. Preserve explicit author/moderator access where needed and test original and thumbnail requests.

### 3. High advisory severity, development tooling: vulnerable Wrangler dependency chain

**Location:** `package.json`, `package-lock.json`.

The online `npm audit --json` result identified four high-severity affected package entries: `wrangler`, `miniflare`, `sharp`, and `undici`. These entries include transitive propagation, rather than four independent application exploits. The reported vulnerabilities sit in the Wrangler development-tool chain; applicability depends on which affected features local tooling or CI exercises. No exploitation of the deployed Worker was established.

The registry reported Wrangler **4.146.0** as an available non-major upgrade resolving the affected chain. Upgrade deliberately, regenerate the lockfile, rerun the audit and application checks, and validate a Wrangler deployment dry run before deployment.

Examples of reported advisories: [sharp/libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), [Undici WebSocket denial of service](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5), and [Undici BalancedPool TLS validation](https://github.com/advisories/GHSA-w293-vg96-wgc3).

## Additional hardening and deployment checks

- Configure Better Auth's trusted client-IP source explicitly for Cloudflare. The installed version defaults to `X-Forwarded-For`; without trusted proxies it rejects multi-address chains and uses a shared fallback rate-limit bucket. Cloudflare can append to an existing chain, so proxied visitors can share a login throttle. Prefer an appropriate trusted `CF-Connecting-IP` configuration for the actual ingress path and verify it on deployment. This is a configuration concern, not a demonstrated rate-limit bypass. See [Cloudflare's header documentation](https://developers.cloudflare.com/fundamentals/reference/http-headers/).
- No Content Security Policy is emitted by the application. Add a policy compatible with the bootstrap script and map assets, preferably testing in report-only mode first. No XSS exploit was demonstrated.
- Confirm the R2 bucket has no separate public access route bypassing application photo permissions, the browser-visible map key has suitable restrictions, and production HTTPS/HSTS and edge abuse controls are configured. These account-level settings were outside this review.

## Protections observed

The inspected routes enforce backend roles for admin controls, including CAM verification. Writes require an explicitly allowed origin. Queries bind user-supplied values, dynamic SQL identifiers are constrained, profile health details are omitted when sharing is disabled, API responses use `no-store`, and uploaded photos are decoded and re-encoded on the server. These controls reduce risk but do not constitute a complete security guarantee.
