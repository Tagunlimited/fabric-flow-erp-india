-- Add INSERT policies for invoices table
-- The existing policies only allow SELECT operations, but we need INSERT/UPDATE/DELETE policies

-- Drop existing overly broad policies if they exist
DROP POLICY IF EXISTS "Authenticated users can manage invoices" ON public.invoices;

-- Add INSERT policy for staff (non-customer users)
CREATE POLICY "Staff can insert invoices"
ON public.invoices
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role <> 'customer'
  )
);

-- Add UPDATE policy for staff
CREATE POLICY "Staff can update invoices"
ON public.invoices
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role <> 'customer'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role <> 'customer'
  )
);

-- Add DELETE policy for staff
CREATE POLICY "Staff can delete invoices"
ON public.invoices
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.role <> 'customer'
  )
);

-- Add INSERT policy for customers (if they have permission)
CREATE POLICY "Customers can insert own invoices with permission"
ON public.invoices
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.customer_users cu
    JOIN public.customer_portal_settings s ON s.customer_id = cu.customer_id
    WHERE cu.user_id = auth.uid()
      AND cu.customer_id = public.invoices.customer_id
      AND COALESCE(s.can_view_invoices, false) = true
  )
);

-- Add UPDATE policy for customers (if they have permission)
CREATE POLICY "Customers can update own invoices with permission"
ON public.invoices
FOR UPDATE
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
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.customer_users cu
    JOIN public.customer_portal_settings s ON s.customer_id = cu.customer_id
    WHERE cu.user_id = auth.uid()
      AND cu.customer_id = public.invoices.customer_id
      AND COALESCE(s.can_view_invoices, false) = true
  )
);

-- Add DELETE policy for customers (if they have permission)
CREATE POLICY "Customers can delete own invoices with permission"
ON public.invoices
FOR DELETE
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
