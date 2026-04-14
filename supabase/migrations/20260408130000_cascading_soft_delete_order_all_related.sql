-- Cascading soft delete + restore for orders and related records.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'orders',
      'order_items',
      'order_activities',
      'receipts',
      'invoices',
      'invoice_items',
      'quotations',
      'quotation_items',
      'dispatch_orders',
      'dispatch_order_items',
      'bom_records',
      'bom_record_items',
      'purchase_orders',
      'purchase_order_items',
      'bom_po_items',
      'order_assignments',
      'order_cutting_assignments',
      'order_batch_assignments',
      'order_batch_size_distributions',
      'qc_reviews',
      'fabric_usage_records',
      'fabric_picking_records'
    ])
  LOOP
    IF to_regclass(format('public.%s', t)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at timestamptz', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_by uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS delete_reason text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS restored_at timestamptz', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS restored_by uuid', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (is_deleted)', 'idx_' || t || '_is_deleted', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.soft_delete_order_cascade(order_uuid uuid, reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_order_number text;
  v_counts jsonb := '{}'::jsonb;
  v_count integer := 0;
BEGIN
  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.user_id = v_user_id
  LIMIT 1;

  IF COALESCE(v_role, '') NOT IN ('admin', 'sales manager') THEN
    RAISE EXCEPTION 'Not authorized to delete orders';
  END IF;

  SELECT o.order_number INTO v_order_number
  FROM public.orders o
  WHERE o.id = order_uuid
  LIMIT 1;

  IF v_order_number IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Order not found');
  END IF;

  UPDATE public.orders
  SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
  WHERE id = order_uuid AND is_deleted = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('orders', v_count);

  UPDATE public.order_items
  SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
  WHERE order_id = order_uuid AND is_deleted = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('order_items', v_count);

  IF to_regclass('public.order_activities') IS NOT NULL THEN
    UPDATE public.order_activities
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE order_id = order_uuid AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_activities', v_count);
  END IF;

  UPDATE public.quotations
  SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
  WHERE order_id = order_uuid AND is_deleted = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('quotations', v_count);

  IF to_regclass('public.quotation_items') IS NOT NULL THEN
    UPDATE public.quotation_items
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE quotation_id IN (SELECT q.id FROM public.quotations q WHERE q.order_id = order_uuid)
      AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('quotation_items', v_count);
  END IF;

  UPDATE public.invoices
  SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
  WHERE order_id = order_uuid AND is_deleted = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('invoices', v_count);

  IF to_regclass('public.invoice_items') IS NOT NULL THEN
    UPDATE public.invoice_items
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE invoice_id IN (SELECT i.id FROM public.invoices i WHERE i.order_id = order_uuid)
      AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('invoice_items', v_count);
  END IF;

  UPDATE public.receipts
  SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
  WHERE (reference_id = order_uuid::text OR reference_number = v_order_number)
    AND is_deleted = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('receipts', v_count);

  UPDATE public.dispatch_orders
  SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
  WHERE order_id = order_uuid AND is_deleted = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('dispatch_orders', v_count);

  IF to_regclass('public.dispatch_order_items') IS NOT NULL THEN
    UPDATE public.dispatch_order_items
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE dispatch_order_id IN (SELECT d.id FROM public.dispatch_orders d WHERE d.order_id = order_uuid)
      AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('dispatch_order_items', v_count);
  END IF;

  UPDATE public.bom_records
  SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
  WHERE order_id = order_uuid AND is_deleted = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('bom_records', v_count);

  IF to_regclass('public.bom_record_items') IS NOT NULL THEN
    UPDATE public.bom_record_items
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE bom_id IN (SELECT b.id FROM public.bom_records b WHERE b.order_id = order_uuid)
      AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('bom_record_items', v_count);
  END IF;

  UPDATE public.purchase_orders
  SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
  WHERE bom_id IN (SELECT b.id FROM public.bom_records b WHERE b.order_id = order_uuid)
    AND is_deleted = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('purchase_orders', v_count);

  UPDATE public.purchase_order_items
  SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
  WHERE po_id IN (
    SELECT po.id
    FROM public.purchase_orders po
    JOIN public.bom_records b ON b.id = po.bom_id
    WHERE b.order_id = order_uuid
  ) AND is_deleted = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('purchase_order_items', v_count);

  IF to_regclass('public.bom_po_items') IS NOT NULL THEN
    UPDATE public.bom_po_items
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE bom_id IN (SELECT b.id FROM public.bom_records b WHERE b.order_id = order_uuid)
      AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('bom_po_items', v_count);
  END IF;

  IF to_regclass('public.order_assignments') IS NOT NULL THEN
    UPDATE public.order_assignments
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE order_id = order_uuid AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_assignments', v_count);
  END IF;

  IF to_regclass('public.order_cutting_assignments') IS NOT NULL THEN
    UPDATE public.order_cutting_assignments
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE order_id = order_uuid AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_cutting_assignments', v_count);
  END IF;

  IF to_regclass('public.order_batch_assignments') IS NOT NULL THEN
    UPDATE public.order_batch_assignments
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE order_id = order_uuid AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_batch_assignments', v_count);
  END IF;

  IF to_regclass('public.order_batch_size_distributions') IS NOT NULL THEN
    UPDATE public.order_batch_size_distributions
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE order_batch_assignment_id IN (
      SELECT a.id FROM public.order_batch_assignments a WHERE a.order_id = order_uuid
    ) AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_batch_size_distributions', v_count);
  END IF;

  IF to_regclass('public.qc_reviews') IS NOT NULL THEN
    UPDATE public.qc_reviews
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE order_id = order_uuid AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('qc_reviews', v_count);
  END IF;

  IF to_regclass('public.fabric_usage_records') IS NOT NULL THEN
    UPDATE public.fabric_usage_records
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE order_id = order_uuid AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('fabric_usage_records', v_count);
  END IF;

  IF to_regclass('public.fabric_picking_records') IS NOT NULL THEN
    UPDATE public.fabric_picking_records
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE order_id = order_uuid AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('fabric_picking_records', v_count);
  END IF;

  RETURN jsonb_build_object('ok', true, 'order_id', order_uuid, 'counts', v_counts);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_order_cascade(order_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_order_number text;
  v_counts jsonb := '{}'::jsonb;
  v_count integer := 0;
BEGIN
  SELECT p.role INTO v_role
  FROM public.profiles p
  WHERE p.user_id = v_user_id
  LIMIT 1;

  IF COALESCE(v_role, '') NOT IN ('admin', 'sales manager') THEN
    RAISE EXCEPTION 'Not authorized to restore orders';
  END IF;

  SELECT o.order_number INTO v_order_number
  FROM public.orders o
  WHERE o.id = order_uuid
  LIMIT 1;

  IF v_order_number IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Order not found');
  END IF;

  UPDATE public.orders
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
  WHERE id = order_uuid AND is_deleted = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('orders', v_count);

  UPDATE public.order_items
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
  WHERE order_id = order_uuid AND is_deleted = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('order_items', v_count);

  IF to_regclass('public.order_activities') IS NOT NULL THEN
    UPDATE public.order_activities
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE order_id = order_uuid AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_activities', v_count);
  END IF;

  UPDATE public.quotations
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
  WHERE order_id = order_uuid AND is_deleted = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('quotations', v_count);

  IF to_regclass('public.quotation_items') IS NOT NULL THEN
    UPDATE public.quotation_items
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE quotation_id IN (SELECT q.id FROM public.quotations q WHERE q.order_id = order_uuid)
      AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('quotation_items', v_count);
  END IF;

  UPDATE public.invoices
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
  WHERE order_id = order_uuid AND is_deleted = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('invoices', v_count);

  IF to_regclass('public.invoice_items') IS NOT NULL THEN
    UPDATE public.invoice_items
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE invoice_id IN (SELECT i.id FROM public.invoices i WHERE i.order_id = order_uuid)
      AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('invoice_items', v_count);
  END IF;

  UPDATE public.receipts
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
  WHERE (reference_id = order_uuid::text OR reference_number = v_order_number)
    AND is_deleted = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('receipts', v_count);

  UPDATE public.dispatch_orders
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
  WHERE order_id = order_uuid AND is_deleted = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('dispatch_orders', v_count);

  IF to_regclass('public.dispatch_order_items') IS NOT NULL THEN
    UPDATE public.dispatch_order_items
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE dispatch_order_id IN (SELECT d.id FROM public.dispatch_orders d WHERE d.order_id = order_uuid)
      AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('dispatch_order_items', v_count);
  END IF;

  UPDATE public.bom_records
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
  WHERE order_id = order_uuid AND is_deleted = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('bom_records', v_count);

  IF to_regclass('public.bom_record_items') IS NOT NULL THEN
    UPDATE public.bom_record_items
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE bom_id IN (SELECT b.id FROM public.bom_records b WHERE b.order_id = order_uuid)
      AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('bom_record_items', v_count);
  END IF;

  UPDATE public.purchase_orders
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
  WHERE bom_id IN (SELECT b.id FROM public.bom_records b WHERE b.order_id = order_uuid)
    AND is_deleted = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('purchase_orders', v_count);

  UPDATE public.purchase_order_items
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
  WHERE po_id IN (
    SELECT po.id
    FROM public.purchase_orders po
    JOIN public.bom_records b ON b.id = po.bom_id
    WHERE b.order_id = order_uuid
  ) AND is_deleted = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('purchase_order_items', v_count);

  IF to_regclass('public.bom_po_items') IS NOT NULL THEN
    UPDATE public.bom_po_items
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE bom_id IN (SELECT b.id FROM public.bom_records b WHERE b.order_id = order_uuid)
      AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('bom_po_items', v_count);
  END IF;

  IF to_regclass('public.order_assignments') IS NOT NULL THEN
    UPDATE public.order_assignments
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE order_id = order_uuid AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_assignments', v_count);
  END IF;

  IF to_regclass('public.order_cutting_assignments') IS NOT NULL THEN
    UPDATE public.order_cutting_assignments
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE order_id = order_uuid AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_cutting_assignments', v_count);
  END IF;

  IF to_regclass('public.order_batch_assignments') IS NOT NULL THEN
    UPDATE public.order_batch_assignments
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE order_id = order_uuid AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_batch_assignments', v_count);
  END IF;

  IF to_regclass('public.order_batch_size_distributions') IS NOT NULL THEN
    UPDATE public.order_batch_size_distributions
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE order_batch_assignment_id IN (
      SELECT a.id FROM public.order_batch_assignments a WHERE a.order_id = order_uuid
    ) AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_batch_size_distributions', v_count);
  END IF;

  IF to_regclass('public.qc_reviews') IS NOT NULL THEN
    UPDATE public.qc_reviews
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE order_id = order_uuid AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('qc_reviews', v_count);
  END IF;

  IF to_regclass('public.fabric_usage_records') IS NOT NULL THEN
    UPDATE public.fabric_usage_records
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE order_id = order_uuid AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('fabric_usage_records', v_count);
  END IF;

  IF to_regclass('public.fabric_picking_records') IS NOT NULL THEN
    UPDATE public.fabric_picking_records
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE order_id = order_uuid AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('fabric_picking_records', v_count);
  END IF;

  RETURN jsonb_build_object('ok', true, 'order_id', order_uuid, 'counts', v_counts);
END;
$$;
