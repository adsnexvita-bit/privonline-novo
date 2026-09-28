alter table public.customer_access
  add column if not exists plan_id uuid references public.plans(id) on delete set null;

create index if not exists idx_customer_access_plan
  on public.customer_access (plan_id)
  where plan_id is not null;

comment on column public.customer_access.plan_id is
  'Plano que determinou a validade do acesso, inclusive em concessões manuais.';
