-- Apply a prepared file mapping to a copied row. New files are independent
-- objects; customer purchases and reactions are deliberately not duplicated.
create or replace function public.duplicate_model_payload(_row jsonb, _files jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare entry record; result jsonb := _row; path text;
begin
  for entry in select key, value from jsonb_each(_row) loop
    if jsonb_typeof(entry.value) = 'string' then
      path := entry.value #>> '{}';
      if path like 'r2://%' and not (_files ? path) then
        raise exception 'O conteúdo foi alterado durante a cópia. Tente novamente.';
      end if;
      if _files ? path then result := jsonb_set(result, array[entry.key], _files -> path); end if;
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public.duplicate_model_profile(_source uuid, _target uuid, _files jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  source_row public.models;
  payload jsonb;
  item jsonb;
  nested_item jsonb;
  table_name text;
  new_post uuid;
  new_plan uuid;
  candidate text;
  suffix integer := 1;
begin
  select * into source_row from public.models where id = _source for share;
  if not found then raise exception 'Perfil não encontrado.'; end if;
  -- Serialize name allocation, including concurrent duplication requests.
  perform pg_advisory_xact_lock(hashtext('duplicate_model_profile'));
  loop
    candidate := left(source_row.username, 27) || '-copia-' || suffix;
    exit when not exists(select 1 from public.models where username = candidate or slug = candidate);
    suffix := suffix + 1;
  end loop;
  payload := public.duplicate_model_payload(to_jsonb(source_row), _files)
    || jsonb_build_object('id', _target, 'name', source_row.name || ' (cópia)',
      'username', candidate, 'slug', candidate, 'is_active', false,
      'created_at', now(), 'updated_at', now(),
      'display_order', coalesce((select max(display_order) from public.models), 0) + 1);
  insert into public.models select * from jsonb_populate_record(null::public.models, payload);

  insert into public.category_models(category_id, model_id)
    select category_id, _target from public.category_models where model_id = _source;
  for item in select to_jsonb(p) from public.plans p join public.plan_models pm on pm.plan_id = p.id where pm.model_id = _source loop
    new_plan := gen_random_uuid();
    payload := item || jsonb_build_object('id', new_plan, 'created_at', now(), 'updated_at', now());
    insert into public.plans select * from jsonb_populate_record(null::public.plans, payload);
    insert into public.plan_models(plan_id, model_id) values(new_plan, _target);
  end loop;

  foreach table_name in array array['model_media', 'model_previews', 'model_testimonials'] loop
    for item in execute format('select to_jsonb(t) from public.%I t where model_id = $1', table_name) using _source loop
      payload := public.duplicate_model_payload(item, _files)
        || jsonb_build_object('id', gen_random_uuid(), 'model_id', _target, 'created_at', now());
      if table_name in ('model_media', 'model_previews') then
        payload := payload || jsonb_build_object('like_count', 0, 'comment_count', 0);
      end if;
      execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', table_name, table_name) using payload;
    end loop;
  end loop;

  for item in select to_jsonb(p) from public.creator_posts p where creator_id = _source loop
    new_post := gen_random_uuid();
    payload := public.duplicate_model_payload(item, _files)
      || jsonb_build_object('id', new_post, 'creator_id', _target, 'created_at', now(), 'updated_at', now(),
        'likes_count', 0, 'fire_count', 0, 'heart_eyes_count', 0, 'laugh_count', 0, 'clap_count', 0);
    insert into public.creator_posts select * from jsonb_populate_record(null::public.creator_posts, payload);
    for nested_item in select to_jsonb(m) from public.creator_post_media m where post_id = (item->>'id')::uuid loop
      payload := public.duplicate_model_payload(nested_item, _files)
        || jsonb_build_object('id', gen_random_uuid(), 'post_id', new_post, 'created_at', now());
      insert into public.creator_post_media select * from jsonb_populate_record(null::public.creator_post_media, payload);
    end loop;
  end loop;
  insert into public.admin_audit_logs(action, entity_type, entity_id, details)
    values('model.duplicate', 'model', _target::text, jsonb_build_object('source_id', _source));
  return _target;
end;
$$;
revoke all on function public.duplicate_model_payload(jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.duplicate_model_profile(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.duplicate_model_payload(jsonb,jsonb) to service_role;
grant execute on function public.duplicate_model_profile(uuid,uuid,jsonb) to service_role;
