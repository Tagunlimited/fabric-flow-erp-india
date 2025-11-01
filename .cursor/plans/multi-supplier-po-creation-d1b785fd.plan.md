<!-- d1b785fd-bdfb-4199-adbf-ad89e37258b7 e80f2403-be2e-47a1-b9ef-fd8c1bc27956 -->
# Fix Fabric Color Data Loss in Multi-Supplier Purchase Orders

## Problem Analysis

The fabric color is changing from "Grey Melange" to "Black" after refresh because:

1. **Data Storage Issue**: When creating PO items via multi-supplier wizard, fabric details (name, color, GSM) are stored in `item_name` field as "Dotknit 180 GSM - Grey Melange - 180 GSM"
2. **Data Retrieval Issue**: When loading the PO, the form tries to read from `fabric_color` and `fabric_gsm` columns which don't exist in the database
3. **Fallback Lookup**: When these fields are null, the form looks up the fabric in `fabricOptions` by matching `fabric_name`, `color`, and `gsm`
4. **Wrong Match**: The lookup finds the wrong fabric (with Black color) instead of Grey Melange

## Root Cause

**File**: `src/components/purchase-orders/BomToPOWizard.tsx` (Lines 169-183)

Currently stores fabric details in `item_name`:

```typescript
const fabricDetails = [
  bomItem.fabric_name,        // "Dotknit 180 GSM"
  bomItem.fabric_color,       // "Grey Melange"
  bomItem.fabric_gsm         // "180 GSM"
].filter(Boolean).join(' - ');

return {
  ...baseItem,
  item_name: fabricDetails || item.itemName,  // "Dotknit 180 GSM - Grey Melange - 180 GSM"
  notes: (item.remarks || '') + (fabricDetails ? ` | Fabric: ${fabricDetails}` : '')
};
```

**File**: `src/components/purchase-orders/PurchaseOrderForm.tsx` (Lines 1193-1205)

When loading, tries to read non-existent columns:

```typescript
const processedItems = (lineItems || []).map(item => ({
  ...item,
  fabric_name: item.fabric_name || null,    // NULL - column doesn't exist
  fabric_color: item.fabric_color || null,   // NULL - column doesn't exist
  fabric_gsm: item.fabric_gsm || null,       // NULL - column doesn't exist
}));
```

**File**: `src/components/purchase-orders/PurchaseOrderForm.tsx` (Lines 189-230)

Then tries to parse from `item_name` and lookup in fabric_master:

```typescript
// Parse from item_name: "Dotknit 180 GSM - Grey Melange - 180 GSM"
const itemNameParts = item.item_name?.split(' - ') || [];
fabricName = itemNameParts[0]?.trim();    // "Dotknit 180 GSM"
fabricColor = itemNameParts[1]?.trim();   // "Grey Melange"
fabricGsm = itemNameParts[2]?.replace('GSM', '').trim(); // "180"

// Lookup in fabricOptions
let fabricOption = fabricOptions.find(f => 
  f.fabric_name === fabricName &&   // "Dotknit 180 GSM"
  f.color === fabricColor &&        // "Grey Melange"
  f.gsm === fabricGsm              // "180"
);

// If not found, tries fallback lookups that may find wrong fabric
```

## Solution Strategy

### Option 1: Add Database Columns (Recommended)

Add `fabric_name`, `fabric_color`, `fabric_gsm` columns to `purchase_order_items` table.

**Pros**: Clean separation, proper data structure, easier queries

**Cons**: Requires database migration

### Option 2: Improve Parsing Logic

Store fabric details in a structured JSON in `notes` field and parse reliably.

**Pros**: No database changes needed

**Cons**: Less clean, harder to query, parsing can be fragile

## Recommended Implementation: Add Database Columns

### Step 1: Create Database Migration

Create SQL migration to add fabric columns to `purchase_order_items`:

```sql
-- Add fabric-specific columns to purchase_order_items table
ALTER TABLE purchase_order_items 
ADD COLUMN IF NOT EXISTS fabric_name TEXT,
ADD COLUMN IF NOT EXISTS fabric_color TEXT,
ADD COLUMN IF NOT EXISTS fabric_gsm TEXT;

-- Create index for faster fabric lookups
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_fabric 
ON purchase_order_items(fabric_name, fabric_color, fabric_gsm)
WHERE fabric_name IS NOT NULL;
```

### Step 2: Update Multi-Supplier Wizard to Use New Columns

**File**: `src/components/purchase-orders/BomToPOWizard.tsx` (Lines 169-183)

```typescript
// Add fabric-specific attributes if it's a fabric item
if (itemType === 'fabric' && bomItem) {
  return {
    ...baseItem,
    // Store in dedicated columns instead of item_name
    fabric_name: bomItem.fabric_name || '',
    fabric_color: bomItem.fabric_color || '',
    fabric_gsm: bomItem.fabric_gsm || '',
    // Keep item_name as fabric name for display
    item_name: bomItem.fabric_name || item.itemName,
    // Store full details in notes as backup
    notes: (item.remarks || '') + ` | Fabric: ${bomItem.fabric_name || ''} - ${bomItem.fabric_color || ''} - ${bomItem.fabric_gsm || ''}`
  };
}
```

### Step 3: Update PurchaseOrderForm Loading Logic

**File**: `src/components/purchase-orders/PurchaseOrderForm.tsx` (Lines 1193-1205)

The current code already tries to read these columns, so it will work once they exist:

```typescript
const processedItems = (lineItems || []).map(item => ({
  ...item,
  item_type: item.item_type || 'item',
  // These will now read from actual database columns
  fabric_name: item.fabric_name || null,
  fabric_color: item.fabric_color || null,
  fabric_gsm: item.fabric_gsm || null,
  // ... rest of mapping
}));
```

### Step 4: Update Display Logic (Already Correct)

**File**: `src/components/purchase-orders/PurchaseOrderForm.tsx` (Lines 1666-1686)

The UI already displays from the correct fields:

```typescript
<div className="col-span-2">
  <Label>Fabric</Label>
  <div>{it.fabric_name || it.item_name || 'N/A'}</div>
</div>

<div className="col-span-1">
  <Label>Color</Label>
  <div>{it.fabric_color || 'N/A'}</div>
</div>

<div className="col-span-1">
  <Label>GSM</Label>
  <div>{it.fabric_gsm ? `${it.fabric_gsm} GSM` : 'N/A'}</div>
</div>
```

### Step 5: Update TypeScript Schema

**File**: `src/integrations/supabase/types.ts` (Lines 1587-1648)

Add new columns to the `purchase_order_items` type:

```typescript
purchase_order_items: {
  Row: {
    created_at: string
    gst_amount: number
    gst_rate: number
    id: string
    item_id: string | null
    item_image_url: string | null
    item_name: string
    item_type: string
    line_total: number
    notes: string | null
    po_id: string
    quantity: number
    total_price: number
    unit_of_measure: string
    unit_price: number
    fabric_name: string | null     // ADD THIS
    fabric_color: string | null    // ADD THIS
    fabric_gsm: string | null      // ADD THIS
  }
  // ... also add to Insert and Update types
}
```

## Files to Modify

1. **Create new migration file**: `supabase/migrations/[timestamp]_add_fabric_columns_to_purchase_order_items.sql`
2. **Update**: `src/components/purchase-orders/BomToPOWizard.tsx` (Lines 169-183)
3. **Update**: `src/integrations/supabase/types.ts` (Lines 1587-1648)

## Testing Checklist

1. Run the database migration
2. Create a new multi-supplier PO from a BOM with fabric items
3. Verify fabric details are saved correctly in database
4. Refresh the PO detail page
5. Verify color stays as "Grey Melange" (or original color) after refresh
6. Verify all fabric details display correctly
7. Test single-supplier PO creation still works
8. Test print view shows correct fabric details

## Expected Outcome

- Fabric color, name, and GSM persist correctly in database
- No data loss on page refresh
- Both multi-supplier and single-supplier POs work correctly
- Fabric details display accurately in UI and print views

### To-dos

- [ ] Verify purchase order items are being fetched with all required fields
- [ ] Fix non-fabric items display section to show all item details properly
- [ ] Test purchase order detail display with multi-supplier PO items