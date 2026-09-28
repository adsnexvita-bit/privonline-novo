UPDATE public.model_media
SET title = regexp_replace(substring(file_path from '[^/]+$'), '^[0-9]+-', '')
WHERE title IS NULL OR btrim(title) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_model_media_unique_file_title
  ON public.model_media (model_id, lower(title))
  WHERE title IS NOT NULL AND btrim(title) <> '';
