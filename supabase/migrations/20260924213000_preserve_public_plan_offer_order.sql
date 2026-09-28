-- The public profile must use the exact offer order configured by the admin.
-- Highlighting is presentation metadata and must never change position.
drop function if exists public.list_public_model_plans(uuid);

create function public.list_public_model_plans(target_model_id uuid)
returns table (
  id uuid, promotion_id uuid, offer_id uuid, name text, description text,
  urgency_text text, complementary_text text, price numeric, original_price numeric,
  cta_text text, starts_at timestamptz, ends_at timestamptz, show_countdown boolean,
  access_type text, duration_days integer, is_featured boolean, is_highlighted boolean,
  button_color text, eyebrow_text text, promo_tag_text text, promo_tag_color text,
  benefits_text text, card_border_color text, countdown_bg_color text,
  countdown_text_color text, title_color text, subtitle_color text, price_color text,
  complementary_color text, campaign_button_color text, button_text_color text,
  benefits_color text, display_order integer
)
language sql stable security definer set search_path = public as $$
  select id, promotion_id, offer_id, name, description, urgency_text,
    complementary_text, price, original_price, cta_text, starts_at, ends_at,
    show_countdown, access_type, duration_days, is_featured, is_highlighted,
    button_color, eyebrow_text, promo_tag_text, promo_tag_color, benefits_text,
    card_border_color, countdown_bg_color, countdown_text_color, title_color,
    subtitle_color, price_color, complementary_color, campaign_button_color,
    button_text_color, benefits_color, display_order
  from (
    select promo.id, promo.id promotion_id, null::uuid offer_id, promo.title name,
      promo.description, promo.urgency_text, promo.complementary_text,
      promo.promotional_price price, promo.original_price, promo.cta_text,
      promo.starts_at, promo.ends_at, promo.show_countdown, promo.access_type,
      promo.duration_days, true is_featured, true is_highlighted,
      coalesce(promo.button_color, '#F04400')::text button_color,
      null::text eyebrow_text, promo.badge_text promo_tag_text,
      promo.badge_color promo_tag_color, promo.benefits_text,
      promo.card_border_color, promo.countdown_bg_color, promo.countdown_text_color,
      promo.title_color, promo.subtitle_color, promo.price_color,
      promo.complementary_color, promo.button_color campaign_button_color,
      promo.button_text_color, promo.benefits_color, 0 display_order,
      0 source_order, promo.created_at
    from public.promotion_models prm
    join public.promotions promo on promo.id = prm.promotion_id
    where prm.model_id = target_model_id and promo.is_active
      and statement_timestamp() >= promo.starts_at
      and (promo.ends_at is null or statement_timestamp() < promo.ends_at)
    union all
    select p.id, null::uuid, case when p.access_type='subscription' then po.id end,
      p.name, null::text, null::text, null::text,
      case when p.access_type='subscription' and po.id is not null then po.price else p.price end,
      null::numeric, null::text, null::timestamptz, null::timestamptz, false,
      p.access_type,
      case when p.access_type='subscription' and po.id is not null then po.duration_days else p.duration_days end,
      case when p.access_type='subscription' and po.id is not null then po.is_primary else p.is_featured end,
      case when p.access_type='subscription' and po.id is not null then po.is_highlighted else p.is_featured end,
      case when p.access_type='subscription' and po.id is not null then po.button_color end,
      p.eyebrow_text,
      case when p.access_type='subscription' and po.id is not null and not po.is_primary then po.tag_text else p.promo_tag_text end,
      case when p.access_type='subscription' and po.id is not null and not po.is_primary then po.tag_color else p.promo_tag_color end,
      null::text, null::text, null::text, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text,
      coalesce(po.display_order, 0), 1, p.created_at
    from public.plan_models pm
    join public.plans p on p.id=pm.plan_id and p.is_active
    left join public.plan_offers po on po.plan_id=p.id and po.is_active and p.access_type='subscription'
    where pm.model_id=target_model_id
  ) offers
  order by source_order, display_order, created_at;
$$;

revoke all on function public.list_public_model_plans(uuid) from public;
grant execute on function public.list_public_model_plans(uuid) to anon, authenticated;
