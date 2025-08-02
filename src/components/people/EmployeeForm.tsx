import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AvatarUploader } from "@/components/ui/avatar-uploader";
import { useAuth } from "@/components/auth/AuthProvider";

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", 
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", 
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", 
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", 
  "Uttarakhand", "West Bengal", "Delhi"
];

const DEPARTMENTS = [
  "Production", "Quality Control", "Sales & Marketing", "Accounts & Finance", 
  "Human Resources", "Procurement", "Dispatch", "Administration"
];

const DESIGNATIONS = [
  "Manager", "Assistant Manager", "Supervisor", "Team Lead", "Senior Executive", 
  "Executive", "Junior Executive", "Operator", "Helper", "Trainee"
];

interface EmployeeFormProps {
  onSuccess: () => void;
  initialData?: any;
  isEditing?: boolean;
  employeeId?: string;
}

export function EmployeeForm({ onSuccess, initialData, isEditing = false, employeeId }: EmployeeFormProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    full_name: initialData?.full_name || "",
    date_of_birth: initialData?.date_of_birth ? new Date(initialData.date_of_birth) : undefined,
    gender: initialData?.gender || "",
    marital_status: initialData?.marital_status || "",
    blood_group: initialData?.blood_group || "",
    personal_email: initialData?.personal_email || "",
    personal_phone: initialData?.personal_phone || "",
    emergency_contact_name: initialData?.emergency_contact_name || "",
    emergency_contact_phone: initialData?.emergency_contact_phone || "",
    address_line1: initialData?.address_line1 || "",
    city: initialData?.city || "",
    state: initialData?.state || "",
    pincode: initialData?.pincode || "",
    designation: initialData?.designation || "",
    department: initialData?.department || "",
    joining_date: initialData?.joining_date ? new Date(initialData.joining_date) : undefined,
    employment_type: initialData?.employment_type || "",
    reports_to: initialData?.reports_to || ""
  });

  const [loading, setLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(initialData?.avatar_url || null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.full_name || !formData.date_of_birth || !formData.gender || 
        !formData.personal_phone || !formData.emergency_contact_name || 
        !formData.emergency_contact_phone || !formData.address_line1 || 
        !formData.city || !formData.state || !formData.pincode || 
        !formData.designation || !formData.department || !formData.joining_date || 
        !formData.employment_type) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    try {
      const employeeData = {
        full_name: formData.full_name,
        date_of_birth: format(formData.date_of_birth, 'yyyy-MM-dd'),
        gender: formData.gender,
        marital_status: formData.marital_status || null,
        blood_group: formData.blood_group || null,
        personal_email: formData.personal_email || null,
        personal_phone: formData.personal_phone,
        emergency_contact_name: formData.emergency_contact_name,
        emergency_contact_phone: formData.emergency_contact_phone,
        address_line1: formData.address_line1,
        city: formData.city,
        state: formData.state,
        pincode: formData.pincode,
        designation: formData.designation,
        department: formData.department,
        joining_date: format(formData.joining_date, 'yyyy-MM-dd'),
        employment_type: formData.employment_type,
        reports_to: formData.reports_to || null,
        avatar_url: avatarUrl
      };

      let error;
      if (isEditing && employeeId) {
        ({ error } = await supabase
          .from('employees')
          .update(employeeData)
          .eq('id', employeeId));
      } else {
        ({ error } = await supabase
          .from('employees')
          .insert([employeeData]));
      }

      if (error) throw error;
      
      toast({
        title: "Success",
        description: `Employee ${isEditing ? 'updated' : 'added'} successfully.`,
      });
      
      onSuccess();
    } catch (error) {
      console.error(`Error ${isEditing ? 'updating' : 'adding'} employee:`, error);
      toast({
        title: "Error",
        description: `Failed to ${isEditing ? 'update' : 'add'} employee. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personal Details */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Details</CardTitle>
            <CardDescription>Basic personal information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Avatar Upload */}
            {user && (
              <div className="flex flex-col items-center space-y-2">
                <Label>Profile Picture</Label>
                <AvatarUploader
                  currentUrl={avatarUrl}
                  onUpload={(url) => setAvatarUrl(url)}
                  onDelete={() => setAvatarUrl(null)}
                  userId={user.id}
                  userName={formData.full_name || 'Employee'}
                />
              </div>
            )}

            <div>
              <Label htmlFor="full_name">Full Name *</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                required
              />
            </div>

            <div>
              <Label>Date of Birth *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.date_of_birth && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.date_of_birth ? format(formData.date_of_birth, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.date_of_birth}
                    onSelect={(date) => setFormData(prev => ({ ...prev, date_of_birth: date }))}
                    disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <Label htmlFor="gender">Gender *</Label>
              <Select value={formData.gender} onValueChange={(value) => setFormData(prev => ({ ...prev, gender: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="marital_status">Marital Status</Label>
              <Select value={formData.marital_status} onValueChange={(value) => setFormData(prev => ({ ...prev, marital_status: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select marital status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Single">Single</SelectItem>
                  <SelectItem value="Married">Married</SelectItem>
                  <SelectItem value="Divorced">Divorced</SelectItem>
                  <SelectItem value="Widowed">Widowed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="blood_group">Blood Group</Label>
              <Select value={formData.blood_group} onValueChange={(value) => setFormData(prev => ({ ...prev, blood_group: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select blood group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A+">A+</SelectItem>
                  <SelectItem value="A-">A-</SelectItem>
                  <SelectItem value="B+">B+</SelectItem>
                  <SelectItem value="B-">B-</SelectItem>
                  <SelectItem value="AB+">AB+</SelectItem>
                  <SelectItem value="AB-">AB-</SelectItem>
                  <SelectItem value="O+">O+</SelectItem>
                  <SelectItem value="O-">O-</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Contact & Address */}
        <Card>
          <CardHeader>
            <CardTitle>Contact & Address</CardTitle>
            <CardDescription>Contact information and address details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="personal_email">Personal Email</Label>
              <Input
                id="personal_email"
                type="email"
                value={formData.personal_email}
                onChange={(e) => setFormData(prev => ({ ...prev, personal_email: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="personal_phone">Personal Phone *</Label>
              <Input
                id="personal_phone"
                value={formData.personal_phone}
                onChange={(e) => setFormData(prev => ({ ...prev, personal_phone: e.target.value }))}
                placeholder="10-digit mobile number"
                required
              />
            </div>

            <div>
              <Label htmlFor="emergency_contact_name">Emergency Contact Name *</Label>
              <Input
                id="emergency_contact_name"
                value={formData.emergency_contact_name}
                onChange={(e) => setFormData(prev => ({ ...prev, emergency_contact_name: e.target.value }))}
                required
              />
            </div>

            <div>
              <Label htmlFor="emergency_contact_phone">Emergency Contact Phone *</Label>
              <Input
                id="emergency_contact_phone"
                value={formData.emergency_contact_phone}
                onChange={(e) => setFormData(prev => ({ ...prev, emergency_contact_phone: e.target.value }))}
                required
              />
            </div>

            <div>
              <Label htmlFor="address_line1">Address Line 1 *</Label>
              <Input
                id="address_line1"
                value={formData.address_line1}
                onChange={(e) => setFormData(prev => ({ ...prev, address_line1: e.target.value }))}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="pincode">Pincode *</Label>
                <Input
                  id="pincode"
                  value={formData.pincode}
                  onChange={(e) => setFormData(prev => ({ ...prev, pincode: e.target.value }))}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="state">State *</Label>
              <Select value={formData.state} onValueChange={(value) => setFormData(prev => ({ ...prev, state: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select state" />
                </SelectTrigger>
                <SelectContent>
                  {INDIAN_STATES.map(state => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Employment Details */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Employment Details</CardTitle>
            <CardDescription>Job-related information</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="designation">Designation *</Label>
              <Select value={formData.designation} onValueChange={(value) => setFormData(prev => ({ ...prev, designation: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select designation" />
                </SelectTrigger>
                <SelectContent>
                  {DESIGNATIONS.map(designation => (
                    <SelectItem key={designation} value={designation}>{designation}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="department">Department *</Label>
              <Select value={formData.department} onValueChange={(value) => setFormData(prev => ({ ...prev, department: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(department => (
                    <SelectItem key={department} value={department}>{department}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="employment_type">Employment Type *</Label>
              <Select value={formData.employment_type} onValueChange={(value) => setFormData(prev => ({ ...prev, employment_type: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employment type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Full-time">Full-time</SelectItem>
                  <SelectItem value="Part-time">Part-time</SelectItem>
                  <SelectItem value="Contract">Contract</SelectItem>
                  <SelectItem value="Intern">Intern</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Joining Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.joining_date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.joining_date ? format(formData.joining_date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.joining_date}
                    onSelect={(date) => setFormData(prev => ({ ...prev, joining_date: date }))}
                    disabled={(date) => date > new Date()}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-4">
        <Button type="submit" disabled={loading}>
          {loading ? (isEditing ? "Updating..." : "Adding...") : (isEditing ? "Update Employee" : "Add Employee")}
        </Button>
      </div>
    </form>
  );
}