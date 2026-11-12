create table public.onboarding_surveys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reasons text[] not null default '{}',
  referral_source text,
  skipped boolean not null default false,
  created_at timestamptz not null default now(),
  constraint onboarding_surveys_reasons_check check (
    reasons <@ array[
      'focus',
      'habits',
      'accountability',
      'friends',
      'circle',
      'other'
    ]::text[]
  ),
  constraint onboarding_surveys_source_check check (
    referral_source is null or referral_source in (
      'friend',
      'social_media',
      'search',
      'community',
      'other',
      'prefer_not_to_say'
    )
  ),
  constraint onboarding_surveys_answer_check check (
    skipped or cardinality(reasons) > 0
  )
);

alter table public.onboarding_surveys enable row level security;
revoke all on table public.onboarding_surveys from anon, authenticated;
grant all on table public.onboarding_surveys to service_role;
