-- Keep Better Auth scrypt hashes private until each user logs in once.
-- The Edge Function verifies a hash, installs the submitted password in
-- Supabase Auth, then deletes that user's legacy hash.
create table if not exists public.legacy_password_import (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.legacy_password_import enable row level security;
revoke all on public.legacy_password_import from anon, authenticated;
grant select, insert, update, delete on public.legacy_password_import to service_role;

create table if not exists private.legacy_password_attempts (
  bucket text primary key,
  window_started_at timestamptz not null,
  attempts integer not null default 0
);

create or replace function public.consume_legacy_password_attempt(
  p_email_hash text,
  p_ip_hash text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  email_attempts integer;
  ip_attempts integer := 0;
begin
  insert into private.legacy_password_attempts as existing
    (bucket, window_started_at, attempts)
  values ('email:' || p_email_hash, v_now, 1)
  on conflict (bucket) do update set
    attempts = case
      when existing.window_started_at < v_now - interval '15 minutes' then 1
      else existing.attempts + 1
    end,
    window_started_at = case
      when existing.window_started_at < v_now - interval '15 minutes' then v_now
      else existing.window_started_at
    end
  returning attempts into email_attempts;

  if p_ip_hash is not null and p_ip_hash <> '' then
    insert into private.legacy_password_attempts as existing
      (bucket, window_started_at, attempts)
    values ('ip:' || p_ip_hash, v_now, 1)
    on conflict (bucket) do update set
      attempts = case
        when existing.window_started_at < v_now - interval '15 minutes' then 1
        else existing.attempts + 1
      end,
      window_started_at = case
        when existing.window_started_at < v_now - interval '15 minutes' then v_now
        else existing.window_started_at
      end
    returning attempts into ip_attempts;
  end if;

  return email_attempts <= 10 and (p_ip_hash is null or p_ip_hash = '' or ip_attempts <= 30);
end;
$$;
revoke all on function public.consume_legacy_password_attempt(text, text) from public, anon, authenticated;
grant execute on function public.consume_legacy_password_attempt(text, text) to service_role;
