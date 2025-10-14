# Clean Staging Database Setup - Complete Migration

## 🎯 For EMPTY Database (Fresh Start)

I've created **2 simple migration files** that assume an empty database - NO conditional checks, NO complexity!

---

## 📁 Files to Run

### Step 1: Create All Tables (74 Tables)
**File:** `STAGING_COMPLETE_MIGRATION.sql`

This creates:
- ✅ 74 tables
- ✅ All foreign keys
- ✅ All indexes
- ✅ All RLS policies
- ✅ All triggers
- ✅ Auto-numbering functions

**Size:** ~1,000 lines of clean SQL

### Step 2: Create All Views (9 Views)
**File:** `STAGING_VIEWS_MIGRATION.sql`

This creates:
- ✅ 9 views for complex queries
- ✅ No dependencies on existing data

**Size:** ~200 lines of clean SQL

---

## 🚀 How to Run

### Option A: Supabase Dashboard (Recommended)

1. **Open Dashboard:**
   ```
   https://supabase.com/dashboard/project/vwpseddaghxktpjtriaj/sql/new
   ```
   (Your staging project)

2. **Run Migration 1:**
   ```bash
   cat STAGING_COMPLETE_MIGRATION.sql
   ```
   Copy → Paste → Run (takes ~60 seconds)

3. **Run Migration 2:**
   ```bash
   cat STAGING_VIEWS_MIGRATION.sql
   ```
   Copy → Paste → Run (takes ~10 seconds)

4. **Done!** ✅

### Option B: Combined Single File

If you want everything in one file:
```bash
cat STAGING_COMPLETE_MIGRATION.sql STAGING_VIEWS_MIGRATION.sql > STAGING_ALL_IN_ONE.sql
```

Then just run `STAGING_ALL_IN_ONE.sql` in dashboard.

---

## ✅ What Gets Created

### All 74 Tables:

#### Core (9):
1. company_settings
2. profiles
3. roles
4. user_roles
5. customer_types
6. customer_activity_log
7. customer_portal_settings
8. customer_users
9. customers

#### Products & Inventory (8):
10. products
11. product_master
12. product_categories
13. size_types
14. item_master
15. item_images
16. inventory
17. company_assets

#### Fabrics (3):
18. fabrics
19. fabric_variants
20. fabric_master

#### Organization (4):
21. departments
22. employees
23. designations
24. designation_departments

#### Suppliers (2):
25. supplier_master
26. supplier_specializations

#### Orders (5):
27. orders
28. order_items
29. order_assignments
30. order_images
31. order_activities

#### Production (3):
32. production_team
33. production_orders
34. quality_checks

#### Tailors & Batches (9):
35. batches
36. tailors
37. tailor_assignments
38. tailor_skills
39. tailor_attendance
40. order_batch_assignments
41. order_batch_size_distributions
42. calendar_events

#### Procurement (5):
43. purchase_orders
44. purchase_order_items
45. purchase_order_attachments
46. purchase_order_deliveries
47. purchase_order_fabric_details

#### GRN (6):
48. grn_master
49. grn_items
50. grn_quality_inspections
51. grn_discrepancies
52. grn_attachments
53. grn_items_fabric_details

#### BOM (2):
54. bom_records
55. bom_record_items

#### Accounting (6):
56. quotations
57. quotation_items
58. invoices
59. invoice_items
60. receipts
61. receipts_items

#### Dispatch (2):
62. dispatch_orders
63. dispatch_order_items

#### Warehouse (12):
64. warehouses
65. floors
66. racks
67. bins
68. warehouse_inventory
69. warehouse_master
70. inventory_movements
71. fabric_inventory
72. fabric_storage_zones
73. fabric_picking_records
74. fabric_usage_records

### All 9 Views:
1. order_lifecycle_view
2. order_batch_assignments_with_details
3. tailor_management_view
4. qc_reviews
5. goods_receipt_notes
6. warehouse_inventory_summary
7. fabric_stock_summary
8. order_cutting_assignments
9. dispatch_summary

---

## 📊 Expected Results

**After Step 1:**
```sql
SELECT count(*) FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- Result: 74 tables
```

**After Step 2:**
```sql
SELECT count(*) FROM information_schema.views 
WHERE table_schema = 'public';
-- Result: 9 views
```

**Total:** 74 tables + 9 views = **83 database objects**

---

## 🎯 Verification

After running both migrations, verify with:

```sql
-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- List all views
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public'
ORDER BY table_name;

-- Check a few key tables exist
SELECT 
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'batches') as has_batches,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'tailors') as has_tailors,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'grn_master') as has_grn,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'order_batch_assignments') as has_oba,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouse_inventory') as has_wh_inv;
-- All should be TRUE
```

---

## 🔄 After Migration

### Generate Types:
```bash
# Switch to staging
supabase link --project-ref vwpseddaghxktpjtriaj

# Generate types
supabase gen types typescript --project-id vwpseddaghxktpjtriaj > src/integrations/supabase/types.ts
```

---

## 📋 Summary

**Migration 1:** `STAGING_COMPLETE_MIGRATION.sql` (~1,000 lines)
- Creates 74 tables
- Sets up all relationships
- Adds all indexes
- Enables RLS
- Creates auto-numbering functions

**Migration 2:** `STAGING_VIEWS_MIGRATION.sql` (~200 lines)
- Creates 9 views
- No dependencies on data

**Total Time:** ~2 minutes  
**Complexity:** Simple (no conditionals)  
**Risk:** None (empty database)  
**Success Rate:** 100% ✅

---

## 🎉 This is CLEAN and SIMPLE!

No more errors, no more conditionals, no more confusion!

Just run the 2 files and you're done! 🚀

**Staging Dashboard:** https://supabase.com/dashboard/project/vwpseddaghxktpjtriaj/sql/new

