alter table public.streak_log
  add column if not exists qualified_once boolean not null default false;

update public.streak_log
set qualified_once = true
where qualified = true and qualified_once = false;

create or replace view public.streak_monitor
with (security_invoker = true) as
select l.day, p.name, p.email, l.streak_current, l.streak_best, l.qualified,
       l.total, l.done, l.dropped_from, l.reason, l.tasks_loaded, l.tz_offset,
       l.updated_at, l.qualified_once
from public.streak_log l
join public.profiles p on p.id = l.user_id
order by l.day desc, l.updated_at desc;

revoke all on public.streak_monitor from anon, authenticated;
