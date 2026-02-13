# Sidebar Permissions System Setup Guide

This guide will help you set up and configure the employee sidebar access system in the Fabric Flow ERP.

## Overview

The sidebar permissions system provides role-based access control for the sidebar navigation. It allows you to:
- Define which sidebar items each role can access
- Override permissions for individual users
- Dynamically show/hide sidebar items based on user permissions

## System Components

### 1. Database Tables
- `sidebar_items` - Defines all available sidebar items
- `roles` - System roles (Admin, Production Manager, etc.)
- `user_roles` - Links users to roles
- `role_sidebar_permissions` - Role-based sidebar permissions
- `user_sidebar_permissions` - Individual user permission overrides

### 2. React Components
- `useSidebarPermissions` hook - Fetches and manages sidebar permissions
- `ErpSidebar` - Main sidebar component with permission-based rendering
- `EmployeeAccessManagement` - Admin interface for managing user permissions
- `SidebarPermissionsTest` - Testing component for troubleshooting

## Setup Steps

### Step 1: Run Database Setup

1. **Execute the SQL script:**
   ```bash
   # Option 1: Run the shell script
   ./setup_sidebar_permissions.sh
   
   # Option 2: Run SQL directly
   psql -h localhost -U postgres -d fabric_flow_erp -f fix_sidebar_permissions_system.sql
   ```

2. **Verify tables were created:**
   - Check that all required tables exist
   - Verify that sidebar items were inserted
   - Confirm that admin role permissions were created

### Step 2: Test the System

1. **Access the test component:**
   - Navigate to the Database Test page
   - Click "Run Tests" to verify the system
   - Check that all tests pass

2. **Setup admin permissions:**
   - Click "Setup Admin Permissions" to grant all access to admin role
   - Click "Assign Admin Role" to assign admin role to current user

### Step 3: Configure User Roles

1. **Assign roles to users:**
   - Go to People > Employee Access Management
   - Select an employee
   - Assign appropriate roles
   - Customize individual permissions if needed

2. **Test user access:**
   - Login as different users
   - Verify that sidebar shows only permitted items
   - Check that permissions work correctly

## Troubleshooting

### Common Issues

1. **"No sidebar permissions found"**
   - Run the database setup script
   - Check that user has assigned roles
   - Verify that role permissions exist

2. **"Table missing" errors**
   - Ensure all migrations have been run
   - Check database connection
   - Verify table names and permissions

3. **Sidebar not updating**
   - Clear browser cache
   - Check console for errors
   - Verify user permissions in database

### Debug Steps

1. **Check database tables:**
   ```sql
   SELECT COUNT(*) FROM sidebar_items;
   SELECT COUNT(*) FROM roles;
   SELECT COUNT(*) FROM role_sidebar_permissions;
   SELECT COUNT(*) FROM user_roles;
   ```

2. **Verify user permissions:**
   ```sql
   SELECT * FROM get_user_sidebar_permissions('user-id-here');
   ```

3. **Check console logs:**
   - Open browser developer tools
   - Look for sidebar permission debug messages
   - Check for any error messages

## Configuration

### Adding New Sidebar Items

1. **Insert into sidebar_items table:**
   ```sql
   INSERT INTO sidebar_items (title, url, icon, sort_order) 
   VALUES ('New Item', '/new-item', 'IconName', 100);
   ```

2. **Grant permissions to roles:**
   ```sql
   INSERT INTO role_sidebar_permissions (role_id, sidebar_item_id, can_view, can_edit)
   SELECT r.id, si.id, true, false
   FROM roles r, sidebar_items si
   WHERE r.name = 'Admin' AND si.title = 'New Item';
   ```

### Customizing Permissions

1. **Role-based permissions:**
   - Modify `role_sidebar_permissions` table
   - Update permissions for specific roles

2. **User-specific overrides:**
   - Use `user_sidebar_permissions` table
   - Override role permissions for specific users

## Security Considerations

1. **Row Level Security (RLS):**
   - All tables have RLS enabled
   - Users can only see their own permissions
   - Admins can manage all permissions

2. **Permission Hierarchy:**
   - User permissions override role permissions
   - More restrictive permissions take precedence
   - Admin role has full access by default

## Maintenance

### Regular Tasks

1. **Audit permissions:**
   - Review user permissions regularly
   - Remove unused permissions
   - Update role assignments as needed

2. **Monitor performance:**
   - Check query performance
   - Optimize permission lookups
   - Monitor database usage

3. **Update sidebar items:**
   - Add new features to sidebar
   - Remove deprecated items
   - Update permissions accordingly

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review console logs for errors
3. Verify database setup and permissions
4. Test with the SidebarPermissionsTest component
5. Contact system administrator if needed

## API Reference

### useSidebarPermissions Hook

```typescript
const { items, loading, error, refetch } = useSidebarPermissions();
```

- `items`: Array of sidebar items user can access
- `loading`: Boolean indicating if permissions are being fetched
- `error`: Error message if fetch failed
- `refetch`: Function to manually refresh permissions

### Database Functions

- `get_user_sidebar_permissions(user_id)`: Returns effective permissions for a user
- `recalc_order_status(order_id)`: Updates order status based on related data

This system provides a robust, scalable solution for managing sidebar access in your ERP system.
