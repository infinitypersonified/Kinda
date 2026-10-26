-- Some existing Supabase databases were created before reminder tracking was
-- added to the task schema. The API and scheduler select this field.
alter table public.tasks
  add column if not exists reminder_sent_for timestamptz;
