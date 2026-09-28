alter table public.models
  add column if not exists show_in_library boolean not null default true;

comment on column public.models.show_in_library is
  'Controls public discovery only. Active profiles remain accessible by direct link.';

drop view if exists public.models_public;
create view public.models_public
with (security_invoker = true)
as
select
  id, name, username, slug, short_description, full_description,
  profile_image_path, cover_image_path, profile_cover_image_path,
  price, is_featured, display_order, created_at, photo_count, video_count,
  custom_posts_count, custom_photo_count, custom_video_count, show_in_library,
  (community_enabled and nullif(trim(community_telegram_url), '') is not null and nullif(trim(community_title), '') is not null and nullif(trim(community_description), '') is not null and nullif(trim(community_button_text), '') is not null) as has_community_bonus,
  (instagram_enabled and nullif(trim(instagram_url), '') is not null) as instagram_enabled,
  case when instagram_enabled and nullif(trim(instagram_url), '') is not null then instagram_url else null end as instagram_url,
  case when instagram_enabled and nullif(trim(instagram_profile_image_url), '') is not null then instagram_profile_image_url else null end as instagram_profile_image_url,
  (public_audio_enabled and nullif(trim(public_audio_path), '') is not null and nullif(trim(public_audio_title), '') is not null) as public_audio_enabled,
  case when public_audio_enabled and nullif(trim(public_audio_path), '') is not null then public_audio_title else null end as public_audio_title,
  case when public_audio_enabled and nullif(trim(public_audio_path), '') is not null then public_audio_path else null end as public_audio_path
from public.models
where is_active = true;

grant select on public.models_public to anon, authenticated;

notify pgrst, 'reload schema';
