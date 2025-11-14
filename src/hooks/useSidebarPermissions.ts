import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';

export interface SidebarItem {
  id: string;
  title: string;
  url?: string;
  icon: string;
  parent_id?: string;
  sort_order: number;
  can_view: boolean;
  can_edit: boolean;
  children?: SidebarItem[];
}

export interface SidebarPermissions {
  items: SidebarItem[];
  loading: boolean;
  error: string | null;
  permissionsSetup: boolean; // Whether permissions system is properly set up
}

export function useSidebarPermissions() {
  const [permissions, setPermissions] = useState<SidebarPermissions>({
    items: [],
    loading: true,
    error: null,
    permissionsSetup: false
  });
  
  const { user } = useAuth();

  const fetchUserSidebarPermissions = async () => {
    if (!user) {
      setPermissions({ items: [], loading: false, error: 'No user', permissionsSetup: false });
      return;
    }

    try {
      setPermissions(prev => ({ ...prev, loading: true, error: null }));

      // Get user's profile to determine their role
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id as any)
        .single();

      if (profileError) {
        console.error('Error fetching user profile:', profileError);
        setPermissions(prev => ({ 
          ...prev, 
          loading: false, 
          error: 'Failed to fetch user profile',
          permissionsSetup: false
        }));
        return;
      }

      // If user is admin, bypass all permission checks and return empty array
      // The sidebar will use static items for admin users
      if ((profile as any)?.role === 'admin') {
        console.log('👑 Admin user - bypassing permission system');
        setPermissions({
          items: [],
          loading: false,
          error: null,
          permissionsSetup: true
        });
        return;
      }

      // Get user-specific sidebar permissions (overrides)
      const { data: userPermissions, error: userPermsError } = await supabase
        .from('user_sidebar_permissions')
        .select(`
          *,
          sidebar_item:sidebar_items(*)
        `)
        .eq('user_id', user.id as any)
        .eq('is_override', true as any);

      if (userPermsError) {
        console.error('Error fetching user permissions:', userPermsError);
        setPermissions(prev => ({ 
          ...prev, 
          loading: false, 
          error: 'Failed to fetch user permissions',
          permissionsSetup: false
        }));
        return;
      }

      // Check if user has any explicit user-specific permissions (overrides)
      const hasUserOverrides = userPermissions && userPermissions.length > 0;

      // If user has explicit overrides, ONLY use those (ignore role permissions)
      // This ensures that when admin grants specific permissions, only those are shown
      let effectivePermissions = new Map();
      
      if (hasUserOverrides) {
        // User has explicit permissions - ONLY show those, ignore role permissions
        console.log('User has explicit permissions - using only user-specific permissions');
        console.log('User permissions count:', userPermissions?.length);
        (userPermissions as any)?.forEach((perm: any) => {
          if (perm.sidebar_item && perm.can_view) {
            console.log('Adding permission:', perm.sidebar_item.title, perm.sidebar_item.url, 'Parent:', perm.sidebar_item.parent_id);
            effectivePermissions.set(perm.sidebar_item.id, {
              ...perm.sidebar_item,
              can_view: perm.can_view,
              can_edit: perm.can_edit,
              permission_source: 'user'
            });
          }
        });
        console.log('Effective permissions after user overrides:', effectivePermissions.size);
      } else {
        // No user overrides - use role-based permissions
        // Get role-based sidebar permissions
        // First, get the role ID from the roles table
        let rolePermissions = null;
        let rolePermsError = null;
        
        if ((profile as any)?.role) {
          const { data: roleData, error: roleError } = await supabase
            .from('roles')
            .select('id')
            .eq('name', (profile as any).role)
            .single();
            
          if (roleData && !roleError) {
            const { data: rolePerms, error: rolePermsErr } = await supabase
              .from('role_sidebar_permissions')
              .select(`
                *,
                sidebar_item:sidebar_items(*)
              `)
              .eq('role_id', (roleData as any).id as any);
              
            rolePermissions = rolePerms;
            rolePermsError = rolePermsErr;
          } else {
            console.log('No role found for:', (profile as any).role);
            // If no role found, just continue without role permissions
            rolePermissions = [];
            rolePermsError = null;
          }
        } else {
          rolePermissions = [];
          rolePermsError = null;
        }

        if (rolePermsError) {
          console.error('Error fetching role permissions:', rolePermsError);
          setPermissions(prev => ({ 
            ...prev, 
            loading: false, 
            error: 'Failed to fetch role permissions',
            permissionsSetup: false
          }));
          return;
        }

        // Use only role permissions
        (rolePermissions as any)?.forEach((perm: any) => {
          if (perm.sidebar_item && perm.can_view) {
            effectivePermissions.set(perm.sidebar_item.id, {
              ...perm.sidebar_item,
              can_view: perm.can_view,
              can_edit: perm.can_edit,
              permission_source: 'role'
            });
          }
        });
      }

      // If no permissions found, check if this is because no permissions are set up at all
      // or if the user simply has no access to any items
      if (effectivePermissions.size === 0) {
        // Check if there are any sidebar items in the database at all
        const { data: allSidebarItems, error: allItemsError } = await supabase
          .from('sidebar_items')
          .select('id')
          .eq('is_active', true as any)
          .limit(1);
        
        if (allItemsError) {
          console.error('Error checking sidebar items:', allItemsError);
          setPermissions(prev => ({ 
            ...prev, 
            loading: false, 
            error: 'Failed to check sidebar items',
            permissionsSetup: false
          }));
          return;
        }
        
        // If there are sidebar items but no permissions, this means the user has no access
        if (allSidebarItems && allSidebarItems.length > 0) {
          // For admin users, give them access to all sidebar items
          if ((profile as any)?.role === 'admin') {
            console.log('Admin user with no specific permissions - granting access to all items');
            
            // Get all sidebar items for admin
            const { data: allItems, error: allItemsErr } = await supabase
              .from('sidebar_items')
              .select('*')
              .eq('is_active', true as any)
              .order('sort_order');
              
            if (allItemsErr) {
              console.error('Error fetching all sidebar items for admin:', allItemsErr);
              setPermissions({
                items: [],
                loading: false,
                error: 'Failed to fetch sidebar items',
                permissionsSetup: true
              });
              return;
            }
            
            // Organize items into hierarchy for admin
            const itemsMap = new Map<string, SidebarItem>();
            const rootItems: SidebarItem[] = [];
            
            allItems?.forEach((item: any) => {
              itemsMap.set(item.id, { 
                ...item, 
                can_view: true,
                can_edit: true,
                children: [] 
              });
            });
            
            allItems?.forEach((item: any) => {
              if (item.parent_id) {
                const parent = itemsMap.get(item.parent_id);
                if (parent) {
                  parent.children?.push(itemsMap.get(item.id)!);
                }
              } else {
                rootItems.push(itemsMap.get(item.id)!);
              }
            });
            
            // Sort items by sort_order
            const sortItems = (items: SidebarItem[]): SidebarItem[] => {
              return items
                .sort((a, b) => a.sort_order - b.sort_order)
                .map(item => ({
                  ...item,
                  children: item.children ? sortItems(item.children) : []
                }));
            };
            
            setPermissions({
              items: sortItems(rootItems),
              loading: false,
              error: null,
              permissionsSetup: true
            });
            return;
          } else {
            console.log('Non-admin user has no sidebar permissions - showing empty sidebar');
            setPermissions({
              items: [],
              loading: false,
              error: null,
              permissionsSetup: true
            });
            return;
          }
        } else {
          // No sidebar items exist at all, fall back to static sidebar
          console.log('No sidebar items in database, falling back to static sidebar');
          setPermissions({
            items: [],
            loading: false,
            error: null,
            permissionsSetup: false
          });
          return;
        }
      }

      // Convert to array and organize into hierarchy - only include items with can_view = true
      const itemsMap = new Map<string, SidebarItem>();
      const rootItems: SidebarItem[] = [];
      
      // First pass: create items that have can_view = true
      effectivePermissions.forEach((item, id) => {
        if (item.can_view) {
          itemsMap.set(id, { 
            ...item, 
            children: [] 
          });
        }
      });
      
      // Second pass: ensure parent items are included even if they don't have explicit permissions
      // This is needed when a child has permission but parent doesn't have explicit permission
      effectivePermissions.forEach((item, id) => {
        if (item.can_view && item.parent_id) {
          // Check if parent exists in permissions
          const parentInPermissions = effectivePermissions.get(item.parent_id);
          if (!parentInPermissions || !parentInPermissions.can_view) {
            // Parent not in permissions, need to fetch it from sidebar_items
            // We'll handle this by ensuring parent is added to itemsMap
            // For now, we'll fetch all sidebar items to get parent details
          }
        }
      });
      
      // Fetch all sidebar items to get parent details for hierarchy
      const { data: allSidebarItems } = await supabase
        .from('sidebar_items')
        .select('*')
        .eq('is_active', true as any);
      
      // Third pass: add parent items to map if they're not already there but have children with permissions
      if (allSidebarItems) {
        allSidebarItems.forEach((parentItem: any) => {
          // Check if this parent has any children with permissions
          const hasChildWithPermission = Array.from(effectivePermissions.values()).some(
            (permItem: any) => permItem.parent_id === parentItem.id && permItem.can_view
          );
          
          if (hasChildWithPermission && !itemsMap.has(parentItem.id)) {
            // Add parent to map even if it doesn't have explicit permission
            itemsMap.set(parentItem.id, {
              ...parentItem,
              can_view: true, // Allow parent to be shown if it has children
              can_edit: false,
              children: []
            });
          }
        });
      }
      
      // Fourth pass: organize hierarchy for items that can be viewed
      effectivePermissions.forEach((item, id) => {
        if (item.can_view) {
          if (item.parent_id) {
            const parent = itemsMap.get(item.parent_id);
            if (parent) {
              parent.children?.push(itemsMap.get(id)!);
            } else {
              // Parent not in map, add as root for now
              rootItems.push(itemsMap.get(id)!);
            }
          } else {
            rootItems.push(itemsMap.get(id)!);
          }
        }
      });
      
      // Also add parent items that are in the map but not yet in rootItems
      itemsMap.forEach((item, id) => {
        if (!item.parent_id && !rootItems.find(r => r.id === id)) {
          rootItems.push(item);
        }
      });

      // Sort items by sort_order
      const sortItems = (items: SidebarItem[]): SidebarItem[] => {
        return items
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(item => ({
            ...item,
            children: item.children ? sortItems(item.children) : []
          }));
      };

      const finalItems = sortItems(rootItems);
      
      // Debug logging
      console.log('🔍 Sidebar permissions final result:', {
        userRole: (profile as any)?.role,
        userPermissionsCount: userPermissions?.length || 0,
        effectivePermissionsCount: effectivePermissions.size,
        itemsMapSize: itemsMap.size,
        rootItemsCount: rootItems.length,
        finalItemsCount: finalItems.length,
        finalItems: finalItems.map(item => ({ title: item.title, url: item.url, childrenCount: item.children?.length || 0 }))
      });

      setPermissions({
        items: finalItems,
        loading: false,
        error: null,
        permissionsSetup: true
      });

    } catch (error) {
      console.error('Error in useSidebarPermissions:', error);
      setPermissions(prev => ({ 
        ...prev, 
        loading: false, 
        error: 'An unexpected error occurred',
        permissionsSetup: false
      }));
    }
  };

  useEffect(() => {
    if (user?.id) {
      console.log('🔄 useSidebarPermissions useEffect triggered, user.id:', user?.id);
      fetchUserSidebarPermissions();
    }
  }, [user?.id]);

  return {
    ...permissions,
    refetch: fetchUserSidebarPermissions
  };
}
