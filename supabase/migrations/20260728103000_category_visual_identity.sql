ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#ff003c',
  ADD COLUMN IF NOT EXISTS icon_name text,
  ADD COLUMN IF NOT EXISTS icon_path text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'category-icons',
  'category-icons',
  true,
  5242880,
  ARRAY['image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Anyone can view category icons" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'category-icons');

CREATE POLICY "Admins can upload category icons" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'category-icons'
    AND public.is_admin(auth.uid())
  );

CREATE POLICY "Admins can update category icons" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'category-icons'
    AND public.is_admin(auth.uid())
  )
  WITH CHECK (
    bucket_id = 'category-icons'
    AND public.is_admin(auth.uid())
  );

CREATE POLICY "Admins can delete category icons" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'category-icons'
    AND public.is_admin(auth.uid())
  );
