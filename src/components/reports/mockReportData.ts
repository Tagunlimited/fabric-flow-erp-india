import {
  subDays,
  format,
} from 'date-fns';
import type { ReportRow, ReportType } from './types';

const TYPES: ReportType[] = [
  'sales',
  'pending_payment',
  'receipt',
  'cutting_master',
  'additional',
];

const STATUS_ROT = ['completed', 'pending', 'overdue', 'cancelled'] as const;

const descriptions: Record<ReportType, string[]> = {
  tailor_payment: ['Stitching batch payout', 'Piece-rate settlement', 'Advance adjustment'],
  sales: ['Custom order — corporate', 'Retail invoice', 'B2B shipment'],
  pending_payment: ['Invoice due — net 30', 'Partial payment pending', 'Credit hold'],
  receipt: ['Advance against order', 'Bank UPI receipt', 'Cash deposit'],
  cutting_master: ['Pattern lot CM-12', 'Marker revision batch', 'Fabric yield audit'],
  additional: ['Placeholder metric', 'Cross-module summary', 'Reserved slot'],
};

const refs: Record<ReportType, string> = {
  tailor_payment: 'TP',
  sales: 'SO',
  pending_payment: 'AR',
  receipt: 'RC',
  cutting_master: 'CM',
  additional: 'EX',
};

/** Deterministic mock dataset for the reports hub (replace with real queries later). */
export function buildMockReportRows(): ReportRow[] {
  const rows: ReportRow[] = [];
  const base = new Date();

  for (let i = 0; i < 36; i++) {
    const type = TYPES[i % TYPES.length];
    const d = subDays(base, i % 120);
    const status = STATUS_ROT[i % STATUS_ROT.length];
    const amount =
      type === 'additional'
        ? undefined
        : Math.round((5000 + (i * 1373) % 250000) / 100) * 100;

    rows.push({
      id: `mock-${i}-${type}`,
      type,
      date: format(d, 'yyyy-MM-dd'),
      amount,
      status,
      reference: `${refs[type]}-${2025 + (i % 2)}-${String(1000 + i).slice(1)}`,
      description: descriptions[type][i % descriptions[type].length],
      meta:
        type === 'cutting_master'
          ? `Master: ${['R. Kumar', 'A. Singh', 'P. Das'][i % 3]}`
          : type === 'tailor_payment'
            ? `Tailor ID: T-${100 + (i % 20)}`
            : type === 'sales'
              ? `Customer ref C-${200 + (i % 50)}`
              : undefined,
    });
  }

  return rows;
}
