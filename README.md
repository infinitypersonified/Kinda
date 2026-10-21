# Kinda — grow together

Kinda is a social task app for personal focus and small circles. Members can create tasks, track focus timers, share tasks and progress with circles, chat together, and invite people with a signup link.

## Stack

- React 19 and Vite, hosted as a Cloudflare Pages site
- Convex for app data and server functions
- Better Auth with email and password sign-in, backed by the Convex Better Auth component
- PostHog for privacy-conscious page analytics
- Initial-based profile avatars (no paid file storage required)

## Local development

Requirements: Node.js 22.13 or newer and npm.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure a new Convex development deployment (the CLI prompts you to sign in and choose a project):

   ```bash
   npm run dev:convex
   ```

   Convex generates the files under `convex/_generated/`. Keep these generated files with the project. Set these **deployment environment variables** in the Convex dashboard:
   - `SITE_URL=http://localhost:5173`
   - `BETTER_AUTH_SECRET`: a strong, unique secret

3. Copy `.env.example` to `.env.local`. Fill in `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` with the development deployment URLs shown by Convex. Add your PostHog project key and host if analytics are enabled. Only `VITE_*` values belong here; they are bundled into the browser build.

4. Start Vite:

   ```bash
   npm run dev
   ```

The frontend displays an explicit setup message if its two Convex URLs are missing. It does not silently fall back to local SQLite.

## Optional integrations

- **Google sign-in:** Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the Convex deployment environment. The Google button appears on the login and signup screens when the frontend is rebuilt. Add the Convex site URL followed by `/api/auth/callback/google` to the Google OAuth client's authorized redirect URIs.
- **Private calendar feed:** Create the feed in Kinda Settings and subscribe to its `.ics` URL in Google Calendar, Apple Calendar, or Outlook. The URL grants access to your dated tasks; regenerate or revoke it in Settings to invalidate old links.
- **Google Calendar sync:** Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CONVEX_SITE_URL`, and `SITE_URL` in Convex. Add `<CONVEX_SITE_URL>/google-calendar/callback` as an authorized redirect URI in Google Cloud, enable the Google Calendar API, then connect and sync from Settings. This is opt-in, syncs only Kinda tasks with due dates, and does not import unrelated calendar events. Calendar edits to linked tasks sync back when you choose Sync now.
- **Telegram reminders:** Create a Telegram bot, then set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, and a random `TELEGRAM_WEBHOOK_SECRET` in the Convex deployment environment. Register the webhook at `<CONVEX_SITE_URL>/telegram/webhook` with that secret using Telegram's `setWebhook` API. Users can then connect Telegram in Kinda Settings; scheduled task reminders are sent to the linked chat.
- **Share cards and circle invites:** Weekly and streak cards use the device share sheet when image sharing is supported, with a PNG download fallback. Circle invite links can be shared directly to WhatsApp or X.

The `.ics` calendar feed is a one-way, read-only subscription; Google Calendar sync is a separate, opt-in connection.

## Cloudflare Pages deployment

### GitHub-connected deployment (recommended)

1. Push this project to a GitHub repository. Do not commit `.env.local`, `.env` files containing real values, `node_modules`, `dist`, or local SQLite files.
2. In Cloudflare, open **Workers & Pages → Create application → Pages → Connect to Git** and select the repository.
3. Configure the Pages build with **Build command** `npm run build` and **Build output directory** `dist`. Add `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` as Pages build environment variables for the right environment: **Production** for the main site and **Preview** for branch previews. Pages embeds these public `VITE_*` values at build time, so retry the deployment after changing them. Add PostHog values only if analytics are enabled.
4. Let Pages publish the `dist` directory after the build. If a custom **Deploy command** is configured, use `npx wrangler pages deploy dist --project-name todully` (not `npx wrangler deploy`, which attempts to deploy a Worker).
5. Deploy the Convex functions and component from the project root with `npx convex deploy`. Set production Convex environment values in the Convex dashboard:
   - `SITE_URL`: the exact public Pages/custom-domain origin
   - `BETTER_AUTH_SECRET`: a unique secret for production, different from development
6. Keep `SITE_URL` set to the exact, stable production Pages/custom-domain origin. `CONVEX_SITE_URL` is supplied by Convex; do not set it manually.

Cloudflare Pages rebuilds the site after pushes to the connected branch. The invite route uses Cloudflare Pages' SPA fallback. Invite links created before deployment point to the current origin, so create/share new links from the deployed site.

### Vercel deployment

Vercel serves the app as a Vite single-page app. The included `vercel.json` rewrites `/join/:token` to the app shell so invite links load in the client router rather than returning Vercel's 404 page. Import the GitHub repository, use `npm run build` and `dist`, and configure the production `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` variables before deploying.

### Direct upload alternative

If you do not want to connect GitHub, open **Workers & Pages → Create application → Pages → Drag and drop your files**. Set production `VITE_*` values in `.env.local`, run `npm run build`, then upload `dist`. Rebuild and upload `dist` again for every frontend change. You can also deploy with Wrangler after running `npx wrangler login` and creating the Pages project with `npx wrangler pages project create todully`.

Profile photo uploads are currently disabled to avoid requiring a separate storage provider or billing setup. Members have generated initials avatars instead.

## Analytics and privacy

PostHog is optional. Without `VITE_POSTHOG_KEY`, no analytics client is initialized. When enabled, the app captures page views only; autocapture and session recording are disabled. Do not place private or secret values in public Vite environment variables.

## Fresh cloud start and existing SQLite data

The hosted app starts with a fresh Convex database; it does not import the local SQLite accounts, password hashes, or app data. The existing `data/kinda.sqlite` file and its WAL sidecars are left untouched. Keep a separate backup if you need the old local data; do not delete or upload it as part of deployment.

## Useful commands

```bash
npm run dev          # Start the Vite frontend
npm run dev:convex   # Configure/watch the Convex development deployment
npm run deploy:convex # Deploy Convex functions and auth component (requires Convex login)
npm run typecheck    # Type-check the frontend project
npm run build        # Build the Pages site
npm run deploy       # Upload dist/ to Cloudflare Pages via Wrangler
```
