-- Lets a repeating task choose its own weekdays, stored like 'custom:1,3,5'
-- (1 = Monday ... 7 = Sunday). Existing repeat options are unchanged.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.tasks'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%repeat%'
  loop
    execute format('alter table public.tasks drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.tasks add constraint tasks_repeat_check
  check (repeat ~ '^(none|daily|weekdays|weekly|custom:[1-7](,[1-7]){0,6})$');
