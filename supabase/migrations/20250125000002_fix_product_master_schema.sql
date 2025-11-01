-- Fix product_master table to add missing columns that ProductMasterNew component expects
-- This migration ensures the product_master table has all required columns

-- Add missing columns if they don't exist
DO $$
BEGIN
  -- Add product_id if it doesn't exist (some schemas use product_code instead)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'product_id'
  ) THEN
    -- If product_code exists, we'll rename it or keep both
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'product_code'
    ) THEN
      -- Copy data from product_code to product_id, then we can drop product_code later if needed
      ALTER TABLE product_master ADD COLUMN product_id VARCHAR(50);
      UPDATE product_master SET product_id = product_code WHERE product_id IS NULL;
      ALTER TABLE product_master ALTER COLUMN product_id SET NOT NULL;
      ALTER TABLE product_master ADD CONSTRAINT product_master_product_id_unique UNIQUE (product_id);
    ELSE
      ALTER TABLE product_master ADD COLUMN product_id VARCHAR(50) UNIQUE NOT NULL;
    END IF;
  END IF;

  -- Add current_stock
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'current_stock'
  ) THEN
    ALTER TABLE product_master ADD COLUMN current_stock DECIMAL(10,2) DEFAULT 0;
  END IF;

  -- Add default_price
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'default_price'
  ) THEN
    ALTER TABLE product_master ADD COLUMN default_price DECIMAL(10,2) DEFAULT 0;
    -- If base_price exists, copy its values
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'base_price'
    ) THEN
      UPDATE product_master SET default_price = COALESCE(base_price, 0) WHERE default_price = 0;
    END IF;
  END IF;

  -- Add regular_buying_price
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'regular_buying_price'
  ) THEN
    ALTER TABLE product_master ADD COLUMN regular_buying_price DECIMAL(10,2) DEFAULT 0;
  END IF;

  -- Add wholesale_buying_price
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'wholesale_buying_price'
  ) THEN
    ALTER TABLE product_master ADD COLUMN wholesale_buying_price DECIMAL(10,2) DEFAULT 0;
  END IF;

  -- Add regular_selling_price
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'regular_selling_price'
  ) THEN
    ALTER TABLE product_master ADD COLUMN regular_selling_price DECIMAL(10,2) DEFAULT 0;
    -- If selling_price exists, copy its values
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'selling_price'
    ) THEN
      UPDATE product_master SET regular_selling_price = COALESCE(selling_price, 0) WHERE regular_selling_price = 0;
    END IF;
  END IF;

  -- Add mrp if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'mrp'
  ) THEN
    ALTER TABLE product_master ADD COLUMN mrp DECIMAL(10,2) DEFAULT 0;
  END IF;

  -- Add gst_rate (might be tax_rate in some schemas)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'gst_rate'
  ) THEN
    ALTER TABLE product_master ADD COLUMN gst_rate DECIMAL(5,2) DEFAULT 0;
    -- If tax_rate exists, copy its values
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'tax_rate'
    ) THEN
      UPDATE product_master SET gst_rate = COALESCE(tax_rate, 0) WHERE gst_rate = 0;
    END IF;
  END IF;

  -- Add weight
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'weight'
  ) THEN
    ALTER TABLE product_master ADD COLUMN weight DECIMAL(8,2) DEFAULT 0;
  END IF;

  -- Add brand
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'brand'
  ) THEN
    ALTER TABLE product_master ADD COLUMN brand VARCHAR(100);
  END IF;

  -- Add image_url if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE product_master ADD COLUMN image_url TEXT;
  END IF;

  -- Add is_active (might be status in some schemas)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE product_master ADD COLUMN is_active BOOLEAN DEFAULT true;
    -- If status exists, map it to is_active
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'status'
    ) THEN
      UPDATE product_master SET is_active = (status = 'active');
    END IF;
  END IF;

  -- Add unit (might be unit_of_measure in some schemas)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'unit'
  ) THEN
    ALTER TABLE product_master ADD COLUMN unit VARCHAR(20) DEFAULT 'pcs';
    -- If unit_of_measure exists, copy its values
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'unit_of_measure'
    ) THEN
      UPDATE product_master SET unit = COALESCE(unit_of_measure, 'pcs') WHERE unit = 'pcs';
    END IF;
  END IF;

  -- Ensure product_category exists (might be category in some schemas)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'product_category'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'category'
    ) THEN
      ALTER TABLE product_master ADD COLUMN product_category VARCHAR(100);
      UPDATE product_master SET product_category = category WHERE product_category IS NULL;
    ELSE
      ALTER TABLE product_master ADD COLUMN product_category VARCHAR(100);
    END IF;
  END IF;

  -- Add created_at if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE product_master ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;

  -- Add updated_at if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE product_master ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;
END $$;

-- Create index on product_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_product_master_product_id ON product_master(product_id);

-- Create updated_at trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_product_master_updated_at'
  ) THEN
    CREATE TRIGGER update_product_master_updated_at 
    BEFORE UPDATE ON product_master 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

COMMENT ON TABLE product_master IS 'Master table for products used in readymade orders';

