import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
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
  
  // Prevent unnecessary state updates - cache user ID to detect actual changes
  const lastUserIdRef = useRef<string | null>(null);
  const authInitializedRef = useRef(false);
  const profileRef = useRef<UserProfile | null>(null);
  const profileFetchInProgressRef = useRef(false); // Track if profile fetch is in progress

  // Helper: check if login expired
  const isLoginExpired = () => {
    const loginTime = localStorage.getItem('login_timestamp');
    if (!loginTime) return false;
    const now = Date.now();
    return now - parseInt(loginTime, 10) > 1 * 24 * 60 * 60 * 1000; // 7 days
  };

  // Helper function to wait for profile fetch to complete (including retries)
  const waitForProfileFetch = async (maxWaitSeconds = 8): Promise<void> => {
    let waitCount = 0;
    const maxWait = maxWaitSeconds * 2; // Check every 500ms
    while (profileFetchInProgressRef.current && waitCount < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 500));
      waitCount++;
      if (waitCount % 4 === 0) {
        console.log(`⏳ Still waiting for profile fetch... (${waitCount * 500}ms)`);
      }
    }
    if (profileFetchInProgressRef.current) {
      console.warn('⚠️ Profile fetch still in progress after timeout, forcing reset');
      profileFetchInProgressRef.current = false;
      setProfileLoading(false);
    }
  };

  const refreshProfile = async (retryCount = 0, userId?: string, skipSessionCheck = false): Promise<void> => {
    console.log('🔄 refreshProfile called:', { retryCount, userId, currentUserId: user?.id, skipSessionCheck });
    // Use provided userId or fall back to user state
    const targetUserId = userId || user?.id;
    
    console.log('🔄 refreshProfile targetUserId:', targetUserId);
    
    if (!targetUserId) {
      console.warn('⚠️ No targetUserId, cannot fetch profile');
      return;
    }

    // FIX 1 — prevent infinite retry loops
    // If already in progress and this is a retry, skip to prevent recursion
    if (profileFetchInProgressRef.current && retryCount > 0) {
      console.log('⏭️ Profile fetch still running, skipping retry loop');
      return;
    }

    // FIX — prevent loops immediately by setting flag FIRST
    // If already in progress, skip (allow retries to proceed)
    if (profileFetchInProgressRef.current && retryCount === 0) {
      console.log('⏭️ Skipping refreshProfile - already running');
      return;
    }
    
    // Set flag IMMEDIATELY to prevent other calls from entering
    profileFetchInProgressRef.current = true;
    setProfileLoading(true);
    
    console.log('✅ Flag set, starting profile fetch process...');
    
    let willRetry = false;
    
    // Global timeout to ensure we always exit - 5 seconds max (reduced from 15)
    const globalTimeout = setTimeout(() => {
      if (profileFetchInProgressRef.current) {
        console.warn('⚠️ Profile fetch exceeded 5 seconds, forcing exit and using fallback');
        profileFetchInProgressRef.current = false;
        setProfileLoading(false);
        // Create fallback profile to prevent infinite loading
        if (!profileRef.current) {
          const fallbackProfile = {
            id: targetUserId,
            user_id: targetUserId,
            full_name: 'User',
            email: '',
            role: 'user',
            status: 'active',
            avatar_url: undefined,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          setProfile(fallbackProfile as any);
          profileRef.current = fallbackProfile as any;
        }
      }
    }, 5000); // Reduced to 5 seconds
    
    try {
      // Skip session check if we know we have a valid session (e.g., from SIGNED_IN event)
      if (!skipSessionCheck) {
        // Check if session is still valid before fetching profile - with timeout
        console.log('🔍 Checking session validity...');
        const sessionCheckPromise = supabase.auth.getSession();
        const sessionTimeoutPromise = new Promise<{ data: { session: null }, error: { message: string } }>((resolve) => {
          setTimeout(() => {
            console.warn('⚠️ Session check timeout after 5 seconds');
            resolve({ data: { session: null }, error: { message: 'Session check timeout' } });
          }, 5000);
        });
      
      const { data: { session }, error: sessionError } = await Promise.race([sessionCheckPromise, sessionTimeoutPromise]);
      
      if (sessionError || !session) {
        console.warn('No valid session, attempting to refresh...');
        try {
          const refreshPromise = supabase.auth.refreshSession();
          const refreshTimeoutPromise = new Promise<{ data: { session: null }, error: { message: string } }>((resolve) => {
            setTimeout(() => {
              console.warn('⚠️ Session refresh timeout after 5 seconds');
              resolve({ data: { session: null }, error: { message: 'Session refresh timeout' } });
            }, 5000);
          });
          
          const { data: refreshed, error: refreshError } = await Promise.race([refreshPromise, refreshTimeoutPromise]);
          
          if (refreshError || !refreshed.session) {
            console.error('Session refresh failed:', refreshError);
            setUser(null);
            setProfile(null);
            profileRef.current = null; // Update ref
            profileFetchInProgressRef.current = false; // Reset flag
            setProfileLoading(false);
            return;
          }
          setUser(refreshed.session.user);
          console.log('✅ Session refreshed successfully');
        } catch (refreshErr) {
          console.error('Error refreshing session:', refreshErr);
          setUser(null);
          setProfile(null);
          profileRef.current = null; // Update ref
          profileFetchInProgressRef.current = false; // Reset flag
          setProfileLoading(false);
          return;
        }
      } else {
        console.log('✅ Session is valid');
      }
      } else {
        console.log('⏭️ Skipping session check (skipSessionCheck=true) - session already validated');
      }

      console.log(`Attempting to refresh profile (attempt ${retryCount + 1})`);
      
      // Add timeout to prevent hanging - 3 seconds max (reduced from 10)
      // Pass skipSessionCheck to getUserProfile to avoid redundant session checks
      const profilePromise = authService.getUserProfile(targetUserId, 0, skipSessionCheck);
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => {
          console.warn('⚠️ Profile fetch timeout after 3 seconds - using fallback');
          resolve(null);
        }, 3000); // Reduced to 3 seconds
      });
      
      const userProfile = await Promise.race([profilePromise, timeoutPromise]);
      
      if (userProfile) {
        console.log('✅ Profile refreshed successfully:', userProfile);
        console.log('📸 Avatar URL in profile:', userProfile.avatar_url);
        setProfile(userProfile);
        profileRef.current = userProfile; // Update ref
        // Success - reset flag in finally
      } else {
        console.warn('⚠️ getUserProfile returned null or timed out');
        
        // If no profile exists, create a fallback immediately to unblock the app
        if (!profileRef.current) {
          console.log('🔄 Creating fallback profile to unblock app...');
          try {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (currentUser) {
              // Create fallback profile immediately (don't wait for DB)
              const fallbackProfile = {
                id: targetUserId,
                user_id: targetUserId,
                email: currentUser.email || '',
                full_name: currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'User',
                role: 'user',
                status: 'active',
                avatar_url: undefined,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              };
              
              console.log('✅ Setting fallback profile to unblock app:', fallbackProfile);
              setProfile(fallbackProfile as any);
              profileRef.current = fallbackProfile as any;
              
              // Try to create in DB in background (non-blocking)
              if (retryCount === 0) {
                supabase
                  .from('profiles')
                  .insert({
                    id: targetUserId,
                    user_id: targetUserId,
                    email: currentUser.email || '',
                    full_name: currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'User',
                    role: 'user',
                    status: 'active'
                  } as any)
                  .select()
                  .single()
                  .then(({ data: newProfile, error: createError }) => {
                    if (!createError && newProfile) {
                      console.log('✅ Profile created in DB successfully:', newProfile);
                      setProfile(newProfile as any);
                      profileRef.current = newProfile as any;
                    } else {
                      console.warn('⚠️ Failed to create profile in DB (non-critical):', createError);
                    }
                  })
                  .catch((createErr) => {
                    console.warn('⚠️ Error creating profile in DB (non-critical):', createErr);
                  });
              }
            }
          } catch (err) {
            console.warn('⚠️ Error creating fallback profile:', err);
            // Still create a minimal fallback
            const minimalFallback = {
              id: targetUserId,
              user_id: targetUserId,
              email: '',
              full_name: 'User',
              role: 'user',
              status: 'active',
              avatar_url: undefined,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            setProfile(minimalFallback as any);
            profileRef.current = minimalFallback as any;
          }
        } else {
          console.log('✅ Preserving existing profile data:', profileRef.current);
        }
        // Success (even if fallback) - reset flag in finally
      }
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
            profileRef.current = null; // Update ref
            profileFetchInProgressRef.current = false; // Reset flag
            setProfileLoading(false);
            return;
          }
          setUser(refreshed.session.user);
          // Retry profile fetch once after refresh
          if (retryCount === 0) {
            willRetry = true;
            setTimeout(() => refreshProfile(1, targetUserId), 500);
            return; // Don't reset flag - retry will handle it
          }
        } catch (refreshErr) {
          console.error('Error refreshing session after JWT expiry:', refreshErr);
          setUser(null);
          setProfile(null);
          profileRef.current = null; // Update ref
          profileFetchInProgressRef.current = false; // Reset flag
          setProfileLoading(false);
          return;
        }
      }
      
      // Retry with exponential backoff (max 2 retries)
      if (retryCount < 2) {
        willRetry = true;
        const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 3000);
        console.log(`Retrying profile refresh in ${retryDelay}ms (attempt ${retryCount + 1}/2)...`);
        setTimeout(() => refreshProfile(retryCount + 1, targetUserId), retryDelay);
        return; // Don't reset flag - retry will handle it
      } else {
        // Create a minimal profile object to prevent UI issues after all retries failed
        // IMPORTANT: Try to preserve existing avatar_url if profile was previously loaded
        // Get user data from session if user state is not available
        let currentUser = user;
        if (!currentUser) {
          const { data: { user: fetchedUser } } = await supabase.auth.getUser();
          currentUser = fetchedUser || null;
        }
        const fallbackProfile = {
          id: targetUserId,
          user_id: targetUserId,
          full_name: currentUser?.user_metadata?.name || currentUser?.email?.split('@')[0] || 'User',
          email: currentUser?.email || '',
          role: 'user',
          status: 'active',
          avatar_url: profileRef.current?.avatar_url || undefined, // Preserve existing avatar if available
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        console.warn('⚠️ Using fallback profile after all retries failed:', fallbackProfile);
        setProfile(fallbackProfile as any);
        profileRef.current = fallbackProfile as any; // Update ref
        // All retries exhausted - reset flag in finally
      }
    } finally {
      // Clear global timeout
      clearTimeout(globalTimeout);
      
      // Only reset flag if we're not scheduling a retry
      if (!willRetry) {
        setProfileLoading(false);
        profileFetchInProgressRef.current = false; // Reset flag
        
        // FIX 3 — Safety: If profile is still null after all attempts, log warning but stop loading
        if (!profileRef.current) {
          console.warn('⚠️ No profile even after refresh → stopping loading to prevent infinite loop');
          // Create minimal fallback profile to prevent UI issues
          let currentUser = user;
          if (!currentUser) {
            try {
              const { data: { user: fetchedUser } } = await supabase.auth.getUser();
              currentUser = fetchedUser || null;
            } catch (err) {
              console.error('Error fetching user for fallback:', err);
            }
          }
          if (currentUser) {
            const fallbackProfile = {
              id: targetUserId,
              user_id: targetUserId,
              full_name: currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'User',
              email: currentUser.email || '',
              role: 'user',
              status: 'active',
              avatar_url: undefined,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            console.log('📝 Setting fallback profile to prevent infinite loading');
            setProfile(fallbackProfile as any);
            profileRef.current = fallbackProfile as any;
          }
        }
        
        console.log('✅ refreshProfile completed, flag reset');
      } else {
        console.log('⏳ refreshProfile scheduling retry, keeping flag set');
      }
    }
  };

  const signOut = async () => {
    try {
      await authService.signOut();
      setUser(null);
      setProfile(null);
      profileRef.current = null; // Clear ref
      profileFetchInProgressRef.current = false; // Reset flag
      setProfileLoading(false);
      setLoading(false); // Ensure loading is cleared
      localStorage.removeItem('login_timestamp');
      toast.success('Signed out successfully');
    } catch (error) {
      console.error('Error signing out:', error);
      // Even on error, clear state
      setUser(null);
      setProfile(null);
      profileRef.current = null;
      profileFetchInProgressRef.current = false;
      setProfileLoading(false);
      setLoading(false);
      toast.error('Error signing out');
    }
  };

  useEffect(() => {
    // Reset initialization flag on mount to handle page refresh correctly
    // On page refresh, React remounts the component, so refs are reset
    // But we need to ensure authInitializedRef starts as false
    authInitializedRef.current = false;
    profileRef.current = null; // Also reset profile ref on mount
    profileFetchInProgressRef.current = false; // Reset fetch flag
    
    console.log('🚀 AuthProvider: Starting initialization...');
    
    // Immediate safety timeout - force clear loading after 5 seconds (reduced from 10)
    const safetyTimeout = setTimeout(() => {
      setLoading((currentLoading) => {
        if (currentLoading) {
          console.warn('⚠️ Auth initialization taking longer than expected, clearing loading state');
          // Don't set user to null if we already have one from SIGNED_IN event
          return false;
        }
        return currentLoading;
      });
    }, 5000);
    
    // Get initial session - NON-BLOCKING: if it times out, rely on auth state change listener
    console.log('🔍 AuthProvider: Calling getSession()...');
    const sessionPromise = supabase.auth.getSession();
    const sessionTimeout = new Promise<{ data: { session: null }, error: { message: string } }>((resolve) => {
      setTimeout(() => {
        console.log('⏭️ Initial getSession taking longer than expected, will rely on auth state listener');
        resolve({ data: { session: null }, error: { message: 'Session check timeout' } });
      }, 2000); // Reduced timeout to 2 seconds
    });
    
    Promise.race([sessionPromise, sessionTimeout]).then(async ({ data: { session }, error }) => {
      console.log('✅ AuthProvider: getSession() completed', { hasSession: !!session, hasError: !!error });
      
      // If timeout or error, don't block - let auth state listener handle it
      if (error && error.message === 'Session check timeout') {
        console.log('⏭️ getSession timeout - relying on auth state change listener');
        setLoading(false);
        clearTimeout(safetyTimeout);
        return;
      }
      
      if (error) {
        console.warn('⚠️ Error getting session (non-timeout):', error.message);
        // Don't set user to null - let auth state listener handle it
        setLoading(false);
        clearTimeout(safetyTimeout);
        return;
      }

      console.log('✅ Session retrieved successfully', { hasSession: !!session, hasUser: !!session?.user });
      let sessionUser = session?.user ?? null;
      if (!sessionUser && session?.refresh_token) {
        // Try to refresh session if possible
        console.log('🔄 No user but refresh token exists, attempting refresh...');
        try {
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            console.error('❌ Session refresh error:', refreshError);
            setUser(null);
            setLoading(false);
            return;
          }
          sessionUser = refreshed.session?.user ?? null;
          console.log('✅ Session refreshed', { hasUser: !!sessionUser });
        } catch (err) {
          console.error('❌ Error refreshing session:', err);
        }
      }
      
      if (sessionUser) {
        console.log('✅ User found in session:', sessionUser.id);
        if (isLoginExpired()) {
          console.log('⚠️ Login expired, signing out...');
          await signOut();
          setLoading(false);
          return;
        }
        // ALWAYS fetch profile if it's null, regardless of user ID match
        // This ensures profile loads on page refresh
        console.log('🔍 Initial session check:', {
          userId: sessionUser.id,
          lastUserId: lastUserIdRef.current,
          hasProfile: !!profileRef.current,
          fetchInProgress: profileFetchInProgressRef.current
        });
        
        // Guard: Skip if profile fetch is already in progress
        if (profileFetchInProgressRef.current) {
          console.log('⏭️ Skipping initial session profile fetch (already in progress)');
          setLoading(false);
          return;
        }
        
        if (lastUserIdRef.current !== sessionUser.id) {
          console.log('🔄 New user detected, clearing old profile and fetching new...');
          // Clear old profile immediately when user changes
          setProfile(null);
          profileRef.current = null;
          lastUserIdRef.current = sessionUser.id;
          setUser(sessionUser);
          await refreshProfile(0, sessionUser.id, false); // Pass userId directly, check session
          await waitForProfileFetch(8);
          setLoading(false);
        } else if (!profileRef.current) {
          // User ID matches but profile is null - fetch it (page refresh scenario)
          console.log('🔄 User ID matches but profile is null - fetching profile');
          await refreshProfile(0, sessionUser.id, false); // Pass userId directly, check session
          await waitForProfileFetch(8);
          setLoading(false);
        } else {
          console.log('⏭️ Skipping initial session - same user already loaded with profile');
          setLoading(false);
        }
      } else {
        console.log('⚠️ No user in session');
        // Don't set user to null here - let auth state listener handle it
        setLoading(false);
      }
      
      clearTimeout(safetyTimeout);
    }).catch((error) => {
      console.warn('⚠️ Error in getSession promise chain:', error);
      setLoading(false);
      clearTimeout(safetyTimeout);
    });
    
    // Listen for auth changes - with guards to prevent unnecessary updates
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUserId = session?.user?.id || null;
      const userIdChanged = lastUserIdRef.current !== currentUserId;
      
      console.log('Auth state change:', event, currentUserId, {
        userIdChanged,
        previousUserId: lastUserIdRef.current
      });
      
      if (event === 'SIGNED_OUT') {
        lastUserIdRef.current = null;
        setUser(null);
        setProfile(null);
        profileRef.current = null; // Clear ref
        setLoading(false);
        localStorage.removeItem('login_timestamp');
      } else if (event === 'SIGNED_IN' && session?.user) {
        // SIGNED_IN means login succeeded - trust this event and proceed
        console.log('🔐 SIGNED_IN handler:', { userIdChanged, currentUserId, lastUserId: lastUserIdRef.current, fetchInProgress: profileFetchInProgressRef.current });
        
        // CRITICAL: Prevent duplicate profile fetches
        if (profileFetchInProgressRef.current) {
          console.log('⏭️ SIGNED_IN: Profile fetch already in progress, skipping duplicate');
          // Still update user state but don't fetch profile again
          if (userIdChanged) {
            lastUserIdRef.current = currentUserId;
            setUser(session.user);
            localStorage.setItem('login_timestamp', Date.now().toString());
          }
          setLoading(false);
          return;
        }
        
        // Only update if user actually changed
        if (userIdChanged) {
          console.log('✅ SIGNED_IN: User changed, clearing old profile and fetching new...');
          // Clear old profile immediately when user changes
          setProfile(null);
          profileRef.current = null;
          localStorage.setItem('login_timestamp', Date.now().toString());
          lastUserIdRef.current = currentUserId;
          setUser(session.user);
          console.log('📞 Calling refreshProfile from SIGNED_IN...');
          // Don't await - let it run in background, clear loading immediately
          refreshProfile(0, session.user.id, true).catch(err => {
            console.warn('⚠️ Profile fetch error (non-blocking):', err);
          });
          
          // Clear loading immediately - don't wait for profile
          // Profile will load in background and update when ready
          setLoading(false);
          console.log('✅ SIGNED_IN: User set, loading cleared (profile loading in background)');
        } else {
          console.log('⏭️ SIGNED_IN: Same user, checking if profile needed');
          // Update user state even if same user (in case of re-login)
          lastUserIdRef.current = currentUserId;
          setUser(session.user);
          localStorage.setItem('login_timestamp', Date.now().toString());
          
          // Only fetch profile if we don't have one (non-blocking)
          if (!profileRef.current && !profileFetchInProgressRef.current) {
            console.log('🔄 SIGNED_IN: No profile, fetching in background...');
            refreshProfile(0, session.user.id, true).catch(err => {
              console.warn('⚠️ Profile fetch error (non-blocking):', err);
            });
          } else {
            console.log('✅ SIGNED_IN: Profile already exists or fetch in progress');
          }
          setLoading(false);
        }
      } else if (event === 'INITIAL_SESSION' && session?.user) {
        // Guard: Skip if profile fetch is already in progress
        if (profileFetchInProgressRef.current) {
          console.log('⏭️ Skipping INITIAL_SESSION profile fetch (already in progress)');
          setLoading(false);
          return;
        }
        
        // Only update if user ID changed OR profile is null
        // This handles page refresh (profile null) vs tab switch (profile exists)
        if (userIdChanged && !authInitializedRef.current) {
          console.log('Initial session detected - setting user');
          // Clear old profile if user changed
          if (lastUserIdRef.current && lastUserIdRef.current !== currentUserId) {
            console.log('🔄 INITIAL_SESSION: User changed, clearing old profile');
            setProfile(null);
            profileRef.current = null;
          }
          lastUserIdRef.current = currentUserId;
          setUser(session.user);
          authInitializedRef.current = true;
          // Fetch profile if not already loaded
          if (!profileRef.current) {
            console.log('🔄 INITIAL_SESSION: Profile is null, fetching...');
            await refreshProfile(0, session.user.id); // Pass userId directly and await
            await waitForProfileFetch(8);
            setLoading(false);
          } else {
            setLoading(false);
          }
        } else if (!authInitializedRef.current && session.user.id === lastUserIdRef.current && !profileRef.current) {
          // Page refresh scenario: same user, but profile is null
          console.log('🔄 INITIAL_SESSION: Same user, profile null - fetching...');
          authInitializedRef.current = true;
          await refreshProfile(0, session.user.id); // Pass userId directly and await
          await waitForProfileFetch(8);
          setLoading(false);
        } else {
          console.log('⏭️ Skipping INITIAL_SESSION - already initialized or profile exists');
          // Ensure loading is cleared even when skipping
          if (loading) {
            setLoading(false);
          }
        }
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        // DISABLED: Don't auto-refresh profile on token refresh
        // Only update user if ID changed (shouldn't happen, but guard anyway)
        if (userIdChanged) {
          console.log('Token refreshed - user ID changed, updating user');
          lastUserIdRef.current = currentUserId;
        setUser(session.user);
        } else {
          console.log('⏭️ Skipping TOKEN_REFRESHED - same user, no update needed');
        }
      } else if (event === 'USER_UPDATED' && session?.user) {
        // Only update if user ID changed
        if (userIdChanged) {
          lastUserIdRef.current = currentUserId;
        setUser(session.user);
        } else {
          console.log('⏭️ Skipping USER_UPDATED - same user, no update needed');
        }
      }
    });

    // Cleanup function - unsubscribe from auth changes and clear timeout
    return () => {
      subscription.unsubscribe();
      clearTimeout(safetyTimeout);
    };
  }, []);

  // DISABLED: Auto-refresh profile on user change
  // This was causing form resets when switching tabs
  // Profile is already refreshed on SIGNED_IN event, which is sufficient
  // useEffect(() => {
  //   if (user) {
  //     refreshProfile();
  //   }
  // }, [user]);

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