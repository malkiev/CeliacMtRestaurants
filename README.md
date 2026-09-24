# glutenfree.mt

An independent community directory for Malta and Gozo. The chosen brand and public domain are **glutenfree.mt**, with production URL `https://glutenfree.mt`. The implementation uses React and Vite for the client, Hono on Cloudflare Workers, D1 for records, R2 for photos, and Better Auth for email links and Google sign-in. Product decisions and launch scope remain in [PLAN.md](PLAN.md).

Production deployment, required accounts, authentication configuration, and recovery steps are in [DEPLOYMENT.md](DEPLOYMENT.md). Staging is deferred for the early launch.

## GitHub Actions

[CI and production](.github/workflows/ci.yml) runs on PRs targeting `main` when opened, updated, reopened, or marked ready for review. It runs `npm ci`, type-checking, behavioural tests, a production build, Playwright browser tests, and a Wrangler deployment dry run. PRs do not deploy or receive Cloudflare credentials. Failed browser runs upload screenshots for seven days.

Pushes and merges to `main` run the same checks, then apply pending production D1 migrations and deploy the Worker and assets. Deployment runs are serialized and are not cancelled midway. The Actions **Run workflow** button also supports a manual deployment from `main`; other branches run checks only.

Before the first deployment, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in GitHub's **Settings > Secrets and variables > Actions**. See [the production setup instructions](DEPLOYMENT.md#github-actions-production-deployment) for token permissions and configuration. The workflow does not require staging.

## Local setup

On Windows, double-click [launch.cmd](launch.cmd) to prepare and launch the local website in your default browser. It uses the workspace's portable Node installation when available, installs dependencies if missing, builds the client, and runs local setup (pending migrations and seed import). Existing records and local settings are preserved. Keep the terminal window open while using the site; press Ctrl+C to stop it. The first run needs internet access if dependencies are missing. If startup fails, the window stays open to show the error.

Use Node.js 22.12 or newer and npm. Install the versions in the committed lockfile:

On this Windows workspace, an existing portable Node installation can be added to the current PowerShell session if Node is absent from PATH:

```powershell
$env:PATH = "$PWD\.tools\node-v22.22.0-win-x64;$env:PATH"
```

```sh
npm.cmd ci
npm.cmd run build
npm.cmd run setup
npm.cmd run dev
```

Open http://127.0.0.1:5173. Vite proxies API and photo requests to Wrangler on port 8787. The build creates the assets directory Wrangler requires. Setup creates a random local authentication secret in ignored `.dev.vars`, applies local migrations, and imports the checked-in business-only seed. Community feedback is excluded from the public repository and must be imported separately from a reviewed private source. It preserves existing settings and does not update remote resources. See [data/README.md](data/README.md) for source limitations.



Sign in through Account using an email link from its Development inbox. To bootstrap the first local admin, obtain your user ID from `/api/me` after signing in, then run:

```sh
npm run admin -- --local <user-id>
```

Check that the output reports `role=admin`, then refresh the app. The command requires an existing verified user and refuses to grant a second admin while one exists. Further roles are assigned through the admin interface. This command only supports local D1.

## Commands and checks

| Command                                   | Purpose                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `npm run dev`                             | Local Worker and Vite development servers                                          |
| `npm run build`                           | Build client assets into `dist/client`                                             |
| `npm run preview`                         | Serve the existing build with Wrangler; configure `APP_URL` for the preview origin |
| `npm run typecheck`                       | TypeScript static checks; no separate linter configured                            |
| `npm test`                                | Vitest behavioural tests in `tests/*.test.ts` and `tests/*.test.js`                |
| `npm run check`                           | Typecheck, tests, then build                                                       |
| `npm run db:migrate`                      | Apply migrations to local D1                                                       |
| `npm run import -- input.json output.sql` | Generate SQL and an import report without changing a database                      |
| `npm run format` / `npm run format:check` | Prettier formatting / inspection                                                   |
| `git diff --check`                        | Check tracked edits for whitespace errors                                          |

Tests execute migrations and application SQL against isolated in-memory SQLite databases using Node's `node:sqlite` module. They cover moderation permissions, review publication and averages, owner verification/revocation, completed decisions, import deduplication and provenance, and local admin bootstrap. They do not replace tests against the Worker runtime. `npm.cmd run test:e2e` runs Playwright UI checks in `tests/*.e2e.ts` against an isolated Vite server on port 5199 with mocked API responses. Windows uses installed Microsoft Edge; other platforms use Playwright Chromium (`npx playwright install chromium`). Browser screenshots are saved under ignored `test-results/`. These checks cover admin CAM controls, full-place editing, owner submissions, locality lists and responsive layout; backend behaviour is covered separately by the SQLite tests.

## Repository layout

- `src/client/`: screens, forms, map, styles, and client API calls.
- `src/server/`: Worker entry point, authentication, API permissions, moderation, database queries, and photos.
- `src/shared/`: domain helpers and shared types.
- `migrations/`: D1 schema and initial resource migrations.
- `scripts/`: local setup, admin bootstrap, and import preview generation.
- `tests/`: behavioural tests and a SQLite adapter for the D1 queries under test.
- `public/`: PWA manifest, service worker, offline page, and icon.
- `data/`: source mapping, seed SQL, and reconciliation report. Keep private exports in ignored `data/private/`.

## Configuration and pilot readiness

[.env.example](.env.example) lists supported settings. Local configuration lives in ignored `.dev.vars`. Google sign-in needs provider credentials; production email needs `RESEND_API_KEY` and `EMAIL_FROM`. Configure an appropriately licensed MapLibre style with `MAP_STYLE_URL` to enable maps.

Before deployment, provision D1 and R2, replace the placeholder database ID in `wrangler.jsonc`, set `APP_URL=https://glutenfree.mt` and connect the `glutenfree.mt` domain to the Worker, configure authentication secrets through Wrangler, and apply remote migrations deliberately. `npm run deploy` runs checks and publishes the Worker; local setup does not provision production. Hosting, storage, email, and map usage need an agreed budget and monitoring. This continuation adds no infrastructure or dependencies.

Remaining pilot validation includes real Google/email account linking and delivery, direct API permission checks (including admin-only CAM updates), iPhone/Android installation, denied geolocation, photo processing/rejection, offline behaviour, and backup/restore. Price thresholds and verification wording still need community agreement. Imported CAM flags remain private until an admin reviews them; imported feedback has no invented rating or author identity.

## Place cover photos

Admin contributions (photos, reviews, replies, new places, corrections, cover choices, and reports) take effect immediately and retain decision/audit history. Other contributors still require moderation. Ownership claims require an independent admin; owner-review restrictions and admin-only CAM controls still apply. This changes application behavior only and requires no migration or additional hosting services.

Photo uploads accept JPEG, PNG, or WebP originals up to 10 MB (10 × 1024 × 1024 bytes). Before uploading, the browser removes metadata and converts to JPEG with a longest side of at most 1,280 px and a maximum size of 800 KB (800,000 bytes). It reduces quality, then dimensions when necessary, stopping at a 400 px longest side; smaller originals are never enlarged. If processing cannot meet the limit, the form explains the problem.

Only processed JPEGs are uploaded. The Worker independently checks format, byte size and decoded dimensions, re-encodes the photo, and stores it with a thumbnail of at most 400 px in R2. Original source files are never stored. The form accepts up to five photos per submission; the server allows up to 20 photos per user per rolling 24 hours. Browser conversion and server validation need no Cloudflare Images subscription.

Verified owners can open their place and choose an approved gallery image under **Choose your place’s cover photo**. An independent moderator reviews the nomination; the previous cover remains public until approval. The chosen photo appears on both the directory card and place banner. Hidden or deleted photos fall back to another approved image. Owner access and photo eligibility are checked again when approving.

Migration `0003_place_covers.sql` adds the cover selection table. Apply it locally with `npm.cmd run db:migrate` (already applied in this workspace), and apply pending migrations to production before deploying. Existing accounts and photos are preserved. No additional hosting service is needed.

Photos currently use the separate **Add photos** form and appear in the place gallery after moderation; they are not attached to individual reviews.

Typography uses DM Sans with 16px main text and sidebar links, larger secondary labels, and reduced-motion support. Checks cover 320px, 375px, and desktop layouts; this is not a full accessibility audit.

## Place details and branches

In **Admin > Places**, choose a listing to edit all ordinary fields, or choose **Add place or branch**. Admin changes publish immediately, except edits to a business the admin represents, which require independent moderation. CAM confirmation and checked coordinates remain separate controls. An imported CAM flag preselects the confirmation checkbox but does not publish a badge until an admin saves it with a check note. Later saved decisions take precedence over imported flags.

Verified owners use **Edit place details** on their place page to submit descriptions, menu options and other updates for review. Each branch is a separate listing: use a shared business name to link branches and a distinct branch name/address to identify the location. Reviews, photos, owner access, prices and CAM verification remain branch-specific. Existing listings are not automatically split or grouped.

Locality choices depend on Malta or Gozo. The options follow the [Office of the Address Registrar list](https://address.gov.mt/localities/), using familiar display names and retaining existing directory areas. Known spelling aliases are normalised; unknown locations can be left blank. Menu checkboxes support a dedicated gluten-free menu, clearly marked gluten, items available gluten-free on request, or an exclusive unknown choice. Original menu notes and imported-feedback provenance remain stored; public feedback no longer displays source links.

Migration `0004_place_details.sql` adds descriptions, business/branch names and menu tags, and restores previously recorded coordinate checks only when they match the current coordinates. Non-location edits now preserve checked pins. Migration `0005_menu_tags.sql` converts only exact known menu phrases to tags while retaining the notes. Run `npm.cmd run db:migrate` locally and apply pending migrations to production before deploying. Both migrations are applied in this workspace. No new hosting services are required.


## Business types, services, and optional details

Listings can have multiple business types, including food producers, food shops, and importers/distributors. Dine-in, takeaway/collection, and delivery are separate services. Advance ordering and premises status default to Unknown. Businesses without public premises remain searchable by locality, but public responses omit their address and coordinates; maps and directions are hidden. A per-person meal estimate can be marked Not applicable.

Adding a business requires only its name, one or more business types, and island. Locality, menu options, and menu notes stay near the top. Services, contact details, descriptions, prices, and editing-only status are in collapsed optional sections. The optional shared business name and location label are last, under “Part of a business with several locations?”. Each location retains its own reviews, photos, ownerships, and CAM status.

Admin business management includes a separate **Product catalogue enabled** control. It defaults to off and is enforced and audited by the backend. This is an eligibility flag for a future feature; no catalogue or product management is included. Ordinary edits and owner submissions cannot change it.

Migration `0006_business_classification.sql` is applied in this workspace. On other checkouts, apply it with `npm.cmd run db:migrate` locally, and apply pending remote migrations before production deployment. The migration preserves existing IDs, reviews, verification, and import provenance. Ambiguous imported `By Order/Takeaway` listings are flagged for classification; admins must review them without inferring services or premises. Updated import previews and the checked-in seed follow the same rules. No new hosting service is required.

Behavioural tests in `tests/business-classification.test.ts` cover migration, minimal listings, filtering, location privacy, legacy submissions, and catalogue permissions/auditing. Browser checks cover collapsed forms, minimal submission, invalid-field focus, multi-type filters, and mobile producer listings.
