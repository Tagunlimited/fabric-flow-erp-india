# Role-Based Access Control (RBAC) System

## Overview

This ERP system now includes a comprehensive role-based access control system that allows administrators to control which sidebar options each employee can see and access. The system supports both role-based permissions and individual user overrides.

## Features

### 1. **Dynamic Sidebar Permissions**
- Admins can assign specific sidebar options to different roles
- Individual users can have custom sidebar permissions that override their role permissions
- Real-time permission updates without requiring user logout/login

### 2. **Three-Tier Permission System**
- **Role Permissions**: Base permissions assigned to roles (Admin, Production Manager, Sales Manager, etc.)
- **User Overrides**: Individual user permissions that override role permissions
- **Effective Permissions**: Final permissions calculated by combining role and user permissions

### 3. **Admin Management Interface**
- Easy-to-use interface for managing role permissions
- User-specific permission overrides
- Visual indicators for permission sources (role vs override)

## Database Schema

### Tables Created

1. **`sidebar_items`** - Defines all available sidebar options
   - `id` (UUID, Primary Key)
   - `title` (Text) - Display name
   - `url` (Text, Optional) - Route path
   - `icon` (Text) - Lucide React icon name
   - `parent_id` (UUID, Optional) - For nested items
   - `sort_order` (Integer) - Display order
   - `is_active` (Boolean) - Enable/disable item

2. **`role_sidebar_permissions`** - Role-based permissions
   - `role_id` (UUID) - References roles table
   - `sidebar_item_id` (UUID) - References sidebar_items table
   - `can_view` (Boolean) - Can see the item
   - `can_edit` (Boolean) - Can modify the item

3. **`user_sidebar_permissions`** - User-specific overrides
   - `user_id` (UUID) - References auth.users
   - `sidebar_item_id` (UUID) - References sidebar_items table
   - `can_view` (Boolean) - Can see the item
   - `can_edit` (Boolean) - Can modify the item
   - `is_override` (Boolean) - Overrides role permissions

### Helper Function

**`get_user_sidebar_permissions(user_uuid)`** - Returns effective permissions for a user
- Combines role permissions and user overrides
- User overrides take precedence over role permissions
- Returns only items the user can view

## Setup Instructions

### 1. **Run Database Migration**

Execute the SQL script to create the permission system:

```sql
-- Run this in your Supabase SQL editor
\i create_sidebar_permissions_system.sql
```

### 2. **Verify Tables Created**

Check that the following tables exist:
- `sidebar_items`
- `role_sidebar_permissions`
- `user_sidebar_permissions`

### 3. **Access Admin Interface**

Navigate to: **User & Roles → Employee Access**

## Usage Guide

### For Administrators

#### **Managing Employee Access & Permissions**

1. Go to **User & Roles → Employee Access**
2. View all employees with their current access status
3. For employees with system access:
   - Click the **"Permissions"** button next to their name
   - A dialog opens showing all available sidebar options
   - Check/uncheck boxes to grant/revoke access
   - Changes are saved automatically
4. **Grant system access** to employees without accounts:
   - Click **"Grant Access"** to create user accounts
   - Set up login credentials and assign roles

#### **Managing Custom Permissions**

- In the permissions dialog, view current custom permissions
- Delete individual permissions using the trash icon
- All changes are applied immediately

### For Employees

#### **Accessing the System**

1. Log in with your credentials
2. The sidebar will automatically show only the options you have permission to access
3. If you don't see an option, contact your administrator

#### **Permission Sources**

- **Role-based**: Permissions inherited from your assigned role
- **Override**: Custom permissions set by administrator

## Default Role Permissions

### **Admin**
- ✅ Full access to all sidebar options
- ✅ Can manage all permissions

### **Production Manager**
- ✅ Dashboard, CRM, Orders, Accounts, Design & Printing
- ✅ Procurement, Inventory, Production, Quality Check
- ✅ People, Masters
- ❌ User & Roles, Configuration

### **Sales Manager**
- ✅ Dashboard, CRM, Orders, Accounts, Design & Printing
- ✅ People
- ❌ Procurement, Inventory, Production, Quality Check, Masters
- ❌ User & Roles, Configuration

### **Inventory Manager**
- ✅ Dashboard, Inventory, Procurement, Masters, People
- ❌ CRM, Orders, Accounts, Production, Quality Check
- ❌ User & Roles, Configuration

### **QC Manager**
- ✅ Dashboard, Quality Check, Production, People
- ❌ CRM, Orders, Accounts, Procurement, Inventory, Masters
- ❌ User & Roles, Configuration

## Technical Implementation

### **Frontend Components**

1. **`useSidebarPermissions` Hook**
   - Fetches user's effective permissions
   - Handles loading states and errors
   - Provides real-time permission updates

2. **`SidebarPermissionsManagement` Component**
   - Admin interface for managing permissions
   - Role and user permission management
   - Visual permission indicators

3. **Updated `ErpSidebar` Component**
   - Uses dynamic permissions instead of static role checks
   - Falls back to static permissions if dynamic system fails
   - Maintains backward compatibility

### **Backend Functions**

1. **`get_user_sidebar_permissions(user_uuid)`**
   - PostgreSQL function that calculates effective permissions
   - Combines role and user permissions
   - Returns hierarchical sidebar structure

### **Security Features**

1. **Row Level Security (RLS)**
   - All permission tables have RLS enabled
   - Users can only see their own permissions
   - Admins can manage all permissions

2. **Permission Validation**
   - Frontend validates permissions before rendering
   - Backend validates permissions on API calls
   - Graceful fallback for permission errors

## Troubleshooting

### **Common Issues**

1. **Sidebar not showing dynamic permissions**
   - Check if database migration was run successfully
   - Verify user has proper role assignments
   - Check browser console for errors

2. **Permission changes not taking effect**
   - Refresh the page after making changes
   - Check if user has proper role assignments
   - Verify RLS policies are correct

3. **Admin can't access permission management**
   - Ensure user has 'admin' role in profiles table
   - Check if user_sidebar_permissions table exists
   - Verify RLS policies allow admin access

### **Debug Steps**

1. **Check Database**
   ```sql
   -- Verify tables exist
   SELECT table_name FROM information_schema.tables 
   WHERE table_name IN ('sidebar_items', 'role_sidebar_permissions', 'user_sidebar_permissions');
   
   -- Check user permissions
   SELECT * FROM get_user_sidebar_permissions('user-uuid-here');
   ```

2. **Check Frontend**
   - Open browser developer tools
   - Check for JavaScript errors
   - Verify API calls are successful

3. **Check User Role**
   ```sql
   -- Verify user role
   SELECT role FROM profiles WHERE user_id = 'user-uuid-here';
   ```

## Best Practices

### **For Administrators**

1. **Start with Role Permissions**
   - Set up role-based permissions first
   - Use user overrides sparingly for special cases
   - Document any custom user permissions

2. **Regular Permission Audits**
   - Review permissions quarterly
   - Remove unused user overrides
   - Update role permissions as needed

3. **User Communication**
   - Inform users about permission changes
   - Provide training on new features
   - Document permission requirements

### **For Developers**

1. **Adding New Sidebar Items**
   - Add to `sidebar_items` table
   - Update default role permissions
   - Test with different user roles

2. **Permission Checks**
   - Always check permissions before rendering
   - Use the `useSidebarPermissions` hook
   - Implement proper error handling

## Migration from Static System

The new system is designed to be backward compatible:

1. **Existing users** will continue to see sidebar options based on their role
2. **New permission system** takes precedence when available
3. **Fallback mechanism** ensures system continues working if dynamic system fails

## Support

For technical support or questions about the RBAC system:

1. Check this documentation first
2. Review the troubleshooting section
3. Check database logs for errors
4. Contact the development team with specific error messages

---

**Last Updated**: January 2025  
**Version**: 1.0.0  
**Compatibility**: ERP System v1.0.0+
