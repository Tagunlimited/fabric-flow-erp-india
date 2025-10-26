# Employee Permissions Fix Summary

## Problem Identified
The employee was seeing all sidebar options instead of just the "Orders" option because of two critical issues:

### 1. **Role Permissions Error**
```
Error fetching role permissions: 
Object { code: "22P02", details: null, hint: null, message: 'invalid input syntax for type uuid: "employee"' }
```

**Root Cause:** The system was trying to fetch role permissions using `"employee"` as a UUID, but it should use the role ID from the `roles` table.

### 2. **React Hooks Error**
```
Uncaught Error: Rendered more hooks than during the previous render.
```

**Root Cause:** The `useEffect` hook was being called after a conditional return statement, violating the Rules of Hooks.

## Fixes Applied

### Fix 1: Role Permissions Query
**File:** `src/hooks/useSidebarPermissions.ts`

**Before:**
```typescript
const { data: rolePermissions, error: rolePermsError } = await supabase
  .from('role_sidebar_permissions')
  .select(`*`)
  .eq('role_id', (profile as any)?.role); // ❌ Using role name as UUID
```

**After:**
```typescript
// First, get the role ID from the roles table
const { data: roleData, error: roleError } = await supabase
  .from('roles')
  .select('id')
  .eq('name', (profile as any).role)
  .single();

if (roleData && !roleError) {
  const { data: rolePerms, error: rolePermsErr } = await supabase
    .from('role_sidebar_permissions')
    .select(`*`)
    .eq('role_id', (roleData as any).id); // ✅ Using actual role ID
}
```

### Fix 2: React Hooks Order
**File:** `src/components/ErpLayout.tsx`

**Before:**
```typescript
// ❌ Conditional return before hooks
if (companySettingsLoading) {
  return <LoadingComponent />;
}

useEffect(() => { // ❌ Hook after conditional return
  // ...
}, []);
```

**After:**
```typescript
// ✅ All hooks first
useEffect(() => {
  // ...
}, []);

// ✅ Conditional return after all hooks
if (companySettingsLoading) {
  return <LoadingComponent />;
}
```

## Expected Results

### Before Fix:
- ❌ `permissionsLoading: false`
- ❌ `permissionsSetup: false`
- ❌ `dynamicSidebarItemsLength: 0`
- ❌ `shouldUseDynamicItems: false`
- ❌ `finalSidebarItemsLength: 14` (all items)

### After Fix:
- ✅ `permissionsLoading: false`
- ✅ `permissionsSetup: true`
- ✅ `dynamicSidebarItemsLength: 1` (just Orders)
- ✅ `shouldUseDynamicItems: true`
- ✅ `finalSidebarItemsLength: 1` (just Orders)

## Testing

1. **Log in as the employee** (`abhishek@mailinator.com`)
2. **Check console logs** - should see:
   - No more role permissions errors
   - `permissionsSetup: true`
   - `dynamicSidebarItemsLength: 1`
   - `shouldUseDynamicItems: true`
3. **Check sidebar** - should only show "Orders" option
4. **No more React hooks errors**

## Database Verification

The employee should have these permissions in the database:
```sql
SELECT 
  usp.user_id,
  usp.can_view,
  si.title
FROM user_sidebar_permissions usp
JOIN sidebar_items si ON usp.sidebar_item_id = si.id
WHERE usp.user_id = '8b18627d-0151-48c5-96d7-34d837c12137';
```

Expected result:
- `can_view: true`
- `title: "Orders"`

## Files Modified

- `src/hooks/useSidebarPermissions.ts` - Fixed role permissions query
- `src/components/ErpLayout.tsx` - Fixed React hooks order

The employee should now see only the "Orders" option in their sidebar instead of all options!
