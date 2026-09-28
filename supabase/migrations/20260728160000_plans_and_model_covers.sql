alter table public.models
  add column if not exists profile_cover_image_path text;

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  price numeric(10, 2) not null default 0 check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_models (
  plan_id uuid not null references public.plans(id) on delete cascade,
  model_id uuid not null unique references public.models(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, model_id)
);

alter table public.plans enable row level security;
alter table public.plan_models enable row level security;

drop policy if exists "Admins manage plans" on public.plans;
create policy "Admins manage plans"
  on public.plans for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Admins manage plan models" on public.plan_models;
create policy "Admins manage plan models"
  on public.plan_models for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

grant select, insert, update, delete on public.plans to authenticated;
grant select, insert, update, delete on public.plan_models to authenticated;

create or replace function public.sync_plan_model_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.models set price = 0 where id = old.model_id;
    return old;
  end if;

  update public.models
  set price = (select price from public.plans where id = new.plan_id)
  where id = new.model_id;
  return new;
end;
$$;

drop trigger if exists sync_plan_model_price_trigger on public.plan_models;
create trigger sync_plan_model_price_trigger
after insert or update or delete on public.plan_models
for each row execute function public.sync_plan_model_price();

create or replace function public.sync_plan_prices()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price is distinct from old.price then
    update public.models m
    set price = new.price
    from public.plan_models pm
    where pm.plan_id = new.id and pm.model_id = m.id;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sync_plan_prices_trigger on public.plans;
create trigger sync_plan_prices_trigger
before update on public.plans
for each row execute function public.sync_plan_prices();

insert into public.plans (name, price)
select
  case
    when price = 0 then 'Acesso gratuito'
    else 'Plano R$ ' || replace(to_char(price, 'FM999999990.00'), '.', ',')
  end,
  price
from public.models
group by price;

insert into public.plan_models (plan_id, model_id)
select p.id, m.id
from public.models m
join public.plans p on p.price = m.price
where not exists (
  select 1 from public.plan_models pm where pm.model_id = m.id
);

drop view if exists public.models_public;
create view public.models_public
with (security_invoker = true)
as
select
  id,
  name,
  username,
  slug,
  short_description,
  full_description,
  profile_image_path,
  cover_image_path,
  profile_cover_image_path,
  price,
  is_featured,
  display_order,
  created_at,
  photo_count,
  video_count
from public.models
where is_active = true;

grant select on public.models_public to anon, authenticated;
