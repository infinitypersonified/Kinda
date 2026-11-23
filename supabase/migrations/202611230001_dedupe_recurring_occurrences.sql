-- Keep one task per recurring series and due date. Prefer a completed copy so
-- cleanup never reopens work the user already finished.
with ranked as (
  select id,
         row_number() over (
           partition by user_id, series_id, due_date
           order by done desc, created_at asc, id asc
         ) as position
  from public.tasks
  where repeat <> 'none'
    and series_id is not null
    and due_date is not null
)
delete from public.tasks t
using ranked r
where t.id = r.id
  and r.position > 1;

create unique index if not exists tasks_recurring_series_due_unique
  on public.tasks (user_id, series_id, due_date)
  where repeat <> 'none'
    and series_id is not null
    and due_date is not null;
