-- Enforce customer portal permissions for invoice_items via parent invoice

DROP POLICY IF EXISTS "Authenticated users can view all invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Authenticated users can manage invoice items" ON public.invoice_items;

DROP POLICY IF EXISTS "Customers can view own invoice items with permission" ON public.invoice_items;
CREATE POLICY "Customers can view own invoice items with permission"
ON public.invoice_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.invoices i
    JOIN public.customer_users cu ON cu.customer_id = i.customer_id
    JOIN public.customer_portal_settings s ON s.customer_id = cu.customer_id
    WHERE i.id = public.invoice_items.invoice_id
      AND cu.user_id = auth.uid()
      AND COALESCE(s.can_view_invoices, false) = true
  )
);

DROP POLICY IF EXISTS "Admins can view all invoice items" ON public.invoice_items;
CREATE POLICY "Admins can view all invoice items"
ON public.invoice_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'admin'
  )
);

-- Also restrict invoice rows themselves if not already handled
-- (Redundant if 20250819020000_enforce_customer_portal_permissions.sql was applied)

select pg_notify('pgrst','reload schema');


