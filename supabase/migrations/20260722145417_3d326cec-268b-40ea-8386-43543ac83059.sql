
-- ============ ENUMS ============
CREATE TYPE public.media_type AS ENUM ('image', 'video');
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'failed', 'cancelled', 'refunded', 'chargeback');
CREATE TYPE public.access_status AS ENUM ('active', 'revoked', 'expired');
CREATE TYPE public.webhook_processing_status AS ENUM ('pending', 'processed', 'failed', 'ignored');

-- ============ UTIL: updated_at trigger ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============ ADMIN USERS ============
CREATE TABLE public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_users_auth_user_id ON public.admin_users(auth_user_id);

GRANT SELECT ON public.admin_users TO authenticated;
GRANT ALL ON public.admin_users TO service_role;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Security definer: is current auth user an active admin?
CREATE OR REPLACE FUNCTION public.is_admin(_auth_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE auth_user_id = _auth_user_id AND is_active = true
  );
$$;

CREATE POLICY "Admins can view admin_users" ON public.admin_users
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- ============ MODELS ============
CREATE TABLE public.models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  short_description TEXT,
  full_description TEXT,
  profile_image_path TEXT,
  cover_image_path TEXT,
  price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_models_active ON public.models(is_active);
CREATE INDEX idx_models_featured ON public.models(is_featured);
CREATE INDEX idx_models_display_order ON public.models(display_order);

GRANT SELECT ON public.models TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.models TO authenticated;
GRANT ALL ON public.models TO service_role;
ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active models" ON public.models
  FOR SELECT TO anon, authenticated
  USING (is_active = true);
CREATE POLICY "Admins can view all models" ON public.models
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert models" ON public.models
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update models" ON public.models
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete models" ON public.models
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_models_updated_at BEFORE UPDATE ON public.models
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ MODEL MEDIA ============
CREATE TABLE public.model_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,
  media_type public.media_type NOT NULL,
  file_path TEXT NOT NULL,
  preview_path TEXT,
  title TEXT,
  description TEXT,
  is_free_preview BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_model_media_model_id ON public.model_media(model_id);
CREATE INDEX idx_model_media_free_preview ON public.model_media(model_id, is_free_preview);

GRANT SELECT ON public.model_media TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.model_media TO authenticated;
GRANT ALL ON public.model_media TO service_role;
ALTER TABLE public.model_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view free previews of active models" ON public.model_media
  FOR SELECT TO anon, authenticated
  USING (
    is_free_preview = true
    AND EXISTS (SELECT 1 FROM public.models m WHERE m.id = model_id AND m.is_active = true)
  );
CREATE POLICY "Admins can view all media" ON public.model_media
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert media" ON public.model_media
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update media" ON public.model_media
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete media" ON public.model_media
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- ============ CUSTOMERS ============
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf TEXT NOT NULL UNIQUE CHECK (cpf ~ '^[0-9]{11}$'),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_email ON public.customers(email);

GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view customers" ON public.customers
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update customers" ON public.customers
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ ORDERS ============
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  transaction_identifier TEXT UNIQUE,
  total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  payment_method TEXT,
  payment_status public.payment_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX idx_orders_status ON public.orders(payment_status);
CREATE INDEX idx_orders_transaction ON public.orders(transaction_identifier);

GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view orders" ON public.orders
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- ============ ORDER ITEMS ============
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES public.models(id) ON DELETE RESTRICT,
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0)
);
CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX idx_order_items_model_id ON public.order_items(model_id);

GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view order items" ON public.order_items
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- ============ CUSTOMER ACCESS ============
CREATE TABLE public.customer_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES public.models(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  access_status public.access_status NOT NULL DEFAULT 'active',
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT
);
CREATE INDEX idx_customer_access_customer ON public.customer_access(customer_id);
CREATE INDEX idx_customer_access_model ON public.customer_access(model_id);
CREATE INDEX idx_customer_access_order ON public.customer_access(order_id);
-- Only one active access per (customer, model)
CREATE UNIQUE INDEX uq_customer_access_active
  ON public.customer_access(customer_id, model_id)
  WHERE access_status = 'active';

GRANT ALL ON public.customer_access TO service_role;
ALTER TABLE public.customer_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view customer_access" ON public.customer_access
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- ============ WEBHOOK EVENTS ============
CREATE TABLE public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  external_event_id TEXT,
  transaction_identifier TEXT,
  payload JSONB NOT NULL,
  processing_status public.webhook_processing_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE (provider, external_event_id)
);
CREATE INDEX idx_webhook_events_status ON public.webhook_events(processing_status);
CREATE INDEX idx_webhook_events_transaction ON public.webhook_events(transaction_identifier);

GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view webhook_events" ON public.webhook_events
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- ============ ADMIN AUDIT LOGS ============
CREATE TABLE public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_audit_admin ON public.admin_audit_logs(admin_user_id);
CREATE INDEX idx_admin_audit_entity ON public.admin_audit_logs(entity_type, entity_id);

GRANT ALL ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs" ON public.admin_audit_logs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
