# Order Creation Fabric ID Foreign Key Fix

## Issue
Order creation was failing with foreign key constraint violation:
```
insert or update on table "order_items" violates foreign key constraint "order_items_fabric_id_fkey"
Key is not present in table "fabrics"
```

## Root Cause
- **OrderForm** loads fabrics from `fabric_master` table
- **order_items** table has `fabric_id UUID REFERENCES public.fabrics(id)` constraint
- Fabric IDs from `fabric_master` don't exist in `fabrics` table
- When inserting order items, the foreign key constraint fails

## Solution Implemented

### 1. Database Migration - `fix_order_items_fabric_id_nullable.sql`
Changed the foreign key constraint to reference the correct table:
- **Dropped** existing foreign key constraint to `fabrics` table
- **Added** new foreign key constraint to `fabric_master` table
- Made `fabric_id` nullable (allows NULL values)
- Now `fabric_id` properly references `fabric_master(id)` which is the table actually being used

### 2. Code Fix - `src/components/orders/OrderForm.tsx`
Simplified fabric_id handling:
- Removed validation check (no longer needed)
- `fabric_id` is now saved directly from `product.fabric_id`
- Fabric information is properly stored and linked

**Location**: Line 1026

## How to Apply

### Step 1: Run SQL Migration
1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `fix_order_items_fabric_id_nullable.sql`
3. Execute the script

### Step 2: Verify Fix
1. Try creating an order with a fabric
2. Order should create successfully
3. `fabric_id` will be saved correctly, referencing `fabric_master` table
4. All fabric details are properly stored

## Impact

✅ **Fabric IDs are now saved** correctly in order_items
✅ **Foreign key constraint** now references the correct table (`fabric_master`)
✅ **Data integrity maintained** - proper relationships between tables
✅ **Backward compatible** - existing orders continue to work

## Notes

- `fabric_id` now references `fabric_master` table (not `fabrics`)
- Fabric information is stored in:
  - `fabric_id` column (references fabric_master.id)
  - `color` column (fabric color)
  - `gsm` column (fabric GSM)
- NULL values are allowed for `fabric_id` (for items without fabric)

## Files Modified

1. `src/components/orders/OrderForm.tsx` - Simplified fabric_id handling
2. `fix_order_items_fabric_id_nullable.sql` - Database migration to fix foreign key constraint
