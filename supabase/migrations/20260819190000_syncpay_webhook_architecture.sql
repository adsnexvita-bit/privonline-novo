-- Expand-only migration: preserve the existing webhook event history and add
-- the audit fields required by the dedicated SyncPay payment flow.
alter table public.orders
  add column if not exists payment_confirmed_by text;

alter table public.orders
  drop constraint if exists orders_payment_confirmed_by_check;
alter table public.orders
  add constraint orders_payment_confirmed_by_check
  check (payment_confirmed_by is null or payment_confirmed_by in ('webhook', 'api_reconciliation', 'manual'));

alter table public.webhook_events
  add column if not exists gateway_status text;

create index if not exists idx_webhook_events_provider_transaction_received
  on public.webhook_events (provider, transaction_identifier, received_at desc);

comment on table public.webhook_events is
  'Durable original payment webhook deliveries. Payload must never contain application secrets.';
comment on column public.orders.payment_confirmed_by is
  'First trusted path that transitioned the order to paid: webhook, api_reconciliation or manual.';
