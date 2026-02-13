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

      console.log(`Attempting to refresh profile (attempt ${retryCount + 1}) for userId: ${targetUserId}`);
      
      // OPTIMIZATION: Only call getUser() if we need to verify session (skipSessionCheck=false)
      // When skipSessionCheck=true and userId is provided, trust the userId from SIGNED_IN event
      let actualUserId = targetUserId;
      let currentSessionUser = null;
      
      if (!skipSessionCheck) {
        // Need to verify session user matches - call getUser()
        const { data: { user: sessionUser } } = await supabase.auth.getUser();
        if (!sessionUser) {
          console.error('❌ No session user found! Cannot fetch profile.');
          profileFetchInProgressRef.current = false;
          setProfileLoading(false);
          clearTimeout(globalTimeout);
          return;
        }
        currentSessionUser = sessionUser;
        actualUserId = sessionUser.id;
        
        if (actualUserId !== targetUserId) {
          console.warn('⚠️ User ID mismatch detected, using session user ID:', {
            targetUserId,
            sessionUserId: actualUserId,
            sessionEmail: sessionUser.email
          });
        }
      } else {
        // skipSessionCheck=true: Trust the userId provided (from SIGNED_IN event)
        // No need to call getUser() - saves ~200-500ms
        console.log('⏭️ Skipping getUser() call - using provided userId directly (skipSessionCheck=true)');
      }
      
      // Add timeout to prevent hanging - 3 seconds max
      // Pass skipSessionCheck to getUserProfile to avoid redundant session checks
      let timeoutId: NodeJS.Timeout | null = null;
      const profilePromise = authService.getUserProfile(actualUserId, 0, skipSessionCheck);
      const timeoutPromise = new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => {
          console.warn('⚠️ Profile fetch timeout after 3 seconds - using fallback');
          resolve(null);
        }, 3000);
      });
      
      const userProfile = await Promise.race([profilePromise, timeoutPromise]);
      
      // Clear timeout if profile was fetched successfully
      if (timeoutId && userProfile) {
        clearTimeout(timeoutId);
      }
      
      if (userProfile) {
        // CRITICAL: Verify profile matches expected user ID
        if (userProfile.user_id !== actualUserId) {
          console.error('❌ CRITICAL: Profile user_id does not match expected user!', {
            profileUserId: userProfile.user_id,
            expectedUserId: actualUserId,
            sessionEmail: currentSessionUser?.email || 'N/A'
          });
          profileFetchInProgressRef.current = false;
          setProfileLoading(false);
          clearTimeout(globalTimeout);
          return;
        }
        
        console.log('✅ Profile refreshed successfully:', { 
          profileId: userProfile.id, 
          userId: userProfile.user_id,
          email: userProfile.email,
          role: userProfile.role,
          matchesSession: userProfile.user_id === actualUserId
        });
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
            // Get user data - use currentSessionUser if available, otherwise fetch or use user state
            let userData = currentSessionUser;
            if (!userData) {
              // If skipSessionCheck=true, we might not have currentSessionUser
              // Try to get from user state first, then fetch if needed
              if (user?.id === actualUserId) {
                // Use user state if it matches
                userData = user as any;
              } else {
                // Fetch user data
                const { data: { user: fetchedUser } } = await supabase.auth.getUser();
                userData = fetchedUser;
              }
            }
            
            if (userData) {
              // Create fallback profile immediately (don't wait for DB)
              const fallbackProfile = {
                id: actualUserId,
                user_id: actualUserId,
                email: userData.email || '',
                full_name: userData.user_metadata?.name || userData.email?.split('@')[0] || 'User',
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
              // Use upsert to handle cases where profile already exists
              if (retryCount === 0) {
                supabase
                  .from('profiles')
                  .upsert({
                    user_id: actualUserId,
                    email: userData.email || '',
                    full_name: userData.user_metadata?.name || userData.email?.split('@')[0] || 'User',
                    role: 'sales manager', // Use valid role enum value
                    status: 'approved', // Use valid status
                    phone: '',
                    department: ''
                  } as any, {
                    onConflict: 'user_id',
                    ignoreDuplicates: false
                  })
                  .select()
                  .single()
                  .then(({ data: newProfile, error: createError }) => {
                    if (!createError && newProfile) {
                      console.log('✅ Profile created/updated in DB successfully:', newProfile);
                      setProfile(newProfile as any);
                      profileRef.current = newProfile as any;
                    } else if (createError?.code === '23505' || createError?.message?.includes('409')) {
                      // Profile already exists, try to fetch it by user_id or email
                      console.log('Profile already exists, fetching...');
                      // Try by user_id first
                      supabase
                        .from('profiles')
                        .select('*')
                        .eq('user_id', actualUserId)
                        .maybeSingle()
                        .then(({ data: existingProfile, error: fetchError }) => {
                          if (!fetchError && existingProfile) {
                            console.log('✅ Fetched existing profile by user_id:', existingProfile);
                            setProfile(existingProfile as any);
                            profileRef.current = existingProfile as any;
                          } else {
                            // Try by email as fallback
                            supabase
                              .from('profiles')
                              .select('*')
                              .eq('email', userData.email || '')
                              .maybeSingle()
                              .then(({ data: emailProfile, error: emailError }) => {
                                if (!emailError && emailProfile) {
                                  console.log('✅ Fetched existing profile by email:', emailProfile);
                                  setProfile(emailProfile as any);
                                  profileRef.current = emailProfile as any;
                                }
                              });
                          }
                        });
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
              id: actualUserId,
              user_id: actualUserId,
              email: '',
              full_name: 'User',
              role: 'user',
              status: 'active',
              avatar_url: undefined,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            console.log('✅ Setting minimal fallback profile:', minimalFallback);
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
              id: currentUser.id,
              user_id: currentUser.id,
              full_name: currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'User',
              email: currentUser.email || '',
              role: 'user',
              status: 'active',
              avatar_url: undefined,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            console.log('📝 Setting fallback profile to prevent infinite loading:', fallbackProfile);
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
    
    // Immediate safety timeout - force clear loading after 5 seconds to prevent infinite loading
    // This is a fallback in case onAuthStateChange doesn't fire
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
    
    // OPTIMIZATION: Rely entirely on onAuthStateChange listener instead of calling getSession()
    // The listener fires INITIAL_SESSION and SIGNED_IN events which handle initialization
    // This eliminates the 2-second delay from redundant session check
    console.log('⏭️ Skipping getSession() - relying on onAuthStateChange listener for faster initialization');
    
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
        console.log('🔐 SIGNED_IN handler:', { 
          userIdChanged, 
          currentUserId, 
          userEmail: session.user.email,
          lastUserId: lastUserIdRef.current, 
          fetchInProgress: profileFetchInProgressRef.current 
        });
        
        // CRITICAL: Always clear old profile when SIGNED_IN fires to prevent user confusion
        // Even if userId hasn't changed, we want fresh data
        if (userIdChanged) {
          console.log('✅ SIGNED_IN: User ID changed, clearing old profile and user state...');
          setProfile(null);
          profileRef.current = null;
          profileFetchInProgressRef.current = false; // Reset fetch flag
        }
        
        // CRITICAL: Prevent duplicate profile fetches
        if (profileFetchInProgressRef.current) {
          console.log('⏭️ SIGNED_IN: Profile fetch already in progress, skipping duplicate');
          // Still update user state but don't fetch profile again
          lastUserIdRef.current = currentUserId;
          setUser(session.user);
          localStorage.setItem('login_timestamp', Date.now().toString());
          setLoading(false);
          return;
        }
        
        // Always update user state on SIGNED_IN (even if same user, session might be refreshed)
        console.log('✅ SIGNED_IN: Setting user state for:', { 
          id: session.user.id, 
          email: session.user.email 
        });
        lastUserIdRef.current = currentUserId;
        setUser(session.user);
        localStorage.setItem('login_timestamp', Date.now().toString());
        
        // Always fetch fresh profile on SIGNED_IN to ensure correct user data
        console.log('📞 Calling refreshProfile from SIGNED_IN with userId:', session.user.id);
        // Don't await - let it run in background, clear loading immediately
        refreshProfile(0, session.user.id, true).catch(err => {
          console.warn('⚠️ Profile fetch error (non-blocking):', err);
        });
        
        // Clear loading immediately - don't wait for profile
        // Profile will load in background and update when ready
        setLoading(false);
        console.log('✅ SIGNED_IN: User set, loading cleared (profile loading in background)');
      } else if (event === 'INITIAL_SESSION' && session?.user) {
        // OPTIMIZATION: Skip if profile fetch is already in progress from SIGNED_IN
        if (profileFetchInProgressRef.current) {
          console.log('⏭️ Skipping INITIAL_SESSION profile fetch (already in progress from SIGNED_IN)');
          // Still update user state and clear loading
          if (userIdChanged) {
            lastUserIdRef.current = currentUserId;
            setUser(session.user);
            authInitializedRef.current = true;
          }
          setLoading(false);
          return;
        }
        
        // Only update if user ID changed OR profile is null
        // This handles page refresh (profile null) vs tab switch (profile exists)
        if (userIdChanged && !authInitializedRef.current) {
          console.log('🔄 INITIAL_SESSION: User changed, setting user state');
          // Clear old profile if user changed
          if (lastUserIdRef.current && lastUserIdRef.current !== currentUserId) {
            console.log('🔄 INITIAL_SESSION: Clearing old profile');
            setProfile(null);
            profileRef.current = null;
          }
          lastUserIdRef.current = currentUserId;
          setUser(session.user);
          authInitializedRef.current = true;
          // Fetch profile in background if not already loaded (non-blocking)
          if (!profileRef.current) {
            console.log('🔄 INITIAL_SESSION: Profile is null, fetching in background...');
            refreshProfile(0, session.user.id, true).catch(err => {
              console.warn('⚠️ Profile fetch error (non-blocking):', err);
            });
          }
          // Clear loading immediately - don't wait for profile
          setLoading(false);
        } else if (!authInitializedRef.current && session.user.id === lastUserIdRef.current && !profileRef.current) {
          // Page refresh scenario: same user, but profile is null
          console.log('🔄 INITIAL_SESSION: Same user, profile null - fetching in background...');
          authInitializedRef.current = true;
          refreshProfile(0, session.user.id, true).catch(err => {
            console.warn('⚠️ Profile fetch error (non-blocking):', err);
          });
          // Clear loading immediately - don't wait for profile
          setLoading(false);
        } else {
          console.log('⏭️ Skipping INITIAL_SESSION - already initialized or profile exists');
          // Ensure loading is cleared even when skipping
          setLoading(false);
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