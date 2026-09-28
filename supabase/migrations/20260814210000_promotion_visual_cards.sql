alter table public.promotions
  add column if not exists benefits_text text,
  add column if not exists card_border_color text,
  add column if not exists countdown_bg_color text,
  add column if not exists countdown_text_color text,
  add column if not exists title_color text,
  add column if not exists subtitle_color text,
  add column if not exists price_color text,
  add column if not exists complementary_color text,
  add column if not exists button_color text,
  add column if not exists button_text_color text,
  add column if not exists benefits_color text;

drop function if exists public.admin_save_promotion(
  uuid, text, text, text, text, text, numeric, numeric, text, text, text,
  timestamptz, timestamptz, boolean, text, integer, boolean, uuid[]
);

create function public.admin_save_promotion(
  target_promotion_id uuid, campaign_name text, promotion_title text,
  promotion_description text, promotion_urgency_text text,
  promotion_complementary_text text, promotion_original_price numeric,
  promotion_promotional_price numeric, promotion_badge_text text,
  promotion_badge_color text, promotion_cta_text text,
  promotion_starts_at timestamptz, promotion_ends_at timestamptz,
  promotion_show_countdown boolean, promotion_access_type text,
  promotion_duration_days integer, promotion_is_active boolean,
  participant_model_ids uuid[], promotion_benefits_text text,
  promotion_card_border_color text, promotion_countdown_bg_color text,
  promotion_countdown_text_color text, promotion_title_color text,
  promotion_subtitle_color text, promotion_price_color text,
  promotion_complementary_color text, promotion_button_color text,
  promotion_button_text_color text, promotion_benefits_color text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare saved_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_users au
    where au.auth_user_id = auth.uid() and au.is_active = true
  ) then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;
  if promotion_ends_at is not null and promotion_ends_at <= promotion_starts_at then
    raise exception 'O término precisa ser posterior ao início.' using errcode = '22007';
  end if;
  if promotion_show_countdown and promotion_ends_at is null then
    raise exception 'Defina uma data de término para exibir o contador.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(selected_model_id::text, 0))
  from unnest(coalesce(participant_model_ids, array[]::uuid[])) selected_model_id
  order by selected_model_id;

  if promotion_is_active then
    perform public.assert_promotion_has_no_conflicts(
      target_promotion_id, promotion_title, promotion_starts_at,
      promotion_ends_at, participant_model_ids
    );
  end if;

  if target_promotion_id is null then
    insert into public.promotions (
      name, title, description, urgency_text, complementary_text,
      original_price, promotional_price, badge_text, badge_color, cta_text,
      starts_at, ends_at, show_countdown, access_type, duration_days, is_active,
      benefits_text, card_border_color, countdown_bg_color, countdown_text_color,
      title_color, subtitle_color, price_color, complementary_color, button_color,
      button_text_color, benefits_color
    ) values (
      trim(campaign_name), trim(promotion_title), nullif(trim(promotion_description), ''),
      nullif(trim(promotion_urgency_text), ''), nullif(trim(promotion_complementary_text), ''),
      promotion_original_price, promotion_promotional_price,
      nullif(trim(promotion_badge_text), ''), nullif(trim(promotion_badge_color), ''),
      trim(promotion_cta_text), promotion_starts_at, promotion_ends_at,
      promotion_show_countdown, promotion_access_type, promotion_duration_days, false,
      nullif(trim(promotion_benefits_text), ''), promotion_card_border_color,
      promotion_countdown_bg_color, promotion_countdown_text_color, promotion_title_color,
      promotion_subtitle_color, promotion_price_color, promotion_complementary_color,
      promotion_button_color, promotion_button_text_color, promotion_benefits_color
    ) returning id into saved_id;
  else
    saved_id := target_promotion_id;
    update public.promotions set
      name = trim(campaign_name), title = trim(promotion_title),
      description = nullif(trim(promotion_description), ''),
      urgency_text = nullif(trim(promotion_urgency_text), ''),
      complementary_text = nullif(trim(promotion_complementary_text), ''),
      original_price = promotion_original_price, promotional_price = promotion_promotional_price,
      badge_text = nullif(trim(promotion_badge_text), ''),
      badge_color = nullif(trim(promotion_badge_color), ''), cta_text = trim(promotion_cta_text),
      starts_at = promotion_starts_at, ends_at = promotion_ends_at,
      show_countdown = promotion_show_countdown, access_type = promotion_access_type,
      duration_days = promotion_duration_days, is_active = false,
      benefits_text = nullif(trim(promotion_benefits_text), ''),
      card_border_color = promotion_card_border_color,
      countdown_bg_color = promotion_countdown_bg_color,
      countdown_text_color = promotion_countdown_text_color,
      title_color = promotion_title_color, subtitle_color = promotion_subtitle_color,
      price_color = promotion_price_color, complementary_color = promotion_complementary_color,
      button_color = promotion_button_color, button_text_color = promotion_button_text_color,
      benefits_color = promotion_benefits_color
    where id = saved_id;
    if not found then raise exception 'Campanha não encontrada.' using errcode = 'P0002'; end if;
  end if;

  delete from public.promotion_models where promotion_id = saved_id;
  insert into public.promotion_models (promotion_id, model_id)
  select saved_id, selected_model_id
  from unnest(coalesce(participant_model_ids, array[]::uuid[])) selected_model_id
  where exists (select 1 from public.models m where m.id = selected_model_id)
  on conflict do nothing;
  update public.promotions set is_active = promotion_is_active where id = saved_id;
  return saved_id;
end;
$$;

revoke all on function public.admin_save_promotion(
  uuid,text,text,text,text,text,numeric,numeric,text,text,text,timestamptz,timestamptz,
  boolean,text,integer,boolean,uuid[],text,text,text,text,text,text,text,text,text,text,text
) from public, anon;
grant execute on function public.admin_save_promotion(
  uuid,text,text,text,text,text,numeric,numeric,text,text,text,timestamptz,timestamptz,
  boolean,text,integer,boolean,uuid[],text,text,text,text,text,text,text,text,text,text,text
) to authenticated;

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
  benefits_color text
)
language sql stable security definer set search_path = public as $$
  select id, promotion_id, offer_id, name, description, urgency_text,
    complementary_text, price, original_price, cta_text, starts_at, ends_at,
    show_countdown, access_type, duration_days, is_featured, is_highlighted,
    button_color, eyebrow_text, promo_tag_text, promo_tag_color, benefits_text,
    card_border_color, countdown_bg_color, countdown_text_color, title_color,
    subtitle_color, price_color, complementary_color, campaign_button_color,
    button_text_color, benefits_color
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
      promo.button_text_color, promo.benefits_color, 0 source_order, promo.created_at
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
      1, p.created_at
    from public.plan_models pm join public.plans p on p.id=pm.plan_id and p.is_active
    left join public.plan_offers po on po.plan_id=p.id and po.is_active and p.access_type='subscription'
    where pm.model_id=target_model_id
  ) offers order by source_order, is_featured desc, created_at;
$$;
revoke all on function public.list_public_model_plans(uuid) from public;
grant execute on function public.list_public_model_plans(uuid) to anon, authenticated;
