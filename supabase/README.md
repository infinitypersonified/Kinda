# Supabase setup

The application uses Supabase for authentication, data, realtime updates, and server-side API operations. Deploy the frontend on Vercel.

## Database and local configuration

1. In the Supabase SQL Editor, apply every SQL migration in `supabase/migrations/` in filename order.
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the Supabase project’s API settings.
3. Keep secret/service-role keys on trusted servers only. Never put them in a `VITE_*` variable.
4. In Supabase Auth settings, configure the local and production site URLs and allowed redirect URLs.

## Optional onboarding survey

The app shows a one-time, skippable survey after sign-in. It asks why someone uses Kinda and where they heard about it; it does not collect age. Before deploying the updated frontend or API, apply `supabase/migrations/202611120001_onboarding_survey.sql` in the SQL Editor. Responses are private to the server-side API and are not exposed through the client.

## Edge Functions

Install/use the Supabase CLI, log in, and link the project:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy api
npx supabase functions deploy scheduler
npx supabase functions deploy migrate-legacy-password
```

The frontend invokes the `api` and `migrate-legacy-password` functions. Deploy the scheduler as well if scheduled reminders and recurring-task processing are enabled. The functions use the server-side credentials provided by Supabase; do not add those credentials to Vite settings.

The API and scheduler validate requests in application code. See `supabase/config.toml` for the function JWT settings and do not weaken the endpoint-level checks when changing them.

## Optional integrations and background jobs

Configure only the integration secrets for features you use. For example:

```powershell
npx supabase secrets set SITE_URL="https://YOUR_SITE"
npx supabase secrets set VAPID_PUBLIC_KEY="YOUR_PUBLIC_KEY" VAPID_PRIVATE_KEY="YOUR_PRIVATE_KEY" VAPID_SUBJECT="mailto:hello@example.com"
npx supabase secrets set GOOGLE_CLIENT_ID="YOUR_CLIENT_ID" GOOGLE_CLIENT_SECRET="YOUR_CLIENT_SECRET"
npx supabase secrets set TELEGRAM_BOT_USERNAME="YOUR_BOT_USERNAME" TELEGRAM_BOT_TOKEN="YOUR_BOT_TOKEN" TELEGRAM_WEBHOOK_SECRET="YOUR_WEBHOOK_SECRET"
```

Set `VITE_VAPID_PUBLIC_KEY` to the matching public key in local and Vercel build environments. Register the Google Calendar callback at `https://YOUR_PROJECT_REF.supabase.co/functions/v1/api/google-calendar/callback`. Configure the Telegram webhook at `https://YOUR_PROJECT_REF.supabase.co/functions/v1/api/telegram/webhook` and use the same webhook secret.

For scheduled task reminders and recurrence, enable `pg_cron` and `pg_net`, set a random `KINDA_SCHEDULER_SECRET`, and store the scheduler URL and secret in Supabase Vault. Schedule a request to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/scheduler` every minute with the `x-kinda-scheduler-secret` header. Keep the secret in Vault; do not commit it or put it in a frontend variable.

## Performance and diagnostics

The Edge Functions use Supabase’s HTTPS API rather than opening direct Postgres connections. The API can use a short-lived, user-scoped Upstash Redis cache when configured with server-side `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` secrets; without them it continues to read from Supabase directly.

Use the project’s focused checks when configured:

```bash
npm run typecheck
npm run build
npm run check:supabase-functions
```

`check:supabase-functions` reads the private `supabase/env.migration` configuration and should only be run in an environment where that file is present and protected.
