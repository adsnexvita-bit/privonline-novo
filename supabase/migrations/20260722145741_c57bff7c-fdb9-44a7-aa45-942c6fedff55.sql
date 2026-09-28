
CREATE OR REPLACE VIEW public.models_public
WITH (security_invoker = off) AS
SELECT
  m.id,
  m.name,
  m.username,
  m.slug,
  m.short_description,
  m.full_description,
  m.profile_image_path,
  m.cover_image_path,
  m.price,
  m.is_featured,
  m.display_order,
  m.created_at,
  COALESCE((SELECT COUNT(*) FROM public.model_media mm WHERE mm.model_id = m.id AND mm.media_type = 'image'), 0)::int AS photo_count,
  COALESCE((SELECT COUNT(*) FROM public.model_media mm WHERE mm.model_id = m.id AND mm.media_type = 'video'), 0)::int AS video_count
FROM public.models m
WHERE m.is_active = true;

GRANT SELECT ON public.models_public TO anon, authenticated;
