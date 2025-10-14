# Duplicate Tables Cleanup Guide

**Generated:** October 8, 2025  
**Project:** Scissors V2 ERP System

---

## Overview

During the database schema analysis, we identified **4 pairs of duplicate tables** that were created in migrations but never actually made it into the database (based on types.ts). This document provides guidance on cleaning up these duplicates.

---

## Duplicate Tables Identified

### 1. Invoice Items Tables

**Current Status:**
- ✅ `invoice_items` - **EXISTS in database** (39 tables in types.ts)
- ❌ `invoices_items` - Created in migrations but NOT in actual database

**Recommendation:** **Keep `invoice_items`**

**Reason:** 
- Already in production database
- Follows singular naming convention (item, not items)
- Referenced in application code correctly

**Action:** Remove all references to `invoices_items` from migration files

---

### 2. Quotation Items Tables

**Current Status:**
- ✅ `quotation_items` - **EXISTS in database** (39 tables in types.ts)
- ❌ `quotations_items` - Created in migrations but NOT in actual database

**Recommendation:** **Keep `quotation_items`**

**Reason:**
- Already in production database
- Follows singular naming convention
- Referenced in application code correctly

**Action:** Remove all references to `quotations_items` from migration files

---

### 3. BOM Items Tables

**Current Status:**
- ✅ `bom_record_items` - **EXISTS in database** (39 tables in types.ts)
- ❌ `bom_items` - Created in migrations but NOT in actual database

**Recommendation:** **Keep `bom_record_items`**

**Reason:**
- Already in production database
- More descriptive name (clarifies it belongs to bom_records)
- Referenced in application code

**Action:** Remove all references to `bom_items` from migration files

---

### 4. Customer User Mapping Tables

**Current Status:**
- ✅ `customer_users` - **EXISTS in database** (39 tables in types.ts)
- ❌ `customer_user_mapping` - Created in migrations but NOT in actual database

**Recommendation:** **Keep `customer_users`**

**Reason:**
- Already in production database
- Simpler, cleaner naming
- Referenced in application code

**Action:** Remove all references to `customer_user_mapping` from migration files

---

## Migration Files Affected

The following migration files contain references to duplicate tables that should be cleaned up:

### Files to Review:

1. `supabase/migrations/20250101000017_missing_tables.sql`
   - Contains: `bom_items`, `quotations_items`, `invoices_items`, `customer_user_mapping`

2. `supabase/migrations/20250101000018_additional_missing_tables.sql`
   - May contain duplicate table references

### Note:
The new consolidated migration (`20251008000000_add_all_missing_tables.sql`) **does NOT** include these duplicate tables.

---

## Cleanup Strategy

### Option 1: Leave As-Is (Recommended)
**Why:** The duplicate table CREATE statements in old migrations are harmless because:
- They use `CREATE TABLE IF NOT EXISTS` 
- The actual tables don't exist in the database
- New consolidated migration doesn't include them
- Application code uses correct table names

**Action:** No immediate action required. Document for historical reference.

### Option 2: Clean Up Old Migrations
**Why:** For cleanliness and to prevent future confusion

**Steps:**
1. Create a new migration that explicitly documents the correct tables
2. Add comments to old migration files noting which tables were superseded
3. Do NOT delete old migration files (breaks migration history)

### Option 3: Archive Old Migrations (Advanced)
**Why:** Start fresh with clean migration history

**Steps:**
1. Export current database schema
2. Create new initial migration from current state
3. Archive old migrations in a separate folder
4. **⚠️ WARNING:** This breaks migration history and should only be done on development databases

---

## Recommended Action Plan

### Phase 1: Documentation ✅
- [x] Document all duplicate tables
- [x] Identify which tables to keep
- [x] Create this cleanup guide

### Phase 2: Prevention ✅
- [x] New consolidated migration uses correct table names only
- [x] All future migrations will use standard naming

### Phase 3: Optional Cleanup (As Needed)
- [ ] Add comments to old migration files
- [ ] Create database documentation with correct schema
- [ ] Update any outdated SQL scripts in project root

---

## Naming Convention Standards

To prevent future duplicates, follow these naming conventions:

### Tables
- Use **singular** for detail/item tables: `invoice_item` not `invoice_items`
- Use **plural** only for collection tables: `customers`, `orders`
- Use descriptive names: `bom_record_items` not just `bom_items`

### Junction Tables
- Format: `{table1}_{table2}` (e.g., `user_roles`)
- Alternative: `{table1}_{table2}_mapping` for clarity
- Choose one format and stick with it

### Current Schema Standard
Based on actual database (types.ts):
```
✅ invoice_items (singular item)
✅ quotation_items (singular item)
✅ order_items (singular item)
✅ bom_record_items (descriptive)
✅ customer_users (junction table)
```

---

## Impact Assessment

### Low Risk - No Code Changes Needed
The duplicate tables were never created in the actual database, so:
- ✅ No data migration required
- ✅ No application code changes needed
- ✅ No RLS policy conflicts
- ✅ No foreign key constraint issues

### Zero Downtime
- ✅ Cleanup can be done without affecting production
- ✅ No breaking changes to existing functionality

---

## Verification Checklist

After running new migrations:

- [ ] Verify types.ts generated correctly (should show ~74 tables)
- [ ] Check that duplicate tables are NOT in types.ts
- [ ] Verify application compiles without TypeScript errors
- [ ] Test key features:
  - [ ] Invoice creation
  - [ ] Quotation creation
  - [ ] BOM creation
  - [ ] Customer portal access
- [ ] Check RLS policies are working
- [ ] Verify foreign key relationships

---

## Summary

| Table Type | Keep | Remove | Status |
|------------|------|--------|--------|
| Invoice Items | `invoice_items` | `invoices_items` | ✅ Documented |
| Quotation Items | `quotation_items` | `quotations_items` | ✅ Documented |
| BOM Items | `bom_record_items` | `bom_items` | ✅ Documented |
| Customer Mapping | `customer_users` | `customer_user_mapping` | ✅ Documented |

**Total Duplicates:** 4 pairs  
**Risk Level:** Low  
**Action Required:** Optional (for cleanliness)  
**Breaking Changes:** None

---

## Next Steps

1. ✅ Review this document
2. ⏳ Run new consolidated migration (`20251008000000_add_all_missing_tables.sql`)
3. ⏳ Run views migration (`20251008000001_create_views.sql`)
4. ⏳ Generate new types.ts
5. ⏳ Verify application functionality
6. ⏳ Optional: Add comments to old migrations

---

**Note:** This cleanup guide can be kept as reference documentation. The duplicate table references in old migrations can remain as-is since they don't cause any issues.

