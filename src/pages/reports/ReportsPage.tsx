import { useEffect, useMemo, useState } from 'react';
import { format, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns';
import { LayoutGrid, Receipt, Scissors, Shirt, TrendingUp, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ReportTypePills, type ReportPillItem } from '@/components/reports/ReportTypePills';
import { DateRangeFilter } from '@/components/reports/DateRangeFilter';
import { ExportButtons } from '@/components/reports/ExportButtons';
import { ReportTable, type ReportSortKey } from '@/components/reports/ReportTable';
import { ReportsHubSearchBar } from '@/components/reports/ReportsHubSearchBar';
import { buildMockReportRows } from '@/components/reports/mockReportData';
import { rangeForPreset } from '@/components/reports/dateRangeUtils';
import type { DateRangePreset, ReportDateRange, ReportRow, ReportStatus, ReportType } from '@/components/reports/types';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

const MOCK = buildMockReportRows();

const REPORT_DEFS: {
  type: ReportType;
  title: string;
  pillLabel: string;
  icon: typeof Shirt;
}[] = [
  {
    type: 'tailor_payment',
    title: 'Tailor Payment Report',
    pillLabel: 'Tailor payments',
    icon: Shirt,
  },
  {
    type: 'sales',
    title: 'Sales Report',
    pillLabel: 'Sales',
    icon: TrendingUp,
  },
  {
    type: 'pending_payment',
    title: 'Pending Payment Report',
    pillLabel: 'Pending',
    icon: Clock,
  },
  {
    type: 'receipt',
    title: 'Receipt Report',
    pillLabel: 'Receipts',
    icon: Receipt,
  },
  {
    type: 'cutting_master',
    title: 'Cutting Masters Report',
    pillLabel: 'Cutting',
    icon: Scissors,
  },
  {
    type: 'additional',
    title: 'Additional Reports',
    pillLabel: 'More',
    icon: LayoutGrid,
  },
];

const PILL_ITEMS: ReportPillItem[] = REPORT_DEFS.map(({ type, pillLabel, icon }) => ({
  type,
  pillLabel,
  icon,
}));

function statusLabel(status: ReportRow['status']): string {
  if (status === 'pending') return 'In Progress';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatExportAmount(row: ReportRow, reportType: ReportType): string {
  if (reportType === 'cutting_master') {
    const pcs = row.amount != null ? Math.max(1, Math.round(row.amount / 100)) : 0;
    return `${pcs.toLocaleString('en-IN')} pcs`;
  }
  if (row.amount == null) return '';
  return INR.format(row.amount);
}

function toExportRows(rows: ReportRow[], reportType: ReportType) {
  return rows.map((r) => ({
    Reference: r.reference,
    Date: r.date,
    Description: r.description,
    Amount: formatExportAmount(r, reportType),
    Status: statusLabel(r.status),
  }));
}

const PRESET_LABELS: Partial<Record<DateRangePreset, string>> = {
  today: 'Today',
  last7: 'Last 7 Days',
  last30: 'Last 30 Days',
  this_week: 'This week',
  this_month: 'This Month',
  this_quarter: 'This quarter',
  this_year: 'This Year',
};

function dateRangeSummary(dr: ReportDateRange): string {
  if (!dr.from || !dr.to) return '';
  if (dr.preset !== 'custom' && PRESET_LABELS[dr.preset]) {
    return PRESET_LABELS[dr.preset]!;
  }
  return `${format(dr.from, 'dd MMM yyyy')} – ${format(dr.to, 'dd MMM yyyy')}`;
}

const ReportsPage = () => {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<ReportType>('cutting_master');
  const initialRange = useMemo(() => {
    const { from, to } = rangeForPreset('this_month');
    return { from, to, preset: 'this_month' as const };
  }, []);
  const [dateRange, setDateRange] = useState<ReportDateRange>(initialRange);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReportStatus>('all');
  const [sortKey, setSortKey] = useState<ReportSortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const handleSort = (key: ReportSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'amount' ? 'desc' : 'asc');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const { from, to } = dateRange;
    if (!from || !to) return [];

    const start = startOfDay(from);
    const end = endOfDay(to);

    return MOCK.filter((row) => {
      if (row.type !== selectedType) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      const d = parseISO(row.date);
      if (!isWithinInterval(d, { start, end })) return false;
      if (q) {
        const blob = `${row.reference} ${row.description} ${row.meta ?? ''}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [selectedType, statusFilter, dateRange, search]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [filtered.length, pageSize]);

  const exportRows = useMemo(() => toExportRows(filtered, selectedType), [filtered, selectedType]);

  const selectedTitle = REPORT_DEFS.find((d) => d.type === selectedType)?.title ?? 'Report';

  return (
    <main className="w-full max-w-none space-y-4 bg-background p-4 sm:p-5 lg:p-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Reports Dashboard</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            Comprehensive reporting hub for all business operations.
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Report type</p>
          <ReportTypePills
            items={PILL_ITEMS}
            selectedType={selectedType}
            onSelect={(type) => {
              if (type === 'tailor_payment') {
                navigate('/reports/tailor-payments');
                return;
              }
              setSelectedType(type);
              setPage(1);
            }}
          />
        </div>
      </header>

      <section aria-label="Report detail">
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {/* Report table header (title + entries) alongside toolbar — same row on large screens */}
          <div className="flex flex-col gap-4 border-b border-border p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
            <div className="flex min-w-0 flex-col gap-2 lg:max-w-[min(100%,22rem)] lg:shrink-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="text-lg font-bold leading-tight text-foreground sm:text-xl">{selectedTitle}</h2>
                <p className="shrink-0 text-sm text-muted-foreground">
                  <span className="tabular-nums font-medium text-foreground">{filtered.length}</span> entries
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Date range:{' '}
                <span className="font-medium text-foreground">{dateRangeSummary(dateRange)}</span>
              </p>
            </div>

            <div className="flex min-w-0 flex-1">
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-2">
                <ReportsHubSearchBar
                  value={search}
                  onChange={setSearch}
                  placeholder="Search reports..."
                  className="w-full min-w-0 sm:min-w-[12rem] sm:flex-1"
                />
                <DateRangeFilter variant="toolbar" value={dateRange} onChange={setDateRange} />
                <ExportButtons rows={exportRows} baseFilename={`report-${selectedType}`} />
                <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
                  <span className="text-xs font-medium text-muted-foreground">Status</span>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | ReportStatus)}>
                    <SelectTrigger
                      className="h-8 w-[min(100%,10rem)] rounded-lg border-border text-xs sm:w-[150px]"
                      aria-label="Filter by status"
                    >
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="pending">In Progress</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-[min(480px,calc(100dvh-15rem))] max-h-[calc(100dvh-12rem)] overflow-auto px-4 pb-4 pt-3 sm:px-5">
            <ReportTable
              embedded
              rows={filtered}
              reportType={selectedType}
              sortKey={sortKey}
              sortDir={sortDir}
              onSortChange={handleSort}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
            />
          </div>
        </div>
      </section>
    </main>
  );
};

export default ReportsPage;
