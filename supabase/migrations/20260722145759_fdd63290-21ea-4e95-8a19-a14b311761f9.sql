
CREATE OR REPLACE FUNCTION public.model_media_counts(_model_id uuid)
RETURNS TABLE (photo_count int, video_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN media_type = 'image' THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN media_type = 'video' THEN 1 ELSE 0 END), 0)::int
  FROM public.model_media
  WHERE model_id = _model_id;
$$;

GRANT EXECUTE ON FUNCTION public.model_media_counts(uuid) TO anon, authenticated;

DROP VIEW IF EXISTS public.models_public;

CREATE VIEW public.models_public
WITH (security_invoker = on) AS
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
  c.photo_count,
  c.video_count
FROM public.models m
CROSS JOIN LATERAL public.model_media_counts(m.id) c
WHERE m.is_active = true;

GRANT SELECT ON public.models_public TO anon, authenticated;
