import React, { useRef, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Download } from 'lucide-react';
import type { BatchAssignmentDocumentBatch, BatchAssignmentDocumentData, ProductEarningRow } from '@/utils/batchAssignmentDocument';
import { exportBatchAssignmentA5Pdf } from '@/utils/batchAssignmentPDF';

const THERMAL_ROOT_CLASS = 'thermal-job-card-print-root';
const THERMAL_SLIP_CLASS = 'thermal-job-card-slip';

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatRupeeInr(n: number): string {
  const r = Math.round(Math.max(0, n) * 100) / 100;
  if (Number.isInteger(r)) return `₹${r}`;
  return `₹${r.toFixed(2)}`;
}

function formatSizesSummary(breakdown?: { size: string; quantity: number }[]): string {
  if (!breakdown?.length) return '—';
  return breakdown.map((s) => `${escapeHtml(s.size)}-${s.quantity}`).join(', ');
}

type ThermalSlipModel = {
  batch: BatchAssignmentDocumentBatch;
  row: ProductEarningRow;
};

function buildThermalSlips(data: BatchAssignmentDocumentData): ThermalSlipModel[] {
  const out: ThermalSlipModel[] = [];
  for (const batch of data.batchAssignments || []) {
    for (const row of batch.productEarningRows || []) {
      out.push({ batch, row });
    }
  }
  return out;
}

interface BatchAssignmentPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  documentData: BatchAssignmentDocumentData | null;
}

export const BatchAssignmentPreviewDialog: React.FC<BatchAssignmentPreviewDialogProps> = ({
  open,
  onClose,
  documentData,
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  const slips = useMemo(() => (documentData ? buildThermalSlips(documentData) : []), [documentData]);

  const handlePrint = useCallback(() => {
    const root = printRef.current;
    if (!root) return;

    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((el) => el.outerHTML)
      .join('\n');

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Stitching job card — thermal</title>
          ${styleTags}
          <style>
            @page { size: 80mm auto; margin: 0; }
            html, body { margin: 0; padding: 0; background: #fff; }
            .print-root { margin: 0; padding: 0; }
            .${THERMAL_SLIP_CLASS} {
              page-break-after: always;
              break-after: page;
            }
            .${THERMAL_SLIP_CLASS}:last-child {
              page-break-after: auto;
              break-after: auto;
            }
          </style>
        </head>
        <body>
          <div class="print-root">${root.innerHTML}</div>
        </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc || !iframe.contentWindow) {
      document.body.removeChild(iframe);
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    const cleanup = () => {
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 300);
    };

    const doPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        cleanup();
      }
    };

    setTimeout(doPrint, 350);
  }, []);

  const handleExportPdf = useCallback(async () => {
    if (!documentData) return;
    try {
      await exportBatchAssignmentA5Pdf(documentData);
    } catch (e) {
      console.error('PDF export failed:', e);
    }
  }, [documentData]);

  if (!documentData) return null;

  const companyName = documentData.companySettings?.company_name || 'Company';
  const deadlineStr = documentData.dueDate
    ? new Date(documentData.dueDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';
  const orderDateStr = documentData.orderDate
    ? new Date(documentData.orderDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

  const snRate = (b: BatchAssignmentDocumentBatch) => Math.max(0, Number(b.snRate) || 0);
  const ofRate = (b: BatchAssignmentDocumentBatch) => Math.max(0, Number(b.ofRate) || 0);

  return (
    <>
      <style>{`
        .${THERMAL_ROOT_CLASS} {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }
        .${THERMAL_SLIP_CLASS} {
          width: 80mm;
          max-width: 100%;
          margin-left: auto;
          margin-right: auto;
          box-sizing: border-box;
          padding: 8px 10px 10px;
          background: #fff;
          color: #000;
          font-size: 11px;
          line-height: 1.45;
        }
        .thermal-sep {
          border: none;
          border-top: 1px dashed #000;
          margin: 8px 0;
          opacity: 0.85;
        }
        .thermal-center {
          text-align: center;
        }
        .thermal-title {
          font-weight: 700;
          letter-spacing: 0.02em;
          font-size: 12px;
        }
        .thermal-company {
          margin-top: 2px;
          font-size: 10px;
        }
        .thermal-section-gap {
          margin-top: 6px;
        }
        .thermal-bold {
          font-weight: 700;
        }
        @media print {
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body * {
            visibility: hidden;
          }
          .${THERMAL_ROOT_CLASS}, .${THERMAL_ROOT_CLASS} * {
            visibility: visible;
          }
          .${THERMAL_ROOT_CLASS} {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .${THERMAL_SLIP_CLASS} {
            page-break-after: always;
            break-after: page;
            box-shadow: none !important;
          }
          .${THERMAL_SLIP_CLASS}:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
      `}</style>

      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[92vh] flex flex-col gap-0 p-0 sm:max-w-md">
          <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
            <DialogTitle>Stitching job card — preview</DialogTitle>
            <DialogDescription>
              80mm thermal slip (receipt printer). One slip per product. Use Print slip for clean thermal output.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-4 pb-2 border-y bg-muted/40">
            <div className="mx-auto w-[320px] max-w-full rounded-md border bg-white py-3 shadow-sm">
              <div
                ref={printRef}
                className={`${THERMAL_ROOT_CLASS} flex flex-col items-stretch gap-0`}
              >
                {slips.length === 0 ? (
                  <div className={`${THERMAL_SLIP_CLASS} text-center text-muted-foreground`}>
                    No product lines on this job card.
                  </div>
                ) : (
                  slips.map(({ batch, row }, i) => {
                    const qty = Math.max(0, Number(row.orderQty) || 0);
                    const sr = snRate(batch);
                    const or = ofRate(batch);
                    const snTotal = Math.round(sr * qty * 100) / 100;
                    const ofTotal = Math.round(or * qty * 100) / 100;
                    const rateSum = Math.round((sr + or) * 100) / 100;
                    const lineTotal = Math.round((snTotal + ofTotal) * 100) / 100;
                    const sizesLine = formatSizesSummary(row.sizeBreakdown);

                    return (
                      <section
                        key={`${batch.batchName}-${row.orderItemId || row.label}-${i}`}
                        className={THERMAL_SLIP_CLASS}
                      >
                        <div className="thermal-center thermal-title">STITCHING JOB CARD</div>
                        <div className="thermal-center thermal-company">{escapeHtml(companyName)}</div>
                        <hr className="thermal-sep" />

                        <div>Order: {escapeHtml(documentData.orderNumber)}</div>
                        <div>Batch: {escapeHtml(batch.batchName)}</div>
                        <div>
                          Cutting Master:{' '}
                          {escapeHtml(
                            (documentData.cuttingMasterName && documentData.cuttingMasterName.trim()) || '—'
                          )}
                        </div>
                        <div>Date: {orderDateStr}</div>
                        <div>Deadline: {deadlineStr}</div>
                        <hr className="thermal-sep" />

                        <div className="thermal-section-gap">
                          Product category: {escapeHtml(row.category || '—')}
                        </div>
                        <div>Product (from fabric): {escapeHtml(row.label || '—')}</div>
                        <div>Qty: {qty} pcs</div>
                        <div>Sizes: {sizesLine}</div>
                        <hr className="thermal-sep" />

                        <div className="thermal-bold">RATE</div>
                        <div>SN: {formatRupeeInr(sr)}</div>
                        <div>OF: {formatRupeeInr(or)}</div>
                        <hr className="thermal-sep" />

                        <div className="thermal-bold">EARNING</div>
                        <div>
                          SN: {qty} Pcs X {formatRupeeInr(sr)} = {formatRupeeInr(snTotal)}
                        </div>
                        <div>
                          OF: {qty} Pcs X {formatRupeeInr(or)} = {formatRupeeInr(ofTotal)}
                        </div>
                        <hr className="thermal-sep" />

                        <div className="thermal-bold">
                          TOTAL: {qty} Pcs X {formatRupeeInr(rateSum)} = {formatRupeeInr(lineTotal)}
                        </div>
                      </section>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="px-4 py-3 shrink-0 gap-2 flex-col sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button type="button" variant="default" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" />
              Print slip
            </Button>
            <Button type="button" variant="outline" onClick={handleExportPdf}>
              <Download className="w-4 h-4 mr-2" />
              Export A5 PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
