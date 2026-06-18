import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getOrderCardPlaceholderSrc, getOrderItemListThumbnailUrl } from '@/utils/orderItemImageUtils';
import { selectedColorsDisplayText } from '@/utils/bomSelectedColors';
import {
  Building2,
  Calendar,
  ChevronDown,
  ChevronUp,
  Edit,
  Layers,
  Shirt,
  UserPlus,
  Users,
} from 'lucide-react';

export interface CuttingJobMobileCardJob {
  id: string;
  orderNumber: string;
  customerName: string;
  productName: string;
  fabricType?: string;
  quantity: number;
  cutQuantity: number;
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed' | 'on_hold' | 'quality_check';
  assignedTo?: string;
  cuttingMasterAvatarUrl?: string;
  cuttingMasters?: Array<{
    id: string;
    name: string;
    avatarUrl?: string;
  }>;
  batchAssignments?: Array<{
    id: string;
    batch_name: string;
    batch_leader_name?: string;
    batch_leader_avatar_url?: string;
    total_quantity?: number;
    size_distributions?: Array<{
      size_name: string;
      quantity: number;
      picked_quantity?: number;
      left_quantity?: number;
    }>;
  }>;
  orderItems?: Array<{
    gsm?: string;
    color?: string;
    fabric?: { fabric_name?: string; gsm?: string; color?: string; image?: string };
    product_category?: { category_image_url?: string };
    category_image_url?: string;
    selected_colors?: unknown;
  }>;
}

interface CuttingJobMobileCardProps {
  job: CuttingJobMobileCardJob;
  expanded: boolean;
  compact: boolean;
  onToggle: () => void;
  completionPercentage: number;
  progressBarColor: string;
  statusColorClass: string;
  formatDate: (value?: string) => string;
  onAssignBatch: () => void;
  onReassignBatch: (assignment: NonNullable<CuttingJobMobileCardJob['batchAssignments']>[number]) => void;
  canReassignBatch: (assignment: NonNullable<CuttingJobMobileCardJob['batchAssignments']>[number]) => boolean;
  onViewOrder: () => void;
  onAddCutQty: () => void;
  onReassignMaster?: () => void;
  onGeneratePdf?: () => void;
  generatingPdf?: boolean;
  variant?: 'active' | 'completed';
}

function getJobThumbnail(job: CuttingJobMobileCardJob): string {
  const firstItem = job.orderItems?.[0];
  if (!firstItem) return getOrderCardPlaceholderSrc();
  const url =
    getOrderItemListThumbnailUrl(firstItem) ||
    firstItem.product_category?.category_image_url ||
    firstItem.fabric?.image ||
    null;
  return url || getOrderCardPlaceholderSrc();
}

function getProductLine(job: CuttingJobMobileCardJob): string {
  const firstItem = job.orderItems?.[0];
  const gsm = firstItem?.gsm || firstItem?.fabric?.gsm;
  const base = job.productName || 'Product';
  return gsm ? `${base} - ${gsm} GSM` : base;
}

function getFabricLine(job: CuttingJobMobileCardJob): string {
  if (job.fabricType && job.fabricType !== '-') return job.fabricType;
  const firstItem = job.orderItems?.[0];
  const fabric = firstItem?.fabric;
  if (!fabric?.fabric_name) return '';
  const color = selectedColorsDisplayText(
    (firstItem as { selected_colors?: unknown }).selected_colors,
    firstItem.color || fabric.color
  );
  const gsm = fabric.gsm || firstItem.gsm;
  const gsmPart = gsm ? ` - ${gsm} GSM` : '';
  const colorPart = color ? `, ${color}` : '';
  return `${fabric.fabric_name}${gsmPart}${colorPart}`;
}

function getPrimaryMaster(job: CuttingJobMobileCardJob) {
  if (job.cuttingMasters && job.cuttingMasters.length > 0) {
    return {
      name: job.cuttingMasters[0].name,
      avatarUrl: job.cuttingMasters[0].avatarUrl,
    };
  }
  if (job.assignedTo) {
    return { name: job.assignedTo, avatarUrl: job.cuttingMasterAvatarUrl };
  }
  return null;
}

function formatStatusLabel(status: CuttingJobMobileCardJob['status']) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function ProgressRow({
  percentage,
  cutQuantity,
  quantity,
  progressBarColor,
  compact = false,
}: {
  percentage: number;
  cutQuantity: number;
  quantity: number;
  progressBarColor: string;
  compact?: boolean;
}) {
  const cutDisplay = typeof cutQuantity === 'number' ? cutQuantity.toFixed(0) : cutQuantity;
  const qtyDisplay = typeof quantity === 'number' ? quantity.toFixed(0) : quantity;

  return (
    <div className={cn('flex items-center gap-2', compact ? 'mt-1' : 'mt-3')}>
      <span
        className={cn(
          'shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-semibold tabular-nums',
          percentage < 30 && 'border-red-200 bg-red-50 text-red-700',
          percentage >= 30 && percentage < 70 && 'border-amber-200 bg-amber-50 text-amber-700',
          percentage >= 70 && 'border-emerald-200 bg-emerald-50 text-emerald-700'
        )}
      >
        {percentage}%
      </span>
      <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-200">
        <div
          className={cn('h-full rounded-full transition-all duration-300', progressBarColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 tabular-nums">
        {cutDisplay} / {qtyDisplay} pcs
      </span>
    </div>
  );
}

export function CuttingJobMobileCard({
  job,
  expanded,
  compact,
  onToggle,
  completionPercentage,
  progressBarColor,
  statusColorClass,
  formatDate,
  onAssignBatch,
  onReassignBatch,
  canReassignBatch,
  onViewOrder,
  onAddCutQty,
  onReassignMaster,
  onGeneratePdf,
  generatingPdf = false,
  variant = 'active',
}: CuttingJobMobileCardProps) {
  const thumbnail = getJobThumbnail(job);
  const productLine = getProductLine(job);
  const fabricLine = getFabricLine(job);
  const master = getPrimaryMaster(job);
  const batchCount = job.batchAssignments?.length ?? 0;
  const statusLabel = formatStatusLabel(job.status);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  if (compact) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="w-full rounded-xl border border-border/80 bg-card p-4 text-left shadow-sm transition-colors active:bg-muted/40"
      >
        <div className="flex gap-3">
          <img
            src={thumbnail}
            alt=""
            className="h-[72px] w-[72px] shrink-0 rounded-lg object-cover bg-muted"
            onError={(e) => {
              e.currentTarget.src = getOrderCardPlaceholderSrc();
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <span className="truncate text-sm font-semibold">{job.orderNumber}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
            <ProgressRow
              percentage={completionPercentage}
              cutQuantity={job.cutQuantity}
              quantity={job.quantity}
              progressBarColor={progressBarColor}
              compact
            />
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden',
        expanded && 'ring-1 ring-primary/20'
      )}
    >
      <button type="button" onClick={onToggle} className="w-full p-4 text-left active:bg-muted/30">
        <div className="flex gap-3.5">
          <img
            src={thumbnail}
            alt=""
            className="h-[100px] w-[100px] shrink-0 rounded-xl object-cover bg-muted"
            onError={(e) => {
              e.currentTarget.src = getOrderCardPlaceholderSrc();
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-bold leading-tight">{job.orderNumber}</span>
              {expanded ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </div>
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{job.customerName || '—'}</span>
              </div>
              <div className="flex items-start gap-1.5 text-xs font-medium text-foreground">
                <Shirt className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                <span className="line-clamp-2 leading-snug">{productLine}</span>
              </div>
              {fabricLine ? (
                <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Layers className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span className="line-clamp-2 leading-snug">{fabricLine}</span>
                </div>
              ) : null}
            </div>
            {expanded && (
              <Badge className={cn('mt-2 h-6 rounded-full px-2.5 text-[11px] font-medium', statusColorClass)}>
                {statusLabel}
              </Badge>
            )}
          </div>
        </div>

        <ProgressRow
          percentage={completionPercentage}
          cutQuantity={job.cutQuantity}
          quantity={job.quantity}
          progressBarColor={progressBarColor}
        />

        {!expanded && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <Badge className={cn('h-6 rounded-full px-2.5 text-[11px] font-medium', statusColorClass)}>
              {statusLabel}
            </Badge>
            {master ? (
              <div className="flex items-center gap-1.5 min-w-0">
                <Avatar className="h-7 w-7 shrink-0">
                  <AvatarImage src={master.avatarUrl} alt={master.name} />
                  <AvatarFallback className="bg-blue-100 text-blue-700 text-[10px]">
                    {master.name?.charAt(0)?.toUpperCase() || 'M'}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-xs font-medium">{master.name}</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Unassigned</span>
            )}
          </div>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/60 px-4 pb-4 space-y-4">
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-center">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Order #</p>
              <p className="mt-1 text-xs font-semibold break-all">{job.orderNumber}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Product</p>
              <p className="mt-1 text-xs font-semibold leading-snug line-clamp-3">{productLine}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Fabric</p>
              <p className="mt-1 text-xs font-semibold leading-snug line-clamp-3">{fabricLine || '—'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-center">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Cutting Master</p>
              {master ? (
                <div className="mt-1 flex flex-col items-center gap-1">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={master.avatarUrl} alt={master.name} />
                    <AvatarFallback className="bg-blue-100 text-blue-700 text-[10px]">
                      {master.name?.charAt(0)?.toUpperCase() || 'M'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-[11px] font-medium leading-tight">{master.name}</span>
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">—</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Progress</p>
              <p className="mt-1 text-xs font-semibold tabular-nums">
                {job.cutQuantity}/{job.quantity} pcs
              </p>
              <p className="text-[11px] text-muted-foreground">{completionPercentage}%</p>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Progress</span>
              <span className="text-sm font-bold tabular-nums">{completionPercentage}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-gray-200">
              <div
                className={cn('h-full rounded-full transition-all duration-300', progressBarColor)}
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {job.cutQuantity} of {job.quantity} pieces completed
            </p>
          </div>

          {(variant === 'active' || (job.batchAssignments && job.batchAssignments.length > 0)) && (
            <div>
              <p className="mb-2 text-sm font-semibold">
                Assigned Batches {batchCount > 0 ? `(${batchCount})` : ''}
              </p>
              <div className="space-y-2">
                {job.batchAssignments?.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold uppercase tracking-wide text-emerald-800">
                          {assignment.batch_leader_name || assignment.batch_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {assignment.total_quantity ?? 0} pieces
                        </p>
                      </div>
                      {variant === 'active' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0 border-orange-200 text-orange-600 hover:bg-orange-50"
                          disabled={!canReassignBatch(assignment)}
                          onClick={(e) => {
                            stop(e);
                            onReassignBatch(assignment);
                          }}
                        >
                          Reassign
                        </Button>
                      )}
                    </div>
                    {assignment.size_distributions && assignment.size_distributions.length > 0 && (
                      <div className="mt-2">
                        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                          Size-wise breakdown:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {assignment.size_distributions.map((sd) => (
                            <span
                              key={sd.size_name}
                              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700"
                            >
                              {sd.size_name}: {sd.quantity || 0}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {variant === 'active' && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-dashed border-blue-300 text-blue-600 hover:bg-blue-50"
                    onClick={(e) => {
                      stop(e);
                      onAssignBatch();
                    }}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    {batchCount > 0 ? 'Add More Batches' : 'Assign Batches'}
                  </Button>
                )}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold">Status</p>
            <Badge className={cn('h-7 rounded-full px-3 text-xs font-medium', statusColorClass)}>
              {statusLabel}
            </Badge>
          </div>

          {variant === 'active' && (
            <Button
              type="button"
              variant="outline"
              className="w-full h-10"
              onClick={(e) => {
                stop(e);
                onAddCutQty();
              }}
            >
              <Edit className="mr-2 h-4 w-4" />
              Add Cut Qty
            </Button>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={(e) => {
                stop(e);
                onViewOrder();
              }}
            >
              <Calendar className="mr-2 h-4 w-4" />
              {formatDate(job.dueDate) || 'Calendar'}
            </Button>
            {variant === 'active' ? (
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={(e) => {
                  stop(e);
                  (onReassignMaster ?? onAddCutQty)();
                }}
              >
                <Users className="mr-2 h-4 w-4" />
                Reassign
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-10"
                disabled={generatingPdf}
                onClick={(e) => {
                  stop(e);
                  (onGeneratePdf ?? onViewOrder)();
                }}
              >
                <Users className="mr-2 h-4 w-4" />
                {generatingPdf ? 'Generating…' : 'PDF'}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
