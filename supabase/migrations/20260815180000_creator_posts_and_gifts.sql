create table if not exists public.creator_posts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.models(id) on delete cascade,
  caption text not null default '' check (char_length(caption) <= 5000),
  media_key text not null check (media_key like 'r2://models/%'),
  media_type text not null check (media_type in ('image', 'video')),
  published_at timestamptz not null default now(),
  is_active boolean not null default true,
  likes_count integer not null default 0 check (likes_count >= 0),
  fire_count integer not null default 0 check (fire_count >= 0),
  heart_eyes_count integer not null default 0 check (heart_eyes_count >= 0),
  laugh_count integer not null default 0 check (laugh_count >= 0),
  clap_count integer not null default 0 check (clap_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_creator_posts_feed
  on public.creator_posts(creator_id, published_at desc) where is_active;

create table if not exists public.creator_gifts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.models(id) on delete restrict,
  post_id uuid references public.creator_posts(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  buyer_phone text not null,
  amount numeric(12,2) not null check (amount >= 1),
  transaction_identifier text unique,
  payment_provider text not null default 'syncpay' check (payment_provider = 'syncpay'),
  status text not null default 'pending' check (status in ('pending','paid','failed','cancelled','refunded','chargeback')),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_creator_gifts_creator_status
  on public.creator_gifts(creator_id, status, created_at desc);
create index if not exists idx_creator_gifts_customer
  on public.creator_gifts(customer_id, created_at desc);

alter table public.creator_posts enable row level security;
alter table public.creator_gifts enable row level security;
grant all on public.creator_posts to service_role;
grant all on public.creator_gifts to service_role;

comment on table public.creator_posts is 'Feed privado exibido somente após autorização server-side de acesso pago.';
comment on table public.creator_gifts is 'PIX de presente independente de pedidos de acesso, grantAccess e Meta Purchase.';
