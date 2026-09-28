create table if not exists public.model_testimonials (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models(id) on delete cascade,
  image_path text not null check (image_path like 'r2://model-assets/images/%'),
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_model_testimonials_model_order
  on public.model_testimonials(model_id, display_order, created_at);

alter table public.model_testimonials enable row level security;

grant all on public.model_testimonials to service_role;

comment on table public.model_testimonials is
  'Imagens de depoimentos exibidas no perfil público de cada modelo.';
