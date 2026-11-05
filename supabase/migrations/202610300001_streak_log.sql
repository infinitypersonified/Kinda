-- A running record of what each person's streak was, day by day, so you can see when and why
-- one drops. The app writes to it automatically whenever it works out a streak. It only records;
-- it never changes how the streak is calculated.
create table if not exists public.streak_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  streak_current integer not null,
  streak_best integer not null,
  qualified boolean not null,
  total integer not null,
  done integer not null,
  tasks_loaded integer not null default 0,
  tz_offset integer not null default 0,
  dropped_from integer,
  reason text,
  first_seen timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index if not exists streak_log_day_idx on public.streak_log (day desc);
alter table public.streak_log enable row level security;

-- Easy-to-read view for the Supabase table editor / SQL editor. Not reachable from the app.
create or replace view public.streak_monitor with (security_invoker = true) as
select l.day, p.name, p.email, l.streak_current, l.streak_best, l.qualified, l.total, l.done,
       l.dropped_from, l.reason, l.tasks_loaded, l.tz_offset, l.updated_at
from public.streak_log l
join public.profiles p on p.id = l.user_id
order by l.day desc, l.updated_at desc;
revoke all on public.streak_monitor from anon, authenticated;
revoke all on public.streak_log from anon, authenticated;
