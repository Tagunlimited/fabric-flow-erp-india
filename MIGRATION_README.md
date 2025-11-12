# Scissors ERP - Initial Migration Guide

**Generated:** November 11, 2025  
**File:** `supabase/migrations/scissors_initial_migration.sql`  
**Lines:** 2,269  
**Status:** ✅ Ready for deployment

---

## 📋 What's Included

This comprehensive migration file creates the complete Scissors ERP database schema based on your actual production database structure.

### Database Objects Created:

#### 🎯 **40+ Core Tables**
1. **CRM & Customers** (5 tables)
   - customers
   - customer_users
   - customer_portal_settings
   - customer_activity_log
   - calendar_events

2. **Organization** (4 tables)
   - profiles
   - employees
   - departments
   - roles, user_roles

3. **Products & Inventory** (8 tables)
   - products
   - product_master
   - product_categories
   - size_types
   - fabrics, fabric_variants, fabric_master
   - item_master, inventory

4. **Orders & Sales** (3 tables)
   - orders
   - order_items
   - order_assignments

5. **Procurement** (7 tables)
   - supplier_master, supplier_specializations
   - purchase_orders, purchase_order_items
   - purchase_order_attachments, purchase_order_deliveries
   - grn_master, grn_items

6. **Production** (7 tables)
   - production_orders, production_team
   - quality_checks
   - batches, tailors
   - order_batch_assignments, order_batch_size_distributions

7. **Accounts** (6 tables)
   - quotations, quotation_items
   - invoices, invoice_items
   - receipts

8. **Dispatch** (1 table)
   - dispatch_orders

9. **Warehouse & Inventory** (10 tables)
   - warehouses, floors, racks, bins
   - warehouse_inventory, inventory_allocations
   - inventory_adjustment_reasons, inventory_adjustments
   - inventory_adjustment_items, inventory_adjustment_bins, inventory_adjustment_logs

10. **Additional Masters** (1 table)
    - branding_types

#### 🔧 **8 Custom Enums**
- `user_role` - System user roles
- `customer_type` - Customer categorization
- `customer_tier` - Customer tier levels
- `order_status` - Order lifecycle states
- `production_stage` - Production phases
- `quality_status` - QC statuses
- `dispatch_status` - Dispatch states

#### ⚡ **15+ Helper Functions**
- Number generators (PO, Order, GRN, Invoice, Receipt, etc.)
- Business logic helpers (recalculate_po_totals, refresh_customer_pending)
- Security helpers (is_admin)
- User management (create_customer_portal_user_safe, create_employee_user_account)

#### 🔐 **Row Level Security (RLS)**
- Enabled on ALL tables
- Authenticated users can perform all operations
- Special policies for:
  - User profiles (view/update own)
  - Customer portal access
  - Profile creation during signup

#### 📊 **40+ Performance Indexes**
- All primary keys
- Foreign key columns
- Frequently queried fields (order_number, customer_id, status, etc.)
- Search fields (email, phone, code, name)

#### 🎬 **20+ Triggers**
- Auto-generated numbers (PO, Order, GRN, Invoice, etc.)
- Automatic timestamp updates (updated_at)
- Employee code generation
- New user profile creation

#### 📦 **6 Storage Buckets**
- `avatars` - User/employee avatars (public, 5MB limit)
- `category-images` - Product category images (public, 10MB limit)
- `order-images` - Order reference/mockup images (public, 10MB limit)
- `order-attachments` - Order documents (private, 50MB limit)
- `company-assets` - Company logos/assets (public, 10MB limit)
- `product-images` - Product images (public, 10MB limit)

#### 👁️ **3 Essential Views**
- `warehouse_inventory_allocation_summary` - Allocated inventory tracking
- `order_batch_assignments_with_details` - Batch assignments with customer/order info
- `qc_reviews` - Quality check reviews with calculations

---

## 🚀 How to Use

### Option 1: Fresh Database Setup
```bash
# If you're setting up a new Supabase project
supabase db reset
supabase migration up
```

### Option 2: Apply to Existing Database
```sql
-- Run in Supabase SQL Editor
-- Copy and paste the contents of scissors_initial_migration.sql
```

### Option 3: Using Supabase CLI
```bash
# Apply the migration
supabase db push

# Or apply specific migration
supabase migration up --to scissors_initial_migration
```

---

## ✅ Post-Migration Steps

### 1. Regenerate TypeScript Types
```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/integrations/supabase/types.ts
```

### 2. Verify Migration Success
Run in Supabase SQL Editor:
```sql
-- Count tables
SELECT COUNT(*) as table_count 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- Should return ~40+

-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Check enum types
SELECT typname 
FROM pg_type 
WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND typtype = 'e'
ORDER BY typname;
-- Should show all 8 enums

-- Check storage buckets
SELECT id, name, public 
FROM storage.buckets 
ORDER BY name;
-- Should show 6 buckets
```

### 3. Create First Admin User
```sql
-- In Supabase Auth UI, create a new user then run:
INSERT INTO public.profiles (user_id, full_name, email, role, status)
VALUES (
    'YOUR_AUTH_USER_ID',
    'Admin User',
    'admin@yourdomain.com',
    'admin',
    'approved'
);

-- Assign admin role
INSERT INTO public.user_roles (user_id, role_id)
SELECT 
    'YOUR_AUTH_USER_ID',
    id
FROM public.roles
WHERE name = 'admin';
```

---

## 📝 Important Notes

### What This Migration Does:
✅ Creates all essential tables for Scissors ERP  
✅ Sets up complete RLS security  
✅ Configures all indexes for performance  
✅ Implements auto-number generation  
✅ Creates storage buckets with policies  
✅ Adds helper functions and views  
✅ Inserts default reference data  

### What This Migration Does NOT Do:
❌ Create sample/test data (intentional - add separately if needed)  
❌ Modify existing data (all operations are CREATE IF NOT EXISTS)  
❌ Include sidebar permissions (handled separately in your existing migrations)  
❌ Include all historical migration-specific customizations  

### Safety Features:
- Uses `IF NOT EXISTS` for all CREATE TABLE statements
- Uses `ON CONFLICT DO NOTHING` for default data inserts
- Gracefully handles missing tables in trigger loops
- All drop operations use `IF EXISTS`

---

## 🔍 Verification Queries

After running the migration, verify everything is working:

```sql
-- 1. Check all tables exist
SELECT COUNT(*) as tables FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- 2. Check RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- 3. Check foreign keys
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;

-- 4. Check indexes
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 5. Test key functions
SELECT public.generate_order_number() as sample_order_number;
SELECT public.generate_po_number() as sample_po_number;
SELECT public.is_admin() as am_i_admin;
```

---

## 🆘 Troubleshooting

### If migration fails midway:
```sql
-- Rollback by dropping all created objects
-- (Only do this on a fresh database!)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
```

### If you see "relation already exists" errors:
This is normal - the migration uses `IF NOT EXISTS` clauses to be idempotent. The migration will skip already-created objects.

### If you need to update the schema later:
Don't modify this file. Instead, create a new migration file:
```bash
supabase migration new your_new_changes
```

---

## 📞 Support

For issues or questions about this migration:
1. Check the migration file comments for detailed explanations
2. Verify all prerequisites are met (PostgreSQL extensions, permissions)
3. Review the Supabase logs for specific error messages
4. Ensure your Supabase project has sufficient resources

---

**Generated by:** Scissors ERP Database Schema Generator  
**Based on:** Production database schema analysis  
**Compatible with:** Supabase PostgreSQL 15+  
**Last Updated:** November 11, 2025

