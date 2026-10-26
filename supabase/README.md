# Supabase migration

The current production app remains connected to Convex while this migration is
being prepared. Do not remove the Convex project or its data.

## Database setup

1. Open the Kinda project in Supabase and go to **SQL Editor**.
2. Run migrations `202610260001_initial_schema.sql` through
   `202610260004_task_reminder_compat.sql` in order. The compatibility
   migration safely adds reminder tracking to databases created from the
   earlier schema.
3. In **Project Settings > API**, copy the Project URL and publishable key into
   the local `.env.local` as `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Keep any Supabase secret/service-role key on a trusted server only. Never
   put it in a `VITE_*` variable or in the browser.

The schema keeps `legacy_id` values so imported Convex document IDs can be
mapped and the import can be retried safely. App data references Supabase Auth
UUIDs. Existing accounts are provisioned first by the importer. A one-time
server-side transition verifies existing Better Auth scrypt hashes and sets
the same password in Supabase Auth at the user's first email/password login.
Google can also be used with the same verified email address.

## Data import (only after the SQL schema is installed)

1. Export a production snapshot from Convex and keep the ZIP unchanged as the
   rollback/backup copy:

   ```powershell
   npx convex export --deployment outgoing-cuttlefish-138 --path .\convex-export-live.zip
   Expand-Archive -LiteralPath .\convex-export-live.zip -DestinationPath .\convex-export-live
   ```

2. Confirm the extracted export includes the Better Auth `user` documents as
   well as the app tables. The importer stops without writing app rows if the
   user documents are absent.
3. If you have not already created it, copy
   `supabase/migration.env.example` to `supabase/env.migration`, then fill in
   the project URL and a Supabase secret key. Keep this file private; it is
   ignored by Git. Run:

   ```powershell
   npm run migrate:supabase -- .\convex-export-live
   ```

   The secret key is only used by this local migration script. Never use it as
   a `VITE_*` variable or share it in chat.
4. Import the credential hashes from the same Convex export into the protected
   transition table:

   ```powershell
   npm run import:supabase-passwords -- .\convex-export-live
   ```

   Hashes are checked server-side at first login, upgraded into Supabase Auth,
   and deleted after success. They are never printed or exposed to clients.
5. The importer prints row counts and saves a local user-ID map for safe retries.
   Compare those counts with Convex. Recheck what Supabase currently contains
   at any time with:

   ```powershell
   npm run verify:supabase-import
   ```

The importer never deletes or modifies Convex. Configure Google sign-in only as
an optional method, using the same verified email as the imported account.

Do not switch the live site to Supabase until the import counts are checked,
authentication is verified, and the app's API/realtime layer is ready.

## Current migration status

This migration has been deployed in stages. The app still defaults to
Convex unless `VITE_BACKEND=supabase` is set. The API and scheduler cover the main
account, task, circle, chat, activity, nudge, streak, push, reminder, recurrence,
calendar, Google Calendar, and Telegram flows. They still need deployment and
verification against an imported snapshot. Do not enable the Supabase backend
for all users until that verification is complete.

Deploying the Edge Functions requires the Supabase CLI and a Supabase access
token entered through `npx supabase login` (do not put that token in this
repository):

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy api
npx supabase functions deploy scheduler
```

The deployed functions use the server-side key Supabase injects into the Edge
Function runtime. The code reads the platform `SUPABASE_SECRET_KEYS` setting
and supports the legacy runtime key too. Do not add a custom secret named
`SUPABASE_SECRET_KEY`; Supabase reserves the `SUPABASE_` prefix. Never place
server-side keys in Vite variables.

## Performance settings

The API uses Supabase's HTTPS/PostgREST client, so it does not open direct
Postgres connections from the Edge Function. Supabase manages the internal
database API pool. The Edge Functions now reuse their Supabase client per warm
runtime; only configure a transaction pooler if adding a direct Postgres
driver. Supabase documents pool sizing under **Database > Settings > Connection
pooling**; avoid raising pool sizes without connection usage evidence.

API GET responses can use a short, user-scoped Redis cache. To enable it, create
a persistent Upstash Redis database and set these secrets for the `api` Edge
Function. Keep the standard token server-side:

```powershell
npx supabase secrets set UPSTASH_REDIS_REST_URL="YOUR_REST_URL" UPSTASH_REDIS_REST_TOKEN="YOUR_STANDARD_TOKEN" API_CACHE_TTL_SECONDS="5"
```

The cache fails open if Redis is unavailable, expires quickly, and bumps a
shared generation after successful API writes so one user's changes invalidate
other users' cached views. Do not put the Redis token in a `VITE_*` variable.
If no Redis database is configured, the app continues to use Postgres directly.

The Edge Functions enable gzip/Brotli response compression when the client
advertises support. Task lists are fetched in 500-row pages internally and
combined for the existing UI, so pagination doesn't hide older tasks.

## Background jobs and integrations

The scheduler sends due task reminders (web push and Telegram) and creates the
next occurrence for repeating tasks. Deploying it is not enough; schedule it to
run every minute. Enable `pg_cron` and `pg_net` in Database > Extensions, then
set these Edge Function secrets. Reuse the existing Convex values when available
so saved push subscriptions and provider connections keep working:

```powershell
supabase secrets set KINDA_SCHEDULER_SECRET="YOUR_RANDOM_SECRET" SITE_URL="https://YOUR_SITE"
supabase secrets set VAPID_PUBLIC_KEY="YOUR_EXISTING_PUBLIC_KEY" VAPID_PRIVATE_KEY="YOUR_EXISTING_PRIVATE_KEY" VAPID_SUBJECT="mailto:hello@kinda.app"
supabase secrets set GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID" GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET"
supabase secrets set TELEGRAM_BOT_USERNAME="YOUR_BOT_USERNAME" TELEGRAM_BOT_TOKEN="YOUR_BOT_TOKEN" TELEGRAM_WEBHOOK_SECRET="YOUR_WEBHOOK_SECRET"
```

Set `VITE_VAPID_PUBLIC_KEY` to the same VAPID public key in local and Cloudflare
build settings. Register
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/api/google-calendar/callback`
as an authorized Google OAuth redirect URI. Point the Telegram bot webhook to
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/api/telegram/webhook` and set
its webhook secret token to `TELEGRAM_WEBHOOK_SECRET`.

Store the scheduler URL and the same random `KINDA_SCHEDULER_SECRET` in Supabase
Vault. Then run this SQL in the Supabase SQL Editor, replacing the placeholders
before running it. Do not commit the real secret:

```sql
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co/functions/v1/scheduler', 'kinda_scheduler_url');
select vault.create_secret('YOUR_RANDOM_SECRET', 'kinda_scheduler_secret');
select cron.schedule(
  'kinda-background-jobs',
  '* * * * *',
  $$ select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'kinda_scheduler_url'),
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-kinda-scheduler-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'kinda_scheduler_secret')),
       body := '{}'::jsonb
     ); $$
);
```

Put the non-Supabase integration values in a private
`supabase/functions/.env` file and upload them with
`npx supabase secrets set --env-file .\supabase\functions\.env`. Do not include
`SUPABASE_URL` or any `SUPABASE_*` keys in that file; Supabase provides its
server credentials to deployed functions. The local `.env` file should contain
the `SITE_URL`, VAPID pair, OAuth credentials, Telegram settings, and scheduler
secret named above. `VITE_VAPID_PUBLIC_KEY` belongs in the frontend `.env.local`
and Cloudflare build settings, not in this Edge Function secrets file.

The scheduler validates its own secret header. `supabase/config.toml` disables
platform JWT verification for the API and scheduler functions: user API calls
validate their bearer token in code, while the public calendar feed, OAuth
callback, Telegram webhook, and scheduler each validate their own token/state.

To carry over the existing Convex site, push, and Google Calendar credentials
without displaying them, run this once in PowerShell after the Supabase project
is linked:

```powershell
.\scripts\copy-convex-integration-secrets.ps1
```

It uploads the settings as Edge Function secrets, updates the local
`VITE_VAPID_PUBLIC_KEY` to match existing push subscriptions, and creates the
ignored `supabase/scheduler-setup.local.sql` file. That SQL enables the
background schedule; run it only after cutover. Existing Google Calendar
connections were not present in the imported snapshot, so users will need to
connect their calendars again. For Google sign-in, separately enable Google in
**Authentication > Providers** using the same client credentials, then add
`https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` to the Google OAuth
client's authorized redirect URIs. Imported accounts do not retain their old
passwords; Google sign-in works when users use the matching verified email.

Custom SMTP is not required for Google sign-in. Configure an email sender only
if you want imported users to recover an email/password login or receive other
Auth emails. Supabase's built-in email service has recipient and rate limits,
so it is not a general production recovery sender.
