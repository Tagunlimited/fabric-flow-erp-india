-- Enforce execution flow rules on BOM and PO lines.

CREATE OR REPLACE FUNCTION public.trg_enforce_bom_execution_flow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flow public.order_item_execution_flow;
  v_status public.order_item_fulfillment_status;
BEGIN
  IF NEW.order_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT oi.execution_flow, oi.fulfillment_status
    INTO v_flow, v_status
  FROM public.order_items oi
  WHERE oi.id = NEW.order_item_id;

  IF v_status = 'pending_flow' THEN
    RAISE EXCEPTION 'Assign execution flow on the order line before creating a BOM (order_item %)', NEW.order_item_id;
  END IF;

  IF v_flow IS NOT NULL AND v_flow <> 'stitching' THEN
    RAISE EXCEPTION 'BOM is only allowed for stitching lines (order_item %)', NEW.order_item_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bom_records_execution_flow_chk ON public.bom_records;
CREATE TRIGGER bom_records_execution_flow_chk
BEFORE INSERT ON public.bom_records
FOR EACH ROW
EXECUTE FUNCTION public.trg_enforce_bom_execution_flow();

CREATE OR REPLACE FUNCTION public.trg_enforce_po_item_execution_flow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flow public.order_item_execution_flow;
BEGIN
  IF NEW.sales_order_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT oi.execution_flow INTO v_flow
  FROM public.order_items oi
  WHERE oi.id = NEW.sales_order_item_id;

  IF v_flow = 'inventory' THEN
    RAISE EXCEPTION 'Purchase order lines cannot target inventory-fulfillment order items';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchase_order_items_execution_flow_chk ON public.purchase_order_items;
CREATE TRIGGER purchase_order_items_execution_flow_chk
BEFORE INSERT OR UPDATE OF sales_order_item_id ON public.purchase_order_items
FOR EACH ROW
EXECUTE FUNCTION public.trg_enforce_po_item_execution_flow();

CREATE OR REPLACE FUNCTION public.trg_enforce_dispatch_order_item_flow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.order_item_fulfillment_status;
BEGIN
  IF NEW.order_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT oi.fulfillment_status INTO v_status
  FROM public.order_items oi
  WHERE oi.id = NEW.order_item_id;

  IF v_status = 'pending_flow' THEN
    RAISE EXCEPTION 'Assign execution flow before dispatching this order line';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dispatch_order_items_execution_flow_chk ON public.dispatch_order_items;
CREATE TRIGGER dispatch_order_items_execution_flow_chk
BEFORE INSERT OR UPDATE OF order_item_id ON public.dispatch_order_items
FOR EACH ROW
EXECUTE FUNCTION public.trg_enforce_dispatch_order_item_flow();
