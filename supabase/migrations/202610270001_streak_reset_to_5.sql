-- Streaks are calculated from task history. This adds a one-time starting point:
-- the 5 days before streak_base_date count as completed, and anything before
-- that is ignored, so every existing member's streak is exactly 5 today and
-- grows from there. Only profiles that have not been set yet are touched, so
-- running this twice will not reset anyone again.
alter table public.profiles
  add column if not exists streak_base integer not null default 0,
  add column if not exists streak_base_date date;

update public.profiles
set streak_base = 5,
    streak_base_date = current_date
where streak_base_date is null;
