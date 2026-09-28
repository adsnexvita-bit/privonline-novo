CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  color text NOT NULL DEFAULT '#ff003c',
  icon_name text,
  icon_path text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_categories_active_order
  ON public.categories(is_active, display_order, created_at);

CREATE TABLE public.category_models (
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES public.models(id) ON DELETE CASCADE,
  is_featured boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category_id, model_id)
);

CREATE INDEX idx_category_models_order
  ON public.category_models(category_id, is_featured DESC, display_order);

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT ON public.categories, public.category_models TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories, public.category_models TO authenticated;
GRANT ALL ON public.categories, public.category_models TO service_role;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active categories" ON public.categories
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Admins can view all categories" ON public.categories
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert categories" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update categories" ON public.categories
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete categories" ON public.categories
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Anyone can view models from active categories" ON public.category_models
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = category_id AND c.is_active = true
    )
  );

CREATE POLICY "Admins can insert category models" ON public.category_models
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update category models" ON public.category_models
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete category models" ON public.category_models
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
