# Database Relationship Fix - Remove Non-Existent Relationships

## Issue
The PDF generation was failing with this error:
```
Could not find a relationship between 'order_items' and 'branding_items' in the schema cache
```

## Root Cause
The code was trying to access `branding_items` and `order_item_addons` relationships that don't exist in the current database schema.

## Fix Applied
Removed non-existent relationships from database queries and simplified customizations handling.

### Files Modified:
1. **`src/pages/production/CuttingManagerPage.tsx`** - Lines 179-198, 237-241
2. **`src/components/production/DistributeQuantityDialog.tsx`** - Lines 181-200, 246-250

### Changes:
- Removed `branding_items (*)` and `order_item_addons (*)` from database queries
- Simplified customizations object to set branding and addons to `null`
- Kept `special_instructions` from order data

### Before:
```typescript
order_items (
  *,
  product_categories (...),
  fabrics (...),
  branding_items (*),        // ❌ Doesn't exist
  order_item_addons (*)      // ❌ Doesn't exist
)
```

### After:
```typescript
order_items (
  *,
  product_categories (...),
  fabrics (...)
)
```

## Result
✅ PDF generation should now work without database relationship errors
✅ Customizations section will show only special instructions (if any)
✅ All other data (order details, product info, fabric details) will work correctly

## Test
Try generating a PDF from the completed jobs tab - the relationship error should be resolved.
