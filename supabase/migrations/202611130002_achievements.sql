alter table public.tasks
  add column if not exists completed_local_hour smallint
  check (completed_local_hour between 0 and 23);

create index if not exists tasks_user_completed_local_hour_idx
  on public.tasks (user_id, completed_local_hour)
  where done = true and completed_local_hour is not null;

create table if not exists public.user_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id text not null check (badge_id in (
    'first_spark',
    'task_master',
    'century_club',
    'afternoon_task_killer',
    'perfect_week',
    'routine_builder',
    'challenge_warrior'
  )),
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

alter table public.user_badges enable row level security;
revoke all on public.user_badges from anon, authenticated;
grant all on public.user_badges to service_role;
