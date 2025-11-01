import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DatabaseTest() {
  const [testResults, setTestResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testDatabaseTables = async () => {
    setLoading(true);
    const results: any = {};

    try {
      // Test sidebar_items table
      const { data: sidebarItems, error: sidebarError } = await supabase
        .from('sidebar_items')
        .select('*')
        .limit(5);
      
      results.sidebar_items = {
        exists: !sidebarError,
        error: sidebarError?.message,
        count: sidebarItems?.length || 0,
        sample: sidebarItems?.[0] || null
      };

      // Test role_sidebar_permissions table
      const { data: rolePerms, error: rolePermsError } = await supabase
        .from('role_sidebar_permissions')
        .select('*')
        .limit(5);
      
      results.role_sidebar_permissions = {
        exists: !rolePermsError,
        error: rolePermsError?.message,
        count: rolePerms?.length || 0,
        sample: rolePerms?.[0] || null
      };

      // Test user_sidebar_permissions table
      const { data: userPerms, error: userPermsError } = await supabase
        .from('user_sidebar_permissions')
        .select('*')
        .limit(5);
      
      results.user_sidebar_permissions = {
        exists: !userPermsError,
        error: userPermsError?.message,
        count: userPerms?.length || 0,
        sample: userPerms?.[0] || null
      };

      // Test roles table
      const { data: roles, error: rolesError } = await supabase
        .from('roles')
        .select('*')
        .limit(5);
      
      results.roles = {
        exists: !rolesError,
        error: rolesError?.message,
        count: roles?.length || 0,
        sample: roles?.[0] || null
      };

    } catch (error) {
      results.error = error;
    }

    setTestResults(results);
    setLoading(false);
  };

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle>Database Tables Test</CardTitle>
        <Button onClick={testDatabaseTables} disabled={loading}>
          {loading ? 'Testing...' : 'Test Database Tables'}
        </Button>
      </CardHeader>
      <CardContent>
        {testResults && (
          <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
            {JSON.stringify(testResults, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
