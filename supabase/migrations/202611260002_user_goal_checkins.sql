create table if not exists public.user_goal_checkins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goal text not null check (char_length(goal) between 1 and 120),
  cadence text not null default 'weekly'
    check (cadence in ('daily', 'weekly', 'monthly', 'yearly')),
  barrier text not null default '' check (char_length(barrier) <= 160),
  next_step text not null default '' check (char_length(next_step) <= 120),
  progress text not null default '' check (char_length(progress) <= 300),
  checkin_period text not null check (checkin_period ~ '^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$'),
  updated_at timestamptz not null default now()
);

alter table public.user_goal_checkins enable row level security;
revoke all on table public.user_goal_checkins from anon, authenticated;
grant all on table public.user_goal_checkins to service_role;
