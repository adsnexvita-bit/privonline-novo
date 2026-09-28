alter table public.customers
  add column if not exists password_hash text,
  add column if not exists password_salt text,
  add column if not exists password_created_at timestamptz;

comment on column public.customers.password_hash is
  'PBKDF2-SHA256 password verifier. Never expose through public or client-side selects.';
comment on column public.customers.password_salt is
  'Random per-customer salt used by the server-side password verifier.';
