-- Auto-complete Purchase Order on GRN Approval
-- This migration adds functionality to automatically mark POs as 'completed' 
-- when all items have been received and approved via GRNs

-- 1. Create helper function to check PO completion status
CREATE OR REPLACE FUNCTION check_and_update_po_completion(p_po_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_all_items_received BOOLEAN;
  v_po_status TEXT;
BEGIN
  -- First check if PO exists and get current status
  SELECT status INTO v_po_status
  FROM purchase_orders
  WHERE id = p_po_id;
  
  -- If PO doesn't exist or is already completed/cancelled, return
  IF v_po_status IS NULL OR v_po_status IN ('completed', 'cancelled') THEN
    RETURN FALSE;
  END IF;
  
  -- Check if all PO items have been fully received
  SELECT BOOL_AND(
    COALESCE(poi.quantity, 0) <= COALESCE(grn_totals.total_approved, 0)
  ) INTO v_all_items_received
  FROM purchase_order_items poi
  LEFT JOIN (
    SELECT 
      gi.po_item_id,
      SUM(gi.approved_quantity) as total_approved
    FROM grn_items gi
    WHERE gi.quality_status = 'approved'
      AND gi.approved_quantity > 0
    GROUP BY gi.po_item_id
  ) grn_totals ON grn_totals.po_item_id = poi.id
  WHERE poi.po_id = p_po_id;
  
  -- If all items received, mark PO as completed
  IF v_all_items_received THEN
    UPDATE purchase_orders
    SET status = 'completed',
        updated_at = NOW()
    WHERE id = p_po_id
    AND status != 'completed';  -- Only update if not already completed
    
    -- Log the completion
    RAISE NOTICE 'Purchase Order % marked as completed - all items received', p_po_id;
  END IF;
  
  RETURN COALESCE(v_all_items_received, FALSE);
END;
$$ LANGUAGE plpgsql;

-- 2. Update the existing GRN approval trigger function
CREATE OR REPLACE FUNCTION trg_grn_approved_insert_inventory()
RETURNS TRIGGER AS $$
DECLARE
  v_bin_id UUID;
  v_po_id UUID;
BEGIN
  -- Only act on status change to approved-like states
  IF TG_OP = 'UPDATE' AND NEW.status IN ('approved', 'partially_approved') AND COALESCE(OLD.status, '') <> NEW.status THEN
    -- Determine a default receiving bin
    v_bin_id := find_default_receiving_bin();

    -- Insert inventory entries for approved GRN items that don't already exist
    INSERT INTO warehouse_inventory (
      grn_id,
      grn_item_id,
      item_type,
      item_id,
      item_name,
      item_code,
      quantity,
      unit,
      bin_id,
      status,
      notes
    )
    SELECT
      NEW.id,
      gi.id,
      CASE gi.item_type
        WHEN 'fabric' THEN 'FABRIC'::warehouse_item_type
        WHEN 'product' THEN 'PRODUCT'::warehouse_item_type
        ELSE 'ITEM'::warehouse_item_type
      END,
      gi.item_id,
      gi.item_name,
      COALESCE(gi.item_image_url, gi.item_name), -- temporary code fallback; better if item_code exists
      COALESCE(gi.approved_quantity, 0),
      COALESCE(gi.unit_of_measure, 'pcs'),
      v_bin_id,
      'RECEIVED'::inventory_status,
      CONCAT('Auto-placed from GRN ', NEW.grn_number)
    FROM grn_items gi
    WHERE gi.grn_id = NEW.id
      AND COALESCE(gi.approved_quantity, 0) > 0
      AND gi.quality_status = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM warehouse_inventory wi
        WHERE wi.grn_item_id = gi.id
      );
    
    -- After warehouse inventory insert, check if PO is now complete
    -- Get the PO ID from the GRN
    SELECT po_id INTO v_po_id
    FROM grn_master
    WHERE id = NEW.id;
    
    -- Check and update PO completion status
    IF v_po_id IS NOT NULL THEN
      PERFORM check_and_update_po_completion(v_po_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Add comments for documentation
COMMENT ON FUNCTION check_and_update_po_completion(UUID) IS 'Checks if all items in a PO have been fully received via approved GRNs and marks PO as completed if so';
COMMENT ON FUNCTION trg_grn_approved_insert_inventory() IS 'Trigger function that inserts warehouse inventory on GRN approval and checks PO completion status';

-- 4. Success message
SELECT 'Auto-complete PO on GRN approval functionality added successfully!' as status;
