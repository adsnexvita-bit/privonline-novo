-- A pending Pix belongs to checkout data, not to an application account.
alter table public.customers
  add column if not exists normalized_phone text,
  add column if not exists message_opt_in boolean not null default false,
  add column if not exists message_opt_in_updated_at timestamptz;

alter table public.orders
  alter column customer_id drop not null,
  add column if not exists checkout_name text,
  add column if not exists checkout_phone text,
  add column if not exists normalized_phone text,
  add column if not exists message_opt_in boolean not null default false,
  add column if not exists checkout_token text;

create unique index if not exists uq_orders_checkout_token
  on public.orders(checkout_token) where checkout_token is not null;

create table if not exists public.customer_phone_identities (
  normalized_phone text primary key check (normalized_phone ~ '^55[0-9]{10,11}$'),
  customer_id uuid not null references public.customers(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.customer_phone_identities enable row level security;
grant all on public.customer_phone_identities to service_role;

create index if not exists idx_customers_normalized_phone on public.customers(normalized_phone);
create index if not exists idx_orders_normalized_phone on public.orders(normalized_phone);

comment on column public.orders.checkout_phone is
  'Telefone do comprador preservado no pedido pendente; não representa uma conta.';
comment on column public.orders.checkout_token is
  'Token opaco usado para consultar o Pix antes da criação da conta.';
