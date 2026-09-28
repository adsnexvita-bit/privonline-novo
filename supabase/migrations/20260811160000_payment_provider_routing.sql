-- Records the payment gateway that created each PIX so confirmations always
-- go back to the correct provider.
alter table public.orders
  add column if not exists payment_provider text not null default 'syncpay';

alter table public.orders
  drop constraint if exists orders_payment_provider_check;

alter table public.orders
  add constraint orders_payment_provider_check
  check (payment_provider in ('syncpay', 'pushinpay'));

create index if not exists idx_orders_payment_provider
  on public.orders (payment_provider);
