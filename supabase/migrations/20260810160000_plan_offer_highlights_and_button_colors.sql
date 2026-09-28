alter table public.plan_offers
  add column if not exists is_highlighted boolean not null default false,
  add column if not exists button_color text;

alter table public.plan_offers
  drop constraint if exists plan_offers_button_color_check,
  add constraint plan_offers_button_color_check
    check (button_color is null or button_color ~ '^#[0-9A-Fa-f]{6}$');

update public.plan_offers
set is_highlighted = true
where is_primary and not is_highlighted;

create index if not exists idx_plan_offers_plan_highlighted
  on public.plan_offers (plan_id, is_highlighted desc, display_order asc);

-- PostgreSQL cannot alter a function's OUT parameter row type in place.
-- Recreate it so the two new offer presentation fields are exposed safely.
drop function if exists public.list_public_model_plans(uuid);

create or replace function public.list_public_model_plans(target_model_id uuid)
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
    p.access_type,
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
