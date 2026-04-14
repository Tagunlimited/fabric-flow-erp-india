-- Cascade soft delete / restore keyed by business order_number only (no order_id predicates).
-- Adds order_number on related tables when missing and backfills from orders.order_id FK where present.

DO $$
DECLARE
  tbl text;
  has_oid   boolean;
  has_onum  boolean;
  tables text[] := ARRAY[
    'order_items',
    'order_activities',
    'quotations',
    'invoices',
    'dispatch_orders',
    'bom_records',
    'order_assignments',
    'order_cutting_assignments',
    'order_batch_assignments',
    'qc_reviews',
    'fabric_usage_records',
    'fabric_picking_records'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    IF to_regclass(format('public.%s', tbl)) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tbl AND c.column_name = 'order_number'
    ) INTO has_onum;

    IF NOT has_onum THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN order_number text', tbl);
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tbl AND c.column_name = 'order_id'
    ) INTO has_oid;

    IF has_oid THEN
      EXECUTE format($q$
        UPDATE public.%I t
        SET order_number = o.order_number
        FROM public.orders o
        WHERE t.order_id = o.id
      $q$, tbl);
    END IF;
  END LOOP;
END $$;

-- Keep order_number aligned when rows still use order_id (app writes); cascade RPC only filters by order_number.
CREATE OR REPLACE FUNCTION public.trg_fill_order_number_from_order_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_id IS NOT NULL THEN
    SELECT o.order_number INTO NEW.order_number
    FROM public.orders o
    WHERE o.id = NEW.order_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tbl text;
  has_oid boolean;
  trg text;
  tables text[] := ARRAY[
    'order_items',
    'order_activities',
    'quotations',
    'invoices',
    'dispatch_orders',
    'bom_records',
    'order_assignments',
    'order_cutting_assignments',
    'order_batch_assignments',
    'qc_reviews',
    'fabric_usage_records',
    'fabric_picking_records'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    IF to_regclass(format('public.%s', tbl)) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = tbl AND c.column_name = 'order_id'
    ) INTO has_oid;

    IF NOT has_oid THEN
      CONTINUE;
    END IF;

    trg := 'trg_fill_order_number_from_order_id_' || tbl;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trg, tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF order_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trg_fill_order_number_from_order_id()',
      trg,
      tbl
    );
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
  WHERE order_number = v_order_number AND is_deleted = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('order_items', v_count);

  IF to_regclass('public.order_activities') IS NOT NULL THEN
    UPDATE public.order_activities
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE order_number = v_order_number AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_activities', v_count);
  END IF;

  UPDATE public.quotations
  SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
  WHERE order_number = v_order_number AND is_deleted = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('quotations', v_count);

  IF to_regclass('public.quotation_items') IS NOT NULL THEN
    UPDATE public.quotation_items
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE quotation_id IN (SELECT q.id FROM public.quotations q WHERE q.order_number = v_order_number)
      AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('quotation_items', v_count);
  END IF;

  UPDATE public.invoices
  SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
  WHERE order_number = v_order_number AND is_deleted = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('invoices', v_count);

  IF to_regclass('public.invoice_items') IS NOT NULL THEN
    UPDATE public.invoice_items
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE invoice_id IN (SELECT i.id FROM public.invoices i WHERE i.order_number = v_order_number)
      AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('invoice_items', v_count);
  END IF;

  UPDATE public.receipts
  SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
  WHERE reference_number = v_order_number
    AND is_deleted = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('receipts', v_count);

  UPDATE public.dispatch_orders
  SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
  WHERE order_number = v_order_number AND is_deleted = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('dispatch_orders', v_count);

  IF to_regclass('public.dispatch_order_items') IS NOT NULL THEN
    UPDATE public.dispatch_order_items
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE dispatch_order_id IN (SELECT d.id FROM public.dispatch_orders d WHERE d.order_number = v_order_number)
      AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('dispatch_order_items', v_count);
  END IF;

  UPDATE public.bom_records
  SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
  WHERE order_number = v_order_number AND is_deleted = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('bom_records', v_count);

  IF to_regclass('public.bom_record_items') IS NOT NULL THEN
    UPDATE public.bom_record_items
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE bom_id IN (SELECT b.id FROM public.bom_records b WHERE b.order_number = v_order_number)
      AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('bom_record_items', v_count);
  END IF;

  UPDATE public.purchase_orders
  SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
  WHERE bom_id IN (SELECT b.id FROM public.bom_records b WHERE b.order_number = v_order_number)
    AND is_deleted = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('purchase_orders', v_count);

  UPDATE public.purchase_order_items
  SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
  WHERE po_id IN (
    SELECT po.id
    FROM public.purchase_orders po
    JOIN public.bom_records b ON b.id = po.bom_id
    WHERE b.order_number = v_order_number
  ) AND is_deleted = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('purchase_order_items', v_count);

  IF to_regclass('public.bom_po_items') IS NOT NULL THEN
    UPDATE public.bom_po_items
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE bom_id IN (SELECT b.id FROM public.bom_records b WHERE b.order_number = v_order_number)
      AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('bom_po_items', v_count);
  END IF;

  IF to_regclass('public.order_assignments') IS NOT NULL THEN
    UPDATE public.order_assignments
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE order_number = v_order_number AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_assignments', v_count);
  END IF;

  IF to_regclass('public.order_cutting_assignments') IS NOT NULL THEN
    UPDATE public.order_cutting_assignments
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE order_number = v_order_number AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_cutting_assignments', v_count);
  END IF;

  IF to_regclass('public.order_batch_assignments') IS NOT NULL THEN
    UPDATE public.order_batch_assignments
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE order_number = v_order_number AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_batch_assignments', v_count);
  END IF;

  IF to_regclass('public.order_batch_size_distributions') IS NOT NULL THEN
    UPDATE public.order_batch_size_distributions
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE order_batch_assignment_id IN (
      SELECT a.id FROM public.order_batch_assignments a WHERE a.order_number = v_order_number
    ) AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_batch_size_distributions', v_count);
  END IF;

  IF to_regclass('public.qc_reviews') IS NOT NULL THEN
    UPDATE public.qc_reviews
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE order_number = v_order_number AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('qc_reviews', v_count);
  END IF;

  IF to_regclass('public.fabric_usage_records') IS NOT NULL THEN
    UPDATE public.fabric_usage_records
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE order_number = v_order_number AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('fabric_usage_records', v_count);
  END IF;

  IF to_regclass('public.fabric_picking_records') IS NOT NULL THEN
    UPDATE public.fabric_picking_records
    SET is_deleted = true, deleted_at = now(), deleted_by = v_user_id, delete_reason = reason
    WHERE order_number = v_order_number AND is_deleted = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('fabric_picking_records', v_count);
  END IF;

  RETURN jsonb_build_object('ok', true, 'order_id', order_uuid, 'order_number', v_order_number, 'counts', v_counts);
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
  WHERE order_number = v_order_number AND is_deleted = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('order_items', v_count);

  IF to_regclass('public.order_activities') IS NOT NULL THEN
    UPDATE public.order_activities
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE order_number = v_order_number AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_activities', v_count);
  END IF;

  UPDATE public.quotations
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
  WHERE order_number = v_order_number AND is_deleted = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('quotations', v_count);

  IF to_regclass('public.quotation_items') IS NOT NULL THEN
    UPDATE public.quotation_items
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE quotation_id IN (SELECT q.id FROM public.quotations q WHERE q.order_number = v_order_number)
      AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('quotation_items', v_count);
  END IF;

  UPDATE public.invoices
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
  WHERE order_number = v_order_number AND is_deleted = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('invoices', v_count);

  IF to_regclass('public.invoice_items') IS NOT NULL THEN
    UPDATE public.invoice_items
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE invoice_id IN (SELECT i.id FROM public.invoices i WHERE i.order_number = v_order_number)
      AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('invoice_items', v_count);
  END IF;

  UPDATE public.receipts
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
  WHERE reference_number = v_order_number
    AND is_deleted = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('receipts', v_count);

  UPDATE public.dispatch_orders
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
  WHERE order_number = v_order_number AND is_deleted = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('dispatch_orders', v_count);

  IF to_regclass('public.dispatch_order_items') IS NOT NULL THEN
    UPDATE public.dispatch_order_items
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE dispatch_order_id IN (SELECT d.id FROM public.dispatch_orders d WHERE d.order_number = v_order_number)
      AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('dispatch_order_items', v_count);
  END IF;

  UPDATE public.bom_records
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
  WHERE order_number = v_order_number AND is_deleted = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('bom_records', v_count);

  IF to_regclass('public.bom_record_items') IS NOT NULL THEN
    UPDATE public.bom_record_items
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE bom_id IN (SELECT b.id FROM public.bom_records b WHERE b.order_number = v_order_number)
      AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('bom_record_items', v_count);
  END IF;

  UPDATE public.purchase_orders
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
  WHERE bom_id IN (SELECT b.id FROM public.bom_records b WHERE b.order_number = v_order_number)
    AND is_deleted = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('purchase_orders', v_count);

  UPDATE public.purchase_order_items
  SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
  WHERE po_id IN (
    SELECT po.id
    FROM public.purchase_orders po
    JOIN public.bom_records b ON b.id = po.bom_id
    WHERE b.order_number = v_order_number
  ) AND is_deleted = true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('purchase_order_items', v_count);

  IF to_regclass('public.bom_po_items') IS NOT NULL THEN
    UPDATE public.bom_po_items
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE bom_id IN (SELECT b.id FROM public.bom_records b WHERE b.order_number = v_order_number)
      AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('bom_po_items', v_count);
  END IF;

  IF to_regclass('public.order_assignments') IS NOT NULL THEN
    UPDATE public.order_assignments
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE order_number = v_order_number AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_assignments', v_count);
  END IF;

  IF to_regclass('public.order_cutting_assignments') IS NOT NULL THEN
    UPDATE public.order_cutting_assignments
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE order_number = v_order_number AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_cutting_assignments', v_count);
  END IF;

  IF to_regclass('public.order_batch_assignments') IS NOT NULL THEN
    UPDATE public.order_batch_assignments
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE order_number = v_order_number AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_batch_assignments', v_count);
  END IF;

  IF to_regclass('public.order_batch_size_distributions') IS NOT NULL THEN
    UPDATE public.order_batch_size_distributions
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE order_batch_assignment_id IN (
      SELECT a.id FROM public.order_batch_assignments a WHERE a.order_number = v_order_number
    ) AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('order_batch_size_distributions', v_count);
  END IF;

  IF to_regclass('public.qc_reviews') IS NOT NULL THEN
    UPDATE public.qc_reviews
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE order_number = v_order_number AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('qc_reviews', v_count);
  END IF;

  IF to_regclass('public.fabric_usage_records') IS NOT NULL THEN
    UPDATE public.fabric_usage_records
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE order_number = v_order_number AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('fabric_usage_records', v_count);
  END IF;

  IF to_regclass('public.fabric_picking_records') IS NOT NULL THEN
    UPDATE public.fabric_picking_records
    SET is_deleted = false, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, restored_at = now(), restored_by = v_user_id
    WHERE order_number = v_order_number AND is_deleted = true;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('fabric_picking_records', v_count);
  END IF;

  RETURN jsonb_build_object('ok', true, 'order_id', order_uuid, 'order_number', v_order_number, 'counts', v_counts);
END;
$$;
