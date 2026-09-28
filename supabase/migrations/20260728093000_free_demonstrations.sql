CREATE TYPE public.demonstration_type AS ENUM ('image', 'video');

CREATE TABLE public.free_demonstrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  demonstration_type public.demonstration_type NOT NULL,
  title text,
  file_path text NOT NULL,
  thumbnail_path text,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_free_demonstrations_active_order
  ON public.free_demonstrations(is_active, display_order, created_at DESC);

GRANT SELECT ON public.free_demonstrations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.free_demonstrations TO authenticated;
GRANT ALL ON public.free_demonstrations TO service_role;

ALTER TABLE public.free_demonstrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active demonstrations" ON public.free_demonstrations
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Admins can view all demonstrations" ON public.free_demonstrations
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert demonstrations" ON public.free_demonstrations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update demonstrations" ON public.free_demonstrations
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete demonstrations" ON public.free_demonstrations
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

INSERT INTO storage.buckets (id, name, public)
VALUES ('free-demonstrations', 'free-demonstrations', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Anyone can view demonstration files" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'free-demonstrations');

CREATE POLICY "Admins can insert demonstration files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'free-demonstrations' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can update demonstration files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'free-demonstrations' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete demonstration files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'free-demonstrations' AND public.is_admin(auth.uid()));
