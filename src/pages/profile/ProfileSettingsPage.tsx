import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AvatarUploader } from "@/components/ui/avatar-uploader";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/components/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  User, 
  Phone, 
  Mail, 
  Building, 
  MapPin, 
  Save, 
  ArrowLeft, 
  Award, 
  Star, 
  Trophy, 
  Shield, 
  Settings,
  Camera,
  Lock,
  Bell,
  Palette
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

export default function ProfileSettingsPage() {
  const { user, profile, refreshProfile, profileLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const formInitializedRef = useRef(false);
  const lastProfileIdRef = useRef<string | null>(null);
  const [formData, setFormData] = useState({
    full_name: '',
    email: user?.email || '',
    phone: '',
    department: '',
    role: 'sales',
    avatar_url: ''
  });

  // Reset refs when user changes
  useEffect(() => {
    if (user?.id) {
      const currentUserId = user.id;
      if (lastProfileIdRef.current && lastProfileIdRef.current !== currentUserId) {
        console.log('User changed, resetting form initialization');
        formInitializedRef.current = false;
        lastProfileIdRef.current = null;
      }
    }
  }, [user?.id]);

  // Load profile data on mount if not already loaded
  useEffect(() => {
    if (user && !profile && !profileLoading) {
      console.log('Profile not loaded, refreshing...');
      refreshProfile().catch(err => {
        console.error('Error refreshing profile:', err);
      });
    }
  }, [user, profile, profileLoading, refreshProfile]);

  // Update formData when profile changes (e.g., after save or page refresh)
  useEffect(() => {
    if (profile) {
      const profileId = profile.id || profile.user_id;
      const profileChanged = lastProfileIdRef.current !== profileId;
      
      // Always update if profile changed or form hasn't been initialized
      if (profileChanged || !formInitializedRef.current) {
        console.log('Profile loaded, updating form data:', profile, {
          profileId,
          previousId: lastProfileIdRef.current,
          profileChanged,
          formInitialized: formInitializedRef.current
        });
        
        const newData = {
          full_name: profile.full_name || '',
          email: profile.email || user?.email || '',
          phone: profile.phone || '',
          department: profile.department || '',
          role: profile.role || 'sales',
          avatar_url: profile?.avatar_url || ''
        };
        
        console.log('Setting form data to:', newData);
        setFormData(newData);
        lastProfileIdRef.current = profileId;
        formInitializedRef.current = true;
      } else {
        console.log('Profile unchanged, skipping form data update');
      }
    } else if (user && !profile && !profileLoading) {
      // If user exists but profile hasn't loaded yet, initialize with user data only
      if (!formInitializedRef.current) {
        console.log('Profile not loaded yet, initializing with user email only');
        setFormData(prev => ({
          ...prev,
          email: user.email || prev.email
        }));
      }
    }
  }, [profile, user?.email, user, profileLoading]);

  // Mock rewards and recognition data
  const [rewards] = useState([
    // ...existing code...
  ]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAvatarUpload = async (url: string) => {
    if (!user) return;
    try {
      console.log('🔄 Updating avatar in database:', { userId: user.id, avatarUrl: url });
      
      // Update avatar_url in database
      const { data, error } = await supabase
        .from('profiles')
        .update({
          avatar_url: url
        } as any)
        .eq('user_id', user.id as any)
        .select(); // Select to verify the update
      
      if (error) {
        console.error('❌ Database update error:', error);
        throw error;
      }
      
      console.log('✅ Avatar updated in database:', data);
      
      // Verify the update by fetching the profile
      const { data: verifyData, error: verifyError } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('user_id', user.id as any)
        .single();
      
      if (verifyError) {
        console.error('❌ Verification error:', verifyError);
      } else {
        console.log('✅ Verified avatar in database:', verifyData);
      }
      
      // Update local form data
    setFormData(prev => ({ ...prev, avatar_url: url }));
      
      // Force refresh profile to get updated data
      await refreshProfile();
    toast.success('Avatar uploaded successfully');
    } catch (error: any) {
      console.error('❌ Avatar upload error:', error);
      toast.error('Failed to upload avatar: ' + (error.message || 'Unknown error'));
    }
  };

  const handleAvatarDelete = async () => {
    if (!user) return;
    try {
      // Update avatar_url in database
      const { error } = await supabase
        .from('profiles')
        .update({
          avatar_url: null
        } as any)
        .eq('user_id', user.id as any);
      
      if (error) throw error;
      
      // Update local form data
    setFormData(prev => ({ ...prev, avatar_url: '' }));
      
      // Force refresh profile to get updated data
      await refreshProfile();
    toast.success('Avatar deleted successfully');
    } catch (error: any) {
      console.error('Avatar delete error:', error);
      toast.error('Failed to delete avatar: ' + (error.message || 'Unknown error'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      console.log('🔄 Saving profile data:', { userId: user.id, formData });
      
      // First check if profile exists
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('id, avatar_url')
        .eq('user_id', user.id)
        .single();
      
      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('❌ Error checking profile:', checkError);
        throw checkError;
      }
      
      console.log('📋 Existing profile:', existingProfile);
      
      // Update profile
      const { data, error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          phone: formData.phone,
          department: formData.department,
          role: formData.role as any,
          avatar_url: formData.avatar_url
        })
        .eq('user_id', user.id)
        .select(); // Select to verify the update
      
      if (error) {
        console.error('❌ Database update error:', error);
        throw error;
      }
      
      console.log('✅ Profile updated in database:', data);
      
      // Verify the update
      const { data: verifyData, error: verifyError } = await supabase
        .from('profiles')
        .select('avatar_url, full_name, phone, department, role')
        .eq('user_id', user.id)
        .single();
      
      if (verifyError) {
        console.error('❌ Verification error:', verifyError);
      } else {
        console.log('✅ Verified profile in database:', verifyData);
      }

      await refreshProfile();
      toast.success('Profile updated successfully!');
    } catch (error: any) {
      console.error('❌ Profile update error:', error);
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while profile is being loaded
  if (profileLoading && !profile) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading profile...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button 
            variant="ghost" 
            onClick={() => navigate(-1)}
            className="flex items-center"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Profile Settings
            </h1>
            <p className="text-muted-foreground text-lg">Manage your account information and preferences</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile" className="flex items-center space-x-2">
            <User className="w-4 h-4" />
            <span>Profile</span>
          </TabsTrigger>
          <TabsTrigger value="rewards" className="flex items-center space-x-2">
            <Award className="w-4 h-4" />
            <span>Rewards</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center space-x-2">
            <Lock className="w-4 h-4" />
            <span>Security</span>
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex items-center space-x-2">
            <Settings className="w-4 h-4" />
            <span>Preferences</span>
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-6">
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Profile Picture Card */}
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Camera className="w-5 h-5 mr-2" />
                    Profile Picture
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center space-y-6">
                  <div className="w-48 h-48 rounded-full overflow-hidden border-4 border-primary/20 shadow-lg">
                    <AvatarUploader
                      currentUrl={formData.avatar_url}
                      onUpload={handleAvatarUpload}
                      onDelete={handleAvatarDelete}
                      userId={user?.id || ''}
                      userName={formData.full_name}
                      size="xl"
                    />
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Click to upload a new profile picture
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Supported: PNG, JPG, GIF (max 5MB)
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Personal Information Card */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <User className="w-5 h-5 mr-2" />
                    Personal Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="full_name">Full Name</Label>
                      <Input
                        id="full_name"
                        value={formData.full_name}
                        onChange={(e) => handleInputChange('full_name', e.target.value)}
                        placeholder="Enter your full name"
                        className="h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        placeholder="Enter your email"
                        disabled
                        className="h-12 bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        placeholder="Enter your phone number"
                        className="h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="department">Department</Label>
                      <Input
                        id="department"
                        value={formData.department}
                        onChange={(e) => handleInputChange('department', e.target.value)}
                        placeholder="Enter your department"
                        className="h-12"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value)}>
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="sales">Sales Manager</SelectItem>
                        <SelectItem value="production">Production Manager</SelectItem>
                        <SelectItem value="quality">Quality Manager</SelectItem>
                        <SelectItem value="dispatch">Dispatch Manager</SelectItem>
                        <SelectItem value="inventory">Inventory Manager</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={loading} className="px-8 h-12 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70">
                      <Save className="w-4 h-4 mr-2" />
                      {loading ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </form>
        </TabsContent>

        {/* Rewards Tab */}
        <TabsContent value="rewards" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rewards.map((reward) => (
              <Card key={reward.id} className="hover:shadow-lg transition-shadow duration-300">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-4">
                    <div className={`p-3 rounded-full bg-primary/10 ${reward.color}`}>
                      <reward.icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{reward.title}</h3>
                      <p className="text-sm text-muted-foreground">{format(new Date(reward.date), 'dd-MMM-yy')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Trophy className="w-5 h-5 mr-2" />
                Achievement Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">4</div>
                  <div className="text-sm text-yellow-700">Awards Won</div>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">12</div>
                  <div className="text-sm text-blue-700">Months Active</div>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">98%</div>
                  <div className="text-sm text-green-700">Performance</div>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">15</div>
                  <div className="text-sm text-purple-700">Projects</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Lock className="w-5 h-5 mr-2" />
                  Two-Factor Authentication
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Add an extra layer of security to your account
                </p>
                <Button variant="outline" className="w-full">
                  Enable 2FA
                </Button>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="w-5 h-5 mr-2" />
                  Change Password
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Update your password to keep your account secure
                </p>
                <Button variant="outline" className="w-full">
                  Change Password
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Bell className="w-5 h-5 mr-2" />
                  Notification Preferences
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Manage your notification settings
                </p>
                <Button variant="outline" className="w-full">
                  Configure Notifications
                </Button>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Palette className="w-5 h-5 mr-2" />
                  Theme Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Customize your interface appearance
                </p>
                <Button variant="outline" className="w-full">
                  Theme Settings
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}