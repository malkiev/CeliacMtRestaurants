# Deployment plan

Prepared 18 September 2026. This is a plan, not a record of completed deployment.

## Cloudflare setup walkthrough

This repository is structured for Cloudflare Workers, D1, and R2. Complete these steps when provisioning a real environment. Replace `glutenfree.mt` with the chosen domain if it changes.

### 1. Create the Cloudflare account and authenticate Wrangler

Install the locked dependencies and sign in from the repository directory:

```powershell
npm.cmd ci
npx.cmd wrangler login
```

### 2. Add the domain

In Cloudflare, choose **Domains → Onboard a domain**, enter the apex domain, review the discovered DNS records, and change the registrar's nameservers to the two Cloudflare nameservers. Preserve existing MX, SPF, DKIM, and DMARC records if the domain already handles email.

### 3. Create the R2 photo bucket

Enable R2 billing if requested, then create the private production bucket:

```powershell
npx.cmd wrangler r2 bucket create coeliac-malta-photos
```

### 4. Create and migrate the production D1 database

Create the database and copy the returned ID into `wrangler.jsonc`, replacing the placeholder `database_id`:

```powershell
npx.cmd wrangler d1 create coeliac-malta
npx.cmd wrangler d1 migrations apply coeliac-malta --remote
```

Do not upload the local development database; it contains development accounts and test data.

### 5. Set production variables and secrets

Set these values in `wrangler.jsonc`:

```json
"vars": {
  "ENVIRONMENT": "production",
  "APP_URL": "https://glutenfree.mt",
  "MAP_STYLE_URL": ""
}
```

Create separate production secrets. Wrangler prompts for each value, so secret contents are not committed:

```powershell
npx.cmd wrangler secret put BETTER_AUTH_SECRET
npx.cmd wrangler secret put GOOGLE_CLIENT_ID
npx.cmd wrangler secret put GOOGLE_CLIENT_SECRET
npx.cmd wrangler secret put RESEND_API_KEY
npx.cmd wrangler secret put EMAIL_FROM
```

Use a newly generated production auth secret, never the local `.dev.vars` value.

### 6. Configure email and Google sign-in

Verify the sending domain in Resend, add its DNS records to Cloudflare, and set `EMAIL_FROM` to an address on that domain.

In Google Cloud Console, add this production OAuth callback:

```text
https://glutenfree.mt/api/auth/callback/google
```

Also add `https://glutenfree.mt` as an authorized JavaScript origin. Configure equivalent callback and origin values for staging after staging resources exist.

### 7. Check and deploy

Run the repository checks and publish the Worker:

```powershell
npm.cmd run check
npm.cmd run build
npx.cmd wrangler deploy
```

The first deployment is available at a `workers.dev` URL. In **Workers & Pages**, open the Worker’s **Domains** settings and add the production domain. Cloudflare provisions HTTPS for the custom domain.

### 8. Verify the deployment

Use the following checks and then exercise the application in a browser:

```powershell
npx.cmd wrangler d1 execute coeliac-malta --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
npx.cmd wrangler tail coeliac-malta
```

Test email and Google sign-in, account linking, listings, moderation, admin-only CAM verification, private pending content, photo upload/retrieval, mobile installation, denied geolocation, and offline behaviour. Add separate staging and production Wrangler environments before using a public staging site; never test staging against production D1 or R2 resources.

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
