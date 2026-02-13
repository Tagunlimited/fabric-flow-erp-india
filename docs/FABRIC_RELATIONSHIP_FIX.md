# Database Relationship Fix - fabric_master → fabrics

## Issue
The PDF generation was failing with this error:
```
Could not find a relationship between 'order_items' and 'fabric_master' in the schema cache
```

## Root Cause
The database schema uses `fabrics` as the table name, but the code was trying to access `fabric_master` relationship.

## Fix Applied
Updated all database queries to use the correct relationship name:

### Files Modified:
1. **`src/pages/production/CuttingManagerPage.tsx`** - Line 189
2. **`src/components/production/DistributeQuantityDialog.tsx`** - Line 191  
3. **`src/utils/batchAssignmentPDF.ts`** - Line 187

### Changes:
- `fabric_master` → `fabrics` in all database queries
- Updated PDF template to use `item.fabrics` instead of `item.fabric_master`

## Result
✅ PDF generation should now work without database relationship errors
✅ All fabric data will be properly fetched and displayed in PDFs

## Test
Try generating a PDF from the completed jobs tab - the error should be resolved.
