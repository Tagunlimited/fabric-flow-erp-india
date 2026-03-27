import React, { useRef, useCallback } from 'react';
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
import type { BatchAssignmentDocumentData } from '@/utils/batchAssignmentDocument';
import { normalizeTailorType } from '@/utils/batchAssignmentDocument';
import { getOrderItemDisplayImage } from '@/utils/orderItemImageUtils';
import { exportBatchAssignmentA5Pdf } from '@/utils/batchAssignmentPDF';

const PRINT_ROOT_CLASS = 'batch-assignment-print-root';

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
          <title>Stitching Job Card</title>
          ${styleTags}
          <style>
            @page { size: A5 landscape; margin: 4mm; }
            html, body { margin: 0; padding: 0; background: #fff; }
            .print-root { display: flex; flex-direction: column; gap: 0; align-items: center; }
            .ba-a5-page { page-break-after: always; break-after: page; box-shadow: none !important; }
            .ba-a5-page:last-child { page-break-after: auto; break-after: auto; }
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
  const deliveryDate = documentData.dueDate
    ? new Date(documentData.dueDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';
  const todayStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <>
      <style>{`
        @media screen {
          .${PRINT_ROOT_CLASS} {
            transform-origin: top center;
          }
        }
        @media print {
          @page {
            size: A5 landscape;
            margin: 4mm;
          }
          body * {
            visibility: hidden;
          }
          .${PRINT_ROOT_CLASS}, .${PRINT_ROOT_CLASS} * {
            visibility: visible;
          }
          .${PRINT_ROOT_CLASS} {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .ba-a5-page {
            page-break-after: always;
            break-after: page;
          }
          .ba-a5-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
      `}</style>

      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-[95vw] w-[min(1100px,95vw)] max-h-[92vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>Stitching job card — preview</DialogTitle>
            <DialogDescription>
              A5 landscape, one page per batch. Use Print or Export PDF when ready.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 pb-2 border-y bg-muted/30">
            <div
              ref={printRef}
              className={`${PRINT_ROOT_CLASS} flex flex-col items-center gap-6 py-4`}
            >
              {documentData.batchAssignments.map((batch, pageIndex) => {
                const sizesSorted = [...batch.sizeDistributions].filter((x) => x.quantity > 0);
                const tailorLabel =
                  normalizeTailorType(batch.tailorType) === 'single_needle'
                    ? 'Single Needle (SN)'
                    : 'Overlock / Flatlock (OF)';
                const firstImgItem = documentData.orderItems[0];
                const productImg = firstImgItem ? getOrderItemDisplayImage(firstImgItem) : null;

                return (
                  <article
                    key={`${batch.batchName}-${pageIndex}`}
                    className="ba-a5-page bg-white text-[#0a0a0a] shadow-md overflow-hidden"
                    style={{
                      width: '210mm',
                      height: '148mm',
                      maxWidth: '100%',
                      fontSize: '9px',
                      lineHeight: 1.25,
                      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
                    }}
                  >
                    {/* Header — Figma blue bar */}
                    <div
                      className="flex items-start justify-between px-4 py-2 text-white"
                      style={{ background: '#155dfc', minHeight: '46px' }}
                    >
                      <div>
                        <div className="text-[17px] font-semibold leading-tight tracking-tight">
                          Stitching Job Card
                        </div>
                        <div className="text-[11px] opacity-90">{escapeHtml(companyName)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] opacity-90">Order number</div>
                        <div className="text-[14px] font-medium">{escapeHtml(documentData.orderNumber)}</div>
                      </div>
                    </div>

                    {/* Orange batch bar */}
                    <div
                      className="px-4 py-1 text-white font-semibold text-[11px]"
                      style={{ background: '#fe9a00' }}
                    >
                      Batch: {escapeHtml(batch.batchName)} · Leader: {escapeHtml(batch.batchLeaderName)}
                    </div>

                    <div className="px-3 pt-2 pb-1 flex flex-wrap gap-x-6 gap-y-1 border-b border-gray-200">
                      <div>
                        <div className="text-gray-500 text-[8px]">Customer</div>
                        <div className="font-medium text-[10px]">{escapeHtml(documentData.customerName)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-[8px]">Order date</div>
                        <div className="text-[10px]">{todayStr}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 text-[8px]">Deadline</div>
                        <div className="text-[10px] text-red-600 font-medium">{deliveryDate}</div>
                      </div>
                    </div>

                    {/* Totals + product SN/OF */}
                    <div className="px-3 py-1.5 bg-slate-50 border-b border-gray-200">
                      <div className="text-[10px] font-semibold text-slate-800 mb-1">Earnings (this order)</div>
                      <div className="flex flex-wrap gap-3 text-[9px] mb-1.5">
                        <span>
                          <span className="text-gray-500">Grand total:</span>{' '}
                          <strong>₹{documentData.summaryTotals.grandTotal.toFixed(2)}</strong>
                        </span>
                        <span>
                          <span className="text-gray-500">SN total:</span>{' '}
                          <strong>₹{documentData.summaryTotals.totalSn.toFixed(2)}</strong>
                        </span>
                        <span>
                          <span className="text-gray-500">OF total:</span>{' '}
                          <strong>₹{documentData.summaryTotals.totalOf.toFixed(2)}</strong>
                        </span>
                      </div>
                      <table className="w-full border-collapse text-[8px]">
                        <thead>
                          <tr className="bg-white border border-gray-200">
                            <th className="text-left p-1 border border-gray-200 font-semibold">Product</th>
                            <th className="text-left p-1 border border-gray-200 font-semibold">Category</th>
                            <th className="text-right p-1 border border-gray-200 font-semibold">Line qty</th>
                            <th className="text-right p-1 border border-gray-200 font-semibold">SN ₹</th>
                            <th className="text-right p-1 border border-gray-200 font-semibold">OF ₹</th>
                            <th className="text-right p-1 border border-gray-200 font-semibold">Line ₹</th>
                          </tr>
                        </thead>
                        <tbody>
                          {documentData.productEarningRows.map((row, ri) => (
                            <tr key={ri} className="bg-white">
                              <td className="p-1 border border-gray-200">{escapeHtml(row.label)}</td>
                              <td className="p-1 border border-gray-200">{escapeHtml(row.category)}</td>
                              <td className="p-1 border border-gray-200 text-right">{row.orderQty}</td>
                              <td className="p-1 border border-gray-200 text-right">{row.snEarning.toFixed(2)}</td>
                              <td className="p-1 border border-gray-200 text-right">{row.ofEarning.toFixed(2)}</td>
                              <td className="p-1 border border-gray-200 text-right font-medium">
                                {row.lineTotal.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* This batch detail + sizes */}
                    <div className="px-3 py-1.5 flex gap-2">
                      <div className="shrink-0 w-[52px] h-[52px] border border-gray-300 rounded overflow-hidden bg-gray-100 flex items-center justify-center">
                        {productImg ? (
                          <img src={productImg} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[7px] text-gray-400">Img</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-semibold text-slate-800">This batch / tailor</div>
                        <div className="text-[8px] text-gray-600 mt-0.5">
                          Type: {tailorLabel} · Qty: <strong>{batch.assignedQuantity}</strong> pcs · SN rate ₹
                          {batch.snRate.toFixed(2)} · OF rate ₹{batch.ofRate.toFixed(2)}
                        </div>
                        <div className="text-[8px] mt-0.5">
                          <span className="text-gray-500">Batch earning —</span> SN:{' '}
                          <strong>₹{batch.snEarning.toFixed(2)}</strong> · OF:{' '}
                          <strong>₹{batch.ofEarning.toFixed(2)}</strong> ·{' '}
                          <strong>Total ₹{batch.totalEarning.toFixed(2)}</strong>
                        </div>
                      </div>
                    </div>

                    <div className="px-3 pb-1">
                      <div className="text-[9px] font-semibold text-slate-800 mb-0.5">Size distribution</div>
                      <div
                        className="grid gap-0.5"
                        style={{
                          gridTemplateColumns: `repeat(${Math.min(sizesSorted.length || 1, 14)}, minmax(0, 1fr))`,
                        }}
                      >
                        {sizesSorted.map((sd) => (
                          <div
                            key={sd.size}
                            className="text-center border border-gray-200 rounded-sm bg-gray-50 py-0.5 px-0.5"
                          >
                            <div className="text-[7px] font-semibold text-gray-600">{escapeHtml(sd.size)}</div>
                            <div className="text-[9px] font-bold">{sd.quantity}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {documentData.customizations?.length ? (
                      <div className="px-3 pb-2 pt-0 border-t border-gray-100 mt-auto">
                        <div className="text-[9px] font-semibold mb-0.5">Customizations</div>
                        <div className="text-[7px] text-gray-700 line-clamp-3">
                          {documentData.customizations.slice(0, 6).map((c, i) => (
                            <span key={i}>
                              {`${escapeHtml(c.partName || 'Part')}: ${escapeHtml(
                                String(c.selectedAddonName || c.customValue || '')
                              )}`}
                              {i < Math.min(documentData.customizations.length, 6) - 1 ? ' · ' : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="px-3 py-0.5 text-[7px] text-gray-400 text-center border-t border-gray-100">
                      Page {pageIndex + 1} of {documentData.batchAssignments.length} · {escapeHtml(batch.batchName)}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 shrink-0 gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button type="button" variant="outline" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
            <Button type="button" onClick={handleExportPdf}>
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
