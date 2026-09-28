ALTER TABLE public.meta_conversion_events
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS response_request_id TEXT,
  ADD COLUMN IF NOT EXISTS response_payload JSONB;

UPDATE public.meta_conversion_events
SET last_attempt_at = COALESCE(last_attempt_at, updated_at, created_at)
WHERE last_attempt_at IS NULL;

CREATE TABLE IF NOT EXISTS public.meta_conversion_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('sent', 'failed')),
  http_status INTEGER,
  events_received INTEGER,
  response_request_id TEXT,
  error_message TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_meta_conversion_attempts_order
  ON public.meta_conversion_attempts(order_id, attempt_number DESC);

GRANT ALL ON public.meta_conversion_attempts TO service_role;
ALTER TABLE public.meta_conversion_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view meta conversion attempts"
  ON public.meta_conversion_attempts FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
