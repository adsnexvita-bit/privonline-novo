alter table public.customers
  add column if not exists message_opt_in boolean not null default false,
  add column if not exists message_opt_in_updated_at timestamptz;

alter table public.orders
  add column if not exists checkout_name text,
  add column if not exists checkout_phone text,
  add column if not exists message_opt_in boolean not null default false;

comment on column public.customers.message_opt_in is
  'Preferência atual do cliente para receber mensagens pelo WhatsApp.';
comment on column public.orders.checkout_phone is
  'Telefone informado no momento da tentativa de pagamento.';
comment on column public.orders.message_opt_in is
  'Preferência de mensagens registrada no momento da tentativa de pagamento.';
