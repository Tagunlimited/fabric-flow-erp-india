import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { authService, UserProfile } from '@/lib/auth';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  // Helper: check if login expired
  const isLoginExpired = () => {
    const loginTime = localStorage.getItem('login_timestamp');
    if (!loginTime) return false;
    const now = Date.now();
    return now - parseInt(loginTime, 10) > 1 * 24 * 60 * 60 * 1000; // 7 days
  };

  const refreshProfile = async (retryCount = 0) => {
    if (user) {
      setProfileLoading(true);
      try {
        console.log(`Attempting to refresh profile (attempt ${retryCount + 1})`);
        const userProfile = await authService.getUserProfile(user.id);
        setProfile(userProfile);
        console.log('Profile refreshed successfully:', userProfile);
      } catch (error) {
        console.warn('Profile refresh failed:', error?.message || 'Unknown error');
        
        // Retry once if it's a network error or first attempt
        if (retryCount === 0) {
          console.log('Retrying profile refresh...');
          setTimeout(() => refreshProfile(1), 1000);
        } else {
          // Create a minimal profile object to prevent UI issues
          const fallbackProfile = {
            id: user.id,
            user_id: user.id,
            full_name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
            email: user.email || '',
            role: 'user',
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          console.log('Using fallback profile:', fallbackProfile);
          setProfile(fallbackProfile as any);
        }
      } finally {
        setProfileLoading(false);
      }
    }
  };

  const signOut = async () => {
    try {
      await authService.signOut();
      setUser(null);
      setProfile(null);
      localStorage.removeItem('login_timestamp');
      toast.success('Signed out successfully');
    } catch (error) {
      toast.error('Error signing out');
    }
  };

  useEffect(() => {
    // Get initial session, try to refresh if missing
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      let user = session?.user ?? null;
      if (!user && session?.refresh_token) {
        // Try to refresh session if possible
        const { data: refreshed } = await supabase.auth.refreshSession({ refresh_token: session.refresh_token });
        user = refreshed.session?.user ?? null;
      }
      if (user) {
        if (isLoginExpired()) {
          signOut();
          return;
        }
        setUser(user);
        refreshProfile();
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setLoading(false);
        localStorage.removeItem('login_timestamp');
      } else if (event === 'SIGNED_IN' && session?.user) {
        localStorage.setItem('login_timestamp', Date.now().toString());
        setUser(session.user);
        await refreshProfile();
        setLoading(false);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        setUser(session.user);
        // Don't set loading to false on token refresh to prevent re-renders
        // setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      refreshProfile();
    }
  }, [user]);

  // On every mount, check for expiry and auto logout if needed
  useEffect(() => {
    if (user && isLoginExpired()) {
      signOut();
    }
  }, [user]);

  const value = {
    user,
    profile,
    loading,
    profileLoading,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}