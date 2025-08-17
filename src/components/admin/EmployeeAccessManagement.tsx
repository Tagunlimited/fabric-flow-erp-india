import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { CheckCircle, XCircle, Clock, Users, UserCheck, UserX, Plus, Edit, Trash2, Key, Mail, Phone, MapPin, Calendar, Briefcase } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, differenceInYears, differenceInMonths } from 'date-fns';

interface Employee {
  id: string;
  employee_code: string;
  full_name: string;
  date_of_birth: string;
  gender: string;
  marital_status?: string;
  blood_group?: string;
  personal_email?: string;
  personal_phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  address_line1: string;
  city: string;
  state: string;
  pincode: string;
  designation: string;
  department: string;
  joining_date: string;
  employment_type: string;
  reports_to?: string;
  created_at: string;
  avatar_url?: string;
}

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  phone: string;
  department: string;
  status: string;
  created_at: string;
}

export function EmployeeAccessManagement() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [userProfiles, setUserProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [newUserData, setNewUserData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    role: ''
  });
  const [processingUser, setProcessingUser] = useState<string | null>(null);

  const [roles, setRoles] = useState<Array<{ id: number; name: string; description?: string }>>([]);

  // Define role mapping first to avoid scope issues
  // Note: Database only accepts 'admin' as valid enum value
  const roleMapping: { [key: string]: string } = {
    'Admin': 'admin',
    'Production Manager': 'admin', // Map to admin since production is not valid
    'Cutting Master': 'admin', // Map to admin since production is not valid
    'QC Manager': 'admin', // Map to admin since quality is not valid
    'Sales Manager': 'admin', // Map to admin since sales is not valid
    'Inventory Manager': 'admin', // Map to admin since manager is not valid
    'Accounts Manager': 'admin', // Map to admin since manager is not valid
    'HR Manager': 'admin', // Map to admin since manager is not valid
    'Procurement Manager': 'admin', // Map to admin since manager is not valid
    'Design Manager': 'admin' // Map to admin since manager is not valid
  };

  // Map role names from roles table to user_role enum values
  const mapRoleNameToEnum = (roleName: string): string => {
    // Normalize incoming display values to DB enum values
    const input = (roleName || '').trim().toLowerCase();
    const map: Record<string, string> = {
      'admin': 'admin',
      'sales manager': 'sales manager',
      'sales': 'sales manager',
      'production manager': 'production manager',
      'production': 'production manager',
      'qc manager': 'qc manager',
      'quality': 'qc manager',
      'cutting master': 'cutting master',
      'packaging & dispatch manager': 'packaging & dispatch manager',
      'dispatch': 'packaging & dispatch manager',
      'graphic & printing': 'graphic & printing',
      'procurement manager': 'procurement manager',
    };
    return map[input] || 'sales manager';
  };

  // Test database access function
  const testDatabaseAccess = async () => {
    try {
      console.log('=== TESTING DATABASE ACCESS ===');
      
      // Test 1: Basic connection
      const { data: test1, error: error1 } = await supabase
        .from('profiles')
        .select('count')
        .limit(1);
      
      console.log('Test 1 - Basic connection:', { data: test1, error: error1 });
      
      // Test 2: Check table structure
      const { data: test2, error: error2 } = await supabase
        .from('profiles')
        .select('*')
        .limit(1);
      
      console.log('Test 2 - Table structure:', { data: test2, error: error2 });
      
      // Test 3: Check if we can see any profiles
      const { data: test3, error: error3 } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, email, role')
        .limit(5);
      
      console.log('Test 3 - Sample profiles:', { data: test3, error: error3 });
      
      // Test 4: Check current user authentication
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      console.log('Test 4 - Current user:', currentUser);
      
      // Test 5: Check current user profile
      if (currentUser) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', currentUser.id)
          .single();
        
        console.log('Test 5 - Current user profile:', { data: profile, error: profileError });
      }
      
      // Test 6: Try a simple insert test (with dummy data)
      console.log('Test 6 - Testing insert permissions...');
      const testInsertData = {
        user_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
        full_name: 'TEST USER',
        email: 'test@example.com',
        role: 'sales',
        status: 'approved'
      };
      
      const { error: insertTestError } = await supabase
        .from('profiles')
        .insert(testInsertData);
      
      console.log('Test 6 - Insert test result:', { error: insertTestError });
      
      return { success: true, message: 'Database access test completed' };
    } catch (error) {
      console.error('Database access test failed:', error);
      return { success: false, error: error };
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select('*')
        .order('name');

      if (rolesError) {
        console.error('Error fetching roles:', rolesError);
        toast.error('Failed to fetch roles. Some features may be limited.');
        setRoles([]);
      } else {
        console.log('Fetched roles from database:', rolesData);
        setRoles(rolesData || []);
      }
      
      // Fetch employees
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('*')
        .order('full_name');

      if (employeesError) {
        console.error('Error fetching employees:', employeesError);
        toast.error('Failed to fetch employees.');
        setEmployees([]);
      } else {
        setEmployees(employeesData || []);
      }

      // Fetch user profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) {
        console.error('Error fetching user profiles:', profilesError);
        toast.error('Failed to fetch user profiles.');
        setUserProfiles([]);
      } else {
        setUserProfiles(profilesData || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newUserData.password !== newUserData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (!selectedEmployee) {
      toast.error('Please select an employee');
      return;
    }

    if (!newUserData.role) {
      toast.error('Please select a system role');
      return;
    }

    try {
      setProcessingUser('creating');
      
      // Ensure we have an access token to authorize the Edge Function call
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error('Not authenticated. Please sign in again.');
      }

      // Always use the Edge Function so we can re-grant access to existing emails
      const { data, error } = await supabase.functions.invoke('create-employee-user', {
        body: {
          email: newUserData.email,
          password: newUserData.password,
          fullName: selectedEmployee.full_name,
          role: newUserData.role,
          phone: selectedEmployee.personal_phone,
          department: selectedEmployee.department
        },
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (error) {
        let serverMsg = (data && (data as any).error) ? (data as any).error : undefined;
        try {
          // @ts-expect-error
          const resp = error.context?.response as Response | undefined;
          if (resp) {
            const text = await resp.text();
            if (text) {
              try { serverMsg = JSON.parse(text).error || serverMsg; } catch { serverMsg = text || serverMsg; }
            }
          }
        } catch {}
        throw new Error(serverMsg || error.message || 'Failed to create user');
      }

      if (!(data as any)?.success) {
        throw new Error(((data as any)?.error) || 'Failed to create user');
      }

      toast.success('Employee user account created successfully!');
      setShowCreateForm(false);
      setNewUserData({ email: '', password: '', confirmPassword: '', role: '' });
      setSelectedEmployee(null);
      await fetchData();
    } catch (error: any) {
      console.error('Error creating user account:', error);
      toast.error(error.message || 'Failed to create user account');
    } finally {
      setProcessingUser(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user account? This will remove their system access.')) return;

    try {
      setProcessingUser(userId);
      
      // Delete profile
      await supabase
        .from('profiles')
        .delete()
        .eq('user_id', userId);

      toast.success('User account deleted successfully');
      await fetchData();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error('Failed to delete user account');
    } finally {
      setProcessingUser(null);
    }
  };

  const getUserStatus = (employee: Employee) => {
    const hasAccount = userProfiles.some(profile => 
      profile.email === employee.personal_email || 
      profile.full_name === employee.full_name
    );
    
    if (hasAccount) {
      const profile = userProfiles.find(p => 
        p.email === employee.personal_email || 
        p.full_name === employee.full_name
      );
      return {
        status: 'active',
        label: 'Active',
        badge: <Badge className="bg-success text-success-foreground">Active</Badge>,
        profile
      };
    } else {
      return {
        status: 'no-access',
        label: 'No Access',
        badge: <Badge variant="outline">No Access</Badge>
      };
    }
  };

  const getExperienceText = (joiningDate: string) => {
    const joinDate = new Date(joiningDate);
    const now = new Date();
    const years = differenceInYears(now, joinDate);
    const months = differenceInMonths(now, joinDate) % 12;
    
    if (years > 0) {
      return `${years} Yr${years > 1 ? 's' : ''}, ${months} Month${months !== 1 ? 's' : ''}`;
    } else {
      return `${months} Month${months !== 1 ? 's' : ''}`;
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const stats = {
    total: employees.length,
    withAccess: employees.filter(emp => getUserStatus(emp).status === 'active').length,
    withoutAccess: employees.filter(emp => getUserStatus(emp).status === 'no-access').length
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        {/* <div>
          <h1 className="text-3xl font-bold">Employee Access Management</h1>
          <p className="text-gray-600 mt-1">
            Create user accounts with passwords for employees and manage their system access
          </p>
        </div> */}
                        <div className="flex items-center space-x-4">
              {/* <div className="text-sm text-muted-foreground">
                <p>💡 <strong>Note:</strong> You can now create user accounts with passwords for employees. They can log in immediately using their email and password.</p>
                <p className="mt-1">🔑 <strong>Role Mapping:</strong> Roles from the roles table are automatically mapped to system permissions.</p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={testDatabaseAccess}
                  className="mt-2"
                >
                  🔍 Test Database Access
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={async () => {
                    try {
                      console.log('=== SIMPLE PROFILE CREATION TEST ===');
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) {
                        console.error('No authenticated user');
                        return;
                      }
                      
                      const testData = {
                        user_id: user.id,
                        full_name: 'TEST PROFILE',
                        email: 'test@test.com',
                        role: 'sales',
                        status: 'approved'
                      };
                      
                      console.log('Attempting to create test profile with:', testData);
                      const { error } = await supabase.from('profiles').insert(testData);
                      
                      if (error) {
                        console.error('Test profile creation failed:', error);
                      } else {
                        console.log('Test profile created successfully!');
                        // Clean up - delete the test profile
                        await supabase.from('profiles').delete().eq('email', 'test@test.com');
                        console.log('Test profile cleaned up');
                      }
                    } catch (err) {
                      console.error('Test failed:', err);
                    }
                  }}
                  className="mt-2 ml-2"
                >
                  🧪 Test Profile Creation
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={async () => {
                    try {
                      console.log('=== TEST AUTH USER CREATION ===');
                      
                      // Try to create a minimal auth user
                      const { data, error } = await supabase.auth.signUp({
                        email: 'testauth@test.com',
                        password: 'testpass123'
                      });
                      
                      if (error) {
                        console.error('Auth user creation test failed:', error);
                      } else {
                        console.log('Auth user creation test successful:', data);
                        // Clean up - delete the test user if possible
                        if (data.user) {
                          console.log('Test auth user created with ID:', data.user.id);
                        }
                      }
                    } catch (err) {
                      console.error('Auth test failed:', err);
                    }
                  }}
                  className="mt-2 ml-2"
                >
                  🔐 Test Auth Creation
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={async () => {
                    try {
                      console.log('=== CHECK AVAILABLE ROLES ===');
                      
                      // Check what roles are available in the database
                      const { data: rolesData, error: rolesError } = await supabase
                        .from('roles')
                        .select('*')
                        .order('name');
                      
                      if (rolesError) {
                        console.error('Error fetching roles:', rolesError);
                      } else {
                        console.log('Available roles from roles table:', rolesData);
                        console.log('Role names:', rolesData?.map(r => r.name));
                      }
                      
                      // Test what user_role enum values are actually accepted by the database
                      console.log('Testing user_role enum values...');
                      
                      // First, let's check what the actual enum values are by looking at existing profiles
                      console.log('Checking existing profiles for valid role values...');
                      const { data: existingProfiles, error: profilesError } = await supabase
                        .from('profiles')
                        .select('role')
                        .limit(10);
                      
                      if (profilesError) {
                        console.error('Error fetching existing profiles:', profilesError);
                      } else {
                        console.log('Existing profile roles:', existingProfiles);
                        const uniqueRoles = [...new Set(existingProfiles.map(p => p.role))];
                        console.log('Unique role values in database:', uniqueRoles);
                      }
                      
                      // Now test with the actual enum values we found
                      const testRoles = ['admin', 'sales', 'production', 'quality', 'dispatch', 'manager', 'customer'];
                      
                      // Test with different status values to see what's allowed
                      console.log('Testing with different status values...');
                      const testStatuses = ['pending', 'approved', 'rejected', 'active', 'inactive'];
                      
                      for (const testStatus of testStatuses) {
                        try {
                          const testData = {
                            user_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
                            full_name: 'TEST STATUS',
                            email: `teststatus${testStatus}@test.com`,
                            role: 'admin', // Use admin since we know it's valid
                            status: testStatus
                          };
                          
                          const { error: insertError } = await supabase
                            .from('profiles')
                            .insert(testData);
                          
                          if (insertError) {
                            if (insertError.message.includes('check constraint "profiles_status_check"')) {
                              console.log(`Status '${testStatus}': ❌ NOT VALID STATUS VALUE`);
                            } else {
                              console.log(`Status '${testStatus}': ❌ ${insertError.message}`);
                            }
                          } else {
                            console.log(`Status '${testStatus}': ✅ VALID STATUS VALUE`);
                            // Clean up the test profile
                            await supabase.from('profiles').delete().eq('email', `teststatus${testStatus}@test.com`);
                          }
                        } catch (err) {
                          console.log(`Status '${testStatus}': ❌ Error testing`);
                        }
                      }
                      
                      // Test with different role values to find valid ones
                      console.log('Testing different role values...');
                      const possibleRoles = ['user', 'employee', 'staff', 'supervisor', 'lead', 'coordinator', 'assistant'];
                      
                      for (const testRole of possibleRoles) {
                        try {
                          const testData = {
                            user_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
                            full_name: 'TEST ROLE',
                            email: `testrole${testRole}@test.com`,
                            role: testRole,
                            status: 'pending' // Use pending since we'll test status separately
                          };
                          
                          const { error: insertError } = await supabase
                            .from('profiles')
                            .insert(testData);
                          
                          if (insertError) {
                            if (insertError.message.includes('invalid input value for enum user_role')) {
                              console.log(`Role '${testRole}': ❌ NOT VALID ENUM VALUE`);
                            } else {
                              console.log(`Role '${testRole}': ✅ VALID ENUM VALUE (other constraint failed)`);
                            }
                          } else {
                            console.log(`Role '${testRole}': ✅ VALID ENUM VALUE`);
                            // Clean up the test profile
                            await supabase.from('profiles').delete().eq('email', `testrole${testRole}@test.com`);
                          }
                        } catch (err) {
                          console.log(`Role '${testRole}': ❌ Error testing`);
                        }
                      }
                    } catch (err) {
                      console.error('Role check failed:', err);
                    }
                  }}
                  className="mt-2 ml-2"
                >
                  🎭 Check Available Roles
                </Button>
              </div> */}
              <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Create User Account
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create User Account for Employee</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateUser} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Select Employee</Label>
                      <Select onValueChange={(employeeId) => {
                        const employee = employees.find(emp => emp.id === employeeId);
                        setSelectedEmployee(employee || null);
                        if (employee?.personal_email) {
                          setNewUserData(prev => ({ ...prev, email: employee.personal_email }));
                        }
                      }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose an employee" />
                        </SelectTrigger>
                        <SelectContent>
                          {employees
                            .filter(emp => getUserStatus(emp).status === 'no-access')
                            .map((employee) => (
                              <SelectItem key={employee.id} value={employee.id}>
                                {employee.full_name} - {employee.department}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedEmployee && (
                      <div className="p-3 bg-muted rounded-lg space-y-2">
                        <p className="text-sm font-medium">{selectedEmployee.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {selectedEmployee.designation} • {selectedEmployee.department}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selectedEmployee.personal_email || 'No email provided'}
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Email Address *</Label>
                      <Input
                        type="email"
                        value={newUserData.email}
                        onChange={(e) => setNewUserData(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="Enter email address"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Password *</Label>
                      <Input
                        type="password"
                        value={newUserData.password}
                        onChange={(e) => setNewUserData(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Enter password"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Confirm Password *</Label>
                      <Input
                        type="password"
                        value={newUserData.confirmPassword}
                        onChange={(e) => setNewUserData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        placeholder="Confirm password"
                        required
                      />
                    </div>

                                          <div className="space-y-2">
                        <Label>System Role *</Label>
                        <Select value={newUserData.role} onValueChange={(role) => setNewUserData(prev => ({ ...prev, role }))}>
                          <SelectTrigger>
                            <SelectValue placeholder={roles.length === 0 ? "Loading roles..." : "Select a role"} />
                          </SelectTrigger>
                          <SelectContent>
                            {roles.length === 0 ? (
                              <SelectItem value="" disabled>
                                Loading roles...
                              </SelectItem>
                            ) : (
                              roles.map((role) => (
                                <SelectItem key={role.id} value={role.name}>
                                  {role.name} ({mapRoleNameToEnum(role.name)})
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        {roles.length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            {loading ? 'Loading available roles...' : 'No roles available. Please contact an administrator.'}
                          </p>
                        )}
                        {newUserData.role && (
                          <p className="text-xs text-muted-foreground">
                            Will be assigned as: <strong>{mapRoleNameToEnum(newUserData.role)}</strong>
                          </p>
                        )}
                      </div>
                    
                    <div className="flex justify-end space-x-2 pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowCreateForm(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={processingUser === 'creating' || !selectedEmployee || !newUserData.role}
                      >
                        {processingUser === 'creating' ? 'Creating Account...' : 'Create Account'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
      </div>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Employees</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Users className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">With System Access</p>
                <p className="text-2xl font-bold">{stats.withAccess}</p>
              </div>
              <UserCheck className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">No Access</p>
                <p className="text-2xl font-bold">{stats.withoutAccess}</p>
              </div>
              <UserX className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employees Table */}
      <Card>
        <CardHeader>
          <CardTitle>Employee Access Status</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Experience</TableHead>
                <TableHead>Access Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <div className="space-y-2">
                      <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
                        <Users className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold">No employees found</h3>
                      <p className="text-muted-foreground">Add employees to the system to manage their access.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                employees.map((employee) => {
                  const accessStatus = getUserStatus(employee);
                  return (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-primary">
                              {employee.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <div className="font-medium">{employee.full_name}</div>
                            <div className="text-sm text-muted-foreground">{employee.employee_code}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {employee.personal_email && (
                            <div className="flex items-center text-sm">
                              <Mail className="w-3 h-3 mr-1 text-muted-foreground" />
                              {employee.personal_email}
                            </div>
                          )}
                          <div className="flex items-center text-sm">
                            <Phone className="w-3 h-3 mr-1 text-muted-foreground" />
                            {employee.personal_phone}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{employee.department}</div>
                          <div className="text-sm text-muted-foreground">{employee.designation}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm">{getExperienceText(employee.joining_date)}</div>
                          <div className="text-xs text-muted-foreground">
                            Since {format(new Date(employee.joining_date), 'MMM yyyy')}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {accessStatus.badge}
                        {accessStatus.profile && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Role: {accessStatus.profile.role}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {accessStatus.status === 'no-access' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedEmployee(employee);
                                                               setNewUserData({
                                 email: employee.personal_email || '',
                                 password: '',
                                 confirmPassword: '',
                                 role: ''
                               });
                                setShowCreateForm(true);
                              }}
                            >
                              <Key className="w-4 h-4 mr-1" />
                              Grant Access
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteUser(accessStatus.profile!.user_id)}
                              disabled={processingUser === accessStatus.profile!.user_id}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
