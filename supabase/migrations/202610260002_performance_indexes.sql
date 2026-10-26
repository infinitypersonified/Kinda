-- Index the filters and sort orders used by the API and one-minute scheduler.
-- Existing primary-key and unique indexes continue to cover identity lookups.
create index if not exists tasks_due_reminders_idx
  on public.tasks (reminder_at)
  where reminder_at is not null and done = false;

create index if not exists tasks_recurring_due_idx
  on public.tasks (due_date)
  where due_date is not null and repeat <> 'none';

create index if not exists tasks_friend_feed_idx
  on public.tasks (user_id, done, created_at desc)
  where visibility = 'friends';

create index if not exists assignments_circle_created_idx
  on public.assignments (circle_id, created_at desc);

create index if not exists activities_user_created_idx
  on public.activities (user_id, created_at desc);

create index if not exists nudges_sender_task_created_idx
  on public.nudges (from_user_id, task_id, created_at desc);
