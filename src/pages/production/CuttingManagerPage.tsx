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
  Users,
  Target,
  BarChart3,
  Eye,
  Edit,
  Plus,
  FileText,
  Settings,
  Zap
} from "lucide-react";
import { useState, useEffect } from "react";
import { getCuttingManagers } from "@/lib/database";

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

interface CuttingMachine {
  id: string;
  name: string;
  type: string;
  status: 'available' | 'busy' | 'maintenance' | 'offline';
  currentJob: string | null;
  efficiency: number;
  lastMaintenance: string;
  operator: string;
}

const CuttingManagerPage = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  // Initialize with empty array - data will be loaded from backend
  const [cuttingJobs, setCuttingJobs] = useState<CuttingJob[]>([]);

  // Initialize with empty array - data will be loaded from backend
  const [cuttingMachines, setCuttingMachines] = useState<CuttingMachine[]>([]);

  // State for cutting managers
  const [cuttingManagers, setCuttingManagers] = useState<any[]>([]);

  // Fetch cutting managers data
  useEffect(() => {
    const fetchCuttingManagers = async () => {
      try {
        const managers = await getCuttingManagers();
        setCuttingManagers(managers);
      } catch (error) {
        console.error('Error fetching cutting managers:', error);
      }
    };

    fetchCuttingManagers();
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

  const getMachineStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-800';
      case 'busy': return 'bg-blue-100 text-blue-800';
      case 'maintenance': return 'bg-orange-100 text-orange-800';
      case 'offline': return 'bg-red-100 text-red-800';
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
    avgEfficiency: Math.round(cuttingJobs.reduce((acc, job) => acc + job.efficiency, 0) / cuttingJobs.length),
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
                Avg. Efficiency
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-green-600">
                  {stats.avgEfficiency}%
                </span>
                <TrendingUp className="w-5 h-5 text-green-600" />
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="jobs">Cutting Jobs</TabsTrigger>
            <TabsTrigger value="machines">Machines</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="jobs" className="space-y-4">
            {/* Cutting Managers Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Cutting Managers
                </CardTitle>
              </CardHeader>
              <CardContent>
                {cuttingManagers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No cutting managers found</p>
                    <p className="text-sm">Add cutting managers to the production team to see them here</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-4 justify-start">
                    {cuttingManagers.map((manager) => (
                      <div 
                        key={manager.id} 
                        className="relative group cursor-pointer"
                        title={`${manager.full_name}${manager.is_batch_leader ? ' (Leader)' : ''}`}
                        style={{ transitionDelay: '0ms' }}
                      >
                        {manager.avatar_url ? (
                          <img
                            src={manager.avatar_url}
                            alt={manager.full_name}
                            className="w-20 h-20 rounded-lg object-cover shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 hover:-translate-y-1"
                          />
                        ) : (
                          <div className="w-20 h-20 rounded-lg bg-primary/10 flex items-center justify-center shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 hover:-translate-y-1">
                            <Users className="w-10 h-10 text-primary/60" />
                          </div>
                        )}
                        {manager.is_batch_leader && (
                          <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                            <span className="text-xs text-white font-bold">L</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

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
                        <TableHead>Assigned To</TableHead>
                        <TableHead>Efficiency</TableHead>
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
                            <div className="flex items-center">
                              <span className={`text-sm font-medium ${
                                job.efficiency >= 90 ? 'text-green-600' :
                                job.efficiency >= 75 ? 'text-orange-600' : 'text-red-600'
                              }`}>
                                {job.efficiency}%
                              </span>
                            </div>
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
                              {job.dueDate}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm">
                                <Eye className="w-4 h-4 mr-2" />
                                View
                              </Button>
                              <Button variant="outline" size="sm">
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

          <TabsContent value="machines" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {cuttingMachines.map((machine) => (
                <Card key={machine.id} className="shadow-erp-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{machine.name}</CardTitle>
                      <Badge className={getMachineStatusColor(machine.status)}>
                        {machine.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{machine.type}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Efficiency</span>
                        <span>{machine.efficiency}%</span>
                      </div>
                      <Progress value={machine.efficiency} className="h-2" />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Operator:</span>
                        <span className="font-medium">{machine.operator}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Current Job:</span>
                        <span className="font-medium">
                          {machine.currentJob || 'None'}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Last Maintenance:</span>
                        <span className="font-medium">{machine.lastMaintenance}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1">
                        <Settings className="w-4 h-4 mr-2" />
                        Settings
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1">
                        <FileText className="w-4 h-4 mr-2" />
                        Logs
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Efficiency Trends</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {cuttingMachines.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No machine data available
                      </div>
                    ) : (
                      cuttingMachines.map((machine) => (
                        <div key={machine.id} className="flex items-center justify-between">
                          <span className="text-sm">{machine.name}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-32 bg-gray-200 rounded-full h-2">
                              <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${machine.efficiency}%` }}></div>
                            </div>
                            <span className="text-sm font-medium">{machine.efficiency}%</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Defect Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {cuttingJobs.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No defect data available
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Total Defects</span>
                          <div className="flex items-center gap-2">
                            <div className="w-32 bg-gray-200 rounded-full h-2">
                              <div className="bg-red-600 h-2 rounded-full" style={{ 
                                width: `${Math.min(100, (stats.totalDefects / Math.max(cuttingJobs.length * 10, 1)) * 100)}%` 
                              }}></div>
                            </div>
                            <span className="text-sm font-medium">{stats.totalDefects}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Rework Required</span>
                          <div className="flex items-center gap-2">
                            <div className="w-32 bg-gray-200 rounded-full h-2">
                              <div className="bg-orange-600 h-2 rounded-full" style={{ 
                                width: `${Math.round((stats.reworkJobs / Math.max(cuttingJobs.length, 1)) * 100)}%` 
                              }}></div>
                            </div>
                            <span className="text-sm font-medium">{stats.reworkJobs}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm">Completed Jobs</span>
                          <div className="flex items-center gap-2">
                            <div className="w-32 bg-gray-200 rounded-full h-2">
                              <div className="bg-green-600 h-2 rounded-full" style={{ 
                                width: `${Math.round((stats.completed / Math.max(cuttingJobs.length, 1)) * 100)}%` 
                              }}></div>
                            </div>
                            <span className="text-sm font-medium">{stats.completed}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600 mb-2">
                      {stats.avgEfficiency}%
                    </div>
                    <div className="text-sm text-muted-foreground">Average Efficiency</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600 mb-2">
                      {stats.completed}
                    </div>
                    <div className="text-sm text-muted-foreground">Jobs Completed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-red-600 mb-2">
                      {stats.reworkJobs}
                    </div>
                    <div className="text-sm text-muted-foreground">Rework Required</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ErpLayout>
  );
};

export default CuttingManagerPage;
