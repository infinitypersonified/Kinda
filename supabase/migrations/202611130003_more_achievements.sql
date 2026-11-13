alter table public.user_badges
  drop constraint if exists user_badges_badge_id_check;

alter table public.user_badges
  add constraint user_badges_badge_id_check check (badge_id in (
    'first_spark',
    'task_master',
    'century_club',
    'afternoon_task_killer',
    'sunrise_spark',
    'midnight_momentum',
    'priority_pro',
    'deep_work_diver',
    'perfect_week',
    'routine_builder',
    'challenge_warrior'
  ));

create index if not exists tasks_user_priority_done_idx
  on public.tasks (user_id, priority)
  where done = true;

create index if not exists tasks_user_deep_work_done_idx
  on public.tasks (user_id, elapsed_seconds)
  where done = true;
