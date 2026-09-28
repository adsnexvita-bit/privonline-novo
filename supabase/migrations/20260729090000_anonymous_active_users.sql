-- Anonymous, privacy-preserving presence pulses used by the admin dashboard.
-- No IP address, account, CPF, route, user-agent or other personal data is stored.
CREATE TABLE IF NOT EXISTS public.anonymous_presence_pulses (
  visitor_id uuid NOT NULL,
  bucket_at timestamptz NOT NULL,
  PRIMARY KEY (visitor_id, bucket_at)
);

CREATE INDEX IF NOT EXISTS idx_anonymous_presence_pulses_bucket
  ON public.anonymous_presence_pulses (bucket_at DESC);

ALTER TABLE public.anonymous_presence_pulses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.anonymous_presence_pulses FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_anonymous_presence(p_visitor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.anonymous_presence_pulses (visitor_id, bucket_at)
  VALUES (
    p_visitor_id,
    date_bin('5 minutes', now(), timestamptz '2000-01-01 00:00:00+00')
  )
  ON CONFLICT DO NOTHING;

  -- Low-cost probabilistic retention cleanup. Presence history is not kept forever.
  IF random() < 0.01 THEN
    DELETE FROM public.anonymous_presence_pulses
    WHERE bucket_at < now() - interval '90 days';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_anonymous_presence(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_anonymous_presence(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_daily_active_user_peaks(p_days integer DEFAULT 7)
RETURNS TABLE(day date, peak_users bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  safe_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 90);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;

  RETURN QUERY
  WITH per_bucket AS (
    SELECT
      (pulse.bucket_at AT TIME ZONE 'America/Sao_Paulo')::date AS local_day,
      pulse.bucket_at,
      count(*)::bigint AS active_users
    FROM public.anonymous_presence_pulses AS pulse
    WHERE pulse.bucket_at >= now() - make_interval(days => safe_days)
    GROUP BY local_day, pulse.bucket_at
  )
  SELECT
    per_bucket.local_day,
    max(per_bucket.active_users)::bigint
  FROM per_bucket
  GROUP BY per_bucket.local_day
  ORDER BY per_bucket.local_day;
END;
$$;

REVOKE ALL ON FUNCTION public.get_daily_active_user_peaks(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_active_user_peaks(integer) TO authenticated;
