create or replace function public.anchor_paid_password_setup_expiry()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.payment_status = 'paid' and new.paid_at is not null then
    new.password_setup_expires_at := new.paid_at + interval '24 hours';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_anchor_paid_password_setup_expiry on public.orders;
create trigger orders_anchor_paid_password_setup_expiry
before insert or update of payment_status, paid_at on public.orders
for each row execute function public.anchor_paid_password_setup_expiry();

update public.orders
set password_setup_expires_at = paid_at + interval '24 hours'
where payment_status = 'paid'
  and paid_at is not null
  and password_setup_consumed_at is null;

comment on function public.anchor_paid_password_setup_expiry() is
  'Anchors paid checkout PIN setup validity to the effective payment timestamp.';
