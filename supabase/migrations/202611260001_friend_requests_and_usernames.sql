-- Public discoverability uses unique usernames; friendships require acceptance.
alter table public.profiles
  add column if not exists username text;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null and username <> '';

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_user_id <> to_user_id),
  unique (from_user_id, to_user_id)
);

create index if not exists friend_requests_recipient_status_idx
  on public.friend_requests (to_user_id, status, created_at desc);
create index if not exists friend_requests_sender_status_idx
  on public.friend_requests (from_user_id, status, created_at desc);

alter table public.friend_requests enable row level security;
create policy "users read their friend requests" on public.friend_requests
  for select to authenticated
  using (from_user_id = (select auth.uid()) or to_user_id = (select auth.uid()));
