import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, RefreshCw, Eye, Edit, Trash2, Package, CheckCircle, XCircle, AlertCircle, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type GRN = {
  id: string;
  grn_number: string;
  po_id: string;
  supplier_id: string;
  grn_date: string;
  received_date: string;
  status: 'draft' | 'received' | 'under_inspection' | 'approved' | 'rejected' | 'partially_approved';
  total_items_received: number;
  total_items_approved: number;
  total_items_rejected: number;
  created_at: string;
  // Joined data
  po_number?: string;
  supplier_name?: string;
  supplier_code?: string;
};

// Memoized row component for better performance
const GRNRow = memo(function GRNRow({ 
  grn, 
  onView, 
  onEdit, 
  onDelete 
}: {
  grn: GRN;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const statusBadge = (status: GRN['status']) => {
    const map: Record<GRN['status'], { className: string; icon: React.ReactNode; label: string }> = {
      draft: { 
        className: 'bg-gray-100 text-gray-800 border-gray-200', 
        icon: <Package className="w-3 h-3" />, 
        label: 'Draft' 
      },
      received: { 
        className: 'bg-blue-100 text-blue-800 border-blue-200', 
        icon: <Package className="w-3 h-3" />, 
        label: 'Received' 
      },
      under_inspection: { 
        className: 'bg-yellow-100 text-yellow-800 border-yellow-200', 
        icon: <AlertCircle className="w-3 h-3" />, 
        label: 'Under Inspection' 
      },
      approved: { 
        className: 'bg-green-100 text-green-800 border-green-200', 
        icon: <CheckCircle className="w-3 h-3" />, 
        label: 'Approved' 
      },
      rejected: { 
        className: 'bg-red-100 text-red-800 border-red-200', 
        icon: <XCircle className="w-3 h-3" />, 
        label: 'Rejected' 
      },
      partially_approved: { 
        className: 'bg-orange-100 text-orange-800 border-orange-200', 
        icon: <AlertCircle className="w-3 h-3" />, 
        label: 'Partially Approved' 
      },
    };
    const statusInfo = map[status];
    return (
      <Badge variant="outline" className={`font-medium ${statusInfo.className} flex items-center gap-1`}>
        {statusInfo.icon}
        {statusInfo.label}
      </Badge>
    );
  };

  return (
    <TableRow className="hover:bg-muted/50 transition-colors">
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-muted-foreground" />
          <span className="font-mono text-sm">{grn.grn_number}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm">
          <div className="font-medium">{grn.po_number || '-'}</div>
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm">
          <div className="font-medium">{grn.supplier_name || '-'}</div>
          <div className="text-xs text-muted-foreground">
            {grn.supplier_code || ''}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm">
          {grn.grn_date ? format(new Date(grn.grn_date), 'dd MMM yyyy') : '-'}
        </div>
      </TableCell>
      <TableCell>
        <div className="text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">{grn.total_items_received} items</span>
          </div>
          <div className="text-xs text-muted-foreground flex gap-2">
            <span className="text-green-600">{grn.total_items_approved} approved</span>
            <span className="text-red-600">{grn.total_items_rejected} rejected</span>
          </div>
        </div>
      </TableCell>
      <TableCell>{statusBadge(grn.status)}</TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => onView(grn.id)} className="h-8 w-8 p-0">
            <Eye className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onEdit(grn.id)} className="h-8 w-8 p-0">
            <Edit className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDelete(grn.id)} className="h-8 w-8 p-0 text-red-600 hover:text-red-700">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

const GRNList = memo(function GRNList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [grns, setGrns] = useState<GRN[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | GRN['status']>('all');
  const [columnFilters, setColumnFilters] = useState({
    grn_number: '',
    po_number: '',
    supplier: '',
    grn_date: '',
    items: '',
    status: '',
  });
  const [filterDialogColumn, setFilterDialogColumn] = useState<keyof typeof columnFilters | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch GRNs with joined data
      const { data: grnData, error: grnErr } = await supabase
        .from('grn_master')
        .select(`
          *,
          purchase_orders!grn_master_po_id_fkey(po_number),
          supplier_master!grn_master_supplier_id_fkey(supplier_name, supplier_code)
        `)
        .order('created_at', { ascending: false });
      
      if (grnErr) throw grnErr;

      // Process the joined data
      const processedGRNs: GRN[] = (grnData || []).map((grn: any) => {
        return {
          id: grn.id,
          grn_number: grn.grn_number,
          po_id: grn.po_id,
          supplier_id: grn.supplier_id,
          grn_date: grn.grn_date,
          received_date: grn.received_date,
          status: grn.status,
          total_items_received: grn.total_items_received || 0,
          total_items_approved: grn.total_items_approved || 0,
          total_items_rejected: grn.total_items_rejected || 0,
          created_at: grn.created_at,
          po_number: grn.purchase_orders?.po_number,
          supplier_name: grn.supplier_master?.supplier_name,
          supplier_code: grn.supplier_master?.supplier_code
        };
      });

      setGrns(processedGRNs);
    } catch (e) {
      console.error('Failed to fetch GRNs', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const includesFilter = (value: unknown, filterValue: string) =>
    filterValue.trim() === '' || String(value ?? '').toLowerCase().includes(filterValue.trim().toLowerCase());

  const filteredGRNs = useMemo(() => {
    return grns.filter((grn) => {
      const text = `${grn.grn_number} ${grn.po_number || ''} ${grn.supplier_name || ''} ${grn.supplier_code || ''}`.toLowerCase();
      const matchesSearch = !search || text.includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'all' || grn.status === statusFilter;
      const grnDateText = grn.grn_date ? format(new Date(grn.grn_date), 'dd MMM yyyy') : '';
      const itemsText = `${grn.total_items_received} ${grn.total_items_approved} ${grn.total_items_rejected}`;
      const statusText = grn.status.replace('_', ' ');
      const supplierText = `${grn.supplier_name || ''} ${grn.supplier_code || ''}`;

      const matchesColumns =
        includesFilter(grn.grn_number, columnFilters.grn_number) &&
        includesFilter(grn.po_number, columnFilters.po_number) &&
        includesFilter(supplierText, columnFilters.supplier) &&
        includesFilter(grnDateText, columnFilters.grn_date) &&
        includesFilter(itemsText, columnFilters.items) &&
        includesFilter(statusText, columnFilters.status);

      return matchesSearch && matchesStatus && matchesColumns;
    });
  }, [grns, search, statusFilter, columnFilters]);
  const hasActiveColumnFilters = Object.values(columnFilters).some((value) => value.trim() !== '');

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Delete this GRN? This action cannot be undone.')) return;
    
    try {
      const { error } = await supabase
        .from('grn_master')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      // Refresh the list
      fetchAll();
    } catch (error) {
      console.error('Failed to delete GRN:', error);
    }
  }, [fetchAll]);

  const handleView = useCallback((id: string) => {
    navigate(`/procurement/grn/${id}`);
  }, [navigate]);

  const handleEdit = useCallback((id: string) => {
    navigate(`/procurement/grn/${id}?edit=1`);
  }, [navigate]);

  const getStatusCounts = () => {
    const counts = grns.reduce((acc, grn) => {
      acc[grn.status] = (acc[grn.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      total: grns.length,
      draft: counts.draft || 0,
      received: counts.received || 0,
      under_inspection: counts.under_inspection || 0,
      approved: counts.approved || 0,
      rejected: counts.rejected || 0,
      partially_approved: counts.partially_approved || 0
    };
  };

  const statusCounts = getStatusCounts();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Goods Receipt Notes</h1>
          <p className="text-sm text-muted-foreground">Track and manage goods received from suppliers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchAll}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button onClick={() => navigate('/procurement/grn/new')}>
            <Plus className="w-4 h-4 mr-2" /> New GRN
          </Button>
        </div>
      </div>

      {/* Status Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total GRNs</p>
                <p className="text-3xl font-bold text-blue-600">{statusCounts.total}</p>
              </div>
              <Package className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-gray-500 hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Draft</p>
                <p className="text-3xl font-bold text-gray-600">{statusCounts.draft}</p>
              </div>
              <Package className="w-8 h-8 text-gray-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Received</p>
                <p className="text-3xl font-bold text-blue-600">{statusCounts.received}</p>
              </div>
              <Package className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-500 hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Under Inspection</p>
                <p className="text-3xl font-bold text-yellow-600">{statusCounts.under_inspection}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500 hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Approved</p>
                <p className="text-3xl font-bold text-green-600">{statusCounts.approved}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500 hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Rejected</p>
                <p className="text-3xl font-bold text-red-600">{statusCounts.rejected}</p>
              </div>
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500 hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Partial</p>
                <p className="text-3xl font-bold text-orange-600">{statusCounts.partially_approved}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-3 md:items-center">
            <div className="flex-1">
              <Input 
                placeholder="Search by GRN number, PO number, or supplier..." 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <SelectTrigger className="w-full md:w-56">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="under_inspection">Under Inspection</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="partially_approved">Partially Approved</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveColumnFilters && (
              <Button
                variant="outline"
                onClick={() =>
                  setColumnFilters({
                    grn_number: '',
                    po_number: '',
                    supplier: '',
                    grn_date: '',
                    items: '',
                    status: '',
                  })
                }
              >
                Clear column filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* GRN Table */}
      <Card>
        <CardHeader>
          <CardTitle>All GRNs ({filteredGRNs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead><div className="flex items-center gap-1">GRN Number<Button variant="ghost" size="icon" className={`h-6 w-6 ${columnFilters.grn_number ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setFilterDialogColumn('grn_number')}><Filter className="h-3.5 w-3.5" /></Button></div></TableHead>
                    <TableHead><div className="flex items-center gap-1">PO Number<Button variant="ghost" size="icon" className={`h-6 w-6 ${columnFilters.po_number ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setFilterDialogColumn('po_number')}><Filter className="h-3.5 w-3.5" /></Button></div></TableHead>
                    <TableHead><div className="flex items-center gap-1">Supplier<Button variant="ghost" size="icon" className={`h-6 w-6 ${columnFilters.supplier ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setFilterDialogColumn('supplier')}><Filter className="h-3.5 w-3.5" /></Button></div></TableHead>
                    <TableHead><div className="flex items-center gap-1">GRN Date<Button variant="ghost" size="icon" className={`h-6 w-6 ${columnFilters.grn_date ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setFilterDialogColumn('grn_date')}><Filter className="h-3.5 w-3.5" /></Button></div></TableHead>
                    <TableHead><div className="flex items-center gap-1">Items<Button variant="ghost" size="icon" className={`h-6 w-6 ${columnFilters.items ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setFilterDialogColumn('items')}><Filter className="h-3.5 w-3.5" /></Button></div></TableHead>
                    <TableHead><div className="flex items-center gap-1">Status<Button variant="ghost" size="icon" className={`h-6 w-6 ${columnFilters.status ? 'text-primary' : 'text-muted-foreground'}`} onClick={() => setFilterDialogColumn('status')}><Filter className="h-3.5 w-3.5" /></Button></div></TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGRNs.map((grn) => (
                    <GRNRow
                      key={grn.id}
                      grn={grn}
                      onView={handleView}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <Dialog open={!!filterDialogColumn} onOpenChange={(open) => !open && setFilterDialogColumn(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Filter column</DialogTitle>
              </DialogHeader>
              {filterDialogColumn && (
                <div className="space-y-3">
                  <Input
                    autoFocus
                    placeholder="Type to filter..."
                    value={columnFilters[filterDialogColumn]}
                    onChange={(event) =>
                      setColumnFilters((prev) => ({
                        ...prev,
                        [filterDialogColumn]: event.target.value,
                      }))
                    }
                  />
                  <div className="flex justify-between">
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setColumnFilters((prev) => ({
                          ...prev,
                          [filterDialogColumn]: '',
                        }))
                      }
                    >
                      Clear
                    </Button>
                    <Button onClick={() => setFilterDialogColumn(null)}>Done</Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
});

export { GRNList };
