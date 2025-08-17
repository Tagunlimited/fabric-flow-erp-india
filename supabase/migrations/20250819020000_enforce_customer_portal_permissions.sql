-- Enforce customer portal permissions in RLS for orders, invoices, and quotations
-- Customers can only view their own data AND only if their portal permission flag is enabled

-- ORDERS
-- Drop overly broad policies
DROP POLICY IF EXISTS "Authenticated users can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Authenticated users can manage orders" ON public.orders;

-- Restrict customers to view only their orders when permission is granted
DROP POLICY IF EXISTS "Customers can view own orders with permission" ON public.orders;
CREATE POLICY "Customers can view own orders with permission"
ON public.orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customer_users cu
    JOIN public.customer_portal_settings s ON s.customer_id = cu.customer_id
    WHERE cu.user_id = auth.uid()
      AND cu.customer_id = public.orders.customer_id
      AND COALESCE(s.can_view_orders, false) = true
  )
);

-- Admins can view all orders
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
CREATE POLICY "Admins can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'admin'
  )
);

-- Staff (non-customer) can view all orders
DROP POLICY IF EXISTS "Staff can view all orders" ON public.orders;
CREATE POLICY "Staff can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role <> 'customer'
  )
);

-- INVOICES
-- Drop overly broad policies
DROP POLICY IF EXISTS "Authenticated users can view all invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated users can manage invoices" ON public.invoices;

-- Restrict customers to view only their invoices when permission is granted
DROP POLICY IF EXISTS "Customers can view own invoices with permission" ON public.invoices;
CREATE POLICY "Customers can view own invoices with permission"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customer_users cu
    JOIN public.customer_portal_settings s ON s.customer_id = cu.customer_id
    WHERE cu.user_id = auth.uid()
      AND cu.customer_id = public.invoices.customer_id
      AND COALESCE(s.can_view_invoices, false) = true
  )
);

-- Admins can view all invoices
DROP POLICY IF EXISTS "Admins can view all invoices" ON public.invoices;
CREATE POLICY "Admins can view all invoices"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'admin'
  )
);

-- Staff (non-customer) can view all invoices
DROP POLICY IF EXISTS "Staff can view all invoices" ON public.invoices;
CREATE POLICY "Staff can view all invoices"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role <> 'customer'
  )
);

-- QUOTATIONS
-- Drop overly broad policy
DROP POLICY IF EXISTS "Authenticated users can manage quotations" ON public.quotations;

-- Replace customer view policy with permission-aware version
DROP POLICY IF EXISTS "Customers can view own quotations" ON public.quotations;
DROP POLICY IF EXISTS "Customers can view own quotations with permission" ON public.quotations;
CREATE POLICY "Customers can view own quotations with permission"
ON public.quotations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customer_users cu
    JOIN public.customer_portal_settings s ON s.customer_id = cu.customer_id
    WHERE cu.user_id = auth.uid()
      AND cu.customer_id = public.quotations.customer_id
      AND COALESCE(s.can_view_quotations, false) = true
  )
);

-- Admins can view all quotations (retain or ensure present)
DROP POLICY IF EXISTS "Admins can view all quotations" ON public.quotations;
CREATE POLICY "Admins can view all quotations"
ON public.quotations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role = 'admin'
  )
);

-- Staff (non-customer) can view all quotations
DROP POLICY IF EXISTS "Staff can view all quotations" ON public.quotations;
CREATE POLICY "Staff can view all quotations"
ON public.quotations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role <> 'customer'
  )
);

-- Notify PostgREST to reload schema
select pg_notify('pgrst','reload schema');


