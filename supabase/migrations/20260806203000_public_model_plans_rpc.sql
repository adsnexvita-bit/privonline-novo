create or replace function public.list_public_model_plans(target_model_id uuid)
returns table (
  id uuid,
  offer_id uuid,
  name text,
  price numeric,
  access_type text,
  duration_days integer,
  is_featured boolean,
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
    case when p.access_type = 'subscription' then po.id else null end as offer_id,
    p.name,
    case
      when p.access_type = 'subscription' and po.id is not null then po.price
      else p.price
    end as price,
    p.access_type,
    case
      when p.access_type = 'subscription' and po.id is not null then po.duration_days
      else p.duration_days
    end as duration_days,
    case
      when p.access_type = 'subscription' and po.id is not null then po.is_primary
      else p.is_featured
    end as is_featured,
    p.eyebrow_text,
    case
      when p.access_type = 'subscription' and po.id is not null and not po.is_primary then po.tag_text
      else p.promo_tag_text
    end as promo_tag_text,
    case
      when p.access_type = 'subscription' and po.id is not null and not po.is_primary then po.tag_color
      else p.promo_tag_color
    end as promo_tag_color
  from public.plan_models pm
  join public.plans p on p.id = pm.plan_id and p.is_active = true
  left join public.plan_offers po
    on po.plan_id = p.id
   and po.is_active = true
   and p.access_type = 'subscription'
  where pm.model_id = target_model_id
  order by
    case when p.access_type = 'subscription' then coalesce(po.is_primary, false) else p.is_featured end desc,
    coalesce(po.display_order, 0),
    p.created_at;
$$;

revoke all on function public.list_public_model_plans(uuid) from public;
grant execute on function public.list_public_model_plans(uuid) to anon, authenticated;
