# Fabric Table Column Names Fix

## Issue
The PDF generation was failing with this error:
```
column fabrics_2.fabric_name does not exist
```

## Root Cause
The code was trying to access `fabric_name` column in the `fabrics` table, but the actual column name is `name`. Also, the image column is `image_url`, not `image`.

## Database Schema Analysis
The `fabrics` table has these columns:
- `name` (not `fabric_name`)
- `color`
- `gsm`
- `image_url` (not `image`)

## Fix Applied
Updated all database queries to use the correct column names:

### Files Modified:
1. **`src/pages/production/CuttingManagerPage.tsx`** - Line 189-194
2. **`src/components/production/DistributeQuantityDialog.tsx`** - Line 191-196
3. **`src/utils/batchAssignmentPDF.ts`** - Line 187

### Changes:
- `fabric_name` → `name`
- `image` → `image_url`

### Before:
```typescript
fabrics (
  fabric_name,  // ❌ Wrong column name
  color,
  gsm,
  image        // ❌ Wrong column name
)
```

### After:
```typescript
fabrics (
  name,        // ✅ Correct column name
  color,
  gsm,
  image_url    // ✅ Correct column name
)
```

## Result
✅ PDF generation should now work without column name errors
✅ Fabric data will be properly fetched and displayed
✅ Fabric images will load correctly (if available)

## Test
Try generating a PDF from the completed jobs tab - the column name error should be resolved.
