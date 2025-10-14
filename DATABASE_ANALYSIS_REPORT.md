# Complete Database Analysis Report

**Generated:** October 8, 2025  
**Project:** Scissors V2 ERP System

---

## Executive Summary

- **Current Database Tables:** 39
- **Expected Tables (from SQL files):** 68+ unique tables
- **Missing Tables:** 29-35 tables
- **Duplicate Tables:** 4 pairs
- **Total Tables Needed:** ~73-77 (after cleanup)

---

## Current Database Status (39 Tables in types.ts)

### ✅ Tables Currently in Database

1. `profiles` - User profiles
2. `customers` - Customer master
3. `customer_users` - Customer-user linking
4. `customer_activity_log` - Customer activity tracking
5. `customer_portal_settings` - Portal permissions
6. `company_settings` - Company configuration
7. `products` - Product catalog
8. `product_categories` - Product categorization
9. `product_master` - Product master data
10. `item_master` - Item catalog
11. `inventory` - Inventory management
12. `size_types` - Size master
13. `fabrics` - Fabric master (new structure)
14. `fabric_variants` - Fabric color/GSM variants
15. `orders` - Order headers
16. `order_items` - Order line items
17. `order_assignments` - Order assignments (cutting/pattern)
18. `production_orders` - Production tracking
19. `production_team` - Production team members
20. `quality_checks` - Quality control
21. `supplier_master` - Supplier master
22. `supplier_specializations` - Supplier specialties
23. `purchase_orders` - Purchase order headers
24. `purchase_order_items` - Purchase order line items
25. `purchase_order_attachments` - PO attachments
26. `purchase_order_deliveries` - PO delivery tracking
27. `bom_records` - BOM headers
28. `bom_record_items` - BOM line items
29. `invoices` - Invoice headers
30. `invoice_items` - Invoice line items
31. `quotations` - Quotation headers
32. `quotation_items` - Quotation line items
33. `receipts` - Payment receipts
34. `dispatch_orders` - Dispatch tracking
35. `employees` - Employee master
36. `departments` - Department master
37. `roles` - User roles
38. `user_roles` - User-role mapping
39. `calendar_events` - Calendar/events

---

## ❌ Missing Tables (35 tables)

### Critical Missing Tables (High Priority)

#### 1. Warehouse Management (7 tables)
- `warehouse_master` - Warehouse locations
- `warehouse_inventory` - Warehouse stock tracking
- `warehouses` - Warehouse hierarchy root
- `floors` - Warehouse floors
- `racks` - Storage racks
- `bins` - Storage bins
- `inventory_movements` - Stock movement tracking

**Impact:** Cannot track warehouse operations, bin locations, or inventory movements.

#### 2. GRN System (6 tables)
- `grn_master` - Goods Receipt Note headers
- `grn_items` - GRN line items
- `grn_items_fabric_details` - Fabric-specific GRN details
- `grn_quality_inspections` - Quality inspections
- `grn_discrepancies` - Discrepancy tracking
- `grn_attachments` - Supporting documents

**Impact:** Cannot receive goods from suppliers or track quality inspections.

#### 3. Tailor Management (5 tables)
- `batches` - Tailor batches
- `tailors` - Tailor master data
- `tailor_assignments` - Work assignments
- `tailor_skills` - Skill tracking
- `tailor_attendance` - Attendance records

**Impact:** Cannot manage tailor batches or track production assignments.

#### 4. Order Batch Management (2 tables)
- `order_batch_assignments` - Batch assignments
- `order_batch_size_distributions` - Size-wise distributions

**Impact:** Cannot distribute orders to production batches.

#### 5. Dispatch Details (1 table)
- `dispatch_order_items` - Dispatch line items with sizes

**Impact:** Cannot track size-wise dispatch quantities.

### Medium Priority Missing Tables

#### 6. Fabric Tracking (5 tables)
- `fabric_master` - Old fabric structure (may be replaced by fabrics)
- `fabric_inventory` - Fabric stock
- `fabric_storage_zones` - Storage locations
- `fabric_picking_records` - Picking history
- `fabric_usage_records` - Usage tracking

**Impact:** Limited fabric inventory management.

#### 7. Organization (2 tables)
- `designations` - Job designations
- `designation_departments` - Designation-department mapping

**Impact:** Cannot manage organizational hierarchy properly.

#### 8. Additional Tables (7 tables)
- `customer_types` - Customer categorization
- `company_assets` - Asset management
- `item_images` - Item image gallery
- `order_images` - Order reference images
- `order_activities` - Order lifecycle activities
- `receipts_items` - Receipt line items
- `purchase_order_fabric_details` - Fabric in POs

---

## ⚠️ Duplicate Tables (4 pairs - Need Cleanup)

### 1. Invoice Items
- `invoice_items` ✓ (Currently in DB)
- `invoices_items` ❌ (Created in migrations, not in DB)
**Recommendation:** Keep `invoice_items` (already in DB)

### 2. Quotation Items
- `quotation_items` ✓ (Currently in DB)
- `quotations_items` ❌ (Created in migrations, not in DB)
**Recommendation:** Keep `quotation_items` (already in DB)

### 3. BOM Items
- `bom_record_items` ✓ (Currently in DB)
- `bom_items` ❌ (Created in migrations, not in DB)
**Recommendation:** Keep `bom_record_items` (already in DB)

### 4. Customer Mapping
- `customer_users` ✓ (Currently in DB)
- `customer_user_mapping` ❌ (Created in migrations, not in DB)
**Recommendation:** Keep `customer_users` (already in DB)

---

## 🔄 Tables Being Used in Code (Referenced in .tsx files)

Based on grep analysis of the codebase:

**Actively Used:**
- `orders`, `order_items`, `order_assignments`, `order_batch_assignments` ⚠️
- `customers`, `customer_users`
- `invoices`, `invoice_items`
- `quotations`, `quotation_items`
- `receipts`
- `dispatch_orders`, `dispatch_order_items` ⚠️
- `purchase_orders`, `purchase_order_items`
- `bom_records`, `bom_record_items`
- `employees`, `departments`
- `production_team`, `production_orders`
- `quality_checks`, `qc_reviews` (view?)
- `batches` ⚠️, `tailors` ⚠️
- `warehouse_inventory` ⚠️, `warehouses` ⚠️
- `grn_master` ⚠️, `grn_items` ⚠️
- `fabrics`, `fabric_variants`, `fabric_master` ⚠️
- `product_categories`, `size_types`
- `profiles`, `company_settings`

⚠️ = Referenced in code but missing from database

---

## Views Referenced in Code

1. `order_lifecycle_view` - Order status tracking
2. `order_batch_assignments_with_details` - Batch details with joins
3. `order_batch_size_distributions` - Size distribution view
4. `tailor_management_view` - Tailor with batch info
5. `qc_reviews` - Quality check reviews (might be a table or view)

**Status:** Most views are missing from database

---

## Recommended Action Plan

### Phase 1: Critical Tables (Immediate)
1. Add all warehouse tables (7 tables)
2. Add GRN system tables (6 tables)
3. Add tailor management tables (5 tables)
4. Add order batch tables (2 tables)
5. Add dispatch_order_items table (1 table)

**Total Phase 1:** 21 critical tables

### Phase 2: Supporting Tables (Short-term)
1. Add fabric tracking tables (5 tables)
2. Add organizational tables (2 tables)
3. Add miscellaneous tables (7 tables)

**Total Phase 2:** 14 supporting tables

### Phase 3: Cleanup (After adding tables)
1. Remove duplicate table references from migrations
2. Create views for complex queries
3. Update types.ts to reflect new schema
4. Test all database operations

### Phase 4: Optimization
1. Add missing indexes
2. Optimize RLS policies
3. Create database functions for common operations
4. Add proper constraints and relationships

---

## Migration Strategy

1. **Create consolidated migration file** with all missing tables
2. **Run migration** on development environment first
3. **Test thoroughly** with application code
4. **Generate new types** using Supabase CLI
5. **Update application** to use new tables
6. **Deploy to production** after testing

---

## Expected Final Count

- **Core Tables:** ~73-75 tables
- **Views:** ~5-10 views
- **Functions:** ~15-20 functions
- **Total Database Objects:** ~90-105

This matches your original count of **77 tables** (likely including some views counted as tables).

---

## Next Steps

1. ✅ Review this analysis report
2. ⏳ Create consolidated migration file
3. ⏳ Create cleanup migration for duplicates
4. ⏳ Test migrations in development
5. ⏳ Generate updated types.ts
6. ⏳ Update application code
7. ⏳ Deploy to production

---

**Note:** This analysis is based on:
- Supabase types.ts file (actual database state)
- All SQL migration files in supabase/migrations/
- Standalone SQL files in project root
- Code references in src/ directory

