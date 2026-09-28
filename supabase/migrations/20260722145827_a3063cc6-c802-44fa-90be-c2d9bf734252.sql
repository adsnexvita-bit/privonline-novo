
-- Add denormalized count columns
ALTER TABLE public.models
  ADD COLUMN IF NOT EXISTS photo_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_count int NOT NULL DEFAULT 0;

-- Backfill from existing media
UPDATE public.models m SET
  photo_count = COALESCE((SELECT COUNT(*) FROM public.model_media WHERE model_id = m.id AND media_type = 'image'), 0),
  video_count = COALESCE((SELECT COUNT(*) FROM public.model_media WHERE model_id = m.id AND media_type = 'video'), 0);

-- Trigger fn to maintain counts
CREATE OR REPLACE FUNCTION public.sync_model_media_counts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.media_type = 'image' THEN
      UPDATE public.models SET photo_count = photo_count + 1 WHERE id = NEW.model_id;
    ELSIF NEW.media_type = 'video' THEN
      UPDATE public.models SET video_count = video_count + 1 WHERE id = NEW.model_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.media_type = 'image' THEN
      UPDATE public.models SET photo_count = GREATEST(photo_count - 1, 0) WHERE id = OLD.model_id;
    ELSIF OLD.media_type = 'video' THEN
      UPDATE public.models SET video_count = GREATEST(video_count - 1, 0) WHERE id = OLD.model_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.model_id <> NEW.model_id OR OLD.media_type <> NEW.media_type THEN
      IF OLD.media_type = 'image' THEN
        UPDATE public.models SET photo_count = GREATEST(photo_count - 1, 0) WHERE id = OLD.model_id;
      ELSIF OLD.media_type = 'video' THEN
        UPDATE public.models SET video_count = GREATEST(video_count - 1, 0) WHERE id = OLD.model_id;
      END IF;
      IF NEW.media_type = 'image' THEN
        UPDATE public.models SET photo_count = photo_count + 1 WHERE id = NEW.model_id;
      ELSIF NEW.media_type = 'video' THEN
        UPDATE public.models SET video_count = video_count + 1 WHERE id = NEW.model_id;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_model_media_counts ON public.model_media;
CREATE TRIGGER trg_sync_model_media_counts
AFTER INSERT OR UPDATE OR DELETE ON public.model_media
FOR EACH ROW EXECUTE FUNCTION public.sync_model_media_counts();

-- Rebuild view without SECURITY DEFINER function
DROP VIEW IF EXISTS public.models_public;
CREATE VIEW public.models_public
WITH (security_invoker = on) AS
SELECT
  m.id, m.name, m.username, m.slug,
  m.short_description, m.full_description,
  m.profile_image_path, m.cover_image_path,
  m.price, m.is_featured, m.display_order, m.created_at,
  m.photo_count, m.video_count
FROM public.models m
WHERE m.is_active = true;

GRANT SELECT ON public.models_public TO anon, authenticated;

-- Drop the previously-created exposed function
REVOKE ALL ON FUNCTION public.model_media_counts(uuid) FROM anon, authenticated, public;
DROP FUNCTION IF EXISTS public.model_media_counts(uuid);
