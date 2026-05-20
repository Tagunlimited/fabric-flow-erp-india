export type ReportType =
  | 'tailor_payment'
  | 'sales'
  | 'pending_payment'
  | 'receipt'
  | 'cutting_master'
  | 'additional';

export type ReportStatus = 'completed' | 'pending' | 'cancelled' | 'overdue';

export interface ReportRow {
  id: string;
  type: ReportType;
  date: string;
  amount?: number;
  status: ReportStatus;
  reference: string;
  description: string;
  meta?: string;
}

export type DateRangePreset =
  | 'today'
  | 'last7'
  | 'last30'
  | 'this_week'
  | 'this_month'
  | 'this_quarter'
  | 'this_year'
  | 'custom';

export interface ReportDateRange {
  from: Date | undefined;
  to: Date | undefined;
  preset: DateRangePreset;
}
