# Multi-BOM PO Tracking - Implementation Summary

## 🎯 Objective

Ensure that when a Purchase Order (PO) is created with fabrics/items from multiple pending BOMs, **ALL** those BOMs are marked as having their PO created within that single PO.

## ✅ Changes Implemented

### 1. Database Migration

**File**: `supabase/migrations/20250107000001_add_bom_id_to_purchase_order_items.sql`

- ✅ Added `bom_id` column to `purchase_order_items` table
- ✅ Created index for performance: `idx_purchase_order_items_bom_id`
- ✅ Added `remarks` column for item notes
- ✅ Added foreign key constraint linking to `bom_records(id)`

### 2. Frontend Code Updates

#### A. PurchaseOrderFormDialog.tsx (Line 375)

**Before**:
```typescript
// bom_id: item.bom_id || null, // COMMENTED OUT
```

**After**:
```typescript
bom_id: item.bom_id || null, // Now storing BOM ID for each item
```

**Impact**: Each PO item now knows which BOM it came from.

#### B. PurchaseOrderList.tsx (Multiple updates)

**Lines 279-313**: Updated to fetch `bom_id` directly from items instead of mapping from POs
**Lines 408-421**: Enhanced comments explaining item-level tracking
**Lines 681-692**: Clarified how ordered quantities are calculated using item-level BOM IDs

**Impact**: System now correctly identifies which items belong to which BOM.

### 3. Documentation

Created comprehensive documentation:
- ✅ `MULTI_BOM_PO_TRACKING.md` - Full technical documentation
- ✅ `verify_multi_bom_tracking.sql` - SQL verification script
- ✅ `IMPLEMENTATION_SUMMARY.md` - This file

## 🔧 How to Deploy

### Step 1: Run Database Migration

```bash
# Connect to your Supabase project and run:
cd supabase/migrations
psql -h your-db-host -U your-user -d your-db -f 20250107000001_add_bom_id_to_purchase_order_items.sql
```

Or through Supabase Dashboard:
1. Go to SQL Editor
2. Copy contents of `supabase/migrations/20250107000001_add_bom_id_to_purchase_order_items.sql`
3. Paste and run

### Step 2: Deploy Frontend Code

```bash
# The code changes are already in your files:
# - src/components/purchase-orders/PurchaseOrderFormDialog.tsx
# - src/components/purchase-orders/PurchaseOrderList.tsx

# Just deploy/restart your application
npm run build
# Or however you deploy your app
```

### Step 3: Verify Installation

Run the verification script through Supabase SQL Editor:

```bash
# Copy contents of verify_multi_bom_tracking.sql and run in SQL Editor
```

Expected output:
- ✅ `bom_id` column exists in `purchase_order_items`
- ✅ Index `idx_purchase_order_items_bom_id` exists
- ✅ Foreign key constraint is in place

## 🧪 Testing the Fix

### Test Scenario 1: Single PO, Multiple BOMs

1. **Setup**:
   - Create BOM-1: Product A, Fabric "Airtex 240 GSM - Black - 240", Qty: 100 kg
   - Create BOM-2: Product B, Fabric "Airtex 240 GSM - Black - 240", Qty: 50 kg
   - Create BOM-3: Product C, Fabric "Airtex 240 GSM - Black - 240", Qty: 75 kg

2. **Action**:
   - Go to Purchase Orders → Pending tab
   - Should see all 3 BOMs listed
   - Click "Create PO"
   - Select a supplier
   - Verify all fabrics are listed (total 225 kg)
   - Save the PO

3. **Expected Result**:
   - ✅ PO is created successfully
   - ✅ All 3 BOMs disappear from "Pending" tab
   - ✅ PO appears in "In Progress" tab
   - ✅ In database, verify:
     ```sql
     SELECT poi.item_name, poi.quantity, poi.bom_id, br.bom_number
     FROM purchase_order_items poi
     JOIN bom_records br ON poi.bom_id = br.id
     WHERE poi.po_id = 'your-po-id'
     ORDER BY br.bom_number;
     ```
   - ✅ Should show 3 rows (or aggregated based on how items are combined)
   - ✅ Each row should have a different `bom_id`

### Test Scenario 2: Partial Fulfillment

1. **Setup**:
   - Create BOM-4: Fabric A (100 kg), Zipper (50 pcs), Button (100 pcs)
   - Create BOM-5: Fabric A (80 kg), Zipper (40 pcs), Label (200 pcs)

2. **Action**:
   - Create PO with only Fabric A (180 kg total)

3. **Expected Result**:
   - ✅ BOM-4 still appears in "Pending" (needs Zipper, Button)
   - ✅ BOM-5 still appears in "Pending" (needs Zipper, Label)
   - ✅ Both BOMs show reduced remaining quantity for Fabric A
   - ✅ Fabric A quantity = 0 for both BOMs (fully ordered)
   - ✅ Other items still show original quantities

### Test Scenario 3: Mixed BOMs

1. **Setup**:
   - Create BOM-6: Fabric X (100 kg), Item Y (50 pcs)
   - Create BOM-7: Fabric X (50 kg), Item Z (30 pcs)
   - Create BOM-8: Fabric W (80 kg), Item Y (40 pcs)

2. **Action**:
   - Create PO-1 with Fabric X (150 kg) from BOM-6 and BOM-7
   - Create PO-2 with Item Y (90 pcs) from BOM-6 and BOM-8

3. **Expected Result**:
   - ✅ After PO-1: BOM-6 pending (needs Item Y), BOM-7 pending (needs Item Z), BOM-8 pending (needs everything)
   - ✅ After PO-2: BOM-6 fully ordered (disappears), BOM-7 pending (needs Item Z), BOM-8 pending (needs Fabric W)
   - ✅ Each PO item correctly links to its source BOM

## 📊 Before vs After

### Before Fix

```
BOM-1 (Fabric A: 100kg) ─┐
BOM-2 (Fabric A: 50kg)  ├─→ Create PO (150kg Fabric A)
BOM-3 (Fabric A: 75kg)  ┘

Result in Database:
purchase_orders:
  id: po-001
  bom_id: BOM-1  ← Only first BOM linked

purchase_order_items:
  id: item-001
  po_id: po-001
  bom_id: NULL  ← No BOM tracking
  item: Fabric A
  qty: 150kg

Result in UI:
✅ BOM-1: Fully ordered (disappears from Pending)
❌ BOM-2: Still pending (fabric appears unordered)
❌ BOM-3: Still pending (fabric appears unordered)
```

### After Fix

```
BOM-1 (Fabric A: 100kg) ─┐
BOM-2 (Fabric A: 50kg)  ├─→ Create PO (150kg Fabric A)
BOM-3 (Fabric A: 75kg)  ┘

Result in Database:
purchase_orders:
  id: po-001
  bom_id: BOM-1  ← First BOM (legacy field)

purchase_order_items:
  id: item-001
  po_id: po-001
  bom_id: BOM-1  ← Item tracks its BOM
  item: Fabric A
  qty: 100kg
  
  id: item-002
  po_id: po-001
  bom_id: BOM-2  ← Item tracks its BOM
  item: Fabric A
  qty: 50kg
  
  id: item-003
  po_id: po-001
  bom_id: BOM-3  ← Item tracks its BOM
  item: Fabric A
  qty: 75kg  ← Fixed to 75kg (was 225kg in the example above)

Result in UI:
✅ BOM-1: Fully ordered (disappears from Pending)
✅ BOM-2: Fully ordered (disappears from Pending)
✅ BOM-3: Fully ordered (disappears from Pending)
```

## 🔍 Monitoring & Debugging

### Check BOM Status

```sql
-- See which BOMs are fulfilled by which POs
SELECT 
    br.bom_number,
    br.product_name,
    po.po_number,
    COUNT(poi.id) as items_in_po,
    SUM(poi.quantity) as total_quantity
FROM bom_records br
JOIN purchase_order_items poi ON br.id = poi.bom_id
JOIN purchase_orders po ON poi.po_id = po.id
GROUP BY br.id, br.bom_number, br.product_name, po.id, po.po_number
ORDER BY br.bom_number, po.po_number;
```

### Find Multi-BOM POs

```sql
-- Find POs that fulfill multiple BOMs
SELECT 
    po.po_number,
    COUNT(DISTINCT poi.bom_id) as num_boms,
    string_agg(DISTINCT br.bom_number, ', ') as bom_numbers
FROM purchase_orders po
JOIN purchase_order_items poi ON po.id = poi.po_id
JOIN bom_records br ON poi.bom_id = br.id
WHERE poi.bom_id IS NOT NULL
GROUP BY po.id, po.po_number
HAVING COUNT(DISTINCT poi.bom_id) > 1
ORDER BY num_boms DESC;
```

### Debug Pending BOMs

Open browser console and check logs when viewing "Pending" tab:
- 📊 "Total BOMs fetched"
- 📊 "BOM IDs found in PO items (item-level tracking)"
- 🔍 "Processing BOM: [bom_number]"
- ✅ "Added remaining item" or ⚠️ "Skipping item (fully ordered)"

## 🚨 Troubleshooting

### Issue: BOMs still showing as pending after creating PO

**Check**:
1. Verify migration ran:
   ```sql
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'purchase_order_items' AND column_name = 'bom_id';
   ```
2. Verify PO items have `bom_id`:
   ```sql
   SELECT * FROM purchase_order_items 
   WHERE po_id = 'your-po-id' AND bom_id IS NULL;
   ```
3. Check browser console for errors

**Fix**:
- If migration didn't run → Run migration manually
- If `bom_id` is NULL → Code not deployed → Deploy latest code
- If errors in console → Check error details and fix

### Issue: Some BOMs marked, others not

**Check**:
```sql
SELECT 
    poi.bom_id,
    br.bom_number,
    poi.item_name,
    poi.quantity
FROM purchase_order_items poi
LEFT JOIN bom_records br ON poi.bom_id = br.id
WHERE poi.po_id = 'your-po-id';
```

**Expected**: Each item should have a valid `bom_id` and `bom_number`
**If NULL**: Item wasn't linked to BOM when PO was created → Check PurchaseOrderFormDialog code

## 📝 Maintenance Notes

### For Existing Data

If you have existing POs created before this fix:
- Old PO items will have `bom_id = NULL`
- They won't be counted toward any BOM's fulfillment
- To update them (optional):
  ```sql
  UPDATE purchase_order_items poi
  SET bom_id = po.bom_id
  FROM purchase_orders po
  WHERE poi.po_id = po.id
    AND poi.bom_id IS NULL
    AND po.bom_id IS NOT NULL;
  ```

### Rollback (if needed)

To rollback the migration:
```sql
-- Remove index
DROP INDEX IF EXISTS idx_purchase_order_items_bom_id;

-- Remove column
ALTER TABLE purchase_order_items DROP COLUMN IF EXISTS bom_id;

-- Revert code changes (restore commented line in PurchaseOrderFormDialog.tsx)
```

## 📞 Support

- **Documentation**: See `MULTI_BOM_PO_TRACKING.md` for full technical details
- **Verification**: Run `verify_multi_bom_tracking.sql` to check status
- **Issues**: Check browser console and database logs

---

**Status**: ✅ **Ready for deployment**
**Date**: January 7, 2025
**Version**: 1.0

