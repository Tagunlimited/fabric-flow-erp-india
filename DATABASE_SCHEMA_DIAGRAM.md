# Scissors ERP - Database Schema Diagram

Generated from: `scissors_initial_migration.sql` (2,269 lines)

---

## 🗺️ Schema Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SCISSORS ERP DATABASE                         │
│                      (40+ Tables)                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Module Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│     CRM      │────▶│    ORDERS    │────▶│  PRODUCTION  │
│  (Customers) │     │   (Sales)    │     │  (Manufacturing)│
└──────────────┘     └──────────────┘     └──────────────┘
       │                     │                     │
       ▼                     ▼                     ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   ACCOUNTS   │     │     BOM      │     │  WAREHOUSE   │
│ (Billing)    │     │  (Materials) │     │  (Inventory) │
└──────────────┘     └──────────────┘     └──────────────┘
       │                     │                     │
       ▼                     ▼                     ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   DISPATCH   │     │ PROCUREMENT  │     │  QUALITY QC  │
│  (Shipping)  │     │  (Suppliers) │     │  (Inspection)│
└──────────────┘     └──────────────┘     └──────────────┘
```

---

## 🔗 Table Relationships

### Core Customer Flow
```
customers
    ├─▶ customer_users (portal access)
    ├─▶ customer_portal_settings (permissions)
    ├─▶ customer_activity_log (audit trail)
    ├─▶ orders
    ├─▶ quotations
    ├─▶ invoices
    └─▶ receipts
```

### Order Processing Flow
```
orders
    ├─▶ order_items (products ordered)
    ├─▶ order_assignments (cutting/pattern)
    ├─▶ order_batch_assignments (tailor batches)
    │      └─▶ order_batch_size_distributions (size tracking)
    ├─▶ bom_records (bill of materials)
    │      └─▶ bom_record_items
    ├─▶ production_orders
    ├─▶ quality_checks
    ├─▶ dispatch_orders
    └─▶ invoices
```

### Procurement Flow
```
supplier_master
    ├─▶ supplier_specializations
    └─▶ purchase_orders
           ├─▶ purchase_order_items
           ├─▶ purchase_order_attachments
           ├─▶ purchase_order_deliveries
           └─▶ grn_master (goods receipt)
                  └─▶ grn_items
                         └─▶ warehouse_inventory
```

### Warehouse Hierarchy
```
warehouses
    └─▶ floors
           └─▶ racks
                  └─▶ bins
                         └─▶ warehouse_inventory
                                ├─▶ inventory_allocations (BOM tracking)
                                └─▶ inventory_adjustments (stock updates)
```

### Production Team Structure
```
departments
    └─▶ employees

batches
    ├─▶ tailors (batch members)
    └─▶ order_batch_assignments
```

---

## 🎨 Key Features by Module

### 1️⃣ **CRM & Customer Management**
```
Tables: customers, customer_users, customer_portal_settings, customer_activity_log
Features:
  ├─ Customer master data
  ├─ Customer portal access
  ├─ Customer tier & type classification
  ├─ Activity logging
  └─ Credit limit & outstanding tracking
```

### 2️⃣ **Order Management**
```
Tables: orders, order_items, order_assignments
Features:
  ├─ Custom & readymade orders
  ├─ Size-wise quantity tracking
  ├─ Multi-product orders
  ├─ Image attachments (reference, mockup)
  ├─ Branding specifications
  ├─ Auto order numbering (TUC/25-26/NOV/001)
  └─ 15-state order lifecycle
```

### 3️⃣ **Production Management**
```
Tables: production_orders, production_team, batches, tailors, 
        order_batch_assignments, order_batch_size_distributions
Features:
  ├─ Batch-based tailor assignments
  ├─ Size-wise picking & completion tracking
  ├─ Cutting & pattern master assignments
  ├─ Per-piece rate management
  ├─ Production stage tracking
  └─ Efficiency metrics
```

### 4️⃣ **Quality Control**
```
Tables: quality_checks
Features:
  ├─ Pass/fail percentage tracking
  ├─ Defect logging
  ├─ Rework requirements
  ├─ Inspector assignment
  └─ QC reviews view
```

### 5️⃣ **Warehouse & Inventory**
```
Tables: warehouses, floors, racks, bins, warehouse_inventory,
        inventory_allocations, inventory_adjustments
Features:
  ├─ 4-level hierarchy (warehouse→floor→rack→bin)
  ├─ 3 zone types (receiving, storage, dispatch)
  ├─ Bin-level inventory tracking
  ├─ BOM allocation tracking
  ├─ Stock adjustment with audit trail
  ├─ Size-variant support
  └─ Multi-bin inventory per SKU
```

### 6️⃣ **Procurement & Suppliers**
```
Tables: supplier_master, supplier_specializations, purchase_orders,
        purchase_order_items, grn_master, grn_items
Features:
  ├─ Supplier master with specializations
  ├─ Auto PO numbering
  ├─ Multi-item type support (fabric/item/product)
  ├─ GRN with quality inspection
  ├─ Approval workflow
  └─ Auto-complete PO on GRN approval
```

### 7️⃣ **Accounts & Billing**
```
Tables: quotations, quotation_items, invoices, invoice_items, receipts
Features:
  ├─ Quote to order conversion
  ├─ Invoice generation
  ├─ Receipt tracking
  ├─ Customer pending calculation
  ├─ Auto number generation
  └─ Payment mode tracking
```

### 8️⃣ **Products & Masters**
```
Tables: product_master, product_categories, fabrics, fabric_variants,
        size_types, item_master, branding_types
Features:
  ├─ Product SKU hierarchy
  ├─ Size-wise product variants
  ├─ Fabric master with color/GSM variants
  ├─ Product categories with images
  ├─ Size type definitions
  ├─ Item master for raw materials
  └─ Branding customization options
```

### 9️⃣ **Dispatch & Delivery**
```
Tables: dispatch_orders
Features:
  ├─ Courier integration ready
  ├─ Tracking number support
  ├─ Delivery address management
  ├─ Status tracking (packed→shipped→delivered)
  └─ Auto dispatch numbering
```

### 🔟 **Security & Access Control**
```
Tables: profiles, roles, user_roles
Features:
  ├─ Role-based access control (RBAC)
  ├─ 9 predefined user roles
  ├─ Row Level Security (RLS) on all tables
  ├─ Customer portal permissions
  ├─ Employee access management
  └─ Auto user profile creation
```

---

## 🔐 Security Architecture

### RLS Strategy:
```
┌─────────────────────────────────────────┐
│  All Authenticated Users                │
│  ├─ Full access to business tables      │
│  └─ Restricted by role for admin ops    │
└─────────────────────────────────────────┘
        │
        ├─▶ Profiles: Users can view/update own
        ├─▶ Customer Portal: Customers see own data
        └─▶ Storage: Role-based upload/view
```

---

## 📈 Performance Optimizations

### Indexes Created (40+):
- All foreign keys indexed
- Search fields (name, code, email, phone)
- Status columns for filtering
- Date columns for reporting
- Unique constraints (order_number, sku, codes)

### Computed Columns:
- `inventory.available_quantity` = stock - reserved
- Customer pending amounts (via trigger function)

---

## 🎯 Auto-Number Patterns

```
Orders:          TUC/25-26/NOV/001
Purchase Orders: PO-000001
GRNs:            GRN-000001
Invoices:        INV000001
Receipts:        RC000001
Quotations:      QUO000001
Production:      PRD000001
Dispatch:        DSP000001
Employees:       EMP0001
```

---

## 📦 Storage Buckets

```
avatars/              (public,  5MB) → User/employee photos
category-images/      (public, 10MB) → Product category images
order-images/         (public, 10MB) → Order reference/mockup
order-attachments/    (private, 50MB) → Order documents
company-assets/       (public, 10MB) → Logos, branding
product-images/       (public, 10MB) → Product photos
```

---

## 🔄 Key Business Logic

### 1. Order Lifecycle:
pending → confirmed → in_production → under_cutting → under_stitching → under_qc → ready_for_dispatch → dispatched → completed

### 2. GRN Approval Flow:
draft → received → under_inspection → approved/rejected → auto-creates warehouse_inventory

### 3. Inventory Allocation:
BOM created → Items allocated from warehouse_inventory → Stock reserved → Pick list generated

### 4. Customer Pending:
Auto-calculated from (invoices - receipts) via trigger

---

## 📊 Database Statistics

**After Migration:**
- **Tables:** ~40-58 (depending on existing schema)
- **Views:** 3 essential views
- **Functions:** 26 helper functions
- **Triggers:** 20+ automation triggers
- **Enums:** 8 custom types
- **Indexes:** 40+ performance indexes
- **Storage Buckets:** 6 configured buckets
- **RLS Policies:** 100+ security policies

---

**Total Database Objects:** ~200+

This represents a complete, production-ready ERP system schema! 🎉

