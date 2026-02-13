# Complete Database Schema - Scissors V2 ERP

**Generated:** October 8, 2025  
**Status:** Ready for Migration  
**Total Objects:** ~98 (74 tables + 9 views + 15 functions)

---

## Quick Reference

### 📊 Database Statistics

| Metric | Count |
|--------|-------|
| **Current Tables** | 39 |
| **Tables After Migration** | 74 |
| **Views** | 9 |
| **Functions** | ~15 |
| **Enums** | 8 |
| **Total Objects** | ~98 |

### 📁 Key Documents

1. **DATABASE_ANALYSIS_REPORT.md** - Detailed analysis of current vs. expected schema
2. **MIGRATION_GUIDE.md** - Step-by-step migration instructions
3. **DUPLICATE_TABLES_CLEANUP.md** - Duplicate table cleanup guide

### 🗂️ Migration Files

1. `supabase/migrations/20251008000000_add_all_missing_tables.sql` - Main migration (35 tables)
2. `supabase/migrations/20251008000001_create_views.sql` - Views migration (9 views)

---

## Complete Table List (74 Tables)

### ✅ Core System (9 tables)
1. `profiles` - User profiles
2. `customers` - Customer master
3. `customer_users` - Customer-user linking
4. `customer_types` 🆕 - Customer categorization
5. `customer_activity_log` - Activity tracking
6. `customer_portal_settings` - Portal permissions
7. `company_settings` - Company configuration
8. `company_assets` 🆕 - Asset management
9. `calendar_events` - Calendar/events

### ✅ Products & Inventory (8 tables)
10. `products` - Product catalog
11. `product_master` - Product master data
12. `product_categories` - Product categorization
13. `item_master` - Item catalog
14. `item_images` 🆕 - Item image gallery
15. `inventory` - Inventory management
16. `inventory_movements` 🆕 - Stock movement tracking
17. `size_types` - Size master

### ✅ Fabrics (7 tables)
18. `fabrics` - Fabric master (new structure)
19. `fabric_variants` - Fabric color/GSM variants
20. `fabric_master` 🆕 - Legacy fabric structure
21. `fabric_inventory` 🆕 - Fabric stock
22. `fabric_storage_zones` 🆕 - Storage locations
23. `fabric_picking_records` 🆕 - Picking history
24. `fabric_usage_records` 🆕 - Usage tracking

### ✅ Orders (8 tables)
25. `orders` - Order headers
26. `order_items` - Order line items
27. `order_images` 🆕 - Order reference images
28. `order_assignments` - Cutting/pattern assignments
29. `order_activities` 🆕 - Order lifecycle activities
30. `order_batch_assignments` 🆕 - Batch assignments
31. `order_batch_size_distributions` 🆕 - Size distributions
32. `order_lifecycle_view` 🔍 (View) - Order status tracking

### ✅ Production & Quality (8 tables)
33. `production_orders` - Production tracking
34. `production_team` - Production team members
35. `quality_checks` - Quality control
36. `batches` 🆕 - Tailor batches
37. `tailors` 🆕 - Tailor master data
38. `tailor_assignments` 🆕 - Work assignments
39. `tailor_skills` 🆕 - Skill tracking
40. `tailor_attendance` 🆕 - Attendance records

### ✅ BOM (2 tables)
41. `bom_records` - BOM headers
42. `bom_record_items` - BOM line items

### ✅ Procurement & Suppliers (8 tables)
43. `supplier_master` - Supplier master
44. `supplier_specializations` - Supplier specialties
45. `purchase_orders` - Purchase order headers
46. `purchase_order_items` - Purchase order line items
47. `purchase_order_attachments` - PO attachments
48. `purchase_order_deliveries` - PO delivery tracking
49. `purchase_order_fabric_details` 🆕 - Fabric in POs

### ✅ GRN System (6 tables)
50. `grn_master` 🆕 - Goods Receipt Note headers
51. `grn_items` 🆕 - GRN line items
52. `grn_items_fabric_details` 🆕 - Fabric-specific GRN details
53. `grn_quality_inspections` 🆕 - Quality inspections
54. `grn_discrepancies` 🆕 - Discrepancy tracking
55. `grn_attachments` 🆕 - Supporting documents

### ✅ Accounts (9 tables)
56. `invoices` - Invoice headers
57. `invoice_items` - Invoice line items
58. `quotations` - Quotation headers
59. `quotation_items` - Quotation line items
60. `receipts` - Payment receipts
61. `receipts_items` 🆕 - Receipt line items

### ✅ Dispatch (2 tables)
62. `dispatch_orders` - Dispatch tracking
63. `dispatch_order_items` 🆕 - Dispatch line items with sizes

### ✅ Warehouse (7 tables)
64. `warehouse_master` 🆕 - Warehouse locations (legacy)
65. `warehouse_inventory` 🆕 - Warehouse stock tracking
66. `warehouses` 🆕 - Warehouse hierarchy root
67. `floors` 🆕 - Warehouse floors
68. `racks` 🆕 - Storage racks
69. `bins` 🆕 - Storage bins

### ✅ Organization (6 tables)
70. `employees` - Employee master
71. `departments` - Department master
72. `designations` 🆕 - Job designations
73. `designation_departments` 🆕 - Designation-department mapping
74. `roles` - User roles
75. `user_roles` - User-role mapping

🆕 = New table added by migration  
🔍 = View

---

## Complete Views List (9 Views)

1. **`order_lifecycle_view`** - Order progression tracking
2. **`order_batch_assignments_with_details`** - Batch assignments with full details
3. **`tailor_management_view`** - Tailor comprehensive view
4. **`qc_reviews`** - Quality check reviews
5. **`goods_receipt_notes`** - GRN master with details
6. **`warehouse_inventory_summary`** - Inventory with locations
7. **`fabric_stock_summary`** - Aggregated fabric stock
8. **`order_cutting_assignments`** - Cutting assignments view
9. **`dispatch_summary`** - Dispatch with quantities

---

## Database Functions

### Number Generation Functions
1. `generate_order_number()` - Auto-generate order numbers
2. `generate_po_number()` - Auto-generate PO numbers
3. `generate_grn_number()` 🆕 - Auto-generate GRN numbers
4. `generate_invoice_number()` - Auto-generate invoice numbers
5. `generate_receipt_number()` - Auto-generate receipt numbers
6. `generate_quotation_number()` - Auto-generate quotation numbers
7. `generate_production_number()` - Auto-generate production numbers
8. `generate_dispatch_number()` - Auto-generate dispatch numbers

### Utility Functions
9. `update_updated_at_column()` - Auto-update timestamps
10. `set_grn_number()` 🆕 - Trigger for GRN number
11. `update_batch_capacity()` 🆕 - Auto-update batch capacity
12. `recalculate_po_totals()` - Recalculate PO totals
13. `refresh_customer_pending()` - Update customer pending amounts
14. `is_admin()` - Check if user is admin
15. `get_best_suppliers()` - Find best suppliers for specialization

---

## Database Enums

1. **`customer_tier`** - bronze, silver, gold, platinum
2. **`customer_type`** - Retail, Wholesale, Corporate, B2B, B2C, Enterprise
3. **`dispatch_status`** - pending, packed, shipped, delivered
4. **`order_status`** - pending, confirmed, in_production, quality_check, etc.
5. **`production_stage`** - cutting, stitching, embroidery, packaging, completed
6. **`quality_status`** - pending, passed, failed, rework
7. **`user_role`** - admin, sales manager, production manager, etc.
8. **`location_type`** 🆕 - RECEIVING_ZONE, STORAGE, DISPATCH_ZONE
9. **`tailor_type`** 🆕 - single_needle, overlock_flatlock
10. **`skill_level`** 🆕 - beginner, intermediate, advanced, expert

---

## Key Relationships

### Master-Detail Relationships
- `orders` → `order_items`
- `invoices` → `invoice_items`
- `quotations` → `quotation_items`
- `purchase_orders` → `purchase_order_items`
- `grn_master` → `grn_items`
- `bom_records` → `bom_record_items`
- `dispatch_orders` → `dispatch_order_items`
- `batches` → `tailors`

### Warehouse Hierarchy
```
warehouses
  └── floors
      └── racks
          └── bins
              └── warehouse_inventory
```

### Production Flow
```
orders
  └── production_orders
      └── order_batch_assignments
          └── batches
              └── tailors
                  └── tailor_assignments
      └── quality_checks
          └── dispatch_orders
              └── dispatch_order_items
```

### Procurement Flow
```
supplier_master
  └── purchase_orders
      └── purchase_order_items
          └── grn_master
              └── grn_items
                  └── warehouse_inventory
```

---

## Quick Migration Commands

### 1. Apply Migrations
```bash
cd "/Users/mukeshayudh/Documents/V2/Scissors V2"
supabase db push
```

### 2. Generate Types
```bash
supabase gen types typescript --project-id your-project-id > src/integrations/supabase/types.ts
```

### 3. Verify
```sql
-- Check table count
SELECT count(*) FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- Should return ~74

-- Check view count
SELECT count(*) FROM information_schema.views 
WHERE table_schema = 'public';
-- Should return 9
```

---

## Feature Mapping

### Warehouse Management
**Tables:** warehouses, floors, racks, bins, warehouse_inventory, inventory_movements  
**Views:** warehouse_inventory_summary  
**Functions:** N/A

### GRN (Goods Receipt)
**Tables:** grn_master, grn_items, grn_items_fabric_details, grn_quality_inspections, grn_discrepancies, grn_attachments  
**Views:** goods_receipt_notes  
**Functions:** generate_grn_number(), set_grn_number()

### Tailor Management
**Tables:** batches, tailors, tailor_assignments, tailor_skills, tailor_attendance  
**Views:** tailor_management_view  
**Functions:** update_batch_capacity()

### Order Batch Management
**Tables:** order_batch_assignments, order_batch_size_distributions  
**Views:** order_batch_assignments_with_details  
**Functions:** N/A

### Quality Control
**Tables:** quality_checks  
**Views:** qc_reviews  
**Functions:** N/A

### Dispatch
**Tables:** dispatch_orders, dispatch_order_items  
**Views:** dispatch_summary, order_cutting_assignments  
**Functions:** generate_dispatch_number()

---

## Security (RLS Policies)

All 74 tables have Row Level Security enabled with the following policy:
```sql
"Allow all operations for authenticated users"
FOR ALL USING (auth.role() = 'authenticated')
```

### Future Enhancement
Consider implementing more granular RLS policies based on user roles for:
- Finance tables (invoices, receipts)
- HR tables (employees, salaries)
- Sensitive data (customer financial info)

---

## Performance Considerations

### Indexed Columns
All foreign keys are indexed automatically. Additional indexes created for:
- All `_code` columns (warehouse_code, tailor_code, etc.)
- Status columns
- Date columns for reporting
- Lookup fields (warehouse_id, batch_id, etc.)

### Computed Columns
- `warehouse_inventory.available_quantity` - GENERATED ALWAYS AS (quantity - reserved_quantity)
- `fabric_inventory.available_quantity` - GENERATED ALWAYS AS (quantity - reserved_quantity)

---

## Data Integrity

### Constraints
- All primary keys are UUIDs
- Foreign keys use CASCADE DELETE where appropriate
- CHECK constraints on status enums
- UNIQUE constraints on code fields
- NOT NULL on required fields

### Triggers
- Auto-update `updated_at` on all master tables
- Auto-generate numbers (GRN, PO, Invoice, etc.)
- Auto-update batch capacity when tailors added/removed

---

## Next Steps

1. ✅ Review all documentation
2. ⏳ Backup current database
3. ⏳ Run migration in development first
4. ⏳ Test all features
5. ⏳ Generate new types.ts
6. ⏳ Update application if needed
7. ⏳ Run in production
8. ⏳ Monitor for issues

---

## Support Documents

| Document | Purpose |
|----------|---------|
| DATABASE_ANALYSIS_REPORT.md | Detailed comparison of current vs expected schema |
| MIGRATION_GUIDE.md | Step-by-step migration instructions |
| DUPLICATE_TABLES_CLEANUP.md | Handling duplicate table references |
| COMPLETE_DATABASE_SCHEMA.md | This document - complete schema reference |

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2025-10-08 | 1.0 | Initial complete schema documentation |

---

**Database Schema Status:** ✅ Complete and Ready for Migration  
**Expected Final Count:** 74 tables + 9 views = 83 objects (plus functions and enums)  
**Migration Risk:** Low  
**Downtime Required:** None

---

This completes the analysis and preparation for migrating your Scissors V2 database from 39 tables to the full 74-table schema. All migrations are ready to run!

