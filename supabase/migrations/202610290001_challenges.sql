-- Circle challenges: a named, time-boxed goal with a daily plan the whole circle can join.
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  intro text not null default '' check (char_length(intro) <= 500),
  starts_on date not null,
  days integer not null check (days between 3 and 60),
  daily_tasks text[] not null check (array_length(daily_tasks, 1) between 1 and 8),
  created_at timestamptz not null default now()
);
create index if not exists challenges_circle_idx on public.challenges (circle_id, starts_on desc);

create table if not exists public.challenge_members (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

-- Challenge tasks are normal tasks with a link back to their challenge.
alter table public.tasks add column if not exists challenge_id uuid references public.challenges(id) on delete set null;
create index if not exists tasks_challenge_idx on public.tasks (challenge_id, due_date);

alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;
