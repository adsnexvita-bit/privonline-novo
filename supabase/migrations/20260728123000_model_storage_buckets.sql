INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'model-media',
    'model-media',
    false,
    15728640,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'model-private-media',
    'model-private-media',
    false,
    262144000,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
