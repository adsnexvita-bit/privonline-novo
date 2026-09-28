create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) > 0),
  description text,
  original_price numeric(10, 2) not null check (original_price >= 0),
  promotional_price numeric(10, 2) not null check (promotional_price >= 0),
  badge_text text,
  badge_color text,
  cta_text text not null default 'Aproveitar promoção' check (char_length(trim(cta_text)) > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  access_type text not null default 'lifetime' check (access_type in ('lifetime', 'subscription')),
  duration_days integer,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotions_price_order_check check (promotional_price <= original_price),
  constraint promotions_period_check check (ends_at > starts_at),
  constraint promotions_duration_check check (
    (access_type = 'lifetime' and duration_days is null)
    or (access_type = 'subscription' and duration_days is not null and duration_days > 0)
  )
);

create table if not exists public.promotion_models (
  id uuid not null default gen_random_uuid() unique,
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  model_id uuid not null references public.models(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (promotion_id, model_id)
);

create index if not exists promotion_models_model_id_idx
  on public.promotion_models (model_id);

create index if not exists promotions_active_period_idx
  on public.promotions (is_active, starts_at, ends_at);

alter table public.promotions enable row level security;
alter table public.promotion_models enable row level security;

drop policy if exists "Admins manage promotions" on public.promotions;
create policy "Admins manage promotions"
  on public.promotions for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Admins manage promotion models" on public.promotion_models;
create policy "Admins manage promotion models"
  on public.promotion_models for all
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

grant select, insert, update, delete on public.promotions to authenticated;
grant select, insert, update, delete on public.promotion_models to authenticated;

create or replace function public.touch_promotion_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_promotion_updated_at_trigger on public.promotions;
create trigger touch_promotion_updated_at_trigger
before update on public.promotions
for each row execute function public.touch_promotion_updated_at();

create or replace function public.assert_promotion_has_no_conflicts(
  target_promotion_id uuid,
  target_title text,
  target_starts_at timestamptz,
  target_ends_at timestamptz,
  target_model_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  conflict record;
begin
  select m.name as model_name, p.title as promotion_title
    into conflict
    from unnest(coalesce(target_model_ids, array[]::uuid[])) selected_model_id
    join public.models m on m.id = selected_model_id
    join public.promotion_models pm on pm.model_id = selected_model_id
    join public.promotions p on p.id = pm.promotion_id
   where p.id is distinct from target_promotion_id
     and p.is_active = true
     and p.starts_at < target_ends_at
     and target_starts_at < p.ends_at
   order by m.name, p.title
   limit 1;

  if found then
    raise exception 'A modelo "%" já participa da promoção ativa "%" no mesmo período.',
      conflict.model_name, conflict.promotion_title
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.validate_promotion_model_conflict()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_promotion public.promotions%rowtype;
begin
  select * into target_promotion
    from public.promotions
   where id = new.promotion_id;

  if target_promotion.is_active then
    perform public.assert_promotion_has_no_conflicts(
      target_promotion.id,
      target_promotion.title,
      target_promotion.starts_at,
      target_promotion.ends_at,
      array[new.model_id]
    );
  end if;
  return new;
end;
$$;

drop trigger if exists validate_promotion_model_conflict_trigger on public.promotion_models;
create trigger validate_promotion_model_conflict_trigger
before insert or update of promotion_id, model_id on public.promotion_models
for each row execute function public.validate_promotion_model_conflict();

create or replace function public.validate_promotion_activation_conflict()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_model_ids uuid[];
begin
  if new.is_active then
    select coalesce(array_agg(pm.model_id), array[]::uuid[])
      into linked_model_ids
      from public.promotion_models pm
     where pm.promotion_id = new.id;

    perform public.assert_promotion_has_no_conflicts(
      new.id,
      new.title,
      new.starts_at,
      new.ends_at,
      linked_model_ids
    );
  end if;
  return new;
end;
$$;

drop trigger if exists validate_promotion_activation_conflict_trigger on public.promotions;
create trigger validate_promotion_activation_conflict_trigger
before update of is_active, starts_at, ends_at on public.promotions
for each row execute function public.validate_promotion_activation_conflict();

create or replace function public.admin_save_promotion(
  target_promotion_id uuid,
  promotion_title text,
  promotion_description text,
  promotion_original_price numeric,
  promotion_promotional_price numeric,
  promotion_badge_text text,
  promotion_badge_color text,
  promotion_cta_text text,
  promotion_starts_at timestamptz,
  promotion_ends_at timestamptz,
  promotion_access_type text,
  promotion_duration_days integer,
  promotion_is_active boolean,
  participant_model_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.admin_users au
     where au.auth_user_id = auth.uid() and au.is_active = true
  ) then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;

  -- Serialize saves touching the same models. This closes the race where two
  -- administrators activate overlapping promotions at the same time.
  perform pg_advisory_xact_lock(hashtextextended(selected_model_id::text, 0))
    from unnest(coalesce(participant_model_ids, array[]::uuid[])) selected_model_id
   order by selected_model_id;

  if promotion_is_active then
    perform public.assert_promotion_has_no_conflicts(
      target_promotion_id,
      promotion_title,
      promotion_starts_at,
      promotion_ends_at,
      participant_model_ids
    );
  end if;

  if target_promotion_id is null then
    insert into public.promotions (
      title, description, original_price, promotional_price, badge_text, badge_color,
      cta_text, starts_at, ends_at, access_type, duration_days, is_active
    ) values (
      trim(promotion_title), nullif(trim(promotion_description), ''),
      promotion_original_price, promotion_promotional_price,
      nullif(trim(promotion_badge_text), ''), nullif(trim(promotion_badge_color), ''),
      trim(promotion_cta_text), promotion_starts_at, promotion_ends_at,
      promotion_access_type, promotion_duration_days, false
    ) returning id into saved_id;
  else
    saved_id := target_promotion_id;
    update public.promotions
       set title = trim(promotion_title),
           description = nullif(trim(promotion_description), ''),
           original_price = promotion_original_price,
           promotional_price = promotion_promotional_price,
           badge_text = nullif(trim(promotion_badge_text), ''),
           badge_color = nullif(trim(promotion_badge_color), ''),
           cta_text = trim(promotion_cta_text),
           starts_at = promotion_starts_at,
           ends_at = promotion_ends_at,
           access_type = promotion_access_type,
           duration_days = promotion_duration_days,
           is_active = false
     where id = saved_id;
    if not found then
      raise exception 'Promoção não encontrada.' using errcode = 'P0002';
    end if;
  end if;

  delete from public.promotion_models where promotion_id = saved_id;
  insert into public.promotion_models (promotion_id, model_id)
  select saved_id, selected_model_id
    from unnest(coalesce(participant_model_ids, array[]::uuid[])) selected_model_id
   where exists (select 1 from public.models m where m.id = selected_model_id)
  on conflict do nothing;

  update public.promotions
     set is_active = promotion_is_active
   where id = saved_id;

  return saved_id;
end;
$$;

revoke all on function public.admin_save_promotion(
  uuid, text, text, numeric, numeric, text, text, text,
  timestamptz, timestamptz, text, integer, boolean, uuid[]
) from public, anon;
grant execute on function public.admin_save_promotion(
  uuid, text, text, numeric, numeric, text, text, text,
  timestamptz, timestamptz, text, integer, boolean, uuid[]
) to authenticated;

alter table public.orders
  add column if not exists promotion_id uuid references public.promotions(id) on delete set null;

create index if not exists orders_promotion_id_idx on public.orders (promotion_id);

drop function if exists public.list_public_model_plans(uuid);

create function public.list_public_model_plans(target_model_id uuid)
returns table (
  id uuid,
  promotion_id uuid,
  offer_id uuid,
  name text,
  description text,
  price numeric,
  original_price numeric,
  cta_text text,
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
    id,
    promotion_id,
    offer_id,
    name,
    description,
    price,
    original_price,
    cta_text,
    access_type,
    duration_days,
    is_featured,
    is_highlighted,
    button_color,
    eyebrow_text,
    promo_tag_text,
    promo_tag_color
  from (
    select
      promo.id,
      promo.id as promotion_id,
      null::uuid as offer_id,
      promo.title as name,
      promo.description,
      promo.promotional_price as price,
      promo.original_price,
      promo.cta_text,
      promo.access_type,
      promo.duration_days,
      true as is_featured,
      true as is_highlighted,
      '#F04400'::text as button_color,
      null::text as eyebrow_text,
      promo.badge_text as promo_tag_text,
      promo.badge_color as promo_tag_color,
      0 as source_order,
      promo.created_at
    from public.promotion_models prm
    join public.promotions promo on promo.id = prm.promotion_id
    where prm.model_id = target_model_id
      and promo.is_active = true
      and now() >= promo.starts_at
      and now() < promo.ends_at

    union all

    select
      p.id,
      null::uuid as promotion_id,
      case when p.access_type = 'subscription' then po.id else null end,
      p.name,
      null::text as description,
      case when p.access_type = 'subscription' and po.id is not null then po.price else p.price end,
      null::numeric as original_price,
      null::text as cta_text,
      p.access_type,
      case when p.access_type = 'subscription' and po.id is not null then po.duration_days else p.duration_days end,
      case when p.access_type = 'subscription' and po.id is not null then po.is_primary else p.is_featured end,
      case when p.access_type = 'subscription' and po.id is not null then po.is_highlighted else p.is_featured end,
      case when p.access_type = 'subscription' and po.id is not null then po.button_color else null end,
      p.eyebrow_text,
      case when p.access_type = 'subscription' and po.id is not null and not po.is_primary then po.tag_text else p.promo_tag_text end,
      case when p.access_type = 'subscription' and po.id is not null and not po.is_primary then po.tag_color else p.promo_tag_color end,
      1 as source_order,
      p.created_at
    from public.plan_models pm
    join public.plans p on p.id = pm.plan_id and p.is_active = true
    left join public.plan_offers po on po.plan_id = p.id and po.is_active = true and p.access_type = 'subscription'
    where pm.model_id = target_model_id
  ) available_offers
  order by source_order, is_featured desc, created_at;
$$;

revoke all on function public.list_public_model_plans(uuid) from public;
grant execute on function public.list_public_model_plans(uuid) to anon, authenticated;

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
    if new.paid_at is null then new.paid_at := now(); end if;

    if new.promotion_id is not null then
      select promo.duration_days into plan_duration
        from public.promotions promo where promo.id = new.promotion_id;
    elsif new.plan_offer_id is not null then
      select po.duration_days into plan_duration
        from public.plan_offers po where po.id = new.plan_offer_id;
    else
      select p.duration_days into plan_duration
        from public.plans p where p.id = new.plan_id;
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
           set order_id = new.id, granted_at = now(), expires_at = desired_expiry,
               revoked_at = null, revocation_reason = null
         where customer_id = new.customer_id
           and model_id = itm.model_id
           and access_status = 'active';
      else
        insert into public.customer_access
          (customer_id, model_id, order_id, access_status, expires_at)
        values (new.customer_id, itm.model_id, new.id, 'active', desired_expiry);
      end if;
    end loop;
  elsif new.payment_status in ('refunded', 'chargeback') then
    update public.customer_access
       set access_status = 'revoked', revoked_at = now(),
           revocation_reason = new.payment_status::text
     where order_id = new.id and access_status = 'active';
  end if;

  return new;
end;
$$;

revoke execute on function public.apply_order_status_side_effects() from public, anon, authenticated;
