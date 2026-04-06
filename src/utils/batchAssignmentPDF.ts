import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { convertImageToBase64WithCache } from '@/utils/imageUtils';
import { getOrderItemDisplayImage } from '@/utils/orderItemImageUtils';
import {
  buildBatchAssignmentDocumentData,
  normalizeTailorType,
  type BatchAssignmentDocumentData,
  type RawBatchAssignmentInput,
} from '@/utils/batchAssignmentDocument';

/** @deprecated Use BatchAssignmentDocumentData + exportBatchAssignmentA5Pdf after preview. */
export interface BatchAssignmentPDFData {
  orderNumber: string;
  customerName: string;
  orderItems: any[];
  batchAssignments: {
    batchName: string;
    batchLeaderName: string;
    batchLeaderAvatarUrl?: string;
    tailorType: 'single_needle' | 'overlock_flatlock' | string;
    sizeDistributions: { size: string; quantity: number }[];
    snRate: number;
    ofRate: number;
    totalEarning: number;
    assignedQuantity: number;
  }[];
  companySettings: BatchAssignmentDocumentData['companySettings'];
  salesManager?: BatchAssignmentDocumentData['salesManager'];
  customizations: BatchAssignmentDocumentData['customizations'];
  dueDate?: string;
}

/** Base64 <img> or placeholder HTML per order_items.id for table column */
interface RowImageCache {
  rowImagesByItemId: Record<string, string>;
}

const PDF_IMG_PLACEHOLDER = `<div style="width:40px;height:40px;margin:0 auto;background:#eee;border:1px solid #666;display:flex;align-items:center;justify-content:center;font-size:7px;color:#999;">—</div>`;

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function buildRowProductImagesForBatch(
  data: BatchAssignmentDocumentData,
  batchIndex: number
): Promise<RowImageCache> {
  const batch = data.batchAssignments[batchIndex];
  const rowImagesByItemId: Record<string, string> = {};
  const ids = [...new Set(batch?.batchOrderItemIds || [])];

  for (const id of ids) {
    const it = (data.orderItems || []).find((x: any) => String(x.id) === String(id));
    const url = it ? getOrderItemDisplayImage(it) : null;
    if (!url) continue;
    try {
      const u = await convertImageToBase64WithCache(url);
      const b64 = await resizeDataUrl(u, 96, 96);
      rowImagesByItemId[String(id)] = `<img src="${b64}" style="width:40px;height:40px;object-fit:cover;border:1px solid #666;border-radius:2px;display:block;margin:0 auto;" alt="" />`;
    } catch (e) {
      console.warn('product image for pdf:', e);
    }
  }

  return { rowImagesByItemId };
}

function pdfTableImageCell(
  row: { orderItemId?: string },
  rowIndex: number,
  batch: BatchAssignmentDocumentData['batchAssignments'][0],
  cache: Record<string, string>
): string {
  const id = row.orderItemId || batch.batchOrderItemIds[rowIndex];
  const inner = id && cache[String(id)] ? cache[String(id)] : PDF_IMG_PLACEHOLDER;
  return `<td style="padding:2px;border:1px solid #666;vertical-align:middle;text-align:center;width:44px;">${inner}</td>`;
}

function resizeDataUrl(dataUrl: string, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      if (w > maxW) {
        h = (h * maxW) / w;
        w = maxW;
      }
      if (h > maxH) {
        w = (w * maxH) / h;
        h = maxH;
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function createA5PageHtml(
  data: BatchAssignmentDocumentData,
  rowImages: RowImageCache,
  batchIndex: number
): string {
  const batch = data.batchAssignments[batchIndex];
  const companyName = data.companySettings?.company_name || 'Company';
  const deliveryDate = data.dueDate
    ? new Date(data.dueDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';
  const orderDateStr = data.orderDate
    ? new Date(data.orderDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
  const mode = normalizeTailorType(batch.tailorType);
  const tailorLabel =
    mode === 'single_needle' ? 'Single Needle (SN)' : 'Overlock / Flatlock (OF)';
  const productRows = batch.productEarningRows
    .map((row, rowIndex) => {
      const imgTd = pdfTableImageCell(row, rowIndex, batch, rowImages.rowImagesByItemId);
      const main = `
    <tr>
      ${imgTd}
      <td style="padding:3px;border:1px solid #666;font-size:8px;">${esc(row.label)}</td>
      <td style="padding:3px;border:1px solid #666;font-size:8px;">${esc(row.category)}</td>
      <td style="padding:3px;border:1px solid #666;font-size:8px;text-align:right;">${row.orderQty}</td>
      <td style="padding:3px;border:1px solid #666;font-size:8px;text-align:right;">${row.snEarning.toFixed(2)}</td>
      <td style="padding:3px;border:1px solid #666;font-size:8px;text-align:right;">${row.ofEarning.toFixed(2)}</td>
      <td style="padding:3px;border:1px solid #666;font-size:8px;text-align:right;font-weight:600;">${row.lineTotal.toFixed(2)}</td>
    </tr>`;
      const hasDetail =
        (row.sizeBreakdown && row.sizeBreakdown.length > 0) ||
        row.lineCustomizations ||
        row.lineRemarks;
      if (!hasDetail) return main;
      const parts: string[] = [];
      if (row.sizeBreakdown && row.sizeBreakdown.length > 0) {
        const chips = row.sizeBreakdown
          .map((s) => `${esc(s.size)}: ${s.quantity}`)
          .join(' · ');
        parts.push(`<strong>Sizes in this batch:</strong> ${chips}`);
      }
      if (row.lineCustomizations) {
        parts.push(`<strong>Customizations:</strong> ${esc(row.lineCustomizations)}`);
      }
      if (row.lineRemarks) {
        parts.push(`<strong>Line remarks:</strong> ${esc(row.lineRemarks)}`);
      }
      return `${main}
    <tr style="background:#f0f0f0;">
      <td colspan="7" style="padding:4px;border:1px solid #666;font-size:7px;line-height:1.35;">${parts.join('<br/>')}</td>
    </tr>`;
    })
    .join('');

  const combined = batch.combinedSizeBreakdown || [];
  const colsCombined = Math.min(Math.max(combined.length, 1), 14);
  const combinedCells = combined
    .map(
      (sd) => `
    <div style="text-align:center;border:1px solid #666;border-radius:2px;background:#f5f5f5;padding:2px;">
      <div style="font-size:7px;font-weight:600;color:#333;">${esc(sd.size)}</div>
      <div style="font-size:9px;font-weight:bold;">${sd.quantity}</div>
    </div>`
    )
    .join('');

  const orderNotesBlock = data.orderNotes
    ? `<div style="padding:6px 12px;border-bottom:1px solid #666;background:#fff;">
    <div style="font-size:8px;font-weight:600;color:#333;">Order notes (production)</div>
    <div style="font-size:8px;color:#000;white-space:pre-wrap;">${esc(data.orderNotes)}</div>
  </div>`
    : '';

  return `
<div style="width:794px;height:560px;box-sizing:border-box;background:#fff;color:#000;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:9px;line-height:1.25;overflow:hidden;display:flex;flex-direction:column;">
  <div style="background:#1a1a1a;color:#fff;padding:8px 14px;display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <div style="font-size:17px;font-weight:600;line-height:1.2;">Stitching Job Card</div>
      <div style="font-size:11px;opacity:0.95;">${esc(companyName)}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;opacity:0.9;">Order number</div>
      <div style="font-size:14px;font-weight:500;">${esc(data.orderNumber)}</div>
    </div>
  </div>
  <div style="background:#404040;color:#fff;padding:5px 14px;font-weight:600;font-size:11px;">
    Batch: ${esc(batch.batchName)} · Leader: ${esc(batch.batchLeaderName)}
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:12px 22px;padding:8px 12px;border-bottom:1px solid #666;">
    <div><div style="color:#444;font-size:8px;">Customer</div><div style="font-weight:500;font-size:10px;">${esc(data.customerName)}</div></div>
    <div><div style="color:#444;font-size:8px;">Order date</div><div style="font-size:10px;">${esc(orderDateStr)}</div></div>
    <div><div style="color:#444;font-size:8px;">Deadline</div><div style="font-size:10px;font-weight:700;border-bottom:1px dashed #000;display:inline-block;">${esc(deliveryDate)}</div></div>
  </div>
  ${orderNotesBlock}
  <div style="padding:6px 12px;background:#eee;border-bottom:1px solid #666;">
    <div style="font-size:10px;font-weight:600;color:#000;margin-bottom:4px;">Earnings (this batch)</div>
    <div style="font-size:9px;margin-bottom:6px;">
      <span style="color:#444;">Batch total:</span> <strong>₹${batch.totalEarning.toFixed(2)}</strong>
      &nbsp;·&nbsp;<span style="color:#444;">SN:</span> <strong>₹${batch.snEarning.toFixed(2)}</strong>
      &nbsp;·&nbsp;<span style="color:#444;">OF:</span> <strong>₹${batch.ofEarning.toFixed(2)}</strong>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="background:#fff;">
        <th style="text-align:center;padding:3px;border:1px solid #666;font-size:8px;width:44px;">Img</th>
        <th style="text-align:left;padding:3px;border:1px solid #666;font-size:8px;">Product</th>
        <th style="text-align:left;padding:3px;border:1px solid #666;font-size:8px;">Category</th>
        <th style="text-align:right;padding:3px;border:1px solid #666;font-size:8px;">Batch qty</th>
        <th style="text-align:right;padding:3px;border:1px solid #666;font-size:8px;">SN ₹</th>
        <th style="text-align:right;padding:3px;border:1px solid #666;font-size:8px;">OF ₹</th>
        <th style="text-align:right;padding:3px;border:1px solid #666;font-size:8px;">Line ₹</th>
      </tr>
      ${productRows}
    </table>
  </div>
  <div style="padding:6px 12px;border-top:1px solid #ccc;">
      <div style="font-size:10px;font-weight:600;color:#000;">This batch / tailor</div>
      <div style="font-size:8px;color:#333;margin-top:3px;">Batch type: ${esc(tailorLabel)} · Qty assigned: <strong>${batch.assignedQuantity}</strong> pcs · SN ₹${batch.snRate.toFixed(2)}/pc · OF ₹${batch.ofRate.toFixed(2)}/pc</div>
      <div style="font-size:8px;margin-top:3px;">Batch earning — SN: <strong>₹${batch.snEarning.toFixed(2)}</strong> · OF: <strong>₹${batch.ofEarning.toFixed(2)}</strong> · <strong>Total ₹${batch.totalEarning.toFixed(2)}</strong></div>
  </div>
  ${
    combined.length > 0
      ? `<div style="padding:4px 12px 6px;border-top:1px solid #ccc;">
    <div style="font-size:9px;font-weight:600;color:#000;margin-bottom:3px;">Sizes (assignment not linked to a product line)</div>
    <div style="display:grid;grid-template-columns:repeat(${colsCombined},minmax(0,1fr));gap:3px;">${combinedCells}</div>
  </div>`
      : ''
  }
  <div style="padding:3px 12px;font-size:7px;color:#666;text-align:center;border-top:1px solid #ccc;">
    Page ${batchIndex + 1} of ${data.batchAssignments.length} · ${esc(batch.batchName)}
  </div>
</div>`;
}

/** Multi-page A5 landscape PDF (one page per batch). */
export async function exportBatchAssignmentA5Pdf(data: BatchAssignmentDocumentData): Promise<void> {
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-12000px;top:0;pointer-events:none;';
  document.body.appendChild(holder);

  try {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a5' });
    const pageW = 210;
    const pageH = 148;

    for (let i = 0; i < data.batchAssignments.length; i++) {
      const rowImages = await buildRowProductImagesForBatch(data, i);
      const wrap = document.createElement('div');
      wrap.innerHTML = createA5PageHtml(data, rowImages, i).trim();
      const pageEl = wrap.firstElementChild as HTMLElement;
      pageEl.style.position = 'relative';
      holder.appendChild(pageEl);

      await new Promise<void>((r) => requestAnimationFrame(() => r()));

      const canvas = await html2canvas(pageEl, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: 794,
        height: 560,
        logging: false,
      });

      const jpeg = canvas.toDataURL('image/jpeg', 0.88);
      if (i > 0) pdf.addPage('a5', 'l');
      pdf.addImage(jpeg, 'JPEG', 0, 0, pageW, pageH);

      holder.removeChild(pageEl);
    }

    const filename = `Stitching-Job-${data.orderNumber}-${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(filename);
  } finally {
    document.body.removeChild(holder);
  }
}

/** Legacy direct export: builds document model (SN/OF per tailor type) then A5 PDF. */
export async function generateBatchAssignmentPDF(data: BatchAssignmentPDFData): Promise<void> {
  const raw: RawBatchAssignmentInput[] = data.batchAssignments.map((b) => ({
    batchName: b.batchName,
    batchLeaderName: b.batchLeaderName,
    batchLeaderAvatarUrl: b.batchLeaderAvatarUrl,
    tailorType: b.tailorType,
    sizeDistributions: b.sizeDistributions,
    snRate: b.snRate,
    ofRate: b.ofRate,
    assignedQuantity: b.assignedQuantity,
  }));

  const doc = buildBatchAssignmentDocumentData({
    orderNumber: data.orderNumber,
    customerName: data.customerName,
    orderItems: data.orderItems,
    rawBatches: raw,
    companySettings: data.companySettings,
    salesManager: data.salesManager,
    customizations: data.customizations,
    dueDate: data.dueDate,
  });

  await exportBatchAssignmentA5Pdf(doc);
}
