alter table public.creator_posts
  add column if not exists audio_key text,
  add column if not exists audio_title text;

alter table public.creator_posts
  drop constraint if exists creator_posts_audio_key_check;
alter table public.creator_posts
  add constraint creator_posts_audio_key_check
  check (audio_key is null or audio_key like 'r2://models/%');

create table if not exists public.creator_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.creator_posts(id) on delete cascade,
  media_key text not null check (media_key like 'r2://models/%'),
  media_type text not null check (media_type in ('image', 'video')),
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now(),
  unique (post_id, display_order)
);

insert into public.creator_post_media (post_id, media_key, media_type, display_order)
select id, media_key, media_type, 0
from public.creator_posts
on conflict (post_id, display_order) do nothing;

create index if not exists idx_creator_post_media_order
  on public.creator_post_media(post_id, display_order);

alter table public.creator_post_media enable row level security;
grant all on public.creator_post_media to service_role;

comment on table public.creator_post_media is
  'Itens ordenados do carrossel de um post privado.';

notify pgrst, 'reload schema';
