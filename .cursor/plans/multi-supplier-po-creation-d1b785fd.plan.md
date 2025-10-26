<!-- d1b785fd-bdfb-4199-adbf-ad89e37258b7 e31208ff-192a-45d2-b5a5-383e85c7ba52 -->
# Fix Multi-Supplier Purchase Order Creation

## Problem Analysis

The error "Could not find the 'gst_amount' column" indicates that the database schema includes pricing/GST columns (`gst_amount`, `gst_rate`, `unit_price`, `total_price`, `line_total`) that exist in the actual database but may not be in Supabase's schema cache, or they need to be populated even though the multi-supplier flow doesn't use pricing.

## Root Cause

The `purchase_order_items` table in the database (based on STAGING_ALL_IN_ONE.sql and STAGING_COMPLETE_SETUP.sql) has these columns with DEFAULT values:

- `gst_amount` DECIMAL(15,2) DEFAULT 0
- `gst_rate` DECIMAL(5,2) DEFAULT 0  
- `unit_price` DECIMAL(10,2) DEFAULT 0
- `total_price` DECIMAL(15,2) DEFAULT 0
- `line_total` DECIMAL(15,2) DEFAULT 0

However, the multi-supplier wizard is explicitly setting these fields, which may cause Supabase's cache to be out of sync.

## Solution Strategy

**Option 1: Remove explicit field setting (Recommended)**

- Remove pricing/GST fields from the insert statement in BomToPOWizard
- Let database defaults handle these columns
- Only set the required fields that have no defaults

**Option 2: Verify database schema matches**

- Check if the actual database has these columns
- If missing, run migration to add them
- Keep explicit field setting

## Implementation Plan

### 1. Update BomToPOWizard.tsx

**File**: `src/components/purchase-orders/BomToPOWizard.tsx`

**Change the purchase order items creation** (around line 150):

From:

```typescript
const poItems = group.items.map(item => ({
  po_id: poId,
  item_type: 'item',
  item_id: null,
  item_name: item.itemName,
  item_image_url: null,
  quantity: item.quantity,
  unit_price: 0,
  total_price: 0,
  gst_rate: 0,
  gst_amount: 0,
  line_total: 0,
  unit_of_measure: 'pcs',
  notes: item.remarks || null
}));
```

To:

```typescript
const poItems = group.items.map(item => ({
  po_id: poId,
  item_type: 'item',
  item_id: null,
  item_name: item.itemName,
  item_image_url: null,
  quantity: item.quantity,
  unit_of_measure: 'pcs',
  notes: item.remarks || null
  // Removed: unit_price, total_price, gst_rate, gst_amount, line_total
  // These will use database defaults (0)
}));
```

**Rationale**: The database schema has DEFAULT 0 for all pricing fields, so we don't need to explicitly set them. This avoids schema cache issues.

### 2. Ensure Database Schema is Correct

**Verification needed**: The actual production database must have these columns with DEFAULT values. If the error persists, it means:

a) The columns don't exist in the actual database

b) The columns exist but have NOT NULL constraints without defaults

c) Supabase schema cache is stale

**Backup SQL Migration** (if needed):

```sql
-- Add missing columns with defaults to purchase_order_items
ALTER TABLE purchase_order_items 
ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_price DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS gst_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS line_total DECIMAL(15,2) DEFAULT 0;

-- Remove NOT NULL constraints if they exist
ALTER TABLE purchase_order_items 
ALTER COLUMN unit_price DROP NOT NULL,
ALTER COLUMN total_price DROP NOT NULL,
ALTER COLUMN line_total DROP NOT NULL;
```

### 3. Alternative: Explicitly Set to NULL

If database defaults aren't working, try setting fields to NULL explicitly:

```typescript
const poItems = group.items.map(item => ({
  po_id: poId,
  item_type: 'item',
  item_id: null,
  item_name: item.itemName,
  item_image_url: null,
  quantity: item.quantity,
  unit_of_measure: 'pcs',
  notes: item.remarks || null,
  // Explicitly set to null to use database defaults
  unit_price: null,
  total_price: null,
  gst_rate: null,
  gst_amount: null,
  line_total: null
}));
```

### 4. Update PurchaseOrderForm for Consistency

**File**: `src/components/purchase-orders/PurchaseOrderForm.tsx`

Review the line items creation (around line 1367) to ensure it handles both:

- Regular POs with pricing
- Multi-supplier POs without pricing

The form should check if pricing fields are present before including them.

## Testing Checklist

1. Test multi-supplier PO creation with 2 suppliers
2. Verify purchase orders are created with correct PO numbers
3. Verify purchase order items are created with quantity and item details
4. Verify all pricing fields default to 0 in database
5. Verify BOM tracking records are created correctly
6. Test regular single-supplier PO creation still works

## Files to Modify

1. `src/components/purchase-orders/BomToPOWizard.tsx` - Remove explicit pricing fields
2. (Optional) Create SQL migration if database schema is missing columns

## Expected Outcome

- Multi-supplier PO wizard creates purchase orders successfully
- No schema cache errors
- Pricing/GST fields automatically set to 0 by database defaults
- Regular PO form continues to work with pricing

### To-dos

- [ ] Create database migration for bom_po_items table and view
- [ ] Implement BOM-PO tracking service functions
- [ ] Create custom hook for wizard state management
- [ ] Build Step 1: BOM Item Selection Component
- [ ] Build Step 2: Supplier Assignment Component with quantity splitting
- [ ] Build Step 3: Review and PO grouping component
- [ ] Create main wizard container component
- [ ] Create wizard dialog launcher
- [ ] Update BomList to show status and launch wizard
- [ ] Implement batch PO creation with tracking
- [ ] Create reusable status indicator components
- [ ] Test complete flow with multiple scenarios