import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useSidebarPermissions } from '@/hooks/useSidebarPermissions';
import { useAuth } from '@/components/auth/AuthProvider';
import Index from '@/pages/Index';

export function PermissionAwareRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const { items: sidebarItems, loading, permissionsSetup, isAdmin } = useSidebarPermissions();
  const { profile, user } = useAuth();
  const hasRedirected = useRef(false);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  useEffect(() => {
    // Only redirect once and only if we're on the root path
    // Check sessionStorage to persist redirect state across remounts
    const hasRedirectedInSession = sessionStorage.getItem('permissionRedirectDone') === 'true';
    
    if (hasRedirected.current || hasRedirectedInSession || location.pathname !== '/') {
      return;
    }

    // CRITICAL FIX: Check for admin status using BOTH user email AND profile role
    // This ensures admin detection works even if profile is still loading
    const isPreConfiguredAdmin = user?.email === 'ecom@tagunlimitedclothing.com';
    const isAdminByProfile = profile?.role === 'admin';
    const isAdminUser = isPreConfiguredAdmin || isAdminByProfile || isAdmin;
    
    // OPTIMIZATION: Redirect admin users immediately (before waiting for permissions)
    if (isAdminUser) {
      console.log('👑 Admin user detected - redirecting immediately', { 
        isPreConfiguredAdmin, 
        isAdminByProfile, 
        isAdmin,
        userEmail: user?.email,
        profileRole: profile?.role
      });
      hasRedirected.current = true;
      sessionStorage.setItem('permissionRedirectDone', 'true');
      setRedirectTo('/dashboard');
      return;
    }

    // Add a timeout to ensure redirect happens even if permissions are slow
    // Reduced from 2s to 500ms for faster redirect
    const redirectTimeout = setTimeout(() => {
      if (!hasRedirected.current && location.pathname === '/') {
        console.log('⏰ Redirect timeout - forcing dashboard redirect');
        hasRedirected.current = true;
        sessionStorage.setItem('permissionRedirectDone', 'true');
        setRedirectTo('/dashboard');
      }
    }, 500); // Reduced to 500ms for faster redirect

    // Don't wait for permissions if we have user but no profile yet - might be admin
    // Only wait if we have neither user nor profile
    if (loading && !user) {
      console.log('⏳ Waiting for user and permissions to load...');
      return () => clearTimeout(redirectTimeout);
    }
    
    // If we have user but permissions are still loading, check admin status and redirect if admin
    if (loading && user) {
      // Check again for admin (profile might have loaded)
      const checkIsAdmin = user?.email === 'ecom@tagunlimitedclothing.com' || profile?.role === 'admin';
      if (checkIsAdmin) {
        console.log('👑 Admin detected while permissions loading - redirecting');
        clearTimeout(redirectTimeout);
        hasRedirected.current = true;
        sessionStorage.setItem('permissionRedirectDone', 'true');
        setRedirectTo('/dashboard');
        return;
      }
      console.log('⏳ Waiting for permissions to load (user available)...');
      return () => clearTimeout(redirectTimeout);
    }

    // If permissions system is not set up, show dashboard for everyone
    if (!permissionsSetup) {
      console.log('🔄 Permissions not set up, showing dashboard');
      clearTimeout(redirectTimeout);
      hasRedirected.current = true;
      sessionStorage.setItem('permissionRedirectDone', 'true');
      setRedirectTo('/dashboard');
      return;
    }

    // For admin users, always show dashboard first
    // Check both profile role and isAdmin flag from permissions
    // This is a fallback check in case the early check above didn't catch it
    const checkAdminAgain = user?.email === 'ecom@tagunlimitedclothing.com' || profile?.role === 'admin' || isAdmin;
    if (checkAdminAgain) {
      console.log('👑 Admin user - showing dashboard', { 
        profileRole: profile?.role, 
        isAdmin, 
        isPreConfiguredAdmin: user?.email === 'ecom@tagunlimitedclothing.com',
        profileEmail: profile?.email,
        userEmail: user?.email
      });
      clearTimeout(redirectTimeout);
      hasRedirected.current = true;
      sessionStorage.setItem('permissionRedirectDone', 'true');
      setRedirectTo('/dashboard');
      return;
    }

    // If user has no sidebar items (no permissions), show empty state
    // BUT only if permissions are actually set up (not for admin users)
    if (sidebarItems.length === 0 && permissionsSetup) {
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
      clearTimeout(redirectTimeout);
      hasRedirected.current = true;
      sessionStorage.setItem('permissionRedirectDone', 'true');
      setRedirectTo(firstAvailableItem.url);
    } else {
      console.log('⚠️ No available pages found. Sidebar items:', sidebarItems);
      console.log('⚠️ Sidebar items count:', sidebarItems.length);
      clearTimeout(redirectTimeout);
      hasRedirected.current = true;
      sessionStorage.setItem('permissionRedirectDone', 'true');
      // Fallback to dashboard if no pages found
      setRedirectTo('/dashboard');
    }
    
    return () => clearTimeout(redirectTimeout);
  }, [loading, permissionsSetup, sidebarItems, navigate, profile?.role, isAdmin, location.pathname, user?.email]);

  // CRITICAL FIX: Check for admin status - used in both useEffect and render
  const isPreConfiguredAdmin = user?.email === 'ecom@tagunlimitedclothing.com';
  const isAdminByProfile = profile?.role === 'admin';
  const isAdminUser = isPreConfiguredAdmin || isAdminByProfile || isAdmin;

  // Separate useEffect for immediate admin redirect (runs whenever user/profile changes)
  useEffect(() => {
    // Only redirect if on root path and haven't redirected yet
    if (location.pathname !== '/' || hasRedirected.current) {
      return;
    }

    const hasRedirectedInSession = sessionStorage.getItem('permissionRedirectDone') === 'true';
    if (hasRedirectedInSession) {
      return;
    }

    // If admin user detected, redirect immediately
    if (isAdminUser) {
      console.log('👑 Admin user detected - redirecting immediately', {
        isPreConfiguredAdmin,
        isAdminByProfile,
        isAdmin,
        userEmail: user?.email,
        profileRole: profile?.role
      });
      hasRedirected.current = true;
      sessionStorage.setItem('permissionRedirectDone', 'true');
      setRedirectTo('/dashboard');
    }
  }, [isAdminUser, user?.email, profile?.role, location.pathname]);

  // Show loading while determining where to redirect
  // BUT skip loading screen for admin users (they should redirect immediately)
  if (loading && !isAdminUser) {
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
  // BUT NOT for admin users - they should always have access
  if (permissionsSetup && sidebarItems.length === 0 && !isAdminUser) {
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

  // Use Navigate component for redirects (React Router best practice)
  if (redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  // If we're on root path and haven't redirected yet, show Index component
  // This prevents blank screen while redirect logic is processing
  if (location.pathname === '/') {
    return <Index />;
  }

  return null;
}
