
-- like_count column on model_media
ALTER TABLE public.model_media ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

-- customer_sessions (opaque tokens issued by the server after CPF check)
CREATE TABLE IF NOT EXISTS public.customer_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer ON public.customer_sessions(customer_id);

GRANT ALL ON public.customer_sessions TO service_role;
ALTER TABLE public.customer_sessions ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (server functions) touches this table.

-- media_likes
CREATE TABLE IF NOT EXISTS public.media_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL REFERENCES public.model_media(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (media_id, customer_id)
);
CREATE INDEX IF NOT EXISTS idx_media_likes_media ON public.media_likes(media_id);
CREATE INDEX IF NOT EXISTS idx_media_likes_customer ON public.media_likes(customer_id);

GRANT SELECT ON public.media_likes TO anon, authenticated;
GRANT ALL ON public.media_likes TO service_role;
ALTER TABLE public.media_likes ENABLE ROW LEVEL SECURITY;

-- Public can read likes to compute totals; writes only via service_role server fns.
CREATE POLICY "Anyone can view likes" ON public.media_likes
  FOR SELECT TO anon, authenticated
  USING (true);

-- Sync like_count on model_media
CREATE OR REPLACE FUNCTION public.sync_media_like_counts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.model_media SET like_count = like_count + 1 WHERE id = NEW.media_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.model_media SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.media_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_media_like_counts ON public.media_likes;
CREATE TRIGGER trg_sync_media_like_counts
AFTER INSERT OR DELETE ON public.media_likes
FOR EACH ROW EXECUTE FUNCTION public.sync_media_like_counts();
