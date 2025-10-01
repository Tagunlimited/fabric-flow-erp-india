-- Add size-wise cutting quantities column to order_assignments table
-- This allows storing cutting progress for each size separately

-- Add the new column to store size-wise cut quantities as JSONB
ALTER TABLE public.order_assignments 
ADD COLUMN IF NOT EXISTS cut_quantities_by_size JSONB DEFAULT '{}';

-- Add a comment to explain the column
COMMENT ON COLUMN public.order_assignments.cut_quantities_by_size IS 'Stores cutting quantities by size as JSONB object, e.g., {"XS": 10, "S": 20, "M": 30}';

-- Create an index on the JSONB column for better query performance
CREATE INDEX IF NOT EXISTS idx_order_assignments_cut_quantities_by_size 
ON public.order_assignments USING GIN (cut_quantities_by_size);

-- Add a function to get total cut quantity from size-wise quantities
CREATE OR REPLACE FUNCTION get_total_cut_quantity_from_sizes(cut_quantities_by_size JSONB)
RETURNS INTEGER AS $$
BEGIN
  IF cut_quantities_by_size IS NULL OR cut_quantities_by_size = '{}'::jsonb THEN
    RETURN 0;
  END IF;
  
  RETURN (
    SELECT COALESCE(SUM(value::INTEGER), 0)
    FROM jsonb_each_text(cut_quantities_by_size)
  );
END;
$$ LANGUAGE plpgsql;

-- Add a function to get cut quantity for a specific size
CREATE OR REPLACE FUNCTION get_cut_quantity_for_size(cut_quantities_by_size JSONB, size_name TEXT)
RETURNS INTEGER AS $$
BEGIN
  IF cut_quantities_by_size IS NULL OR cut_quantities_by_size = '{}'::jsonb THEN
    RETURN 0;
  END IF;
  
  RETURN COALESCE((cut_quantities_by_size ->> size_name)::INTEGER, 0);
END;
$$ LANGUAGE plpgsql;

-- Create a view to show cutting progress with size breakdown
CREATE OR REPLACE VIEW cutting_progress_with_sizes AS
SELECT 
  oa.order_id,
  o.order_number,
  c.company_name as customer_name,
  oa.cutting_master_name,
  oa.cut_quantity as total_cut_quantity,
  oa.cut_quantities_by_size,
  -- Calculate total from size-wise quantities
  get_total_cut_quantity_from_sizes(oa.cut_quantities_by_size) as calculated_total_cut,
  -- Get order total quantity from BOM
  COALESCE(bom.total_order_qty, 0) as total_order_quantity,
  -- Calculate progress percentage
  CASE 
    WHEN COALESCE(bom.total_order_qty, 0) > 0 THEN
      ROUND((get_total_cut_quantity_from_sizes(oa.cut_quantities_by_size)::DECIMAL / bom.total_order_qty) * 100, 2)
    ELSE 0
  END as progress_percentage,
  oa.cutting_work_date,
  oa.updated_at
FROM public.order_assignments oa
LEFT JOIN public.orders o ON oa.order_id = o.id
LEFT JOIN public.customers c ON o.customer_id = c.id
LEFT JOIN (
  SELECT 
    order_id,
    SUM(total_order_qty) as total_order_qty
  FROM public.bom_records
  GROUP BY order_id
) bom ON oa.order_id = bom.order_id
WHERE oa.cutting_master_id IS NOT NULL;

-- Grant necessary permissions
GRANT SELECT, UPDATE ON public.order_assignments TO authenticated;
GRANT SELECT ON public.cutting_progress_with_sizes TO authenticated;

-- Add a trigger to automatically update the total cut_quantity when cut_quantities_by_size changes
CREATE OR REPLACE FUNCTION update_total_cut_quantity()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the total cut_quantity based on the size-wise quantities
  NEW.cut_quantity = get_total_cut_quantity_from_sizes(NEW.cut_quantities_by_size);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_update_total_cut_quantity ON public.order_assignments;
CREATE TRIGGER trigger_update_total_cut_quantity
  BEFORE UPDATE ON public.order_assignments
  FOR EACH ROW
  WHEN (NEW.cut_quantities_by_size IS DISTINCT FROM OLD.cut_quantities_by_size)
  EXECUTE FUNCTION update_total_cut_quantity();
