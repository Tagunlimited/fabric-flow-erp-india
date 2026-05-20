import { useState } from 'react';
import { format } from 'date-fns';
import type { DateRange as DayPickerDateRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarRange } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DateRangePreset, ReportDateRange } from './types';
import { normalizeDayRange, rangeForPreset } from './dateRangeUtils';

/** Presets shown in the popover sidebar (matches reference wording). */
const SIDEBAR_PRESETS: { id: DateRangePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'last7', label: 'Last 7 Days' },
  { id: 'last30', label: 'Last 30 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'this_year', label: 'This Year' },
];

interface DateRangeFilterProps {
  value: ReportDateRange;
  onChange: (next: ReportDateRange) => void;
  className?: string;
  /** `toolbar` = single trigger button only (for control bar). */
  variant?: 'toolbar' | 'full';
}

function labelForRange(value: ReportDateRange): string {
  const { from, to, preset } = value;
  if (!from || !to) return 'Select date range';
  if (preset !== 'custom') {
    const p = SIDEBAR_PRESETS.find((x) => x.id === preset);
    if (p) return p.label;
  }
  return `${format(from, 'dd MMM yyyy')} – ${format(to, 'dd MMM yyyy')}`;
}

export function DateRangeFilter({ value, onChange, className, variant = 'full' }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayPickerDateRange | undefined>(() =>
    value.from && value.to ? { from: value.from, to: value.to } : undefined
  );

  const applyPreset = (preset: DateRangePreset) => {
    if (preset === 'custom') return;
    const { from, to } = rangeForPreset(preset);
    onChange({ from, to, preset });
    setDraft({ from, to });
    setOpen(false);
  };

  const popoverInner = (
    <div className="flex max-h-[min(85vh,640px)] flex-col sm:max-h-none sm:flex-row">
      <div className="flex shrink-0 flex-col gap-0.5 border-b border-border p-3 sm:w-[168px] sm:border-b-0 sm:border-r">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick select</p>
        {SIDEBAR_PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              'h-9 justify-start px-2 text-left text-sm font-normal',
              value.preset === p.id ? 'bg-primary/10 font-medium text-primary' : 'text-foreground hover:bg-muted'
            )}
            onClick={() => applyPreset(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto p-2 sm:p-3">
        <Calendar
          mode="range"
          captionLayout="buttons"
          weekStartsOn={0}
          numberOfMonths={2}
          selected={draft}
          onSelect={(r) => {
            setDraft(r);
            if (r?.from && r?.to) {
              const norm = normalizeDayRange(r.from, r.to);
              onChange({ from: norm.from, to: norm.to, preset: 'custom' });
            }
          }}
          initialFocus
          className="mx-auto"
        />
        <div className="mt-2 flex justify-end gap-2 border-t border-border pt-2">
          <Button type="button" size="sm" variant="outline" className="text-xs" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );

  if (variant === 'toolbar') {
    return (
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o && value.from && value.to) {
            setDraft({ from: value.from, to: value.to });
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              'h-9 shrink-0 gap-2 rounded-lg border-border bg-background px-3 text-sm font-medium text-foreground shadow-sm hover:bg-muted/50',
              className
            )}
            aria-label="Select date range"
          >
            <CalendarRange className="h-4 w-4 text-primary" aria-hidden />
            Select date range
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto max-w-[calc(100vw-1rem)] border-border p-0 shadow-lg" align="end">
          {popoverInner}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o && value.from && value.to) {
            setDraft({ from: value.from, to: value.to });
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2 rounded-lg border-border bg-background text-sm font-medium shadow-sm"
            aria-label="Open date range picker"
          >
            <CalendarRange className="h-4 w-4 text-primary" aria-hidden />
            {labelForRange(value)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto max-w-[calc(100vw-1rem)] border-border p-0 shadow-lg" align="start">
          {popoverInner}
        </PopoverContent>
      </Popover>
    </div>
  );
}
