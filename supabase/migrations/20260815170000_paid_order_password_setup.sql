alter table public.orders
  add column if not exists password_setup_consumed_at timestamptz;

comment on column public.orders.password_setup_consumed_at is
  'Marks the one-time checkout proof as consumed for password setup or reset.';
