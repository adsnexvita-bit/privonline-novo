alter table public.plans
  add column if not exists access_type text not null default 'lifetime',
  add column if not exists duration_days integer,
  add column if not exists is_featured boolean not null default false,
  add column if not exists eyebrow_text text;

alter table public.plans
  drop constraint if exists plans_access_type_check,
  add constraint plans_access_type_check
    check (access_type in ('lifetime', 'subscription')),
  drop constraint if exists plans_duration_days_check,
  add constraint plans_duration_days_check
    check (
      (access_type = 'lifetime' and duration_days is null)
      or
      (access_type = 'subscription' and duration_days is not null and duration_days > 0)
    );

alter table public.plan_models
  drop constraint if exists plan_models_model_id_key;

alter table public.orders
  add column if not exists plan_id uuid references public.plans(id) on delete set null;

-- Existing plans remain lifetime plans. Use the highlighted plan as the public
-- base price when one is configured; otherwise prefer a lifetime plan.
create or replace function public.sync_plan_model_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_model_id uuid;
  selected_price numeric(10, 2);
begin
  target_model_id := case when tg_op = 'DELETE' then old.model_id else new.model_id end;

  select p.price
    into selected_price
    from public.plan_models pm
    join public.plans p on p.id = pm.plan_id
   where pm.model_id = target_model_id
     and p.is_active
   order by p.is_featured desc, (p.access_type = 'lifetime') desc, p.created_at asc
   limit 1;

  update public.models
     set price = coalesce(selected_price, 0)
   where id = target_model_id;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.sync_model_price_for_plan(target_model_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_price numeric(10, 2);
begin
  select p.price
    into selected_price
    from public.plan_models pm
    join public.plans p on p.id = pm.plan_id
   where pm.model_id = target_model_id
     and p.is_active
   order by p.is_featured desc, (p.access_type = 'lifetime') desc, p.created_at asc
   limit 1;

  update public.models
     set price = coalesce(selected_price, 0)
   where id = target_model_id;
end;
$$;

create or replace function public.sync_plan_prices()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_model_id uuid;
begin
  for assigned_model_id in
    select pm.model_id from public.plan_models pm where pm.plan_id = new.id
  loop
    perform public.sync_model_price_for_plan(assigned_model_id);
  end loop;
  return new;
end;
$$;

create or replace function public.touch_plan_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_plan_updated_at_trigger on public.plans;
create trigger touch_plan_updated_at_trigger
before update on public.plans
for each row execute function public.touch_plan_updated_at();

drop trigger if exists sync_plan_prices_trigger on public.plans;
create trigger sync_plan_prices_trigger
after update on public.plans
for each row execute function public.sync_plan_prices();
