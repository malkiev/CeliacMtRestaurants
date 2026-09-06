# Maltese coeliac community directory — draft plan

Draft prepared 6 September 2026. This is a product and implementation proposal; choices marked as provisional need community input. No website has been built or published.

**Product direction**

Build an independent, community-run, English-language directory for finding places that cater for coeliacs in Malta and Gozo. This is not a CAM website. Visitors can browse without an account. Members can submit reviews, photos, new places, and corrections. Moderators manage community submissions. Administrators manage roles, useful links, manual “Verified by CAM” status, and manually verified restaurant-owner access.

Confirmed direction: minimise recurring costs; support Google and email login; retain existing feedback as imported material; replace the spreadsheet with the website; show both cost bands and approximate price per person; accommodate occasional adverts; allow verified owners to reply to feedback. The existing community has at least 200 members, but active users and public traffic are unknown. No name, domain, or visual identity has been chosen. Use a temporary descriptive identity such as “Coeliac Malta” for prototypes, subject to a later naming decision, and make the Malta focus prominent.

Deliver it as an installable progressive web app (PWA). Provide Android installation and iPhone Add to Home Screen guidance appropriate to the browser. Installation does not imply an App Store listing. Cache the application shell and useful-links page; initially keep reviews and verification online so stale information is not silently presented as current. Show a clear offline state.

**What the source spreadsheet tells us**

The provided workbook contains “Celiac Restaurants” and “Form Responses 1”. The directory has Name, Type, Locality, Malta/Gozo, Verified by CAM, GF menu, and Comments columns. Inspection covered directory rows 1–120 and the form-response header, not all workbook content or comment threads.

The populated directory block inspected contains 43 named places, including restaurants, cafés, takeaway/order businesses, and a butcher. Several entries lack locality, some locality values contain trailing spaces, comments mix English and Maltese, and some website/menu links are embedded in comments. Blank rows can still contain FALSE verification checkboxes and must not become listings. The sheet explicitly invites comment threads; these need a separate migration inventory.

**Launch experience**

| Area | Proposed launch behaviour |
| --- | --- |
| Discover | Search by name or locality; list/map toggle; filters for island, locality, place type, cuisine, price, and CAM verification. Preserve filters when opening a place and returning. |
| Nearby | Request location only after tapping “Near me”; sort by straight-line distance, labelled as approximate. Locality search remains available if permission is denied. |
| Map | Cluster nearby markers; tap a marker for a short place summary and details. Only plot checked coordinates. Keep listings without coordinates searchable in the list. |
| Place detail | Name, branch/address, island/locality, cuisine tags, place type, cost band and approximate euro price per person, menu information, photos, community rating and count, recent reviews, verification status/date, and website/menu/social/contact/directions links. |
| Review | Required 1–5 overall experience rating and written feedback; visit date or month; optional photos and factual observations about menu/allergen information and preparation. Keep observations distinct from verified claims. |
| Suggest a place | Name, type, locality/island, address or map pin, optional links/cuisine/cost, and reason for recommending. Submission remains pending until approved. |
| Suggest a correction | Report changed details, closure, wrong pin, or a concern; show submission status in the member account. |
| Useful links | Admin-managed categories such as CAM, local support, travel/dining resources, and approved guidance. Store title, URL, short description, display order, and last checked date. |
| Account | Google and email login, public display name, own reviews and submissions, pending/approved/rejected status, and account deletion. Email addresses stay private. |
| Owner replies | Manually verified owners can reply below reviews and imported feedback for their linked places, with a visible “Owner reply” label. |

Use controlled, editable cuisine tags with multiple cuisines allowed. Keep cuisine separate from place type: “Italian” is a cuisine and “Café” is a place type. Show both € / €€ / €€€ / €€€€ and an approximate per-person euro amount or range, with the pricing basis and last-updated date. Derive the band from the same price data using documented thresholds to keep the two displays consistent. Thresholds and the meal/drink basis remain to be agreed. Support “Unknown”; takeaway shops and butchers may use “Not applicable”. Do not infer cuisine or cost from a business name.

Start with one overall star rating, not an additional numerical safety score. Display rating count and review recency beside the average; places without ratings say “No reviews yet”. Use one active scored review per member per branch, editable after another visit, to avoid repeat visits inflating the score. Historical imported comments carry no stars and are excluded from averages.

**Roles and moderation**

| Role | Permissions |
| --- | --- |
| Visitor | Read approved listings, reviews, photos, and useful links. |
| Member | Submit and manage own reviews/photos; suggest places and corrections; report content. |
| Verified owner | Member abilities plus replies to reviews/imported feedback on explicitly linked places. Cannot edit or remove community feedback, approve submissions, or change CAM verification. |
| Moderator | Approve/reject community submissions, maintain ordinary listing details, and hide reported content. Cannot assign roles or change CAM verification. |
| Admin | Moderator abilities plus role assignment, useful-link/ad-placement management, granting/removing CAM verification, and manually granting/revoking owner-to-place access. |

Confirmed launch policy: reviews, photos, owner replies, new-place suggestions, and community corrections require moderator approval before publication. The moderation team will have 2–3 people. The dashboard needs separate queues, submission context, duplicate-place detection, rejection reasons, and an action history. Pending content and photo originals must not be publicly accessible. Negative reviews are handled by the same content rules as positive reviews.

Use a shared queue showing submission age and status. Proposed workflow: any one eligible moderator can approve or reject a submission; record the decision and prevent a second moderator from overwriting an already completed decision without explicitly reopening it. Contributors see “Awaiting approval” immediately after submitting. Moderators cannot approve their own contributions or content concerning a business they represent.

Enforce permissions in the backend/database, including for direct requests. An admin can grant or remove verification manually and record the date, actor, and optional note. A public explanation describes what CAM verification means. A high community score never grants that badge. Existing TRUE/FALSE values should be imported with provenance and admin-reviewed before enabling public badges; FALSE means no recorded verification, not a failed assessment.

Edited reviews return to moderation; the last approved version remains public until the replacement is approved. Removed/unapproved reviews do not count toward averages. Keep internal moderation notes private.

Owner verification is a separate, branch-scoped association between a user and a place, not a global permission to represent every restaurant. Admins manually check the relationship and record who approved it and when; private verification evidence is never public. A member may represent multiple places, and a place may have multiple approved representatives. Revocation immediately removes reply/edit access for that association. Previously approved replies retain their original attribution.

Proposed reply model: one owner response per feedback item, editable with revision history. Replies carry no star rating and do not affect averages. Owner replies and their edits require approval before publication; the last approved reply remains visible while an edit is pending. Allow reporting of published replies. Owners cannot rate their linked businesses or moderate feedback about them, including when they also hold a moderator role. Ownership and advertising never grant CAM verification. General member-to-member discussion threads remain outside launch scope.

**Visual direction**

Aim for a small Maltese community publication: warm off-white background, dark ink, one restrained sea-green or terracotta accent, readable typography, and genuine community photography. Use generous spacing and clear information hierarchy, with compact listing rows and a prominent locality search. Commission or choose a simple identity once the name is decided.

The first mobile screen should make finding a place immediately useful. Bottom navigation can contain Discover, Map, Useful links, and Account, with contextual review/suggestion actions. On desktop, offer a list beside the map. Use consistent photo crops, a calm empty-photo treatment, accessible contrast, labelled controls, large touch targets, keyboard access, and layouts that handle long names and Maltese characters. Keep decorative effects restrained.

**Occasional advertising**

Include reusable, optional advert slots in the launch layout, for example after every eight list results and near the end of a detail page. Treat that frequency as a design starting point, with a maximum of two placements per results page. Clearly label them “Advertisement” or “Sponsored”; collapse unused slots and reserve dimensions when an advert is present. Adverts must not obscure search, review actions, or verification details, and must not alter organic ranking or ratings.

Prefer simple, directly arranged sponsorship banners for the initial implementation: an admin chooses an image/text, destination URL, placement, start/end dates, and active status. Avoid adding an ad-network integration or advertiser self-service portal at launch. Revenue is uncertain and is not assumed in the hosting budget. Include advertising in map-provider eligibility checks, even if the project itself is community-run.

**Technology and costs**

Use a TypeScript web application with a lightweight React interface, server-rendered public place pages for search/discovery and sharing, and a PWA manifest/service worker. Prefer Cloudflare Workers, D1, and R2 given the confirmed cost priority; select the exact framework and maintained authentication integration during technical scaffolding. Support both Google and email login, including a verified account-linking flow. Include email delivery in the running-cost estimate. No native mobile codebase is needed for launch.

Two viable production routes:

| Route | Components | Cost/maintenance tradeoff |
| --- | --- | --- |
| Preferred: lowest infrastructure cost | Cloudflare Workers, D1 database, R2 photos; maintained authentication library with both Google and verified email login. | Planning target around €0–10/month at small community usage, excluding domain, email, paid maps, tax, and any overages. Authentication and admin features require more integration work. |
| Simpler managed backend | Cloudflare frontend plus Supabase database/Auth; start with Supabase Storage or choose R2 if photo traffic warrants it. | Free tier is suitable for a pilot; Supabase Pro starts at US$25/month. Budget roughly €30–40/month for a small paid deployment before any paid map plan or unusual usage; this is an estimate, not a quote. |

Prefer Cloudflare/D1 to minimise recurring costs. Keep Supabase as an alternative if authentication integration or maintenance costs justify reconsideration; it is not the default. A community of 200 members is a planning baseline, not a traffic ceiling. Avoid running a self-managed server unless someone explicitly wants responsibility for patching, backups, and monitoring.

Current vendor facts: Cloudflare offers free allowances; its Workers paid plan has a US$5/month baseline. D1 is available on both plans. R2 Standard includes 10 GB-month of storage and operation allowances; additional storage is US$0.015/GB-month, with no direct egress charge. Supabase Free includes 500 MB database and 1 GB file storage but can pause after one week of inactivity. Costs for image processing, email delivery, and maps are separate where applicable. Set usage alerts and application upload/request limits; alerts alone are not spending caps.

For maps, use MapLibre with a hosted tile provider selected against the final budget and commercial/noncommercial status. MapTiler is a candidate, but its free-plan eligibility and quota must be checked against the site's intended use. Open map data does not mean unlimited free hosted tiles. Alternatively, use Google Maps JavaScript with a separately confirmed API budget. Load the map on demand. Store checked place coordinates so nearby sorting does not require a paid routing API. Provide a Google Maps directions link; Maps URLs do not require a Google API key. Distinguish approximate distance from road/ferry travel time, particularly between Malta and Gozo.

For photos, accept a small number per review (proposed maximum five), constrain file sizes, validate actual file content, resize/re-encode images, strip location metadata, generate thumbnails, and serve approved derivatives. Delete rejected/orphaned uploads on a schedule. A 300 KB average image means 10,000 images use roughly 3 GB before thumbnails/backups; use this only as a sizing illustration.

**Data structure and migration**

Core records: places/branches with price estimates; canonical localities with island and search aliases; cuisines and place-cuisine links; users and roles; reviews/imported feedback and approved revisions; owner-to-place associations and verification history; owner replies and revisions; photos; submissions/reports; CAM verification history; useful links; advert placements; moderation audit events; import provenance. Each branch has its own reviews, ownership associations, and CAM verification. Keep publication status separate from open/temporarily closed/permanently closed business status.

Migration steps:

1. Snapshot the source and inventory directory cells, form submissions, hyperlinks, notes, and accessible comment threads. Reconcile submissions already represented in the directory.
2. Ignore rows with no place name, normalize whitespace and locality aliases, and identify duplicate branches without automatically merging distinct locations.
3. Preserve source row references and wording. Retain existing feedback as “Imported community feedback”; do not invent author identities, visit dates, ratings, cuisines, price bands, or verification dates. Keep the site interface English-only while preserving original imported text, including Maltese feedback. Default to no personal author attribution for imported material unless separately confirmed.
4. Extract embedded links and review them. Confirm full addresses and map pins, resolving island/locality ambiguity. Keep unknown fields visibly unknown.
5. Have admins review imported CAM flags and listing readiness. Trial the import on a small sample, then reconcile record counts and rejected rows for the complete import.
6. Make the website database the source of truth after the one-time migration. No ongoing spreadsheet dependency or synchronisation is needed. Keep CSV export and an admin import preview for future bulk updates.

**Delivery sequence and completion checks**

1. Resolve the remaining price thresholds, verification wording, and operating responsibilities for the 2–3 moderators. Use a temporary identity for the POC. Produce a clean data mapping and representative sample.
2. Build a mobile proof of concept: discover/list, map, place detail, review submission, owner reply, moderation queue, useful links, and occasional advert placements. Use sample source entries and clearly labelled demo interactions. Sites is a possible POC host; Sites tools are present in this session, but an installed Sites skill was not found. Confirm skill availability and POC sharing before implementing through Sites. Keep the data model portable.
3. Implement the production directory, one-time import tooling, Google/email authentication, backend role checks, submissions, photos, manual owner verification and replies, CAM controls, useful links, simple advert management, SEO metadata, and installation/offline behaviour.
4. Run a small community pilot with admins, moderators, and verified owners. Check iPhone/Android installation, denied geolocation, empty results, long names, duplicate submissions, photo rejection, review averages, ad layout, and direct unauthorized attempts to change roles or CAM status. Test cross-place owner reply attempts, ownership revocation, self-review prevention, reply moderation, and Google/email account linking. Verify database/photo backup and restore, account/content deletion behaviour, and email delivery.
5. Launch after import reconciliation, moderator readiness, cost controls, and mobile checks pass. Assign responsibility for reviewing the moderation queue, checking old listings, useful-link maintenance, backups, and billing.

Defer push notifications, native app-store releases, bookings, ad-network integration, advertiser self-service, automated verification, and AI-generated review summaries. Owner accounts/replies and basic advert support are now in launch scope.

**Decisions to confirm**

- Which admins will perform the manual CAM-status and restaurant-owner checks? Agree a short public explanation of the CAM label and a simple private owner-check process.
- What per-person meal/drink basis and euro thresholds should define the cost bands? One overall 1–5 experience rating remains the proposed default.
- Site name/domain and final identity can follow the POC; the project is independent and must clearly target coeliacs in Malta. No CAM branding is assumed.
- Is there a desired pilot or launch date? Exact audience size remains unknown beyond the existing community of at least 200 members.

**Sources checked**

- Source workbook: https://docs.google.com/spreadsheets/d/1-JishqJEosErQiSRMAYr7Qshm8k7hxAfGvbyF3yitx8/edit
- PWA installation: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- Cloudflare Workers and D1 pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Supabase pricing: https://supabase.com/pricing
- MapTiler pricing: https://www.maptiler.com/cloud/pricing/
- Google Maps URLs: https://developers.google.com/maps/documentation/urls/get-started
