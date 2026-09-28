alter table public.model_media
  add column if not exists comment_count integer not null default 0;

alter table public.model_media
  drop constraint if exists model_media_comment_count_nonnegative,
  add constraint model_media_comment_count_nonnegative check (comment_count >= 0);

-- Os arquivos derivados legados são preservados no Storage para que esta
-- migration seja segura e não interrompa o deploy. Eles deixam de ser usados
-- pela aplicação ao limparmos apenas a referência no banco abaixo.
update public.model_media
set preview_path = null
where preview_path like 'model-private-media/previews/%-locked.webp';
