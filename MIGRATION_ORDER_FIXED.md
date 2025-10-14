# FIXED Migration Order - Run These in Supabase Dashboard

## ❌ Problem
Migration 2 failed because `employees` table doesn't exist yet, but `warehouse_master` references it.

## ✅ Solution
Run migrations in this **correct order**:

---

## Step 1: Core Tables First (NEW!)
**File:** `supabase/migrations/20251007235958_add_core_tables_first.sql`

This creates the foundational tables that other tables depend on:
- `employees` (referenced by many tables)
- `departments` (referenced by employees)
- `item_master` (referenced by warehouse_inventory)

### Copy and Run:
```bash
cat supabase/migrations/20251007235958_add_core_tables_first.sql
```

**Expected Result:** "Core tables created successfully!"

---

## Step 2: Fabrics Tables
**File:** `supabase/migrations/20251007235959_ensure_fabrics_table.sql`

Creates:
- `fabrics`
- `fabric_variants`
- `product_categories`

### Copy and Run:
```bash
cat supabase/migrations/20251007235959_ensure_fabrics_table.sql
```

**Expected Result:** "Fabrics tables ensured!"

---

## Step 3: All Remaining Tables
**File:** `supabase/migrations/20251008000000_add_all_missing_tables.sql`

Now this will work because all dependencies exist!

### Copy and Run:
```bash
cat supabase/migrations/20251008000000_add_all_missing_tables.sql
```

**Expected Result:** "Successfully added all 35 missing tables to complete the database schema!"

---

## Step 4: Create Views
**File:** `supabase/migrations/20251008000001_create_views.sql`

### Copy and Run:
```bash
cat supabase/migrations/20251008000001_create_views.sql
```

**Expected Result:** "Successfully created all views!"

---

## OR: Use Combined File (All at Once)

I've created a new combined file with correct order:

```bash
cat combined_migration_fixed.sql
```

Copy entire contents → Paste in Supabase Dashboard → Run

This runs all 4 migrations in the correct order automatically!

---

## After Running All Migrations:

### Generate Types:
```bash
supabase gen types typescript --project-id tqqhqxfvxgrxxqtcjacl > src/integrations/supabase/types.ts
```

### Verify Success:
```sql
-- Run in Dashboard SQL Editor:
SELECT count(*) as tables FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- Should return ~74

SELECT count(*) as views FROM information_schema.views 
WHERE table_schema = 'public';
-- Should return 9
```

---

## Migration Order Summary:
1. ✅ **Core tables** (employees, departments, item_master)
2. ✅ **Fabrics** (fabrics, fabric_variants, product_categories)  
3. ✅ **All remaining** (35 tables including warehouse, GRN, tailors, etc.)
4. ✅ **Views** (9 views for complex queries)

**Total Time:** ~2-3 minutes

---

## Quick Copy Commands:

```bash
# Migration 1 - Core Tables
cat supabase/migrations/20251007235958_add_core_tables_first.sql

# Migration 2 - Fabrics
cat supabase/migrations/20251007235959_ensure_fabrics_table.sql

# Migration 3 - All Remaining
cat supabase/migrations/20251008000000_add_all_missing_tables.sql

# Migration 4 - Views
cat supabase/migrations/20251008000001_create_views.sql
```

OR

```bash
# All Combined (Recommended!)
cat combined_migration_fixed.sql
```

---

**Dashboard URL:** https://supabase.com/dashboard/project/tqqhqxfvxgrxxqtcjacl/sql/new

Ready to try again! 🚀

