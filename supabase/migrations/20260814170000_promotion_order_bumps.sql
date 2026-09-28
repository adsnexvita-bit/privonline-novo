alter table public.promotions
  add column if not exists order_bump_enabled boolean not null default false,
  add column if not exists order_bump_default_price numeric(10,2) not null default 2.99,
  add column if not exists order_bump_max_visible integer not null default 4,
  add column if not exists order_bump_title text not null default 'Aproveite e leve também',
  add column if not exists order_bump_description text not null default 'Adicione outras modelos à sua compra por um valor exclusivo.';

alter table public.promotions
  drop constraint if exists promotions_order_bump_default_price_check,
  add constraint promotions_order_bump_default_price_check check (order_bump_default_price > 0),
  drop constraint if exists promotions_order_bump_max_visible_check,
  add constraint promotions_order_bump_max_visible_check check (order_bump_max_visible between 1 and 20);

alter table public.order_items
  add column if not exists is_order_bump boolean not null default false;

create table if not exists public.promotion_order_bump_models (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  model_id uuid not null references public.models(id) on delete cascade,
  price_override numeric(10,2),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (promotion_id, model_id),
  constraint promotion_order_bump_price_check check (price_override is null or price_override > 0)
);

create index if not exists promotion_order_bump_models_promotion_order_idx
  on public.promotion_order_bump_models (promotion_id, display_order, created_at);

alter table public.promotion_order_bump_models enable row level security;

drop policy if exists "Admins manage promotion order bumps" on public.promotion_order_bump_models;
create policy "Admins manage promotion order bumps"
on public.promotion_order_bump_models
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create or replace function public.admin_save_promotion_order_bumps(
  target_promotion_id uuid,
  bump_enabled boolean,
  bump_default_price numeric,
  bump_max_visible integer,
  bump_title text,
  bump_description text,
  bump_models jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Acesso não autorizado.';
  end if;
  if target_promotion_id is null or not exists (
    select 1 from public.promotions where id = target_promotion_id
  ) then
    raise exception 'Promoção não encontrada.';
  end if;
  if bump_default_price is null or bump_default_price <= 0 then
    raise exception 'Informe um valor padrão válido para o Order Bump.';
  end if;
  if bump_max_visible is null or bump_max_visible < 1 or bump_max_visible > 20 then
    raise exception 'A quantidade máxima deve estar entre 1 e 20.';
  end if;
  if jsonb_typeof(coalesce(bump_models, '[]'::jsonb)) <> 'array' then
    raise exception 'Lista de modelos do Order Bump inválida.';
  end if;

  update public.promotions
  set order_bump_enabled = coalesce(bump_enabled, false),
      order_bump_default_price = bump_default_price,
      order_bump_max_visible = bump_max_visible,
      order_bump_title = left(coalesce(nullif(trim(bump_title), ''), 'Aproveite e leve também'), 120),
      order_bump_description = left(coalesce(nullif(trim(bump_description), ''), 'Adicione outras modelos à sua compra por um valor exclusivo.'), 300),
      updated_at = now()
  where id = target_promotion_id;

  delete from public.promotion_order_bump_models where promotion_id = target_promotion_id;

  insert into public.promotion_order_bump_models
    (promotion_id, model_id, price_override, display_order)
  select distinct on ((entry->>'model_id')::uuid)
    target_promotion_id,
    (entry->>'model_id')::uuid,
    case
      when nullif(entry->>'price_override', '') is null then null
      else (entry->>'price_override')::numeric
    end,
    greatest(0, coalesce((entry->>'display_order')::integer, 0))
  from jsonb_array_elements(coalesce(bump_models, '[]'::jsonb)) entry
  join public.models model on model.id = (entry->>'model_id')::uuid
  where coalesce(entry->>'model_id', '') <> ''
    and (
      nullif(entry->>'price_override', '') is null
      or (entry->>'price_override')::numeric > 0
    )
  order by (entry->>'model_id')::uuid, greatest(0, coalesce((entry->>'display_order')::integer, 0));
end;
$$;

revoke all on function public.admin_save_promotion_order_bumps(uuid,boolean,numeric,integer,text,text,jsonb) from public;
grant execute on function public.admin_save_promotion_order_bumps(uuid,boolean,numeric,integer,text,text,jsonb) to authenticated;

-- A campanha principal pode ser temporaria, mas toda oferta de Order Bump
-- concede acesso vitalicio. A decisao fica gravada no item, e nao depende de
-- valores ou sinalizadores enviados pelo navegador no momento da aprovacao.
create or replace function public.apply_order_status_side_effects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  itm record;
  plan_duration integer;
  item_expiry timestamptz;
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

    for itm in
      select model_id, is_order_bump
      from public.order_items
      where order_id = new.id
    loop
      item_expiry := case
        when itm.is_order_bump then null
        when plan_duration is null then null
        else now() + make_interval(days => plan_duration)
      end;

      if exists (
        select 1 from public.customer_access
         where customer_id = new.customer_id
           and model_id = itm.model_id
           and access_status = 'active'
      ) then
        update public.customer_access
           set order_id = new.id, granted_at = now(), expires_at = item_expiry,
               revoked_at = null, revocation_reason = null
         where customer_id = new.customer_id
           and model_id = itm.model_id
           and access_status = 'active';
      else
        insert into public.customer_access
          (customer_id, model_id, order_id, access_status, expires_at)
        values (new.customer_id, itm.model_id, new.id, 'active', item_expiry);
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
