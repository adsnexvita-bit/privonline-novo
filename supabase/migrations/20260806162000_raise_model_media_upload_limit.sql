-- Raise model media bucket limit to avoid Supabase Storage 413 errors on larger videos.
-- The admin UI mirrors this limit and validates files before attempting upload.
update storage.buckets
set
  file_size_limit = 524288000,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm'
  ]
where id = 'model-private-media';
