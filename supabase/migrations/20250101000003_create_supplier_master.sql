-- Create supplier_master table
CREATE TABLE IF NOT EXISTS supplier_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_code TEXT NOT NULL UNIQUE,
  supplier_name TEXT NOT NULL,
  credit_limit DECIMAL(12,2) DEFAULT 0,
  pan TEXT,
  gst_number TEXT,
  primary_contact_name TEXT,
  primary_contact_email TEXT,
  primary_contact_phone TEXT,
  billing_address_line1 TEXT NOT NULL,
  billing_address_line2 TEXT,
  billing_address_city TEXT NOT NULL,
  billing_address_state TEXT NOT NULL,
  billing_address_country TEXT DEFAULT 'India',
  billing_address_pincode TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  total_outstanding_amount DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create supplier_specializations table to track what suppliers specialize in
CREATE TABLE IF NOT EXISTS supplier_specializations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES supplier_master(id) ON DELETE CASCADE,
  specialization_type TEXT NOT NULL CHECK (specialization_type IN ('fabric', 'item', 'product')),
  specialization_id UUID NOT NULL, -- References fabric_id, item_id, or product_id
  specialization_name TEXT NOT NULL, -- Denormalized name for easy querying
  priority INTEGER DEFAULT 1, -- Higher number = higher priority
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(supplier_id, specialization_type, specialization_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_supplier_master_code ON supplier_master(supplier_code);
CREATE INDEX IF NOT EXISTS idx_supplier_master_enabled ON supplier_master(enabled);
CREATE INDEX IF NOT EXISTS idx_supplier_specializations_supplier ON supplier_specializations(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_specializations_type_id ON supplier_specializations(specialization_type, specialization_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_supplier_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_supplier_updated_at
  BEFORE UPDATE ON supplier_master
  FOR EACH ROW
  EXECUTE FUNCTION update_supplier_updated_at();

-- Create function to get best suppliers for a given item/product/fabric
CREATE OR REPLACE FUNCTION get_best_suppliers(
  p_specialization_type TEXT,
  p_specialization_id UUID,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  supplier_id UUID,
  supplier_code TEXT,
  supplier_name TEXT,
  primary_contact_phone TEXT,
  primary_contact_email TEXT,
  total_outstanding_amount DECIMAL(12,2),
  priority INTEGER,
  credit_limit DECIMAL(12,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sm.id as supplier_id,
    sm.supplier_code,
    sm.supplier_name,
    sm.primary_contact_phone,
    sm.primary_contact_email,
    sm.total_outstanding_amount,
    ss.priority,
    sm.credit_limit
  FROM supplier_master sm
  INNER JOIN supplier_specializations ss ON sm.id = ss.supplier_id
  WHERE sm.enabled = true
    AND ss.specialization_type = p_specialization_type
    AND ss.specialization_id = p_specialization_id
  ORDER BY ss.priority DESC, sm.total_outstanding_amount ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;
