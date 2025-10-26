# Multi-Supplier Purchase Order Setup

## Database Migration Required

Before using the multi-supplier purchase order feature, you need to run the database migration:

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `supabase/migrations/20250108000002_create_bom_po_tracking.sql`
4. Run the SQL script

### Option 2: Using Supabase CLI (if Docker is running)

```bash
cd supabase
npx supabase db reset
```

## Features Implemented

### 1. Multi-Step Wizard
- **Step 1**: Select BOM items with visual status indicators
- **Step 2**: Assign suppliers and quantities with splitting capability
- **Step 3**: Review and create multiple purchase orders

### 2. Status Tracking
- Real-time tracking of which BOM items have been ordered
- Progress indicators showing completion percentage
- Visual badges for status (Not Started, In Progress, Complete)

### 3. Quantity Splitting
- Split quantities across multiple suppliers
- Validation to prevent over-ordering
- Running totals per supplier

### 4. Batch PO Creation
- Create multiple POs in one transaction
- Automatic tracking of BOM-PO relationships
- Error handling with rollback

## Usage

1. Go to BOM Management page
2. Click "Multi-Supplier PO" button on any BOM
3. Follow the 3-step wizard:
   - Select items to order
   - Assign suppliers and quantities
   - Review and create POs

## Database Schema

### New Tables
- `bom_po_items`: Tracks which BOM items are in which POs
- `bom_item_order_status`: View for easy status checking

### Key Features
- Prevents duplicate ordering
- Tracks remaining quantities
- Supports partial ordering
- Maintains audit trail

## Components Created

- `BomToPOWizard`: Main wizard container
- `BomItemSelectionStep`: Step 1 - Item selection
- `SupplierAssignmentStep`: Step 2 - Supplier assignment
- `POReviewStep`: Step 3 - Review and creation
- `BomToPOWizardDialog`: Dialog wrapper
- Status indicator components
- BOM-PO tracking service

## Testing

After running the migration, test the complete flow:

1. Create a BOM with multiple items
2. Use the multi-supplier wizard to create POs
3. Verify status updates in BOM list
4. Create additional POs for remaining items
5. Check that quantities are properly tracked
