import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Calendar, Package, TrendingUp, TrendingDown, FileText, ArrowRightLeft, RefreshCw, Move } from 'lucide-react';

interface InventoryLog {
  id: string;
  warehouse_inventory_id: string;
  grn_id: string | null;
  grn_item_id: string | null;
  item_type: string;
  item_name: string;
  item_code: string;
  quantity: number;
  old_quantity?: number | null;
  new_quantity?: number | null;
  unit: string;
  bin_id?: string | null;
  from_bin_id?: string | null;
  to_bin_id?: string | null;
  status?: string | null;
  old_status?: string | null;
  new_status?: string | null;
  color: string | null;
  action: string;
  reference_type?: string | null;
  reference_id?: string | null;
  reference_number?: string | null;
  notes: string | null;
  created_at: string;
}

interface InventoryLogsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inventoryId: string;
  itemName: string;
  consolidatedIds?: string[]; // Array of inventory IDs if this is a consolidated item
}

export const InventoryLogsModal: React.FC<InventoryLogsModalProps> = ({
  open,
  onOpenChange,
  inventoryId,
  itemName,
  consolidatedIds
}) => {
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalAdded, setTotalAdded] = useState(0);
  const [totalRemoved, setTotalRemoved] = useState(0);
  const [binNames, setBinNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && inventoryId) {
      loadLogs();
    }
  }, [open, inventoryId, consolidatedIds]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      
      // If consolidated, fetch logs for all related inventory IDs
      // Always include the main inventoryId even if consolidatedIds exist
      let inventoryIds: string[] = [];
      if (consolidatedIds && Array.isArray(consolidatedIds) && consolidatedIds.length > 0) {
        inventoryIds = [...consolidatedIds];
        // Make sure main inventoryId is included
        if (!inventoryIds.includes(inventoryId)) {
          inventoryIds.push(inventoryId);
        }
      } else {
        inventoryIds = [inventoryId];
      }
      
      console.log('🔍 Loading logs for:', {
        inventoryId,
        consolidatedIds,
        finalInventoryIds: inventoryIds,
        itemName,
        consolidatedIdsType: typeof consolidatedIds,
        consolidatedIdsLength: consolidatedIds?.length
      });
      
      // First, try to get the item details from warehouse_inventory to help with fallback query
      // Get data from all consolidated IDs, not just the first one
      const { data: invDataArray, error: invError } = await supabase
        .from('warehouse_inventory')
        .select('item_id, item_code, item_name')
        .in('id', inventoryIds as any);
      
      const invData = (invDataArray && Array.isArray(invDataArray) && invDataArray.length > 0 && !('error' in invDataArray[0])) 
        ? invDataArray[0] as { item_id: string | null; item_code: string; item_name: string }
        : null;
      
      // Also get item name from props if available (might be more reliable)
      const searchItemName = itemName || invData?.item_name;
      
      if (invError) {
        console.warn('⚠️ Error fetching inventory data for fallback:', invError);
      }
      
      console.log('📦 Inventory data:', { invData, searchItemName, allInventoryData: invDataArray });
      
      // Try querying by warehouse_inventory_id first
      let { data, error } = await supabase
        .from('inventory_logs')
        .select('*')
        .in('warehouse_inventory_id', inventoryIds as any)
        .order('created_at', { ascending: false });

      console.log('📊 Logs query result (by warehouse_inventory_id):', { 
        data, 
        error, 
        count: data?.length,
        idsQueried: inventoryIds
      });

      // Also try querying all warehouse_inventory_ids from consolidated items separately
      if (!error && (!data || data.length === 0) && inventoryIds.length > 1) {
        console.log('⚠️ No logs found with consolidated IDs, trying individual queries...');
        for (const id of inventoryIds) {
          const { data: singleLogs, error: singleError } = await supabase
            .from('inventory_logs')
            .select('*')
            .eq('warehouse_inventory_id', id as any)
            .order('created_at', { ascending: false });
          
          console.log(`  - Logs for ID ${id}:`, { count: singleLogs?.length, error: singleError });
          
          if (!singleError && singleLogs && singleLogs.length > 0) {
            data = (data || []).concat(singleLogs);
            console.log(`  ✅ Found ${singleLogs.length} logs for ID ${id}`);
          }
        }
      }

      // If no logs found by warehouse_inventory_id, try fallback queries
      if (!error && (!data || data.length === 0)) {
        console.log('⚠️ No logs found by warehouse_inventory_id, trying fallback queries...');
        
        // Fallback 1: Query by item_id if available
        if (invData?.item_id) {
          const { data: logsByItemId, error: itemIdError } = await supabase
            .from('inventory_logs')
            .select('*')
            .eq('item_id', invData.item_id as any)
            .order('created_at', { ascending: false });
          
          console.log('Logs query by item_id:', { data: logsByItemId, error: itemIdError, count: logsByItemId?.length });
          
          if (!itemIdError && logsByItemId && logsByItemId.length > 0) {
            data = logsByItemId;
            error = null;
          }
        }
        
        // Fallback 2: Query by item_code if still no results
        if ((!data || data.length === 0) && invData?.item_code && invData?.item_name) {
          const { data: logsByItemCode, error: itemCodeError } = await supabase
            .from('inventory_logs')
            .select('*')
            .eq('item_code', invData.item_code as any)
            .eq('item_name', invData.item_name as any)
            .order('created_at', { ascending: false });
          
          console.log('Logs query by item_code:', { data: logsByItemCode, error: itemCodeError, count: logsByItemCode?.length });
          
          if (!itemCodeError && logsByItemCode && logsByItemCode.length > 0) {
            data = logsByItemCode;
            error = null;
          }
        }
        
        // Fallback 3: Query all logs for this item by name (broadest fallback)
        if ((!data || data.length === 0) && searchItemName) {
          const { data: logsByName, error: nameError } = await supabase
            .from('inventory_logs')
            .select('*')
            .eq('item_name', searchItemName as any)
            .order('created_at', { ascending: false })
            .limit(100); // Limit to prevent too many results
          
          console.log('📝 Logs query by item_name:', { 
            data: logsByName, 
            error: nameError, 
            count: logsByName?.length,
            searchedName: searchItemName
          });
          
          if (!nameError && logsByName && logsByName.length > 0) {
            data = logsByName;
            error = null;
          }
        }
        
        // Fallback 4: As a last resort, check if ANY logs exist in the table at all
        if ((!data || data.length === 0)) {
          const { data: allLogs, error: allLogsError } = await supabase
            .from('inventory_logs')
            .select('item_name, warehouse_inventory_id, item_code, created_at')
            .order('created_at', { ascending: false })
            .limit(20);
          
          console.log('🔎 Sample of all logs in database (last 20):', { 
            data: allLogs, 
            error: allLogsError,
            count: allLogs?.length
          });
        }
      }

      if (error) {
        console.error('Error loading logs:', error);
        throw error;
      }

      const logsData = ((data || []) as any[]) as InventoryLog[];
      console.log('Final logs data:', logsData.length, 'entries');
      setLogs(logsData);
      
      // Calculate totals: separate additions and removals
      const added = logsData
        .filter(log => Number(log.quantity || 0) > 0)
        .reduce((sum, log) => sum + Number(log.quantity || 0), 0);
      const removed = logsData
        .filter(log => Number(log.quantity || 0) < 0)
        .reduce((sum, log) => sum + Math.abs(Number(log.quantity || 0)), 0);
      
      setTotalAdded(added);
      setTotalRemoved(removed);

      // Fetch bin names for display
      const binIds = new Set<string>();
      logsData.forEach(log => {
        if (log.bin_id) binIds.add(log.bin_id);
        if (log.from_bin_id) binIds.add(log.from_bin_id);
        if (log.to_bin_id) binIds.add(log.to_bin_id);
      });

      if (binIds.size > 0) {
        const { data: binsData } = await supabase
          .from('bins')
          .select('id, bin_code')
          .in('id', Array.from(binIds) as any);

        if (binsData) {
          const binMap: Record<string, string> = {};
          binsData.forEach((bin: any) => {
            binMap[bin.id] = bin.bin_code;
          });
          setBinNames(binMap);
        }
      }
    } catch (error) {
      console.error('Error loading inventory logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'ADDED':
        return <Badge className="bg-green-100 text-green-800">Added</Badge>;
      case 'CONSOLIDATED':
        return <Badge className="bg-blue-100 text-blue-800">Consolidated</Badge>;
      case 'REMOVED':
        return <Badge className="bg-red-100 text-red-800">Removed</Badge>;
      case 'ADJUSTED':
        return <Badge className="bg-yellow-100 text-yellow-800">Adjusted</Badge>;
      case 'TRANSFERRED':
        return <Badge className="bg-purple-100 text-purple-800">Transferred</Badge>;
      case 'STATUS_CHANGED':
        return <Badge className="bg-orange-100 text-orange-800">Status Changed</Badge>;
      default:
        return <Badge variant="outline">{action}</Badge>;
    }
  };

  const formatQuantity = (log: InventoryLog) => {
    const qty = Number(log.quantity || 0);
    const isNegative = qty < 0;
    const absQty = Math.abs(qty);
    
    if (log.old_quantity !== null && log.old_quantity !== undefined && 
        log.new_quantity !== null && log.new_quantity !== undefined) {
      // Show old -> new format for adjustments
      return (
        <div className="flex flex-col">
          <div className={`font-medium ${isNegative ? 'text-red-600' : 'text-green-600'}`}>
            {isNegative ? '-' : '+'}{absQty} {log.unit}
          </div>
          <div className="text-xs text-muted-foreground">
            {log.old_quantity} → {log.new_quantity} {log.unit}
          </div>
        </div>
      );
    }
    
    return (
      <div className={`flex items-center gap-1 font-medium ${isNegative ? 'text-red-600' : 'text-green-600'}`}>
        {isNegative ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
        <span>{isNegative ? '-' : '+'}{absQty} {log.unit}</span>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Inventory Logs: {itemName}
          </DialogTitle>
          <DialogDescription>
            View individual item additions and modifications history
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading logs...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-800">Total Added</span>
                </div>
                <div className="text-2xl font-bold text-green-600">{totalAdded}</div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-semibold text-red-800">Total Removed</span>
                </div>
                <div className="text-2xl font-bold text-red-600">{totalRemoved}</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-800">Total Entries</span>
                </div>
                <div className="text-2xl font-bold text-blue-600">{logs.length}</div>
              </div>
            </div>

            {/* Logs Table */}
            {logs.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No logs found for this item</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Quantity Change</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium text-sm">
                                {new Date(log.created_at).toLocaleDateString()}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(log.created_at).toLocaleTimeString()}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {getActionBadge(log.action)}
                        </TableCell>
                        <TableCell>
                          {formatQuantity(log)}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {log.reference_type && (
                              <Badge variant="outline" className="text-xs">
                                {log.reference_type}
                              </Badge>
                            )}
                            {log.reference_number && (
                              <div className="text-xs text-muted-foreground">
                                {log.reference_number}
                              </div>
                            )}
                            {log.grn_id && (
                              <div className="text-xs">
                                GRN #{log.grn_id.slice(0, 8)}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {log.action === 'TRANSFERRED' && log.from_bin_id && log.to_bin_id ? (
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-muted-foreground">{binNames[log.from_bin_id] || '?'}</span>
                              <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                              <span className="font-medium">{binNames[log.to_bin_id] || '?'}</span>
                            </div>
                          ) : log.bin_id ? (
                            <div className="text-xs">
                              <Move className="h-3 w-3 inline mr-1" />
                              {binNames[log.bin_id] || 'Unknown'}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {log.old_status && log.new_status ? (
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-muted-foreground">{log.old_status}</span>
                              <RefreshCw className="h-3 w-3" />
                              <span className="font-medium">{log.new_status}</span>
                            </div>
                          ) : log.status ? (
                            <Badge variant="outline" className="text-xs">{log.status}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-xs text-xs truncate" title={log.notes || ''}>
                            {log.notes || '-'}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

