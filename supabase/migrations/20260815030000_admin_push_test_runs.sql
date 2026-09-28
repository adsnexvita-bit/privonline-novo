create table if not exists public.admin_push_test_runs (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  subscription_id uuid not null references public.admin_push_subscriptions(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 50),
  interval_seconds integer not null check (interval_seconds >= 5),
  sent_count integer not null default 0,
  status text not null default 'running' check (status in ('running','completed','cancelled','failed')),
  next_send_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists idx_admin_push_test_runs_owner on public.admin_push_test_runs(auth_user_id, created_at desc);
alter table public.admin_push_test_runs enable row level security;
grant all on public.admin_push_test_runs to service_role;
