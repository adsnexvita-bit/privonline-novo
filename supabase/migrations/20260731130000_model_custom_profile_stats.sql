alter table public.models
  add column if not exists custom_posts_count integer,
  add column if not exists custom_photo_count integer,
  add column if not exists custom_video_count integer;

alter table public.models
  drop constraint if exists models_custom_posts_count_nonnegative,
  add constraint models_custom_posts_count_nonnegative
    check (custom_posts_count is null or custom_posts_count >= 0),
  drop constraint if exists models_custom_photo_count_nonnegative,
  add constraint models_custom_photo_count_nonnegative
    check (custom_photo_count is null or custom_photo_count >= 0),
  drop constraint if exists models_custom_video_count_nonnegative,
  add constraint models_custom_video_count_nonnegative
    check (custom_video_count is null or custom_video_count >= 0);

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
  custom_video_count
from public.models
where is_active = true;

grant select on public.models_public to anon, authenticated;
