import { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { ErpLayout } from "@/components/ErpLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInYears, differenceInMonths } from "date-fns";
import { 
  ArrowLeft, 
  Edit, 
  Phone, 
  Mail, 
  MapPin, 
  Calendar, 
  Briefcase, 
  UserCheck, 
  Palette, 
  Scissors,
  Building,
  Users
} from "lucide-react";
import { ProductionTeamForm } from "@/components/people/ProductionTeamForm";

interface ProductionTeamMember {
  id: string;
  employee_code: string;
  full_name: string;
  date_of_birth: string;
  gender: string;
  personal_email?: string;
  personal_phone: string;
  address_line1: string;
  city: string;
  state: string;
  pincode: string;
  designation: string;
  tailor_type?: string;
  is_batch_leader?: boolean;
  batch_leader_id?: string;
  per_piece_rate?: number;
  joining_date: string;
  employment_type: string;
  created_at: string;
  avatar_url?: string;
  updated_at?: string;
  batch_leader?: {
    full_name: string;
    employee_code: string;
  };
  team_members?: ProductionTeamMember[];
}

export default function ProductionTeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [member, setMember] = useState<ProductionTeamMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const isEditMode = searchParams.get('edit') === 'true';

  useEffect(() => {
    if (isEditMode) {
      setIsEditing(true);
    }
  }, [isEditMode]);

  const fetchMember = async () => {
    if (!id) return;
    
    try {
      const { data, error } = await supabase
        .from('production_team')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      
      // Also fetch team members if this person is a batch leader
      if (data.is_batch_leader) {
        const { data: teamData, error: teamError } = await supabase
          .from('production_team')
          .select('*')
          .eq('batch_leader_id', id);

        if (!teamError && teamData) {
          data.team_members = teamData;
        }
      }

      // Also fetch batch leader info if this person has a batch leader
      if (data.batch_leader_id) {
        const { data: leaderData, error: leaderError } = await supabase
          .from('production_team')
          .select('full_name, employee_code')
          .eq('id', data.batch_leader_id)
          .single();

        if (!leaderError && leaderData) {
          data.batch_leader = leaderData;
        }
      }

      setMember(data);
    } catch (error) {
      console.error('Error fetching member:', error);
      toast({
        title: "Error",
        description: "Failed to fetch member details.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMember();
  }, [id]);

  const getDesignationIcon = (designation: string) => {
    switch (designation) {
      case 'Pattern Master': return Palette;
      case 'Cutting Manager': return Scissors;
      case 'Single Needle Tailor': return UserCheck;
      case 'Overlock/Flatlock Tailor': return UserCheck;
      default: return UserCheck;
    }
  };

  const getDesignationBadgeVariant = (designation: string) => {
    switch (designation) {
      case 'Pattern Master': return 'default';
      case 'Cutting Manager': return 'secondary';
      case 'Single Needle Tailor': return 'outline';
      case 'Overlock/Flatlock Tailor': return 'destructive';
      default: return 'default';
    }
  };

  const getAvatarUrl = (member: ProductionTeamMember) => {
    if (member.avatar_url) {
      return member.avatar_url;
    }
    
    const avatars = [
      'photo-1581092795360-fd1ca04f0952',
      'photo-1485827404703-89b55fcc595e',
      'photo-1581091226825-a6a2a5aee158',
      'photo-1501286353178-1ec881214838'
    ];
    const index = member.full_name.charCodeAt(0) % avatars.length;
    return `https://images.unsplash.com/${avatars[index]}?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=150&h=150&q=80`;
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

  const handleEditSuccess = () => {
    setIsEditing(false);
    fetchMember();
    toast({
      title: "Success",
      description: "Member details updated successfully.",
    });
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    // Remove edit parameter from URL
    navigate(`/people/production-team/${id}`);
  };

  if (loading) {
    return (
      <ErpLayout>
        <div className="text-center py-12">Loading member details...</div>
      </ErpLayout>
    );
  }

  if (!member) {
    return (
      <ErpLayout>
        <div className="text-center py-12">
          <h2 className="text-xl font-semibold mb-2">Member not found</h2>
          <Button onClick={() => navigate('/people/production-team')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Production Team
          </Button>
        </div>
      </ErpLayout>
    );
  }

  if (isEditing) {
    return (
      <ErpLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={handleEditCancel}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Cancel Edit
            </Button>
            <h1 className="text-3xl font-bold">Edit Production Team Member</h1>
          </div>
          <ProductionTeamForm
            onSuccess={handleEditSuccess}
            onCancel={handleEditCancel}
            editMode={true}
            memberData={member}
          />
        </div>
      </ErpLayout>
    );
  }

  const DesignationIcon = getDesignationIcon(member.designation);

  return (
    <ErpLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => navigate('/people/production-team')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                {member.full_name}
              </h1>
              <p className="text-muted-foreground">Production Team Member Details</p>
            </div>
          </div>
          <Button onClick={() => setIsEditing(true)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit Member
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Card */}
          <div className="lg:col-span-1">
            <Card>
                             <CardHeader className="text-center">
                 <div className="w-32 h-32 mx-auto mb-4 rounded-lg overflow-hidden bg-gradient-to-br from-primary/10 to-primary/20">
                   <img 
                     src={getAvatarUrl(member)} 
                     alt={member.full_name}
                     className="w-full h-full object-cover"
                     onError={(e) => {
                       const target = e.target as HTMLImageElement;
                       target.style.display = 'none';
                       const fallback = target.nextElementSibling as HTMLElement;
                       if (fallback) fallback.style.display = 'flex';
                     }}
                   />
                   <div 
                     className="w-full h-full bg-gradient-primary text-white flex items-center justify-center text-3xl font-bold"
                     style={{ display: 'none' }}
                   >
                     {member.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                   </div>
                 </div>
                <CardTitle className="text-xl">{member.full_name}</CardTitle>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <DesignationIcon className="w-4 h-4 text-primary" />
                  <Badge variant={getDesignationBadgeVariant(member.designation)}>
                    {member.designation}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{member.employee_code}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  <span className="font-medium">{member.personal_phone}</span>
                </div>
                
                {member.personal_email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-primary" />
                    <span className="truncate">{member.personal_email}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-success">
                  <div className="w-2 h-2 bg-success rounded-full"></div>
                  <span>Active Since ({getExperienceText(member.joining_date)})</span>
                </div>

                {member.is_batch_leader && (
                  <div className="flex items-center gap-2 text-green-600">
                    <Users className="w-4 h-4" />
                    <span className="font-medium">Batch Leader</span>
                  </div>
                )}

                {member.batch_leader && (
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    <span>Leader: {member.batch_leader.full_name}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="w-5 h-5" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Date of Birth</label>
                    <p className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {format(new Date(member.date_of_birth), 'dd MMMM yyyy')}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Gender</label>
                    <p>{member.gender}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Address Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Address Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Address</label>
                  <p>{member.address_line1}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">City</label>
                    <p>{member.city}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">State</label>
                    <p>{member.state}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Pincode</label>
                    <p>{member.pincode}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Employment Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="w-5 h-5" />
                  Employment Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Joining Date</label>
                    <p className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4" />
                      {format(new Date(member.joining_date), 'dd MMMM yyyy')}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Employment Type</label>
                    <p>{member.employment_type}</p>
                  </div>
                </div>

                {member.tailor_type && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Tailor Type</label>
                    <p>{member.tailor_type}</p>
                  </div>
                )}

                {member.per_piece_rate && member.per_piece_rate > 0 && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Per Piece Rate</label>
                    <p className="text-lg font-semibold text-success">₹{member.per_piece_rate}/piece</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Team Members (if batch leader) */}
            {member.team_members && member.team_members.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Team Members ({member.team_members.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {member.team_members.map((teamMember) => (
                      <div key={teamMember.id} className="flex items-center justify-between p-3 border rounded-lg">
                                                 <div className="flex items-center gap-3">
                           <div className="w-10 h-10 rounded-lg overflow-hidden bg-gradient-to-br from-primary/10 to-primary/20">
                             <img 
                               src={getAvatarUrl(teamMember)} 
                               alt={teamMember.full_name}
                               className="w-full h-full object-cover"
                               onError={(e) => {
                                 const target = e.target as HTMLImageElement;
                                 target.style.display = 'none';
                                 const fallback = target.nextElementSibling as HTMLElement;
                                 if (fallback) fallback.style.display = 'flex';
                               }}
                             />
                             <div 
                               className="w-full h-full bg-gradient-primary text-white flex items-center justify-center text-sm font-bold"
                               style={{ display: 'none' }}
                             >
                               {teamMember.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                             </div>
                           </div>
                          <div>
                            <p className="font-medium">{teamMember.full_name}</p>
                            <p className="text-sm text-muted-foreground">{teamMember.designation}</p>
                          </div>
                        </div>
                        <Badge variant="outline">{teamMember.employee_code}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </ErpLayout>
  );
}
