# Inventory Adjustment Database Schema Fix

## Problem
The `inventory_adjustment_logs` table is missing the `adjusted_by_user_id` column, causing the `execute_inventory_adjustment` RPC function to fail when inserting log entries.

## Quick Fix Instructions

### Option 1: Run Complete Fix (Recommended)
Run the file `apply_inventory_adjustment_fix.sql` in your Supabase SQL Editor. This file includes:
- Schema fixes for both tables
- Updated RPC function
- Verification queries

### Option 2: Step-by-Step Fix
1. Run `fix_inventory_adjustment_foreign_key.sql` to fix table schemas
2. Run the function definition from `supabase/migrations/20250203000000_setup_inventory_adjustment_complete.sql` (lines 200-524)

## What Gets Fixed

1. **inventory_adjustments table:**
   - Makes `adjusted_by` nullable (removes NOT NULL constraint)
   - Adds `adjusted_by_user_id` column to store auth user ID

2. **inventory_adjustment_logs table:**
   - Makes `adjusted_by` nullable (removes NOT NULL constraint)
   - Adds `adjusted_by_user_id` column to store auth user ID

3. **execute_inventory_adjustment function:**
   - Updated to use `v_adjustment.adjusted_by` (nullable employee ID)
   - Updated to use `v_adjustment.adjusted_by_user_id` (auth user ID)
   - Improved user name resolution (employees → profiles → auth.users)

## After Running the Fix

1. Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)
2. Test creating an inventory adjustment
3. Verify no console errors appear
4. Check that adjustments save successfully

## Files

- `apply_inventory_adjustment_fix.sql` - Complete fix (recommended)
- `fix_inventory_adjustment_foreign_key.sql` - Quick schema fix only
- `supabase/migrations/20250203000000_setup_inventory_adjustment_complete.sql` - Full migration

