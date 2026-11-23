begin;

-- First remove duplicate dates within a series so the existing series/date
-- unique index remains valid when duplicate chains are merged below.
with ranked as (
  select id,
         row_number() over (
           partition by user_id, series_id, due_date
           order by done desc, created_at asc, id asc
         ) as position
  from public.tasks
  where repeat <> 'none'
    and assignment_id is null
    and series_id is not null
    and due_date is not null
)
delete from public.tasks t
using ranked r
where t.id = r.id
  and r.position > 1;

-- Older duplicate chains can have different series IDs. Keep one recurring
-- task per owner, title, and date, preferring completed work.
with ranked as (
  select id,
         row_number() over (
           partition by user_id, title, due_date
           order by done desc,
                    exists (
                      select 1
                      from public.circle_tasks ct
                      where ct.task_id = tasks.id
                    ) desc,
                    created_at asc,
                    id asc
         ) as position
  from public.tasks tasks
  where tasks.repeat <> 'none'
    and tasks.assignment_id is null
    and tasks.due_date is not null
)
delete from public.tasks t
using ranked r
where t.id = r.id
  and r.position > 1;

-- Reattach identical recurring roots and their occurrences to one chain. This
-- ensures deleting a recurring task stops every old duplicate chain too.
with canonical as (
  select distinct on (user_id, title, repeat)
         user_id,
         title,
         repeat,
         id as root_id
  from public.tasks
  where repeat <> 'none'
    and assignment_id is null
  order by user_id, title, repeat, created_at asc, id asc
)
update public.tasks t
set series_id = canonical.root_id
from canonical
where t.user_id = canonical.user_id
  and t.title = canonical.title
  and t.repeat = canonical.repeat
  and t.assignment_id is null
  and t.series_id is distinct from canonical.root_id;

create unique index if not exists tasks_recurring_title_due_unique
  on public.tasks (user_id, title, due_date)
  where repeat <> 'none'
    and assignment_id is null
    and due_date is not null;

commit;
