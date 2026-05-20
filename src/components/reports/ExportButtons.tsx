import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { FileSpreadsheet, FileText, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ExportButtonsProps {
  /** Plain row objects (e.g. flattened report rows). */
  rows: Record<string, unknown>[];
  baseFilename: string;
  className?: string;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportButtons({ rows, baseFilename, className }: ExportButtonsProps) {
  const stamp = new Date().toISOString().slice(0, 10);

  const exportCsv = () => {
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `${baseFilename}-${stamp}.csv`);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `${baseFilename}-${stamp}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const keys =
      rows[0] && typeof rows[0] === 'object'
        ? Object.keys(rows[0] as object)
        : ['reference', 'date', 'description', 'amount', 'status'];

    const margin = 10;
    let y = margin;
    doc.setFontSize(12);
    doc.setTextColor(20, 40, 80);
    doc.text(baseFilename.replace(/-/g, ' '), margin, y);
    y += 8;
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(`Generated ${stamp} · ${rows.length} row(s)`, margin, y);
    y += 10;

    const lineHeight = 5;
    const maxRows = 45;
    const slice = rows.slice(0, maxRows);

    slice.forEach((row, idx) => {
      if (y > 190) {
        doc.addPage();
        y = margin;
      }
      const line = keys
        .map((k) => {
          const v = row[k];
          if (v == null) return '';
          return String(v).slice(0, 40);
        })
        .join(' · ');
      doc.setTextColor(30, 30, 30);
      doc.text(`${idx + 1}. ${line}`, margin, y);
      y += lineHeight;
    });

    if (rows.length > maxRows) {
      doc.setTextColor(180, 100, 0);
      doc.text(`…and ${rows.length - maxRows} more rows (export CSV or Excel for full data).`, margin, y + 4);
    }

    doc.save(`${baseFilename}-${stamp}.pdf`);
  };

  const disabled = rows.length === 0;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-9 gap-1.5 rounded-lg border-border bg-background text-sm font-medium text-foreground shadow-sm hover:bg-muted/60"
        disabled={disabled}
        onClick={exportCsv}
        aria-label="Export report as CSV"
      >
        <FileText className="h-4 w-4" />
        CSV
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-9 gap-1.5 rounded-lg border-border bg-background text-sm font-medium text-foreground shadow-sm hover:bg-muted/60"
        disabled={disabled}
        onClick={exportExcel}
        aria-label="Export report as Excel"
      >
        <FileSpreadsheet className="h-4 w-4 text-primary" />
        Excel
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-9 gap-1.5 rounded-lg border-border bg-background text-sm font-medium text-foreground shadow-sm hover:bg-muted/60"
        disabled={disabled}
        onClick={exportPdf}
        aria-label="Export report as PDF"
      >
        <FileDown className="h-4 w-4" />
        PDF
      </Button>
    </div>
  );
}
