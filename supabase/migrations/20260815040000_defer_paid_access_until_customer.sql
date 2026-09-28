-- Pending orders intentionally have no definitive customer. The application
-- resolves the customer by checkout_phone immediately after a verified paid
-- transition, so the legacy trigger must not reject that transition first.
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
    -- The server finalizer creates/locates the phone account and grants every
    -- order item idempotently after this update commits.
    if new.customer_id is null then return new; end if;

    if new.promotion_id is not null then
      select duration_days into plan_duration from public.promotions where id = new.promotion_id;
    elsif new.plan_offer_id is not null then
      select duration_days into plan_duration from public.plan_offers where id = new.plan_offer_id;
    else
      select duration_days into plan_duration from public.plans where id = new.plan_id;
    end if;
    desired_expiry := case when plan_duration is null then null else now() + make_interval(days => plan_duration) end;

    for itm in select model_id from public.order_items where order_id = new.id loop
      if exists (select 1 from public.customer_access where customer_id=new.customer_id and model_id=itm.model_id and access_status='active') then
        update public.customer_access set order_id=new.id, granted_at=now(), expires_at=desired_expiry, revoked_at=null, revocation_reason=null
        where customer_id=new.customer_id and model_id=itm.model_id and access_status='active';
      else
        insert into public.customer_access (customer_id, model_id, order_id, access_status, expires_at)
        values (new.customer_id, itm.model_id, new.id, 'active', desired_expiry);
      end if;
    end loop;
  elsif new.payment_status in ('refunded', 'chargeback') then
    update public.customer_access set access_status='revoked', revoked_at=now(), revocation_reason=new.payment_status::text
    where order_id=new.id and access_status='active';
  end if;
  return new;
end;
$$;

revoke execute on function public.apply_order_status_side_effects() from public, anon, authenticated;
