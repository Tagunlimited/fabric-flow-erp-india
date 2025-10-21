import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export function SetupAdminPermissions() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const setupAdminPermissions = async () => {
    setLoading(true);
    try {
      // Get admin role
      const { data: roles, error: rolesError } = await supabase
        .from('roles')
        .select('*')
        .or('name.ilike.%admin%,name.ilike.%mukesh%');

      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) {
        throw new Error('No admin role found');
      }

      const adminRole = roles[0];
      console.log('Admin role found:', adminRole);

      // Get all sidebar items
      const { data: sidebarItems, error: sidebarError } = await supabase
        .from('sidebar_items')
        .select('*')
        .eq('is_active', true);

      if (sidebarError) throw sidebarError;
      console.log('Sidebar items found:', sidebarItems?.length);

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

      // Verify permissions were created
      const { data: createdPermissions, error: verifyError } = await supabase
        .from('role_sidebar_permissions')
        .select(`
          *,
          role:roles(name),
          sidebar_item:sidebar_items(title)
        `)
        .eq('role_id', adminRole.id);

      if (verifyError) throw verifyError;

      setResult({
        success: true,
        adminRole: adminRole.name,
        permissionsCreated: createdPermissions?.length || 0,
        permissions: createdPermissions
      });

      toast.success(`Admin permissions setup complete! Created ${createdPermissions?.length || 0} permissions.`);

    } catch (error: any) {
      console.error('Error setting up admin permissions:', error);
      setResult({
        success: false,
        error: error.message
      });
      toast.error(`Failed to setup admin permissions: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle>Setup Admin Permissions</CardTitle>
        <p className="text-sm text-muted-foreground">
          This will grant all sidebar permissions to the admin role so you can see all options.
        </p>
        <Button onClick={setupAdminPermissions} disabled={loading}>
          {loading ? 'Setting up...' : 'Setup Admin Permissions'}
        </Button>
      </CardHeader>
      <CardContent>
        {result && (
          <div className="space-y-4">
            <div className={`p-4 rounded ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              <h4 className="font-medium">{result.success ? 'Success!' : 'Error'}</h4>
              <p className="text-sm mt-1">
                {result.success 
                  ? `Created ${result.permissionsCreated} permissions for role: ${result.adminRole}`
                  : result.error
                }
              </p>
            </div>
            
            {result.success && result.permissions && (
              <div>
                <h5 className="font-medium mb-2">Created Permissions:</h5>
                <div className="max-h-40 overflow-y-auto">
                  {result.permissions.map((perm: any, index: number) => (
                    <div key={index} className="text-sm py-1">
                      ✓ {perm.sidebar_item?.title || 'Unknown'} - View: {perm.can_view ? 'Yes' : 'No'}, Edit: {perm.can_edit ? 'Yes' : 'No'}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
