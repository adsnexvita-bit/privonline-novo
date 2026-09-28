-- 1. Add compliance/private fields to models (admin-only via existing RLS; excluded from public view)
ALTER TABLE public.models
  ADD COLUMN IF NOT EXISTS is_age_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_authorization_signed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_notes text,
  ADD COLUMN IF NOT EXISTS id_document_path text,
  ADD COLUMN IF NOT EXISTS authorization_document_path text;

-- 2. Rate-limit table for CPF access attempts
CREATE TABLE IF NOT EXISTS public.cpf_access_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf_hash text NOT NULL,
  success boolean NOT NULL DEFAULT false,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cpf_access_attempts_hash_time
  ON public.cpf_access_attempts (cpf_hash, attempted_at DESC);

GRANT SELECT ON public.cpf_access_attempts TO authenticated;
GRANT ALL ON public.cpf_access_attempts TO service_role;
ALTER TABLE public.cpf_access_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view cpf attempts" ON public.cpf_access_attempts;
CREATE POLICY "Admins can view cpf attempts" ON public.cpf_access_attempts
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- 3. Trigger: auto grant/revoke customer_access on order payment_status transitions
CREATE OR REPLACE FUNCTION public.apply_order_status_side_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  itm record;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.payment_status IS NOT DISTINCT FROM NEW.payment_status THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status = 'paid' THEN
    IF NEW.paid_at IS NULL THEN
      NEW.paid_at := now();
    END IF;
    FOR itm IN SELECT model_id FROM public.order_items WHERE order_id = NEW.id LOOP
      -- Reactivate any prior revoked access for same (customer,model,order)
      UPDATE public.customer_access
         SET access_status = 'active', revoked_at = NULL, revocation_reason = NULL
       WHERE customer_id = NEW.customer_id
         AND model_id = itm.model_id
         AND order_id = NEW.id;
      -- Insert if no active access exists yet
      IF NOT EXISTS (
        SELECT 1 FROM public.customer_access
         WHERE customer_id = NEW.customer_id
           AND model_id = itm.model_id
           AND access_status = 'active'
      ) THEN
        INSERT INTO public.customer_access (customer_id, model_id, order_id, access_status)
        VALUES (NEW.customer_id, itm.model_id, NEW.id, 'active');
      END IF;
    END LOOP;
  ELSIF NEW.payment_status IN ('refunded','chargeback') THEN
    UPDATE public.customer_access
       SET access_status = 'revoked', revoked_at = now(),
           revocation_reason = NEW.payment_status::text
     WHERE order_id = NEW.id
       AND access_status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_order_status_side_effects ON public.orders;
CREATE TRIGGER trg_apply_order_status_side_effects
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.apply_order_status_side_effects();

-- Also fire when a fresh order is inserted as 'paid' (edge case)
DROP TRIGGER IF EXISTS trg_apply_order_status_on_insert ON public.orders;
CREATE TRIGGER trg_apply_order_status_on_insert
AFTER INSERT ON public.orders
FOR EACH ROW WHEN (NEW.payment_status = 'paid')
EXECUTE FUNCTION public.apply_order_status_side_effects();

-- 4. Ensure admins can update webhook_events (for reprocess)
DROP POLICY IF EXISTS "Admins can update webhook_events" ON public.webhook_events;
CREATE POLICY "Admins can update webhook_events" ON public.webhook_events
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 5. Refresh models_public view (keep it excluding private compliance columns)
DROP VIEW IF EXISTS public.models_public;
CREATE VIEW public.models_public
WITH (security_invoker = true)
AS
SELECT id, name, username, slug, short_description, full_description,
       profile_image_path, cover_image_path, price, is_featured,
       display_order, created_at, photo_count, video_count
FROM public.models
WHERE is_active = true;

GRANT SELECT ON public.models_public TO anon, authenticated;