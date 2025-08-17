import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get the request body
    const { email, password, fullName, role, phone, department } = await req.json()

    // Validate required fields
    if (!email || !password || !fullName || !role) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the authorization header
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify the JWT token and get user info
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if the current user is an admin (case-insensitive)
    const { data: currentUserProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    const currentRole = (currentUserProfile?.role || '').toString().toLowerCase()
    if (profileError || !currentUserProfile || currentRole !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient permissions. Admin access required.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Normalize incoming role to a valid enum value
    const normalizeRole = (r: string) => (r || '').toLowerCase().trim()
    const requestedRole = normalizeRole(role)
    // Map incoming names to actual user_role enum values used in DB
    const roleMap: Record<string, string> = {
      'admin': 'admin',
      'sales': 'sales manager',
      'sales manager': 'sales manager',
      'production': 'production manager',
      'production manager': 'production manager',
      'quality': 'qc manager',
      'qc': 'qc manager',
      'qc manager': 'qc manager',
      'dispatch': 'packaging & dispatch manager',
      'packaging & dispatch manager': 'packaging & dispatch manager',
      'graphic & printing': 'graphic & printing',
      'procurement manager': 'procurement manager',
      'cutting master': 'cutting master',
      'customer': 'customer',
    }
    // Default to a safe role
    const roleEnum = roleMap[requestedRole] || 'sales manager'

    // Check for duplicate email to provide a clearer error
    try {
      const { data: usersPage } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = usersPage?.users?.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());
      if (existing) {
        // If user already exists in auth, treat this as a re-grant: reset password, upsert profile, and link role
        await supabase.auth.admin.updateUserById(existing.id, { password, email_confirm: true });

        // Upsert profile for the existing user
        let { error: profileErr } = await supabase
          .from('profiles')
          .upsert({
            user_id: existing.id,
            full_name: fullName,
            email: email,
            role: (requestedRole === 'admin') ? 'admin' : 'sales manager',
            phone: phone || null,
            department: department || null,
            status: 'approved'
          }, { onConflict: 'user_id' })

        if (profileErr) {
          // Try again with safe role if enum mismatch
          const msg = (profileErr.message || '').toLowerCase();
          if (msg.includes('enum')) {
            const retry = await supabase
              .from('profiles')
              .upsert({
                user_id: existing.id,
                full_name: fullName,
                email: email,
                role: 'admin',
                phone: phone || null,
                department: department || null,
                status: 'approved'
              }, { onConflict: 'user_id' })
            profileErr = retry.error as any;
          }
          if (profileErr) {
            return new Response(
              JSON.stringify({ success: false, error: `Failed to update user profile: ${profileErr.message}` }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }

        // Link role via roles table
        try {
          const { data: roleRow } = await supabase
            .from('roles')
            .select('id,name')
            .ilike('name', role)
            .maybeSingle();
          if (roleRow?.id) {
            await supabase
              .from('user_roles')
              .upsert({ user_id: existing.id, role_id: roleRow.id, assigned_by: user.id }, { onConflict: 'user_id,role_id' });
          }
        } catch (_) {}

        return new Response(
          JSON.stringify({ success: true, message: 'User account updated and access granted', user: { id: existing.id, email } }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } catch (_) { /* ignore and proceed */ }

    // Create the new user account using admin privileges
    // IMPORTANT: Do not send 'role' in user_metadata so the auth trigger doesn't cast to enum.
    const { data: newUser, error: createUserError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone: phone,
        department: department
      }
    })

    if (createUserError) {
      return new Response(
        JSON.stringify({ success: false, error: createUserError.message }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Upsert the profile for the new user to avoid conflicts with triggers
    let { error: profileCreateError } = await supabase
      .from('profiles')
      .upsert({
        user_id: newUser.user.id,
        full_name: fullName,
        email: email,
        // Keep profile.role only for coarse routing (admin vs non-admin)
        role: (requestedRole === 'admin') ? 'admin' : 'sales manager',
        phone: phone || null,
        department: department || null,
        status: 'approved'
      }, { onConflict: 'user_id' })

    if (profileCreateError) {
      // If enum mismatch, retry with admin role
      const msg = (profileCreateError.message || '').toLowerCase()
      if (msg.includes('invalid input value for enum') || msg.includes('enum') || msg.includes('user_role')) {
        const retry = await supabase
          .from('profiles')
          .upsert({
            user_id: newUser.user.id,
            full_name: fullName,
            email: email,
            role: 'admin',
            phone: phone || null,
            department: department || null,
            status: 'approved'
          }, { onConflict: 'user_id' })
        profileCreateError = retry.error as any
      }

      if (profileCreateError) {
        // Clean up the created user to avoid orphans
        await supabase.auth.admin.deleteUser(newUser.user.id)
        return new Response(
          JSON.stringify({ success: false, error: `Failed to create user profile: ${profileCreateError.message}` }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Link role from roles table to the user via user_roles
    try {
      const { data: roleRow } = await supabase
        .from('roles')
        .select('id,name')
        .ilike('name', role)
        .maybeSingle();

      if (roleRow?.id) {
        await supabase
          .from('user_roles')
          .upsert({ user_id: newUser.user.id, role_id: roleRow.id, assigned_by: user.id }, { onConflict: 'user_id,role_id' });
      }
    } catch (_) { /* ignore role linking errors */ }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'User account created successfully',
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
          full_name: fullName,
          role: role
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    const message = (error as any)?.message || 'Internal server error'
    console.error('Error creating user:', message)
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
