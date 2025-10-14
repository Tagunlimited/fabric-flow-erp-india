import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Users, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar, 
  Briefcase,
  Building,
  Loader2
} from 'lucide-react';
import { ErpLayout } from '@/components/ErpLayout';
import { format } from 'date-fns';

interface Department {
  id: string;
  name: string;
  description: string;
  head_id: string | null;
  created_at: string;
}

interface DepartmentHead {
  id: string;
  full_name: string;
  designation: string;
  personal_phone: string;
  personal_email?: string;
  avatar_url?: string;
  joining_date: string;
}

interface Employee {
  id: string;
  full_name: string;
  designation: string;
  personal_phone: string;
  personal_email?: string;
  avatar_url?: string;
  joining_date: string;
  employment_type: string;
  city: string;
  state: string;
}

export default function DepartmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [department, setDepartment] = useState<Department | null>(null);
  const [departmentHead, setDepartmentHead] = useState<DepartmentHead | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchDepartmentDetails();
    }
  }, [id]);

  const fetchDepartmentDetails = async () => {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch department details
      const { data: departmentData, error: departmentError } = await supabase
        .from('departments')
        .select('*')
        .eq('id', id)
        .single();

      if (departmentError) {
        throw departmentError;
      }

      setDepartment(departmentData);

      // Fetch department head if exists
      if (departmentData.head_id) {
        const { data: headData, error: headError } = await supabase
          .from('employees')
          .select('id, full_name, designation, personal_phone, personal_email, avatar_url, joining_date')
          .eq('id', departmentData.head_id)
          .single();

        if (!headError && headData) {
          setDepartmentHead(headData);
        }
      }

      // Fetch all employees in this department
      const { data: employeesData, error: employeesError } = await supabase
        .from('employees')
        .select('id, full_name, designation, personal_phone, personal_email, avatar_url, joining_date, employment_type, city, state')
        .eq('department', departmentData.name)
        .order('full_name');

      if (employeesError) {
        throw employeesError;
      }

      setEmployees(employeesData || []);
    } catch (error: any) {
      console.error('Error fetching department details:', error);
      setError(error.message || 'Failed to fetch department details');
      toast.error('Failed to load department details');
    } finally {
      setLoading(false);
    }
  };

  const getEmploymentTypeBadgeVariant = (type: string) => {
    switch (type) {
      case 'Full-time': return 'default';
      case 'Part-time': return 'secondary';
      case 'Contract': return 'outline';
      case 'Intern': return 'destructive';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <ErpLayout>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </ErpLayout>
    );
  }

  if (error || !department) {
    return (
      <ErpLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Department Not Found</h2>
          <p className="text-muted-foreground mb-4">{error || 'The requested department could not be found.'}</p>
          <Button onClick={() => navigate('/people/departments')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Departments
          </Button>
        </div>
      </ErpLayout>
    );
  }

  return (
    <ErpLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="outline" onClick={() => navigate('/people/departments')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Building className="w-7 h-7" />
                {department.name}
              </h1>
              <p className="text-muted-foreground mt-1">{department.description}</p>
            </div>
          </div>
        </div>

        {/* Department Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{employees.length}</div>
              <p className="text-xs text-muted-foreground">
                Active team members
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Department Head</CardTitle>
              <User className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {departmentHead ? '1' : '0'}
              </div>
              <p className="text-xs text-muted-foreground">
                {departmentHead ? 'Assigned' : 'Not assigned'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Created</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {format(new Date(department.created_at), 'MMM yyyy')}
              </div>
              <p className="text-xs text-muted-foreground">
                Department established
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Department Head */}
        {departmentHead && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Department Head
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-6">
                <Avatar className="w-20 h-20">
                  <AvatarImage src={departmentHead.avatar_url} alt={departmentHead.full_name} />
                  <AvatarFallback className="text-xl font-bold bg-gradient-primary text-white">
                    {departmentHead.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-primary">{departmentHead.full_name}</h3>
                  <p className="text-lg text-muted-foreground mb-4">{departmentHead.designation}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Phone className="w-4 h-4 text-primary" />
                      <span className="font-medium">{departmentHead.personal_phone}</span>
                    </div>
                    {departmentHead.personal_email && (
                      <div className="flex items-center space-x-2">
                        <Mail className="w-4 h-4 text-primary" />
                        <span className="font-medium">{departmentHead.personal_email}</span>
                      </div>
                    )}
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      <span className="font-medium">
                        Joined {format(new Date(departmentHead.joining_date), 'MMM yyyy')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Employees */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Team Members ({employees.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {employees.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No employees in this department</p>
                <p className="text-sm">Employees will appear here once they are assigned to this department</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                {employees.map((employee) => (
                  <Card 
                    key={employee.id} 
                    className="cursor-pointer hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-r from-card to-card/80"
                    onClick={() => navigate(`/people/employees/${employee.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex flex-col items-center space-y-3">
                        {/* Avatar */}
                        <Avatar className="w-16 h-16">
                          <AvatarImage src={employee.avatar_url} alt={employee.full_name} />
                          <AvatarFallback className="text-lg font-bold bg-gradient-primary text-white">
                            {employee.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        
                        {/* Employee Info */}
                        <div className="text-center space-y-1 w-full">
                          <h4 className="font-bold text-sm text-primary leading-tight truncate">
                            {employee.full_name}
                          </h4>
                          <p className="text-xs text-muted-foreground truncate">
                            {employee.designation}
                          </p>
                          <Badge 
                            variant={getEmploymentTypeBadgeVariant(employee.employment_type)}
                            className="text-xs"
                          >
                            {employee.employment_type}
                          </Badge>
                        </div>
                        
                        {/* Contact Info */}
                        <div className="space-y-1 w-full">
                          <div className="flex items-center justify-center text-xs text-muted-foreground">
                            <Phone className="w-3 h-3 mr-1 flex-shrink-0" />
                            <span className="truncate">{employee.personal_phone}</span>
                          </div>
                          {employee.personal_email && (
                            <div className="flex items-center justify-center text-xs text-muted-foreground">
                              <Mail className="w-3 h-3 mr-1 flex-shrink-0" />
                              <span className="truncate">{employee.personal_email}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-center text-xs text-muted-foreground">
                            <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                            <span className="truncate">{employee.city}, {employee.state}</span>
                          </div>
                          <div className="flex items-center justify-center text-xs text-muted-foreground">
                            <Calendar className="w-3 h-3 mr-1 flex-shrink-0" />
                            <span className="truncate">Joined {format(new Date(employee.joining_date), 'MMM yyyy')}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ErpLayout>
  );
}
