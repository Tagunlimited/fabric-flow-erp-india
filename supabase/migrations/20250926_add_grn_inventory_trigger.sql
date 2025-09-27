-- Auto-insert warehouse_inventory rows when GRN is approved or partially approved
-- Safe to re-run: drops/replaces function and trigger

-- Create helper function to find a default receiving bin
CREATE OR REPLACE FUNCTION find_default_receiving_bin() RETURNS UUID AS $$
DECLARE
  v_bin_id UUID;
BEGIN
  -- Pick any active bin marked as RECEIVING_ZONE
  SELECT b.id INTO v_bin_id
  FROM bins b
  WHERE b.location_type = 'RECEIVING_ZONE'::location_type
    AND b.is_active = true
  ORDER BY b.created_at
  LIMIT 1;

  RETURN v_bin_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger function: when GRN status transitions to approved/partially_approved
CREATE OR REPLACE FUNCTION trg_grn_approved_insert_inventory()
RETURNS TRIGGER AS $$
DECLARE
  v_bin_id UUID;
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
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate the trigger to avoid duplicates
DROP TRIGGER IF EXISTS trg_after_grn_status_on_grn_master ON grn_master;
CREATE TRIGGER trg_after_grn_status_on_grn_master
AFTER UPDATE ON grn_master
FOR EACH ROW
EXECUTE FUNCTION trg_grn_approved_insert_inventory();


