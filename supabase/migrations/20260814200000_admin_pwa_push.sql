create table if not exists public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_push_subscriptions_active_idx
  on public.admin_push_subscriptions (is_active, auth_user_id);

create table if not exists public.admin_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.admin_push_subscriptions(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (subscription_id, order_id)
);

alter table public.admin_push_subscriptions enable row level security;
alter table public.admin_push_deliveries enable row level security;

drop policy if exists "Admins manage their own push subscriptions" on public.admin_push_subscriptions;
create policy "Admins manage their own push subscriptions"
  on public.admin_push_subscriptions
  for all
  to authenticated
  using (auth_user_id = auth.uid() and public.is_admin(auth.uid()))
  with check (auth_user_id = auth.uid() and public.is_admin(auth.uid()));

grant select, insert, update, delete on public.admin_push_subscriptions to authenticated;

comment on table public.admin_push_subscriptions is
  'Push subscriptions for the installable admin dashboard PWA.';
comment on table public.admin_push_deliveries is
  'Deduplicates approved-sale push notifications per device and order.';
