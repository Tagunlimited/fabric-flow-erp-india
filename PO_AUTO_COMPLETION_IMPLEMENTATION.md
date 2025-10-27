# PO Auto-Completion Implementation Guide

## Overview
This implementation automatically marks Purchase Orders as 'completed' when all items have been received and approved via GRNs.

## Files Created/Modified

### 1. Migration File
**File**: `supabase/migrations/20250108000005_auto_complete_po_on_grn_approval.sql`

This migration contains:
- `check_and_update_po_completion(p_po_id UUID)` function
- Updated `trg_grn_approved_insert_inventory()` trigger function
- Proper error handling and logging

### 2. Test File
**File**: `test_po_completion.sql`

Contains SQL queries to verify the implementation.

## How It Works

### 1. GRN Approval Process
When a GRN status changes to 'approved' or 'partially_approved':

1. **Warehouse Inventory Insert** (existing behavior)
   - Approved items are inserted into `warehouse_inventory`
   - Items are placed in the default receiving bin

2. **PO Completion Check** (new behavior)
   - System gets the PO ID from the GRN
   - Calls `check_and_update_po_completion(po_id)`
   - If all PO items are fully received, marks PO as 'completed'

### 2. Completion Logic
The `check_and_update_po_completion()` function:

1. **Validates PO exists** and is not already completed/cancelled
2. **Compares quantities**:
   - Sums all `approved_quantity` from `grn_items` where `quality_status = 'approved'`
   - Compares with `purchase_order_items.quantity` for each item
3. **Updates PO status** to 'completed' if all items are fully received
4. **Logs the completion** for audit purposes

## Testing Instructions

### 1. Apply the Migration
```bash
# In Supabase Dashboard > SQL Editor, run:
# Copy and paste the contents of supabase/migrations/20250108000005_auto_complete_po_on_grn_approval.sql
```

### 2. Verify Functions Exist
```sql
-- Check if the completion function exists
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_name = 'check_and_update_po_completion';

-- Check if the trigger function was updated
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_name = 'trg_grn_approved_insert_inventory';
```

### 3. Test with Sample Data

#### Create Test PO
```sql
-- Insert a test purchase order
INSERT INTO purchase_orders (po_number, supplier_id, status, total_amount)
VALUES ('TEST/PO/001', (SELECT id FROM supplier_master LIMIT 1), 'in_progress', 1000);

-- Insert PO items
INSERT INTO purchase_order_items (po_id, item_name, quantity, unit_price, total_price, item_type)
VALUES 
  ((SELECT id FROM purchase_orders WHERE po_number = 'TEST/PO/001'), 'Test Item 1', 10, 50, 500, 'item'),
  ((SELECT id FROM purchase_orders WHERE po_number = 'TEST/PO/001'), 'Test Item 2', 5, 100, 500, 'item');
```

#### Create Test GRN
```sql
-- Insert a test GRN
INSERT INTO grn_master (grn_number, po_id, supplier_id, status)
VALUES ('TEST/GRN/001', 
        (SELECT id FROM purchase_orders WHERE po_number = 'TEST/PO/001'),
        (SELECT supplier_id FROM purchase_orders WHERE po_number = 'TEST/PO/001'),
        'draft');

-- Insert GRN items (initially not approved)
INSERT INTO grn_items (grn_id, po_item_id, item_name, quantity, approved_quantity, quality_status, item_type)
VALUES 
  ((SELECT id FROM grn_master WHERE grn_number = 'TEST/GRN/001'),
   (SELECT id FROM purchase_order_items WHERE item_name = 'Test Item 1'),
   'Test Item 1', 10, 0, 'pending', 'item'),
  ((SELECT id FROM grn_master WHERE grn_number = 'TEST/GRN/001'),
   (SELECT id FROM purchase_order_items WHERE item_name = 'Test Item 2'),
   'Test Item 2', 5, 0, 'pending', 'item');
```

#### Test Partial Approval
```sql
-- Update GRN items to approved (partial)
UPDATE grn_items 
SET approved_quantity = 5, quality_status = 'approved'
WHERE item_name = 'Test Item 1';

-- Update GRN status to partially approved
UPDATE grn_master 
SET status = 'partially_approved'
WHERE grn_number = 'TEST/GRN/001';

-- Check PO status (should still be 'in_progress')
SELECT po_number, status FROM purchase_orders WHERE po_number = 'TEST/PO/001';
```

#### Test Full Approval
```sql
-- Update remaining GRN items to approved
UPDATE grn_items 
SET approved_quantity = 5, quality_status = 'approved'
WHERE item_name = 'Test Item 2';

-- Update GRN status to approved
UPDATE grn_master 
SET status = 'approved'
WHERE grn_number = 'TEST/GRN/001';

-- Check PO status (should now be 'completed')
SELECT po_number, status FROM purchase_orders WHERE po_number = 'TEST/PO/001';
```

## Expected Behavior

### Scenario 1: Partial GRN Approval
- GRN status: 'partially_approved'
- Some items approved, some pending
- **Result**: PO status remains 'in_progress'

### Scenario 2: Full GRN Approval
- GRN status: 'approved'
- All PO items fully received and approved
- **Result**: PO status changes to 'completed'

### Scenario 3: Multiple GRNs
- Multiple GRNs for same PO
- Quantities accumulate across GRNs
- **Result**: PO completes when total approved quantities >= ordered quantities

### Scenario 4: Over-receiving
- Approved quantity > ordered quantity
- **Result**: PO still marks as completed (over-receiving is acceptable)

## Edge Cases Handled

1. **PO doesn't exist**: Function returns FALSE safely
2. **PO already completed**: No status change
3. **PO cancelled**: No status change
4. **No approved items**: PO remains incomplete
5. **Concurrent approvals**: Database transactions ensure consistency
6. **Multiple GRNs**: Quantities are properly aggregated

## Monitoring and Debugging

### Check Function Logs
```sql
-- View recent PO completions
SELECT 
  po.po_number,
  po.status,
  po.updated_at,
  gm.grn_number,
  gm.status as grn_status
FROM purchase_orders po
LEFT JOIN grn_master gm ON gm.po_id = po.id
WHERE po.status = 'completed'
ORDER BY po.updated_at DESC;
```

### Check Warehouse Inventory
```sql
-- Verify inventory was created
SELECT 
  wi.item_name,
  wi.quantity,
  wi.status,
  gm.grn_number
FROM warehouse_inventory wi
JOIN grn_master gm ON gm.id = wi.grn_id
WHERE gm.grn_number = 'TEST/GRN/001';
```

## Rollback Instructions

If you need to rollback this functionality:

```sql
-- Drop the trigger
DROP TRIGGER IF EXISTS trg_after_grn_status_on_grn_master ON grn_master;

-- Drop the functions
DROP FUNCTION IF EXISTS check_and_update_po_completion(UUID);
DROP FUNCTION IF EXISTS trg_grn_approved_insert_inventory();

-- Restore original trigger function (if needed)
-- You would need to restore the original version from backup
```

## Success Criteria

✅ **Function Created**: `check_and_update_po_completion()` exists  
✅ **Trigger Updated**: `trg_grn_approved_insert_inventory()` includes PO completion check  
✅ **Migration Applied**: No SQL errors when running the migration  
✅ **Test Passes**: PO status changes to 'completed' when all items approved  
✅ **Edge Cases**: Handles partial approvals, multiple GRNs, and error conditions  

## Next Steps

1. Apply the migration in Supabase Dashboard
2. Test with sample data as outlined above
3. Monitor PO completion in production
4. Verify warehouse inventory is created correctly
5. Check that existing GRN approval workflow still works
