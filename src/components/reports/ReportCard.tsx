import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export interface ReportCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  metricLabel: string;
  metricValue: string;
  selected: boolean;
  onSelect: () => void;
}

export function ReportCard({
  title,
  description,
  icon: Icon,
  metricLabel,
  metricValue,
  selected,
  onSelect,
}: ReportCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-pressed={selected}
      aria-label={`Open report: ${title}`}
      className={cn(
        'flex cursor-pointer flex-col rounded-xl border bg-card p-5 shadow-sm transition-all duration-200',
        'hover:border-primary/35 hover:shadow-md',
        selected
          ? 'border-[3px] border-primary shadow-md ring-1 ring-primary/20'
          : 'border-border/90'
      )}
    >
      <div className="flex flex-row items-start gap-3">
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border',
            selected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-muted/60 text-foreground'
          )}
        >
          <Icon className="h-6 w-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <h3 className="text-base font-bold leading-tight text-foreground">{title}</h3>
          <p className="text-sm leading-snug text-muted-foreground">{description}</p>
        </div>
      </div>
      <Separator className="my-4 bg-border" />
      <div>
        <p className="text-xs font-medium text-muted-foreground">{metricLabel}</p>
        <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-foreground">{metricValue}</p>
      </div>
    </div>
  );
}
