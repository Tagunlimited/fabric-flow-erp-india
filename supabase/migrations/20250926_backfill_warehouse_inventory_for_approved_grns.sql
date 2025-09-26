-- Backfill warehouse_inventory for already approved GRNs
DO $$
DECLARE
  v_bin_id UUID;
BEGIN
  v_bin_id := public.find_default_receiving_bin();
  IF v_bin_id IS NULL THEN
    RAISE NOTICE 'No RECEIVING_ZONE bin found. Skipping backfill.';
    RETURN;
  END IF;

  INSERT INTO public.warehouse_inventory (
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
    grn.id,
    gi.id,
    CASE gi.item_type
      WHEN 'fabric' THEN 'FABRIC'::warehouse_item_type
      WHEN 'product' THEN 'PRODUCT'::warehouse_item_type
      ELSE 'ITEM'::warehouse_item_type
    END,
    gi.item_id,
    gi.item_name,
    COALESCE(fm.fabric_code, im.item_code, gi.item_name),
    COALESCE(gi.approved_quantity, 0),
    COALESCE(gi.unit_of_measure, 'pcs'),
    v_bin_id,
    'RECEIVED'::inventory_status,
    CONCAT('Backfilled from approved GRN ', grn.grn_number)
  FROM public.grn_master grn
  JOIN public.grn_items gi ON gi.grn_id = grn.id
  LEFT JOIN public.fabric_master fm ON gi.item_type = 'fabric' AND fm.id = gi.item_id
  LEFT JOIN public.item_master im ON gi.item_type <> 'fabric' AND im.id = gi.item_id
  WHERE grn.status IN ('approved', 'partially_approved')
    AND gi.quality_status = 'approved'
    AND COALESCE(gi.approved_quantity, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.warehouse_inventory wi WHERE wi.grn_item_id = gi.id
    );
END $$;


