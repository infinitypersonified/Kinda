-- Remember whether a member shares their challenge tasks with the challenge circle.
alter table public.challenge_members
  add column if not exists share_tasks_to_circle boolean not null default false;

-- Preserve members' existing opt-in when they have already shared a challenge task.
update public.challenge_members as cm
set share_tasks_to_circle = true
from public.challenges as c
where c.id = cm.challenge_id
  and exists (
    select 1
    from public.tasks as t
    join public.circle_tasks as ct on ct.task_id = t.id
    where t.challenge_id = cm.challenge_id
      and t.user_id = cm.user_id
      and ct.circle_id = c.circle_id
      and ct.shared_by = cm.user_id
  );
