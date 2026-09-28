create table if not exists public.creator_post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.creator_posts(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  reaction text not null check (reaction in ('like', 'fire', 'heart_eyes', 'laugh', 'clap')),
  created_at timestamptz not null default now(),
  unique (post_id, customer_id, reaction)
);

create index if not exists idx_creator_post_reactions_customer
  on public.creator_post_reactions(customer_id, post_id);

alter table public.creator_post_reactions enable row level security;
grant all on public.creator_post_reactions to service_role;

create or replace function public.add_creator_post_reaction(
  _post_id uuid,
  _customer_id uuid,
  _reaction text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
  updated_post public.creator_posts;
begin
  if _reaction not in ('like', 'fire', 'heart_eyes', 'laugh', 'clap') then
    raise exception 'invalid reaction';
  end if;

  insert into public.creator_post_reactions (post_id, customer_id, reaction)
  values (_post_id, _customer_id, _reaction)
  on conflict (post_id, customer_id, reaction) do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count > 0 then
    update public.creator_posts
    set
      likes_count = likes_count + case when _reaction = 'like' then 1 else 0 end,
      fire_count = fire_count + case when _reaction = 'fire' then 1 else 0 end,
      heart_eyes_count = heart_eyes_count + case when _reaction = 'heart_eyes' then 1 else 0 end,
      laugh_count = laugh_count + case when _reaction = 'laugh' then 1 else 0 end,
      clap_count = clap_count + case when _reaction = 'clap' then 1 else 0 end,
      updated_at = now()
    where id = _post_id
    returning * into updated_post;
  else
    select * into updated_post
    from public.creator_posts
    where id = _post_id;
  end if;

  if updated_post.id is null then
    raise exception 'post not found';
  end if;

  return jsonb_build_object(
    'added', inserted_count > 0,
    'likes_count', updated_post.likes_count,
    'fire_count', updated_post.fire_count,
    'heart_eyes_count', updated_post.heart_eyes_count,
    'laugh_count', updated_post.laugh_count,
    'clap_count', updated_post.clap_count
  );
end;
$$;

revoke all on function public.add_creator_post_reaction(uuid, uuid, text) from public;
grant execute on function public.add_creator_post_reaction(uuid, uuid, text) to service_role;

comment on table public.creator_post_reactions is
  'Reações idempotentes de clientes pagos nos posts privados.';
