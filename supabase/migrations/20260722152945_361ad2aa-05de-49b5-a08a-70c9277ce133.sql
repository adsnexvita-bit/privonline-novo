
CREATE POLICY "Admins can insert customer_access" ON public.customer_access FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update customer_access" ON public.customer_access FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete customer_access" ON public.customer_access FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert audit logs" ON public.admin_audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert admin_users" ON public.admin_users FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update admin_users" ON public.admin_users FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete admin_users" ON public.admin_users FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update orders" ON public.orders FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins read model-media" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'model-media' AND public.is_admin(auth.uid()));
CREATE POLICY "Admins insert model-media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'model-media' AND public.is_admin(auth.uid()));
CREATE POLICY "Admins update model-media" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'model-media' AND public.is_admin(auth.uid()));
CREATE POLICY "Admins delete model-media" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'model-media' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins read model-private" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'model-private-media' AND public.is_admin(auth.uid()));
CREATE POLICY "Admins insert model-private" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'model-private-media' AND public.is_admin(auth.uid()));
CREATE POLICY "Admins update model-private" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'model-private-media' AND public.is_admin(auth.uid()));
CREATE POLICY "Admins delete model-private" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'model-private-media' AND public.is_admin(auth.uid()));
