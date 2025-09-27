-- Complete Fix for Fabric Details in GRN and Purchase Orders
-- This script fixes fabric details not showing in GRN by adding missing columns
-- and backfilling data from fabric_master and item_master tables

-- ============================================
-- PART 1: Fix GRN Items Table
-- ============================================

-- Add fabric detail columns to grn_items table
ALTER TABLE public.grn_items 
ADD COLUMN IF NOT EXISTS fabric_color VARCHAR(100),
ADD COLUMN IF NOT EXISTS fabric_gsm VARCHAR(50),
ADD COLUMN IF NOT EXISTS fabric_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS item_color VARCHAR(100);

-- Add comments for GRN items
COMMENT ON COLUMN public.grn_items.fabric_color IS 'Color of the fabric item';
COMMENT ON COLUMN public.grn_items.fabric_gsm IS 'GSM (Grams per Square Meter) of the fabric';
COMMENT ON COLUMN public.grn_items.fabric_name IS 'Name of the fabric';
COMMENT ON COLUMN public.grn_items.item_color IS 'Color of the item (for non-fabric items)';

-- Create indexes for GRN items
CREATE INDEX IF NOT EXISTS idx_grn_items_fabric_color ON public.grn_items(fabric_color);
CREATE INDEX IF NOT EXISTS idx_grn_items_fabric_name ON public.grn_items(fabric_name);
CREATE INDEX IF NOT EXISTS idx_grn_items_item_color ON public.grn_items(item_color);

-- ============================================
-- PART 2: Fix Purchase Order Items Table
-- ============================================

-- Add fabric detail columns to purchase_order_items table
ALTER TABLE public.purchase_order_items 
ADD COLUMN IF NOT EXISTS fabric_color VARCHAR(100),
ADD COLUMN IF NOT EXISTS fabric_gsm VARCHAR(50),
ADD COLUMN IF NOT EXISTS fabric_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS item_color VARCHAR(100),
ADD COLUMN IF NOT EXISTS fabric_id UUID,
ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 18.00;

-- Add comments for purchase order items
COMMENT ON COLUMN public.purchase_order_items.fabric_color IS 'Color of the fabric item';
COMMENT ON COLUMN public.purchase_order_items.fabric_gsm IS 'GSM (Grams per Square Meter) of the fabric';
COMMENT ON COLUMN public.purchase_order_items.fabric_name IS 'Name of the fabric';
COMMENT ON COLUMN public.purchase_order_items.item_color IS 'Color of the item (for non-fabric items)';
COMMENT ON COLUMN public.purchase_order_items.fabric_id IS 'Reference to fabric_master table';
COMMENT ON COLUMN public.purchase_order_items.gst_rate IS 'GST rate for the item';

-- Create indexes for purchase order items
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_fabric_color ON public.purchase_order_items(fabric_color);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_fabric_name ON public.purchase_order_items(fabric_name);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_item_color ON public.purchase_order_items(item_color);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_fabric_id ON public.purchase_order_items(fabric_id);

-- ============================================
-- PART 3: Backfill Data for Purchase Order Items
-- ============================================

-- Update existing purchase order items to populate fabric details
UPDATE public.purchase_order_items 
SET 
  fabric_color = COALESCE(
    (SELECT fm.color FROM public.fabric_master fm WHERE fm.id = purchase_order_items.item_id AND purchase_order_items.item_type = 'fabric'),
    fabric_color
  ),
  fabric_gsm = COALESCE(
    (SELECT fm.gsm FROM public.fabric_master fm WHERE fm.id = purchase_order_items.item_id AND purchase_order_items.item_type = 'fabric'),
    fabric_gsm
  ),
  fabric_name = COALESCE(
    (SELECT fm.fabric_name FROM public.fabric_master fm WHERE fm.id = purchase_order_items.item_id AND purchase_order_items.item_type = 'fabric'),
    fabric_name
  ),
  item_color = COALESCE(
    (SELECT im.color FROM public.item_master im WHERE im.id = purchase_order_items.item_id AND purchase_order_items.item_type != 'fabric'),
    item_color
  ),
  fabric_id = CASE 
    WHEN item_type = 'fabric' THEN item_id 
    ELSE fabric_id 
  END,
  gst_rate = COALESCE(
    (SELECT fm.gst FROM public.fabric_master fm WHERE fm.id = purchase_order_items.item_id AND purchase_order_items.item_type = 'fabric'),
    (SELECT im.gst_rate FROM public.item_master im WHERE im.id = purchase_order_items.item_id AND purchase_order_items.item_type != 'fabric'),
    gst_rate
  )
WHERE purchase_order_items.item_id IS NOT NULL;

-- ============================================
-- PART 4: Backfill Data for GRN Items
-- ============================================

-- Update existing GRN items to populate fabric details from related tables
UPDATE public.grn_items 
SET 
  fabric_color = COALESCE(
    (SELECT fm.color FROM public.fabric_master fm WHERE fm.id = grn_items.item_id AND grn_items.item_type = 'fabric'),
    (SELECT poi.fabric_color FROM public.purchase_order_items poi WHERE poi.id = grn_items.po_item_id),
    fabric_color
  ),
  fabric_gsm = COALESCE(
    (SELECT fm.gsm FROM public.fabric_master fm WHERE fm.id = grn_items.item_id AND grn_items.item_type = 'fabric'),
    (SELECT poi.fabric_gsm FROM public.purchase_order_items poi WHERE poi.id = grn_items.po_item_id),
    fabric_gsm
  ),
  fabric_name = COALESCE(
    (SELECT fm.fabric_name FROM public.fabric_master fm WHERE fm.id = grn_items.item_id AND grn_items.item_type = 'fabric'),
    (SELECT poi.fabric_name FROM public.purchase_order_items poi WHERE poi.id = grn_items.po_item_id),
    fabric_name
  ),
  item_color = COALESCE(
    (SELECT im.color FROM public.item_master im WHERE im.id = grn_items.item_id AND grn_items.item_type != 'fabric'),
    (SELECT poi.item_color FROM public.purchase_order_items poi WHERE poi.id = grn_items.po_item_id),
    item_color
  )
WHERE grn_items.item_id IS NOT NULL;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================

SELECT 'Fabric details fix completed successfully!' as status;
SELECT 'GRN items and Purchase Order items now have fabric detail columns' as details;
