-- Keep the private model media bucket aligned with the admin upload UI.
-- Videos can be uploaded through Supabase resumable/TUS up to 2 GB.
update storage.buckets
set
  file_size_limit = 2147483648,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm'
  ]
where id = 'model-private-media';
