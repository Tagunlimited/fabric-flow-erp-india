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
}

export function useSidebarPermissions() {
  const [permissions, setPermissions] = useState<SidebarPermissions>({
    items: [],
    loading: true,
    error: null
  });
  
  const { user } = useAuth();

  const fetchUserSidebarPermissions = async () => {
    if (!user) {
      setPermissions({ items: [], loading: false, error: 'No user' });
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
          error: 'Failed to fetch user profile' 
        }));
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
        .eq('can_view', true as any);

      if (userPermsError) {
        console.error('Error fetching user permissions:', userPermsError);
        setPermissions(prev => ({ 
          ...prev, 
          loading: false, 
          error: 'Failed to fetch user permissions' 
        }));
        return;
      }

      // Get role-based sidebar permissions
      const { data: rolePermissions, error: rolePermsError } = await supabase
        .from('role_sidebar_permissions')
        .select(`
          *,
          sidebar_item:sidebar_items(*)
        `)
        .eq('role_id', (profile as any)?.role)
        .eq('can_view', true as any);

      if (rolePermsError) {
        console.error('Error fetching role permissions:', rolePermsError);
        setPermissions(prev => ({ 
          ...prev, 
          loading: false, 
          error: 'Failed to fetch role permissions' 
        }));
        return;
      }

      // Combine permissions: user overrides take precedence over role permissions
      const effectivePermissions = new Map();
      
      // First, add role permissions
      (rolePermissions as any)?.forEach((perm: any) => {
        if (perm.sidebar_item) {
          effectivePermissions.set(perm.sidebar_item.id, {
            ...perm.sidebar_item,
            can_view: perm.can_view,
            can_edit: perm.can_edit
          });
        }
      });

      // Then, override with user-specific permissions
      (userPermissions as any)?.forEach((perm: any) => {
        if (perm.sidebar_item) {
          effectivePermissions.set(perm.sidebar_item.id, {
            ...perm.sidebar_item,
            can_view: perm.can_view,
            can_edit: perm.can_edit
          });
        }
      });

      // If no permissions found, return empty array to fall back to static sidebar
      if (effectivePermissions.size === 0) {
        console.log('No sidebar permissions found, falling back to static sidebar');
        setPermissions({
          items: [],
          loading: false,
          error: null
        });
        return;
      }

      // Convert to array and organize into hierarchy
      const itemsMap = new Map<string, SidebarItem>();
      const rootItems: SidebarItem[] = [];
      
      effectivePermissions.forEach((item, id) => {
        if (item.can_view) {
          itemsMap.set(id, { 
            ...item, 
            children: [] 
          });
        }
      });
      
      effectivePermissions.forEach((item, id) => {
        if (item.can_view) {
          if (item.parent_id) {
            const parent = itemsMap.get(item.parent_id);
            if (parent) {
              parent.children?.push(itemsMap.get(id)!);
            }
          } else {
            rootItems.push(itemsMap.get(id)!);
          }
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

      console.log('Sidebar permissions debug:', {
        profile: profile,
        rolePermissions: rolePermissions,
        userPermissions: userPermissions,
        effectivePermissions: Array.from(effectivePermissions.entries()),
        rootItems: rootItems
      });

      setPermissions({
        items: sortItems(rootItems),
        loading: false,
        error: null
      });

    } catch (error) {
      console.error('Error in useSidebarPermissions:', error);
      setPermissions(prev => ({ 
        ...prev, 
        loading: false, 
        error: 'An unexpected error occurred' 
      }));
    }
  };

  useEffect(() => {
    fetchUserSidebarPermissions();
  }, [user?.id]);

  return {
    ...permissions,
    refetch: fetchUserSidebarPermissions
  };
}
