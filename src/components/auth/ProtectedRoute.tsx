import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: string[];
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth();
  
  // Pre-configured admin user - bypass approval process
  const isPreConfiguredAdmin = user?.email === 'ecom@tagunlimitedclothing.com';
  // Allow access even without profile to handle RLS policy issues
  if (!profile && user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <h2 className="text-lg font-semibold text-yellow-800 mb-2">Profile Loading Issue</h2>
            <p className="text-yellow-700 mb-4">
              There's a temporary issue loading your profile. You can still access the system.
            </p>
            <div className="space-y-2">
              {children}
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            onClick={() => window.location.reload()}
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

  return <>{children}</>;
}