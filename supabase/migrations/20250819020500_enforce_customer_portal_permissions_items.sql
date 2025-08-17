-- Enforce customer portal permissions for line-item tables via join to parent orders/quotations

-- ORDER ITEMS
DROP POLICY IF EXISTS "Authenticated users can view all order items" ON public.order_items;
DROP POLICY IF EXISTS "Authenticated users can manage order items" ON public.order_items;

DROP POLICY IF EXISTS "Customers can view own order items with permission" ON public.order_items;
CREATE POLICY "Customers can view own order items with permission"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.customer_users cu ON cu.customer_id = o.customer_id
    JOIN public.customer_portal_settings s ON s.customer_id = cu.customer_id
    WHERE o.id = public.order_items.order_id
      AND cu.user_id = auth.uid()
      AND COALESCE(s.can_view_orders, false) = true
  )
);

DROP POLICY IF EXISTS "Admins can view all order items" ON public.order_items;
CREATE POLICY "Admins can view all order items"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'admin'
  )
);

-- QUOTATION ITEMS
DROP POLICY IF EXISTS "Authenticated users can manage quotations" ON public.quotation_items;

DROP POLICY IF EXISTS "Customers can view own quotation items with permission" ON public.quotation_items;
CREATE POLICY "Customers can view own quotation items with permission"
ON public.quotation_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.quotations q
    JOIN public.customer_users cu ON cu.customer_id = q.customer_id
    JOIN public.customer_portal_settings s ON s.customer_id = cu.customer_id
    WHERE q.id = public.quotation_items.quotation_id
      AND cu.user_id = auth.uid()
      AND COALESCE(s.can_view_quotations, false) = true
  )
);

DROP POLICY IF EXISTS "Admins can view all quotation items" ON public.quotation_items;
CREATE POLICY "Admins can view all quotation items"
ON public.quotation_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'admin'
  )
);

-- Notify PostgREST to reload schema
select pg_notify('pgrst','reload schema');


