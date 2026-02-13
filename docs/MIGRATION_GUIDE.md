# Database Migration Guide

**Generated:** October 8, 2025  
**Project:** Scissors V2 ERP System

---

## Overview

This guide walks you through migrating your Scissors V2 database from **39 tables** to the complete **~74 table schema** with all missing tables, views, and functions.

---

## Current State

- **Existing Tables:** 39 (verified via types.ts)
- **Missing Tables:** 35
- **Missing Views:** 9
- **Expected Final Count:** ~74-77 tables + 9 views

---

## Migration Files

### 1. Main Migration File
**File:** `supabase/migrations/20251008000000_add_all_missing_tables.sql`

**Contents:**
- 35 new tables across 8 categories
- All necessary indexes
- RLS policies
- Triggers and functions
- ~1500 lines of SQL

**Tables Added:**
- Warehouse Management (7 tables)
- GRN System (6 tables)
- Tailor Management (5 tables)
- Order Batch Management (2 tables)
- Dispatch Details (1 table)
- Fabric Tracking (5 tables)
- Organization (2 tables)
- Additional (7 tables)

### 2. Views Migration
**File:** `supabase/migrations/20251008000001_create_views.sql`

**Contents:**
- 9 essential views for complex queries
- ~400 lines of SQL

**Views Created:**
- `order_lifecycle_view`
- `order_batch_assignments_with_details`
- `tailor_management_view`
- `qc_reviews`
- `goods_receipt_notes`
- `warehouse_inventory_summary`
- `fabric_stock_summary`
- `order_cutting_assignments`
- `dispatch_summary`

---

## Pre-Migration Checklist

### 1. Backup Your Database
```bash
# If using Supabase Cloud
# Go to Database → Backups → Create backup

# If using local Supabase
supabase db dump > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Review Current State
```bash
# Check current migration status
supabase migration list

# Check database connection
supabase db ping
```

### 3. Verify Types
```bash
# Check current types
cat src/integrations/supabase/types.ts | grep "Tables: {" -A 50
```

---

## Migration Steps

### Step 1: Apply Main Migration

#### Option A: Using Supabase CLI (Recommended)
```bash
# Navigate to project root
cd "/Users/mukeshayudh/Documents/V2/Scissors V2"

# Link to your project (if not already linked)
supabase link --project-ref your-project-ref

# Apply migration
supabase db push

# Or apply specific migration
supabase migration up --db-url "your-database-url"
```

#### Option B: Using Supabase Dashboard
1. Go to **SQL Editor** in Supabase Dashboard
2. Open `supabase/migrations/20251008000000_add_all_missing_tables.sql`
3. Copy entire contents
4. Paste into SQL Editor
5. Click **Run**
6. Wait for "Successfully added all 35 missing tables" message

#### Option C: Using psql
```bash
psql "your-database-connection-string" -f supabase/migrations/20251008000000_add_all_missing_tables.sql
```

### Step 2: Apply Views Migration

#### Using Supabase CLI
```bash
# If previous migration was successful
supabase db push
```

#### Using Supabase Dashboard
1. Go to **SQL Editor**
2. Open `supabase/migrations/20251008000001_create_views.sql`
3. Copy and paste
4. Click **Run**
5. Wait for "Successfully created all views!" message

### Step 3: Generate Updated Types

```bash
# Generate new types.ts
supabase gen types typescript --local > src/integrations/supabase/types.ts

# Or for production
supabase gen types typescript --project-id your-project-id > src/integrations/supabase/types.ts
```

### Step 4: Verify Migration

```bash
# Check table count
psql "your-db-url" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';"

# Should return approximately 74 tables

# Check view count
psql "your-db-url" -c "SELECT count(*) FROM information_schema.views WHERE table_schema = 'public';"

# Should return 9 views
```

---

## Post-Migration Verification

### 1. Database Verification

Run these queries in SQL Editor:

```sql
-- Check all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Check all views exist
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Verify critical tables
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouses') as warehouses_exists,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'grn_master') as grn_exists,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'batches') as batches_exists,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tailors') as tailors_exists,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'order_batch_assignments') as oba_exists;

-- Check RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
```

### 2. Application Verification

```bash
# Compile TypeScript
npm run build

# Should compile without errors

# Start dev server
npm run dev

# Test key features in browser
```

### 3. Feature Testing Checklist

Test these features in your application:

#### Warehouse Management
- [ ] Can view warehouses list
- [ ] Can create new warehouse
- [ ] Can view warehouse hierarchy (floors, racks, bins)
- [ ] Can add inventory to bins

#### GRN (Goods Receipt)
- [ ] Can create GRN from PO
- [ ] Can add items to GRN
- [ ] Can perform quality inspection
- [ ] GRN number auto-generates

#### Tailor Management
- [ ] Can view batches list
- [ ] Can create tailor profile
- [ ] Can assign tailor to batch
- [ ] Batch capacity updates automatically

#### Order Batch Management
- [ ] Can assign order to batch
- [ ] Can distribute sizes
- [ ] Can view batch assignments
- [ ] Can track batch progress

#### Dispatch
- [ ] Can create dispatch order
- [ ] Can add dispatch items with sizes
- [ ] Can view dispatch summary

---

## Rollback Plan

If something goes wrong, you can rollback:

### Option 1: Restore from Backup
```bash
# Restore from your backup
psql "your-db-url" < backup_20251008_123456.sql
```

### Option 2: Drop New Tables (Use with Caution!)
```sql
-- This will drop all tables added by the migration
-- ⚠️ ONLY USE IN DEVELOPMENT ENVIRONMENTS

DROP TABLE IF EXISTS 
    warehouses, floors, racks, bins, warehouse_inventory, warehouse_master, inventory_movements,
    grn_master, grn_items, grn_items_fabric_details, grn_quality_inspections, grn_discrepancies, grn_attachments,
    batches, tailors, tailor_assignments, tailor_skills, tailor_attendance,
    order_batch_assignments, order_batch_size_distributions, dispatch_order_items,
    fabric_master, fabric_inventory, fabric_storage_zones, fabric_picking_records, fabric_usage_records,
    designations, designation_departments, customer_types, company_assets,
    item_images, order_images, order_activities, receipts_items, purchase_order_fabric_details
CASCADE;

DROP VIEW IF EXISTS
    order_lifecycle_view, order_batch_assignments_with_details, tailor_management_view,
    qc_reviews, goods_receipt_notes, warehouse_inventory_summary, fabric_stock_summary,
    order_cutting_assignments, dispatch_summary
CASCADE;
```

---

## Common Issues and Solutions

### Issue 1: "relation already exists"
**Solution:** Table already created. Safe to ignore or use `IF NOT EXISTS` (already in migration).

### Issue 2: "column already exists"
**Solution:** Column already added. Migration uses `ADD COLUMN IF NOT EXISTS`.

### Issue 3: Foreign key constraint fails
**Solution:** Ensure referenced table exists first. Check migration order.

### Issue 4: RLS policy already exists
**Solution:** Migration drops existing policies before creating new ones.

### Issue 5: Types.ts shows old schema
**Solution:**
```bash
# Regenerate types
supabase gen types typescript --project-id your-project-id > src/integrations/supabase/types.ts
```

---

## Performance Optimization

After migration, run these for better performance:

```sql
-- Analyze tables for query planner
ANALYZE;

-- Vacuum to reclaim storage
VACUUM;

-- Reindex if needed
REINDEX DATABASE postgres;
```

---

## Monitoring

### Check Migration Status

```sql
-- View migration history
SELECT * FROM supabase_migrations.schema_migrations 
ORDER BY version DESC 
LIMIT 10;
```

### Check Table Sizes

```sql
-- See largest tables
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;
```

---

## Next Steps After Migration

1. **Update Documentation**
   - Update API documentation
   - Update database schema diagrams
   - Update ERD (Entity Relationship Diagram)

2. **Team Training**
   - Brief team on new tables
   - Update internal wiki
   - Create data entry guides

3. **Data Population**
   - Import warehouse data
   - Set up initial batches
   - Add tailor profiles

4. **Testing**
   - Run integration tests
   - Test all CRUD operations
   - Verify RLS policies work correctly

---

## Support

If you encounter issues:

1. Check migration logs
2. Review error messages carefully
3. Consult Supabase documentation
4. Check this guide's troubleshooting section
5. Review the Database Analysis Report

---

## Summary

**Migration Complexity:** Medium  
**Estimated Time:** 10-15 minutes  
**Downtime Required:** None (if done correctly)  
**Reversible:** Yes (via backup restore)  
**Risk Level:** Low (uses IF NOT EXISTS, doesn't modify existing tables)

**Final Database Count:**
- Tables: ~74
- Views: ~9
- Functions: ~15
- Total Objects: ~98

This brings your database to the expected **77 tables** (including views counted as tables).

---

**Last Updated:** October 8, 2025  
**Version:** 1.0  
**Author:** Database Migration Tool

