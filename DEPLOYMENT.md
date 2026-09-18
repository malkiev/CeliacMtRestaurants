# Deployment plan

Prepared 18 September 2026. This is a plan, not a record of completed deployment.

Deploy to Cloudflare Workers, using D1 for the database and R2 for photos. The application already uses this stack, but production configuration and real sign-in still need setting up. Deploy a staging site first, then launch `glutenfree.mt`.

## 1. Set up accounts and the domain

| Service | Purpose |
| --- | --- |
| Cloudflare | Website hosting, database, photo storage, and domain DNS |
| Domain registrar access | Connect `glutenfree.mt` to Cloudflare |
| Resend | Send email sign-in links |
| Google Cloud project | Enable Google sign-in |

Add the domain to Cloudflare while preserving any existing email DNS records. Cloudflare Worker custom domains handle HTTPS certificates. Enable R2 on the account as well.

References: [Custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [R2 setup](https://developers.cloudflare.com/r2/get-started/).

## 2. Prepare separate staging and production configurations

Add explicit environments in [wrangler.jsonc](wrangler.jsonc):

- Staging: `staging.glutenfree.mt`, with its own database and photo bucket.
- Production: `glutenfree.mt`, with separate resources.
- Replace the placeholder database ID with the appropriate provisioned database ID for each environment.
- Set each environment's `APP_URL` to its actual HTTPS address and keep `ENVIRONMENT=production` for hosted deployments.

Keep photo buckets private; the application serves photos after checking their visibility. The staging environment must never use production data or storage.

## 3. Configure email and Google sign-in

Verify a sending domain in Resend and add its supplied DNS records. Set `EMAIL_FROM` to an address on that verified domain. See [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction).

Configure Google's production callback as:

```text
https://glutenfree.mt/api/auth/callback/google
```

Configure the equivalent staging callback too. See [Google authentication setup](https://better-auth.com/docs/authentication/google).

Store these separately for each environment:

- `BETTER_AUTH_SECRET`: newly generated, not the local development secret.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
- `RESEND_API_KEY`.

Use Cloudflare secrets for sensitive values; local `.dev.vars` does not configure production. See [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## 4. Prepare the database and first administrator

Apply all migrations to the hosted database, then import the reviewed restaurant seed.

Do not upload the entire local development database. It contains development accounts and potentially test submissions. Any genuine local listing edits worth keeping should be reviewed and transferred deliberately.

The current [admin bootstrap script](scripts/admin.mjs) supports local databases only. Before launch, add an explicit remote bootstrap procedure that promotes the intended verified account only when no admin exists and records the action.

## 5. Deploy and test staging

Run the existing checks and browser tests, then deploy using the staging configuration.

Test real email delivery, Google login, account linking, submissions, moderation, photo uploads, and admin permissions. Also check hidden addresses, mobile installation, and denied geolocation.

Measure photo-processing CPU usage on Cloudflare before choosing the hosting tier. Maps can remain disabled initially, or use a licensed provider through `MAP_STYLE_URL`.

## 6. Launch production with a small pilot

Repeat provisioning, migrations, secrets, and deployment for production. Create the first admin account and invite a few community members before announcing the site widely.

Add explicit staging and production deployment commands first: the current `npm run deploy` deploys the default configuration, and `npm run db:migrate` updates only the local database.

## 7. Set up maintenance and recovery

Monitor application errors, failed emails, storage, and usage costs. Record each deployed Git revision and test database and photo restoration.

D1 provides automatic recovery history: as checked on 18 September 2026, seven days on Free and 30 days on Paid. Photo backups need their own process. See [D1 recovery](https://developers.cloudflare.com/d1/reference/time-travel/).

Workers Paid starts at US$5/month as checked on 18 September 2026, with domain, email, maps, storage, and overages considered separately. Choose the final budget after staging tests and recheck prices before provisioning. See [Cloudflare pricing](https://developers.cloudflare.com/workers/platform/pricing/).
