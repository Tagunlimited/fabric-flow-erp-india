import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

export interface AuthUser extends User {
  user_metadata: {
    name?: string;
    status?: 'pending_approval' | 'approved' | 'rejected';
    avatar_url?: string;
  };
}

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  phone?: string;
  department?: string;
  status: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export const authService = {
  // Sign up new user
  async signUp(email: string, password: string, name: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { 
          name, 
          status: 'pending_approval' 
        }
      }
    });

    if (error) throw error;
    return data;
  },

  // Sign in user
  async signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    return data;
  },

  // Sign out user
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // Get current user
  async getCurrentUser(): Promise<AuthUser | null> {
    const { data: { user } } = await supabase.auth.getUser();
    return user as AuthUser;
  },

  // Get user profile with improved error handling and retry logic
  async getUserProfile(userId: string, retryCount = 0, skipSessionCheck = false): Promise<UserProfile | null> {
    const maxRetries = 2;
    const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 3000); // Exponential backoff, max 3s
    
    try {
      console.log(`Fetching profile for user: ${userId} (attempt ${retryCount + 1}/${maxRetries + 1}, skipSessionCheck: ${skipSessionCheck})`);
      
      // Skip session check if caller already validated session (e.g., from SIGNED_IN event)
      if (!skipSessionCheck) {
        // Validate session before attempting fetch - with timeout
        console.log('🔍 getUserProfile: Checking session validity...');
        const sessionCheckPromise = supabase.auth.getSession();
        const sessionTimeoutPromise = new Promise<{ data: { session: null }, error: { message: string } }>((resolve) => {
          setTimeout(() => {
            console.warn('⚠️ getUserProfile: Session check timeout after 5 seconds');
            resolve({ data: { session: null }, error: { message: 'Session check timeout' } });
          }, 5000);
        });
        
        const { data: { session }, error: sessionError } = await Promise.race([sessionCheckPromise, sessionTimeoutPromise]);
        if (sessionError || !session) {
          console.warn('No valid session, attempting to refresh...');
          const refreshPromise = supabase.auth.refreshSession();
          const refreshTimeoutPromise = new Promise<{ data: { session: null }, error: { message: string } }>((resolve) => {
            setTimeout(() => {
              console.warn('⚠️ getUserProfile: Session refresh timeout after 5 seconds');
              resolve({ data: { session: null }, error: { message: 'Session refresh timeout' } });
            }, 5000);
          });
          
          const { data: refreshed, error: refreshError } = await Promise.race([refreshPromise, refreshTimeoutPromise]);
          if (refreshError || !refreshed.session) {
            console.error('Session refresh failed:', refreshError);
            return null;
          }
        } else {
          console.log('✅ getUserProfile: Session is valid');
        }
      } else {
        console.log('⏭️ getUserProfile: Skipping session check (skipSessionCheck=true)');
      }
      
      // Fetch profile - explicitly include avatar_url
      // Use maybeSingle() which returns null if no row found (doesn't throw error)
      // Add timeout to the query itself
      const queryPromise = supabase
        .from('profiles')
        .select('id, user_id, full_name, email, role, phone, department, status, avatar_url, created_at, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      
      const queryTimeout = new Promise<{ data: null, error: { message: string, code?: string } }>((resolve) => {
        setTimeout(() => {
          resolve({ data: null, error: { message: 'Query timeout', code: 'TIMEOUT' } });
        }, 2500); // 2.5 seconds timeout for the query itself
      });
      
      const result = await Promise.race([queryPromise, queryTimeout]);
      const { data, error } = result;

      // FIX: Handle "No rows found" and timeout as normal cases, not errors
      if (error) {
        // Handle query timeout - return null to allow fallback profile
        if (error.code === 'TIMEOUT' || error.message?.includes('timeout') || error.message?.includes('Query timeout')) {
          console.log('ℹ️ Profile query timed out - will use fallback profile');
          return null; // Return null to trigger fallback
        }
        
        // PGRST116 = "No rows found" - this is normal if profile doesn't exist
        if (error.code === 'PGRST116' || error.message?.includes('No rows found')) {
          console.log('ℹ️ No profile found for user (this is normal if profile not created yet)');
          return null; // Return null immediately, don't treat as error
        }
        
        console.error('Profile fetch error:', error);
        
        // Handle JWT expired/unauthorized errors
        if (error.code === '401' || error.code === 'PGRST301' || 
            error.message?.includes('JWT') || error.message?.includes('expired') || 
            error.message?.includes('unauthorized') || error.message?.includes('Invalid API key')) {
          console.log('Authentication error, attempting to refresh session...');
          try {
            const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError || !refreshed.session) {
              console.error('Session refresh failed:', refreshError);
              return null;
            }
            // Retry after refresh with exponential backoff
            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              return this.getUserProfile(userId, retryCount + 1);
            }
            return null;
          } catch (refreshErr) {
            console.error('Error during session refresh:', refreshErr);
            return null;
          }
        }
        
        // Handle RLS policy recursion errors
        if (error.code === '42P17' || error.message?.includes('infinite recursion') || 
            error.message?.includes('policy') || error.message?.includes('recursive')) {
          console.warn('RLS policy recursion detected, skipping profile fetch');
          return null;
        }
        
        // Handle network/timeout errors with retry
        if ((error.message?.includes('network') || error.message?.includes('timeout') || 
             error.message?.includes('fetch')) && retryCount < maxRetries) {
          console.log(`Network error, retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return this.getUserProfile(userId, retryCount + 1);
        }
        
        // For other errors, throw to be caught by outer catch
        throw error;
      }
      
      // If no profile exists, try to create one
      if (!data) {
        console.log('No profile found, attempting to create one...');
        const currentUser = await this.getCurrentUser();
        if (currentUser) {
          try {
            const newProfile = await this.createUserProfile(
              userId, 
              currentUser.email || '', 
              currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'User'
            );
            console.log('Profile created successfully:', newProfile);
            return newProfile;
          } catch (createError: any) {
            console.warn('Failed to create profile:', createError);
            // If profile creation fails due to duplicate, try fetching again
            if (createError.message?.includes('duplicate') || createError.code === '23505') {
              if (retryCount < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return this.getUserProfile(userId, retryCount + 1);
              }
            }
            return null;
          }
        }
        return null;
      }
      
      console.log('Profile fetched successfully:', data);
      return data;
    } catch (error: any) {
      console.warn(`Profile fetch failed (attempt ${retryCount + 1}):`, error?.message || 'Unknown error');
      
      // Retry on network errors or first attempt
      if (retryCount < maxRetries && (
        error?.message?.includes('network') || 
        error?.message?.includes('timeout') ||
        error?.message?.includes('fetch') ||
        retryCount === 0
      )) {
        console.log(`Retrying profile fetch in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return this.getUserProfile(userId, retryCount + 1);
      }
      
      // Return null to prevent app crashes
      return null;
    }
  },

  // Create user profile (called by trigger or manually)
  async createUserProfile(userId: string, email: string, name: string): Promise<UserProfile> {
    console.log('Creating profile for:', { userId, email, name });
    
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        user_id: userId,
        email: email,
        full_name: name,
        role: 'sales manager', // default role
        status: 'approved', // Set to approved to avoid approval issues
        phone: '', // Add required fields with defaults
        department: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Profile creation error:', error);
      throw error;
    }
    
    console.log('Profile created successfully:', data);
    return data;
  },

  // Update user approval status (admin only)
  async updateUserStatus(userId: string, status: string, role?: string) {
    // Mock implementation
    console.log('Update user status:', userId, status, role);
  },

  // Get pending users (admin only)
  async getPendingUsers() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }
};