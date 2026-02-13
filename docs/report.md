# Fabric Flow ERP System - Complete Feature Report

**Generated:** January 2025  
**System Version:** V2  
**Industry:** Apparel & Textile Manufacturing

---

## Executive Summary

Fabric Flow ERP is a comprehensive Enterprise Resource Planning system designed specifically for apparel and textile manufacturing companies. The system manages the complete lifecycle from order placement through production, quality control, inventory management, and financial accounting. Built with modern web technologies, it provides a cloud-based solution accessible from any device.

### Key Highlights
- **Complete Order-to-Delivery Cycle** management
- **Real-time Inventory Tracking** with warehouse management
- **Production Workflow** with cutting, stitching, and quality control
- **Procurement & Supply Chain** management with BOM and GRN
- **Financial Accounting** with invoicing, quotations, and receipts
- **Multi-role Access Control** with granular permissions
- **Cloud-based Architecture** using Supabase

---

## Technology Stack

### Frontend
- **Framework:** React 18.3.1 with TypeScript
- **Build Tool:** Vite 7.0.5
- **UI Library:** shadcn/ui (Radix UI components)
- **Styling:** Tailwind CSS 3.4.11
- **Routing:** React Router DOM 6.26.2
- **State Management:** React Context API, TanStack Query
- **Forms:** React Hook Form 7.53.0 with Zod validation
- **PDF Generation:** jsPDF 3.0.1 with html2canvas 1.4.1
- **Data Processing:** PapaParse 5.5.3 (CSV), xlsx 0.18.5 (Excel)
- **Charts:** Recharts 2.12.7
- **Icons:** Lucide React 0.462.0

### Backend
- **Database:** PostgreSQL (via Supabase)
- **Backend-as-a-Service:** Supabase 2.52.0
- **Authentication:** Supabase Auth
- **Storage:** Supabase Storage (6 buckets)
- **Real-time:** Supabase Realtime subscriptions
- **Row Level Security:** Enabled on all tables

### Infrastructure
- **Hosting:** Cloud-based (Supabase)
- **Storage Buckets:** 6 buckets for different asset types
- **Database Tables:** 74+ tables
- **Database Views:** 9 complex views
- **Database Functions:** 15+ PostgreSQL functions
- **RLS Policies:** Implemented across all tables

---

## Core Modules & Features

### 1. Dashboard & Analytics
**Purpose:** Central command center for business overview

**Features:**
- Real-time order status overview
- Pending orders count with badges
- Stock value calculations
- Low stock alerts
- Excess stock monitoring
- Quick navigation to key modules
- Visual charts and statistics
- Customizable dashboard views

**Location:** `/` or `/dashboard`

---

### 2. Customer Relationship Management (CRM)
**Purpose:** Manage customer master data and relationships

**Features:**
- **Customer Master**
  - Create, view, edit customer profiles
  - Customer type classification (Retail, Wholesale, Corporate, B2B, B2C, Enterprise)
  - Customer tier system (Bronze, Silver, Gold, Platinum)
  - Contact information management
  - Address management with state/city data
  - Credit limit tracking
  - Payment terms configuration
  - Customer activity logging
  - Customer portal access management
  - Bulk customer upload via CSV/Excel
  - Customer search and filtering
  - Customer detail pages with order history
  - Avatar/profile image upload

- **Customer Types Master**
  - Define customer categories
  - Configure default settings per type
  - Pricing rules per customer type

**Location:** `/crm/customers`, `/masters/customer-types`

**Key Tables:** `customers`, `customer_types`, `customer_activity_log`, `customer_portal_settings`

---

### 3. Order Management
**Purpose:** Handle customer orders from creation to delivery

**Features:**
- **Custom Orders**
  - Create orders with multiple items
  - Product customization modal with:
    - Product parts selection (collars, cuffs, etc.)
    - Addon options with images
    - Custom text inputs
    - Quantity per customization
    - Price impact calculations
  - Size-wise quantity distribution
  - Mockup image upload and display
  - Order reference images
  - Order status tracking (pending, confirmed, in_production, quality_check, dispatched, delivered, cancelled)
  - Order assignment to sales managers
  - Expected delivery date management
  - Order notes and special instructions
  - Order lifecycle activity logging
  - Print quotation/order details

- **Readymade Orders**
  - Simplified order creation for stock items
  - Quick order entry

- **Order Tracking**
  - Real-time status updates
  - Material availability status
  - Production progress tracking
  - Quality check status
  - Dispatch status

**Location:** `/orders`, `/orders/readymade`, `/orders/:id`

**Key Tables:** `orders`, `order_items`, `order_images`, `order_activities`, `order_assignments`

---

### 4. Production Management
**Purpose:** Manage manufacturing workflow from cutting to quality check

**Features:**
- **Order Assignment**
  - Assign orders to cutting masters
  - Assign cutting masters to orders
  - Track cutting assignments
  - View assigned cutting master avatars
  - Assignment history

- **Cutting Manager**
  - View assigned cutting jobs
  - Track cutting progress (pending, in_progress, completed)
  - Distribute quantities to tailor batches
  - Batch assignment management
  - Size-wise quantity distribution to batches
  - Batch assignment PDF generation with:
    - Product details and images
    - Batch leader information with avatars
    - Size distribution tables
    - Stitching rates (SN/OF rates)
    - Total earnings per batch
    - Customizations display
    - Sales manager details
  - Material status checking
  - Cutting completion tracking

- **Tailor Management**
  - Create and manage tailor batches
  - Batch leader assignment
  - Batch capacity management
  - Tailor skills tracking
  - Tailor attendance management
  - Assign orders to batches
  - Size-wise quantity distribution
  - Batch performance tracking

- **Picker Interface**
  - View assigned orders for picking
  - Record picked quantities
  - Size-wise picking tracking
  - Picker assignment to batch leaders
  - Fabric picking records

**Location:** `/production`, `/production/assign-orders`, `/production/cutting-manager`, `/production/tailor-management`, `/production/picker`

**Key Tables:** `production_orders`, `order_batch_assignments`, `order_batch_size_distributions`, `batches`, `tailors`, `tailor_assignments`, `order_cutting_assignments`

---

### 5. Quality Control (QC)
**Purpose:** Ensure product quality before dispatch

**Features:**
- **QC Reviews**
  - View picked orders awaiting quality check
  - Approve or reject quantities
  - Size-wise QC tracking
  - QC notes and remarks
  - QC status management
  - Batch-wise QC reviews
  - QC history tracking

- **Dispatch Management**
  - View QC-approved orders
  - Create dispatch challans
  - Size-wise dispatch quantities
  - Dispatch status tracking
  - Print dispatch challan

**Location:** `/quality`, `/quality/checks`, `/quality/dispatch`

**Key Tables:** `quality_checks`, `dispatch_orders`, `dispatch_order_items`

---

### 6. Procurement & Supply Chain
**Purpose:** Manage material procurement from suppliers

**Features:**
- **Bills of Materials (BOM)**
  - Create BOMs from orders
  - Add fabric and item requirements
  - Quantity calculations:
    - For items: Total quantity required
    - For fabrics: Total order quantity / pcs per kg/mtr
  - BOM status tracking
  - Link BOMs to orders
  - BOM to Purchase Order conversion
  - BOM versioning

- **Purchase Orders (PO)**
  - **Single Supplier PO**
    - Create purchase orders
    - Add items and fabrics
    - Supplier selection
    - PO status tracking
    - Print/export PO as PDF
    - PO number auto-generation

  - **Multi-Supplier PO**
    - Multi-step wizard:
      - Step 1: Select items from BOM
      - Step 2: Assign suppliers per item
      - Step 3: Review and create multiple POs
    - Item-level supplier assignment
    - Create multiple POs in batch
    - Track which items are already in PO
    - Prevent duplicate selection
    - Partial quantity splitting across suppliers

  - **PO Features**
    - Item and fabric details display
    - Images for products and fabrics
    - Color, GSM, and other attributes
    - Remarks per line item
    - Auto-complete PO when all items approved in GRN
    - PO completion tracking

- **Goods Receipt Note (GRN)**
  - Create GRN from Purchase Orders
  - Receive items and fabrics
  - Quality inspection recording
  - Approve/reject quantities
  - Discrepancy tracking
  - Attachment upload
  - GRN number auto-generation
  - Update warehouse inventory automatically
  - Track fabric inventory separately
  - Item inventory tracking

**Location:** `/bom`, `/procurement/po`, `/procurement/grn`

**Key Tables:** `bom_records`, `bom_record_items`, `purchase_orders`, `purchase_order_items`, `grn_master`, `grn_items`, `grn_items_fabric_details`

---

### 7. Inventory & Warehouse Management
**Purpose:** Track stock levels and warehouse operations

**Features:**
- **Warehouse Master**
  - Create warehouse hierarchy:
    - Warehouses → Floors → Racks → Bins
  - Warehouse location management
  - Storage zone configuration (Receiving, Storage, Dispatch)
  - Bin code generation
  - Visual warehouse tree view
  - Warehouse grid view

- **Warehouse Inventory**
  - Track items by location (bin level)
  - Receiving zone inventory
  - Storage zone inventory
  - Dispatch zone inventory
  - Inventory movements tracking
  - Transfer items between bins
  - Inventory logs and history
  - Real-time stock levels

- **Fabric Inventory**
  - Separate fabric stock tracking
  - Fabric color and GSM variants
  - Fabric storage zones
  - Fabric picking records
  - Fabric usage records
  - Fabric inventory updates on GRN approval

- **Stock Movement**
  - Track all inventory movements
  - Movement history
  - Source and destination tracking
  - Movement reasons

**Location:** `/warehouse/inventory`, `/masters/warehouses`

**Key Tables:** `warehouses`, `floors`, `racks`, `bins`, `warehouse_inventory`, `inventory_movements`, `fabric_inventory`, `fabric_picking_records`

---

### 8. Product & Master Data Management
**Purpose:** Maintain product catalogs and master data

**Features:**
- **Product Master**
  - Create, edit, delete products
  - Product fields:
    - SKU (unique identifier)
    - Class
    - Color
    - Size Type
    - Size
    - Product Name
    - Material
    - Brand
    - Category
    - Gender
    - MRP, Cost, Selling Price
    - GST Rate
    - HSN Code
    - Images (main, image1, image2)
  - Automatic sorting by Class and Size (S, M, L, XL, 2XL, 3XL)
  - Bulk upload via CSV/Excel
  - Export to CSV/Excel
  - Multi-select and batch delete
  - Column visibility toggle
  - Search and filter
  - Image compression on upload
  - Product image management

- **Item Master**
  - Item catalog management
  - Item codes and descriptions
  - Item types classification
  - Image upload
  - Stock tracking

- **Product Categories**
  - Category management
  - Category images
  - Category-based product organization

- **Fabric Master**
  - Fabric catalog
  - Color and GSM variants
  - Fabric images
  - Fabric attributes (composition, weight, etc.)

- **Size Master**
  - Size type definitions
  - Available sizes per type
  - Size type images

- **Supplier Master**
  - Supplier profiles
  - Contact information
  - Supplier specializations
  - Supplier performance tracking

- **Image Master**
  - Centralized image storage
  - Nested folder upload (Product/Color/Images)
  - Folder structure visualization
  - Image organization by product and color
  - Table and card view toggle
  - Image URL management
  - Image deletion
  - Bulk folder upload
  - Automatic image compression

**Location:** `/masters/products`, `/masters/items`, `/inventory/product-categories`, `/inventory/fabrics`, `/inventory/size-types`, `/masters/suppliers`, `/masters/images`

**Key Tables:** `product_master`, `item_master`, `product_categories`, `fabrics`, `fabric_variants`, `size_types`, `supplier_master`

---

### 9. Financial & Accounting
**Purpose:** Manage financial transactions and accounting

**Features:**
- **Quotations**
  - Generate quotations from orders
  - Product details with images
  - Customization display
  - Price breakdown
  - GST calculations
  - Multiple GST rates support
  - Print/export quotations
  - Email quotations
  - Quotation number auto-generation

- **Invoices**
  - Create invoices from orders
  - Invoice items with details
  - GST calculations and breakdown
  - Multiple GST rates handling
  - Invoice number auto-generation
  - Print/export invoices
  - Invoice status tracking
  - Payment tracking

- **Receipts**
  - Record customer payments
  - Link receipts to invoices/orders
  - Partial payment support
  - Receipt number auto-generation
  - Payment method tracking
  - Update customer pending balance
  - Receipt print/export

- **Payment Tracking**
  - Track all payments
  - Payment history
  - Outstanding amounts
  - Payment status

**Location:** `/accounts/quotations`, `/accounts/invoices`, `/accounts/receipts`, `/accounts/payments`

**Key Tables:** `quotations`, `quotation_items`, `invoices`, `invoice_items`, `receipts`, `receipts_items`

---

### 10. People & Organization Management
**Purpose:** Manage employees, departments, and organizational structure

**Features:**
- **Employees**
  - Employee master data
  - Profile management
  - Avatar upload
  - Department assignment
  - Designation assignment
  - Contact information
  - Employee detail pages
  - Employee search and filter

- **Departments**
  - Department master
  - Department hierarchy
  - Department details
  - Employee count per department

- **Designations**
  - Job designations master
  - Department-wise designations
  - Many-to-many relationship with departments

- **Production Team**
  - Production team management
  - Team member assignments
  - Team performance tracking

**Location:** `/people`, `/people/employees`, `/people/departments`, `/people/designations`, `/people/production-team`

**Key Tables:** `employees`, `departments`, `designations`, `designation_departments`, `production_team`

---

### 11. User & Access Management
**Purpose:** Control user access and permissions

**Features:**
- **Employee Access Management**
  - Assign roles to employees
  - Granular permission control
  - Role-based access control (RBAC)
  - Sidebar menu permissions
  - Admin user bypass
  - Permission testing interface

- **Customer Access Management**
  - Customer portal access
  - Customer user accounts
  - Portal permissions
  - Customer portal settings

- **Roles & Permissions**
  - Predefined roles:
    - Admin
    - Production Manager
    - Cutting Master
    - QC Manager
    - Sales Manager
    - Inventory Manager
    - Accounts Manager
    - HR Manager
    - Procurement Manager
    - Design Manager
  - Custom permission sets
  - Role-based UI visibility

**Location:** `/admin/employee-access`, `/admin/customer-access`

**Key Tables:** `roles`, `user_roles`, `profiles`

---

### 12. Design & Printing
**Purpose:** Manage design and printing operations

**Features:**
- Design workflow management
- Printing job tracking
- Design approvals
- Mockup management

**Location:** `/design`

---

### 13. Reports & Analytics
**Purpose:** Generate business reports and analytics

**Features:**
- Order reports
- Inventory reports
- Financial reports
- Production reports
- Custom report generation
- Export capabilities

**Location:** `/reports`

---

### 14. Configuration & Settings
**Purpose:** System-wide configuration

**Features:**
- **Company Settings**
  - Company profile
  - Company logo upload
  - Address and contact details
  - GST information
  - Bank details
  - Authorized signatory
  - Company branding

- **System Settings**
  - Default configurations
  - System preferences
  - Email settings
  - Notification settings

**Location:** `/configuration`, `/admin/company-config`

**Key Tables:** `company_settings`

---

## Key Workflows

### 1. Order-to-Delivery Workflow
```
Customer Order → Quotation → Order Confirmation → Material Requirement (BOM) → 
Purchase Order → GRN → Warehouse Receipt → Production Assignment → 
Cutting → Batch Assignment → Tailor Work → Quality Check → Dispatch → Invoice → Receipt
```

### 2. Procurement Workflow
```
BOM Creation → Item Selection → Supplier Assignment → Purchase Order Creation → 
PO Approval → Goods Receipt (GRN) → Quality Inspection → Approval → 
Warehouse Inventory Update → Material Available for Production
```

### 3. Production Workflow
```
Order Assignment → Cutting Master Assignment → Cutting Job → 
Batch Distribution → Tailor Assignment → Stitching → Picker → 
Quality Check → Approval/Rejection → Dispatch
```

### 4. Warehouse Workflow
```
GRN Receipt → Receiving Zone → Quality Check → Storage Zone → 
Production Pick → Dispatch Zone → Dispatch → Inventory Update
```

---

## Database Architecture

### Database Statistics
- **Total Tables:** 74+
- **Total Views:** 9
- **Total Functions:** 15+
- **Total Enums:** 10
- **RLS Policies:** Enabled on all tables

### Key Database Features
- **Row Level Security (RLS):** All tables secured with authentication-based policies
- **Auto-numbering:** Orders, POs, GRNs, Invoices, Receipts
- **Timestamp Triggers:** Auto-update `updated_at` columns
- **Foreign Key Constraints:** Maintain data integrity
- **Indexes:** Optimized for performance
- **Views:** Complex queries for reporting

### Storage Buckets
1. **avatars** (5MB) - User/Employee avatars
2. **company-assets** (10MB) - Product images, logos
3. **order-images** (10MB) - Order reference images
4. **order-attachments** (20MB) - Order documents
5. **order-mockups** (10MB) - Design mockups
6. **fabric-images** (10MB) - Fabric catalog images

---

## User Roles & Permissions

### Available Roles
1. **Admin** - Full system access
2. **Production Manager** - Production operations
3. **Cutting Master** - Cutting operations
4. **QC Manager** - Quality control
5. **Sales Manager** - Sales and orders
6. **Inventory Manager** - Inventory and warehouse
7. **Accounts Manager** - Financial operations
8. **HR Manager** - People management
9. **Procurement Manager** - Purchase and procurement
10. **Design Manager** - Design operations

### Permission System
- Role-based access control (RBAC)
- Granular sidebar menu permissions
- Page-level access control
- Feature-level permissions
- Admin bypass for full access

---

## Key Features & Capabilities

### 1. Multi-Supplier Purchase Orders
- Select items from BOM
- Assign different suppliers per item
- Create multiple POs in one workflow
- Track item assignment status
- Prevent duplicate selections

### 2. Advanced Image Management
- Automatic image compression (reduces 4-7MB to 500KB-1.5MB)
- Nested folder structure support
- Image organization by product/color
- Folder upload capability
- Image URL management
- Table and card views

### 3. Batch Assignment System
- Distribute order quantities to tailor batches
- Size-wise quantity distribution
- Batch leader assignment
- Stitching rate assignment (SN/OF rates)
- PDF generation for batch assignments
- Earnings calculation per batch

### 4. Warehouse Hierarchy
- Multi-level warehouse structure
- Bin-level inventory tracking
- Zone-based management (Receiving, Storage, Dispatch)
- Inventory movement tracking
- Real-time stock updates

### 5. Fabric Inventory Tracking
- Separate fabric stock management
- Color and GSM variant tracking
- Fabric picking records
- Fabric usage tracking
- GRN-based fabric inventory updates

### 6. GST Handling
- Multiple GST rates per order
- GST breakdown by rate
- GST calculations in quotations and invoices
- GST rate configuration per product

### 7. Bulk Operations
- Bulk product upload (CSV/Excel)
- Bulk customer upload
- Batch delete operations
- Export to CSV/Excel

### 8. PDF Generation
- Quotation PDF export
- Invoice PDF export
- Purchase Order PDF export
- GRN PDF export
- Dispatch Challan PDF export
- Batch Assignment Sheet PDF
- Customizable print settings

### 9. Real-time Updates
- Live order status updates
- Real-time inventory tracking
- Instant notification system
- WebSocket connections for updates

### 10. Advanced Filtering & Search
- Multi-criteria filtering
- Global search functionality
- Category-based filtering
- Status-based filtering
- Date range filtering

---

## Technical Highlights

### Performance Optimizations
- Image lazy loading
- Image compression
- Code splitting
- React Query for caching
- Optimized database queries
- Indexed database columns

### Security Features
- Row Level Security (RLS)
- Authentication-based access
- Role-based permissions
- Secure file uploads
- Data validation (Zod schemas)
- SQL injection prevention

### User Experience
- Responsive design (mobile, tablet, desktop)
- Dark/light theme support
- Intuitive navigation
- Toast notifications
- Loading states
- Error handling
- Form persistence
- Auto-save capabilities

### Integration Capabilities
- Supabase backend integration
- Cloud storage integration
- Email integration (planned)
- Barcode scanner support (planned)
- API-ready architecture

---

## Future Enhancements (Planned)

### Barcode System
- Automatic barcode generation (Code 128 format)
- Barcode scanning support
- Filter products by Category/Name/Class
- PDF barcode label generation
- Thermal printer support
- Customizable label sizes and margins
- Label information: Class, Size, Product Name, Color, Barcode

### Additional Features
- Mobile app support
- Advanced analytics dashboard
- Email notifications
- SMS integration
- Multi-warehouse support
- Advanced reporting
- API development
- Third-party integrations

---

## Application Statistics

### Codebase
- **Total Components:** 100+ React components
- **Total Pages:** 40+ pages
- **Total Routes:** 60+ routes
- **Lines of Code:** 50,000+ lines
- **Database Objects:** 98+ objects

### Features Count
- **Master Data Modules:** 10+
- **Business Process Modules:** 12+
- **User Management Modules:** 3+
- **Reporting Modules:** 5+
- **Configuration Modules:** 2+

---

## Deployment & Infrastructure

### Current Setup
- **Frontend Hosting:** Cloud-based (Vite build)
- **Backend:** Supabase (PostgreSQL + Storage + Auth)
- **CDN:** Supabase CDN for assets
- **Database:** PostgreSQL with real-time capabilities

### Scalability
- Cloud-native architecture
- Horizontal scaling support
- Database optimization
- Caching strategies
- Load balancing ready

---

## Support & Documentation

### Available Documentation
- Complete database schema documentation
- Migration guides
- Setup instructions
- Feature guides
- API documentation (in progress)

### Support Channels
- In-app error handling
- Console logging for debugging
- Database migration scripts
- Configuration guides

---

## Conclusion

Fabric Flow ERP is a comprehensive, modern ERP solution specifically designed for apparel and textile manufacturing companies. It covers the complete business cycle from customer management through production to financial accounting. The system is built with scalability, security, and user experience in mind, utilizing modern web technologies and cloud infrastructure.

The application provides real-time visibility into operations, streamlines workflows, and enables data-driven decision-making. With its modular architecture, it can be extended and customized to meet specific business requirements.

---

**Contact Information:**
For technical support or feature requests, please refer to the development team or documentation.

**Version:** 2.0  
**Last Updated:** January 2025

å