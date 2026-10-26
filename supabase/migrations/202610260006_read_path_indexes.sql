-- Targeted indexes for Kinda's most common user-scoped reads.
-- Apply this migration once using the Supabase migration workflow.
create index if not exists tasks_user_created_id_idx
  on public.tasks (user_id, created_at desc, id asc);

create index if not exists circle_members_user_circle_idx
  on public.circle_members (user_id, circle_id);

-- The existing circle_tasks_task_idx covers task_id lookups. This index
-- supports the task-to-circle join while preserving the existing unique key.
create index if not exists circle_tasks_task_circle_idx
  on public.circle_tasks (task_id, circle_id);
