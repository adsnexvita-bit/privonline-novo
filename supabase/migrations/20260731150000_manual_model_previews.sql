create table if not exists public.model_previews (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models(id) on delete cascade,
  media_type public.media_type not null,
  file_path text not null,
  title text,
  display_order integer not null default 0,
  like_count integer not null default 0 check (like_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_model_previews_model_order
  on public.model_previews(model_id, display_order);

alter table public.model_previews enable row level security;

grant select on public.model_previews to anon, authenticated;
grant insert, update, delete on public.model_previews to authenticated;
grant all on public.model_previews to service_role;

drop policy if exists "Anyone can view previews of active models" on public.model_previews;
create policy "Anyone can view previews of active models"
  on public.model_previews for select
  using (
    exists (
      select 1 from public.models
      where models.id = model_previews.model_id
        and models.is_active = true
    )
  );

drop policy if exists "Admins can insert model previews" on public.model_previews;
create policy "Admins can insert model previews"
  on public.model_previews for insert to authenticated
  with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can update model previews" on public.model_previews;
create policy "Admins can update model previews"
  on public.model_previews for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can delete model previews" on public.model_previews;
create policy "Admins can delete model previews"
  on public.model_previews for delete to authenticated
  using (public.is_admin(auth.uid()));

-- As prévias passam a existir somente na biblioteca independente acima.
update public.model_media
set is_free_preview = false
where is_free_preview = true;
