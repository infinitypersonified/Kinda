-- Kinda's Supabase schema. User-owned rows reference Supabase Auth UUIDs;
-- legacy_id columns preserve Convex document IDs for an idempotent import.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  legacy_user_id text unique,
  name text not null default '',
  email text not null default '',
  bio text not null default '',
  avatar text not null default '',
  created_at timestamptz not null default now()
);
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), coalesce(new.email, ''))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create table public.circles (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  circle_id uuid not null references public.circles(id) on delete cascade,
  token text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (circle_id)
);
create table public.friendships (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  circle_id uuid not null references public.circles(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null,
  description text not null default '',
  category text not null default 'Personal',
  due_date date,
  priority text not null default 'normal',
  target_minutes integer not null default 25 check (target_minutes between 1 and 1440),
  created_at timestamptz not null default now()
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  category text not null default 'Personal',
  due_date date,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  visibility text not null default 'private' check (visibility in ('private','friends')),
  target_minutes integer not null default 25 check (target_minutes between 1 and 1440),
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  timer_started_at timestamptz,
  done boolean not null default false,
  completed_at timestamptz,
  repeat text not null default 'none' check (repeat in ('none','daily','weekdays','weekly')),
  reminder_time text not null default '',
  reminder_at timestamptz,
  reminder_sent_for timestamptz,
  tz_offset integer,
  assignment_id uuid references public.assignments(id) on delete set null,
  assigned_by_name text,
  shared_with uuid[] not null default '{}',
  series_id uuid references public.tasks(id) on delete set null,
  recurrence_job_for date,
  moved_from date[] not null default '{}',
  created_at timestamptz not null default now()
);
create table public.circle_tasks (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  circle_id uuid not null references public.circles(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  shared_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (circle_id, task_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  circle_id uuid not null references public.circles(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  reply_to uuid references public.messages(id) on delete set null,
  mentions uuid[] not null default '{}',
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create table public.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);
create table public.telegram_links (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  chat_id text not null,
  created_at timestamptz not null default now()
);
create table public.telegram_link_tokens (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null
);
create table public.google_calendar_credentials (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create table public.google_calendar_oauth_states (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null unique,
  expires_at timestamptz not null
);
create table public.google_calendar_task_links (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  event_id text not null,
  last_title text not null,
  last_description text not null default '',
  last_due_date date not null,
  updated_at timestamptz not null default now(),
  unique (user_id, task_id)
);
create table public.google_calendar_sync_states (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  syncing boolean not null default false,
  last_sync_at timestamptz,
  last_error text
);
create table public.typing (
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  from_user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  seen boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  type text not null check (type in ('created','completed')),
  created_at timestamptz not null default now()
);
create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text,
  created_at timestamptz not null default now()
);
create unique index reactions_activity_user_emoji_idx
  on public.reactions(activity_id, user_id, (coalesce(emoji, U&'\2764\FE0F')));

create index tasks_user_created_idx on public.tasks(user_id, created_at desc);
create index tasks_user_due_idx on public.tasks(user_id, due_date);
create index tasks_assignment_idx on public.tasks(assignment_id);
create index tasks_series_due_idx on public.tasks(series_id, due_date);
create index circle_members_user_idx on public.circle_members(user_id);
create index circle_tasks_circle_idx on public.circle_tasks(circle_id, created_at desc);
create index circle_tasks_task_idx on public.circle_tasks(task_id);
create index messages_circle_created_idx on public.messages(circle_id, created_at desc);
create index activities_recent_idx on public.activities(created_at desc);
create index nudges_to_created_idx on public.nudges(to_user_id, created_at desc);

-- SECURITY DEFINER helpers break membership-policy recursion. Pin search_path
-- and keep these helpers outside the exposed public schema.
create or replace function private.is_circle_member(target_circle uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.circle_members m where m.circle_id = target_circle and m.user_id = (select auth.uid()))
$$;
create or replace function private.is_circle_manager(target_circle uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.circles c where c.id = target_circle and c.owner_id = (select auth.uid()))
    or exists (select 1 from public.circle_members m where m.circle_id = target_circle and m.user_id = (select auth.uid()) and m.role = 'admin')
$$;
create or replace function private.is_friend(target_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships f where f.user_id = (select auth.uid()) and f.friend_id = target_user)
$$;
create or replace function private.shares_circle(target_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.circle_members mine
    join public.circle_members peer on peer.circle_id = mine.circle_id
    where mine.user_id = (select auth.uid()) and peer.user_id = target_user
  )
$$;
revoke execute on function private.is_circle_member(uuid) from public, anon;
revoke execute on function private.is_circle_manager(uuid) from public, anon;
revoke execute on function private.is_friend(uuid) from public, anon;
revoke execute on function private.shares_circle(uuid) from public, anon;
revoke execute on function private.handle_new_user() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_circle_member(uuid), private.is_circle_manager(uuid), private.is_friend(uuid), private.shares_circle(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.invites enable row level security;
alter table public.friendships enable row level security;
alter table public.assignments enable row level security;
alter table public.tasks enable row level security;
alter table public.circle_tasks enable row level security;
alter table public.messages enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.calendar_feeds enable row level security;
alter table public.telegram_links enable row level security;
alter table public.telegram_link_tokens enable row level security;
alter table public.google_calendar_credentials enable row level security;
alter table public.google_calendar_oauth_states enable row level security;
alter table public.google_calendar_task_links enable row level security;
alter table public.google_calendar_sync_states enable row level security;
alter table public.typing enable row level security;
alter table public.nudges enable row level security;
alter table public.activities enable row level security;
alter table public.reactions enable row level security;

-- Start closed: only authenticated users receive table access, and each table
-- has explicit policies. Never expose a Supabase secret/service key in Vite.
revoke all on all tables in schema public from anon, authenticated;
-- The browser only reads through Realtime. All writes go through the API
-- Edge Function using a server-side key, where ownership rules are checked.
grant select on all tables in schema public to authenticated;

create policy "profiles read self or friend" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_friend(id)) or (select private.shares_circle(id)));
create policy "profiles insert self" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "profiles update self" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "circles read members" on public.circles for select to authenticated
  using ((select private.is_circle_member(id)));
create policy "circles create as owner" on public.circles for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "circles manager update" on public.circles for update to authenticated
  using ((select private.is_circle_manager(id))) with check ((select private.is_circle_manager(id)));
create policy "circles owner delete" on public.circles for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "members read circle" on public.circle_members for select to authenticated
  using ((select private.is_circle_member(circle_id)));
create policy "managers add members" on public.circle_members for insert to authenticated
  with check ((select private.is_circle_manager(circle_id)));
create policy "managers update membership" on public.circle_members for update to authenticated
  using ((select private.is_circle_manager(circle_id)))
  with check ((select private.is_circle_manager(circle_id)));
create policy "managers or self remove membership" on public.circle_members for delete to authenticated
  using ((select private.is_circle_manager(circle_id)) or user_id = (select auth.uid()));

create policy "invites manager read" on public.invites for select to authenticated
  using ((select private.is_circle_manager(circle_id)));
create policy "invites manager create" on public.invites for insert to authenticated
  with check ((select private.is_circle_manager(circle_id)) and created_by = (select auth.uid()));
create policy "invites manager update" on public.invites for update to authenticated
  using ((select private.is_circle_manager(circle_id))) with check ((select private.is_circle_manager(circle_id)));
create policy "invites manager delete" on public.invites for delete to authenticated
  using ((select private.is_circle_manager(circle_id)));

create policy "friendships read own" on public.friendships for select to authenticated
  using (user_id = (select auth.uid()) or friend_id = (select auth.uid()));
create policy "friendships create own" on public.friendships for insert to authenticated
  with check (user_id = (select auth.uid()) or friend_id = (select auth.uid()));
create policy "friendships delete own" on public.friendships for delete to authenticated
  using (user_id = (select auth.uid()) or friend_id = (select auth.uid()));

create policy "tasks read owner or shared circle or friend" on public.tasks for select to authenticated
  using (user_id = (select auth.uid())
    or (visibility = 'friends' and (select private.is_friend(user_id))
      and (cardinality(shared_with) = 0 or (select auth.uid()) = any(shared_with)))
    or exists (select 1 from public.circle_tasks ct where ct.task_id = id and (select private.is_circle_member(ct.circle_id))));
create policy "tasks insert own" on public.tasks for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "tasks update own" on public.tasks for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "tasks delete own" on public.tasks for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "circle tasks read members" on public.circle_tasks for select to authenticated
  using ((select private.is_circle_member(circle_id)));
create policy "circle tasks create own task" on public.circle_tasks for insert to authenticated
  with check (shared_by = (select auth.uid()) and (select private.is_circle_member(circle_id))
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid())));
create policy "circle tasks manager delete or owner unlink" on public.circle_tasks for delete to authenticated
  using ((select private.is_circle_manager(circle_id)) or shared_by = (select auth.uid()));

create policy "assignments read circle" on public.assignments for select to authenticated
  using ((select private.is_circle_member(circle_id)));
create policy "assignments manager create" on public.assignments for insert to authenticated
  with check ((select private.is_circle_manager(circle_id)) and created_by = (select auth.uid()));
create policy "assignments manager update" on public.assignments for update to authenticated
  using ((select private.is_circle_manager(circle_id))) with check ((select private.is_circle_manager(circle_id)));
create policy "assignments manager delete" on public.assignments for delete to authenticated
  using ((select private.is_circle_manager(circle_id)));

create policy "messages read members" on public.messages for select to authenticated
  using ((select private.is_circle_member(circle_id)));
create policy "messages send as self" on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and (select private.is_circle_member(circle_id)));
create policy "messages edit own" on public.messages for update to authenticated
  using (sender_id = (select auth.uid()) and (select private.is_circle_member(circle_id)))
  with check (sender_id = (select auth.uid()) and (select private.is_circle_member(circle_id)));
create policy "messages delete own or manager" on public.messages for delete to authenticated
  using (sender_id = (select auth.uid()) or (select private.is_circle_manager(circle_id)));

create policy "typing read circle" on public.typing for select to authenticated
  using ((select private.is_circle_member(circle_id)));
create policy "typing set own" on public.typing for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_circle_member(circle_id)));
create policy "typing update own" on public.typing for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "typing remove own" on public.typing for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "push subscriptions self" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "calendar feed self" on public.calendar_feeds for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "telegram links self" on public.telegram_links for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "telegram tokens self" on public.telegram_link_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "calendar credentials self" on public.google_calendar_credentials for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "calendar oauth states self" on public.google_calendar_oauth_states for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "calendar links self" on public.google_calendar_task_links for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "calendar sync state self" on public.google_calendar_sync_states for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "nudges read sender or recipient" on public.nudges for select to authenticated
  using (to_user_id = (select auth.uid()) or from_user_id = (select auth.uid()));
create policy "nudges create as sender" on public.nudges for insert to authenticated
  with check (from_user_id = (select auth.uid()));
create policy "recipients update own nudge" on public.nudges for update to authenticated
  using (to_user_id = (select auth.uid())) with check (to_user_id = (select auth.uid()));
create policy "sender delete own nudge" on public.nudges for delete to authenticated
  using (from_user_id = (select auth.uid()) or to_user_id = (select auth.uid()));
create policy "activities read self or friend" on public.activities for select to authenticated
  using (user_id = (select auth.uid()) or (
    (select private.is_friend(user_id)) and exists (
      select 1 from public.tasks t where t.id = task_id and t.visibility = 'friends'
        and (cardinality(t.shared_with) = 0 or (select auth.uid()) = any(t.shared_with))
    )
  ));
create policy "activities create self" on public.activities for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = (select auth.uid())));
create policy "reactions read activity audience" on public.reactions for select to authenticated
  using (exists (
    select 1 from public.activities a join public.tasks t on t.id = a.task_id
    where a.id = activity_id and (
      a.user_id = (select auth.uid()) or (
        (select private.is_friend(a.user_id)) and t.visibility = 'friends'
        and (cardinality(t.shared_with) = 0 or (select auth.uid()) = any(t.shared_with))
      )
    )
  ));
create policy "reactions manage own" on public.reactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Realtime is used for live task/circle/chat updates by the client.
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.circles;
alter publication supabase_realtime add table public.circle_tasks;
alter publication supabase_realtime add table public.circle_members;
alter publication supabase_realtime add table public.assignments;
alter publication supabase_realtime add table public.friendships;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.typing;
alter publication supabase_realtime add table public.activities;
alter publication supabase_realtime add table public.nudges;
