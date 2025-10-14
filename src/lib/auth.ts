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

  // Get user profile
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      // First check if we can access the profiles table at all
      // If RLS policies are causing recursion, this will fail gracefully
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        // Handle RLS policy recursion errors
        if (error.code === '42P17' || error.message.includes('infinite recursion') || error.message.includes('policy')) {
          console.warn('RLS policy recursion detected, skipping profile fetch');
          return null;
        }
        throw error;
      }
      
      return data;
    } catch (error) {
      // Catch any other errors and return null to prevent app crashes
      console.warn('Profile fetch failed, continuing without profile:', error.message);
      return null;
    }
  },

  // Create user profile (called by trigger or manually)
  async createUserProfile(userId: string, email: string, name: string): Promise<UserProfile> {
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        user_id: userId,
        email: email,
        full_name: name,
        role: 'sales manager', // default role
        status: 'pending_approval'
      })
      .select()
      .single();

    if (error) throw error;
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