-- A subscription plan can optionally expose one lifetime purchase alongside
-- its period-based offers. Lifetime purchases intentionally have no expiry.
alter table public.plan_offers
  add column if not exists access_type text not null default 'subscription';

alter table public.plan_offers
  alter column duration_days drop not null;

alter table public.plan_offers
  drop constraint if exists plan_offers_duration_days_check,
  drop constraint if exists plan_offers_access_type_check,
  add constraint plan_offers_access_type_check
    check (access_type in ('subscription', 'lifetime')),
  add constraint plan_offers_duration_days_check
    check (
      (access_type = 'subscription' and duration_days is not null and duration_days > 0)
      or (access_type = 'lifetime' and duration_days is null)
    );

create unique index if not exists plan_offers_one_lifetime_per_plan
  on public.plan_offers (plan_id)
  where access_type = 'lifetime';

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
     and po.access_type = 'subscription'
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

drop function if exists public.list_public_model_plans(uuid);

create function public.list_public_model_plans(target_model_id uuid)
returns table (
  id uuid,
  offer_id uuid,
  name text,
  price numeric,
  access_type text,
  duration_days integer,
  is_featured boolean,
  is_highlighted boolean,
  button_color text,
  eyebrow_text text,
  promo_tag_text text,
  promo_tag_color text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    case when p.access_type = 'subscription' then po.id else null end,
    p.name,
    case when p.access_type = 'subscription' and po.id is not null then po.price else p.price end,
    case when p.access_type = 'subscription' and po.id is not null then po.access_type else p.access_type end,
    case when p.access_type = 'subscription' and po.id is not null then po.duration_days else p.duration_days end,
    case when p.access_type = 'subscription' and po.id is not null then po.is_primary else p.is_featured end,
    case when p.access_type = 'subscription' and po.id is not null then po.is_highlighted else p.is_featured end,
    case when p.access_type = 'subscription' and po.id is not null then po.button_color else null end,
    p.eyebrow_text,
    case when p.access_type = 'subscription' and po.id is not null and not po.is_primary then po.tag_text else p.promo_tag_text end,
    case when p.access_type = 'subscription' and po.id is not null and not po.is_primary then po.tag_color else p.promo_tag_color end
  from public.plan_models pm
  join public.plans p on p.id = pm.plan_id and p.is_active = true
  left join public.plan_offers po on po.plan_id = p.id and po.is_active = true and p.access_type = 'subscription'
  where pm.model_id = target_model_id
  order by
    case when p.access_type = 'subscription' then coalesce(po.is_primary, false) else p.is_featured end desc,
    coalesce(po.display_order, 0), p.created_at;
$$;

revoke all on function public.list_public_model_plans(uuid) from public;
grant execute on function public.list_public_model_plans(uuid) to anon, authenticated;
