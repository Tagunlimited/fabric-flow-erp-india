import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { RefreshCw, Plus, CheckCircle2, Hourglass, ClipboardList, Package } from 'lucide-react';
import { BomToPOWizardDialog } from './BomToPOWizardDialog';
import { toast } from 'sonner';

interface PendingItem {
  bom_item_id: string;
  bom_id: string;
  bom_number: string;
  bom_status: string | null;
  order_id?: string | null;
  product_name: string | null;
  product_image_url: string | null;
  item_name: string;
  item_type: string | null;
  category: string | null;
  qty_total: number;
  total_ordered: number;
  total_allocated: number;
  remaining_quantity: number;
  unit: string | null;
  fabric_name: string | null;
  fabric_color: string | null;
  fabric_gsm: string | null;
  image_url: string | null;
  notes: string | null;
  bom_created_at: string | null;
}

interface PurchaseOrderLite {
  id: string;
  po_number: string;
  supplier: {
    id: string;
    supplier_name: string;
    supplier_code: string | null;
  } | null;
  order_date: string | null;
  status: string | null;
  total_items: number;
  total_quantity: number;
  grns: Array<{ id: string; grn_number: string; status: string | null; grn_date: string | null }>;
}

interface PendingItemGroup {
  key: string;
  displayName: string;
  type: string;
  unit: string | null;
  imageUrl: string | null;
  totalRequired: number;
  totalOrdered: number;
  totalRemaining: number;
  bomBreakdowns: PendingItem[];
}

const PLACEHOLDER_IMAGE = 'https://placehold.co/80x80?text=IMG';

export function PurchaseOrderDashboard() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'pending' | 'in_progress' | 'completed'>('pending');
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingPOs, setLoadingPOs] = useState(true);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [inProgressPOs, setInProgressPOs] = useState<PurchaseOrderLite[]>([]);
  const [completedPOs, setCompletedPOs] = useState<PurchaseOrderLite[]>([]);
  const [wizardBom, setWizardBom] = useState<{ id: string; number: string } | null>(null);
  const [refreshFlag, setRefreshFlag] = useState(0);

  const formatQuantity = (value: number | string | null | undefined) => {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return '0.00';
    }
    return num.toFixed(2);
  };

  const refreshAll = useCallback(() => {
    setRefreshFlag(prev => prev + 1);
  }, []);

  useEffect(() => {
    const loadPending = async () => {
      try {
        setLoadingPending(true);
        let pendingData: PendingItem[] = [];

        const { data, error } = await supabase
          .from('pending_po_items_view')
          .select('*')
          .gt('remaining_quantity', 0)
          .order('bom_number', { ascending: true });

        if (error) {
          // Fallback to manual aggregation when the view is missing (e.g. local dev)
          if ((error as any)?.code === 'PGRST205') {
            const { data: fallbackData, error: fallbackError } = await supabase
              .from('bom_record_items')
              .select(`
                id,
                bom_id,
                item_name,
                category,
                qty_total,
                unit_of_measure,
                to_order,
                stock,
                fabric_name,
                fabric_color,
                fabric_gsm,
                item_id,
                item_code,
                item_image_url,
                notes,
                bom_records (
                  bom_number,
                  status,
                  order_id,
                  product_name,
                  product_image_url,
                  created_at
                ),
                bom_po_items (ordered_quantity),
                inventory_allocations (quantity)
              `);

            if (fallbackError) throw fallbackError;

            pendingData = (fallbackData || []).map((row: any) => {
              const allocations = Array.isArray(row.bom_po_items) ? row.bom_po_items : [];
              const totalOrdered = allocations.reduce((sum: number, alloc: any) => sum + Number(alloc?.ordered_quantity || 0), 0);
              const remainingQuantity = Number(row.qty_total || 0) - totalOrdered;
              const inventoryAllocations = Array.isArray(row.inventory_allocations) ? row.inventory_allocations : [];
              const totalAllocated = inventoryAllocations.reduce((sum: number, alloc: any) => sum + Number(alloc?.quantity || 0), 0);
              const hasInventory = Number(row.stock || 0) > 0;

              if (totalAllocated > 0 || hasInventory || remainingQuantity <= 0) {
                return null;
              }

          return {
                bom_item_id: row.id,
                bom_id: row.bom_id,
                bom_number: row.bom_records?.bom_number || 'Unknown',
                bom_status: row.bom_records?.status || null,
                order_id: row.bom_records?.order_id || null,
                product_name: row.bom_records?.product_name || null,
                product_image_url: row.bom_records?.product_image_url || null,
                item_name: row.item_name,
                item_type: row.category,
                category: row.category,
                qty_total: row.qty_total,
                unit: row.unit_of_measure || null,
                to_order: row.to_order,
                stock: row.stock,
                total_ordered: totalOrdered,
                total_allocated: totalAllocated,
                remaining_quantity: remainingQuantity,
                fabric_name: row.fabric_name,
                fabric_color: row.fabric_color,
                fabric_gsm: row.fabric_gsm,
                fabric_id: row.fabric_id,
                item_id: row.item_id,
                item_code: row.item_code,
                image_url: row.item_image_url,
                notes: row.notes,
                bom_created_at: row.bom_records?.created_at || null
              } as PendingItem & { bom_created_at: string | null };
            }).filter((row: any) => row !== null) as PendingItem[];
          } else {
            throw error;
          }
        } else {
          pendingData = (data || []) as PendingItem[];
        }

        const imageCache = new Map<string, string | null>();

        const resolveImageForPendingItem = async (item: PendingItem): Promise<string | null> => {
          if (item.image_url) {
            return item.image_url;
          }

          const cacheKey = [
            (item.item_type || item.category || '').toLowerCase(),
            item.item_id || '',
            item.item_code || '',
            item.fabric_id || '',
            item.fabric_name || '',
            item.fabric_color || '',
            item.fabric_gsm || ''
          ].join('|');

          if (imageCache.has(cacheKey)) {
            return imageCache.get(cacheKey) || null;
          }

          let resolvedImage: string | null = null;
          const typeKey = (item.item_type || item.category || '').toLowerCase();

          try {
            if (typeKey === 'fabric') {
              if (item.fabric_id) {
                const { data, error } = await supabase
                  .from('fabric_master')
                  .select('image_url, image')
                  .eq('id', item.fabric_id)
                  .limit(1)
                  .maybeSingle();
                if (!error && data) {
                  resolvedImage = (data as any).image_url || (data as any).image || null;
                }
              }

              if (!resolvedImage && item.fabric_name) {
                let query = supabase
                  .from('fabric_master')
                  .select('image_url, image')
                  .eq('fabric_name', item.fabric_name);

                if (item.fabric_color) {
                  query = query.eq('color', item.fabric_color);
                }
                if (item.fabric_gsm) {
                  query = query.eq('gsm', item.fabric_gsm);
                }

                const { data, error } = await query.limit(1).maybeSingle();
                if (!error && data) {
                  resolvedImage = (data as any).image_url || (data as any).image || null;
                }

                if (!resolvedImage) {
                  const { data: ilikeData, error: ilikeError } = await supabase
                    .from('fabric_master')
                    .select('image_url, image')
                    .ilike('fabric_name', `%${item.fabric_name}%`)
                    .limit(1)
                    .maybeSingle();
                  if (!ilikeError && ilikeData) {
                    resolvedImage = (ilikeData as any).image_url || (ilikeData as any).image || null;
                  }
                }
              }
            } else {
              if (item.item_id) {
                const { data, error } = await supabase
                  .from('item_master')
                  .select('image_url, image')
                  .eq('id', item.item_id)
                  .limit(1)
                  .maybeSingle();
                if (!error && data) {
                  resolvedImage = (data as any).image_url || (data as any).image || null;
                }
              }

              if (!resolvedImage && item.item_code) {
                const { data, error } = await supabase
                  .from('item_master')
                  .select('image_url, image')
                  .eq('item_code', item.item_code)
                  .limit(1)
                  .maybeSingle();
                if (!error && data) {
                  resolvedImage = (data as any).image_url || (data as any).image || null;
                }
              }
            }
          } catch (err) {
            console.warn('Failed to resolve image for pending item', {
              bom_item_id: item.bom_item_id,
              bom_id: item.bom_id,
              err
            });
          }

          if (!resolvedImage) {
            resolvedImage = item.product_image_url || null;
          }

          imageCache.set(cacheKey, resolvedImage);
          return resolvedImage;
        };

        const pendingWithImages: PendingItem[] = [];
        for (const item of pendingData as PendingItem[]) {
          const imageUrl = await resolveImageForPendingItem(item);
          pendingWithImages.push({ ...item, image_url: imageUrl });
        }

        const sorted = pendingWithImages.sort((a, b) => {
          const typeA = (a.item_type || '').toLowerCase();
          const typeB = (b.item_type || '').toLowerCase();
          if (typeA === typeB) {
            return a.item_name.localeCompare(b.item_name);
          }
          return typeA.localeCompare(typeB);
        });

        setPendingItems(sorted);
      } catch (error) {
        console.error('Failed to load pending BOM items', error);
        toast.error('Failed to load pending BOM items');
      } finally {
        setLoadingPending(false);
      }
    };

    const loadPOs = async () => {
      try {
        setLoadingPOs(true);
        const { data, error } = await supabase
          .from('purchase_orders')
          .select(`
            id,
            po_number,
            order_date,
            status,
            supplier:supplier_master(id, supplier_name, supplier_code),
            items:purchase_order_items(id, quantity, unit_of_measure),
            grns:grn_master(id, grn_number, status, grn_date)
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const processed = (data || []).map(po => {
          const totalQuantity = (po.items || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
          return {
            id: po.id,
            po_number: po.po_number,
            supplier: po.supplier || null,
            order_date: po.order_date,
            status: po.status,
            total_items: po.items?.length || 0,
            total_quantity: totalQuantity,
            grns: po.grns || []
          } as PurchaseOrderLite;
        });

        setInProgressPOs(processed.filter(po => !po.grns || po.grns.length === 0));
        setCompletedPOs(processed.filter(po => po.grns && po.grns.length > 0));
      } catch (error) {
        console.error('Failed to load purchase orders', error);
        toast.error('Failed to load purchase orders');
      } finally {
        setLoadingPOs(false);
      }
    };

    loadPending();
    loadPOs();
  }, [refreshFlag]);

  const stats = useMemo(() => {
    const totalPendingQuantity = pendingItems.reduce((sum, item) => sum + Number(item.remaining_quantity || 0), 0);
    const uniqueBomCount = new Set(pendingItems.map(item => item.bom_id)).size;
    return {
      pendingBoms: uniqueBomCount,
      pendingItems: totalPendingQuantity,
      inProgressPOs: inProgressPOs.length,
      completedPOs: completedPOs.length
    };
  }, [pendingItems, inProgressPOs.length, completedPOs.length]);

  const fabricPending = useMemo(() => {
    return pendingItems.filter(item => (item.item_type || item.category || '').toLowerCase() === 'fabric');
  }, [pendingItems]);

  const nonFabricPending = useMemo(() => {
    return pendingItems.filter(item => (item.item_type || item.category || '').toLowerCase() !== 'fabric');
  }, [pendingItems]);

  const buildItemGroups = useCallback((rows: PendingItem[]): PendingItemGroup[] => {
    const groupsMap = new Map<string, PendingItemGroup>();

    rows.forEach(item => {
      const typeKey = (item.item_type || item.category || '-').toLowerCase();
      const isFabric = typeKey === 'fabric';
      const identity = isFabric
        ? [item.fabric_name?.toLowerCase() || '', item.fabric_color?.toLowerCase() || '', item.fabric_gsm || ''].join('|')
        : (item.item_id || item.item_code || item.item_name || '').toLowerCase();
      const key = `${typeKey}|${identity}`;

      const totalRequired = Number(item.qty_total || 0);
      const totalOrdered = Number(item.total_ordered || 0);
      const totalRemaining = Number(item.remaining_quantity || 0);

      const existing = groupsMap.get(key);
      if (existing) {
        existing.totalRequired += totalRequired;
        existing.totalOrdered += totalOrdered;
        existing.totalRemaining += totalRemaining;
        existing.bomBreakdowns.push(item);
      } else {
        groupsMap.set(key, {
          key,
          displayName: item.item_name,
          type: item.item_type || item.category || '-',
          unit: item.unit || null,
          imageUrl: item.image_url,
          totalRequired,
          totalOrdered,
          totalRemaining,
          bomBreakdowns: [item]
        });
      }
    });

    return Array.from(groupsMap.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, []);

  const fabricGroups = useMemo(() => buildItemGroups(fabricPending), [buildItemGroups, fabricPending]);
  const itemGroups = useMemo(() => buildItemGroups(nonFabricPending), [buildItemGroups, nonFabricPending]);

  const renderPendingSection = (title: string, groups: PendingItemGroup[]) => {
    if (groups.length === 0) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent className="py-12 text-center text-muted-foreground">
            No pending {title.toLowerCase()} requirements.
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="border border-primary/20">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {groups.map(group => (
              <div key={group.key} className="rounded-lg border border-dashed border-primary/30 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 overflow-hidden rounded bg-muted">
                      <img
                        src={group.imageUrl || PLACEHOLDER_IMAGE}
                        alt={group.displayName}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = PLACEHOLDER_IMAGE;
                        }}
                      />
                    </div>
                    <div>
                      <div className="text-lg font-semibold">{group.displayName}</div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">{group.type}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm md:text-right">
                    <div>
                      <div className="text-muted-foreground">Required</div>
                      <div className="font-semibold">{formatQuantity(group.totalRequired)} {group.unit || ''}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Ordered</div>
                      <div className="font-semibold">{formatQuantity(group.totalOrdered)} {group.unit || ''}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Remaining</div>
                      <div className="font-semibold text-primary">{formatQuantity(group.totalRemaining)} {group.unit || ''}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="[&>th]:align-middle">
                        <TableHead className="w-[40%] text-left">BOM</TableHead>
                        <TableHead className="w-[18%] text-right">Required</TableHead>
                        <TableHead className="w-[18%] text-right">Ordered</TableHead>
                        <TableHead className="w-[18%] text-right">Remaining</TableHead>
                        <TableHead className="w-[6%] text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.bomBreakdowns
                        .sort((a, b) => a.bom_number.localeCompare(b.bom_number))
                        .map(item => (
                          <TableRow key={item.bom_item_id} className="[&>td]:align-middle">
                            <TableCell className="w-[40%]">
                              <div className="font-medium">{item.bom_number}</div>
                              <div className="text-xs text-muted-foreground">{item.product_name || 'Unnamed Product'}</div>
                            </TableCell>
                            <TableCell className="w-[18%] text-right whitespace-nowrap tabular-nums">
                              {formatQuantity(item.qty_total)} {item.unit || ''}
                            </TableCell>
                            <TableCell className="w-[18%] text-right whitespace-nowrap tabular-nums">
                              {formatQuantity(item.total_ordered)} {item.unit || ''}
                            </TableCell>
                            <TableCell className="w-[18%] text-right font-semibold text-primary whitespace-nowrap tabular-nums">
                              {formatQuantity(item.remaining_quantity)} {item.unit || ''}
                            </TableCell>
                            <TableCell className="w-[6%] text-center">
                              <div className="flex justify-center">
                                <Button
                                  size="sm"
                                  className="bg-primary text-white hover:bg-primary/90 px-5"
                                  onClick={() => navigate(`/bom/${item.bom_id}`)}
                                >
                                View BOM
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Purchase Order Planning</h1>
          <p className="text-muted-foreground">Create purchase orders at the end of the day based on pending BOM requirements.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={refreshAll}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh Data
          </Button>
          <Button
            onClick={() => navigate('/procurement/po/new')}
            className="bg-pink-500 text-white hover:bg-pink-600 animate-pulse shadow-[0_0_15px_rgba(236,72,153,0.75)]"
          >
            <Plus className="w-4 h-4 mr-2" /> Create PO
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending BOMs</p>
                <p className="text-2xl font-bold">{stats.pendingBoms}</p>
              </div>
              <Package className="w-8 h-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Quantity</p>
                <p className="text-2xl font-bold">{formatQuantity(stats.pendingItems)}</p>
              </div>
              <ClipboardList className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">POs In Progress</p>
                <p className="text-2xl font-bold">{stats.inProgressPOs}</p>
              </div>
              <Hourglass className="w-8 h-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">POs Completed</p>
                <p className="text-2xl font-bold">{stats.completedPOs}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={value => setActiveTab(value as typeof activeTab)}>
        <TabsList className="mb-4">
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="in_progress">In Progress</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {loadingPending ? (
            <Card>
              <CardContent className="py-6">
                <div className="space-y-4">
                  <Skeleton className="h-14" />
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </div>
              </CardContent>
            </Card>
          ) : pendingItems.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                All BOM items have purchase orders! 🎉
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {renderPendingSection('Fabric', fabricGroups)}
              {renderPendingSection('Item', itemGroups)}
                  </div>
          )}
        </TabsContent>

        <TabsContent value="in_progress" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Purchase Orders Awaiting GRN ({inProgressPOs.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingPOs ? (
                <div className="space-y-3">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : inProgressPOs.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No purchase orders pending GRN.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Order Date</TableHead>
                        <TableHead>Total Items</TableHead>
                        <TableHead>Total Quantity</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inProgressPOs.map(po => (
                        <TableRow key={po.id}>
                          <TableCell className="font-medium">{po.po_number}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="font-medium">{po.supplier?.supplier_name || '-'}</div>
                              {po.supplier?.supplier_code && (
                                <div className="text-xs text-muted-foreground">{po.supplier.supplier_code}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{po.order_date ? format(new Date(po.order_date), 'dd MMM yyyy') : '-'}</TableCell>
                          <TableCell>{po.total_items}</TableCell>
                          <TableCell>{formatQuantity(po.total_quantity)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{po.status?.replace('_', ' ') || 'Pending'}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => navigate(`/procurement/po/${po.id}`)}>
                                View
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => navigate(`/procurement/grn/new?po=${po.id}`)}>
                                Create GRN
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
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Purchase Orders with GRN ({completedPOs.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingPOs ? (
                <div className="space-y-3">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : completedPOs.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No completed purchase orders yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Order Date</TableHead>
                        <TableHead>Total Items</TableHead>
                        <TableHead>Total Quantity</TableHead>
                        <TableHead>GRNs</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {completedPOs.map(po => (
                        <TableRow key={po.id}>
                          <TableCell className="font-medium">{po.po_number}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="font-medium">{po.supplier?.supplier_name || '-'}</div>
                              {po.supplier?.supplier_code && (
                                <div className="text-xs text-muted-foreground">{po.supplier.supplier_code}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{po.order_date ? format(new Date(po.order_date), 'dd MMM yyyy') : '-'}</TableCell>
                          <TableCell>{po.total_items}</TableCell>
                          <TableCell>{formatQuantity(po.total_quantity)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {po.grns.map(grn => (
                                <Badge key={grn.id} variant="outline" className="w-fit capitalize">
                                  {grn.grn_number} • {grn.status?.replace('_', ' ') || 'received'}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => navigate(`/procurement/po/${po.id}`)}>
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <BomToPOWizardDialog
        open={!!wizardBom}
        bomId={wizardBom?.id || ''}
        bomNumber={wizardBom?.number || ''}
        onOpenChange={(open) => {
          if (!open) {
            setWizardBom(null);
          }
        }}
        onComplete={() => {
          setWizardBom(null);
          refreshAll();
        }}
      />
    </div>
  );
}

