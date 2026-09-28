-- Delete selected creator profiles from the admin panel, including the
-- purchase/access links that otherwise protect models with ON DELETE RESTRICT.
-- This routine is intentionally admin-only and is invoked only after the
-- destructive confirmation in the dashboard.
CREATE OR REPLACE FUNCTION public.admin_delete_models(p_model_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;

  IF COALESCE(array_length(p_model_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  -- Order and access records use restrictive foreign keys so normal deletion
  -- preserves sales history. The explicit admin operation clears only the
  -- records tied to profiles chosen for permanent removal.
  DELETE FROM public.customer_access
  WHERE model_id = ANY(p_model_ids);

  DELETE FROM public.order_items
  WHERE model_id = ANY(p_model_ids);

  DELETE FROM public.models
  WHERE id = ANY(p_model_ids);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_models(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_models(uuid[]) TO authenticated;
