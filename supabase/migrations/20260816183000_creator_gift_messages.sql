alter table public.creator_gifts
  add column if not exists message text;

alter table public.creator_gifts
  drop constraint if exists creator_gifts_message_length_check;

alter table public.creator_gifts
  add constraint creator_gifts_message_length_check
  check (message is null or char_length(message) <= 500);

comment on column public.creator_gifts.message is
  'Mensagem opcional enviada pelo comprador junto ao presente.';
