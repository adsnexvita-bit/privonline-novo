-- One durable delivery claim per paid order prevents the SyncPay webhook,
-- interactive reconciliation and admin reprocessing from sending duplicate
-- Meta Purchase events at the same time.
CREATE TABLE IF NOT EXISTS public.meta_conversion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'meta',
  event_name TEXT NOT NULL DEFAULT 'Purchase',
  event_id TEXT NOT NULL UNIQUE,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 1 CHECK (attempts > 0),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_meta_conversion_events_status
  ON public.meta_conversion_events(delivery_status);

GRANT ALL ON public.meta_conversion_events TO service_role;
ALTER TABLE public.meta_conversion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view meta conversion events"
  ON public.meta_conversion_events;
CREATE POLICY "Admins can view meta conversion events"
  ON public.meta_conversion_events
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
