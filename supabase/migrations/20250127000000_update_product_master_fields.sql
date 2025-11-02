-- Update product_master table to match the required fields from the image
-- This migration adds missing fields and ensures all required columns exist

DO $$
BEGIN
  -- Add sku if it doesn't exist (might be product_id in some schemas)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'sku'
  ) THEN
    ALTER TABLE product_master ADD COLUMN sku TEXT;
    -- If product_id exists and is unique, copy to sku
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'product_id'
    ) THEN
      UPDATE product_master SET sku = product_id WHERE sku IS NULL;
    END IF;
    -- Create index on sku
    CREATE INDEX IF NOT EXISTS idx_product_master_sku ON product_master(sku);
  END IF;

  -- Add class if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'class'
  ) THEN
    ALTER TABLE product_master ADD COLUMN class TEXT;
  END IF;

  -- Add color if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'color'
  ) THEN
    ALTER TABLE product_master ADD COLUMN color TEXT;
  END IF;

  -- Add size_type if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'size_type'
  ) THEN
    ALTER TABLE product_master ADD COLUMN size_type TEXT;
  END IF;

  -- Add size if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'size'
  ) THEN
    ALTER TABLE product_master ADD COLUMN size TEXT;
  END IF;

  -- Add name/product if it doesn't exist (map to name)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'name'
  ) THEN
    -- If product_name exists, copy to name
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'product_name'
    ) THEN
      ALTER TABLE product_master ADD COLUMN name TEXT;
      UPDATE product_master SET name = product_name WHERE name IS NULL;
    ELSE
      ALTER TABLE product_master ADD COLUMN name TEXT;
    END IF;
  END IF;

  -- Add material if it doesn't exist (map to fabric if fabric exists)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'material'
  ) THEN
    ALTER TABLE product_master ADD COLUMN material TEXT;
    -- If fabric exists, copy to material
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'fabric'
    ) THEN
      UPDATE product_master SET material = fabric WHERE material IS NULL;
    END IF;
  END IF;

  -- Ensure brand exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'brand'
  ) THEN
    ALTER TABLE product_master ADD COLUMN brand TEXT;
  END IF;

  -- Ensure category exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'category'
  ) THEN
    -- If product_category exists, copy to category
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'product_category'
    ) THEN
      ALTER TABLE product_master ADD COLUMN category TEXT;
      UPDATE product_master SET category = product_category WHERE category IS NULL;
    ELSE
      ALTER TABLE product_master ADD COLUMN category TEXT;
    END IF;
  END IF;

  -- Add gender if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'gender'
  ) THEN
    ALTER TABLE product_master ADD COLUMN gender TEXT;
  END IF;

  -- Ensure mrp exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'mrp'
  ) THEN
    ALTER TABLE product_master ADD COLUMN mrp DECIMAL(10,2) DEFAULT 0;
  END IF;

  -- Add cost if it doesn't exist (map to cost_price)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'cost'
  ) THEN
    ALTER TABLE product_master ADD COLUMN cost DECIMAL(10,2) DEFAULT 0;
    -- If cost_price exists, copy to cost
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'cost_price'
    ) THEN
      UPDATE product_master SET cost = COALESCE(cost_price, 0) WHERE cost = 0;
    END IF;
  END IF;

  -- Ensure selling_price exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'selling_price'
  ) THEN
    ALTER TABLE product_master ADD COLUMN selling_price DECIMAL(10,2) DEFAULT 0;
  END IF;

  -- Ensure gst_rate exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'gst_rate'
  ) THEN
    ALTER TABLE product_master ADD COLUMN gst_rate DECIMAL(5,2) DEFAULT 0;
  END IF;

  -- Add hsn if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'hsn'
  ) THEN
    ALTER TABLE product_master ADD COLUMN hsn TEXT;
  END IF;

  -- Add main_image if it doesn't exist (map to image_url if exists)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'main_image'
  ) THEN
    ALTER TABLE product_master ADD COLUMN main_image TEXT;
    -- If image_url exists, copy to main_image
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'image_url'
    ) THEN
      UPDATE product_master SET main_image = image_url WHERE main_image IS NULL;
    END IF;
  END IF;

  -- Add image1 if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'image1'
  ) THEN
    ALTER TABLE product_master ADD COLUMN image1 TEXT;
    -- If images array exists and has first element, copy to image1
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'images'
      AND data_type = 'ARRAY'
    ) THEN
      -- Update where images array has at least one element
      UPDATE product_master 
      SET image1 = (images[1])::TEXT 
      WHERE images IS NOT NULL 
      AND array_length(images, 1) > 0 
      AND image1 IS NULL;
    END IF;
  END IF;

  -- Add image2 if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'image2'
  ) THEN
    ALTER TABLE product_master ADD COLUMN image2 TEXT;
    -- If images array exists and has second element, copy to image2
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'product_master' AND column_name = 'images'
      AND data_type = 'ARRAY'
    ) THEN
      -- Update where images array has at least two elements
      UPDATE product_master 
      SET image2 = (images[2])::TEXT 
      WHERE images IS NOT NULL 
      AND array_length(images, 1) > 1 
      AND image2 IS NULL;
    END IF;
  END IF;

  -- Ensure created_at exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE product_master ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  -- Ensure updated_at exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'product_master' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE product_master ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_product_master_sku ON product_master(sku);
CREATE INDEX IF NOT EXISTS idx_product_master_class ON product_master(class);
CREATE INDEX IF NOT EXISTS idx_product_master_color ON product_master(color);
CREATE INDEX IF NOT EXISTS idx_product_master_size_type ON product_master(size_type);
CREATE INDEX IF NOT EXISTS idx_product_master_category ON product_master(category);
CREATE INDEX IF NOT EXISTS idx_product_master_brand ON product_master(brand);
CREATE INDEX IF NOT EXISTS idx_product_master_gender ON product_master(gender);

-- Create or replace updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$ language 'plpgsql';

-- Create or replace updated_at trigger
DROP TRIGGER IF EXISTS update_product_master_updated_at ON product_master;
CREATE TRIGGER update_product_master_updated_at 
    BEFORE UPDATE ON product_master 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON COLUMN product_master.sku IS 'Stock Keeping Unit - Unique product identifier';
COMMENT ON COLUMN product_master.class IS 'Product class/category code';
COMMENT ON COLUMN product_master.color IS 'Product color';
COMMENT ON COLUMN product_master.size_type IS 'Size type system (e.g., MEN-ALPHA)';
COMMENT ON COLUMN product_master.size IS 'Specific size (S, M, L, XL, 2XL, etc.)';
COMMENT ON COLUMN product_master.name IS 'Product name';
COMMENT ON COLUMN product_master.material IS 'Material composition (e.g., polyester)';
COMMENT ON COLUMN product_master.cost IS 'Cost price';
COMMENT ON COLUMN product_master.main_image IS 'Main product image URL';
COMMENT ON COLUMN product_master.image1 IS 'Additional product image 1 URL';
COMMENT ON COLUMN product_master.image2 IS 'Additional product image 2 URL';

COMMENT ON TABLE product_master IS 'Master table for products with all required fields for product management';

