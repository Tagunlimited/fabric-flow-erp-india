import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarUploader } from "@/components/ui/avatar-uploader";
import { EmployeeEditDialog } from "@/components/people/EmployeeEditDialog";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar, 
  Briefcase, 
  User, 
  Heart, 
  Shield, 
  Users,
  Award,
  Star,
  Trophy,
  Target,
  Edit
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInYears, differenceInMonths } from "date-fns";
import { ErpLayout } from "@/components/ErpLayout";
import { useAuth } from "@/components/auth/AuthProvider";

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

const EmployeeDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  useEffect(() => {
    if (id) {
      fetchEmployee();
    }
  }, [id]);

  const fetchEmployee = async () => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setEmployee(data);
    } catch (error) {
      console.error('Error fetching employee:', error);
      toast({
        title: "Error",
        description: "Failed to fetch employee details. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getAvatarUrl = (employee: Employee) => {
    if (employee.avatar_url) {
      return employee.avatar_url;
    }
    
    // Fallback to placeholder images
    const avatars = [
      'photo-1581092795360-fd1ca04f0952',
      'photo-1485827404703-89b55fcc595e', 
      'photo-1581091226825-a6a2a5aee158',
      'photo-1501286353178-1ec881214838'
    ];
    const index = employee.full_name.charCodeAt(0) % avatars.length;
    return `https://images.unsplash.com/${avatars[index]}?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=200&h=200&q=80`;
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

  const getEmploymentTypeBadgeVariant = (type: string) => {
    switch (type) {
      case 'Full-time': return 'default';
      case 'Part-time': return 'secondary';
      case 'Contract': return 'outline';
      case 'Intern': return 'destructive';
      default: return 'default';
    }
  };

  // Empty arrays for awards and recognition - to be fetched from database
  const awards: any[] = [];
  const recognitions: any[] = [];

  if (loading) {
    return (
      <ErpLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </ErpLayout>
    );
  }

  if (!employee) {
    return (
      <ErpLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-4">Employee Not Found</h2>
          <Button onClick={() => navigate('/people/employees')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Employee List
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
          <Button variant="outline" onClick={() => navigate('/people/employees')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Employees
          </Button>
          <Button onClick={() => setIsEditDialogOpen(true)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit Employee
          </Button>
        </div>

        {/* Employee Profile Card - Landscape Layout */}
        <Card className="border-0 bg-gradient-to-br from-card to-card/80 shadow-xl">
          <CardContent className="p-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Large Avatar Section */}
              <div className="flex flex-col items-center space-y-6">
                {user && (
                  <div className="relative">
                    <div className="flex justify-center">
                      <AvatarUploader
                        size="xl"
                        currentUrl={employee.avatar_url || getAvatarUrl(employee)}
                        onUpload={async (url) => {
                          try {
                            const { error } = await supabase
                              .from('employees')
                              .update({ avatar_url: url })
                              .eq('id', employee.id);
                            
                            if (error) throw error;
                            
                            setEmployee({ ...employee, avatar_url: url });
                            toast({
                              title: "Success",
                              description: "Avatar updated successfully",
                            });
                          } catch (error) {
                            console.error('Error updating avatar:', error);
                            toast({
                              title: "Error",
                              description: "Failed to update avatar",
                              variant: "destructive",
                            });
                          }
                        }}
                        onDelete={async () => {
                          try {
                            const { error } = await supabase
                              .from('employees')
                              .update({ avatar_url: null })
                              .eq('id', employee.id);
                            
                            if (error) throw error;
                            
                            setEmployee({ ...employee, avatar_url: null });
                            toast({
                              title: "Success",
                              description: "Avatar deleted successfully",
                            });
                          } catch (error) {
                            console.error('Error deleting avatar:', error);
                            toast({
                              title: "Error",
                              description: "Failed to delete avatar",
                              variant: "destructive",
                            });
                          }
                        }}
                        userId={employee.id}
                        userName={employee.full_name}
                      />
                    </div>
                  </div>
                )}
                <div className="text-center">
                  <h1 className="text-3xl font-bold text-primary">{employee.full_name.toUpperCase()}</h1>
                  <p className="text-lg text-muted-foreground mt-1">Role: Admin</p>
                  <p className="text-xl font-semibold text-primary">{employee.designation}</p>
                  <div className="flex items-center justify-center text-lg text-success mt-3">
                    <div className="w-3 h-3 bg-success rounded-full mr-3"></div>
                    <span className="font-semibold">Active Since ({getExperienceText(employee.joining_date)})</span>
                  </div>
                </div>
              </div>

              {/* Contact Information Column */}
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-primary mb-4">Contact Information</h3>
                  <div className="flex items-center text-lg">
                    <Phone className="w-5 h-5 mr-3 text-primary" />
                    <span className="font-semibold">{employee.personal_phone}</span>
                  </div>
                  
                  {employee.personal_email && (
                    <div className="flex items-center text-lg">
                      <Mail className="w-5 h-5 mr-3 text-primary" />
                      <span>{employee.personal_email}</span>
                    </div>
                  )}
                  
                  <div className="flex items-start text-lg">
                    <MapPin className="w-5 h-5 mr-3 text-primary mt-1" />
                    <span>{employee.address_line1}, {employee.city}, {employee.state} - {employee.pincode}</span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-primary mb-4">Emergency Contact</h3>
                  <div>
                    <p className="text-sm text-muted-foreground">Contact Person</p>
                    <p className="font-semibold text-lg">{employee.emergency_contact_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phone Number</p>
                    <p className="font-semibold text-lg flex items-center">
                      <Phone className="w-4 h-4 mr-2" />
                      {employee.emergency_contact_phone}
                    </p>
                  </div>
                </div>
              </div>

              {/* Employment Details Column */}
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-primary mb-4">Employment Details</h3>
                  <div className="flex items-center text-lg">
                    <Calendar className="w-5 h-5 mr-3 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">Date of Birth</p>
                      <span className="font-semibold">{format(new Date(employee.date_of_birth), 'dd-MMM-yy')}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center text-lg">
                    <Briefcase className="w-5 h-5 mr-3 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">Joining Date</p>
                      <span className="font-semibold">{format(new Date(employee.joining_date), 'dd-MMM-yy')}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Badge variant={getEmploymentTypeBadgeVariant(employee.employment_type)} className="text-lg px-4 py-2 block w-fit">
                      {employee.employment_type}
                    </Badge>
                    <Badge variant="outline" className="text-lg px-4 py-2 block w-fit">
                      {employee.department}
                    </Badge>
                    <Badge variant="secondary" className="text-lg px-4 py-2 block w-fit">
                      {employee.employee_code}
                    </Badge>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-xl font-semibold text-primary mb-4">Personal Details</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <p className="text-sm text-muted-foreground">Gender</p>
                      <p className="font-semibold">{employee.gender}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Marital Status</p>
                      <p className="font-semibold">{employee.marital_status || 'Not specified'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Blood Group</p>
                      <p className="font-semibold">{employee.blood_group || 'Not specified'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Awards and Recognition Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Awards */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Award className="w-5 h-5 mr-2" />
                Awards & Achievements
              </CardTitle>
            </CardHeader>
            <CardContent>
              {awards.length === 0 ? (
                <div className="text-center py-8">
                  <Trophy className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No awards yet</p>
                  <p className="text-sm text-muted-foreground">Awards and achievements will appear here</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {awards.map((award) => (
                    <div key={award.id} className="flex items-start space-x-3 p-3 bg-gradient-subtle rounded-lg">
                      <Trophy className="w-5 h-5 text-yellow-500 mt-1" />
                      <div className="flex-1">
                        <h4 className="font-semibold">{award.title}</h4>
                        <p className="text-sm text-muted-foreground">{award.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">{award.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recognition */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Star className="w-5 h-5 mr-2" />
                Recognition
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recognitions.length === 0 ? (
                <div className="text-center py-8">
                  <Star className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No recognition yet</p>
                  <p className="text-sm text-muted-foreground">Recognition and achievements will appear here</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recognitions.map((recognition) => (
                    <div key={recognition.id} className="flex items-start space-x-3 p-3 bg-gradient-subtle rounded-lg">
                      <Target className="w-5 h-5 text-primary mt-1" />
                      <div className="flex-1">
                        <h4 className="font-semibold">{recognition.title}</h4>
                        <p className="text-sm text-muted-foreground">{recognition.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">{recognition.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Edit Dialog */}
        {employee && (
          <EmployeeEditDialog
            employee={employee}
            isOpen={isEditDialogOpen}
            onClose={() => setIsEditDialogOpen(false)}
            onSuccess={() => {
              fetchEmployee(); // Refresh employee data
              setIsEditDialogOpen(false);
            }}
          />
        )}
      </div>
    </ErpLayout>
  );
};

export default EmployeeDetailPage;