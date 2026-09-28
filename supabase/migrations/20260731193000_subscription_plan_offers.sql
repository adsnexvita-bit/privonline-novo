create table if not exists public.plan_offers (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  duration_days integer not null check (duration_days > 0),
  price numeric(10, 2) not null check (price >= 0),
  is_primary boolean not null default false,
  tag_text text,
  tag_color text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_offers_tag_color_check
    check (tag_color is null or tag_color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index if not exists plan_offers_one_primary_per_plan
  on public.plan_offers (plan_id)
  where is_primary;

create index if not exists idx_plan_offers_plan_order
  on public.plan_offers (plan_id, is_primary desc, display_order asc);

alter table public.plan_offers enable row level security;

drop policy if exists "Admins manage plan offers" on public.plan_offers;
create policy "Admins manage plan offers"
  on public.plan_offers for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

grant select, insert, update, delete on public.plan_offers to authenticated;

insert into public.plan_offers
  (plan_id, duration_days, price, is_primary, tag_text, tag_color, display_order)
select
  p.id,
  p.duration_days,
  p.price,
  true,
  null,
  null,
  0
from public.plans p
where p.access_type = 'subscription'
  and p.duration_days is not null
  and not exists (
    select 1 from public.plan_offers po where po.plan_id = p.id
  );

alter table public.orders
  add column if not exists plan_offer_id uuid references public.plan_offers(id) on delete set null;

create or replace function public.touch_plan_offer_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_plan_offer_updated_at_trigger on public.plan_offers;
create trigger touch_plan_offer_updated_at_trigger
before update on public.plan_offers
for each row execute function public.touch_plan_offer_updated_at();

create or replace function public.sync_subscription_plan_from_offers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_plan_id uuid;
  primary_offer record;
begin
  target_plan_id := case when tg_op = 'DELETE' then old.plan_id else new.plan_id end;

  select po.price, po.duration_days
    into primary_offer
    from public.plan_offers po
   where po.plan_id = target_plan_id
     and po.is_active
   order by po.is_primary desc, po.display_order asc, po.created_at asc
   limit 1;

  if found then
    update public.plans
       set price = primary_offer.price,
           duration_days = primary_offer.duration_days
     where id = target_plan_id
       and access_type = 'subscription';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists sync_subscription_plan_from_offers_trigger on public.plan_offers;
create trigger sync_subscription_plan_from_offers_trigger
after insert or update or delete on public.plan_offers
for each row execute function public.sync_subscription_plan_from_offers();

create or replace function public.apply_order_status_side_effects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  itm record;
  plan_duration integer;
  desired_expiry timestamptz;
begin
  if tg_op = 'UPDATE' and old.payment_status is not distinct from new.payment_status then
    return new;
  end if;

  if new.payment_status = 'paid' then
    if new.paid_at is null then
      new.paid_at := now();
    end if;

    if new.plan_offer_id is not null then
      select po.duration_days into plan_duration
        from public.plan_offers po
       where po.id = new.plan_offer_id;
    else
      select p.duration_days into plan_duration
        from public.plans p
       where p.id = new.plan_id;
    end if;

    desired_expiry := case
      when plan_duration is null then null
      else now() + make_interval(days => plan_duration)
    end;

    for itm in select model_id from public.order_items where order_id = new.id loop
      if exists (
        select 1 from public.customer_access
         where customer_id = new.customer_id
           and model_id = itm.model_id
           and access_status = 'active'
      ) then
        update public.customer_access
           set order_id = new.id,
               granted_at = now(),
               expires_at = desired_expiry,
               revoked_at = null,
               revocation_reason = null
         where customer_id = new.customer_id
           and model_id = itm.model_id
           and access_status = 'active';
      else
        insert into public.customer_access
          (customer_id, model_id, order_id, access_status, expires_at)
        values
          (new.customer_id, itm.model_id, new.id, 'active', desired_expiry);
      end if;
    end loop;
  elsif new.payment_status in ('refunded', 'chargeback') then
    update public.customer_access
       set access_status = 'revoked', revoked_at = now(),
           revocation_reason = new.payment_status::text
     where order_id = new.id
       and access_status = 'active';
  end if;

  return new;
end;
$$;

revoke execute on function public.apply_order_status_side_effects() from public, anon, authenticated;
