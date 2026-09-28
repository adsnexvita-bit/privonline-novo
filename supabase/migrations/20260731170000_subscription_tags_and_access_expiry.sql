alter table public.plans
  add column if not exists promo_tag_text text,
  add column if not exists promo_tag_color text;

alter table public.plans
  drop constraint if exists plans_promo_tag_color_check,
  add constraint plans_promo_tag_color_check
    check (promo_tag_color is null or promo_tag_color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.customer_access
  add column if not exists expires_at timestamptz;

create index if not exists idx_customer_access_active_expiry
  on public.customer_access (customer_id, model_id, expires_at)
  where access_status = 'active';

-- A plan paid through Pix grants either permanent access (lifetime) or access
-- through its configured number of days. A new paid plan renews that profile's
-- active access for the same customer.
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

    select p.duration_days
      into plan_duration
      from public.plans p
     where p.id = new.plan_id;
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
