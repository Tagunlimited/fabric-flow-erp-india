import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Users, 
  UserPlus, 
  Settings, 
  Search,
  Filter,
  Eye,
  Edit,
  Plus,
  Scissors,
  Target,
  Calendar,
  Phone,
  Mail,
  MapPin,
  Grid3X3,
  List,
  Trash2
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TailorForm } from "@/components/people/TailorForm";
import { BatchForm } from "@/components/people/BatchForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Tailor {
  id: string;
  tailor_code: string;
  full_name: string;
  avatar_url?: string;
  tailor_type: 'single_needle' | 'overlock_flatlock';
  skill_level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  batch_id: string | null;
  is_batch_leader: boolean;
  status: 'active' | 'inactive' | 'on_leave' | 'terminated';
  batch_name: string | null;
  batch_code: string | null;
  max_capacity: number | null;
  current_capacity: number | null;
  assigned_orders: number;
  active_orders: number;
  completed_orders: number;
  personal_phone: string;
  personal_email?: string;
  joining_date: string;
  employment_type: string;
  salary: number;
  work_hours_per_day: number;
  id_proof_type?: string;
  id_proof_number?: string;
  id_proof_image_url?: string;
  id_proof_back_image_url?: string;
  bank_name?: string;
  account_holder_name?: string;
  account_number?: string;
  ifsc_code?: string;
  passbook_image_url?: string;
}

interface Batch {
  id: string;
  batch_name: string;
  batch_code: string;
  tailor_type: 'single_needle' | 'overlock_flatlock';
  batch_leader_id: string | null;
  max_capacity: number;
  current_capacity: number;
  status: 'active' | 'inactive' | 'full';
  batch_leader_name?: string;
  tailors_count: number;
}

const TailorManagementPage = () => {
  const [tailors, setTailors] = useState<Tailor[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [viewMode, setViewMode] = useState<'tailors' | 'batches'>('tailors');
  const [batchFilter, setBatchFilter] = useState("all");
  const [isTailorDialogOpen, setIsTailorDialogOpen] = useState(false);
  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [editingTailor, setEditingTailor] = useState<Tailor | null>(null);
  const [viewingTailor, setViewingTailor] = useState<Tailor | null>(null);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [viewingBatch, setViewingBatch] = useState<Batch | null>(null);
  const { toast } = useToast();

  const fetchTailors = async () => {
    try {
      // First fetch batches to use for manual join
      const { data: batchesData } = await supabase
        .from('batches')
        .select('*');
      
      // Then fetch tailors
      let data, error;
      
      try {
        const result = await supabase
          .from('tailor_management_view')
          .select('*')
          .order('full_name');
        data = result.data;
        error = result.error;
      } catch (viewError) {
        // If view doesn't exist, fetch from tailors table directly
        console.log('View not found, fetching from tailors table...');
        const result = await supabase
          .from('tailors')
          .select('*')
          .order('full_name');
        data = result.data;
        error = result.error;
      }

      if (error) throw error;
      
      // Transform data to match the expected interface
      const transformedData = (data || []).map(tailor => {
        console.log('Processing tailor:', tailor.full_name, 'batch_id:', tailor.batch_id, 'batch_data:', tailor.batches);
        
        // Manual join with batches data
        const batchInfo = tailor.batches || (tailor.batch_id ? batchesData?.find((b: any) => b?.id === tailor.batch_id) : null);
        console.log('Batch info for', tailor.full_name, ':', batchInfo);
        
        return {
          id: tailor.id,
          tailor_code: tailor.tailor_code,
          full_name: tailor.full_name,
          avatar_url: tailor.avatar_url,
          tailor_type: tailor.tailor_type,
          skill_level: tailor.skill_level,
          batch_id: tailor.batch_id,
          is_batch_leader: tailor.is_batch_leader,
          status: tailor.status,
          batch_name: batchInfo?.batch_name || null,
          // batch_code: batchInfo?.batch_code || null,
          max_capacity: batchInfo?.max_capacity || null,
          current_capacity: batchInfo?.current_capacity || null,
          assigned_orders: tailor.active_assignments || 0,
          active_orders: tailor.active_assignments || 0,
          completed_orders: tailor.completed_assignments || 0,
          personal_phone: tailor.personal_phone,
          personal_email: tailor.personal_email,
          joining_date: tailor.joining_date,
          employment_type: tailor.employment_type,
          salary: tailor.salary,
          work_hours_per_day: tailor.work_hours_per_day
        };
      });
      
      setTailors(transformedData);
    } catch (error) {
      console.error('Error fetching tailors:', error);
      toast({
        title: "Error",
        description: "Failed to fetch tailors. Please run the database setup script first.",
        variant: "destructive",
      });
    }
  };

  const fetchBatches = async () => {
    try {
      const { data, error } = await supabase
        .from('batches')
        .select('*')
        .order('batch_name');

      if (error) {
        // If batches table doesn't exist, create empty array
        console.log('Batches table not found, using empty array...');
        setBatches([]);
        return;
      }

      // Get tailor count for each batch
      const batchesWithCount = await Promise.all(
        (data || []).map(async (batch) => {
          const { count } = await supabase
            .from('tailors')
            .select('*', { count: 'exact', head: true })
            .eq('batch_id', (batch as any).id);

          return {
            ...(batch as any || {}),
            batch_leader_name: null, // Will be populated if needed
            tailors_count: count || 0
          };
        })
      );

      console.log('Fetched batches:', batchesWithCount);
      setBatches(batchesWithCount);
    } catch (error) {
      console.error('Error fetching batches:', error);
      setBatches([]);
      toast({
        title: "Info",
        description: "Batches table not found. Please run the database setup script to create it.",
        variant: "default",
      });
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchTailors(), fetchBatches()]);
      setLoading(false);
    };
    loadData();
  }, []);

  const handleTailorAdded = () => {
    fetchTailors();
    setIsTailorDialogOpen(false);
  };

  const handleBatchAdded = () => {
    fetchBatches();
    setIsBatchDialogOpen(false);
  };

  const handleEditTailor = (tailor: Tailor) => {
    setEditingTailor(tailor);
    setIsTailorDialogOpen(true);
  };

  const handleViewTailor = (tailor: Tailor) => {
    setViewingTailor(tailor);
  };

  const handleTailorUpdated = () => {
    fetchTailors();
    setEditingTailor(null);
    setIsTailorDialogOpen(false);
  };

  const handleCloseTailorDialog = () => {
    setEditingTailor(null);
    setIsTailorDialogOpen(false);
  };

  const handleDeleteTailor = async (tailor: Tailor) => {
    if (!confirm(`Are you sure you want to delete ${tailor.full_name}? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('tailors')
        .delete()
        .eq('id', tailor.id as any);

      if (error) throw error;

      toast({
        title: "Success",
        description: `${tailor.full_name} has been deleted successfully.`,
      });

      fetchTailors();
    } catch (error: any) {
      console.error('Error deleting tailor:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete tailor. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleEditBatch = (batch: Batch) => {
    setEditingBatch(batch);
    setIsBatchDialogOpen(true);
  };

  const handleDeleteBatch = async (batch: Batch) => {
    if (!confirm(`Are you sure you want to delete ${batch.batch_name}? This will unassign all tailors from this batch. This action cannot be undone.`)) {
      return;
    }

    try {
      // First, unassign all tailors from this batch
      await supabase
        .from('tailors')
        .update({ batch_id: null, is_batch_leader: false } as any)
        .eq('batch_id', batch.id as any);

      // Then delete the batch
      const { error } = await supabase
        .from('batches')
        .delete()
        .eq('id', batch.id as any);

      if (error) throw error;

      toast({
        title: "Success",
        description: `${batch.batch_name} has been deleted successfully.`,
      });

      fetchBatches();
      fetchTailors(); // Refresh tailors to update batch assignments
    } catch (error: any) {
      console.error('Error deleting batch:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete batch. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleBatchUpdated = () => {
    fetchBatches();
    fetchTailors(); // Refresh tailors to update batch assignments
    setEditingBatch(null);
    setIsBatchDialogOpen(false);
  };

  const handleCloseBatchDialog = () => {
    setEditingBatch(null);
    setIsBatchDialogOpen(false);
  };

  const handleViewBatch = (batch: Batch) => {
    setViewingBatch(batch);
  };

  const filteredTailors = tailors.filter(tailor => {
    const matchesSearch = tailor.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tailor.tailor_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         tailor.batch_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = typeFilter === "all" || tailor.tailor_type === typeFilter;
    const matchesBatch = batchFilter === "all" || tailor.batch_id === batchFilter;
    
    return matchesSearch && matchesType && matchesBatch;
  });

  const getTailorTypeColor = (type: string) => {
    switch (type) {
      case 'single_needle': return 'bg-blue-100 text-blue-800';
      case 'overlock_flatlock': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTailorTypeLabel = (type: string) => {
    switch (type) {
      case 'single_needle': return 'Single Needle';
      case 'overlock_flatlock': return 'Overlock/Flatlock';
      default: return type;
    }
  };

  const getBatchStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'full': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getAvatarUrl = (tailor: Tailor) => {
    if (tailor.avatar_url) {
      return tailor.avatar_url;
    }
    
    // Fallback to placeholder images
    const avatars = [
      'photo-1581092795360-fd1ca04f0952',
      'photo-1485827404703-89b55fcc595e',
      'photo-1581091226825-a6a2a5aee158',
      'photo-1501286353178-1ec881214838'
    ];
    const index = tailor.full_name.charCodeAt(0) % avatars.length;
    return `https://images.unsplash.com/${avatars[index]}?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=150&h=150&q=80`;
  };

  if (loading) {
    return (
      <ErpLayout>
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="text-center">Loading tailor management...</div>
            </CardContent>
          </Card>
        </div>
      </ErpLayout>
    );
  }

  return (
    <ErpLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-primary">Tailor Management</h1>
            <p className="text-muted-foreground">Manage tailors, batches, and assignments</p>
          </div>
          <div className="flex gap-2">
            <Dialog open={isTailorDialogOpen} onOpenChange={setIsTailorDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Tailor
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingTailor ? 'Edit Tailor' : 'Add New Tailor'}</DialogTitle>
                </DialogHeader>
                <TailorForm 
                  tailor={editingTailor} 
                  onSuccess={editingTailor ? handleTailorUpdated : handleTailorAdded} 
                  onCancel={handleCloseTailorDialog} 
                />
              </DialogContent>
            </Dialog>
            
            <Dialog open={isBatchDialogOpen} onOpenChange={setIsBatchDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Batch
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingBatch ? 'Edit Batch' : 'Create New Batch'}</DialogTitle>
                </DialogHeader>
                <BatchForm 
                  batch={editingBatch} 
                  onSuccess={editingBatch ? handleBatchUpdated : handleBatchAdded} 
                  onCancel={handleCloseBatchDialog} 
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button
              variant={viewMode === 'tailors' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('tailors')}
            >
              <List className="w-4 h-4 mr-2" />
              Tailor View
            </Button>
            <Button
              variant={viewMode === 'batches' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('batches')}
            >
              <Grid3X3 className="w-4 h-4 mr-2" />
              Batch View
            </Button>
          </div>
        </div>

        {/* View Tailor Dialog */}
        <Dialog open={!!viewingTailor} onOpenChange={() => setViewingTailor(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Tailor Details</DialogTitle>
            </DialogHeader>
            {viewingTailor && (
              <div className="space-y-6">
                {/* Avatar and Basic Info */}
                <div className="flex items-center space-x-6">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={viewingTailor.avatar_url} alt={viewingTailor.full_name} />
                    <AvatarFallback className="text-lg">
                      {viewingTailor.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold">{viewingTailor.full_name}</h2>
                    <p className="text-muted-foreground">{viewingTailor.tailor_code}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge variant={
                        viewingTailor.tailor_type === 'single_needle' ? 'default' : 'secondary'
                      }>
                        {viewingTailor.tailor_type === 'single_needle' ? 'Single Needle' : 'Overlock/Flatlock'}
                      </Badge>
                      <Badge variant={
                        viewingTailor.skill_level === 'expert' ? 'default' :
                        viewingTailor.skill_level === 'advanced' ? 'secondary' :
                        viewingTailor.skill_level === 'intermediate' ? 'outline' : 'destructive'
                      }>
                        {viewingTailor.skill_level.charAt(0).toUpperCase() + viewingTailor.skill_level.slice(1)}
                      </Badge>
                      <Badge variant={
                        viewingTailor.status === 'active' ? 'default' :
                        viewingTailor.status === 'inactive' ? 'secondary' :
                        viewingTailor.status === 'on_leave' ? 'outline' : 'destructive'
                      }>
                        {viewingTailor.status.charAt(0).toUpperCase() + viewingTailor.status.slice(1).replace('_', ' ')}
                      </Badge>
                      {viewingTailor.is_batch_leader && (
                        <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600 text-white">
                          Batch Leader
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Personal Information</h3>
                    <div className="space-y-2">
                      <div>
                        <span className="font-medium">Phone:</span> {viewingTailor.personal_phone}
                      </div>
                      {viewingTailor.personal_email && (
                        <div>
                          <span className="font-medium">Email:</span> {viewingTailor.personal_email}
                        </div>
                      )}
                      <div>
                        <span className="font-medium">Joining Date:</span> {viewingTailor.joining_date}
                      </div>
                      <div>
                        <span className="font-medium">Employment Type:</span> {viewingTailor.employment_type}
                      </div>
                      {viewingTailor.salary && (
                        <div>
                          <span className="font-medium">Salary:</span> ₹{viewingTailor.salary.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Work Information</h3>
                    <div className="space-y-2">
                      <div>
                        <span className="font-medium">Batch:</span> {viewingTailor.batch_name || 'No batch assigned'}
                      </div>
                      <div>
                        <span className="font-medium">Role:</span> {viewingTailor.is_batch_leader ? 'Batch Leader' : 'Tailor'}
                      </div>
                      <div>
                        <span className="font-medium">Work Hours/Day:</span> {viewingTailor.work_hours_per_day} hours
                      </div>
                      <div>
                        <span className="font-medium">Active Orders:</span> {viewingTailor.active_orders}
                      </div>
                      <div>
                        <span className="font-medium">Completed Orders:</span> {viewingTailor.completed_orders}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end space-x-4 pt-6 border-t">
                  <Button variant="outline" onClick={() => setViewingTailor(null)}>
                    Close
                  </Button>
                  <Button onClick={() => {
                    setViewingTailor(null);
                    handleEditTailor(viewingTailor);
                  }}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Tailor
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* View Batch Dialog */}
        <Dialog open={!!viewingBatch} onOpenChange={() => setViewingBatch(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Batch Details - {viewingBatch?.batch_name}</DialogTitle>
            </DialogHeader>
            {viewingBatch && (
              <div className="space-y-6">
                {/* Batch Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Batch Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <span className="font-medium">Batch Name:</span> {viewingBatch.batch_name}
                      </div>
                      <div>
                        <span className="font-medium">Batch Code:</span> {viewingBatch.batch_code}
                      </div>
                      <div>
                        <span className="font-medium">Status:</span> 
                        <Badge className={`ml-2 ${getBatchStatusColor(viewingBatch.status)}`}>
                          {viewingBatch.status}
                        </Badge>
                      </div>
                      <div>
                        <span className="font-medium">Capacity:</span> {viewingBatch.current_capacity}/{viewingBatch.max_capacity}
                      </div>
                      <div>
                        <span className="font-medium">Total Tailors:</span> {viewingBatch.tailors_count}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Team Performance</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-blue-50 rounded-lg">
                          <div className="text-2xl font-bold text-blue-600">0</div>
                          <div className="text-sm text-blue-600">Total Orders</div>
                        </div>
                        <div className="text-center p-3 bg-green-50 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">0</div>
                          <div className="text-sm text-green-600">Completed</div>
                        </div>
                        <div className="text-center p-3 bg-yellow-50 rounded-lg">
                          <div className="text-2xl font-bold text-yellow-600">0</div>
                          <div className="text-sm text-yellow-600">In Progress</div>
                        </div>
                        <div className="text-center p-3 bg-purple-50 rounded-lg">
                          <div className="text-2xl font-bold text-purple-600">0%</div>
                          <div className="text-sm text-purple-600">Quality Score</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Team Members with Performance */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Team Members & Performance</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {(() => {
                        const batchTailors = tailors.filter(t => t.batch_id === viewingBatch.id);
                        const batchLeader = batchTailors.find(t => t.is_batch_leader);
                        const regularTailors = batchTailors.filter(t => !t.is_batch_leader);
                        
                        return (
                          <>
                            {/* Batch Leader */}
                            {batchLeader && (
                              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-3">
                                    <Avatar className="w-12 h-12">
                                      <AvatarImage src={batchLeader.avatar_url} alt={batchLeader.full_name} />
                                      <AvatarFallback>
                                        {batchLeader.full_name.split(' ').map(n => n[0]).join('')}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <div className="font-medium">{batchLeader.full_name}</div>
                                      <div className="text-sm text-muted-foreground">{batchLeader.tailor_code}</div>
                                    </div>
                                  </div>
                                  <div className="flex space-x-2">
                                    <Badge variant={
                                      batchLeader.tailor_type === 'single_needle' ? 'default' : 'secondary'
                                    }>
                                      {batchLeader.tailor_type === 'single_needle' ? 'Single Needle' : 'Overlock/Flatlock'}
                                    </Badge>
                                    <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600 text-white">
                                      Batch Leader
                                    </Badge>
                                  </div>
                                </div>
                                <div className="mt-4 grid grid-cols-4 gap-4">
                                  <div className="text-center">
                                    <div className="text-lg font-bold">0</div>
                                    <div className="text-xs text-muted-foreground">Orders</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-lg font-bold">0</div>
                                    <div className="text-xs text-muted-foreground">Qty Stitched</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-lg font-bold">0%</div>
                                    <div className="text-xs text-muted-foreground">Quality</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-lg font-bold">0h</div>
                                    <div className="text-xs text-muted-foreground">Hours</div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Regular Tailors */}
                            {regularTailors.map((tailor) => (
                              <div key={tailor.id} className="bg-gray-50 border rounded-lg p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-3">
                                    <Avatar className="w-10 h-10">
                                      <AvatarImage src={tailor.avatar_url} alt={tailor.full_name} />
                                      <AvatarFallback>
                                        {tailor.full_name.split(' ').map(n => n[0]).join('')}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <div className="font-medium">{tailor.full_name}</div>
                                      <div className="text-sm text-muted-foreground">{tailor.tailor_code}</div>
                                    </div>
                                  </div>
                                  <Badge variant={
                                    tailor.tailor_type === 'single_needle' ? 'default' : 'secondary'
                                  }>
                                    {tailor.tailor_type === 'single_needle' ? 'Single Needle' : 'Overlock/Flatlock'}
                                  </Badge>
                                </div>
                                <div className="mt-3 grid grid-cols-4 gap-4">
                                  <div className="text-center">
                                    <div className="text-lg font-bold">0</div>
                                    <div className="text-xs text-muted-foreground">Orders</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-lg font-bold">0</div>
                                    <div className="text-xs text-muted-foreground">Qty Stitched</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-lg font-bold">0%</div>
                                    <div className="text-xs text-muted-foreground">Quality</div>
                                  </div>
                                  <div className="text-center">
                                    <div className="text-lg font-bold">0h</div>
                                    <div className="text-xs text-muted-foreground">Hours</div>
                                  </div>
                                </div>
                              </div>
                            ))}

                            {batchTailors.length === 0 && (
                              <div className="text-center py-8 text-muted-foreground">
                                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                <p>No tailors assigned to this batch</p>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>

                {/* Actions */}
                <div className="flex justify-end space-x-4 pt-6 border-t">
                  <Button variant="outline" onClick={() => setViewingBatch(null)}>
                    Close
                  </Button>
                  <Button onClick={() => {
                    setViewingBatch(null);
                    handleEditBatch(viewingBatch);
                  }}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Batch
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Total Tailors</p>
                  <p className="text-2xl font-bold">{tailors.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Scissors className="h-8 w-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Single Needle</p>
                  <p className="text-2xl font-bold">{tailors.filter(t => t.tailor_type === 'single_needle').length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Target className="h-8 w-8 text-purple-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Overlock/Flatlock</p>
                  <p className="text-2xl font-bold">{tailors.filter(t => t.tailor_type === 'overlock_flatlock').length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <Users className="h-8 w-8 text-orange-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Active Batches</p>
                  <p className="text-2xl font-bold">{batches.filter(b => b.status === 'active').length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Conditional Content Based on View Mode */}
        {viewMode === 'tailors' && (
          <div className="space-y-4">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label htmlFor="search">Search</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="search"
                        placeholder="Search tailors..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="type">Tailor Type</Label>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="single_needle">Single Needle</SelectItem>
                        <SelectItem value="overlock_flatlock">Overlock/Flatlock</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="batch">Batch</Label>
                    <Select value={batchFilter} onValueChange={setBatchFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Batches" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Batches</SelectItem>
                        {batches.map(batch => (
                          <SelectItem key={batch.id} value={batch.id}>{batch.batch_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button className="w-full">
                      <Filter className="w-4 h-4 mr-2" />
                      Apply Filters
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tailors Table */}
            <Card>
              <CardHeader>
                <CardTitle>Tailors ({filteredTailors.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Avatar</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Skill Level</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Orders</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTailors.map((tailor) => (
                      <TableRow key={tailor.id}>
                        <TableCell>
                          <Avatar className="w-12 h-12">
                            <AvatarImage src={tailor.avatar_url} alt={tailor.full_name} />
                            <AvatarFallback className="text-sm">
                              {tailor.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{tailor.full_name}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">{tailor.tailor_code}</div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getTailorTypeColor(tailor.tailor_type)}>
                            {getTailorTypeLabel(tailor.tailor_type)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            tailor.skill_level === 'expert' ? 'default' :
                            tailor.skill_level === 'advanced' ? 'secondary' :
                            tailor.skill_level === 'intermediate' ? 'outline' : 'destructive'
                          }>
                            {tailor.skill_level.charAt(0).toUpperCase() + tailor.skill_level.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {tailor.batch_name ? (
                            <div>
                              <div className="font-medium">{tailor.batch_name}</div>
                              <div className="text-sm text-muted-foreground">{tailor.batch_code}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">No batch assigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col space-y-1">
                            <Badge variant={
                              tailor.status === 'active' ? 'default' :
                              tailor.status === 'inactive' ? 'secondary' :
                              tailor.status === 'on_leave' ? 'outline' : 'destructive'
                            }>
                              {tailor.status.charAt(0).toUpperCase() + tailor.status.slice(1).replace('_', ' ')}
                            </Badge>
                            {tailor.is_batch_leader && (
                              <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600 text-white">
                                Batch Leader
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>Active: {tailor.active_orders}</div>
                            <div>Completed: {tailor.completed_orders}</div>
                            <div>Total: {tailor.assigned_orders}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="flex items-center">
                              <Phone className="w-3 h-3 mr-1" />
                              {tailor.personal_phone}
                            </div>
                            {tailor.personal_email && (
                              <div className="flex items-center">
                                <Mail className="w-3 h-3 mr-1" />
                                {tailor.personal_email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleViewTailor(tailor)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleEditTailor(tailor)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleDeleteTailor(tailor)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}

        {viewMode === 'batches' && (
          <div className="space-y-4">
            {/* Batches Grid with Hierarchy */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {batches.map((batch) => {
                const batchTailors = tailors.filter(t => t.batch_id === batch.id);
                const batchLeader = batchTailors.find(t => t.is_batch_leader);
                const regularTailors = batchTailors.filter(t => !t.is_batch_leader);
                
                console.log(`Batch ${batch.batch_name} (${batch.id}):`, {
                  batchTailors: batchTailors.length,
                  batchLeader: batchLeader?.full_name,
                  regularTailors: regularTailors.length,
                  allTailors: tailors.map(t => ({ name: t.full_name, batch_id: t.batch_id }))
                });
                
                return (
                  <Card key={batch.id}>
                    <CardHeader>
                      <div className="flex items-center space-x-3">
                        {/* Batch Avatar (Batch Leader's Avatar) */}
                        <Avatar className="w-12 h-12">
                          {batchLeader ? (
                            <>
                              <AvatarImage src={batchLeader.avatar_url} alt={batchLeader.full_name} />
                              <AvatarFallback>
                                {batchLeader.full_name.split(' ').map(n => n[0]).join('')}
                              </AvatarFallback>
                            </>
                          ) : (
                            <AvatarFallback>
                              <Users className="w-6 h-6" />
                            </AvatarFallback>
                          )}
                        </Avatar>
                        
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">{batch.batch_name}</CardTitle>
                            <Badge className={getBatchStatusColor(batch.status)}>
                              {batch.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{batch.batch_code}</p>
                          {batchLeader && (
                            <p className="text-xs text-muted-foreground">
                              Leader: {batchLeader.full_name}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Capacity:</span>
                          <span className="font-medium">{batch.current_capacity}/{batch.max_capacity}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Tailors:</span>
                          <span className="font-medium">{batch.tailors_count}</span>
                        </div>
                      </div>

                      {/* Batch Hierarchy */}
                      <div className="space-y-3">
                        <h4 className="font-medium text-sm">Team Structure</h4>
                        
                        {/* Batch Leader */}
                        {batchLeader && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <div className="flex items-center space-x-2">
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={batchLeader.avatar_url} alt={batchLeader.full_name} />
                                <AvatarFallback className="text-xs">
                                  {batchLeader.full_name.split(' ').map(n => n[0]).join('')}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm">{batchLeader.full_name}</div>
                                <div className="text-xs text-muted-foreground">{batchLeader.tailor_code}</div>
                              </div>
                              <div className="flex space-x-1">
                                <Badge variant={
                                  batchLeader.tailor_type === 'single_needle' ? 'default' : 'secondary'
                                } className="text-xs">
                                  {batchLeader.tailor_type === 'single_needle' ? 'SN' : 'OL'}
                                </Badge>
                                <Badge variant="default" className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs">
                                  Leader
                                </Badge>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Regular Tailors */}
                        {regularTailors.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">Team Members ({regularTailors.length})</div>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {regularTailors.map((tailor) => (
                                <div key={tailor.id} className="flex items-center space-x-2 p-2 bg-gray-50 rounded">
                                  <Avatar className="w-6 h-6">
                                    <AvatarImage src={tailor.avatar_url} alt={tailor.full_name} />
                                    <AvatarFallback className="text-xs">
                                      {tailor.full_name.split(' ').map(n => n[0]).join('')}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-xs truncate">{tailor.full_name}</div>
                                    <div className="text-xs text-muted-foreground">{tailor.tailor_code}</div>
                                  </div>
                                  <Badge variant={
                                    tailor.tailor_type === 'single_needle' ? 'default' : 'secondary'
                                  } className="text-xs">
                                    {tailor.tailor_type === 'single_needle' ? 'SN' : 'OL'}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {batchTailors.length === 0 && (
                          <div className="text-center py-4 text-muted-foreground">
                            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">No tailors assigned</p>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => handleViewBatch(batch)}
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => handleEditBatch(batch)}
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleDeleteBatch(batch)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ErpLayout>
  );
};

export default TailorManagementPage;
