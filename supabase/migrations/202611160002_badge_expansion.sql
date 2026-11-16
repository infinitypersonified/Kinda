alter table public.user_badges
  drop constraint if exists user_badges_badge_id_check;

alter table public.user_badges
  add constraint user_badges_badge_id_check check (badge_id in (
    'first_spark',
    'task_master',
    'half_century',
    'century_club',
    'task_titan',
    'task_legend',
    'five_hundred_strong',
    'four_digit_force',
    'afternoon_task_killer',
    'sunrise_spark',
    'midnight_momentum',
    'priority_pro',
    'deep_work_diver',
    'perfect_week',
    'routine_builder',
    'challenge_warrior',
    'monthly_50',
    'monthly_100',
    'monthly_20_days',
    'perfect_month',
    'monthly_mix',
    'weekend_month',
    'focus_month',
    'personal_50',
    'work_25',
    'learning_25',
    'building_25',
    'creative_25',
    'health_25',
    'fitness_25',
    'relationships_25',
    'finance_10',
    'home_25',
    'community_10'
  ));

create index if not exists tasks_user_category_done_idx
  on public.tasks (user_id, category)
  where done = true;

create index if not exists tasks_user_completed_at_done_idx
  on public.tasks (user_id, completed_at)
  where done = true and completed_at is not null;
