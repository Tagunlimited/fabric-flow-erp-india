-- Create inventory_logs table to track all inventory changes
-- This maintains a complete history of item additions, removals, adjustments, transfers, etc.

CREATE TABLE IF NOT EXISTS inventory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_inventory_id UUID REFERENCES warehouse_inventory(id) ON DELETE CASCADE,
  grn_id UUID,
  grn_item_id UUID,
  item_type TEXT NOT NULL,
  item_id UUID,
  item_name TEXT NOT NULL,
  item_code TEXT NOT NULL,
  quantity DECIMAL(10,3) NOT NULL, -- Quantity changed (positive for additions, negative for removals)
  old_quantity DECIMAL(10,3), -- Previous quantity before change
  new_quantity DECIMAL(10,3), -- New quantity after change
  unit TEXT NOT NULL,
  bin_id UUID REFERENCES bins(id),
  from_bin_id UUID REFERENCES bins(id), -- For transfers
  to_bin_id UUID REFERENCES bins(id), -- For transfers
  status TEXT NOT NULL DEFAULT 'RECEIVED',
  old_status TEXT, -- Previous status (for status changes)
  new_status TEXT, -- New status (for status changes)
  color TEXT, -- item_color or fabric_color
  action TEXT NOT NULL DEFAULT 'ADDED', -- 'ADDED', 'CONSOLIDATED', 'REMOVED', 'ADJUSTED', 'TRANSFERRED', 'STATUS_CHANGED'
  reference_type TEXT, -- 'GRN', 'PRODUCTION', 'TRANSFER', 'ADJUSTMENT', 'DISPATCH', etc.
  reference_id UUID, -- ID of the related record (e.g., order_id, cutting_job_id, etc.)
  reference_number TEXT, -- Human-readable reference (e.g., order number, job number)
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_inventory_logs_warehouse_inventory_id ON inventory_logs(warehouse_inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_item_id ON inventory_logs(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_item_code ON inventory_logs(item_code);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_grn_id ON inventory_logs(grn_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_created_at ON inventory_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_action ON inventory_logs(action);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_reference ON inventory_logs(reference_type, reference_id);

-- Enable RLS
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Authenticated users can view inventory logs" ON inventory_logs;
DROP POLICY IF EXISTS "Authenticated users can insert inventory logs" ON inventory_logs;
DROP POLICY IF EXISTS "Authenticated users can manage inventory logs" ON inventory_logs;

-- Create RLS policies
CREATE POLICY "Authenticated users can view inventory logs"
  ON inventory_logs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert inventory logs"
  ON inventory_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage inventory logs"
  ON inventory_logs
  FOR ALL
  TO authenticated
  USING (true);

