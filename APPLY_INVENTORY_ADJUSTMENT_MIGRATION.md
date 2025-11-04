# Apply Inventory Adjustment Migration

## Quick Instructions

The inventory adjustment tables need to be created in your database. Follow these steps:

### Step 1: Open Supabase Dashboard

1. Go to: https://supabase.com/dashboard
2. Select your project
3. Navigate to **SQL Editor**

### Step 2: Apply the Migration

1. Open the file: `supabase/migrations/20250201000000_create_inventory_adjustment_system.sql`
2. Copy the **entire contents** of the file
3. Paste into the SQL Editor
4. Click **Run** or press `Ctrl+Enter` (Windows) / `Cmd+Enter` (Mac)
5. Wait for the success message

### Step 3: Verify Tables Created

Run this query in SQL Editor to verify:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'inventory_adjustment%'
ORDER BY table_name;
```

You should see:
- `inventory_adjustment_reasons`
- `inventory_adjustments`
- `inventory_adjustment_items`
- `inventory_adjustment_logs`

### Step 4: Verify Default Reasons

Run this query to check default reasons were created:

```sql
SELECT reason_name, description, is_active 
FROM inventory_adjustment_reasons 
ORDER BY reason_name;
```

You should see 8 default reasons including:
- Sold on Amazon
- Internally Used
- Rejected
- Damaged
- Returned
- Stock Count Correction
- Theft/Loss
- Expired

### Step 5: Regenerate TypeScript Types (Optional but Recommended)

```bash
supabase gen types typescript --project-id YOUR_PROJECT_ID > src/integrations/supabase/types.ts
```

Or if you're using local Supabase:
```bash
supabase gen types typescript --local > src/integrations/supabase/types.ts
```

## What This Migration Creates

1. **inventory_adjustment_reasons** - Store predefined and custom reasons for adjustments
2. **inventory_adjustments** - Main adjustment records
3. **inventory_adjustment_items** - Individual products in each adjustment
4. **inventory_adjustment_logs** - Complete audit trail
5. **execute_inventory_adjustment()** - Function to atomically update inventory and create logs

## Troubleshooting

If you get an error about "employees" table not existing:
- Make sure all previous migrations have been applied
- The migration references `employees(id)` for user tracking

If you get permission errors:
- Check that your database user has CREATE TABLE permissions
- The migration includes RLS policies for authenticated users

## After Migration

Once the migration is applied:
1. Refresh your browser
2. Navigate to Product Master → Inventory Adjustment tab
3. The error should be resolved and the page should load correctly

