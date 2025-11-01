# Invoice System Enhancement Plan

## Overview

Update the invoice system to follow the same format as the Purchase Order system, including:
- Same UI/UX structure and layout
- Price and amount fields with GST calculations
- Item management similar to PO items
- Print/PDF functionality matching PO format

## Current State Analysis

### ✅ **Existing Invoice Structure:**
- **Tables**: `invoices` and `invoice_items` tables exist
- **Pages**: `InvoicePage.tsx` and `InvoiceDetailPage.tsx` exist
- **Basic functionality**: Invoice creation and display

### ❌ **Missing Features (compared to PO):**
- Price fields (`unit_price`, `total_price`)
- GST calculation fields (`gst_rate`, `gst_amount`)
- Item attributes and fabric details
- Comprehensive item management
- Print/PDF with same format as PO

## Implementation Plan

### Phase 1: Database Schema Updates

#### 1.1 Update `invoice_items` Table
Add missing fields to match `purchase_order_items`:

```sql
-- Add price and GST fields to invoice_items
ALTER TABLE invoice_items 
ADD COLUMN IF NOT EXISTS unit_price DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_price DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS gst_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) DEFAULT 'product',
ADD COLUMN IF NOT EXISTS item_image_url TEXT,
ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(20) DEFAULT 'pcs',
ADD COLUMN IF NOT EXISTS remarks TEXT,
ADD COLUMN IF NOT EXISTS attributes JSONB,
-- Fabric-specific fields
ADD COLUMN IF NOT EXISTS fabric_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS fabric_color VARCHAR(100),
ADD COLUMN IF NOT EXISTS fabric_gsm VARCHAR(50),
ADD COLUMN IF NOT EXISTS item_category VARCHAR(255);
```

#### 1.2 Update `invoices` Table
Add missing fields to match `purchase_orders`:

```sql
-- Add missing fields to invoices table
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS invoice_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS due_date DATE,
ADD COLUMN IF NOT EXISTS delivery_address TEXT,
ADD COLUMN IF NOT EXISTS terms_conditions TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS created_by UUID,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
```

### Phase 2: Frontend Components

#### 2.1 Create `InvoiceForm.tsx`
Replicate `PurchaseOrderForm.tsx` structure:

**Key Features:**
- Same layout and UI components as PO form
- Item management with price fields
- GST calculation
- Print/PDF functionality
- Company settings integration

**Fields to Include:**
- Invoice number (auto-generated)
- Customer selection
- Invoice date
- Due date
- Delivery address
- Terms & conditions
- Item table with:
  - Item type (fabric/item/product)
  - Item selection with images
  - Quantity
  - Unit price
  - Total price
  - GST rate
  - GST amount
  - Remarks

#### 2.2 Update `InvoiceDetailPage.tsx`
Enhance to match PO detail page:

**Features:**
- Same print layout as PO
- Price and GST display
- Item details with images
- Company branding
- Action buttons (Print, PDF, Email)

#### 2.3 Create `InvoiceList.tsx`
Replicate `PurchaseOrderList.tsx`:

**Features:**
- Same table structure
- Status badges
- Action buttons
- Search and filters
- Bulk operations

### Phase 3: Business Logic

#### 3.1 GST Calculation
Implement same GST logic as PO:

```typescript
// GST calculation function
const calculateGST = (subtotal: number, gstRate: number) => {
  const gstAmount = (subtotal * gstRate) / 100;
  const totalAmount = subtotal + gstAmount;
  return { gstAmount, totalAmount };
};
```

#### 3.2 Invoice Number Generation
Auto-generate invoice numbers:

```typescript
const generateInvoiceNumber = async () => {
  const { data } = await supabase
    .from('invoices')
    .select('invoice_number')
    .order('created_at', { ascending: false })
    .limit(1);
  
  const lastNumber = data?.[0]?.invoice_number || 'INV-0000';
  const nextNumber = parseInt(lastNumber.split('-')[1]) + 1;
  return `INV-${nextNumber.toString().padStart(4, '0')}`;
};
```

#### 3.3 Item Management
Replicate PO item management:

- Item type selection (fabric/item/product)
- Dynamic item loading based on type
- Image display
- Quantity and price calculations
- GST per item

### Phase 4: Print/PDF Functionality

#### 4.1 Print Layout
Match PO print format:

**Header:**
- Company logo and details
- Invoice number and date
- Customer details

**Items Table:**
- Item details with images
- Quantities and prices
- GST breakdown
- Totals

**Footer:**
- Terms and conditions
- Company signature

#### 4.2 PDF Generation
Use same `jsPDF` and `html2canvas` approach as PO:

```typescript
const generatePDF = async () => {
  const canvas = await html2canvas(printRef.current!);
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
  pdf.addImage(imgData, 'PNG', 0, 0, 210, 297);
  pdf.save(`invoice-${invoiceNumber}.pdf`);
};
```

### Phase 5: Integration Points

#### 5.1 Order to Invoice
Enhance order-to-invoice flow:

- Pre-populate invoice with order items
- Include order-specific pricing
- Maintain order reference

#### 5.2 Customer Management
Integrate with customer system:

- Customer selection dropdown
- Auto-fill customer details
- Address management

#### 5.3 Company Settings
Use same company settings as PO:

- Logo display
- Company details
- GST settings
- Terms and conditions

## File Structure

```
src/
├── components/
│   └── invoices/
│       ├── InvoiceForm.tsx          # Main invoice form
│       ├── InvoiceList.tsx          # Invoice listing
│       ├── InvoiceDetailPage.tsx    # Invoice detail view
│       └── InvoicePrintView.tsx     # Print layout
├── pages/
│   └── accounts/
│       ├── InvoicePage.tsx          # Updated invoice page
│       └── InvoiceDetailPage.tsx    # Enhanced detail page
└── hooks/
    └── useInvoiceForm.ts            # Invoice form logic
```

## Database Migration

```sql
-- Migration: Update invoice system to match PO format
-- File: update_invoice_system_to_match_po.sql

-- 1. Update invoice_items table
ALTER TABLE invoice_items 
ADD COLUMN IF NOT EXISTS unit_price DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_price DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS gst_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) DEFAULT 'product',
ADD COLUMN IF NOT EXISTS item_image_url TEXT,
ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(20) DEFAULT 'pcs',
ADD COLUMN IF NOT EXISTS remarks TEXT,
ADD COLUMN IF NOT EXISTS attributes JSONB,
ADD COLUMN IF NOT EXISTS fabric_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS fabric_color VARCHAR(100),
ADD COLUMN IF NOT EXISTS fabric_gsm VARCHAR(50),
ADD COLUMN IF NOT EXISTS item_category VARCHAR(255);

-- 2. Update invoices table
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS invoice_date DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS due_date DATE,
ADD COLUMN IF NOT EXISTS delivery_address TEXT,
ADD COLUMN IF NOT EXISTS terms_conditions TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS created_by UUID,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_item_type ON invoice_items(item_type);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON invoices(invoice_date);

-- 4. Update existing records
UPDATE invoice_items 
SET unit_price = COALESCE(unit_price, 0),
    total_price = COALESCE(total_price, 0),
    gst_rate = COALESCE(gst_rate, 0),
    gst_amount = COALESCE(gst_amount, 0),
    item_type = COALESCE(item_type, 'product'),
    unit_of_measure = COALESCE(unit_of_measure, 'pcs');

UPDATE invoices 
SET invoice_date = COALESCE(invoice_date, CURRENT_DATE),
    status = COALESCE(status, 'draft'),
    updated_at = NOW();
```

## Testing Plan

### Unit Tests
- [ ] Invoice form validation
- [ ] GST calculation accuracy
- [ ] Invoice number generation
- [ ] Item management functionality

### Integration Tests
- [ ] Order to invoice flow
- [ ] Customer integration
- [ ] Company settings integration
- [ ] Print/PDF generation

### User Acceptance Tests
- [ ] Invoice creation workflow
- [ ] Print layout matches PO format
- [ ] GST calculations are correct
- [ ] All fields display properly

## Success Criteria

- ✅ Invoice form matches PO form structure and functionality
- ✅ Price and GST calculations work correctly
- ✅ Print/PDF output matches PO format
- ✅ Item management includes all PO features
- ✅ Integration with existing systems works
- ✅ Performance is comparable to PO system

## Timeline

- **Phase 1**: Database updates (1 day)
- **Phase 2**: Frontend components (3 days)
- **Phase 3**: Business logic (2 days)
- **Phase 4**: Print/PDF (1 day)
- **Phase 5**: Integration (1 day)
- **Testing**: (2 days)

**Total**: ~10 days

This plan ensures the invoice system will have the same professional format and functionality as the Purchase Order system, with proper price management and GST calculations.
