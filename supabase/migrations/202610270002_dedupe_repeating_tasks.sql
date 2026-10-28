-- 1. Lock so only one scheduler run happens at a time (overlapping runs are
--    what created the duplicate copies of repeating tasks).
create table if not exists public.scheduler_lock (
  id integer primary key,
  locked_until timestamptz not null default '1970-01-01T00:00:00Z'
);
alter table public.scheduler_lock enable row level security;
insert into public.scheduler_lock (id) values (1) on conflict (id) do nothing;

-- 2. Remove duplicate copies of repeating tasks, keeping one per person, title
--    and day. Prefers a finished copy, then one shared to a circle, then the
--    oldest. Assigned tasks and non-repeating tasks are never touched.
begin;

create temp table dup_ids on commit drop as
select id from (
  select t.id,
         row_number() over (
           partition by t.user_id, t.title, t.due_date
           order by t.done desc,
                    exists (select 1 from public.circle_tasks ct where ct.task_id = t.id) desc,
                    t.created_at asc,
                    t.id asc
         ) as rn
  from public.tasks t
  where t.repeat <> 'none'
    and t.due_date is not null
    and t.assignment_id is null
) ranked
where rn > 1;

delete from public.tasks where id in (select id from dup_ids);

-- 3. Put what is left back into one series per repeating task, so deleting
--    copies cannot leave several parallel chains that keep making new ones.
with canon as (
  select distinct on (user_id, title, repeat)
         id as canon_id, user_id, title, repeat
  from public.tasks
  where repeat <> 'none' and assignment_id is null
  order by user_id, title, repeat, created_at asc, id asc
)
update public.tasks t
set series_id = c.canon_id
from canon c
where t.user_id = c.user_id
  and t.title = c.title
  and t.repeat = c.repeat
  and t.repeat <> 'none'
  and t.assignment_id is null
  and t.series_id is distinct from c.canon_id;

commit;
