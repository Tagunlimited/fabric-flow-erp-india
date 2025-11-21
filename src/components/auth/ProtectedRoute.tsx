import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: string[];
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, profile, loading, profileLoading } = useAuth();

  // Show loader ONLY while auth is initializing (not profile loading)
  // Profile loading is non-blocking - app should work even if profile is null
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-4 text-lg text-muted-foreground">Loading...</span>
      </div>
    );
  }
  
  // If profile is still loading but we have a user, show a subtle indicator but allow access
  // This prevents the app from being blocked by slow profile fetches

  // Pre-configured admin user - bypass approval process
  const isPreConfiguredAdmin = user?.email === 'ecom@tagunlimitedclothing.com';

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Allow pre-configured admin to access system even without profile
  if (isPreConfiguredAdmin) {
    return <>{children}</>; 
  }

  if (profile?.status === 'pending_approval') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="w-16 h-16 bg-warning rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">!</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">Account Pending Approval</h2>
          <p className="text-muted-foreground mb-4">
            Your account is waiting for admin approval. You will receive an email once approved.
          </p>
          <button
            onClick={() => {
              // Refresh the profile status by reloading the page
              // This is necessary to check the latest approval status
              window.location.reload();
            }}
            className="text-primary hover:underline"
          >
            Refresh Status
          </button>
        </div>
      </div>
    );
  }

  if (profile?.status === 'rejected') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="w-16 h-16 bg-error rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">✕</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">Account Rejected</h2>
          <p className="text-muted-foreground">
            Your account application has been rejected. Please contact the administrator for more information.
          </p>
        </div>
      </div>
    );
  }

  if (requiredRole && profile && !requiredRole.includes(profile.role)) {
    // Allow pre-configured admin to access admin-only routes
    if (isPreConfiguredAdmin && requiredRole.includes('admin')) {
      return <>{children}</>;
    }
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-subtle">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="w-16 h-16 bg-error rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">🔒</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            You don't have permission to access this page.
          </p>
        </div>
      </div>
    );
  }

  // No customer route gating here to avoid layout/UX changes; RLS + sidebar filtering handle access.

  return <>{children}</>;
}