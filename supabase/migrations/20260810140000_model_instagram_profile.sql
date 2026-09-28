alter table public.models
  add column if not exists instagram_url text,
  add column if not exists instagram_enabled boolean not null default false;

alter table public.models
  drop constraint if exists models_instagram_url_profile,
  add constraint models_instagram_url_profile
    check (
      instagram_url is null
      or instagram_url ~* '^https://(?:www\.)?instagram\.com/[a-z0-9._]+/?(?:\?.*)?$'
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
  ) as has_community_bonus,
  (
    instagram_enabled
    and nullif(trim(instagram_url), '') is not null
  ) as instagram_enabled,
  case
    when instagram_enabled and nullif(trim(instagram_url), '') is not null
      then instagram_url
    else null
  end as instagram_url
from public.models
where is_active = true;

grant select on public.models_public to anon, authenticated;
