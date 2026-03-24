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

interface ImageCache {
  productImageBase64: string;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function buildImageCache(data: BatchAssignmentDocumentData): Promise<ImageCache> {
  let productImageBase64 = '';
  const first = data.orderItems?.[0];
  const url = first ? getOrderItemDisplayImage(first) : null;
  if (url) {
    try {
      const u = await convertImageToBase64WithCache(url);
      productImageBase64 = await resizeDataUrl(u, 120, 120);
    } catch (e) {
      console.warn('product image for pdf:', e);
    }
  }
  return { productImageBase64 };
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
  images: ImageCache,
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
  const todayStr = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const sizesSorted = [...batch.sizeDistributions].filter((x) => x.quantity > 0);
  const tailorLabel =
    normalizeTailorType(batch.tailorType) === 'single_needle'
      ? 'Single Needle (SN)'
      : 'Overlock / Flatlock (OF)';
  const cols = Math.min(Math.max(sizesSorted.length, 1), 14);
  const productRows = data.productEarningRows
    .map(
      (row) => `
    <tr>
      <td style="padding:3px;border:1px solid #e5e7eb;font-size:8px;">${esc(row.label)}</td>
      <td style="padding:3px;border:1px solid #e5e7eb;font-size:8px;">${esc(row.category)}</td>
      <td style="padding:3px;border:1px solid #e5e7eb;font-size:8px;text-align:right;">${row.orderQty}</td>
      <td style="padding:3px;border:1px solid #e5e7eb;font-size:8px;text-align:right;">${row.snEarning.toFixed(2)}</td>
      <td style="padding:3px;border:1px solid #e5e7eb;font-size:8px;text-align:right;">${row.ofEarning.toFixed(2)}</td>
      <td style="padding:3px;border:1px solid #e5e7eb;font-size:8px;text-align:right;font-weight:600;">${row.lineTotal.toFixed(2)}</td>
    </tr>`
    )
    .join('');

  const sizeCells = sizesSorted
    .map(
      (sd) => `
    <div style="text-align:center;border:1px solid #e5e7eb;border-radius:2px;background:#f9fafb;padding:2px;">
      <div style="font-size:7px;font-weight:600;color:#4b5563;">${esc(sd.size)}</div>
      <div style="font-size:9px;font-weight:bold;">${sd.quantity}</div>
    </div>`
    )
    .join('');

  const cust = (data.customizations || [])
    .slice(0, 6)
    .map((c) => `${esc(c.partName || 'Part')}: ${esc(String(c.selectedAddonName || c.customValue || ''))}`)
    .join(' · ');

  const imgBlock = images.productImageBase64
    ? `<img src="${images.productImageBase64}" style="width:52px;height:52px;object-fit:cover;border-radius:4px;border:1px solid #ccc;" alt="" />`
    : `<div style="width:52px;height:52px;background:#f3f4f6;border:1px solid #ccc;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:7px;color:#999;">Img</div>`;

  return `
<div style="width:794px;height:560px;box-sizing:border-box;background:#fff;color:#0a0a0a;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:9px;line-height:1.25;overflow:hidden;display:flex;flex-direction:column;">
  <div style="background:#155dfc;color:#fff;padding:8px 14px;display:flex;justify-content:space-between;align-items:flex-start;">
    <div>
      <div style="font-size:17px;font-weight:600;line-height:1.2;">Stitching Job Card</div>
      <div style="font-size:11px;opacity:0.95;">${esc(companyName)}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;opacity:0.9;">Order number</div>
      <div style="font-size:14px;font-weight:500;">${esc(data.orderNumber)}</div>
    </div>
  </div>
  <div style="background:#fe9a00;color:#fff;padding:5px 14px;font-weight:600;font-size:11px;">
    Batch: ${esc(batch.batchName)} · Leader: ${esc(batch.batchLeaderName)}
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:12px 22px;padding:8px 12px;border-bottom:1px solid #e5e7eb;">
    <div><div style="color:#6b7280;font-size:8px;">Customer</div><div style="font-weight:500;font-size:10px;">${esc(data.customerName)}</div></div>
    <div><div style="color:#6b7280;font-size:8px;">Order date</div><div style="font-size:10px;">${esc(todayStr)}</div></div>
    <div><div style="color:#6b7280;font-size:8px;">Deadline</div><div style="font-size:10px;color:#dc2626;font-weight:600;">${esc(deliveryDate)}</div></div>
  </div>
  <div style="padding:6px 12px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">
    <div style="font-size:10px;font-weight:600;color:#1e293b;margin-bottom:4px;">Earnings (this order)</div>
    <div style="font-size:9px;margin-bottom:6px;">
      <span style="color:#6b7280;">Grand:</span> <strong>₹${data.summaryTotals.grandTotal.toFixed(2)}</strong>
      &nbsp;·&nbsp;<span style="color:#6b7280;">SN:</span> <strong>₹${data.summaryTotals.totalSn.toFixed(2)}</strong>
      &nbsp;·&nbsp;<span style="color:#6b7280;">OF:</span> <strong>₹${data.summaryTotals.totalOf.toFixed(2)}</strong>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="background:#fff;">
        <th style="text-align:left;padding:3px;border:1px solid #e5e7eb;font-size:8px;">Product</th>
        <th style="text-align:left;padding:3px;border:1px solid #e5e7eb;font-size:8px;">Category</th>
        <th style="text-align:right;padding:3px;border:1px solid #e5e7eb;font-size:8px;">Line qty</th>
        <th style="text-align:right;padding:3px;border:1px solid #e5e7eb;font-size:8px;">SN ₹</th>
        <th style="text-align:right;padding:3px;border:1px solid #e5e7eb;font-size:8px;">OF ₹</th>
        <th style="text-align:right;padding:3px;border:1px solid #e5e7eb;font-size:8px;">Line ₹</th>
      </tr>
      ${productRows}
    </table>
  </div>
  <div style="padding:6px 12px;display:flex;gap:8px;">
    <div style="flex-shrink:0;">${imgBlock}</div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:10px;font-weight:600;color:#1e293b;">This batch / tailor</div>
      <div style="font-size:8px;color:#4b5563;margin-top:3px;">Type: ${esc(tailorLabel)} · Qty: <strong>${batch.assignedQuantity}</strong> pcs · SN ₹${batch.snRate.toFixed(2)} · OF ₹${batch.ofRate.toFixed(2)}</div>
      <div style="font-size:8px;margin-top:3px;">Batch earning — SN: <strong>₹${batch.snEarning.toFixed(2)}</strong> · OF: <strong>₹${batch.ofEarning.toFixed(2)}</strong> · <strong>Total ₹${batch.totalEarning.toFixed(2)}</strong></div>
    </div>
  </div>
  <div style="padding:4px 12px 6px;">
    <div style="font-size:9px;font-weight:600;color:#1e293b;margin-bottom:3px;">Size distribution</div>
    <div style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:3px;">${sizeCells}</div>
  </div>
  ${
    cust
      ? `<div style="padding:4px 12px;font-size:7px;color:#374151;border-top:1px solid #f3f4f6;margin-top:auto;"><strong>Customizations:</strong> ${cust}</div>`
      : ''
  }
  <div style="padding:3px 12px;font-size:7px;color:#9ca3af;text-align:center;border-top:1px solid #f3f4f6;">
    Page ${batchIndex + 1} of ${data.batchAssignments.length} · ${esc(batch.batchName)}
  </div>
</div>`;
}

/** Multi-page A5 landscape PDF (one page per batch). */
export async function exportBatchAssignmentA5Pdf(data: BatchAssignmentDocumentData): Promise<void> {
  const images = await buildImageCache(data);
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-12000px;top:0;pointer-events:none;';
  document.body.appendChild(holder);

  try {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a5' });
    const pageW = 210;
    const pageH = 148;

    for (let i = 0; i < data.batchAssignments.length; i++) {
      const wrap = document.createElement('div');
      wrap.innerHTML = createA5PageHtml(data, images, i).trim();
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
