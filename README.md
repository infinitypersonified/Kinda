# Kinda — grow together

Kinda is a social task app for personal focus and small circles. Members can create tasks, track focus timers, share progress, chat, and invite people with a signup link.

## Stack

- React 19 and Vite, deployed on Vercel
- Supabase Auth, Postgres, Realtime, and Edge Functions
- PostHog for optional page analytics
- Initial-based profile avatars

## Local development

Requirements: Node.js 22.13 or newer and npm.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. PostHog and push-notification settings are optional. Only public `VITE_*` values belong in this file.
3. Configure the Supabase database and Edge Functions by following [the Supabase setup guide](./supabase/README.md).
4. Start Vite:

   ```bash
   npm run dev
   ```

## Vercel deployment

Import the repository into Vercel, use `npm run build` as the build command, and set `dist` as the output directory. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the Vercel project’s environment variables; add the optional PostHog and VAPID public key variables if those features are enabled. Redeploy after changing build-time variables.

The included `vercel.json` rewrites `/join/:token` to the app shell so invite links work with client-side routing. Configure Supabase Auth’s allowed redirect URLs for your local and production site origins.

## Useful commands

```bash
npm run dev          # Start the Vite frontend
npm run typecheck    # Type-check the frontend project
npm run build        # Build the production site
```

Do not commit `.env.local`, service-role/secret keys, local database files, or generated build output.
