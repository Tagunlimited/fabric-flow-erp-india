import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingDown, TrendingUp } from 'lucide-react';

export interface StatsCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  /** Colored icon container (Tailwind classes). */
  iconClassName?: string;
  trend?: { percent: number; positive: boolean };
  className?: string;
}

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconClassName = 'bg-muted text-muted-foreground',
  trend,
  className,
}: StatsCardProps) {
  return (
    <Card
      className={cn(
        'overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm transition-shadow hover:shadow-md',
        className
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 pt-5">
        <div className="space-y-1">
          <CardTitle className="text-sm font-medium leading-none text-muted-foreground">{title}</CardTitle>
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', iconClassName)}>
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </CardHeader>
      <CardContent className="pb-5 pt-0">
        <div className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</div>
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
        {trend ? (
          <p
            className={cn(
              'mt-2 flex items-center gap-1 text-xs font-semibold',
              trend.positive ? 'text-success' : 'text-destructive'
            )}
          >
            {trend.positive ? (
              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" aria-hidden />
            )}
            <span>{Math.abs(trend.percent).toFixed(1)}%</span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
