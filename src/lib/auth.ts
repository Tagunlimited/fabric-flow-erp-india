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

/** Known bootstrap admin — used when profile row is slow or missing. */
export const PRECONFIGURED_ADMIN_EMAIL = 'ecom@tagunlimitedclothing.com';

export function isPreConfiguredAdminEmail(email: string | null | undefined): boolean {
  return email === PRECONFIGURED_ADMIN_EMAIL;
}

/** Client-side profile placeholder until `profiles` loads (does not write to DB). */
export function buildFallbackUserProfile(
  userId: string,
  email: string,
  fullName?: string
): UserProfile {
  return {
    id: userId,
    user_id: userId,
    email,
    full_name: fullName || email.split('@')[0] || 'User',
    role: isPreConfiguredAdminEmail(email) ? 'admin' : 'user',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

const PROFILE_QUERY_TIMEOUT_MS = 8000;
const PROFILE_CACHE_KEY = 'erp_user_profile_cache_v1';
const PROFILE_CACHE_TTL_MS = 30 * 60 * 1000;
const PROFILE_CACHE_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function readCachedUserProfile(
  userId: string,
  allowStale = false
): UserProfile | null {
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      userId: string;
      profile: UserProfile;
      timestamp: number;
    };
    if (parsed.userId !== userId) return null;
    const age = Date.now() - parsed.timestamp;
    if (age > PROFILE_CACHE_TTL_MS && !(allowStale && age < PROFILE_CACHE_STALE_MS)) {
      return null;
    }
    return parsed.profile;
  } catch {
    return null;
  }
}

export function writeCachedUserProfile(userId: string, profile: UserProfile) {
  try {
    sessionStorage.setItem(
      PROFILE_CACHE_KEY,
      JSON.stringify({ userId, profile, timestamp: Date.now() })
    );
  } catch {
    // non-blocking
  }
}

export function clearCachedUserProfile() {
  try {
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // non-blocking
  }
}

function isLikelyNetworkError(message: string | undefined): boolean {
  const m = (message || '').toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('err_connection') ||
    m.includes('load failed')
  );
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
          full_name: name,
          status: 'pending_approval' 
        }
      }
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

  // AuthProvider owns session validation lifecycle; this function only reads profile data.
  async getUserProfile(userId: string, retryCount = 0, skipSessionCheck = false): Promise<UserProfile | null> {
    const maxRetries = 2;
    const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 3000); // Exponential backoff, max 3s
    
    try {
      console.log(`Fetching profile for user: ${userId} (attempt ${retryCount + 1}/${maxRetries + 1}, skipSessionCheck: ${skipSessionCheck})`);
      
      // Fetch profile - explicitly include avatar_url
      // Use maybeSingle() which returns null if no row found (doesn't throw error)
      // Add timeout to the query itself
      // Try by user_id first
      let queryPromise = supabase
        .from('profiles')
        .select('id, user_id, full_name, email, role, phone, department, status, avatar_url, created_at, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      const queryTimeout = new Promise<{ data: null, error: { message: string, code?: string } }>((resolve) => {
        setTimeout(() => {
          resolve({ data: null, error: { message: 'Query timeout', code: 'TIMEOUT' } });
        }, PROFILE_QUERY_TIMEOUT_MS);
      });
      
      const result = await Promise.race([queryPromise, queryTimeout]);
      let { data, error } = result;

      // If query failed or returned no data, try fetching by email as fallback
      if ((error || !data) && error?.code !== 'TIMEOUT') {
        const currentUser = await this.getCurrentUser();
        if (currentUser?.email) {
          console.log('Profile not found by user_id, trying by email...');
          const emailQuery = supabase
            .from('profiles')
            .select('id, user_id, full_name, email, role, phone, department, status, avatar_url, created_at, updated_at')
            .eq('email', currentUser.email)
            .maybeSingle();
          
          const emailResult = await Promise.race([emailQuery, queryTimeout]);
          if (!emailResult.error && emailResult.data) {
            console.log('✅ Profile found by email:', emailResult.data);
            data = emailResult.data;
            error = null;
          }
        }
      }

      // FIX: Handle "No rows found" and timeout as normal cases, not errors
      if (error) {
        // Handle query timeout - return null to allow fallback profile
        if (error.code === 'TIMEOUT' || error.message?.includes('timeout') || error.message?.includes('Query timeout')) {
          console.warn(
            'ℹ️ Profile query timed out (server slow or unreachable). Using cache/fallback if available.'
          );
          return null;
        }

        if (isLikelyNetworkError(error.message)) {
          console.warn(
            'ℹ️ Cannot reach Supabase (network). Check Wi‑Fi/VPN/firewall or project status — using cache/fallback.'
          );
          return null;
        }
        
        // PGRST116 = "No rows found" - this is normal if profile doesn't exist
        // 406 = Not Acceptable (often RLS policy issue) - treat as not found
        if (error.code === 'PGRST116' || error.code === '406' || error.message?.includes('No rows found') || error.message?.includes('Not Acceptable')) {
          console.log('ℹ️ No profile found for user (this is normal if profile not created yet)');
          return null; // Return null immediately, don't treat as error
        }
        
        console.error('Profile fetch error:', error);
        
        // Auth/session failures are handled by AuthProvider.
        if (error.code === '401' || error.code === 'PGRST301' ||
            error.message?.includes('JWT') || error.message?.includes('expired') ||
            error.message?.includes('unauthorized') || error.message?.includes('Invalid API key')) {
          return null;
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
      
      // Missing profile is handled by caller; do not auto-create here to avoid role/status drift.
      if (!data) return null;
      
      writeCachedUserProfile(userId, data as UserProfile);
      return data as UserProfile;
    } catch (error: any) {
      const msg = error?.message || 'Unknown error';
      if (isLikelyNetworkError(msg)) {
        console.warn(
          `Profile fetch failed (attempt ${retryCount + 1}): network — cannot reach Supabase.`,
          msg
        );
      } else {
        console.warn(`Profile fetch failed (attempt ${retryCount + 1}):`, msg);
      }

      if (retryCount < maxRetries && (
        isLikelyNetworkError(msg) ||
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
  async createUserProfile(
    userId: string,
    email: string,
    name: string,
    role: string = 'sales manager',
    status: string = 'pending_approval'
  ): Promise<UserProfile> {
    console.log('Creating profile for:', { userId, email, name });
    
    // First, try to fetch existing profile by user_id or email
    const { data: existingByUserId } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    const { data: existingByEmail } = existingByUserId ? null : await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .maybeSingle();
    
    const existingProfile = existingByUserId || existingByEmail;
    
    if (existingProfile) {
      console.log('Profile already exists, updating if needed:', existingProfile);
      // Update the profile if user_id doesn't match (fix orphaned profiles)
      if (existingProfile.user_id !== userId) {
        const { data: updatedProfile, error: updateError } = await supabase
          .from('profiles')
          .update({
            user_id: userId,
            full_name: name,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingProfile.id)
          .select()
          .single();
        
        if (!updateError && updatedProfile) {
          console.log('Updated profile with correct user_id:', updatedProfile);
          return updatedProfile as UserProfile;
        }
      }
      return existingProfile as UserProfile;
    }
    
    // Profile doesn't exist, create it.
    // Use insert (not upsert) so we never overwrite an existing role/status.
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        user_id: userId,
        email: email,
        full_name: name,
        role: role as any,
        status: status as any,
        phone: '', // Add required fields with defaults
        department: '',
        updated_at: new Date().toISOString()
      } as any)
      .select()
      .single();

    if (error) {
      // If it's a conflict error (email or user_id), try to fetch the existing profile
      if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('409')) {
        console.log('Profile conflict detected, fetching existing profile...');
        // Try by user_id first
        let { data: existingProfile, error: fetchError } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        
        // If not found by user_id, try by email
        if (fetchError || !existingProfile) {
          const emailResult = await supabase
            .from('profiles')
            .select('*')
            .eq('email', email)
            .maybeSingle();
          existingProfile = emailResult.data;
          fetchError = emailResult.error;
        }
        
        if (!fetchError && existingProfile) {
          console.log('Fetched existing profile:', existingProfile);
          return existingProfile as UserProfile;
        }
      }
      console.error('Profile creation error:', error);
      throw error;
    }
    
    console.log('Profile created/updated successfully:', data);
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