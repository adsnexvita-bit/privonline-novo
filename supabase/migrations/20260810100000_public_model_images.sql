-- Public-facing profile and cover images live separately from paid media.
-- This prevents a public URL from ever exposing files in model-private-media.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'model-public-images',
  'model-public-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'Admins can read public model images') THEN
    CREATE POLICY "Admins can read public model images" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'model-public-images' AND public.is_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'Admins can insert public model images') THEN
    CREATE POLICY "Admins can insert public model images" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'model-public-images' AND public.is_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'Admins can update public model images') THEN
    CREATE POLICY "Admins can update public model images" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'model-public-images' AND public.is_admin(auth.uid()))
      WITH CHECK (bucket_id = 'model-public-images' AND public.is_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND policyname = 'Admins can delete public model images') THEN
    CREATE POLICY "Admins can delete public model images" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'model-public-images' AND public.is_admin(auth.uid()));
  END IF;
END $$;
