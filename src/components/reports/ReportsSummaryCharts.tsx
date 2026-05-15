import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReportRow } from './types';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

interface ReportsSummaryChartsProps {
  rows: ReportRow[];
}

export function ReportsSummaryCharts({ rows }: ReportsSummaryChartsProps) {
  const byMonth = useMemo(() => {
    const map = new Map<string, { month: string; amount: number; count: number }>();
    for (const r of rows) {
      if (r.amount == null) continue;
      const d = parseISO(r.date);
      const key = format(d, 'yyyy-MM');
      const label = format(d, 'MMM yyyy');
      const cur = map.get(key) || { month: label, amount: 0, count: 0 };
      cur.amount += r.amount;
      cur.count += 1;
      map.set(key, cur);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({ ...v }));
  }, [rows]);

  const statusMix = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of rows) {
      acc[r.status] = (acc[r.status] || 0) + 1;
    }
    return Object.entries(acc).map(([name, value]) => ({ name, value }));
  }, [rows]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-border shadow-erp-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-primary">Amount by month</CardTitle>
          <CardDescription className="text-xs">Filtered dataset — swap for live aggregates later.</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px] pt-0">
          {byMonth.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No amounts in range for chart.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v) => (v >= 100000 ? `₹${Math.round(v / 1000)}k` : `₹${v}`)}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: 'hsl(var(--border))',
                    background: 'hsl(var(--card))',
                  }}
                  formatter={(value: number) => [INR.format(value), 'Amount']}
                />
                <Bar dataKey="amount" name="Amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-erp-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-primary">Rows by status</CardTitle>
          <CardDescription className="text-xs">Uses warning / manufacturing tokens for pending & overdue.</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px] pt-0">
          {statusMix.length === 0 ? (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No data.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusMix} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={88}
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v) => String(v).replace(/^\w/, (c) => c.toUpperCase())}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: 'hsl(var(--border))',
                    background: 'hsl(var(--card))',
                  }}
                />
                <Bar
                  dataKey="value"
                  name="Rows"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={22}
                  fill="hsl(var(--brand-gold))"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
