import { useState, useEffect, useRef } from 'react';
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
  isAdmin: boolean; // Whether the current user is an admin
}

const SIDEBAR_CACHE_TTL_MS = 5 * 60 * 1000;
const sharedPermissionsCache = new Map<string, { timestamp: number; data: SidebarPermissions }>();
const sharedPermissionsInflight = new Map<string, Promise<SidebarPermissions>>();
const SIDEBAR_PERMISSIONS_SESSION_KEY = 'sidebar_permissions_cache_v1';

function readSessionPermissionsCache(userId: string): { timestamp: number; data: SidebarPermissions } | null {
  try {
    const raw = sessionStorage.getItem(SIDEBAR_PERMISSIONS_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, { timestamp: number; data: SidebarPermissions }>;
    const entry = parsed[userId];
    if (!entry) return null;
    if (Date.now() - entry.timestamp > SIDEBAR_CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeSessionPermissionsCache(userId: string, entry: { timestamp: number; data: SidebarPermissions }) {
  try {
    const raw = sessionStorage.getItem(SIDEBAR_PERMISSIONS_SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, { timestamp: number; data: SidebarPermissions }>) : {};
    parsed[userId] = entry;
    sessionStorage.setItem(SIDEBAR_PERMISSIONS_SESSION_KEY, JSON.stringify(parsed));
  } catch {
    // non-blocking cache write
  }
}

export function useSidebarPermissions() {
  const [permissions, setPermissions] = useState<SidebarPermissions>({
    items: [],
    loading: true,
    error: null,
    permissionsSetup: false,
    isAdmin: false
  });
  
  const { user } = useAuth();

  // Complete cache system to prevent re-fetching on tab switch
  const initialLoadRef = useRef<boolean>(false);
  const lastUserIdRef = useRef<string | null>(null);
  const isFetchingRef = useRef<boolean>(false);
  const permissionsCacheRef = useRef<{
    userId: string | null;
    timestamp: number;
    data: SidebarPermissions | null;
  }>({ userId: null, timestamp: 0, data: null });

  const fetchUserSidebarPermissions = async (forceRefresh = false) => {
    if (!user) {
      setPermissions({ items: [], loading: false, error: 'No user', permissionsSetup: false, isAdmin: false });
      initialLoadRef.current = false;
      lastUserIdRef.current = null;
      isFetchingRef.current = false;
      return;
    }
    
    // Prevent duplicate fetches for the same user (unless forced)
    if (!forceRefresh && lastUserIdRef.current === user.id && initialLoadRef.current) {
      return;
    }

    if (!forceRefresh) {
      const sharedCached = sharedPermissionsCache.get(user.id);
      if (sharedCached && Date.now() - sharedCached.timestamp < SIDEBAR_CACHE_TTL_MS) {
        setPermissions(sharedCached.data);
        initialLoadRef.current = true;
        lastUserIdRef.current = user.id;
        permissionsCacheRef.current = {
          userId: user.id,
          timestamp: sharedCached.timestamp,
          data: sharedCached.data
        };
        return;
      }
      const sessionCached = readSessionPermissionsCache(user.id);
      if (sessionCached) {
        sharedPermissionsCache.set(user.id, sessionCached);
        setPermissions(sessionCached.data);
        initialLoadRef.current = true;
        lastUserIdRef.current = user.id;
        permissionsCacheRef.current = {
          userId: user.id,
          timestamp: sessionCached.timestamp,
          data: sessionCached.data
        };
        return;
      }
    }
    
    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      return;
    }
    
    if (!forceRefresh) {
      const inflight = sharedPermissionsInflight.get(user.id);
      if (inflight) {
        const data = await inflight;
        setPermissions(data);
        initialLoadRef.current = true;
        lastUserIdRef.current = user.id;
        permissionsCacheRef.current = {
          userId: user.id,
          timestamp: Date.now(),
          data
        };
        return;
      }
    }

    isFetchingRef.current = true;

    const finalizePermissions = (data: SidebarPermissions): SidebarPermissions => {
      setPermissions(data);
      if (user?.id) {
        const now = Date.now();
        initialLoadRef.current = true;
        lastUserIdRef.current = user.id;
        permissionsCacheRef.current = {
          userId: user.id,
          timestamp: now,
          data
        };
        const entry = { timestamp: now, data };
        sharedPermissionsCache.set(user.id, entry);
        writeSessionPermissionsCache(user.id, entry);
      }
      return data;
    };

    const runFetch = async (): Promise<SidebarPermissions> => {

    try {
      setPermissions(prev => ({ ...prev, loading: true, error: null }));

      // Check for pre-configured admin email first
      const isPreConfiguredAdmin = user?.email === 'ecom@tagunlimitedclothing.com';
      
      // Get user's profile to determine their role
      // Use maybeSingle() to avoid errors when profile doesn't exist
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('user_id', user.id as any)
        .maybeSingle();

      // Check if user is admin by profile role
      const isAdminByProfile = (profile as any)?.role === 'admin';
      
      // Determine if user is admin (either pre-configured or by profile)
      const isAdminUser = isPreConfiguredAdmin || isAdminByProfile;

      // Only log error if not a pre-configured admin and it's a real error (not just "not found")
      if (profileError && !isPreConfiguredAdmin && profileError.code !== 'PGRST116') {
        // PGRST116 is "not found" which is okay - user might not have profile yet
        console.error('Error fetching user profile:', profileError);
        setPermissions(prev => ({ 
          ...prev, 
          loading: false, 
          error: 'Failed to fetch user profile',
          permissionsSetup: false,
          isAdmin: false
        }));
        return {
          items: [],
          loading: false,
          error: 'Failed to fetch user profile',
          permissionsSetup: false,
          isAdmin: false
        };
      }

      // If user is admin (pre-configured or by profile), bypass all permission checks
      // The sidebar will use static items for admin users
      // IMPORTANT: Set permissionsSetup to false so PermissionAwareRedirect bypasses the check
      if (isAdminUser) {
        const adminPermissions: SidebarPermissions = {
          items: [],
          loading: false,
          error: null,
          permissionsSetup: false, // Set to false so redirect logic bypasses permission check
          isAdmin: true
        };
        return finalizePermissions(adminPermissions);
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
          permissionsSetup: false,
          isAdmin: false
        }));
        return finalizePermissions({
          items: [],
          loading: false,
          error: 'Failed to fetch user permissions',
          permissionsSetup: false,
          isAdmin: false
        });
      }

      // Check if user has any explicit user-specific permissions (overrides)
      const hasUserOverrides = userPermissions && userPermissions.length > 0;

      // If user has explicit overrides, ONLY use those (ignore role permissions)
      // This ensures that when admin grants specific permissions, only those are shown
      let effectivePermissions = new Map();
      
      if (hasUserOverrides) {
        // User has explicit permissions - ONLY show those, ignore role permissions
        (userPermissions as any)?.forEach((perm: any) => {
          if (perm.sidebar_item && perm.can_view) {
            effectivePermissions.set(perm.sidebar_item.id, {
              ...perm.sidebar_item,
              can_view: perm.can_view,
              can_edit: perm.can_edit,
              permission_source: 'user'
            });
          }
        });
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
          permissionsSetup: false,
          isAdmin: false
        }));
        return finalizePermissions({
          items: [],
          loading: false,
          error: 'Failed to fetch role permissions',
          permissionsSetup: false,
          isAdmin: false
        });
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
            permissionsSetup: false,
            isAdmin: false
          }));
          return finalizePermissions({
            items: [],
            loading: false,
            error: 'Failed to check sidebar items',
            permissionsSetup: false,
            isAdmin: false
          });
        }
        
        // If there are sidebar items but no permissions, this means the user has no access
        if (allSidebarItems && allSidebarItems.length > 0) {
          // For admin users (pre-configured or by profile), give them access to all sidebar items
          const isPreConfiguredAdmin = user?.email === 'ecom@tagunlimitedclothing.com';
          const isAdminByProfile = (profile as any)?.role === 'admin';
          if (isPreConfiguredAdmin || isAdminByProfile) {
            // Get all sidebar items for admin
            const { data: allItems, error: allItemsErr } = await supabase
              .from('sidebar_items')
              .select('*')
              .eq('is_active', true as any)
              .order('sort_order');
              
            if (allItemsErr) {
              console.error('Error fetching all sidebar items for admin:', allItemsErr);
              const fallbackAdminPerms: SidebarPermissions = {
                items: [],
                loading: false,
                error: 'Failed to fetch sidebar items',
                permissionsSetup: false, // Admin should bypass permission check
                isAdmin: true
              };
              return finalizePermissions(fallbackAdminPerms);
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
            
            const fullAdminPerms: SidebarPermissions = {
              items: sortItems(rootItems),
              loading: false,
              error: null,
              permissionsSetup: true,
              isAdmin: true
            };
            return finalizePermissions(fullAdminPerms);
          } else {
            const emptyPerms: SidebarPermissions = {
              items: [],
              loading: false,
              error: null,
              permissionsSetup: true,
              isAdmin: false
            };
            return finalizePermissions(emptyPerms);
          }
        } else {
          // No sidebar items exist at all, fall back to static sidebar
          const staticFallbackPerms: SidebarPermissions = {
            items: [],
            loading: false,
            error: null,
            permissionsSetup: false,
            isAdmin: false
          };
          return finalizePermissions(staticFallbackPerms);
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
      
      const permissionsData: SidebarPermissions = {
        items: finalItems,
        loading: false,
        error: null,
        permissionsSetup: true,
        isAdmin: false
      };
      
      return finalizePermissions(permissionsData);

    } catch (error) {
      console.error('Error in useSidebarPermissions:', error);
      const failedPermissions: SidebarPermissions = {
        items: [],
        loading: false,
        error: 'An unexpected error occurred',
        permissionsSetup: false,
        isAdmin: false
      };
      return finalizePermissions(failedPermissions);
    } finally {
      isFetchingRef.current = false;
    }
    };

    const fetchPromise = runFetch();
    sharedPermissionsInflight.set(user.id, fetchPromise);
    try {
      await fetchPromise;
    } finally {
      sharedPermissionsInflight.delete(user.id);
    }
  };

  // COMPLETE CACHE IMPLEMENTATION: Prevent ALL re-fetches on tab switch
  // Only fetch permissions ONCE per user session, never re-fetch on tab switch
  useEffect(() => {
    // Skip if no valid user
    if (!user?.id) {
      // Clear cache if user logs out
      initialLoadRef.current = false;
      lastUserIdRef.current = null;
      isFetchingRef.current = false;
      permissionsCacheRef.current = { userId: null, timestamp: 0, data: null };
      setPermissions({ items: [], loading: false, error: 'No user', permissionsSetup: false, isAdmin: false });
      return;
    }
    
    const isSameUser = lastUserIdRef.current === user.id;
    const alreadyLoaded = initialLoadRef.current;
    const cache = permissionsCacheRef.current;
    const sharedCache = sharedPermissionsCache.get(user.id);
    const sessionCache = readSessionPermissionsCache(user.id);
    if (sessionCache && !sharedCache) {
      sharedPermissionsCache.set(user.id, sessionCache);
    }
    const effectiveSharedCache = sharedPermissionsCache.get(user.id);
    
    // Check if we have valid cached data (within 5 minutes)
    const cacheValid = cache.userId === user.id && 
                      cache.data && 
                      Date.now() - cache.timestamp < 5 * 60 * 1000; // 5 min cache
    const sharedCacheValid = !!effectiveSharedCache && Date.now() - effectiveSharedCache.timestamp < SIDEBAR_CACHE_TTL_MS;
    
    // If we have valid cache, use it instead of fetching
    if (cacheValid) {
      setPermissions(cache.data!);
      initialLoadRef.current = true;
      lastUserIdRef.current = user.id;
      return;
    }
    if (sharedCacheValid) {
      setPermissions(effectiveSharedCache!.data);
      initialLoadRef.current = true;
      lastUserIdRef.current = user.id;
      permissionsCacheRef.current = {
        userId: user.id,
        timestamp: effectiveSharedCache!.timestamp,
        data: effectiveSharedCache!.data
      };
      return;
    }
    
    // If we already loaded permissions for this same user, skip completely
    // This prevents ANY re-fetching when switching tabs
    if (alreadyLoaded && isSameUser) {
      return;
    }
    
    // Only fetch if:
    // 1. First time loading (initialLoadRef is false), OR
    // 2. User actually changed (different user ID)
    const isFirstLoad = !alreadyLoaded;
    const userChanged = !isSameUser;
    
    if (isFirstLoad || userChanged) {
      // Update last user ID to prevent duplicate calls for same user
      // But don't mark as loaded until fetch succeeds
      lastUserIdRef.current = user.id;
      
      fetchUserSidebarPermissions();
    }
  }, [user?.id]); // ONLY depend on user.id - no other dependencies

  return {
    ...permissions,
    refetch: () => fetchUserSidebarPermissions(true) // Allow forced refresh when explicitly called
  };
}
