import { useEffect, useMemo, useRef, useState } from "react";
import { ErpLayout } from "@/components/ErpLayout";
import { usePersistentTabState } from "@/hooks/usePersistentTabState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QCReviewDialog from "@/components/quality/QCReviewDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BackButton } from '@/components/common/BackButton';
import { getOrderCardPlaceholderSrc } from '@/utils/orderItemImageUtils';
import {
  enrichQcOrdersWithImages,
  loadQcPickedOrdersData,
  type QcPickedOrderCard,
} from '@/lib/loadQcPickedOrdersData';
import {
  buildPendingQcAssignmentOptions,
  orderNeedsQcVerification,
  type QcAssignmentMeta,
} from '@/utils/qcOrderFilters';

type PickedOrderCard = QcPickedOrderCard;

export default function QCPageWithTabs() {
  const [orders, setOrders] = useState<PickedOrderCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectAssignmentsForOrder, setSelectAssignmentsForOrder] = useState<null | { order_id: string; order_number: string; options: { assignment_id: string; batch_name?: string; picked: number; batch_leader_name?: string; batch_leader_avatar?: string | null }[] }>(null);
  const [qcOpen, setQcOpen] = useState(false);
  const [qcCtx, setQcCtx] = useState<null | { assignmentId: string; orderId: string; orderNumber: string }>(null);
  // Use persistent tab state to prevent resetting to first tab on refresh
  const { activeTab, setActiveTab } = usePersistentTabState({
    pageKey: 'qc',
    defaultValue: 'pending'
  });
  const assignmentMetaRef = useRef<Record<string, QcAssignmentMeta>>({});
  const imageLoadGenerationRef = useRef(0);

  useEffect(() => {
    loadPickedOrders();
  }, []);

  const loadPickedOrders = async () => {
    const loadGeneration = ++imageLoadGenerationRef.current;
    setLoading(true);
    try {
      const { orders: coreOrders, assignmentMeta } = await loadQcPickedOrdersData();
      assignmentMetaRef.current = assignmentMeta;
      setOrders(coreOrders);
      setLoading(false);

      void enrichQcOrdersWithImages(coreOrders).then((withImages) => {
        if (imageLoadGenerationRef.current !== loadGeneration) return;
        setOrders(withImages);
      });
    } catch (err) {
      console.error('Failed to load QC orders:', err);
      setOrders([]);
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let filteredOrders = orders;
    
    if (activeTab === 'pending') {
      filteredOrders = orders.filter(
        (o) =>
          !o.is_fully_qc &&
          (orderNeedsQcVerification(o) || o.qc_status === 'pending')
      );
    } else if (activeTab === 'partial') {
      filteredOrders = orders.filter(
        (o) =>
          !o.is_fully_qc &&
          !orderNeedsQcVerification(o) &&
          o.qc_status !== 'pending'
      );
    } else if (activeTab === 'completed') {
      filteredOrders = orders.filter(o => o.qc_status === 'completed');
    }
    
    // Apply search filter
    if (q) {
      filteredOrders = filteredOrders.filter(o => 
        o.order_number.toLowerCase().includes(q) || 
        (o.customer_name || '').toLowerCase().includes(q)
      );
    }
    
    return filteredOrders;
  }, [orders, search, activeTab]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />;
      case 'partial': return <Clock className="h-4 w-4 shrink-0 text-amber-600" />;
      case 'pending': return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />;
      default: return <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'border-emerald-200/90 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-100';
      case 'partial': return 'border-amber-200/90 bg-amber-50 text-amber-950 dark:bg-amber-950/35 dark:text-amber-100';
      case 'pending': return 'border-amber-200/90 bg-amber-50/90 text-amber-950 dark:bg-amber-950/35 dark:text-amber-100';
      default: return 'border-border bg-muted/50 text-foreground';
    }
  };

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div className="flex items-center">
          <BackButton to="/quality" label="Back to Quality" />
        </div>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">QC</h1>
          <p className="text-muted-foreground mt-1">Review and QC picked orders</p>
        </div>

        <div className="flex items-center gap-3 max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search orders or customers" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pending" className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              QC review ({orders.filter(o => !o.is_fully_qc && (orderNeedsQcVerification(o) || o.qc_status === 'pending')).length})
            </TabsTrigger>
            <TabsTrigger value="partial" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Rework / pick ({orders.filter(o => !o.is_fully_qc && !orderNeedsQcVerification(o) && o.qc_status !== 'pending').length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Completed ({orders.filter(o => o.qc_status === 'completed').length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-4">
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground">
                No {activeTab} orders found.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((o) => (
                  <Card
                    key={o.order_id}
                    className={`group overflow-hidden border border-border/80 bg-card/80 backdrop-blur-sm shadow-sm transition hover:shadow-lg hover:border-primary/25 ${o.qc_status === 'completed' ? 'opacity-[0.92]' : ''}`}
                    onClick={() => {
                    if (o.qc_status === 'completed') return;
                    const meta = assignmentMetaRef.current;
                    const options = buildPendingQcAssignmentOptions(o.assignment_ids, meta);
                    if (options.length === 0) return;
                    if (options.length <= 1) {
                      const chosen = options[0];
                      setQcCtx({ assignmentId: chosen.assignment_id, orderId: o.order_id, orderNumber: o.order_number });
                      setQcOpen(true);
                    } else {
                      setSelectAssignmentsForOrder({ order_id: o.order_id, order_number: o.order_number, options });
                    }
                  }}
                  >
                    <CardContent className="p-0">
                      <div className="flex gap-0">
                        <div className="relative w-[96px] shrink-0 self-stretch min-h-[120px] bg-muted/40">
                          {(() => {
                            const urls =
                              o.image_urls?.length
                                ? o.image_urls
                                : o.image_url
                                  ? [o.image_url]
                                  : [getOrderCardPlaceholderSrc()];
                            const visible = urls.slice(0, 4);
                            const extra = urls.length - visible.length;
                            if (visible.length === 1) {
                              return (
                                <img
                                  src={visible[0]}
                                  alt=""
                                  className="absolute inset-0 h-full w-full object-cover"
                                />
                              );
                            }
                            return (
                              <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px">
                                {visible.map((url, idx) => (
                                  <div key={`${url}-${idx}`} className="relative min-h-0 overflow-hidden">
                                    <img src={url} alt="" className="h-full w-full object-cover" />
                                    {extra > 0 && idx === visible.length - 1 ? (
                                      <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-semibold text-white">
                                        +{extra}
                                      </span>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                          <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-transparent to-transparent pointer-events-none" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                                #{o.order_number}
                                <span aria-hidden>{getStatusIcon(o.qc_status)}</span>
                              </div>
                              <p className="truncate text-xs text-muted-foreground">{o.customer_name || '—'}</p>
                              <Badge className={`mt-2 h-6 rounded-full px-2.5 text-[11px] font-medium ${getStatusColor(o.qc_status)}`}>
                                {o.qc_status === 'partial' ? 'In progress' : o.qc_status.charAt(0).toUpperCase() + o.qc_status.slice(1)}
                              </Badge>
                            </div>
                            {(o.batch_faces && o.batch_faces.length > 0) && (
                              <div className="flex shrink-0 -space-x-2 pt-0.5">
                                {o.batch_faces.slice(0, 4).map((f, idx) => (
                                  <Avatar key={`${f.name}-${idx}`} className="h-8 w-8 border-2 border-background ring-1 ring-border/80">
                                    <AvatarImage src={f.avatar || undefined} alt="" />
                                    <AvatarFallback className="bg-primary/15 text-[10px] font-medium text-primary">
                                      {f.name.slice(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                            {[
                              { label: 'Total', val: o.total_quantity, tint: 'bg-violet-500/10 text-violet-800 dark:text-violet-200' },
                              { label: 'Picked', val: o.picked_quantity, tint: 'bg-amber-500/10 text-amber-900 dark:text-amber-200' },
                              { label: 'OK', val: o.approved_quantity, tint: 'bg-emerald-500/10 text-emerald-900 dark:text-emerald-200' },
                              { label: 'Rejected', val: o.rejected_quantity, tint: 'bg-rose-500/10 text-rose-900 dark:text-rose-200' },
                            ].map((s) => (
                              <div key={s.label} className={`rounded-lg px-2.5 py-2 text-center ${s.tint}`}>
                                <div className="text-[10px] font-medium uppercase tracking-wider opacity-80">{s.label}</div>
                                <div className="text-lg font-semibold tabular-nums leading-tight">{Math.round(Number(s.val) || 0)}</div>
                              </div>
                            ))}
                          </div>
                          {o.qc_status === 'completed' && (
                            <div className="rounded-md border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1.5 text-[11px] text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
                              ✓ QC complete — every batch disposition recorded
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Choose batch to QC when multiple assignments exist */}
        <Dialog open={!!selectAssignmentsForOrder} onOpenChange={(v) => { if (!v) setSelectAssignmentsForOrder(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Choose batch for order {(selectAssignmentsForOrder?.order_number) || ''}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {selectAssignmentsForOrder?.options.map(opt => (
                <Card key={opt.assignment_id} className="border hover:shadow-md transition cursor-pointer" onClick={() => {
                  setSelectAssignmentsForOrder(null);
                  setQcCtx({ assignmentId: opt.assignment_id, orderId: selectAssignmentsForOrder!.order_id, orderNumber: selectAssignmentsForOrder!.order_number });
                  setQcOpen(true);
                }}>
                  <CardContent className="pt-4 pb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={opt.batch_leader_avatar || undefined} />
                        <AvatarFallback>{(opt.batch_leader_name || 'B')[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-sm">{opt.batch_name || 'Batch'}</div>
                        <div className="text-xs text-muted-foreground">{opt.batch_leader_name || 'Manager'}</div>
                      </div>
                    </div>
                    <Badge className="bg-green-100 text-green-800">Picked: {opt.picked}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* QC Dialog */}
        {qcOpen && qcCtx && (
          <QCReviewDialog
            isOpen={qcOpen}
            onClose={() => { setQcOpen(false); loadPickedOrders(); }}
            orderId={qcCtx.orderId}
            orderNumber={qcCtx.orderNumber}
            assignmentId={qcCtx.assignmentId}
          />
        )}
      </div>
    </ErpLayout>
  );
}
