import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, UserPlus, Calendar, Phone, Mail, MapPin, Building, Scissors, Upload, X } from "lucide-react";

interface ProductionTeamFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  editMode?: boolean;
  memberData?: any;
}

export function ProductionTeamForm({ onSuccess, onCancel, editMode = false, memberData }: ProductionTeamFormProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [allDesignations, setAllDesignations] = useState<Array<{ id: string; name: string; departments: Array<{ id: string; name: string }> }>>([]);
  const [filteredDesignations, setFilteredDesignations] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingData, setLoadingData] = useState(true);
  
  const [formData, setFormData] = useState({
    employee_code: "",
    full_name: "",
    date_of_birth: "",
    gender: "",
    personal_email: "",
    personal_phone: "",
    address_line1: "",
    city: "",
    state: "",
    pincode: "",
    department: "",
    designation: "",
    tailor_type: "",
    is_batch_leader: false,
    batch_leader_id: "",
    joining_date: "",
    employment_type: "Full-time",
    avatar_url: ""
  });

  const [batchLeaders, setBatchLeaders] = useState<any[]>([]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string>("");

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const generateEmployeeCode = () => {
    const prefix = "PT";
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${timestamp}${random}`;
  };

  // Fetch departments and designations from database
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingData(true);
        
        // Fetch departments
        const { data: departmentsData, error: departmentsError } = await supabase
          .from('departments')
          .select('id, name')
          .order('name');
        
        if (departmentsError) {
          console.error('Error fetching departments:', departmentsError);
        } else {
          setDepartments(departmentsData || []);
        }

        // Fetch designations with their departments
        const { data: designationsData, error: designationsError } = await supabase
          .from('designations_with_departments')
          .select('*')
          .eq('is_active', true)
          .order('name');

        if (designationsError) {
          console.error('Error fetching designations:', designationsError);
        } else {
          setAllDesignations(designationsData || []);
          // Initially show all designations
          setFilteredDesignations(designationsData || []);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast({
          title: "Error",
          description: "Failed to load departments and designations",
          variant: "destructive",
        });
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, [toast]);

  // Filter designations based on selected department
  const filterDesignationsByDepartment = (departmentName: string) => {
    if (!departmentName) {
      // If no department selected, show all designations
      setFilteredDesignations(allDesignations);
      return;
    }

    // Filter designations that are linked to the selected department
    const filtered = allDesignations.filter(designation => {
      // If designation has no departments, show it (company-wide roles)
      if (!designation.departments || designation.departments.length === 0) {
        return true;
      }
      
      // Check if any of the designation's departments match the selected department
      return designation.departments.some(dept => dept.name === departmentName);
    });

    setFilteredDesignations(filtered);
    
    // Clear designation selection if current selection is not available for the new department
    if (formData.designation && !filtered.some(d => d.name === formData.designation)) {
      handleInputChange('designation', '');
    }
  };

  // Fetch batch leaders for tailors
  const fetchBatchLeaders = async () => {
    try {
      const { data, error } = await supabase
        .from('production_team')
        .select('id, full_name, employee_code, tailor_type')
        .eq('is_batch_leader', true)
        .order('full_name');

      if (error) throw error;
      setBatchLeaders(data || []);
    } catch (error) {
      console.error('Error fetching batch leaders:', error);
    }
  };

  // Handle avatar file selection
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Upload avatar to Supabase storage
  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile) return null;

    try {
      const fileExt = avatarFile.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `production-team-avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('company-assets')
        .upload(filePath, avatarFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('company-assets')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast({
        title: "Error",
        description: "Failed to upload avatar. Please try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  // Load batch leaders on component mount and populate form if editing
  useEffect(() => {
    fetchBatchLeaders();
    
    if (editMode && memberData) {
      setFormData({
        employee_code: memberData.employee_code || "",
        full_name: memberData.full_name || "",
        date_of_birth: memberData.date_of_birth || "",
        gender: memberData.gender || "",
        personal_email: memberData.personal_email || "",
        personal_phone: memberData.personal_phone || "",
        address_line1: memberData.address_line1 || "",
        city: memberData.city || "",
        state: memberData.state || "",
        pincode: memberData.pincode || "",
        designation: memberData.designation || "",
        tailor_type: memberData.tailor_type || "",
        is_batch_leader: memberData.is_batch_leader || false,
        batch_leader_id: memberData.batch_leader_id || "",
        joining_date: memberData.joining_date || "",
        employment_type: memberData.employment_type || "Full-time",
        avatar_url: memberData.avatar_url || ""
      });
      
      if (memberData.avatar_url) {
        setAvatarPreview(memberData.avatar_url);
      }
    }
  }, [editMode, memberData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.employee_code || !formData.full_name || !formData.date_of_birth || 
        !formData.gender || !formData.personal_phone || !formData.address_line1 || 
        !formData.city || !formData.state || !formData.pincode || 
        !formData.designation || !formData.joining_date) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    // Validate tailor-specific fields
    if (formData.designation.includes('Tailor')) {
      if (!formData.tailor_type) {
        toast({
          title: "Validation Error",
          description: "Please select tailor type.",
          variant: "destructive",
        });
        return;
      }
      if (!formData.is_batch_leader && !formData.batch_leader_id) {
        toast({
          title: "Validation Error",
          description: "Please select a batch leader for non-leader tailors.",
          variant: "destructive",
        });
        return;
      }
      
    }

    setLoading(true);
    try {
      // Upload avatar if selected
      let avatarUrl = formData.avatar_url;
      if (avatarFile) {
        avatarUrl = await uploadAvatar();
        if (!avatarUrl) {
          setLoading(false);
          return;
        }
      }

             // Prepare data for insertion
               const insertData = {
          employee_code: formData.employee_code,
          full_name: formData.full_name,
          date_of_birth: formData.date_of_birth,
          gender: formData.gender,
          personal_email: formData.personal_email || null,
          personal_phone: formData.personal_phone,
          address_line1: formData.address_line1,
          city: formData.city,
          state: formData.state,
          pincode: formData.pincode,
          designation: formData.designation,
          tailor_type: formData.tailor_type || null,
          is_batch_leader: Boolean(formData.is_batch_leader),
          batch_leader_id: formData.batch_leader_id || null,
          joining_date: formData.joining_date,
          employment_type: formData.employment_type,
          avatar_url: avatarUrl || null
        };

               let result;
        if (editMode && memberData) {
          result = await supabase
            .from('production_team')
            .update(insertData)
            .eq('id', memberData.id);
        } else {
          result = await supabase
            .from('production_team')
            .insert([insertData]);
        }

        const { error } = result;

      if (error) throw error;

             toast({
         title: "Success",
         description: editMode ? "Production team member updated successfully." : "Production team member added successfully.",
       });
      
      onSuccess();
    } catch (error) {
      console.error('Error adding production team member:', error);
      toast({
        title: "Error",
        description: "Failed to add production team member. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
             <div className="flex items-center gap-2">
         <UserPlus className="w-5 h-5 text-primary" />
         <h2 className="text-xl font-semibold">
           {editMode ? 'Edit Production Team Member' : 'Add New Production Team Member'}
         </h2>
       </div>

             <form onSubmit={handleSubmit} className="space-y-6">
         {/* Avatar Upload */}
         <Card>
           <CardHeader>
             <CardTitle className="flex items-center gap-2">
               <UserPlus className="w-4 h-4" />
               Profile Photo
             </CardTitle>
           </CardHeader>
           <CardContent>
             <div className="flex items-center gap-4">
               <Avatar className="w-20 h-20">
                 <AvatarImage src={avatarPreview} alt="Avatar preview" />
                 <AvatarFallback className="text-lg">
                   {formData.full_name ? formData.full_name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U'}
                 </AvatarFallback>
               </Avatar>
               <div className="flex-1">
                 <Label htmlFor="avatar" className="cursor-pointer">
                   <div className="flex items-center gap-2 p-2 border-2 border-dashed border-muted-foreground/25 rounded-lg hover:border-primary/50 transition-colors">
                     <Upload className="w-4 h-4" />
                     <span>Upload Photo</span>
                   </div>
                 </Label>
                 <input
                   id="avatar"
                   type="file"
                   accept="image/*"
                   onChange={handleAvatarChange}
                   className="hidden"
                 />
                 {avatarPreview && (
                   <Button
                     type="button"
                     variant="outline"
                     size="sm"
                     onClick={() => {
                       setAvatarFile(null);
                       setAvatarPreview("");
                     }}
                     className="mt-2"
                   >
                     <X className="w-4 h-4 mr-1" />
                     Remove
                   </Button>
                 )}
               </div>
             </div>
           </CardContent>
         </Card>

         {/* Basic Information */}
         <Card>
           <CardHeader>
             <CardTitle className="flex items-center gap-2">
               <UserPlus className="w-4 h-4" />
               Basic Information
             </CardTitle>
           </CardHeader>
           <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="employee_code">Employee Code *</Label>
                <div className="flex gap-2">
                  <Input
                    id="employee_code"
                    value={formData.employee_code}
                    onChange={(e) => handleInputChange('employee_code', e.target.value)}
                    placeholder="PT001"
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleInputChange('employee_code', generateEmployeeCode())}
                    className="whitespace-nowrap"
                  >
                    Generate
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => handleInputChange('full_name', e.target.value)}
                  placeholder="Enter full name"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date_of_birth">Date of Birth *</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => handleInputChange('date_of_birth', e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="gender">Gender *</Label>
                <Select value={formData.gender} onValueChange={(value) => handleInputChange('gender', value)}>
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
              
              <div className="space-y-2">
                <Label htmlFor="department">Department *</Label>
                <Select 
                  value={formData.department} 
                  onValueChange={(value) => {
                    handleInputChange('department', value);
                    filterDesignationsByDepartment(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingData ? "Loading..." : "Select department"} />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map(department => (
                      <SelectItem key={department.id} value={department.name}>{department.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="designation">Designation *</Label>
                <Select 
                  value={formData.designation} 
                  onValueChange={(value) => handleInputChange('designation', value)}
                  disabled={!formData.department}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={
                      !formData.department 
                        ? "Select department first" 
                        : loadingData 
                          ? "Loading..." 
                          : "Select designation"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredDesignations.map(designation => (
                      <SelectItem key={designation.id} value={designation.name}>{designation.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="personal_phone">Phone Number *</Label>
                <Input
                  id="personal_phone"
                  value={formData.personal_phone}
                  onChange={(e) => handleInputChange('personal_phone', e.target.value)}
                  placeholder="+91-9876543210"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="personal_email">Email Address</Label>
                <Input
                  id="personal_email"
                  type="email"
                  value={formData.personal_email}
                  onChange={(e) => handleInputChange('personal_email', e.target.value)}
                  placeholder="email@example.com"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Address Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Address Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="address_line1">Address Line 1 *</Label>
              <Textarea
                id="address_line1"
                value={formData.address_line1}
                onChange={(e) => handleInputChange('address_line1', e.target.value)}
                placeholder="Enter complete address"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  placeholder="Enter city"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="state">State *</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => handleInputChange('state', e.target.value)}
                  placeholder="Enter state"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="pincode">Pincode *</Label>
                <Input
                  id="pincode"
                  value={formData.pincode}
                  onChange={(e) => handleInputChange('pincode', e.target.value)}
                  placeholder="Enter pincode"
                  required
                />
              </div>
            </div>
          </CardContent>
        </Card>

                 {/* Employment Information */}
         <Card>
           <CardHeader>
             <CardTitle className="flex items-center gap-2">
               <Building className="w-4 h-4" />
               Employment Information
             </CardTitle>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="space-y-2">
                 <Label htmlFor="joining_date">Joining Date *</Label>
                 <Input
                   id="joining_date"
                   type="date"
                   value={formData.joining_date}
                   onChange={(e) => handleInputChange('joining_date', e.target.value)}
                   required
                 />
               </div>
               
               <div className="space-y-2">
                 <Label htmlFor="employment_type">Employment Type</Label>
                 <Select value={formData.employment_type} onValueChange={(value) => handleInputChange('employment_type', value)}>
                   <SelectTrigger>
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="Full-time">Full-time</SelectItem>
                     <SelectItem value="Part-time">Part-time</SelectItem>
                     <SelectItem value="Contract">Contract</SelectItem>
                     <SelectItem value="Temporary">Temporary</SelectItem>
                   </SelectContent>
                 </Select>
               </div>
             </div>
           </CardContent>
         </Card>

         {/* Tailor-Specific Information */}
         {(formData.designation === 'Single Needle Tailor' || formData.designation === 'Overlock/Flatlock Tailor') && (
           <Card>
             <CardHeader>
               <CardTitle className="flex items-center gap-2">
                 <Scissors className="w-4 h-4" />
                 Tailor Information
               </CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
                               <div className="space-y-2">
                  <Label htmlFor="tailor_type">Tailor Type *</Label>
                  <Select value={formData.tailor_type} onValueChange={(value) => handleInputChange('tailor_type', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select tailor type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Single Needle">Single Needle</SelectItem>
                      <SelectItem value="Overlock/Flatlock">Overlock/Flatlock</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

               <div className="space-y-4">
                 <div className="flex items-center space-x-2">
                   <input
                     type="checkbox"
                     id="is_batch_leader"
                     checked={formData.is_batch_leader}
                     onChange={(e) => handleInputChange('is_batch_leader', e.target.checked.toString())}
                     className="rounded"
                   />
                   <Label htmlFor="is_batch_leader">Is Batch Leader</Label>
                 </div>

                 {!formData.is_batch_leader && (
                   <div className="space-y-2">
                     <Label htmlFor="batch_leader_id">Batch Leader *</Label>
                     <Select value={formData.batch_leader_id} onValueChange={(value) => handleInputChange('batch_leader_id', value)}>
                       <SelectTrigger>
                         <SelectValue placeholder="Select batch leader" />
                       </SelectTrigger>
                       <SelectContent>
                         {batchLeaders
                           .filter(leader => leader.tailor_type === formData.tailor_type)
                           .map(leader => (
                             <SelectItem key={leader.id} value={leader.id}>
                               {leader.full_name} ({leader.employee_code})
                             </SelectItem>
                           ))}
                       </SelectContent>
                     </Select>
                   </div>
                 )}
               </div>
             </CardContent>
           </Card>
         )}

        {/* Form Actions */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className="min-w-[120px]"
          >
                         {loading ? (
               <>
                 <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                 {editMode ? 'Updating...' : 'Adding...'}
               </>
             ) : (
               <>
                 <UserPlus className="w-4 h-4 mr-2" />
                 {editMode ? 'Update Member' : 'Add Member'}
               </>
             )}
          </Button>
        </div>
      </form>
    </div>
  );
}
