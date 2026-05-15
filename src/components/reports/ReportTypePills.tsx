import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { ReportType } from './types';

export interface ReportPillItem {
  type: ReportType;
  pillLabel: string;
  icon: LucideIcon;
}

interface ReportTypePillsProps {
  items: ReportPillItem[];
  selectedType: ReportType;
  onSelect: (type: ReportType) => void;
  className?: string;
}

export function ReportTypePills({ items, selectedType, onSelect, className }: ReportTypePillsProps) {
  return (
    <div
      className={cn('flex flex-wrap gap-2', className)}
      role="tablist"
      aria-label="Report types"
    >
      {items.map((def) => {
        const Icon = def.icon;
        const selected = selectedType === def.type;
        return (
          <button
            key={def.type}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(def.type)}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              selected
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-border bg-muted/50 text-foreground hover:border-primary/45 hover:bg-muted'
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
            <span className="whitespace-nowrap">{def.pillLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
