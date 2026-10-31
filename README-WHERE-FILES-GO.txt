KINDA UPDATE v3  (Kindle + animations + egress fix)

HOW TO INSTALL
1. Unzip this into your project folder (the one that contains package.json,
   src, public, supabase). Say YES to replace existing files.
   The files merge into the folders that already exist. Do not copy the
   zip's folder as a whole into src.
2. In the VS Code terminal:
      git add -A
      git commit -m "Kindle, animations, egress fix"
      git push
3. Deploy the server code (this is what cuts the Supabase data use):
      npx supabase functions deploy api
      npx supabase functions deploy scheduler
   (spell it scheduler, with an e)
4. When Vercel says Ready, open the site in a private window.

WHERE EVERY FILE GOES
index.html                          -> project root
public/favicon.svg                  -> public/
public/icon-192.png                 -> public/
public/icon-512.png                 -> public/
public/apple-touch-icon.png         -> public/
src/Kindle.jsx                      -> src/   (NEW)  Kindle components
src/kindleArt.js                    -> src/   (NEW)  the 10 poses + 6 streak scenes
src/kindle.css                      -> src/   (NEW)  all animation styling
src/App.jsx                         -> src/   (replaces)
src/share.js                        -> src/   (replaces)  Kindle on share images
src/weekly.jsx                      -> src/   (replaces)  Kindle in PDFs + older weeks
src/styles.css                      -> src/   (replaces)
src/supabaseApi.js                  -> src/   (replaces)
supabase/functions/api/index.ts     -> supabase/functions/api/
supabase/functions/scheduler/index.ts -> supabase/functions/scheduler/

EXTRA FILES (safe to delete after you look)
kindle-preview.html   Double-click to see every animation in your browser.
README-WHERE-FILES-GO.txt   This file.

WHAT CHANGED
- All Kindle animations and the logo flame.
- Cheers and the task-added overlay now close on their own reliably.
- Egress fix: the app loads only the last 35 days of tasks. Older weeks load
  when you open them in the weekly report. Circle goals list capped at 300.
- Streak numbers and logic were not touched.
