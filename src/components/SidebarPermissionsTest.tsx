import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useSidebarPermissions } from '@/hooks/useSidebarPermissions';
import { toast } from 'sonner';

interface TestResult {
  test: string;
  status: 'pass' | 'fail' | 'pending';
  message: string;
  details?: any;
}

export function SidebarPermissionsTest() {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const { user } = useAuth();
  const { items: sidebarItems, loading, error } = useSidebarPermissions();

  const runTests = async () => {
    setRunning(true);
    setTestResults([]);

    const tests: TestResult[] = [];

    // Test 1: Check if sidebar_items table exists
    try {
      const { data, error } = await supabase
        .from('sidebar_items')
        .select('count')
        .limit(1);
      
      tests.push({
        test: 'Sidebar Items Table',
        status: error ? 'fail' : 'pass',
        message: error ? `Table missing: ${error.message}` : 'Table exists',
        details: error
      });
    } catch (err) {
      tests.push({
        test: 'Sidebar Items Table',
        status: 'fail',
        message: `Error: ${err}`,
        details: err
      });
    }

    // Test 2: Check if role_sidebar_permissions table exists
    try {
      const { data, error } = await supabase
        .from('role_sidebar_permissions')
        .select('count')
        .limit(1);
      
      tests.push({
        test: 'Role Permissions Table',
        status: error ? 'fail' : 'pass',
        message: error ? `Table missing: ${error.message}` : 'Table exists',
        details: error
      });
    } catch (err) {
      tests.push({
        test: 'Role Permissions Table',
        status: 'fail',
        message: `Error: ${err}`,
        details: err
      });
    }

    // Test 3: Check if user_sidebar_permissions table exists
    try {
      const { data, error } = await supabase
        .from('user_sidebar_permissions')
        .select('count')
        .limit(1);
      
      tests.push({
        test: 'User Permissions Table',
        status: error ? 'fail' : 'pass',
        message: error ? `Table missing: ${error.message}` : 'Table exists',
        details: error
      });
    } catch (err) {
      tests.push({
        test: 'User Permissions Table',
        status: 'fail',
        message: `Error: ${err}`,
        details: err
      });
    }

    // Test 4: Check if roles table exists and has data
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .limit(5);
      
      tests.push({
        test: 'Roles Table',
        status: error ? 'fail' : data?.length ? 'pass' : 'fail',
        message: error ? `Table missing: ${error.message}` : 
                 data?.length ? `Found ${data.length} roles` : 'No roles found',
        details: data
      });
    } catch (err) {
      tests.push({
        test: 'Roles Table',
        status: 'fail',
        message: `Error: ${err}`,
        details: err
      });
    }

    // Test 5: Check if user has a profile
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user?.id)
        .single();
      
      tests.push({
        test: 'User Profile',
        status: error ? 'fail' : 'pass',
        message: error ? `Profile missing: ${error.message}` : `Profile found: ${data?.role}`,
        details: data
      });
    } catch (err) {
      tests.push({
        test: 'User Profile',
        status: 'fail',
        message: `Error: ${err}`,
        details: err
      });
    }

    // Test 6: Check if user has roles assigned
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          *,
          role:roles(*)
        `)
        .eq('user_id', user?.id);
      
      tests.push({
        test: 'User Roles',
        status: error ? 'fail' : data?.length ? 'pass' : 'fail',
        message: error ? `Error: ${error.message}` : 
                 data?.length ? `Found ${data.length} roles` : 'No roles assigned',
        details: data
      });
    } catch (err) {
      tests.push({
        test: 'User Roles',
        status: 'fail',
        message: `Error: ${err}`,
        details: err
      });
    }

    // Test 7: Check sidebar permissions hook
    tests.push({
      test: 'Sidebar Permissions Hook',
      status: loading ? 'pending' : error ? 'fail' : 'pass',
      message: loading ? 'Loading...' : 
               error ? `Error: ${error}` : 
               `Loaded ${sidebarItems.length} items`,
      details: { loading, error, itemCount: sidebarItems.length }
    });

    // Test 8: Check if helper function exists
    try {
      const { data, error } = await supabase
        .rpc('get_user_sidebar_permissions', { p_user_id: user?.id });
      
      tests.push({
        test: 'Helper Function',
        status: error ? 'fail' : 'pass',
        message: error ? `Function missing: ${error.message}` : 
                 `Function works, returned ${data?.length || 0} permissions`,
        details: data
      });
    } catch (err) {
      tests.push({
        test: 'Helper Function',
        status: 'fail',
        message: `Error: ${err}`,
        details: err
      });
    }

    setTestResults(tests);
    setRunning(false);

    const passedTests = tests.filter(t => t.status === 'pass').length;
    const totalTests = tests.length;
    
    if (passedTests === totalTests) {
      toast.success(`All ${totalTests} tests passed! Sidebar permissions system is working correctly.`);
    } else {
      toast.warning(`${passedTests}/${totalTests} tests passed. Some issues need to be fixed.`);
    }
  };

  const setupAdminPermissions = async () => {
    try {
      // Get admin role
      const { data: roles, error: rolesError } = await supabase
        .from('roles')
        .select('*')
        .or('name.ilike.%admin%,name.ilike.%mukesh%')
        .limit(1);

      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) {
        throw new Error('No admin role found');
      }

      const adminRole = roles[0];

      // Get all sidebar items
      const { data: sidebarItems, error: sidebarError } = await supabase
        .from('sidebar_items')
        .select('*')
        .eq('is_active', true);

      if (sidebarError) throw sidebarError;

      // Create permissions for each sidebar item
      const permissions = sidebarItems?.map(item => ({
        role_id: adminRole.id,
        sidebar_item_id: item.id,
        can_view: true,
        can_edit: true
      })) || [];

      // Insert permissions
      const { error: insertError } = await supabase
        .from('role_sidebar_permissions')
        .upsert(permissions, { 
          onConflict: 'role_id,sidebar_item_id',
          ignoreDuplicates: false 
        });

      if (insertError) throw insertError;

      toast.success(`Admin permissions setup complete! Created ${permissions.length} permissions.`);
      
      // Re-run tests
      setTimeout(() => runTests(), 1000);
    } catch (error: any) {
      console.error('Error setting up admin permissions:', error);
      toast.error(`Failed to setup admin permissions: ${error.message}`);
    }
  };

  const assignUserRole = async () => {
    if (!user) {
      toast.error('No user found');
      return;
    }

    try {
      // Get admin role
      const { data: roles, error: rolesError } = await supabase
        .from('roles')
        .select('*')
        .or('name.ilike.%admin%,name.ilike.%mukesh%')
        .limit(1);

      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) {
        throw new Error('No admin role found');
      }

      const adminRole = roles[0];

      // Assign role to user
      const { error: assignError } = await supabase
        .from('user_roles')
        .upsert({
          user_id: user.id,
          role_id: adminRole.id,
          assigned_by: user.id
        }, {
          onConflict: 'user_id,role_id'
        });

      if (assignError) throw assignError;

      toast.success('Admin role assigned to current user!');
      
      // Re-run tests
      setTimeout(() => runTests(), 1000);
    } catch (error: any) {
      console.error('Error assigning role:', error);
      toast.error(`Failed to assign role: ${error.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sidebar Permissions System Test</CardTitle>
          <p className="text-sm text-muted-foreground">
            Test the sidebar permissions system to ensure it's working correctly.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-2">
            <Button onClick={runTests} disabled={running}>
              {running ? 'Running Tests...' : 'Run Tests'}
            </Button>
            <Button onClick={setupAdminPermissions} variant="outline">
              Setup Admin Permissions
            </Button>
            <Button onClick={assignUserRole} variant="outline">
              Assign Admin Role
            </Button>
          </div>

          {testResults.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium">Test Results:</h4>
              {testResults.map((result, index) => (
                <div key={index} className="flex items-center space-x-2 p-2 border rounded">
                  <Badge 
                    variant={result.status === 'pass' ? 'default' : 
                            result.status === 'fail' ? 'destructive' : 'secondary'}
                  >
                    {result.status === 'pass' ? '✓' : 
                     result.status === 'fail' ? '✗' : '⏳'}
                  </Badge>
                  <div className="flex-1">
                    <div className="font-medium">{result.test}</div>
                    <div className="text-sm text-muted-foreground">{result.message}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">Current Sidebar Items:</h4>
            {loading ? (
              <p>Loading sidebar items...</p>
            ) : error ? (
              <p className="text-red-600">Error: {error}</p>
            ) : (
              <div className="space-y-1">
                {sidebarItems.length === 0 ? (
                  <p className="text-muted-foreground">No sidebar items loaded</p>
                ) : (
                  sidebarItems.map((item, index) => (
                    <div key={index} className="text-sm">
                      • {item.title} {item.url && `(${item.url})`}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
