import { format } from 'date-fns';
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Eye, Package, Truck, Clock, CheckCircle, Search, Filter, FileImage } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCompanySettings } from '@/hooks/CompanySettingsContext';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface Order {
  id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  customer: {
    company_name: string;
  };
  status: string;
  total_amount: number;
  final_amount: number;
  balance_amount: number;
  mockup_url?: string;
}

const DesignPage = () => {
  const navigate = useNavigate();
  const { config: company } = useCompanySettings();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>("date_desc");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showMockupDialog, setShowMockupDialog] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      
      // First get orders that have receipts
      const { data: receipts } = await supabase
        .from('receipts')
        .select('reference_id, reference_number')
        .eq('reference_type', 'order')
        .not('status', 'eq', 'cancelled');
      
      if (!receipts || receipts.length === 0) {
        setOrders([]);
        return;
      }

      const orderIds = receipts.map(r => r.reference_id).filter(Boolean);
      const orderNumbers = receipts.map(r => r.reference_number).filter(Boolean);

      // Fetch orders with customer details and mockup_url
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(company_name)
        `)
        .or(`id.in.(${orderIds.join(',')}),order_number.in.(${orderNumbers.map(n => `"${n}"`).join(',')})`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'in_production': return 'bg-purple-100 text-purple-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleMockupUpload = async (file: File) => {
    if (!selectedOrder) return;
    
    try {
      // Upload file to Supabase storage
      const fileName = `mockups/${selectedOrder.id}/${Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage
        .from('order-mockups')
        .upload(fileName, file);

      if (error) throw error;

      // Update order with mockup URL
      const { error: updateError } = await supabase
        .from('orders')
        .update({ 
          mockup_url: data.path,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedOrder.id);

      if (updateError) throw updateError;

      toast.success('Mockup uploaded successfully');
      setShowMockupDialog(false);
      // Refresh orders list
      fetchOrders();
    } catch (e) {
      console.error('Error uploading mockup:', e);
      toast.error('Failed to upload mockup');
    }
  };

  const handleExportPDF = async () => {
    if (!printRef.current) return;
    try {
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const targetWidth = pdfWidth - margin * 2;
      const targetHeight = pdfHeight - margin * 2;
      const imgAspect = canvas.width / canvas.height;
      let outWidth = targetWidth;
      let outHeight = outWidth / imgAspect;
      if (outHeight > targetHeight) {
        outHeight = targetHeight;
        outWidth = outHeight * imgAspect;
      }
      const x = (pdfWidth - outWidth) / 2;
      const y = (pdfHeight - outHeight) / 2;
      pdf.addImage(imgData, 'PNG', x, y, outWidth, outHeight);
      pdf.save(`Order-${selectedOrder?.order_number}.pdf`);
      toast.success('Order PDF exported');
    } catch (e) {
      toast.error('Failed to export PDF');
    }
  };

  // Derived filtered, searched, and sorted orders
  const filteredOrders = orders
    .filter(order => !filterStatus || order.status === filterStatus)
    .filter(order => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        order.order_number?.toLowerCase().includes(term) ||
        order.customer?.company_name?.toLowerCase().includes(term) ||
        order.status?.toLowerCase().includes(term) ||
        (order.order_date && format(new Date(order.order_date), 'dd-MMM-yy').toLowerCase().includes(term)) ||
        (order.final_amount !== undefined && order.final_amount.toString().toLowerCase().includes(term)) ||
        (order.balance_amount !== undefined && order.balance_amount.toString().toLowerCase().includes(term))
      );
    })
    .sort((a, b) => {
      if (sortBy === "date_asc") {
        return new Date(a.order_date).getTime() - new Date(b.order_date).getTime();
      } else if (sortBy === "date_desc") {
        return new Date(b.order_date).getTime() - new Date(a.order_date).getTime();
      } else if (sortBy === "amount_asc") {
        return (a.final_amount || 0) - (b.final_amount || 0);
      } else if (sortBy === "amount_desc") {
        return (b.final_amount || 0) - (a.final_amount || 0);
      }
      return 0;
    });

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Design & Printing
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage orders with receipts for design mockups and printing
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="shadow-erp-md bg-blue-100 text-blue-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">
                Total Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{orders.length}</span>
                <ShoppingCart className="w-5 h-5 text-blue-700" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md bg-yellow-100 text-yellow-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">
                Pending
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  {orders.filter(o => o.status === 'pending').length}
                </span>
                <Clock className="w-5 h-5 text-yellow-700" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md bg-purple-100 text-purple-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">
                In Production
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  {orders.filter(o => o.status === 'in_production').length}
                </span>
                <Package className="w-5 h-5 text-purple-700" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-erp-md bg-green-100 text-green-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium opacity-90">
                Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">
                  {orders.filter(o => o.status === 'completed').length}
                </span>
                <CheckCircle className="w-5 h-5 text-green-700" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <CardTitle>Orders with Receipts</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowSearch(v => !v)}>
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Filter className="w-4 h-4 mr-2" />
                      Filter
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setFilterStatus(null)} className={!filterStatus ? 'bg-accent/20 font-semibold' : ''}>All Statuses</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterStatus("pending")} className={filterStatus === "pending" ? 'bg-accent/20 font-semibold' : ''}>Pending</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterStatus("confirmed")} className={filterStatus === "confirmed" ? 'bg-accent/20 font-semibold' : ''}>Confirmed</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterStatus("in_production")} className={filterStatus === "in_production" ? 'bg-accent/20 font-semibold' : ''}>In Production</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterStatus("completed")} className={filterStatus === "completed" ? 'bg-accent/20 font-semibold' : ''}>Completed</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterStatus("cancelled")} className={filterStatus === "cancelled" ? 'bg-accent/20 font-semibold' : ''}>Cancelled</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Sort
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setSortBy("date_desc")} className={sortBy === "date_desc" ? 'bg-accent/20 font-semibold' : ''}>Newest First</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy("date_asc")} className={sortBy === "date_asc" ? 'bg-accent/20 font-semibold' : ''}>Oldest First</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy("amount_desc")} className={sortBy === "amount_desc" ? 'bg-accent/20 font-semibold' : ''}>Amount High-Low</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortBy("amount_asc")} className={sortBy === "amount_asc" ? 'bg-accent/20 font-semibold' : ''}>Amount Low-High</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button onClick={fetchOrders} variant="outline">Refresh</Button>
              </div>
            </div>
            {showSearch && (
              <div className="mt-2">
                <Input
                  autoFocus
                  placeholder="Search by order number or customer name..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="max-w-xs"
                />
              </div>
            )}
          </CardHeader>
          <CardContent className="p-2 sm:p-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order Number</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Mockup</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order) => (
                      <TableRow 
                        key={order.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/orders/${order.id}`)}
                      >
                        <TableCell className="font-medium">{order.order_number}</TableCell>
                        <TableCell>{order.customer?.company_name}</TableCell>
                        <TableCell>
                          {new Date(order.order_date).toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: '2-digit'
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(order.status)}>
                            {order.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>₹{order.final_amount?.toFixed(2) || '0.00'}</TableCell>
                        <TableCell>₹{order.balance_amount?.toFixed(2) || '0.00'}</TableCell>
                        <TableCell>
                          {order.mockup_url ? (
                            <div className="w-6 h-6 bg-green-100 rounded flex items-center justify-center">
                              <FileImage className="w-4 h-4 text-green-600" />
                            </div>
                          ) : (
                            <div className="w-6 h-6 bg-gray-100 rounded flex items-center justify-center">
                              <FileImage className="w-4 h-4 text-gray-400" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/orders/${order.id}`);
                              }}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOrder(order);
                                setShowMockupDialog(true);
                              }}
                            >
                              <FileImage className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mockup Upload Dialog */}
        <Dialog open={showMockupDialog} onOpenChange={setShowMockupDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Upload Mockup</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                Upload a design mockup for order {selectedOrder?.order_number}
              </div>
              <div className="border-2 border-dashed border-gray-300 rounded p-6 text-center">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleMockupUpload(file);
                    }
                  }}
                  className="hidden"
                  id="mockup-upload"
                />
                <label htmlFor="mockup-upload" className="cursor-pointer">
                  <FileImage className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <div className="text-gray-500">Click to select image</div>
                  <div className="text-xs text-gray-400 mt-1">Supports: JPG, PNG, GIF</div>
                </label>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Print Dialog */}
        <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Print Order — {selectedOrder?.order_number}</DialogTitle>
            </DialogHeader>
            <div className="flex justify-end gap-2 mb-2">
              <Button variant="outline" onClick={() => window.print()}><FileImage className="w-4 h-4 mr-1" /> Print</Button>
              <Button variant="outline" onClick={handleExportPDF}><FileImage className="w-4 h-4 mr-1" /> Export PDF</Button>
            </div>
            <div ref={printRef} className="bg-white" style={{ padding: '15mm 25mm 15mm 15mm', minHeight: '297mm', width: '210mm', margin: '0 auto', fontSize: '10px', lineHeight: '1.3' }}>
              <style>{`
                @page { size: A4; margin: 15mm 25mm 15mm 15mm; }
                @media print {
                  .print:hidden { display: none !important; }
                  header, nav, .header, .navigation { display: none !important; }
                  .print-content { display: block !important; }
                }
              `}</style>
              
              {/* Company header */}
              <div className="flex justify-between items-start border-b pb-3 mb-3">
                <div className="flex items-center gap-3">
                  {(company as any)?.logo_url && (
                    <img src={(company as any).logo_url} alt="Logo" className="w-16 h-16 object-contain" style={{ maxWidth: '60px', maxHeight: '60px' }} />
                  )}
                  <div>
                    <div className="text-xl font-bold">{company?.company_name || 'Our Company'}</div>
                    <div className="text-xs text-muted-foreground">{company?.address}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">ORDER CONFIRMATION</div>
                  <div className="text-xs text-muted-foreground">Order #{selectedOrder?.order_number}</div>
                  <div className="text-xs text-muted-foreground">{selectedOrder?.order_date ? new Date(selectedOrder.order_date).toLocaleDateString('en-IN') : ''}</div>
                </div>
              </div>

              {/* Customer and Order Info */}
              <div className="grid grid-cols-2 gap-8 mb-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Customer Details</div>
                  <div className="text-sm">
                    <div className="font-medium">{selectedOrder?.customer?.company_name || '-'}</div>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-1">Order Details</div>
                  <div className="text-sm">
                    <div><span className="font-medium">Order #:</span> {selectedOrder?.order_number}</div>
                    <div><span className="font-medium">Date:</span> {selectedOrder?.order_date ? new Date(selectedOrder.order_date).toLocaleDateString('en-IN') : '-'}</div>
                    <div><span className="font-medium">Status:</span> {selectedOrder?.status || 'pending'}</div>
                  </div>
                </div>
              </div>

              {/* Mockup Section */}
              {selectedOrder?.mockup_url && (
                <div className="mb-4">
                  <div className="text-sm font-medium text-muted-foreground mb-2">Design Mockup</div>
                  <div className="border rounded p-2">
                    <img 
                      src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/order-mockups/${selectedOrder.mockup_url}`}
                      alt="Order Mockup"
                      className="max-w-full h-auto"
                      style={{ maxHeight: '200px' }}
                    />
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex justify-between items-end mt-8 text-xs">
                <div>
                  <div className="text-muted-foreground">Generated on {new Date().toLocaleDateString('en-IN')}</div>
                </div>
                <div className="text-right">
                  <div className="font-medium">For {company?.company_name || 'Our Company'}</div>
                  <div className="mt-8 border-b w-40"></div>
                  <div className="text-muted-foreground">Authorized Signatory</div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ErpLayout>
  );
};

export default DesignPage;
