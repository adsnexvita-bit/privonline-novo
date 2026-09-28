-- R2 object references remain in file_path as r2://<object-key> for backward
-- compatibility. These optional columns make the storage provider explicit for
-- new records while retaining all legacy Supabase Storage paths.
alter table public.model_media
  add column if not exists storage_provider text not null default 'supabase',
  add column if not exists object_key text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint;

alter table public.model_previews
  add column if not exists storage_provider text not null default 'supabase',
  add column if not exists object_key text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint;

create index if not exists model_media_storage_provider_idx on public.model_media (storage_provider);
create index if not exists model_previews_storage_provider_idx on public.model_previews (storage_provider);
