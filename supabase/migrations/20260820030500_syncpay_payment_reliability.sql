-- Expand-only payment reliability metadata. Existing orders and statuses are untouched.
alter table public.orders
  add column if not exists payment_last_checked_at timestamptz;

alter table public.orders
  drop constraint if exists orders_payment_confirmed_by_check;
alter table public.orders
  add constraint orders_payment_confirmed_by_check
  check (
    payment_confirmed_by is null
    or payment_confirmed_by in (
      'webhook',
      'polling',
      'api_reconciliation',
      'manual_reconciliation',
      'manual'
    )
  );

create index if not exists idx_orders_syncpay_pending_check_priority
  on public.orders (payment_last_checked_at asc nulls first, created_at desc, id)
  where payment_provider = 'syncpay'
    and payment_status = 'pending'
    and transaction_identifier is not null;

comment on column public.orders.payment_last_checked_at is
  'Last provider status lookup attempt; used to prioritize pending SyncPay reconciliation.';
comment on column public.orders.payment_confirmed_by is
  'First trusted path that transitioned the order to paid: webhook, polling, api_reconciliation or manual_reconciliation. Legacy manual is retained for compatibility.';
