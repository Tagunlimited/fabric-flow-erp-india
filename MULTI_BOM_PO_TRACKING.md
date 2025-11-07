# Multi-BOM Purchase Order Tracking

## Problem Statement

When a Purchase Order (PO) was created with fabrics/items from multiple pending BOMs, only the first BOM would be marked as having its PO created. The other BOMs would still appear in the "Pending" tab even though their items were included in the PO.

## Root Cause

The system was tracking which BOM a PO belonged to at the PO level (`purchase_orders.bom_id`), not at the item level. When a PO was created with items from multiple BOMs:

1. Only the first BOM's ID was stored in `purchase_orders.bom_id`
2. All items in `purchase_order_items` were associated with the PO, but had no direct link to their source BOMs
3. When checking if a BOM's items were ordered, the system could only find items for the first BOM

## Solution

### 1. Database Changes

**Migration File**: `supabase/migrations/20250107000001_add_bom_id_to_purchase_order_items.sql`

Added `bom_id` column to `purchase_order_items` table to track which BOM each item belongs to:

```sql
ALTER TABLE purchase_order_items 
ADD COLUMN IF NOT EXISTS bom_id UUID REFERENCES bom_records(id);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_bom_id 
ON purchase_order_items(bom_id);
```

This enables:
- Each item in a PO to reference its source BOM
- A single PO to contain items from multiple BOMs
- Accurate tracking of which BOMs have been fulfilled

### 2. Code Changes

#### A. PurchaseOrderFormDialog.tsx

**Updated**: Line 375 (previously commented out)

```typescript
// Before:
// bom_id: item.bom_id || null, // COMMENTED OUT

// After:
bom_id: item.bom_id || null, // Store BOM ID for each item
```

Now when creating a PO, each item stores which BOM it came from.

#### B. PurchaseOrderList.tsx

**Updated**: Lines 279-313

Changed from mapping BOM IDs from POs to using item-level BOM IDs:

```typescript
// Before:
const { data: allPOs } = await supabase
  .from('purchase_orders')
  .select('id, bom_id');

const bomIdByPoId: Record<string, string> = {};
allPOs.forEach(po => {
  if (po.bom_id) bomIdByPoId[po.id] = po.bom_id;
});

allPOItems = poItemsData.map(item => ({
  ...item,
  bom_id: bomIdByPoId[item.po_id] || null // Get from PO
}));

// After:
const { data: poItemsData } = await supabase
  .from('purchase_order_items')
  .select(`
    ...,
    bom_id  // Get directly from item
  `)
  .in('po_id', poIds);

allPOItems = poItemsData; // Each item has its own bom_id
```

**Updated**: Lines 408-421

Improved comments to clarify item-level tracking:

```typescript
// Create a map by BOM ID for items that are explicitly linked to a BOM
// IMPORTANT: Each PO item now has its own bom_id, so we can track which BOM it belongs to
// This enables a single PO to fulfill items from multiple BOMs
const poItemsByBomId: Record<string, Map<string, number>> = {};
```

**Updated**: Lines 681-692

Enhanced comments for ordered quantity calculation:

```typescript
// IMPORTANT: Use BOM-specific ordered quantities to determine if a BOM should appear in pending
// Each PO item now has a bom_id that links it to the specific BOM it's fulfilling
// This allows:
// 1. A single PO to fulfill items from multiple BOMs
// 2. Multiple BOMs to be marked as having their PO created when one PO covers them all
// 3. Accurate tracking of which BOMs still need POs
```

## How It Works Now

### Creating a PO from Multiple BOMs

1. User selects multiple BOMs in the "Pending" tab
2. Clicks "Create PO" button
3. PurchaseOrderFormDialog opens with all items from all selected BOMs
4. Items are grouped by type (fabrics, items) but maintain their `bom_id` internally
5. When PO is saved:
   - Each item in `purchase_order_items` includes its source `bom_id`
   - Example:
     ```
     PO-001:
       - Item 1 (Fabric A) -> bom_id: BOM-123
       - Item 2 (Fabric B) -> bom_id: BOM-456
       - Item 3 (Zipper)   -> bom_id: BOM-123
       - Item 4 (Button)   -> bom_id: BOM-456
     ```

### Checking BOM Status

1. System fetches all BOMs and their items
2. For each BOM, it calculates remaining quantities:
   - Fetches all PO items where `bom_id` matches the BOM's ID
   - Groups by item key (fabric name/color/GSM or item ID)
   - Calculates: `remaining = required - ordered`
3. BOMs with `remaining > 0` appear in "Pending" tab
4. BOMs with `remaining = 0` move to "In Progress" (no GRN) or "Completed" (has GRN)

### Result

✅ When a PO is created with items from multiple BOMs:
- **All** BOMs are marked as having their items ordered
- **All** BOMs disappear from "Pending" tab (if fully ordered)
- Each BOM correctly tracks which items were ordered for it
- System can handle partial fulfillment (some items ordered, others pending)

## Testing

### Test Scenario 1: Full Fulfillment

1. Create 3 BOMs, each requiring "Fabric A - Black - 240 GSM"
   - BOM-1: 100 kg
   - BOM-2: 50 kg
   - BOM-3: 75 kg
2. Create a single PO with total 225 kg of "Fabric A - Black - 240 GSM"
3. Verify:
   - All 3 BOMs disappear from "Pending" tab
   - PO shows in "In Progress" tab
   - Database shows 3 PO items, each with different `bom_id`

### Test Scenario 2: Partial Fulfillment

1. Create 2 BOMs:
   - BOM-1: Fabric A (100 kg), Fabric B (50 kg)
   - BOM-2: Fabric A (80 kg), Zipper (100 pcs)
2. Create PO with only Fabric A (180 kg total)
3. Verify:
   - BOM-1 still in "Pending" (needs Fabric B)
   - BOM-2 still in "Pending" (needs Zipper)
   - Both BOMs show reduced remaining quantities for Fabric A

### Test Scenario 3: Multiple POs for Same BOMs

1. Create 2 BOMs, each requiring multiple items
2. Create PO-1 with some items from both BOMs
3. Create PO-2 with remaining items from both BOMs
4. Verify:
   - Both BOMs correctly track items from both POs
   - BOMs disappear from "Pending" when fully ordered
   - No duplicate counting of items

## Migration Instructions

### For Existing Data

If you have existing POs in the database:

1. Run the migration to add `bom_id` column
2. Existing PO items will have `bom_id = NULL`
3. These items won't be counted toward any BOM's fulfillment
4. Options:
   - **Option A**: Leave as-is (old POs won't affect new BOM tracking)
   - **Option B**: Update old PO items with `bom_id` from their parent PO:
     ```sql
     UPDATE purchase_order_items poi
     SET bom_id = po.bom_id
     FROM purchase_orders po
     WHERE poi.po_id = po.id
       AND poi.bom_id IS NULL
       AND po.bom_id IS NOT NULL;
     ```

### For New Installations

1. Run all migrations in order
2. The `bom_id` column will be present from the start
3. All POs will automatically track items by BOM

## Benefits

1. **Accurate Tracking**: Each item knows which BOM it fulfills
2. **Flexible POs**: A single PO can cover multiple BOMs
3. **Better Insights**: Can see exactly which items were ordered for which BOM
4. **Scalability**: Supports complex ordering scenarios
5. **Data Integrity**: Foreign key ensures `bom_id` references valid BOMs

## Technical Details

### Database Schema

```sql
CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  bom_id UUID REFERENCES bom_records(id), -- NEW COLUMN
  item_type VARCHAR(20) NOT NULL,
  item_id UUID,
  item_name VARCHAR(255) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  fabric_name TEXT,
  fabric_color TEXT,
  fabric_gsm TEXT,
  ...
);

CREATE INDEX idx_purchase_order_items_bom_id 
ON purchase_order_items(bom_id);
```

### Item Matching Logic

Items are matched using a unique key:

**For Fabrics**:
```typescript
const key = `fabric:${fabricName}:${fabricColor}:${fabricGsm}`;
// Example: "fabric:airtex 240 gsm:black:240"
```

**For Items**:
```typescript
const key = `item:${itemId}`; // If item_id exists
// OR
const key = `item:${itemName}`; // Fallback to name
```

This ensures items with the same attributes are counted together, regardless of which BOM they came from.

## Future Enhancements

1. **Partial Quantity Allocation**: Allow distributing one item's quantity across multiple BOMs
2. **BOM Prioritization**: Set priority for which BOM gets fulfilled first
3. **Auto-PO Generation**: Automatically create POs when BOMs have pending items
4. **Smart Bundling**: AI-suggested grouping of BOMs for optimal PO creation
5. **Historical Tracking**: View which POs fulfilled which BOMs over time

## Related Files

- `supabase/migrations/20250107000001_add_bom_id_to_purchase_order_items.sql`
- `src/components/purchase-orders/PurchaseOrderFormDialog.tsx`
- `src/components/purchase-orders/PurchaseOrderList.tsx`

## Support

For issues or questions:
1. Check the console logs for debugging info
2. Verify the migration ran successfully
3. Ensure `bom_id` is being saved when creating POs
4. Check the "BOM IDs found in PO items" log message

---

**Last Updated**: January 7, 2025
**Version**: 1.0
**Author**: AI Assistant

