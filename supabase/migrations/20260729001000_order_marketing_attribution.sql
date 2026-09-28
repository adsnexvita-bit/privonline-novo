CREATE TABLE IF NOT EXISTS public.order_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  fbclid TEXT,
  fbc TEXT,
  fbp TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  campaign_id TEXT,
  adset_id TEXT,
  ad_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.order_attributions TO service_role;
ALTER TABLE public.order_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view order attributions"
  ON public.order_attributions;
CREATE POLICY "Admins can view order attributions"
  ON public.order_attributions
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
