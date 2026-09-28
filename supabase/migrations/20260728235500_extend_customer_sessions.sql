ALTER TABLE public.customer_sessions
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '180 days');
