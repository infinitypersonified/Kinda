create table if not exists public.streak_push_reminders (
  user_id uuid primary key references auth.users(id) on delete cascade,
  day date not null,
  sent_at timestamptz not null default now()
);

alter table public.streak_push_reminders enable row level security;
revoke all on public.streak_push_reminders from anon, authenticated;
