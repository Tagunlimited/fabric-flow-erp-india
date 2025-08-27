import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserPlus, Search, Filter, Phone, Mail, MapPin, Calendar, Briefcase, Edit, Scissors, Palette, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInYears, differenceInMonths } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { ProductionTeamForm } from "./ProductionTeamForm";

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

export function ProductionTeamList() {
  const [teamMembers, setTeamMembers] = useState<ProductionTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [designationFilter, setDesignationFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchTeamMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('production_team')
        .select('*')
        .order('full_name');

      if (error) throw error;
      
      // Type-safe conversion with validation
      const teamMembersData = data?.map((item: any) => ({
        id: item.id,
        employee_code: item.employee_code,
        full_name: item.full_name,
        date_of_birth: item.date_of_birth,
        gender: item.gender,
        personal_email: item.personal_email,
        personal_phone: item.personal_phone,
        address_line1: item.address_line1,
        city: item.city,
        state: item.state,
        pincode: item.pincode,
        designation: item.designation,
        tailor_type: item.tailor_type,
        is_batch_leader: item.is_batch_leader,
        batch_leader_id: item.batch_leader_id,
        
        joining_date: item.joining_date,
        employment_type: item.employment_type,
        created_at: item.created_at,
        avatar_url: item.avatar_url,
        updated_at: item.updated_at,
        batch_leader: item.batch_leader,
      })) || [];
      
      // Organize into hierarchical structure
      const organizedData: ProductionTeamMember[] = teamMembersData.map(member => {
        const organizedMember: ProductionTeamMember = {
          ...member,
          team_members: member.is_batch_leader 
            ? teamMembersData.filter(m => m.batch_leader_id === member.id)
            : undefined
        };
        return organizedMember;
      });
      
      setTeamMembers(organizedData);
    } catch (error) {
      console.error('Error fetching production team:', error);
      toast({
        title: "Error",
        description: "Failed to fetch production team members. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  const filteredTeamMembers = teamMembers.filter(member => {
    const matchesSearch = member.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.employee_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.designation.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.personal_phone.includes(searchTerm);
    
    const matchesDesignation = designationFilter === "all" || member.designation === designationFilter;
    
    return matchesSearch && matchesDesignation;
  });

  const designations = [...new Set(teamMembers.map(member => member.designation))];

  const getDesignationBadgeVariant = (designation: string) => {
    switch (designation) {
      case 'Pattern Master': return 'default';
      case 'Cutting Manager': return 'secondary';
      case 'Single Needle Tailor': return 'outline';
      case 'Overlock/Flatlock Tailor': return 'destructive';
      default: return 'default';
    }
  };

  const getDesignationIcon = (designation: string) => {
    switch (designation) {
      case 'Pattern Master': return Palette;
      case 'Cutting Manager': return Scissors;
      case 'Single Needle Tailor': return UserCheck;
      case 'Overlock/Flatlock Tailor': return UserCheck;
      default: return UserCheck;
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

  const handleMemberAdded = () => {
    fetchTeamMembers();
    setIsDialogOpen(false);
    toast({
      title: "Success",
      description: "Production team member added successfully.",
    });
  };

  const handleCardClick = (memberId: string) => {
    navigate(`/people/production-team/${memberId}`);
  };

  const handleEditClick = (e: React.MouseEvent, memberId: string) => {
    e.stopPropagation(); // Prevent card click
    navigate(`/people/production-team/${memberId}?edit=true`);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading production team...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Production Team Directory</h3>
          <p className="text-sm text-muted-foreground">
            Manage pattern masters, cutting managers, and tailors
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Team Member
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Production Team Member</DialogTitle>
            </DialogHeader>
            <div className="p-6">
              <ProductionTeamForm 
                onSuccess={handleMemberAdded}
                onCancel={() => setIsDialogOpen(false)}
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search by name, code, designation, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={designationFilter} onValueChange={setDesignationFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by designation" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Designations</SelectItem>
            {designations.map(designation => (
              <SelectItem key={designation} value={designation}>{designation}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredTeamMembers.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
            <Scissors className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">No production team members found</h3>
          <p className="text-muted-foreground">Try adjusting your search criteria or add a new team member.</p>
        </div>
      ) : (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredTeamMembers.map((member) => {
            const DesignationIcon = getDesignationIcon(member.designation);
            return (
                             <Card 
                 key={member.id} 
                 className="cursor-pointer hover:shadow-lg transition-all duration-300 border-0 bg-gradient-to-br from-card to-card/80"
                 onClick={() => handleCardClick(member.id)}
               >
                 <CardContent className="p-4">
                   <div className="flex items-center gap-3">
                     <div className="relative">
                                               <div className="w-16 h-16 rounded-lg overflow-hidden bg-gradient-to-br from-primary/10 to-primary/20">
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
                            className="w-full h-full bg-gradient-primary text-white flex items-center justify-center text-base font-bold"
                            style={{ display: 'none' }}
                          >
                            {member.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                          </div>
                       </div>
                     </div>
                     
                     <div className="flex-1 min-w-0">
                       <h3 className="font-semibold text-sm text-primary leading-tight truncate">
                         {member.full_name}
                       </h3>
                       <div className="flex items-center gap-1 mt-1">
                         <DesignationIcon className="h-3 w-3 text-primary" />
                         <Badge variant={getDesignationBadgeVariant(member.designation)} className="text-xs px-1 py-0">
                           {member.designation}
                         </Badge>
                       </div>
                       <div className="flex items-center text-xs mt-1">
                         <Phone className="w-3 h-3 mr-1 text-primary" />
                         <span className="font-medium truncate">{member.personal_phone}</span>
                       </div>
                       <div className="flex items-center text-xs text-success mt-1">
                         <div className="w-1.5 h-1.5 bg-success rounded-full mr-1"></div>
                         <span className="truncate">Active ({getExperienceText(member.joining_date)})</span>
                       </div>
                     </div>
                     
                     <Edit 
                       className="w-4 h-4 text-muted-foreground hover:text-primary cursor-pointer flex-shrink-0" 
                       onClick={(e) => handleEditClick(e, member.id)}
                     />
                   </div>
                 </CardContent>
               </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6 text-sm text-muted-foreground text-center">
        Showing {filteredTeamMembers.length} of {teamMembers.length} production team members
      </div>
    </div>
  );
}
