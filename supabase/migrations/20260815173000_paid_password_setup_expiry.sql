alter table public.orders
  add column if not exists password_setup_expires_at timestamptz;

comment on column public.orders.password_setup_expires_at is
  'Short-lived expiry for the paid checkout proof used to configure or reset a PIN.';
