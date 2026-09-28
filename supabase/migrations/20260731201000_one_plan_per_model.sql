-- New assignments are limited to a single commercial plan per creator.
-- Legacy duplicate associations are intentionally preserved here, so this
-- migration never removes existing commercial data without an explicit admin
-- decision. The admin editor clears previous assignments when a model is
-- reassigned to a different plan.
create or replace function public.enforce_one_plan_per_model()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.plan_models pm
    where pm.model_id = new.model_id
      and pm.plan_id <> new.plan_id
  ) then
    raise exception 'A modelo já pertence a outro plano.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_one_plan_per_model_trigger on public.plan_models;
create trigger enforce_one_plan_per_model_trigger
before insert or update of model_id, plan_id on public.plan_models
for each row execute function public.enforce_one_plan_per_model();
