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
        // Check if session is still valid before fetching profile
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          console.warn('No valid session, attempting to refresh...');
          try {
            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError || !refreshed.session) {
              console.error('Session refresh failed:', refreshError);
              setUser(null);
              setProfile(null);
              setProfileLoading(false);
              return;
            }
            setUser(refreshed.session.user);
          } catch (refreshErr) {
            console.error('Error refreshing session:', refreshErr);
            setUser(null);
            setProfile(null);
            setProfileLoading(false);
            return;
          }
        }

        console.log(`Attempting to refresh profile (attempt ${retryCount + 1})`);
        const userProfile = await authService.getUserProfile(user.id);
        setProfile(userProfile);
        console.log('Profile refreshed successfully:', userProfile);
      } catch (error: any) {
        console.warn('Profile refresh failed:', error?.message || 'Unknown error');
        
        // Handle JWT expired errors
        if (error?.code === '401' || error?.message?.includes('JWT') || error?.message?.includes('expired')) {
          console.log('JWT expired, attempting to refresh session...');
          try {
            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError || !refreshed.session) {
              console.error('Session refresh failed after JWT expiry:', refreshError);
              setUser(null);
              setProfile(null);
              setProfileLoading(false);
              return;
            }
            setUser(refreshed.session.user);
            // Retry profile fetch once after refresh
            if (retryCount === 0) {
              setTimeout(() => refreshProfile(1), 500);
              return;
            }
          } catch (refreshErr) {
            console.error('Error refreshing session after JWT expiry:', refreshErr);
            setUser(null);
            setProfile(null);
            setProfileLoading(false);
            return;
          }
        }
        
        // Retry with exponential backoff (max 2 retries)
        if (retryCount < 2) {
          const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 3000);
          console.log(`Retrying profile refresh in ${retryDelay}ms (attempt ${retryCount + 1}/2)...`);
          setTimeout(() => refreshProfile(retryCount + 1), retryDelay);
        } else {
          // Create a minimal profile object to prevent UI issues after all retries failed
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
          console.log('Using fallback profile after all retries failed:', fallbackProfile);
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
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) {
        console.error('Error getting session:', error);
        // If session error, try to refresh
        if (error.message?.includes('expired') || error.message?.includes('JWT')) {
          try {
            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError) {
              console.error('Session refresh failed:', refreshError);
              setUser(null);
              setProfile(null);
              setLoading(false);
              return;
            }
            if (refreshed.session?.user) {
              setUser(refreshed.session.user);
              await refreshProfile();
              setLoading(false);
              return;
            }
          } catch (refreshErr) {
            console.error('Error refreshing session:', refreshErr);
          }
        }
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      let user = session?.user ?? null;
      if (!user && session?.refresh_token) {
        // Try to refresh session if possible
        try {
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            console.error('Session refresh error:', refreshError);
            setUser(null);
            setLoading(false);
            return;
          }
          user = refreshed.session?.user ?? null;
        } catch (err) {
          console.error('Error refreshing session:', err);
        }
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
      console.log('Auth state change:', event, session?.user?.id);
      
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
        console.log('Token refreshed successfully');
        setUser(session.user);
        // Refresh profile after token refresh
        await refreshProfile();
      } else if (event === 'USER_UPDATED' && session?.user) {
        setUser(session.user);
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