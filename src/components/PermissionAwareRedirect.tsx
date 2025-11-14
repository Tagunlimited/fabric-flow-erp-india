import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSidebarPermissions } from '@/hooks/useSidebarPermissions';
import { useAuth } from '@/components/auth/AuthProvider';

export function PermissionAwareRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const { items: sidebarItems, loading, permissionsSetup } = useSidebarPermissions();
  const { profile } = useAuth();
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Only redirect once and only if we're on the root path
    if (hasRedirected.current || location.pathname !== '/') {
      return;
    }

    if (loading) return; // Wait for permissions to load

    // If permissions system is not set up, show dashboard for everyone
    if (!permissionsSetup) {
      console.log('🔄 Permissions not set up, showing dashboard');
      hasRedirected.current = true;
      navigate('/dashboard', { replace: true });
      return;
    }

    // For admin users, always show dashboard first
    if (profile?.role === 'admin') {
      console.log('👑 Admin user - showing dashboard');
      hasRedirected.current = true;
      navigate('/dashboard', { replace: true });
      return;
    }

    // If user has no sidebar items (no permissions), show empty state
    if (sidebarItems.length === 0) {
      console.log('🚫 User has no permissions, showing empty state');
      hasRedirected.current = true;
      // You could redirect to a "no access" page here
      return;
    }

    // Find the first available page for the user
    // First try to find a root-level item with URL
    let firstAvailableItem = sidebarItems.find(item => item.url);
    
    // If no root item with URL, search in children recursively
    if (!firstAvailableItem) {
      const findFirstWithUrl = (items: typeof sidebarItems): typeof sidebarItems[0] | undefined => {
        for (const item of items) {
          if (item.url) return item;
          if (item.children) {
            const found = findFirstWithUrl(item.children);
            if (found) return found;
          }
        }
        return undefined;
      };
      firstAvailableItem = findFirstWithUrl(sidebarItems);
    }
    
    if (firstAvailableItem?.url) {
      console.log('✅ Redirecting to first available page:', firstAvailableItem.title, firstAvailableItem.url);
      hasRedirected.current = true;
      navigate(firstAvailableItem.url, { replace: true });
    } else {
      console.log('⚠️ No available pages found. Sidebar items:', sidebarItems);
      console.log('⚠️ Sidebar items count:', sidebarItems.length);
      hasRedirected.current = true;
    }
  }, [loading, permissionsSetup, sidebarItems, navigate, profile?.role, location.pathname]);

  // Show loading while determining where to redirect
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // If permissions are set up but user has no access, show no access message
  if (permissionsSetup && sidebarItems.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold mb-2">No Access</h1>
          <p className="text-muted-foreground">You don't have permission to access any pages.</p>
          <p className="text-sm text-muted-foreground mt-2">Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  // Show the dashboard (this will only show for users with dashboard permission or when permissions aren't set up)
  return null; // This will be handled by the Index component
}
