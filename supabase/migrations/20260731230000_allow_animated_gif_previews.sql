-- Keep the private media bucket compatible with animated GIF previews.
-- The 500 MB bucket cap is retained; the admin UI applies a 150 MB GIF cap.
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
