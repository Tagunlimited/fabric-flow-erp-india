import { useEffect, useMemo, useRef, useState } from "react";
import { ErpLayout } from "@/components/ErpLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import "@/components/purchase-orders/POPlanningSegmentedSwitch.css";
import { Search, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QCReviewDialog from "@/components/quality/QCReviewDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getOrderCardPlaceholderSrc } from '@/utils/orderItemImageUtils';
import {
  enrichQcOrdersWithImages,
  loadQcPickedOrdersData,
  type QcBatchAvatarInfo,
  type QcPickedOrderCard,
} from '@/lib/loadQcPickedOrdersData';
import {
  buildPendingQcAssignmentOptions,
  orderNeedsQcVerification,
  type QcAssignmentMeta,
} from '@/utils/qcOrderFilters';

type PickedOrderCard = QcPickedOrderCard & { batch_avatars: QcBatchAvatarInfo[] };

export default function QCPage() {
  const [orders, setOrders] = useState<PickedOrderCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectAssignmentsForOrder, setSelectAssignmentsForOrder] = useState<null | { order_id: string; order_number: string; options: { assignment_id: string; batch_name?: string; picked: number; batch_leader_name?: string; batch_leader_avatar?: string | null }[] }>(null);
  const [qcOpen, setQcOpen] = useState(false);
  const [qcCtx, setQcCtx] = useState<null | { assignmentId: string; orderId: string; orderNumber: string }>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'partial' | 'completed'>('pending');
  const qcTabIdx = activeTab === 'pending' ? 0 : activeTab === 'partial' ? 1 : 2;
  const [imageGalleryOpen, setImageGalleryOpen] = useState(false);
  const [galleryBatchInfo, setGalleryBatchInfo] = useState<QcBatchAvatarInfo[]>([]);
  const [galleryTitle, setGalleryTitle] = useState('');
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
      setOrders(
        coreOrders.map((o) => ({
          ...o,
          batch_avatars: o.batch_avatars ?? [],
        }))
      );
      setLoading(false);

      void enrichQcOrdersWithImages(coreOrders).then((withImages) => {
        if (imageLoadGenerationRef.current !== loadGeneration) return;
        setOrders(
          withImages.map((o) => ({
            ...o,
            batch_avatars: o.batch_avatars ?? [],
          }))
        );
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
    
    // Pending = QC review queue (new picks + replacement picks) or never started; Partial = rework / awaiting picker.
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
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'partial': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'pending': return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default: return <AlertTriangle className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'partial': return 'bg-yellow-100 text-yellow-800';
      case 'pending': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const openBatchAvatarGallery = (orderNumber: string, batchAvatars: QcBatchAvatarInfo[]) => {
    setGalleryTitle(`Batches Assigned - Order ${orderNumber}`);
    setGalleryBatchInfo(batchAvatars);
    setImageGalleryOpen(true);
  };

  return (
    <ErpLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">QC</h1>
          <p className="text-muted-foreground mt-1">Review and QC picked orders</p>
        </div>

        <div className="flex items-center gap-3 max-w-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search orders or customers" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="w-full mb-4">
          <div
            className="erp-segmented-3 erp-segmented-3--stretch"
            data-idx={qcTabIdx}
            role="tablist"
            aria-label="QC order status"
          >
            <span className="erp-segmented-3__thumb" aria-hidden />
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'pending'}
              data-idx="0"
              className="erp-segmented-3__btn inline-flex items-center justify-center gap-1.5"
              onClick={() => setActiveTab('pending')}
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              QC review ({orders.filter(o => !o.is_fully_qc && (orderNeedsQcVerification(o) || o.qc_status === 'pending')).length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'partial'}
              data-idx="1"
              className="erp-segmented-3__btn inline-flex items-center justify-center gap-1.5"
              onClick={() => setActiveTab('partial')}
            >
              <Clock className="h-4 w-4 shrink-0" />
              Rework / pick ({orders.filter(o => !o.is_fully_qc && !orderNeedsQcVerification(o) && o.qc_status !== 'pending').length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'completed'}
              data-idx="2"
              className="erp-segmented-3__btn inline-flex items-center justify-center gap-1.5"
              onClick={() => setActiveTab('completed')}
            >
              <CheckCircle className="h-4 w-4 shrink-0" />
              Completed ({orders.filter(o => o.qc_status === 'completed').length})
            </button>
          </div>
        </div>

          <div className="space-y-4">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true" aria-label="Loading QC orders">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="overflow-hidden border-0 shadow-md rounded-xl">
                    <CardContent className="p-5 sm:p-6 animate-pulse">
                      <div className="h-6 w-40 rounded bg-muted mb-4" />
                      <div className="flex gap-6">
                        <div className="w-[40%] aspect-[3/4] rounded-xl bg-muted" />
                        <div className="flex-1 space-y-3">
                          <div className="h-4 w-full rounded bg-muted" />
                          <div className="h-4 w-3/4 rounded bg-muted" />
                          <div className="grid grid-cols-2 gap-2 pt-2">
                            <div className="h-14 rounded-lg bg-muted" />
                            <div className="h-14 rounded-lg bg-muted" />
                            <div className="h-14 rounded-lg bg-muted" />
                            <div className="h-14 rounded-lg bg-muted" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground">
                No {activeTab} orders found.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((o) => (
                  <Card key={o.order_id} className={`border-0 shadow-md hover:shadow-lg transition-all rounded-xl overflow-hidden ${o.qc_status === 'completed' ? 'opacity-75' : ''}`} onClick={() => {
                    // Only allow QC for non-completed orders
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
                  }}>
                    <CardContent className="p-5 sm:p-6">
                      {/* Order Number - Top */}
                      <div className="mb-4">
                        <div className="text-lg sm:text-xl font-bold text-slate-900">Order #: {o.order_number}</div>
                      </div>

                      <div className="flex flex-col md:flex-row gap-6 md:gap-8">
                        {/* Left Column: Product Image Panel */}
                        <div className="flex-shrink-0 w-full md:w-[40%]">
                          {/* Product Image Panel with Gradient - Portrait */}
                          <div className="rounded-xl overflow-hidden w-full aspect-[3/4] relative" style={{ background: 'linear-gradient(to bottom, rgb(239 246 255) 40%, rgb(241 245 249) 40%)' }}>
                            <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-5">
                              <img 
                                src={o.image_url || getOrderCardPlaceholderSrc()} 
                                alt={o.order_number}
                                className="max-h-[85%] max-w-[85%] object-contain"
                                onError={(e) => {
                                  const el = e.target as HTMLImageElement;
                                  if (el.src.endsWith(getOrderCardPlaceholderSrc())) {
                                    el.style.display = 'none';
                                    return;
                                  }
                                  el.src = getOrderCardPlaceholderSrc();
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Right Column: Order Info */}
                        <div className="flex-1 flex flex-col gap-4 min-w-0">
                          {/* Batches Assigned Section */}
                          <div className="mb-1">
                            <div className="text-sm font-semibold text-slate-900 mb-3">Batches Assigned:</div>
                            {o.batch_avatars && o.batch_avatars.length > 0 ? (
                              <div className="flex flex-col gap-2">
                                {o.batch_avatars.slice(0, 3).map((batchInfo, idx) => {
                                  const displayName =
                                    batchInfo.batch_leader_name?.trim() ||
                                    batchInfo.batch_name?.trim() ||
                                    'Batch leader';
                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      className="flex items-center gap-3 min-w-0 text-left rounded-lg -m-1 p-1 hover:bg-slate-50/80 transition-colors cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openBatchAvatarGallery(o.order_number, o.batch_avatars);
                                      }}
                                    >
                                      <Avatar className="w-12 h-12 border-2 border-slate-200 flex-shrink-0 shadow-sm">
                                        <AvatarImage
                                          src={batchInfo.avatar_url || undefined}
                                          alt={displayName}
                                        />
                                        <AvatarFallback className="bg-slate-200 text-slate-700 text-sm">
                                          {(batchInfo.batch_leader_name || batchInfo.batch_name || 'B')[0].toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                      <span className="text-sm font-medium text-slate-800 truncate" title={displayName}>
                                        {displayName}
                                      </span>
                                    </button>
                                  );
                                })}
                                {o.batch_avatars.length > 3 && (
                                  <button
                                    type="button"
                                    className="text-xs font-medium text-primary hover:underline text-left pl-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openBatchAvatarGallery(o.order_number, o.batch_avatars);
                                    }}
                                  >
                                    +{o.batch_avatars.length - 3} more batch{o.batch_avatars.length - 3 === 1 ? '' : 'es'}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground">No batches assigned</div>
                            )}
                          </div>

                          {/* Product Category Badge - Full Width */}
                          {o.product_category && (
                            <div className="mb-2">
                              <Badge className="bg-blue-100 text-blue-800 text-sm px-4 py-2 rounded-lg w-full justify-center">
                                Product Category: {o.product_category}
                              </Badge>
                            </div>
                          )}

                          {/* Quantity Badges - Grid Layout */}
                          <div className="flex flex-col gap-2 mt-auto">
                            {/* Second Row: Total Qty and Picked Qty */}
                            <div className="grid grid-cols-2 gap-2">
                              <Badge className="bg-purple-100 text-purple-800 text-sm px-4 py-2 rounded-full w-full justify-center">
                                Total Qty: {o.total_quantity} Pcs
                              </Badge>
                              <Badge className="bg-yellow-100 text-orange-700 text-sm px-4 py-2 rounded-full w-full justify-center">
                                Picked: {o.picked_quantity} Pcs
                              </Badge>
                            </div>
                            {/* Third Row: Approved and Rejected */}
                            <div className="grid grid-cols-2 gap-2">
                              <Badge className="bg-green-100 text-green-800 text-sm px-4 py-2 rounded-full w-full justify-center">
                                Approved: {o.approved_quantity} Pcs
                              </Badge>
                              <Badge className="bg-red-100 text-red-800 text-sm px-4 py-2 rounded-full w-full justify-center">
                                Rejected: {o.rejected_quantity || 0} Pcs
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                      {o.qc_status === 'completed' && (
                        <div className="mt-4 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                          ✓ QC Completed - All batches reviewed
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

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

        {/* Image Gallery Dialog */}
        <Dialog open={imageGalleryOpen} onOpenChange={setImageGalleryOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{galleryTitle}</DialogTitle>
            </DialogHeader>
            {galleryBatchInfo.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No batch avatars available.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-4">
                {galleryBatchInfo.map((batchInfo, idx) => (
                  <div key={idx} className="flex flex-col items-center gap-2">
                    <div className="relative w-24 h-24">
                      <Avatar className="w-full h-full border-2 border-slate-200">
                        <AvatarImage 
                          src={batchInfo.avatar_url || undefined} 
                          alt={batchInfo.batch_name || `Batch ${idx + 1}`}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                        <AvatarFallback className="text-lg bg-slate-200 text-slate-700">
                          {(batchInfo.batch_name || batchInfo.batch_leader_name || 'B')[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    {batchInfo.batch_name && (
                      <div className="text-sm font-medium text-slate-900 text-center">{batchInfo.batch_name}</div>
                    )}
                    {batchInfo.batch_leader_name && (
                      <div className="text-xs text-muted-foreground text-center">{batchInfo.batch_leader_name}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </ErpLayout>
  );
}


