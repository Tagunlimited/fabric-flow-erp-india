import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, User, X } from "lucide-react";

interface TailorFormProps {
  tailor?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

interface Batch {
  id: string;
  batch_name: string;
  batch_code: string;
  tailor_type: 'single_needle' | 'overlock_flatlock';
  max_capacity: number;
  current_capacity: number;
  status: string;
}

export function TailorForm({ tailor, onSuccess, onCancel }: TailorFormProps) {
  const [loading, setLoading] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    tailor_code: tailor?.tailor_code || '',
    full_name: tailor?.full_name || '',
    avatar_url: tailor?.avatar_url || '',
    tailor_type: tailor?.tailor_type || '',
    skill_level: tailor?.skill_level || 'beginner',
    batch_id: tailor?.batch_id || '',
    is_batch_leader: tailor?.is_batch_leader || false,
    status: tailor?.status || 'active',
    personal_phone: tailor?.personal_phone || '',
    personal_email: tailor?.personal_email || '',
    date_of_birth: tailor?.date_of_birth || '',
    gender: tailor?.gender || '',
    address_line1: tailor?.address_line1 || '',
    city: tailor?.city || '',
    state: tailor?.state || '',
    pincode: tailor?.pincode || '',
    joining_date: tailor?.joining_date || '',
    employment_type: tailor?.employment_type || 'Full-time',
    salary: tailor?.salary || '',
    work_hours_per_day: tailor?.work_hours_per_day || 8
  });

  const { toast } = useToast();

  useEffect(() => {
    fetchBatches();
    if (tailor?.avatar_url) {
      setAvatarPreview(tailor.avatar_url);
    }
  }, [tailor]);

  const fetchBatches = async () => {
    try {
      const { data, error } = await supabase
        .from('batches')
        .select('*')
        .eq('status', 'active')
        .order('batch_name');

      if (error) throw error;
      setBatches(data || []);
    } catch (error) {
      console.error('Error fetching batches:', error);
    }
  };

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile) return formData.avatar_url;

    try {
      const fileExt = avatarFile.name.split('.').pop();
      const fileName = `tailors/tailor_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, avatarFile, { upsert: true });

      if (uploadError) {
        console.error('Avatar upload error:', uploadError);
        throw new Error(`Avatar upload failed: ${uploadError.message}`);
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading avatar:', error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Upload avatar first if there's a new file
      let avatarUrl = formData.avatar_url;
      if (avatarFile) {
        avatarUrl = await uploadAvatar();
      }

      const tailorData = {
        tailor_code: formData.tailor_code,
        full_name: formData.full_name,
        avatar_url: avatarUrl,
        tailor_type: formData.tailor_type,
        skill_level: formData.skill_level,
        batch_id: formData.batch_id || null,
        is_batch_leader: formData.is_batch_leader,
        status: formData.status,
        personal_phone: formData.personal_phone,
        personal_email: formData.personal_email || null,
        date_of_birth: formData.date_of_birth || null,
        gender: formData.gender || null,
        address_line1: formData.address_line1 || null,
        city: formData.city || null,
        state: formData.state || null,
        pincode: formData.pincode || null,
        joining_date: formData.joining_date || null,
        employment_type: formData.employment_type,
        salary: formData.salary ? parseFloat(formData.salary) : null,
        work_hours_per_day: parseInt(formData.work_hours_per_day) || 8
      };

      if (tailor) {
        // Update existing tailor
        const { error } = await supabase
          .from('tailors')
          .update(tailorData)
          .eq('id', tailor.id);

        if (error) throw error;
        toast({
          title: "Success",
          description: "Tailor updated successfully.",
        });
      } else {
        // Create new tailor
        const { error } = await supabase
          .from('tailors')
          .insert([tailorData]);

        if (error) throw error;
        toast({
          title: "Success",
          description: "Tailor created successfully.",
        });
      }

      onSuccess();
    } catch (error: any) {
      console.error('Error saving tailor:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save tailor. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredBatches = batches.filter(batch => 
    !formData.tailor_type || batch.tailor_type === formData.tailor_type
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tailor ? 'Edit Tailor' : 'Add New Tailor'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar Upload Section */}
          <div className="flex items-center space-x-6">
            <div className="flex flex-col items-center space-y-2">
              <Avatar className="w-24 h-24">
                <AvatarImage src={avatarPreview || undefined} alt={formData.full_name} />
                <AvatarFallback>
                  <User className="w-8 h-8" />
                </AvatarFallback>
              </Avatar>
              <div className="flex space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-1" />
                  Upload
                </Button>
                {avatarPreview && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={removeAvatar}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">
                Upload a profile picture for the tailor. Supported formats: JPG, PNG, GIF. Max size: 5MB.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Basic Information</h3>
              
              <div>
                <Label htmlFor="tailor_code">Tailor Code *</Label>
                <Input
                  id="tailor_code"
                  value={formData.tailor_code}
                  onChange={(e) => setFormData({ ...formData, tailor_code: e.target.value })}
                  placeholder="e.g., T001"
                  required
                />
              </div>

              <div>
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="tailor_type">Tailor Type *</Label>
                <Select
                  value={formData.tailor_type}
                  onValueChange={(value) => setFormData({ ...formData, tailor_type: value, batch_id: '' })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tailor type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single_needle">Single Needle</SelectItem>
                    <SelectItem value="overlock_flatlock">Overlock/Flatlock</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="skill_level">Skill Level *</Label>
                <Select
                  value={formData.skill_level}
                  onValueChange={(value) => setFormData({ ...formData, skill_level: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select skill level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                    <SelectItem value="expert">Expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="status">Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="on_leave">On Leave</SelectItem>
                    <SelectItem value="terminated">Terminated</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="batch_id">Batch</Label>
                <Select
                  value={formData.batch_id || "none"}
                  onValueChange={(value) => setFormData({ ...formData, batch_id: value === "none" ? "" : value })}
                  disabled={!formData.tailor_type}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select batch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No batch assigned</SelectItem>
                    {filteredBatches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.batch_name} ({batch.current_capacity}/{batch.max_capacity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="is_batch_leader"
                    checked={formData.is_batch_leader}
                    onChange={(e) => setFormData({ ...formData, is_batch_leader: e.target.checked })}
                    className="rounded"
                  />
                  <Label htmlFor="is_batch_leader">Batch Leader</Label>
                </div>
                {formData.is_batch_leader && (
                  <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600 text-white">
                    Batch Leader
                  </Badge>
                )}
              </div>
            </div>

            {/* Contact Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Contact Information</h3>
              
              <div>
                <Label htmlFor="personal_phone">Phone Number *</Label>
                <Input
                  id="personal_phone"
                  value={formData.personal_phone}
                  onChange={(e) => setFormData({ ...formData, personal_phone: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="personal_email">Email</Label>
                <Input
                  id="personal_email"
                  type="email"
                  value={formData.personal_email}
                  onChange={(e) => setFormData({ ...formData, personal_email: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="date_of_birth">Date of Birth</Label>
                <Input
                  id="date_of_birth"
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="gender">Gender</Label>
                <Select
                  value={formData.gender}
                  onValueChange={(value) => setFormData({ ...formData, gender: value })}
                >
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
            </div>
          </div>

          {/* Address Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Address Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="address_line1">Address</Label>
                <Input
                  id="address_line1"
                  value={formData.address_line1}
                  onChange={(e) => setFormData({ ...formData, address_line1: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="pincode">Pincode</Label>
                <Input
                  id="pincode"
                  value={formData.pincode}
                  onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Employment Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Employment Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="joining_date">Joining Date</Label>
                <Input
                  id="joining_date"
                  type="date"
                  value={formData.joining_date}
                  onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="employment_type">Employment Type</Label>
                <Select
                  value={formData.employment_type}
                  onValueChange={(value) => setFormData({ ...formData, employment_type: value })}
                >
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
                <Label htmlFor="salary">Salary (₹)</Label>
                <Input
                  id="salary"
                  type="number"
                  value={formData.salary}
                  onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                  placeholder="e.g., 25000"
                />
              </div>

              <div>
                <Label htmlFor="work_hours_per_day">Work Hours per Day</Label>
                <Input
                  id="work_hours_per_day"
                  type="number"
                  min="1"
                  max="12"
                  value={formData.work_hours_per_day}
                  onChange={(e) => setFormData({ ...formData, work_hours_per_day: e.target.value })}
                  placeholder="8"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end space-x-4 pt-6">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {tailor ? 'Update Tailor' : 'Create Tailor'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
