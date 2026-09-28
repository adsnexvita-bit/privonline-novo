alter table public.models
  add column if not exists community_telegram_url text,
  add column if not exists community_title text,
  add column if not exists community_description text,
  add column if not exists community_button_text text,
  add column if not exists community_enabled boolean not null default false;

alter table public.models
  drop constraint if exists models_community_telegram_url_https,
  add constraint models_community_telegram_url_https
    check (
      community_telegram_url is null
      or community_telegram_url ~* '^https://(?:t\.me|telegram\.me)/'
    );

drop view if exists public.models_public;
create view public.models_public
with (security_invoker = true)
as
select
  id,
  name,
  username,
  slug,
  short_description,
  full_description,
  profile_image_path,
  cover_image_path,
  profile_cover_image_path,
  price,
  is_featured,
  display_order,
  created_at,
  photo_count,
  video_count,
  custom_posts_count,
  custom_photo_count,
  custom_video_count,
  (
    community_enabled
    and nullif(trim(community_telegram_url), '') is not null
    and nullif(trim(community_title), '') is not null
    and nullif(trim(community_description), '') is not null
    and nullif(trim(community_button_text), '') is not null
  ) as has_community_bonus
from public.models
where is_active = true;

grant select on public.models_public to anon, authenticated;
