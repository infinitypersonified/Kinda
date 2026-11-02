KINDA UPDATE v12 (everything, mockup finished)

STEP 1: Unzip into your project folder (the one with package.json). Say YES to replace files.
STEP 2: In the Supabase SQL editor, run the file supabase/migrations/202610280001_custom_repeat_days.sql
        (this lets repeating tasks use chosen days). Run it BEFORE step 4.
STEP 3: git add -A  ->  git commit -m "v6"  ->  git push
STEP 4: npx supabase functions deploy api
        npx supabase functions deploy scheduler
STEP 5: In Vercel, make sure the newest deployment is Production (no rollback warning).

WHAT IS NEW
- Growth page (side menu, under Plan): follow-through, habit strength, 5-week rhythm,
  patterns found from your task titles and times, weekly experiment. Worked out on the
  device from tasks already loaded. No extra Supabase data.
- Circle page: Today / Leaderboard / Members tabs (Chat opens the chat), podium for the
  top 3, finished assigned tasks tucked behind "Show finished".
- Repeat: new "Choose days" option with Mon-Sun chips, shortcuts and a preview.
- Fixed: moved tasks no longer show "Move to today" again; they show under "Moved".
- Help: "?" next to the streak line and a "How Kinda works" section in Settings.
- Earlier work included: Kindle animations, logo flame, egress fix (last 35 days only),
  overlays that close on their own.

NOT CHANGED: streak numbers and streak logic. Colours: everything new uses the app's own
theme colours (light and dark), nothing new was added.

kindle-preview.html: double-click to preview the animations. Safe to delete.

NOTIFICATION FIX (v6)
- The "Live updates could not connect" message is never shown any more.
- Every other message now clears itself after about 3.5 seconds.
- Messages no longer catch taps, so they can't block the Add task button.

EDITING REPEATING TASKS (v7)
- When you edit a repeating task, "Apply changes to" lets you pick "Only this task"
  or "This and all future ones". Future copies get the new title, notes, category,
  priority, timer length and reminder time. Their dates and finished tasks stay as they are.
- Past days are not rewritten.

REPEATING TASKS NOW SHOW IN CIRCLES (v8)
- The circle list used to take the 300 newest shared items. Repeating tasks are created a few
  days ahead, so those future copies pushed today's copy out of the list until you edited and
  re-sent it. The list now picks tasks by their due date (last 7 days and everything upcoming),
  so repeating tasks always appear.
- Needs the server deploy: npx supabase functions deploy api

QUICK ADD + ADD BUTTON (v9)
- Home: a "Add a task and press Enter" box above Today. It adds a task for today.
  Press N anywhere (not while typing or in a dialog) to jump to it.
- On phones and small windows, a round Add button sits at the bottom right. It never
  gets covered by notifications.
- The side menu, the hamburger drawer on small screens, and the two-column home were already
  in the app, so they are unchanged.

HOME SCREEN (v10)
- Today's progress and the streak are now one card: bigger ring with Kindle inside,
  "x of y done today", the next task, then the streak line below.
- Share is now a small icon button next to the streak.
- Task rows on Home no longer repeat "Today" on every row.
- On phones the header New task button is hidden because the round Add button is there.
All colours come from the app's own theme.

HOME SCREEN LAYOUT (v11)
- Wide screens (1000px and up): Today's tasks on the left; the progress card (ring with
  Kindle, streak, share) sits at the top of the right column, with Friends, Circles and
  standings below it. The page is wider so there is less empty space.
- Kindle is now centred inside the ring.
- Small screens keep the single column with the progress card on top.

MOCKUP FINISHED (v12)
- Phones: your streak shows as a small flame chip in the top bar next to the logo.
- Home task rows: hover (or tap a row) to edit, move to tomorrow, or delete.
- The right column section is now called "Circle activity".
