import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { convertImageToBase64WithCache, createFallbackLogo } from '@/utils/imageUtils';

type GRN = {
  id: string;
  grn_number: string;
  po_id: string;
  supplier_id: string;
  grn_date: string;
  received_date: string;
  received_at_location: string;
  status: string;
  total_items_received: number;
  total_items_approved: number;
  total_items_rejected: number;
  total_amount_received: number;
  total_amount_approved: number;
  inspection_notes?: string;
  rejection_reason?: string;
};

type GRNItem = {
  id: string;
  item_name: string;
  item_image_url?: string;
  item_type: string;
  fabric_color?: string;
  fabric_gsm?: string;
  fabric_name?: string;
  item_color?: string;
  ordered_quantity: number;
  received_quantity: number;
  approved_quantity: number;
  rejected_quantity: number;
  unit_of_measure: string;
  unit_price: number;
  gst_rate: number;
  gst_amount: number;
  line_total: number;
  quality_status: string;
  batch_number?: string;
  expiry_date?: string;
  condition_notes?: string;
  inspection_notes?: string;
};

type CompanySettings = {
  company_name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  logo_url?: string;
};

type Supplier = {
  id: string;
  supplier_name: string;
  supplier_code: string;
  contact_person: string;
  phone: string;
  email: string;
  billing_address: string;
};

type PurchaseOrder = {
  id: string;
  po_number: string;
  order_date: string;
};

interface GRNPrintExportProps {
  grn: GRN;
  grnItems: GRNItem[];
  companySettings: CompanySettings;
  supplier: Supplier;
  purchaseOrder: PurchaseOrder;
  showActions?: boolean;
}

export const GRNPrintExport: React.FC<GRNPrintExportProps> = ({
  grn,
  grnItems,
  companySettings,
  supplier,
  purchaseOrder,
  showActions = true
}) => {
  const [logoBase64, setLogoBase64] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const logoCache = useRef<Map<string, string>>(new Map());

  // Convert logo to base64
  React.useEffect(() => {
    const convertLogo = async () => {
      if (companySettings?.logo_url) {
        try {
          const base64 = await convertImageToBase64WithCache(companySettings.logo_url, logoCache.current);
          if (base64) {
            setLogoBase64(base64);
          } else {
            setLogoBase64(createFallbackLogo(companySettings.company_name || 'LOGO'));
          }
        } catch (error) {
          console.error('Error converting logo to base64:', error);
          setLogoBase64(createFallbackLogo(companySettings.company_name || 'LOGO'));
        }
      } else {
        setLogoBase64(createFallbackLogo(companySettings.company_name || 'LOGO'));
      }
    };

    convertLogo();
  }, [companySettings?.logo_url, companySettings?.company_name]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return '#10b981';
      case 'rejected': return '#ef4444';
      case 'damaged': return '#f59e0b';
      case 'pending': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      case 'damaged': return 'Damaged';
      case 'pending': return 'Pending';
      default: return 'Unknown';
    }
  };

  const handlePrint = async () => {
    if (!printRef.current) return;
    
    // Wait for all images to load before opening print dialog
    const images = printRef.current.querySelectorAll('img');
    const imagePromises = Array.from(images).map((img) => {
      return new Promise((resolve) => {
        if (img.complete) {
          resolve(true);
        } else {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(true); // Resolve even if image fails to load
        }
      });
    });
    
    toast.loading('Loading images for print...');
    await Promise.all(imagePromises);
    toast.dismiss();
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Please allow popups to print');
      return;
    }

    const printContent = printRef.current.innerHTML;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>GRN - ${grn.grn_number}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              margin: 0; 
              padding: 10px; 
              color: #333;
              line-height: 1.2;
            }
            .print-container { 
              max-width: 800px; 
              margin: 0 auto; 
            }
            .header { 
              display: flex; 
              justify-content: space-between; 
              align-items: flex-start; 
              margin-bottom: 15px; 
              border-bottom: 1px solid #e5e7eb; 
              padding-bottom: 10px;
            }
            .company-info { 
              flex: 1; 
            }
            .grn-info { 
              text-align: right; 
              flex: 1; 
            }
            .logo { 
              max-width: 120px; 
              max-height: 50px; 
              margin-bottom: 5px; 
            }
            .company-name { 
              font-size: 20px; 
              font-weight: bold; 
              color: #1f2937; 
              margin-bottom: 3px; 
            }
            .company-details { 
              font-size: 11px; 
              color: #6b7280; 
              line-height: 1.2; 
            }
            .grn-title { 
              font-size: 22px; 
              font-weight: bold; 
              color: #1f2937; 
              margin-bottom: 5px; 
            }
            .grn-details { 
              font-size: 12px; 
              color: #374151; 
            }
            .grn-details div { 
              margin-bottom: 2px; 
            }
            .supplier-section { 
              margin-bottom: 15px; 
            }
            .section-title { 
              font-size: 14px; 
              font-weight: bold; 
              color: #1f2937; 
              margin-bottom: 5px; 
              border-bottom: 1px solid #e5e7eb; 
              padding-bottom: 3px; 
            }
            .supplier-info { 
              display: grid; 
              grid-template-columns: 1fr 1fr; 
              gap: 10px; 
            }
            .info-block { 
              background: #f9fafb; 
              padding: 8px; 
              border-radius: 4px; 
              border: 1px solid #e5e7eb; 
            }
            .info-label { 
              font-weight: bold; 
              color: #374151; 
              margin-bottom: 2px; 
              font-size: 11px;
            }
            .info-value { 
              color: #6b7280; 
              font-size: 11px; 
            }
            .items-table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 15px; 
            }
            .items-table th, .items-table td { 
              border: 1px solid #d1d5db; 
              padding: 4px; 
              text-align: left; 
              font-size: 10px; 
            }
            .items-table th { 
              background: #f3f4f6; 
              font-weight: bold; 
              color: #374151; 
            }
            .items-table .number-cell { 
              text-align: right; 
            }
            .status-badge { 
              padding: 1px 4px; 
              border-radius: 3px; 
              font-size: 9px; 
              font-weight: bold; 
              color: white; 
            }
            .summary-section { 
              display: grid; 
              grid-template-columns: 1fr 1fr; 
              gap: 15px; 
              margin-bottom: 15px; 
            }
            .summary-card { 
              background: #f9fafb; 
              padding: 10px; 
              border-radius: 4px; 
              border: 1px solid #e5e7eb; 
            }
            .summary-title { 
              font-size: 13px; 
              font-weight: bold; 
              color: #1f2937; 
              margin-bottom: 8px; 
            }
            .summary-item { 
              display: flex; 
              justify-content: space-between; 
              margin-bottom: 4px; 
              font-size: 11px; 
            }
            .summary-label { 
              color: #6b7280; 
            }
            .summary-value { 
              font-weight: bold; 
              color: #374151; 
            }
            .notes-section { 
              margin-top: 15px; 
            }
            .notes-content { 
              background: #f9fafb; 
              padding: 8px; 
              border-radius: 4px; 
              border: 1px solid #e5e7eb; 
              min-height: 50px; 
              font-size: 11px;
            }
            @media print {
              body { margin: 0; padding: 8px; }
              .print-container { max-width: none; }
            }
          </style>
        </head>
        <body>
          <div class="print-container">
            ${printContent}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const generatePDF = async () => {
    if (!printRef.current) return;

    try {
      setIsGenerating(true);
      toast.loading('Loading images for PDF...');

      // Wait for all images to load before generating PDF
      const images = printRef.current.querySelectorAll('img');
      const imagePromises = Array.from(images).map((img) => {
        return new Promise((resolve) => {
          if (img.complete) {
            resolve(true);
          } else {
            img.onload = () => resolve(true);
            img.onerror = () => resolve(true); // Resolve even if image fails to load
          }
        });
      });
      
      await Promise.all(imagePromises);
      toast.loading('Generating PDF...');

      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`GRN-${grn.grn_number}.pdf`);
      toast.success('PDF generated successfully');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      {showActions && (
        <div className="flex gap-2">
          <Button onClick={handlePrint} variant="outline" size="sm">
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
          <Button onClick={generatePDF} variant="outline" size="sm" disabled={isGenerating}>
            <Download className="w-4 h-4 mr-2" />
            {isGenerating ? 'Generating...' : 'Export PDF'}
          </Button>
        </div>
      )}

      <div ref={printRef} className={`print-container bg-white p-3 max-w-4xl mx-auto ${showActions ? 'hidden' : ''}`} style={{ lineHeight: '1.2' }}>
        {/* Header */}
        <div className="header" style={{ marginBottom: '15px', paddingBottom: '10px', borderBottom: '1px solid #e5e7eb' }}>
          <div className="company-info">
            <img src={logoBase64} alt="Company Logo" className="logo" />
            <div className="company-name">{companySettings?.company_name || 'Company Name'}</div>
            <div className="company-details">
              {companySettings?.address && <div>{companySettings.address}</div>}
              {companySettings?.city && companySettings?.state && (
                <div>{companySettings.city}, {companySettings.state} - {companySettings.pincode}</div>
              )}
              {companySettings?.phone && <div>Phone: {companySettings.phone}</div>}
              {companySettings?.email && <div>Email: {companySettings.email}</div>}
            </div>
          </div>
          <div className="grn-info">
            <div className="grn-title">GOODS RECEIPT NOTE</div>
            <div className="grn-details">
              <div><strong>GRN Number:</strong> {grn.grn_number}</div>
              <div><strong>Date:</strong> {new Date(grn.grn_date).toLocaleDateString('en-GB')}</div>
              <div><strong>Received Date:</strong> {new Date(grn.received_date).toLocaleDateString('en-GB')}</div>
              <div><strong>Status:</strong> {grn.status.replace('_', ' ').toUpperCase()}</div>
            </div>
          </div>
        </div>

        {/* Supplier Information */}
        <div className="supplier-section" style={{ marginBottom: '15px' }}>
          <div className="section-title" style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '5px', borderBottom: '1px solid #e5e7eb', paddingBottom: '3px' }}>Supplier Information</div>
          <div className="supplier-info" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="info-block" style={{ background: '#f9fafb', padding: '8px', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
              <div className="info-label" style={{ fontWeight: 'bold', color: '#374151', marginBottom: '2px', fontSize: '11px' }}>Supplier Name</div>
              <div className="info-value" style={{ color: '#6b7280', fontSize: '11px' }}>{supplier?.supplier_name || '-'}</div>
              <div className="info-label" style={{ fontWeight: 'bold', color: '#374151', marginBottom: '2px', fontSize: '11px', marginTop: '5px' }}>Contact Person</div>
              <div className="info-value" style={{ color: '#6b7280', fontSize: '11px' }}>{supplier?.contact_person || '-'}</div>
              <div className="info-label" style={{ fontWeight: 'bold', color: '#374151', marginBottom: '2px', fontSize: '11px', marginTop: '5px' }}>Phone</div>
              <div className="info-value" style={{ color: '#6b7280', fontSize: '11px' }}>{supplier?.phone || '-'}</div>
            </div>
            <div className="info-block" style={{ background: '#f9fafb', padding: '8px', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
              <div className="info-label" style={{ fontWeight: 'bold', color: '#374151', marginBottom: '2px', fontSize: '11px' }}>Supplier Code</div>
              <div className="info-value" style={{ color: '#6b7280', fontSize: '11px' }}>{supplier?.supplier_code || '-'}</div>
              <div className="info-label" style={{ fontWeight: 'bold', color: '#374151', marginBottom: '2px', fontSize: '11px', marginTop: '5px' }}>Email</div>
              <div className="info-value" style={{ color: '#6b7280', fontSize: '11px' }}>{supplier?.email || '-'}</div>
              <div className="info-label" style={{ fontWeight: 'bold', color: '#374151', marginBottom: '2px', fontSize: '11px', marginTop: '5px' }}>Address</div>
              <div className="info-value" style={{ color: '#6b7280', fontSize: '11px' }}>{supplier?.billing_address || '-'}</div>
            </div>
          </div>
        </div>

        {/* Purchase Order Reference */}
        <div className="supplier-section" style={{ marginBottom: '15px' }}>
          <div className="section-title" style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '5px', borderBottom: '1px solid #e5e7eb', paddingBottom: '3px' }}>Purchase Order Reference</div>
          <div className="info-block" style={{ background: '#f9fafb', padding: '8px', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
            <div className="info-label" style={{ fontWeight: 'bold', color: '#374151', marginBottom: '2px', fontSize: '11px' }}>PO Number</div>
            <div className="info-value" style={{ color: '#6b7280', fontSize: '11px' }}>{purchaseOrder?.po_number || '-'}</div>
            <div className="info-label" style={{ fontWeight: 'bold', color: '#374151', marginBottom: '2px', fontSize: '11px', marginTop: '5px' }}>PO Date</div>
            <div className="info-value" style={{ color: '#6b7280', fontSize: '11px' }}>{purchaseOrder?.order_date ? new Date(purchaseOrder.order_date).toLocaleDateString('en-GB') : '-'}</div>
            <div className="info-label" style={{ fontWeight: 'bold', color: '#374151', marginBottom: '2px', fontSize: '11px', marginTop: '5px' }}>Received At Location</div>
            <div className="info-value" style={{ color: '#6b7280', fontSize: '11px' }}>{grn.received_at_location || '-'}</div>
          </div>
        </div>

        {/* Items Table */}
        <div className="section-title" style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '5px', borderBottom: '1px solid #e5e7eb', paddingBottom: '3px' }}>Received Items</div>
        <table className="items-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px', background: '#f3f4f6', fontWeight: 'bold', color: '#374151' }}>Item Name</th>
              <th style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px', background: '#f3f4f6', fontWeight: 'bold', color: '#374151' }}>Type</th>
              <th style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px', background: '#f3f4f6', fontWeight: 'bold', color: '#374151' }}>Color</th>
              <th style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px', background: '#f3f4f6', fontWeight: 'bold', color: '#374151' }}>GSM</th>
              <th style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px', background: '#f3f4f6', fontWeight: 'bold', color: '#374151' }}>Ordered</th>
              <th style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px', background: '#f3f4f6', fontWeight: 'bold', color: '#374151' }}>Received</th>
              <th style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px', background: '#f3f4f6', fontWeight: 'bold', color: '#374151' }}>Approved</th>
              <th style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px', background: '#f3f4f6', fontWeight: 'bold', color: '#374151' }}>Rejected</th>
              <th style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px', background: '#f3f4f6', fontWeight: 'bold', color: '#374151' }}>UOM</th>
              <th style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px', background: '#f3f4f6', fontWeight: 'bold', color: '#374151' }}>Unit Price</th>
              <th style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px', background: '#f3f4f6', fontWeight: 'bold', color: '#374151' }}>GST %</th>
              <th style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px', background: '#f3f4f6', fontWeight: 'bold', color: '#374151' }}>GST Amount</th>
              <th style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px', background: '#f3f4f6', fontWeight: 'bold', color: '#374151' }}>Total</th>
              <th style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px', background: '#f3f4f6', fontWeight: 'bold', color: '#374151' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {grnItems.map((item, index) => (
              <tr key={index}>
                <td style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {item.item_image_url && (
                      <img src={item.item_image_url} alt={item.item_name} style={{ width: 20, height: 20, objectFit: 'cover', borderRadius: 3, border: '1px solid #e5e7eb' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    )}
                    <div>
                      <div style={{ fontWeight: '500', fontSize: '10px' }}>{item.item_name}</div>
                      {item.fabric_name && (
                        <div style={{ fontSize: '9px', color: '#6b7280' }}>{item.fabric_name}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px' }}>{item.item_type === 'fabric' ? 'Fabric' : item.item_type}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px' }}>{item.item_color || item.fabric_color || '-'}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px' }}>{item.item_type === 'fabric' ? (item.fabric_gsm || '-') : '-'}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'right', fontSize: '10px' }}>{item.ordered_quantity}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'right', fontSize: '10px' }}>{item.received_quantity}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'right', fontSize: '10px' }}>{item.approved_quantity}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'right', fontSize: '10px' }}>{item.rejected_quantity}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px' }}>{item.unit_of_measure}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'right', fontSize: '10px' }}>₹{item.unit_price.toFixed(2)}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'right', fontSize: '10px' }}>{item.gst_rate}%</td>
                <td style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'right', fontSize: '10px' }}>₹{item.gst_amount.toFixed(2)}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'right', fontSize: '10px' }}>₹{item.line_total.toFixed(2)}</td>
                <td style={{ border: '1px solid #d1d5db', padding: '4px', textAlign: 'left', fontSize: '10px' }}>
                  <span 
                    style={{ padding: '1px 4px', borderRadius: '3px', fontSize: '9px', fontWeight: 'bold', color: 'white', backgroundColor: getStatusColor(item.quality_status) }}
                  >
                    {getStatusText(item.quality_status)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary */}
        <div className="summary-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
          <div className="summary-card" style={{ background: '#f9fafb', padding: '10px', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
            <div className="summary-title" style={{ fontSize: '13px', fontWeight: 'bold', color: '#1f2937', marginBottom: '8px' }}>Quantity Summary</div>
            <div className="summary-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px' }}>
              <span className="summary-label" style={{ color: '#6b7280' }}>Total Items:</span>
              <span className="summary-value" style={{ fontWeight: 'bold', color: '#374151' }}>{grn.total_items_received}</span>
            </div>
            <div className="summary-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px' }}>
              <span className="summary-label" style={{ color: '#6b7280' }}>Items Approved:</span>
              <span className="summary-value" style={{ fontWeight: 'bold', color: '#10b981' }}>{grn.total_items_approved}</span>
            </div>
            <div className="summary-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px' }}>
              <span className="summary-label" style={{ color: '#6b7280' }}>Items Rejected:</span>
              <span className="summary-value" style={{ fontWeight: 'bold', color: '#ef4444' }}>{grn.total_items_rejected}</span>
            </div>
          </div>
          <div className="summary-card" style={{ background: '#f9fafb', padding: '10px', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
            <div className="summary-title" style={{ fontSize: '13px', fontWeight: 'bold', color: '#1f2937', marginBottom: '8px' }}>Amount Summary</div>
            <div className="summary-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px' }}>
              <span className="summary-label" style={{ color: '#6b7280' }}>Total Amount Received:</span>
              <span className="summary-value" style={{ fontWeight: 'bold', color: '#374151' }}>₹{grn.total_amount_received.toFixed(2)}</span>
            </div>
            <div className="summary-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px' }}>
              <span className="summary-label" style={{ color: '#6b7280' }}>Amount Approved:</span>
              <span className="summary-value" style={{ fontWeight: 'bold', color: '#10b981' }}>₹{grn.total_amount_approved.toFixed(2)}</span>
            </div>
            <div className="summary-item" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px' }}>
              <span className="summary-label" style={{ color: '#6b7280' }}>Approval Rate:</span>
              <span className="summary-value" style={{ fontWeight: 'bold', color: '#374151' }}>
                {grn.total_amount_received > 0 
                  ? ((grn.total_amount_approved / grn.total_amount_received) * 100).toFixed(1)
                  : 0}%
              </span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {(grn.inspection_notes || grn.rejection_reason) && (
          <div className="notes-section" style={{ marginTop: '15px' }}>
            <div className="section-title" style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '5px', borderBottom: '1px solid #e5e7eb', paddingBottom: '3px' }}>Notes</div>
            <div className="notes-content" style={{ background: '#f9fafb', padding: '8px', borderRadius: '4px', border: '1px solid #e5e7eb', minHeight: '50px', fontSize: '11px' }}>
              {grn.inspection_notes && (
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontWeight: '500', color: '#374151', fontSize: '11px' }}>Inspection Notes:</div>
                  <div style={{ color: '#6b7280', fontSize: '11px' }}>{grn.inspection_notes}</div>
                </div>
              )}
              {grn.rejection_reason && (
                <div>
                  <div style={{ fontWeight: '500', color: '#374151', fontSize: '11px' }}>Rejection Reason:</div>
                  <div style={{ color: '#6b7280', fontSize: '11px' }}>{grn.rejection_reason}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};
