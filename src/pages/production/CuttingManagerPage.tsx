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
  Plus
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CuttingJob {
  id: string;
  jobNumber: string;
  orderNumber: string;
  customerName: string;
  productName: string;
  fabricType: string;
  quantity: number;
  cutQuantity: number;
  assignedTo: string;
  patternMasterName?: string;
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
  const [updateCutQty, setUpdateCutQty] = useState<number>(0);

  const formatDateDDMMYY = (value?: string) => {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}-${mm}-${yy}`;
  };

  // Load assigned cutting jobs from Assign Orders (local storage) and enrich with order/customer/BOM
  useEffect(() => {
    const loadCuttingJobs = async () => {
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        const map = raw ? JSON.parse(raw) : {};
        const orderIds: string[] = Object.keys(map).filter(id => !!map[id]?.cuttingMasterId);
        if (orderIds.length === 0) {
          setCuttingJobs([]);
          return;
        }

        // Fetch orders
        const { data: orders } = await supabase
          .from('orders' as any)
          .select('id, order_number, expected_delivery_date, customer_id')
          .in('id', orderIds as any);

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
          .in('order_id', orderIds as any);
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
          return {
            id: o.id,
            jobNumber: o.order_number,
            orderNumber: o.order_number,
            customerName: customersMap[o.customer_id]?.company_name || '',
            productName: (bom as any).product_name || 'Product',
            fabricType: '-',
            quantity: Number((bom as any).qty || 0),
            cutQuantity: Number(p.cutQuantity || 0),
            assignedTo: p.cuttingMasterName || '',
            patternMasterName: p.patternMasterName || '',
            startDate: p.cuttingWorkDate || '',
            dueDate: o.expected_delivery_date || '',
            status: 'pending',
            priority: computePriority(o.expected_delivery_date),
            cuttingPattern: '',
            fabricConsumption: 0,
            efficiency: 0,
            notes: '',
            defects: 0,
            reworkRequired: false,
          };
        });

        setCuttingJobs(jobs);
      } catch (err) {
        console.error('Error loading cutting jobs:', err);
        setCuttingJobs([]);
      }
    };

    loadCuttingJobs();

    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCAL_STORAGE_KEY) loadCuttingJobs();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);


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


  const filteredJobs = cuttingJobs.filter(job => {
    const matchesSearch = job.jobNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         job.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         job.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         job.productName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || job.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || job.priority === priorityFilter;
    
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const getCompletionPercentage = (job: CuttingJob) => {
    return Math.round((job.cutQuantity / job.quantity) * 100);
  };

  const getDaysRemaining = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const stats = {
    totalJobs: cuttingJobs.length,
    inProgress: cuttingJobs.filter(j => j.status === 'in_progress').length,
    completed: cuttingJobs.filter(j => j.status === 'completed').length,
    pending: cuttingJobs.filter(j => j.status === 'pending').length,
    totalDefects: cuttingJobs.reduce((acc, job) => acc + job.defects, 0),
    reworkJobs: cuttingJobs.filter(j => j.reworkRequired).length
  };

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Cutting Manager
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage cutting operations and track cutting efficiency
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Jobs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-blue-600">
                  {stats.totalJobs}
                </span>
                <Scissors className="w-5 h-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                In Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-orange-600">
                  {stats.inProgress}
                </span>
                <Factory className="w-5 h-5 text-orange-600" />
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
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="jobs">Cutting Jobs</TabsTrigger>
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
                        <TableHead>Pattern Master</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredJobs.map((job) => (
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
                                <span>{job.cutQuantity}/{job.quantity}</span>
                              </div>
                              <Progress value={getCompletionPercentage(job)} className="h-2" />
                            </div>
                          </TableCell>
                          <TableCell>
                            {job.assignedTo ? (
                              <div className="flex items-center">
                                <Users className="w-4 h-4 mr-2 text-muted-foreground" />
                                {job.assignedTo}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Unassigned</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {job.patternMasterName ? (
                              <div className="flex items-center">
                                <Users className="w-4 h-4 mr-2 text-muted-foreground" />
                                {job.patternMasterName}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Unassigned</span>
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
                        <Button variant="outline" size="sm" onClick={() => { setUpdateJob(job); setUpdateCutQty(job.cutQuantity); setUpdateOpen(true); }}>
                                <Edit className="w-4 h-4 mr-2" />
                                Update
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

        </Tabs>
      </div>
      {/* Update Progress Dialog */}
      <Dialog open={updateOpen} onOpenChange={setUpdateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Cutting Progress</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Cut Quantity</Label>
              <Input type="number" min={0} value={updateCutQty} onChange={(e) => setUpdateCutQty(Number(e.target.value || 0))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!updateJob) { setUpdateOpen(false); return; }
              const newQty = Math.min(updateCutQty, updateJob.quantity);
              // Update local table state
              setCuttingJobs(prev => prev.map(j => j.id === updateJob.id ? { ...j, cutQuantity: newQty } : j));
              // Persist to local storage used by Assign Orders/Cutting Manager
              try {
                const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
                const map = raw ? JSON.parse(raw) : {};
                map[updateJob.id] = { ...(map[updateJob.id] || {}), cutQuantity: newQty };
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(map));
              } catch {}
              setUpdateOpen(false);
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ErpLayout>
  );
};

export default CuttingManagerPage;
