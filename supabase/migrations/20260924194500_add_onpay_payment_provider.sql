alter table public.orders
  drop constraint if exists orders_payment_provider_check;

alter table public.orders
  add constraint orders_payment_provider_check
  check (payment_provider in ('syncpay', 'pushinpay', 'onpay'))
  not valid;

alter table public.orders
  validate constraint orders_payment_provider_check;
