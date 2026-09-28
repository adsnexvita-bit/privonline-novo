CREATE TABLE IF NOT EXISTS public.meta_ads_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  test_mode BOOLEAN NOT NULL DEFAULT FALSE,
  test_event_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT meta_ads_test_code_required
    CHECK (NOT test_mode OR length(trim(COALESCE(test_event_code, ''))) > 0)
);

GRANT ALL ON public.meta_ads_settings TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.meta_ads_settings TO authenticated;
ALTER TABLE public.meta_ads_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read Meta Ads settings"
  ON public.meta_ads_settings
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can create Meta Ads settings"
  ON public.meta_ads_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update Meta Ads settings"
  ON public.meta_ads_settings
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.meta_ads_settings (id, test_mode, test_event_code)
VALUES (TRUE, TRUE, 'TEST12342')
ON CONFLICT (id) DO NOTHING;
