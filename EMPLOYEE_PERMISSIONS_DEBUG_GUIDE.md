# Employee Permissions Debug Guide

## Problem
Employee is seeing all sidebar options instead of just the "Orders" option you granted them.

## Debugging Steps

### Step 1: Check Console Logs
1. **Open browser console** (F12) while logged in as the employee
2. **Look for these debug messages:**
   - `🔍 Sidebar permissions debug:` - Shows permission data
   - `📊 Permission details:` - Shows counts and details
   - `👤 User-specific permissions:` - Shows what the employee can access
   - `🔍 Sidebar decision debug:` - Shows which sidebar is being used

### Step 2: Use the Debug Button
1. **As admin**, go to "User & Roles" → "Employee Access"
2. **Click "Manage Sidebar Permissions"** for the employee
3. **Click "Debug Permissions"** button
4. **Check console** for detailed permission data

### Step 3: Check Database Directly
1. **Run the SQL script** `debug_employee_permissions.sql` in Supabase SQL editor
2. **Replace placeholders** with actual employee email/user ID
3. **Check if permissions exist** in the database

## Common Issues & Solutions

### Issue 1: No Permissions in Database
**Symptoms:** Console shows "User permissions count: 0"
**Solution:**
1. Make sure you granted permissions in the UI
2. Check if the permissions were actually saved
3. Use the "Debug Permissions" button to verify

### Issue 2: Permissions Exist But Not Applied
**Symptoms:** Console shows permissions but employee sees all options
**Solution:**
1. Check if `permissionsSetup` is `true` in console
2. Check if `shouldUseDynamicItems` is `true`
3. Verify the employee's role is not 'admin'

### Issue 3: Fallback to Static Sidebar
**Symptoms:** Console shows "shouldUseDynamicItems: false"
**Solution:**
1. Check if `permissionsLoading` is `false`
2. Check if `permissionsSetup` is `true`
3. Check if `dynamicSidebarItemsLength` > 0

### Issue 4: Wrong Role Detection
**Symptoms:** Console shows wrong role or no role
**Solution:**
1. Check employee's profile in database
2. Verify role is set to 'employee'
3. Check if profile exists and is active

## Expected Console Output

### For Employee with Orders Permission:
```
🔍 Sidebar permissions debug: {
  userRole: "employee",
  permissionsLoading: false,
  permissionsSetup: true,
  dynamicSidebarItemsLength: 1,
  shouldUseDynamicItems: true,
  finalSidebarItemsLength: 1
}

📊 Permission details:
- User permissions count: 1
- Role permissions count: 0
- Effective permissions count: 1
- Root items count: 1

👤 User-specific permissions: [
  {
    item: "Orders",
    can_view: true,
    can_edit: false
  }
]
```

### For Employee with No Permissions:
```
🔍 Sidebar permissions debug: {
  userRole: "employee",
  permissionsLoading: false,
  permissionsSetup: true,
  dynamicSidebarItemsLength: 0,
  shouldUseDynamicItems: true,
  finalSidebarItemsLength: 0
}

📊 Permission details:
- User permissions count: 0
- Role permissions count: 0
- Effective permissions count: 0
- Root items count: 0
```

## Quick Fixes

### Fix 1: Grant Permissions Again
1. Go to "Manage Sidebar Permissions" for the employee
2. Check the "Orders" checkbox
3. Click "Save Changes"
4. Check console for confirmation

### Fix 2: Force Refresh
1. Log out the employee
2. Log them back in
3. Check if permissions are now applied

### Fix 3: Check Database
1. Run the debug SQL script
2. Verify permissions exist in `user_sidebar_permissions` table
3. Check if `can_view` is `true` for Orders

### Fix 4: Reset Permissions
1. Delete all permissions for the employee
2. Grant only the Orders permission
3. Test again

## Database Queries

### Check Employee Profile:
```sql
SELECT * FROM profiles WHERE email = 'employee@example.com';
```

### Check Employee Permissions:
```sql
SELECT 
  usp.*,
  si.title,
  si.url
FROM user_sidebar_permissions usp
JOIN sidebar_items si ON usp.sidebar_item_id = si.id
WHERE usp.user_id = 'EMPLOYEE_USER_ID';
```

### Check All Sidebar Items:
```sql
SELECT * FROM sidebar_items WHERE is_active = true ORDER BY sort_order;
```

## Files Modified for Debugging

- `src/hooks/useSidebarPermissions.ts` - Added comprehensive debugging
- `src/components/ErpSidebar.tsx` - Added sidebar decision debugging
- `src/components/admin/EmployeeAccessManagement.tsx` - Added debug button
- `debug_employee_permissions.sql` - SQL script for database debugging

## Next Steps

1. **Run the debugging steps above**
2. **Check the console output**
3. **Identify which issue you're facing**
4. **Apply the appropriate fix**
5. **Test with the employee account**

The enhanced debugging will show you exactly what's happening and why the employee is seeing all options instead of just the granted permissions.
