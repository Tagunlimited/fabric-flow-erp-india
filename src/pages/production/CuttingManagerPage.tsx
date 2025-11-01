import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDueDateIndian } from '@/lib/utils';
import { 
  Scissors, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  Search,
  Filter,
  Calendar,
  TrendingUp,
  Package,
  Factory,
  Target,
  Users,
  Eye,
  Edit,
  Plus,
  UserCheck,
  UserPlus,
  RefreshCw,
  FileText
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MultipleBatchAssignmentDialog } from "@/components/production/MultipleBatchAssignmentDialog";
import { UpdateCuttingQuantityDialog } from "@/components/production/UpdateCuttingQuantityDialog";
import { generateBatchAssignmentPDF } from "@/utils/batchAssignmentPDF";

interface CuttingJob {
  id: string;
  jobNumber: string;
  orderNumber: string;
  customerName: string;
  productName: string;
  fabricType: string;
  quantity: number;
  cutQuantity: number;
  cutQuantitiesBySize?: { [size: string]: number };
  assignedTo: string;
  // Multiple cutting masters support
  cuttingMasters?: Array<{
    id: string;
    name: string;
    avatarUrl?: string;
    assignedDate: string;
  }>;
  // Legacy single cutting master fields (for backward compatibility)
  cuttingMasterId?: string;
  cuttingMasterName?: string;
  cuttingMasterAvatarUrl?: string;
  startDate: string;
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed' | 'on_hold' | 'quality_check';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  cuttingPattern: string;
  fabricConsumption: number;
  efficiency: number;
  notes: string;
  defects: number;
  reworkRequired: boolean;
  // Multiple batch assignment fields
  batchAssignments?: Array<{
    id: string;
    batch_id: string;
    batch_name: string;
    batch_code?: string;
    batch_leader_name?: string;
    batch_leader_avatar_url?: string;
    tailor_type?: string;
    total_quantity?: number;
    size_distributions?: Array<{
      size_name: string;
      quantity: number;
    }>;
    assignment_date?: string;
    assigned_by?: string;
    notes?: string;
  }>;
  // Order items for detailed product information
  orderItems?: Array<{
    id: string;
    product_category_id: string;
    product_description: string;
    fabric_id: string;
    color: string;
    gsm: string;
    quantity: number;
    sizes_quantities: any;
    category_image_url?: string;
    product_category?: {
      category_name: string;
      category_image_url?: string;
    };
    fabric?: {
      fabric_name: string;
      color: string;
      gsm: string;
      image?: string;
    };
  }>;
  customer?: {
    company_name: string;
    contact_person: string;
  };
}


const CuttingManagerPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  // Initialize with empty array - data will be loaded from backend
  const [cuttingJobs, setCuttingJobs] = useState<CuttingJob[]>([]);

  const navigate = useNavigate();
  const LOCAL_STORAGE_KEY = 'production-assignments';
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateJob, setUpdateJob] = useState<CuttingJob | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Batch assignment dialog state
  const [batchAssignmentOpen, setBatchAssignmentOpen] = useState(false);
  const [selectedJobForBatch, setSelectedJobForBatch] = useState<CuttingJob | null>(null);
  
  // PDF generation state
  const [generatingPDF, setGeneratingPDF] = useState<string | null>(null);

  // Use the centralized Indian date format function
  const formatDateDDMMYY = (value?: string) => {
    return formatDueDateIndian(value);
  };

  // Batch assignment handlers
  const handleAssignBatch = (job: CuttingJob) => {
    // Order items are already loaded in the job object
    setSelectedJobForBatch(job);
    setBatchAssignmentOpen(true);
  };

  const handleBatchAssignmentSuccess = () => {
    // Reload cutting jobs to get updated batch assignments
    refreshData();
  };

  // PDF generation function for completed jobs
  const handleGeneratePDF = async (job: CuttingJob) => {
    setGeneratingPDF(job.id);
    try {
      console.log('🚀 Starting PDF generation for job:', job.jobNumber);
      
      // Fetch stitching prices from order_assignments
      const { data: priceData, error: priceError } = await supabase
        .from('order_assignments')
        .select('cutting_price_single_needle, cutting_price_overlock_flatlock')
        .eq('order_id', job.id)
        .single();

      if (priceError) {
        console.error('❌ Error fetching pricing data:', priceError);
        return;
      }

      // Fetch order details with customizations
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (
            *,
            product_categories (
              category_name,
              category_image_url
            ),
            fabrics (
              name,
              description,
              image_url
            )
          )
        `)
        .eq('id', job.id)
        .single();

      if (orderError) {
        console.error('❌ Error fetching order data:', orderError);
        return;
      }

      // Fetch company settings
      const { data: companySettings, error: settingsError } = await supabase
        .from('company_settings')
        .select('*')
        .single();

      if (settingsError) {
        console.error('❌ Error fetching company settings:', settingsError);
        return;
      }

      // Prepare batch assignment data from existing batch assignments
      const batchAssignments = (job.batchAssignments || []).map(assignment => {
        const sizeDistributions = Object.entries(assignment.size_distributions || {})
          .filter(([_, qty]) => qty > 0)
          .map(([size, qty]) => ({ size, quantity: qty }));

        // Determine price per piece based on tailor type
        const pricePerPiece = assignment.tailor_type === 'single_needle' 
          ? (priceData?.cutting_price_single_needle || 0)
          : (priceData?.cutting_price_overlock_flatlock || 0);

        return {
          batchName: assignment.batch_name || 'Unknown Batch',
          batchLeaderName: assignment.batch_leader_name || 'Unknown Leader',
          tailorType: assignment.tailor_type as 'single_needle' | 'overlock_flatlock' || 'single_needle',
          sizeDistributions,
          pricePerPiece
        };
      });

      // Prepare customizations (simplified since branding_items and order_item_addons don't exist)
      const customizations = {
        branding: null, // These relationships don't exist in current schema
        addons: null,   // These relationships don't exist in current schema
        special_instructions: orderData.special_instructions || orderData.notes
      };

      // Generate PDF
      await generateBatchAssignmentPDF({
        orderNumber: job.orderNumber,
        customerName: job.customerName,
        orderItems: orderData.order_items || [],
        batchAssignments,
        companySettings,
        stitchingPrices: {
          single_needle: priceData?.cutting_price_single_needle || 0,
          overlock_flatlock: priceData?.cutting_price_overlock_flatlock || 0
        },
        customizations,
        dueDate: orderData.expected_delivery_date
      });

      console.log('✅ PDF generation completed successfully!');
    } catch (error) {
      console.error('❌ Error generating PDF:', error);
    } finally {
      setGeneratingPDF(null);
    }
  };

  // Load assigned cutting jobs from DB (order_assignments) and enrich with order/customer/BOM
    const loadCuttingJobs = async () => {
      try {
        // First, get order IDs that have cutting assignments from both tables
        const { data: rows } = await supabase
          .from('order_assignments' as any)
          .select(`
            order_id, 
            cutting_master_id,
            cutting_master_name, 
            cutting_work_date, 
            cut_quantity,
            cut_quantities_by_size
          `)
          .not('cutting_master_id', 'is', null);
        const map: Record<string, any> = {};
        (rows || []).forEach((r: any) => { if (r?.order_id) map[r.order_id] = r; });
        const orderIds: string[] = Object.keys(map);
        
        // Also fetch order IDs from order_cutting_assignments for multiple cutting masters
        const { data: cuttingAssignmentsRows } = await supabase
          .from('order_cutting_assignments' as any)
          .select('order_id')
          .in('order_id', orderIds.length > 0 ? orderIds : ['00000000-0000-0000-0000-000000000000'] as any);
        const cuttingAssignmentOrderIds = Array.from(new Set((cuttingAssignmentsRows || []).map((r: any) => r.order_id).filter(Boolean)));
        const allOrderIds = Array.from(new Set([...orderIds, ...cuttingAssignmentOrderIds]));
        
        if (allOrderIds.length === 0) {
          setCuttingJobs([]);
          return;
        }
        
        // Fetch multiple cutting masters from order_cutting_assignments
        let cuttingMastersByOrder: Record<string, any[]> = {};
        try {
          const { data: cuttingMastersData } = await supabase
            .from('order_cutting_assignments' as any)
            .select('order_id, cutting_master_id, cutting_master_name, cutting_master_avatar_url, assigned_date')
            .in('order_id', allOrderIds as any);
          (cuttingMastersData || []).forEach((r: any) => { 
            if (r?.order_id) {
              if (!cuttingMastersByOrder[r.order_id]) cuttingMastersByOrder[r.order_id] = [];
              cuttingMastersByOrder[r.order_id].push(r);
            }
          });
        } catch (e) {
          console.error('Failed to load cutting masters:', e);
        }

        // Fetch orders first (simplified query) - exclude readymade orders (they don't need cutting)
        const { data: orders, error: ordersError } = await supabase
          .from('orders' as any)
          .select('id, order_number, expected_delivery_date, customer_id')
          .in('id', allOrderIds as any)
          .or('order_type.is.null,order_type.eq.custom'); // Exclude readymade orders

        if (ordersError) {
          console.error('Error fetching orders:', ordersError);
          setCuttingJobs([]);
          return;
        }

        // Fetch order items separately
        // First try to fetch order items without relationships
        const { data: orderItems, error: orderItemsError } = await supabase
          .from('order_items' as any)
          .select('*')
          .in('order_id', allOrderIds as any);

        if (orderItemsError) {
          console.error('Error fetching order items:', orderItemsError);
        } else {
          console.log('Order items fetched successfully:', orderItems);
        }

        // Fetch product categories separately
        const productCategoryIds = Array.from(new Set((orderItems || []).map((item: any) => item.product_category_id).filter(Boolean)));
        let productCategoriesMap: Record<string, any> = {};
        if (productCategoryIds.length > 0) {
          const { data: productCategories, error: productCategoriesError } = await supabase
            .from('product_categories' as any)
            .select('id, category_name, category_image_url')
            .in('id', productCategoryIds as any);
          
          if (productCategoriesError) {
            console.error('Error fetching product categories:', productCategoriesError);
          } else {
            console.log('Product categories fetched:', productCategories);
            (productCategories || []).forEach((cat: any) => {
              productCategoriesMap[cat.id] = cat;
            });
          }
        }

        // Fetch fabric data separately
        const fabricIds = Array.from(new Set((orderItems || []).map((item: any) => item.fabric_id).filter(Boolean)));
        let fabricMap: Record<string, any> = {};
        if (fabricIds.length > 0) {
          const { data: fabrics, error: fabricsError } = await supabase
            .from('fabric_master' as any)
            .select('id, fabric_name, color, gsm, image')
            .in('id', fabricIds as any);
          
          if (fabricsError) {
            console.error('Error fetching fabrics:', fabricsError);
          } else {
            console.log('Fabrics fetched:', fabrics);
            (fabrics || []).forEach((fabric: any) => {
              fabricMap[fabric.id] = fabric;
            });
          }
        }

        // Group order items by order_id and enrich with related data
        const orderItemsByOrderId: Record<string, any[]> = {};
        (orderItems || []).forEach((item: any) => {
          if (!orderItemsByOrderId[item.order_id]) {
            orderItemsByOrderId[item.order_id] = [];
          }
          
          // Enrich item with related data
          const enrichedItem = {
            ...item,
            product_category: productCategoriesMap[item.product_category_id] || null,
            fabric: fabricMap[item.fabric_id] || null
          };
          
          orderItemsByOrderId[item.order_id].push(enrichedItem);
        });

        // Fetch customers
        const customerIds = Array.from(new Set((orders || []).map((o: any) => o.customer_id).filter(Boolean)));
        let customersMap: Record<string, { company_name?: string }> = {};
        if (customerIds.length > 0) {
          const { data: customers } = await supabase
            .from('customers' as any)
            .select('id, company_name')
            .in('id', customerIds as any);
          (customers || []).forEach((c: any) => { if (c?.id) customersMap[c.id] = { company_name: c.company_name }; });
        }

        // Fetch BOM headers for product name and qty
        const { data: boms } = await supabase
          .from('bom_records' as any)
          .select('order_id, product_name, total_order_qty')
          .in('order_id', allOrderIds as any);
        const bomByOrder: Record<string, { product_name?: string; qty: number }> = {};
        (boms || []).forEach((b: any) => {
          const key = b.order_id as string;
          const prev = bomByOrder[key]?.qty || 0;
          bomByOrder[key] = { product_name: bomByOrder[key]?.product_name || b.product_name, qty: prev + (b.total_order_qty || 0) };
        });

        const computePriority = (dueDateStr?: string | null): CuttingJob['priority'] => {
          if (!dueDateStr) return 'medium';
          const today = new Date();
          const due = new Date(dueDateStr);
          const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays <= 2) return 'urgent';
          if (diffDays <= 7) return 'high';
          return 'medium';
        };

        const jobs: CuttingJob[] = (orders || []).map((o: any) => {
          const p: any = map[o.id] || {};
          const bom: any = bomByOrder[o.id] || { product_name: undefined, qty: 0 };
          const orderItems = orderItemsByOrderId[o.id] || [];
          const firstOrderItem = orderItems[0];
          const productCategoryName = firstOrderItem?.product_category?.category_name || 
                                     firstOrderItem?.product_description || 
                                     (bom as any).product_name || 
                                     'Product';
          
          // Get cutting masters for this order
          const cuttingMasters = cuttingMastersByOrder[o.id] || [];
          
          // Build the job object with cutting master information
          const job: CuttingJob = {
            id: o.id,
            jobNumber: o.order_number,
            orderNumber: o.order_number,
            customerName: customersMap[o.customer_id]?.company_name || '',
            productName: productCategoryName,
            fabricType: firstOrderItem?.fabric ? 
              `${firstOrderItem.fabric.fabric_name} - ${firstOrderItem.fabric.gsm} GSM` : 
              '-',
            quantity: Number((bom as any).qty || 0),
            cutQuantity: Number(p.cut_quantity || 0),
            cutQuantitiesBySize: p.cut_quantities_by_size || {},
            startDate: p.cutting_work_date || '',
            dueDate: o.expected_delivery_date || '',
            status: 'pending',
            priority: computePriority(o.expected_delivery_date),
            cuttingPattern: '',
            fabricConsumption: 0,
            efficiency: 0,
            notes: '',
            defects: 0,
            reworkRequired: false,
            // Batch assignment fields (legacy - will be replaced with batchAssignments)
            assignedBatchId: p.assigned_batch_id,
            assignedBatchName: p.assigned_batch_name,
            assignedBatchCode: p.assigned_batch_code,
            batchAssignmentDate: p.batch_assignment_date,
            assignedBy: p.assigned_by_name,
            batchAssignmentNotes: p.batch_assignment_notes,
            // Add order items with product and fabric details
            orderItems: orderItemsByOrderId[o.id] || [],
            customer: customersMap[o.customer_id] ? { 
              company_name: customersMap[o.customer_id].company_name,
              contact_person: (customersMap[o.customer_id] as any).contact_person || ''
            } : undefined,
          };
          return job;
        }).filter((job): job is CuttingJob => job !== undefined);

        // Fetch batch assignments for each order
        const jobsWithBatchAssignments = await Promise.all(jobs.map(async (job) => {
          if (!job || !job.id) {
            console.error('Invalid job found, skipping:', job);
            return null;
          }
          try {
            const { data: batchAssignments } = await supabase
              .from('order_batch_assignments_with_details')
              .select('*')
              .eq('order_id', job.id as any);

            return {
              ...job,
              batchAssignments: (batchAssignments as any) || []
            };
          } catch (error) {
            console.error(`Error fetching batch assignments for order ${job.id}:`, error);
            return {
              ...job,
              batchAssignments: []
            };
          }
        })).then(results => results.filter((job): job is CuttingJob => job !== null));

        setCuttingJobs(jobsWithBatchAssignments as CuttingJob[]);
      } catch (err) {
        console.error('Error loading cutting jobs:', err);
        setCuttingJobs([]);
      }
    };


  useEffect(() => {
    loadCuttingJobs();
  }, []);

  // Add refresh function
  const refreshData = async () => {
    setRefreshing(true);
    try {
      await loadCuttingJobs();
    } finally {
      setRefreshing(false);
    }
  };


  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'on_hold': return 'bg-orange-100 text-orange-800';
      case 'quality_check': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-gray-100 text-gray-800';
      case 'medium': return 'bg-blue-100 text-blue-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'urgent': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };


  // Function to check if a job is completed (all quantities cut and batches assigned)
  // Note: Fabric usage validation will be handled in the cutting dialog
  const isJobCompleted = (job: CuttingJob) => {
    const isFullyCut = job.cutQuantity >= job.quantity;
    const hasBatchAssignments = job.batchAssignments && job.batchAssignments.length > 0;
    return isFullyCut && hasBatchAssignments;
  };

  // Separate jobs into active and completed
  const activeJobs = cuttingJobs.filter(job => !isJobCompleted(job));
  const completedJobs = cuttingJobs.filter(job => isJobCompleted(job));

  const filteredActiveJobs = activeJobs.filter(job => {
    const matchesSearch = job.jobNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         job.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         job.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         job.productName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || job.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || job.priority === priorityFilter;
    
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const filteredCompletedJobs = completedJobs.filter(job => {
    const matchesSearch = job.jobNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         job.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         job.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         job.productName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || job.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || job.priority === priorityFilter;
    
    return matchesSearch && matchesStatus && matchesPriority;
  });

  // Calculate stats after activeJobs and completedJobs are defined
  const stats = {
    totalJobs: cuttingJobs.length,
    activeJobs: activeJobs.length,
    completedJobs: completedJobs.length,
    inProgress: cuttingJobs.filter(j => j.status === 'in_progress').length,
    pending: cuttingJobs.filter(j => j.status === 'pending').length,
    totalDefects: cuttingJobs.reduce((acc, job) => acc + job.defects, 0),
    reworkJobs: cuttingJobs.filter(j => j.reworkRequired).length
  };

  const getCompletionPercentage = (job: CuttingJob) => {
    return Math.round((job.cutQuantity / job.quantity) * 100);
  };

  const getProgressBarColor = (percentage: number) => {
    if (percentage < 30) return 'bg-red-500';
    if (percentage < 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getDaysRemaining = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Cutting Manager
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage cutting operations and track cutting efficiency
          </p>
          </div>
          <Button 
            variant="outline" 
            onClick={refreshData}
            disabled={refreshing}
            className="flex items-center space-x-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Jobs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-blue-600">
                  {stats.activeJobs}
                </span>
                <Scissors className="w-5 h-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Completed Jobs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-green-600">
                  {stats.completedJobs}
                </span>
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Jobs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-purple-600">
                  {stats.totalJobs}
                </span>
                <Factory className="w-5 h-5 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Defects
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-red-600">
                  {stats.totalDefects}
                </span>
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="jobs" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="jobs">Active Jobs</TabsTrigger>
            <TabsTrigger value="completed">Completed Jobs</TabsTrigger>
          </TabsList>

          <TabsContent value="jobs" className="space-y-4">

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
                        placeholder="Search jobs..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="on_hold">On Hold</SelectItem>
                        <SelectItem value="quality_check">Quality Check</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="priority">Priority</Label>
                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Priorities" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Priorities</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
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

            {/* Jobs Table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Cutting Jobs</CardTitle>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    New Job
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job #</TableHead>
                        <TableHead>Order #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Cutting Master</TableHead>
                        <TableHead>Assigned Batch</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredActiveJobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="font-medium">{job.jobNumber}</TableCell>
                          <TableCell>{job.orderNumber}</TableCell>
                          <TableCell>{job.customerName}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{job.productName}</p>
                              <p className="text-sm text-muted-foreground">{job.fabricType}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="w-32">
                              <div className="flex justify-between text-sm mb-1">
                                <span>{getCompletionPercentage(job)}%</span>
                                <span>{typeof job.cutQuantity === 'number' ? job.cutQuantity.toFixed(0) : job.cutQuantity}/{typeof job.quantity === 'number' ? job.quantity.toFixed(0) : job.quantity}</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor(getCompletionPercentage(job))}`}
                                  style={{ width: `${getCompletionPercentage(job)}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {job.cuttingMasters && job.cuttingMasters.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {job.cuttingMasters.map((master, idx) => (
                                  <div key={idx} className="flex items-center space-x-2">
                                    <Avatar className="w-8 h-8">
                                      <AvatarImage src={master.avatarUrl} alt={master.name} />
                                      <AvatarFallback className="bg-blue-200 text-blue-700 text-xs">
                                        {master.name?.charAt(0)?.toUpperCase() || 'CM'}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm">{master.name}</span>
                                  </div>
                                ))}
                              </div>
                            ) : job.assignedTo ? (
                              <div className="flex items-center space-x-2">
                                <Avatar className="w-8 h-8">
                                  <AvatarImage src={job.cuttingMasterAvatarUrl} alt={job.assignedTo} />
                                  <AvatarFallback className="bg-blue-200 text-blue-700 text-xs">
                                    {job.assignedTo?.charAt(0)?.toUpperCase() || 'CM'}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm">{job.assignedTo}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Unassigned</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {job.batchAssignments && job.batchAssignments.length > 0 ? (
                              <div className="space-y-2">
                                {job.batchAssignments.map((assignment, index) => (
                                  <div key={assignment.id} className="p-2 border rounded-lg bg-green-50">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center space-x-3">
                                        <Avatar className="w-8 h-8">
                                          <AvatarImage src={assignment.batch_leader_avatar_url} alt={assignment.batch_leader_name} />
                                          <AvatarFallback className="bg-gray-200 text-gray-700 text-xs">
                                            {assignment.batch_leader_name?.charAt(0) || assignment.batch_name.charAt(0)}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div>
                                          <div className="font-medium text-green-700 text-sm">
                                            {assignment.batch_name}
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            {assignment.batch_leader_name} • {assignment.total_quantity} pieces
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    {assignment.size_distributions && assignment.size_distributions.length > 0 && (
                                      <div className="mt-1 text-xs text-muted-foreground">
                                        Sizes: {assignment.size_distributions.map(sd => `${sd.size_name}: ${sd.quantity}`).join(', ')}
                                      </div>
                                    )}
                                  </div>
                                ))}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleAssignBatch(job)}
                                  className="text-blue-600 border-blue-200 hover:bg-blue-50 w-full"
                                >
                                  <UserPlus className="w-4 h-4 mr-2" />
                                  Add More Batches
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAssignBatch(job)}
                                className="text-blue-600 border-blue-200 hover:bg-blue-50"
                              >
                                <UserPlus className="w-4 h-4 mr-2" />
                                Assign Batches
                              </Button>
                            )}
                          </TableCell>
                          
                          <TableCell>
                            <Badge className={getStatusColor(job.status)}>
                              {job.status.replace('_', ' ')}
                            </Badge>
                            {job.reworkRequired && (
                              <Badge className="bg-red-100 text-red-800 ml-1">
                                Rework
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                          {formatDateDDMMYY(job.dueDate)}
                        </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => navigate(`/orders/${job.id}?from=production`)}>
                                <Eye className="w-4 h-4 mr-2" />
                                View
                              </Button>
                          <Button variant="outline" size="sm" onClick={() => { setUpdateJob(job); setUpdateOpen(true); }}>
                                <Edit className="w-4 h-4 mr-2" />
                            Add Cut Qty
                          </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle>Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label htmlFor="search-completed">Search</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="search-completed"
                        placeholder="Search completed jobs..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
      </div>
                  </div>
            <div>
                    <Label htmlFor="status-completed">Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="on_hold">On Hold</SelectItem>
                        <SelectItem value="quality_check">Quality Check</SelectItem>
                      </SelectContent>
                    </Select>
            </div>
                  <div>
                    <Label htmlFor="priority-completed">Priority</Label>
                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Priorities" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Priorities</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
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

            {/* Completed Jobs Table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Completed Cutting Jobs</CardTitle>
                  <Badge className="bg-green-100 text-green-800">
                    {filteredCompletedJobs.length} Completed
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Job #</TableHead>
                        <TableHead>Order #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Cutting Master</TableHead>
                        <TableHead>Assigned Batches</TableHead>
                        <TableHead>Completion Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCompletedJobs.map((job) => (
                        <TableRow key={job.id} className="bg-green-50/30">
                          <TableCell className="font-medium">{job.jobNumber}</TableCell>
                          <TableCell>{job.orderNumber}</TableCell>
                          <TableCell>{job.customerName}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{job.productName}</p>
                              <p className="text-sm text-muted-foreground">{job.fabricType}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="w-32">
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-green-600 font-semibold">100%</span>
                                <span>{typeof job.cutQuantity === 'number' ? job.cutQuantity.toFixed(0) : job.cutQuantity}/{typeof job.quantity === 'number' ? job.quantity.toFixed(0) : job.quantity}</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                  className="h-2 rounded-full transition-all duration-300 bg-green-500"
                                  style={{ width: '100%' }}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {job.cuttingMasters && job.cuttingMasters.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {job.cuttingMasters.map((master, idx) => (
                                  <div key={idx} className="flex items-center space-x-2">
                                    <Avatar className="w-6 h-6">
                                      <AvatarImage src={master.avatarUrl} alt={master.name} />
                                      <AvatarFallback className="bg-green-200 text-green-700 text-xs">
                                        {master.name?.charAt(0)?.toUpperCase() || 'CM'}
                                      </AvatarFallback>
                                    </Avatar>
                                    <span className="text-xs">{master.name}</span>
                                  </div>
                                ))}
                              </div>
                            ) : job.assignedTo ? (
                              <div className="flex items-center space-x-2">
                                <Avatar className="w-6 h-6">
                                  <AvatarImage src={job.cuttingMasterAvatarUrl} alt={job.assignedTo} />
                                  <AvatarFallback className="bg-green-200 text-green-700 text-xs">
                                    {job.assignedTo?.charAt(0)?.toUpperCase() || 'CM'}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-xs">{job.assignedTo}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">Unassigned</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {job.batchAssignments?.map((assignment, index) => (
                                <div key={assignment.id} className="p-2 border rounded-lg bg-green-100">
                                  <div className="flex items-center space-x-2">
                                    <Avatar className="w-6 h-6">
                                      <AvatarImage 
                                        src={assignment.batch_leader_avatar_url || undefined} 
                                        alt={assignment.batch_leader_name || assignment.batch_name || 'Batch'} 
                                      />
                                      <AvatarFallback className="bg-green-200 text-green-700 text-xs">
                                        {(assignment.batch_leader_name || assignment.batch_name || 'B').charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <div className="font-medium text-green-700 text-xs">
                                        {assignment.batch_name || 'Unknown Batch'}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {assignment.total_quantity || 0} pieces
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                              <span className="text-sm text-green-600 font-medium">Completed</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => navigate(`/orders/${job.id}?from=production`)}>
                                <Eye className="w-4 h-4 mr-2" />
                                View
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleGeneratePDF(job)}
                                disabled={generatingPDF === job.id}
                              >
                                {generatingPDF === job.id ? (
                                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <FileText className="w-4 h-4 mr-2" />
                                )}
                                {generatingPDF === job.id ? 'Generating...' : 'PDF'}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredCompletedJobs.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                            <CheckCircle className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                            <p>No completed cutting jobs found.</p>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

        {/* Update Cutting Quantity Dialog - Size Wise */}
        <UpdateCuttingQuantityDialog
        isOpen={updateOpen}
        onClose={() => {
              setUpdateOpen(false);
          setUpdateJob(null);
        }}
        onSuccess={() => {
          // Reload cutting jobs to show updated quantities
          refreshData();
        }}
        jobId={updateJob?.id || ''}
        orderNumber={updateJob?.orderNumber || ''}
        customerName={updateJob?.customerName || ''}
        productName={updateJob?.productName || ''}
        orderItems={updateJob?.orderItems || []}
        currentCutQuantities={updateJob?.cutQuantitiesBySize || {}}
      />

      {/* Multiple Batch Assignment Dialog */}
      <MultipleBatchAssignmentDialog
        isOpen={batchAssignmentOpen}
        onClose={() => {
          setBatchAssignmentOpen(false);
          setSelectedJobForBatch(null);
        }}
        orderId={selectedJobForBatch?.id || ''}
        orderNumber={selectedJobForBatch?.orderNumber || ''}
        customerName={selectedJobForBatch?.customerName || ''}
        onSuccess={handleBatchAssignmentSuccess}
        existingAssignments={selectedJobForBatch?.batchAssignments?.map(ba => ({
          batch_id: ba.batch_id,
          batch_name: ba.batch_name,
          batch_code: ba.batch_code,
          size_distributions: ba.size_distributions.reduce((acc, sd) => {
            acc[sd.size_name] = sd.quantity;
            return acc;
          }, {} as { [size: string]: number }),
          notes: ba.notes
        })) || []}
        orderItems={selectedJobForBatch?.orderItems || []}
        />
      </div>
    </ErpLayout>
  );
};

export default CuttingManagerPage;
