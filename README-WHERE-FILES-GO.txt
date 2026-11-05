KINDA UPDATE v19 (everything: challenges with delete, data-use fixes, streak record)

INSTALL ORDER
1. Unzip into your project folder (the one with package.json). Say YES to replace files.
2. In the Supabase SQL editor run these, in this order, BEFORE step 4 (skip any you already ran):
      supabase/migrations/202610280001_custom_repeat_days.sql
      supabase/migrations/202610290001_challenges.sql
      supabase/migrations/202610300001_streak_log.sql
3. git add -A  ->  git commit -m "v19"  ->  git push
4. npx supabase functions deploy api
   npx supabase functions deploy scheduler
5. Change the schedule that runs the scheduler from every 1 minute to every 5 minutes
   (wherever you set it up: Supabase Cron, or the outside cron service). See "Log ingestion" below.
6. Vercel: newest deployment must be Production (no rollback warning).

INSTALL ORDER MATTERS THIS TIME
1. Unzip into your project folder (the one with package.json). Say YES to replace files.
2. In the Supabase SQL editor run these two files, in this order, BEFORE step 4:
      supabase/migrations/202610280001_custom_repeat_days.sql   (skip if you already ran it)
      supabase/migrations/202610290001_challenges.sql
3. git add -A  ->  git commit -m "v15"  ->  git push
4. npx supabase functions deploy api
   npx supabase functions deploy scheduler
   (If you deploy api before step 2, tasks will fail to load. Run the SQL first.)
5. Vercel: make sure the newest deployment is Production (no rollback warning).


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

KEYBOARD FIX (v13)
- On phones the New task sheet now sits above the keyboard and shrinks to the visible area.
- Kindle's picture and the subtitle hide while the keyboard is open, to make room.
- The Add task / Save changes button stays pinned at the bottom of the sheet.
- On phones the Task field no longer opens the keyboard by itself, so you see the whole form first.

LAYOUT AND SMOOTHNESS (v14)
- The round Add button only shows on Home and My Tasks, hides while you type, and every page has
  extra space at the bottom so nothing sits under it.
- Pages fade and slide in; the circle tab highlight slides between tabs; the podium bars grow up;
  buttons have a small press effect. All of it turns off for people who prefer reduced motion.
- On phones, tapping a circle opens it as its own screen with a back arrow. The circle list shows
  full-width cards.
- Home on phones: the ring sits beside "x of y done today".
- Circle details have even padding on phones.

NOT BUILT YET: challenges (and the warrior Kindle animations that go with them), badges, points,
circle rules, Wrapped, and the Rive version of Kindle.


V15 ADDITIONS
- Circles now match the approved mockups: full-width circle cards, "Your people" below, and a circle
  opens as its own screen (back arrow, name, members, Post a task + Chat, three tabs on one line,
  a menu for Weekly report and Leave, each person's tasks collapsed).
- Chat Send button is just an arrow.
- CHALLENGES: owners and admins press "Start a challenge" on the circle's Today tab (name, intro,
  7/14/30 days, daily tasks). Members see the card, join, and the daily tasks appear in their normal
  Today list with a Challenge tag. Shared flame ring, milestones, team today.
- Warrior Kindle: "Let's go" when you join or start, "Ready for battle" the first time you open a
  challenge, "Day done" with the flaming arrow when you finish the day's challenge tasks.
- No "Move to today" on a past repeating task when today's copy is already on your list.
- Every page opens at the top when you pick it from the menu.

NOT BUILT YET: badges, points, circle rules, Wrapped, the Rive version of Kindle.


V16: DATA USE (Supabase egress)
- The circle screen used to download about 900 shared tasks (a week back and a week ahead) every
  minute while open, but only ever showed today's. Now it only gets yesterday, today and tomorrow.
- Needs: npx supabase functions deploy api

V17: the round initials badges in the circle cards, member rows and challenge screens were
stretched into ovals by a styling rule that caught them. They are round again.


V18: STREAK RECORD (monitoring)
New table streak_log, filled in automatically whenever the app works out someone's streak.
One row per person per day: the streak, best streak, whether the day counted, tasks planned and
finished, and, when the streak FELL, the day that broke it and why (for example
"2026-11-04: 3 of 7 done (43%, needs 80%); 2 moved to another day").
It only records. It never changes any streak number.

To watch it: Supabase > SQL editor, run any of these.
  Everyone's latest rows:        select * from streak_monitor limit 100;
  Streaks that dropped (today):  select * from streak_monitor where dropped_from is not null order by updated_at desc;
  One person's history:          select * from streak_monitor where email = 'their@email.com';
  Who is at 0 right now:         select * from streak_monitor where streak_current = 0 and day = current_date;

STREAK FIX: the streak calculation read tasks in one query that stops at 1,000 rows. A person with a
long task history could lose days from the count and see a streak of zero. It now reads all rows,
page by page. Streak rules (5 tasks, 80%) are unchanged.

DATA USE
- Egress: the circle screen now only gets yesterday, today and tomorrow (v16).
- Log ingestion: it follows the same traffic, so the egress fix lowers it. The scheduler also runs
  5 times less often (every 5 minutes). Reminders can arrive up to 5 minutes later; the scheduler
  now looks back 7 minutes so none are missed.


V19: DELETE A CHALLENGE
The person who started a challenge (and the circle owner) sees "Delete challenge" at the bottom of
the challenge screen. It asks first. Unfinished challenge tasks (today and later) are removed for
everyone. Finished tasks and past days stay as normal tasks, so nobody's history or streak changes.
Needs: npx supabase functions deploy api
