-- Required by trg_grn_approved_insert_inventory (GRN approval → warehouse stock).
-- Idempotent: safe if 20260505160000_grn_inventory_direct_to_storage was never applied.

CREATE OR REPLACE FUNCTION public.find_default_storage_bin_for_warehouse(p_warehouse_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT b.id
  FROM public.bins b
  JOIN public.racks r ON r.id = b.rack_id
  JOIN public.floors f ON f.id = r.floor_id
  WHERE f.warehouse_id = p_warehouse_id
    AND b.location_type = 'STORAGE'::public.location_type
    AND COALESCE(b.is_active, true)
  ORDER BY b.created_at ASC NULLS LAST, b.id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.find_default_storage_bin()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT b.id
  FROM public.bins b
  WHERE b.location_type = 'STORAGE'::public.location_type
    AND COALESCE(b.is_active, true)
  ORDER BY b.created_at ASC NULLS LAST, b.id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.find_default_receiving_bin()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT public.find_default_storage_bin();
$$;

COMMENT ON FUNCTION public.find_default_storage_bin() IS
  'First active STORAGE bin (used when GRN is approved / partially approved).';
