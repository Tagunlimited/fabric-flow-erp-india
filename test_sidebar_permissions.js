// Test script to verify sidebar permissions system
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'your-supabase-url';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'your-supabase-key';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSidebarPermissions() {
  console.log('🧪 Testing Sidebar Permissions System...\n');

  try {
    // 1. Check if sidebar items exist
    console.log('1. Checking sidebar items...');
    const { data: sidebarItems, error: itemsError } = await supabase
      .from('sidebar_items')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (itemsError) {
      console.error('❌ Error fetching sidebar items:', itemsError);
      return;
    }

    console.log(`✅ Found ${sidebarItems.length} sidebar items`);
    console.log('Items:', sidebarItems.map(item => ({ title: item.title, url: item.url })));

    // 2. Check if roles exist
    console.log('\n2. Checking roles...');
    const { data: roles, error: rolesError } = await supabase
      .from('roles')
      .select('*');

    if (rolesError) {
      console.error('❌ Error fetching roles:', rolesError);
      return;
    }

    console.log(`✅ Found ${roles.length} roles`);
    console.log('Roles:', roles.map(role => ({ name: role.name, description: role.description })));

    // 3. Check role permissions
    console.log('\n3. Checking role permissions...');
    const { data: rolePermissions, error: rolePermsError } = await supabase
      .from('role_sidebar_permissions')
      .select(`
        *,
        role:roles(name),
        sidebar_item:sidebar_items(title, url)
      `);

    if (rolePermsError) {
      console.error('❌ Error fetching role permissions:', rolePermsError);
      return;
    }

    console.log(`✅ Found ${rolePermissions.length} role permissions`);
    rolePermissions.forEach(perm => {
      console.log(`  - ${perm.role?.name}: ${perm.sidebar_item?.title} (view: ${perm.can_view}, edit: ${perm.can_edit})`);
    });

    // 4. Check user permissions
    console.log('\n4. Checking user permissions...');
    const { data: userPermissions, error: userPermsError } = await supabase
      .from('user_sidebar_permissions')
      .select(`
        *,
        sidebar_item:sidebar_items(title, url)
      `);

    if (userPermsError) {
      console.error('❌ Error fetching user permissions:', userPermsError);
      return;
    }

    console.log(`✅ Found ${userPermissions.length} user permissions`);
    userPermissions.forEach(perm => {
      console.log(`  - User ${perm.user_id}: ${perm.sidebar_item?.title} (view: ${perm.can_view}, edit: ${perm.can_edit}, override: ${perm.is_override})`);
    });

    // 5. Test the get_user_sidebar_permissions function
    console.log('\n5. Testing get_user_sidebar_permissions function...');
    
    // Get a sample user ID (you might need to replace this with an actual user ID)
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, role')
      .limit(1);

    if (profilesError || !profiles || profiles.length === 0) {
      console.log('⚠️  No profiles found to test with');
    } else {
      const testUserId = profiles[0].user_id;
      console.log(`Testing with user: ${testUserId} (role: ${profiles[0].role})`);

      const { data: userSidebarPerms, error: userSidebarPermsError } = await supabase
        .rpc('get_user_sidebar_permissions', { p_user_id: testUserId });

      if (userSidebarPermsError) {
        console.error('❌ Error calling get_user_sidebar_permissions:', userSidebarPermsError);
      } else {
        console.log(`✅ Function returned ${userSidebarPerms.length} permissions for user`);
        userSidebarPerms.forEach(perm => {
          console.log(`  - ${perm.title} (${perm.url}): view=${perm.can_view}, edit=${perm.can_edit}`);
        });
      }
    }

    console.log('\n🎉 Sidebar permissions system test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testSidebarPermissions();
