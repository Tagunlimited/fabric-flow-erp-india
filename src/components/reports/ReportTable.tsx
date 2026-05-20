import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ReportRow, ReportType } from './types';

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export type ReportSortKey = 'date' | 'reference' | 'amount' | 'status' | 'description';

export interface ReportTableProps {
  rows: ReportRow[];
  reportType: ReportType;
  sortKey: ReportSortKey;
  sortDir: 'asc' | 'desc';
  onSortChange: (key: ReportSortKey) => void;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  /** When true, table sits inside a parent card (no outer card chrome). */
  embedded?: boolean;
}

function statusLabel(status: ReportRow['status']): string {
  if (status === 'pending') return 'In Progress';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClass(status: ReportRow['status']) {
  switch (status) {
    case 'completed':
      return 'text-foreground font-medium';
    case 'pending':
      return 'text-primary font-medium';
    case 'overdue':
      return 'text-manufacturing font-medium';
    case 'cancelled':
    default:
      return 'text-muted-foreground';
  }
}

function formatAmountCell(row: ReportRow, reportType: ReportType): string {
  if (reportType === 'cutting_master') {
    const pcs = row.amount != null ? Math.max(1, Math.round(row.amount / 100)) : 0;
    return `${pcs.toLocaleString('en-IN')} pcs`;
  }
  if (row.amount == null) return '—';
  return INR.format(row.amount);
}

export function ReportTable({
  rows,
  reportType,
  sortKey,
  sortDir,
  onSortChange,
  page,
  pageSize,
  onPageChange,
  embedded = false,
}: ReportTableProps) {
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      switch (sortKey) {
        case 'date':
          va = parseISO(a.date).getTime();
          vb = parseISO(b.date).getTime();
          break;
        case 'amount':
          va = a.amount ?? 0;
          vb = b.amount ?? 0;
          break;
        case 'reference':
          va = a.reference;
          vb = b.reference;
          break;
        case 'status':
          va = a.status;
          vb = b.status;
          break;
        case 'description':
          va = a.description;
          vb = b.description;
          break;
        default:
          return 0;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const SortHead = ({ col, label }: { col: ReportSortKey; label: string }) => {
    const active = sortKey === col;
    return (
      <TableHead className="whitespace-nowrap bg-muted/70 px-4 py-3 text-left font-semibold text-foreground">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-sm hover:text-primary"
          onClick={() => onSortChange(col)}
          aria-label={`Sort by ${label}`}
        >
          {label}
          {active ? (
            sortDir === 'asc' ? (
              <ArrowUp className="h-3.5 w-3.5 opacity-70" />
            ) : (
              <ArrowDown className="h-3.5 w-3.5 opacity-70" />
            )
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-35" />
          )}
        </button>
      </TableHead>
    );
  };

  return (
    <div className={cn('space-y-4', embedded && 'pt-1')}>
      <div
        className={cn(
          'overflow-x-auto overflow-hidden',
          embedded
            ? 'border-0 bg-transparent shadow-none'
            : 'rounded-xl border border-border bg-card shadow-sm'
        )}
      >
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border hover:bg-transparent">
              <SortHead col="reference" label="Reference" />
              <SortHead col="date" label="Date" />
              <SortHead col="description" label="Description" />
              <SortHead col="amount" label="Amount" />
              <SortHead col="status" label="Status" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-28 text-center text-sm text-muted-foreground">
                  No rows match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow key={row.id} className="border-b border-border/80 hover:bg-muted/25">
                  <TableCell className="px-4 py-3 font-medium text-foreground">{row.reference}</TableCell>
                  <TableCell className="px-4 py-3 tabular-nums text-sm text-foreground">
                    {format(parseISO(row.date), 'yyyy-MM-dd')}
                  </TableCell>
                  <TableCell className="max-w-[280px] px-4 py-3 text-sm text-foreground">{row.description}</TableCell>
                  <TableCell className="px-4 py-3 text-sm tabular-nums text-foreground">
                    {formatAmountCell(row, reportType)}
                  </TableCell>
                  <TableCell className={cn('px-4 py-3 text-sm capitalize', statusClass(row.status))}>
                    {statusLabel(row.status)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          Showing{' '}
          <span className="font-medium text-foreground">
            {sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–{Math.min(sorted.length, safePage * pageSize)}
          </span>{' '}
          of <span className="font-medium text-foreground">{sorted.length}</span>
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg border-border text-xs"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page <span className="font-medium text-foreground">{safePage}</span> / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg border-border text-xs"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
