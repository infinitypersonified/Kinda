-- The activity feed subscribes to reactions as well as activities and tasks.
-- Keep this idempotent so it works with both fresh and existing projects.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reactions'
  ) then
    execute 'alter publication supabase_realtime add table public.reactions';
  end if;
end
$$;
