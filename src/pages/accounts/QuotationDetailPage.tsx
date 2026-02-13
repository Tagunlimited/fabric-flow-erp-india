import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Eye, Printer, Download, Mail, MessageCircle, Share, FileText, Send, ChevronDown, ArrowLeft, CreditCard } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useCompanySettings } from '@/hooks/CompanySettingsContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatDateIndian } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ErpLayout } from '@/components/ErpLayout';
import { getOrderItemDisplayImage } from '@/utils/orderItemImageUtils';
import { calculateSizeBasedTotal } from '@/utils/priceCalculation';
import { getSortedSizes, sortSizesQuantities as sortSizesQuantitiesUtil, sortSizesByMasterOrder } from '@/utils/sizeSorting';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Add sales manager to Order interface
interface Order {
  id: string;
  order_number: string;
  order_date: string;
  customer_id: string;
  status: string;
  final_amount: number;
  sales_manager?: string;
  gst_rate?: number;
  order_type?: string;
}
interface Customer {
  id: string;
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
}
// Add OrderItem interface
interface OrderItem {
  id: string;
  order_id: string;
  product_category_id: string;
  product_description: string;
  fabric_id: string;
  color: string;
  gsm: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  sizes_quantities: any;
  size_prices?: { [size: string]: number };
  specifications: any;
  remarks: string;
  category_image_url?: string;
}
// Add ProductCategory and Fabric interfaces
interface ProductCategory { id: string; category_name: string; }
interface Fabric { id: string; name: string; }
// Add additional charges state
interface AdditionalCharge {
  particular: string;
  rate: number;
  gst_percentage: number;
  amount_incl_gst: number;
}
// Add SalesManager interface
interface SalesManager { id: string; full_name: string; }

export default function QuotationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  const { config: company } = useCompanySettings();
  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [quotationNumber, setQuotationNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [productCategories, setProductCategories] = useState<{ [key: string]: ProductCategory }>({});
  const [fabrics, setFabrics] = useState<{ [key: string]: Fabric }>({});
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);
  const [salesManager, setSalesManager] = useState<SalesManager | null>(null);
  const [sizeTypes, setSizeTypes] = useState<{ [key: string]: any }>({});

  useEffect(() => {
    if (id) fetchData(id);
  }, [id]);

  const fetchData = async (orderId: string) => {
    try {
      setLoading(true);
      // Fetch order
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId as any)
        .single();
      if (orderError) throw orderError;
      if (!orderData) throw new Error('Order not found');
      setOrder(orderData as unknown as Order);
      // Fetch customer
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', (orderData as any).customer_id)
        .single();
      if (customerError) throw customerError;
      if (!customerData) throw new Error('Customer not found');
      setCustomer(customerData as unknown as Customer);
      // Fetch sales manager name if available
      if ((orderData as any).sales_manager) {
        const { data: salesManagerData } = await supabase
          .from('employees')
          .select('id, full_name')
          .eq('id', (orderData as any).sales_manager)
          .single();
        if (salesManagerData) {
          setSalesManager(salesManagerData as SalesManager);
        }
      } else {
        setSalesManager(null);
      }
      // Fetch order items
      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('*, mockup_images, specifications, category_image_url')
        .eq('order_id', orderId as any);
      if (itemsError) throw itemsError;
      setOrderItems((itemsData || []) as unknown as OrderItem[]);
      // Fetch product categories and fabrics for items
      if (itemsData && itemsData.length > 0) {
        const typedItems = itemsData as unknown as OrderItem[];
        const fabricIds = typedItems.map(item => item.fabric_id).filter(Boolean) as string[];
        const categoryIds = typedItems.map(item => item.product_category_id).filter(Boolean) as string[];
        if (fabricIds.length > 0) {
          // Use type assertion since fabric_master table exists but may not be in generated types
          const { data: fabricsData } = await (supabase
            .from('fabric_master' as any)
            .select('id, fabric_name')
            .in('id', fabricIds) as any);
          if (fabricsData && Array.isArray(fabricsData)) {
            const fabricsMap = fabricsData.reduce((acc, fabric: any) => {
              if (fabric && fabric.id && fabric.fabric_name) {
              acc[fabric.id] = { ...fabric, name: fabric.fabric_name };
              }
              return acc;
            }, {} as { [key: string]: Fabric });
            setFabrics(fabricsMap);
          }
        }
        if (categoryIds.length > 0) {
          const { data: categoriesData } = await supabase
            .from('product_categories')
            .select('id, category_name')
            .in('id', categoryIds as any);
          if (categoriesData && Array.isArray(categoriesData)) {
            const categoriesMap = categoriesData.reduce((acc, category: any) => {
              if (category && category.id) {
                acc[category.id] = category as ProductCategory;
              }
              return acc;
            }, {} as { [key: string]: ProductCategory });
            setProductCategories(categoriesMap);
          }
        }
      }
      // Fetch size types for sorting
      const { data: sizeTypesData } = await supabase
        .from('size_types')
        .select('*');
      if (sizeTypesData) {
        const sizeTypesMap = sizeTypesData.reduce((acc: { [key: string]: any }, sizeType: any) => {
          acc[sizeType.id] = sizeType;
          return acc;
        }, {});
        setSizeTypes(sizeTypesMap);
      }
      
      // Fetch additional charges if available (optional: you may need to fetch from order or another table)
      // For now, we'll just set it to an empty array as it's not directly linked to order_items in this schema
      setAdditionalCharges([]);
      // Generate quotation number
      const qNum = await generateQuotationNumber();
      setQuotationNumber(qNum);
    } catch (error) {
      toast.error('Failed to load quotation details');
    } finally {
      setLoading(false);
    }
  };

  // Generate unique quotation number: SO/YY-YY/MON/SEQ
  const generateQuotationNumber = async () => {
    // Get latest quotation for sequence
    const now = new Date();
    const fyStart = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
    const fyEnd = fyStart + 1;
    const fyStr = `${fyStart.toString().slice(-2)}-${fyEnd.toString().slice(-2)}`;
    const month = now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    // Get latest quotation for this FY/month
    const { data, error } = await supabase
      .from('quotations')
      .select('quotation_number')
      .ilike('quotation_number', `SO/${fyStr}/${month}/%`)
      .order('created_at', { ascending: false })
      .limit(1);
    let nextSeq = 1;
    if (data && data.length > 0) {
      const lastNum = (data[0] as any)?.quotation_number;
      const match = lastNum.match(/(\d+)$/);
      if (match) nextSeq = parseInt(match[1]) + 1;
    }
    const seqStr = nextSeq.toString().padStart(3, '0');
    return `SO/${fyStr}/${month}/${seqStr}`;
  };

  // Helper: sort sizes using master order configuration
  function sortSizes(sizes: { [key: string]: number }, sizeTypeId?: string | null): Array<[string, number]> {
    const filteredEntries = Object.entries(sizes).filter(([_, qty]) => (qty as number) > 0);
    
    if (filteredEntries.length === 0) return [];
    
    // Convert sizeTypes map to array format
    const sizeTypesArray = Object.values(sizeTypes);
    
    // Get size names from entries
    const sizeNames = filteredEntries.map(([size]) => size);
    
    // Sort size names using master order
    const sortedSizeNames = sortSizesByMasterOrder(sizeNames, sizeTypeId || null, sizeTypesArray);
    
    // Rebuild entries in sorted order
    const sortedMap = new Map(filteredEntries);
    const sorted: Array<[string, number]> = [];
    
    sortedSizeNames.forEach(sizeName => {
      if (sortedMap.has(sizeName)) {
        sorted.push([sizeName, sortedMap.get(sizeName)!]);
        sortedMap.delete(sizeName);
      }
    });
    
    // Add any remaining sizes that weren't in the sorted order
    sortedMap.forEach((qty, sizeName) => {
      sorted.push([sizeName, qty]);
    });
    
    return sorted;
  }

  // Helper function to sort sizes based on size type
  function sortSizesQuantities(
    sizesQuantities: { [size: string]: number },
    sizeTypeId: string | null,
    sizeTypesMap: { [key: string]: any }
  ): Array<[string, number]> {
    if (!sizeTypeId || !sizeTypesMap[sizeTypeId]) {
      return sortSizes(sizesQuantities);
    }
    const sizeType = sizeTypesMap[sizeTypeId];
    // Convert map to array for getSortedSizesById, or use getSortedSizes directly
    const sortedSizes = getSortedSizes(sizeType);
    return sortedSizes
      .map(size => [size, sizesQuantities[size] || 0] as [string, number])
      .filter(([_, qty]) => qty > 0);
  }

  // Helper: number to words
  // Helper function to format company name with proper spacing
  const formatCompanyName = (name: string | undefined): string => {
    if (!name) return 'Our Company';
    let formatted = name;
    // Add space between lowercase and uppercase (e.g., "Tagunlimited" -> "Tag unlimited")
    formatted = formatted.replace(/([a-z])([A-Z])/g, '$1 $2');
    // Add space between uppercase letter followed by lowercase and another uppercase (e.g., "TagUnlimited" -> "Tag Unlimited")
    formatted = formatted.replace(/([A-Z][a-z]+)([A-Z])/g, '$1 $2');
    // Capitalize first letter of each word for proper formatting
    formatted = formatted.split(' ').map(word => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
    return formatted.trim();
  };

  function numberToWords(num: number): string {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const convertLessThanOneThousand = (n: number): string => {
      if (n === 0) return '';
      if (n < 10) return ones[n];
      if (n < 20) return teens[n - 10];
      if (n < 100) {
        return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
      }
      if (n < 1000) {
        return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertLessThanOneThousand(n % 100) : '');
      }
      return '';
    };
    if (num === 0) return 'Zero';
    const crore = Math.floor(num / 10000000);
    const lakh = Math.floor((num % 10000000) / 100000);
    const thousand = Math.floor((num % 100000) / 1000);
    const remainder = num % 1000;
    let result = '';
    if (crore > 0) result += convertLessThanOneThousand(crore) + ' Crore';
    if (lakh > 0) result += (result ? ' ' : '') + convertLessThanOneThousand(lakh) + ' Lakh';
    if (thousand > 0) result += (result ? ' ' : '') + convertLessThanOneThousand(thousand) + ' Thousand';
    if (remainder > 0) result += (result ? ' ' : '') + convertLessThanOneThousand(remainder);
    return result + ' Only/-';
  }

  // Enhanced PDF Export with proper A4 sizing - uses same format as print
  const handleExportPDF = async () => {
    if (!printRef.current) {
      toast.error('Print reference not available');
      return;
    }
    
    const element = printRef.current;
    const originalStyles = {
      position: element.style.position,
      left: element.style.left,
      top: element.style.top,
      visibility: element.style.visibility,
      display: element.style.display,
      height: element.style.height,
      width: element.style.width,
      maxWidth: element.style.maxWidth,
      zIndex: element.style.zIndex,
    };
    
    // Store original class list to restore later
    const originalClasses = element.className;
    
    try {
      toast.loading('Generating PDF...');
      
      // Remove print-only class temporarily (it has display: none !important)
      element.className = element.className.replace('print-only', '').trim();
      
      // Temporarily make element visible but off-screen for html2canvas
      // Position off-screen to avoid showing preview on screen
      element.style.position = 'fixed';
      element.style.left = '-9999px';
      element.style.top = '0';
      element.style.visibility = 'visible';
      element.style.display = 'block';
      element.style.height = 'auto';
      element.style.width = '210mm';
      element.style.maxWidth = '210mm';
      element.style.zIndex = '9999';
      element.style.opacity = '1';
      element.style.pointerEvents = 'none'; // Prevent interaction but keep visible
      
      // Also ensure parent container doesn't hide it
      let parentOriginalDisplay = '';
      if (element.parentElement) {
        const parent = element.parentElement;
        parentOriginalDisplay = parent.style.display;
        parent.style.display = 'block';
        parent.style.visibility = 'visible';
      }
      
      // Wait for browser to apply styles and render
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Check dimensions after making visible
      if (element.offsetWidth === 0 || element.offsetHeight === 0) {
        console.warn('Element dimensions after making visible:', { 
          width: element.offsetWidth, 
          height: element.offsetHeight,
          scrollWidth: element.scrollWidth,
          scrollHeight: element.scrollHeight,
          computedDisplay: window.getComputedStyle(element).display,
          computedVisibility: window.getComputedStyle(element).visibility
        });
        
        // Force dimensions if still zero
        if (element.scrollWidth > 0 && element.scrollHeight > 0) {
          element.style.width = `${element.scrollWidth}px`;
          element.style.height = `${element.scrollHeight}px`;
        } else {
          // Last resort: set explicit dimensions
          element.style.width = '794px'; // A4 width in pixels at 96 DPI
          element.style.height = 'auto';
        }
        
        // Wait again after forcing dimensions
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Optimize html2canvas settings to match print output exactly
      const canvas = await html2canvas(element, {
        scale: 2, 
        useCORS: true,
        logging: false,
        imageTimeout: 0,
        backgroundColor: '#ffffff',
        removeContainer: false,
        width: element.scrollWidth || element.offsetWidth || 794,
        height: element.scrollHeight || element.offsetHeight || 1123,
        windowWidth: element.scrollWidth || element.offsetWidth || 794,
        windowHeight: element.scrollHeight || element.offsetHeight || 1123,
      });
      
      // Restore parent styles if changed
      if (element.parentElement && parentOriginalDisplay) {
        element.parentElement.style.display = parentOriginalDisplay;
        element.parentElement.style.visibility = '';
      }
      
      if (!canvas) {
        throw new Error('Failed to generate canvas');
      }
      
      // Log canvas dimensions for debugging
      console.log('Canvas dimensions:', { width: canvas.width, height: canvas.height });
      
      // Validate canvas dimensions
      if (canvas.width <= 0 || canvas.height <= 0) {
        console.error('Canvas has invalid dimensions:', { width: canvas.width, height: canvas.height });
        throw new Error(`Invalid canvas dimensions: ${canvas.width}x${canvas.height}`);
      }
      
      if (!isFinite(canvas.width) || !isFinite(canvas.height)) {
        console.error('Canvas dimensions are not finite:', { width: canvas.width, height: canvas.height });
        throw new Error(`Canvas dimensions are not finite: ${canvas.width}x${canvas.height}`);
      }
      
      // Use JPEG with compression for smaller file size
      const imgData = canvas.toDataURL('image/jpeg', 0.8); // 80% quality
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // A4 dimensions in mm (explicit values)
      const pdfWidth = 210;
      const pdfHeight = 297;
      
      // Reduced PDF margins for better fit
      const marginLeft = 1;
      const marginRight = 1;
      const marginTop = 1;
      const marginBottom = 1;
      
      // Calculate available content area
      const contentWidth = pdfWidth - marginLeft - marginRight; // 200mm
      const contentHeight = pdfHeight - marginTop - marginBottom; // 287mm
      
      // Calculate aspect ratio of canvas
      const canvasAspect = canvas.width / Math.max(canvas.height, 1);
      
      // Calculate output dimensions to fit content area while maintaining aspect ratio
      let outWidth = contentWidth;
      let outHeight = outWidth / canvasAspect;
      
      // If height exceeds available space, scale down
      if (outHeight > contentHeight) {
        outHeight = contentHeight;
        outWidth = outHeight * canvasAspect;
      }
      
      // Center the image both horizontally and vertically
      const x = marginLeft + (contentWidth - outWidth) / 2;
      const y = marginTop + (contentHeight - outHeight) / 2;
      
      // Validate all values are finite and positive
      if (!isFinite(x) || !isFinite(y) || !isFinite(outWidth) || !isFinite(outHeight) ||
          x < 0 || y < 0 || outWidth <= 0 || outHeight <= 0) {
        console.error('Invalid PDF coordinates:', { x, y, outWidth, outHeight, canvas: { width: canvas.width, height: canvas.height } });
        throw new Error('Invalid PDF coordinates calculated');
      }
      
      // Add image to PDF - single page (most quotations fit on one page)
      // If content is taller than one page, it will be scaled to fit
      pdf.addImage(imgData, 'JPEG', x, y, outWidth, outHeight);

      pdf.save(`Quotation-${quotationNumber}.pdf`);
      
      // Dismiss loading and show success
      toast.dismiss();
      toast.success('PDF exported successfully');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.dismiss();
      toast.error('Failed to export PDF');
    } finally {
      // Restore original styles and classes to hide element again
      if (element) {
        element.className = originalClasses; // Restore original classes (including print-only)
        element.style.position = originalStyles.position || '';
        element.style.left = originalStyles.left || '';
        element.style.top = originalStyles.top || '';
        element.style.visibility = originalStyles.visibility || '';
        element.style.display = originalStyles.display || '';
        element.style.height = originalStyles.height || '';
        element.style.width = originalStyles.width || '';
        element.style.maxWidth = originalStyles.maxWidth || '';
        element.style.zIndex = originalStyles.zIndex || '';
        element.style.opacity = '';
        element.style.pointerEvents = '';
      }
    }
  };

  // WhatsApp Sharing Functions
  const WhatsAppSharing = {
    // Format phone number for WhatsApp
    formatPhoneNumber: (phone: string) => {
      // Remove all non-digits
      let cleaned = phone.replace(/\D/g, '');
      
      // Add country code if not present (assuming India +91)
      if (cleaned.length === 10 && !cleaned.startsWith('91')) {
        cleaned = '91' + cleaned;
      }
      
      return cleaned;
    },

    // Generate quotation summary message
    generateQuotationMessage: (customer: any, quotationNumber: string, grandTotal: number, orderDate: string, companyName: string) => {
      return encodeURIComponent(
        `🏢 *${companyName}*\n\n` +
        `Dear ${customer.company_name},\n\n` +
        `Thank you for your inquiry! Please find your quotation details below:\n\n` +
        `📋 *Quotation No:* ${quotationNumber}\n` +
        `💰 *Total Amount:* ${formatCurrency(grandTotal)}\n` +
        `📅 *Date:* ${formatDateIndian(orderDate)}\n` +
        `📞 *Contact:* ${customer.contact_person || 'Sales Team'}\n\n` +
        `✅ *Next Steps:*\n` +
        `• Review the quotation details\n` +
        `• Confirm your order\n` +
        `• We'll process immediately\n\n` +
        `We look forward to serving you!\n\n` +
        `*Reply to this message for any queries.*`
      );
    },

    // Generate PDF instruction message
    generatePDFMessage: (customer: any, quotationNumber: string, grandTotal: number, companyName: string) => {
      return encodeURIComponent(
        `🏢 *${companyName}*\n\n` +
        `Dear ${customer.company_name},\n\n` +
        `Your detailed quotation PDF has been prepared!\n\n` +
        `📋 *Quotation:* ${quotationNumber}\n` +
        `💰 *Amount:* ${formatCurrency(grandTotal)}\n\n` +
        `📎 *The PDF file has been downloaded to your device.*\n` +
        `Please attach it to this chat to share the complete quotation.\n\n` +
        `🔄 *How to attach:*\n` +
        `1. Click the attachment (📎) button\n` +
        `2. Select "Document"\n` +
        `3. Choose the downloaded PDF\n` +
        `4. Send\n\n` +
        `Thank you for choosing us! 🙏`
      );
    },

    // Open WhatsApp with message
    openWhatsApp: (phone: string, message: string) => {
      const formattedPhone = WhatsAppSharing.formatPhoneNumber(phone);
      const whatsappUrl = `https://wa.me/${formattedPhone}?text=${message}`;
      window.open(whatsappUrl, '_blank');
    }
  };

  // Email Sharing Functions
  const EmailSharing = {
    // Generate professional email subject
    generateSubject: (quotationNumber: string, companyName: string) => {
      return `Quotation ${quotationNumber} - ${companyName}`;
    },

    // Generate quotation summary email body
    generateQuotationEmail: (customer: any, quotationNumber: string, grandTotal: number, orderDate: string, companyName: string, salesManagerName: string) => {
      return encodeURIComponent(
        `Dear ${customer.contact_person || customer.company_name},\n\n` +
        `Thank you for your interest in our products. Please find below the quotation details:\n\n` +
        `QUOTATION DETAILS:\n` +
        `• Quotation Number: ${quotationNumber}\n` +
        `• Date: ${formatDateIndian(orderDate)}\n` +
        `• Total Amount: ${formatCurrency(grandTotal)}\n` +
        `• Sales Manager: ${salesManagerName || 'Sales Team'}\n\n` +
        `NEXT STEPS:\n` +
        `1. Review the quotation details\n` +
        `2. Contact us for any clarifications\n` +
        `3. Confirm your order to proceed\n\n` +
        `We are committed to providing you with the best quality products and services. Please feel free to reach out if you have any questions.\n\n` +
        `Thank you for choosing ${companyName}.\n\n` +
        `Best regards,\n` +
        `${salesManagerName || 'Sales Team'}\n` +
        `${companyName}`
      );
    },

    // Generate follow-up email body
    generateFollowUpEmail: (customer: any, quotationNumber: string, companyName: string, salesManagerName: string) => {
      return encodeURIComponent(
        `Dear ${customer.contact_person || customer.company_name},\n\n` +
        `I hope this email finds you well.\n\n` +
        `This is a follow-up regarding your quotation ${quotationNumber} that we sent earlier.\n\n` +
        `We would love to discuss:\n` +
        `• Any questions you might have about the quotation\n` +
        `• Customization options if needed\n` +
        `• Timeline for delivery\n` +
        `• Payment terms and conditions\n\n` +
        `Please let us know when would be a convenient time for a quick call or meeting.\n\n` +
        `We value your business and look forward to working with you.\n\n` +
        `Best regards,\n` +
        `${salesManagerName || 'Sales Team'}\n` +
        `${companyName}`
      );
    },

    // Open email client
    openEmail: (email: string, subject: string, body: string) => {
      const emailUrl = `mailto:${email}?subject=${subject}&body=${body}`;
      window.open(emailUrl, '_blank');
    }
  };

  // Enhanced sharing functions
  const handleShareQuotationSummary = () => {
    if (!customer?.phone) {
      toast.error('Customer phone number not available');
      return;
    }

    const companyName = company?.company_name || 'Our Company';
    const message = WhatsAppSharing.generateQuotationMessage(
      customer, 
      quotationNumber, 
      grandTotal, 
      order.order_date, 
      companyName
    );

    WhatsAppSharing.openWhatsApp(customer.phone, message);
    toast.success('WhatsApp opened with quotation summary');
  };

  const handleSharePDFToWhatsApp = async () => {
    if (!customer?.phone) {
      toast.error('Customer phone number not available');
      return;
    }

    try {
      // Generate and download PDF
      if (!printRef.current) return;
      
      toast.info('Generating PDF...');
      
      const canvas = await html2canvas(printRef.current, { 
        scale: 2, 
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 20;
      
      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save(`Quotation-${quotationNumber}.pdf`);
      
      // Open WhatsApp with PDF instruction message
      const companyName = company?.company_name || 'Our Company';
      const message = WhatsAppSharing.generatePDFMessage(
        customer, 
        quotationNumber, 
        grandTotal, 
        companyName
      );
      
      WhatsAppSharing.openWhatsApp(customer.phone, message);
      
      toast.success('PDF downloaded! WhatsApp opened with instructions.');
    } catch (error) {
      console.error('Error generating PDF for WhatsApp:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const handleQuickContact = () => {
    if (!customer?.phone) {
      toast.error('Customer phone number not available');
      return;
    }

    const companyName = company?.company_name || 'Our Company';
    const message = encodeURIComponent(
      `🏢 *${companyName}*\n\n` +
      `Hello ${customer.company_name}!\n\n` +
      `How can we assist you today?\n\n` +
      `📋 *Regarding:* Quotation ${quotationNumber}\n\n` +
      `We're here to help! 😊`
    );

    WhatsAppSharing.openWhatsApp(customer.phone, message);
    toast.success('WhatsApp opened for quick contact');
  };

  // Enhanced Email Functions
  const handleSendQuotationEmail = () => {
    if (!customer?.email) {
      toast.error('Customer email not available');
      return;
    }

    const companyName = company?.company_name || 'Our Company';
    const salesManagerName = salesManager?.full_name || 'Sales Team';
    const subject = EmailSharing.generateSubject(quotationNumber, companyName);
    const body = EmailSharing.generateQuotationEmail(
      customer,
      quotationNumber,
      grandTotal,
      order.order_date,
      companyName,
      salesManagerName
    );

    EmailSharing.openEmail(customer.email, subject, body);
    toast.success('Email client opened with quotation details');
  };

  const handleSendFollowUpEmail = () => {
    if (!customer?.email) {
      toast.error('Customer email not available');
      return;
    }

    const companyName = company?.company_name || 'Our Company';
    const salesManagerName = salesManager?.full_name || 'Sales Team';
    const subject = `Follow-up: ${EmailSharing.generateSubject(quotationNumber, companyName)}`;
    const body = EmailSharing.generateFollowUpEmail(
      customer,
      quotationNumber,
      companyName,
      salesManagerName
    );

    EmailSharing.openEmail(customer.email, subject, body);
    toast.success('Email client opened for follow-up');
  };

  const handleSendPDFEmail = async () => {
    if (!customer?.email) {
      toast.error('Customer email not available');
      return;
    }

    try {
      // Generate and download PDF
      if (!printRef.current) return;
      
      toast.info('Generating PDF...');
      
      const canvas = await html2canvas(printRef.current, { 
        scale: 2, 
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 20;
      
      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save(`Quotation-${quotationNumber}.pdf`);
      
      // Open email with PDF attachment instructions
      const companyName = company?.company_name || 'Our Company';
      const subject = `Quotation ${quotationNumber} - ${companyName} (PDF Attached)`;
      const body = encodeURIComponent(
        `Dear ${customer.contact_person || customer.company_name},\n\n` +
        `Please find attached the detailed quotation PDF for your reference.\n\n` +
        `Quotation Details:\n` +
        `• Quotation Number: ${quotationNumber}\n` +
        `• Total Amount: ${formatCurrency(grandTotal)}\n` +
        `• Date: ${formatDateIndian(order.order_date)}\n\n` +
        `Note: The PDF file has been downloaded to your device. Please attach it to this email before sending.\n\n` +
        `Thank you for your business.\n\n` +
        `Best regards,\n` +
        `${salesManager?.full_name || 'Sales Team'}\n` +
        `${companyName}`
      );

      EmailSharing.openEmail(customer.email, subject, body);
      
      toast.success('PDF downloaded! Email client opened with attachment instructions.');
    } catch (error) {
      console.error('Error generating PDF for email:', error);
      toast.error('Failed to generate PDF');
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!order || !customer) return <div>Quotation not found</div>;

  // Calculate totals
  const subtotal = orderItems.reduce((sum, item) => {
    let amount = 0;
    if (item.size_prices && item.sizes_quantities) {
      amount = calculateSizeBasedTotal(item.sizes_quantities, item.size_prices, item.unit_price);
    } else if (item.specifications?.size_prices && item.specifications?.sizes_quantities) {
      amount = calculateSizeBasedTotal(item.specifications.sizes_quantities, item.specifications.size_prices, item.unit_price);
    } else {
      amount = item.quantity * item.unit_price;
    }
    return sum + amount;
  }, 0);
  const gstTotal = orderItems.reduce((sum, item) => {
    let amount = 0;
    if (item.size_prices && item.sizes_quantities) {
      amount = calculateSizeBasedTotal(item.sizes_quantities, item.size_prices, item.unit_price);
    } else if (item.specifications?.size_prices && item.specifications?.sizes_quantities) {
      amount = calculateSizeBasedTotal(item.specifications.sizes_quantities, item.specifications.size_prices, item.unit_price);
    } else {
      amount = item.quantity * item.unit_price;
    }
    const gstRate = (item as any).gst_rate ?? 
                   ((item.specifications as any)?.gst_rate) ?? 
                   (order.gst_rate ?? 0);
    return sum + (amount * gstRate) / 100;
  }, 0);
  const additionalChargesTotal = additionalCharges.reduce((sum, charge) => sum + charge.amount_incl_gst, 0);
  const grandTotal = subtotal + gstTotal + additionalChargesTotal;

  return (
    <ErpLayout>
      <div className="space-y-6">
        {/* Back Button */}
        <div className="flex items-center">
          <Button variant="outline" onClick={() => navigate('/accounts/quotations')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Quotations
          </Button>
        </div>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Quotation #{quotationNumber}</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer className="w-4 h-4 mr-1" /> Print
                </Button>
                
                <Button variant="outline" onClick={handleExportPDF}>
                  <Download className="w-4 h-4 mr-1" /> Export PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/accounts/receipts', {
                    state: {
                      prefill: {
                        type: 'order',
                        id,
                        number: order.order_number,
                        date: order.order_date,
                        customer_id: order.customer_id,
                        amount: grandTotal,
                      },
                      tab: 'create'
                    }
                  })}
                >
                  <CreditCard className="w-4 h-4 mr-1" /> Create Receipt
                </Button>
                
                {/* Enhanced Email Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <Mail className="w-4 h-4 mr-1" />
                      Email
                      <ChevronDown className="w-3 h-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Send via Email</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    
                    <DropdownMenuItem onClick={handleSendQuotationEmail}>
                      <Send className="w-4 h-4 mr-2" />
                      Send Quotation
                      <span className="ml-auto text-xs text-muted-foreground">Summary</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem onClick={handleSendPDFEmail}>
                      <FileText className="w-4 h-4 mr-2" />
                      Send with PDF
                      <span className="ml-auto text-xs text-muted-foreground">Detailed</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuSeparator />
                    
                    <DropdownMenuItem onClick={handleSendFollowUpEmail}>
                      <Mail className="w-4 h-4 mr-2" />
                      Follow-up Email
                      <span className="ml-auto text-xs text-muted-foreground">Follow-up</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                
                {/* Enhanced WhatsApp Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <MessageCircle className="w-4 h-4 mr-1" />
                      WhatsApp
                      <ChevronDown className="w-3 h-3 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Send via WhatsApp</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    
                    <DropdownMenuItem onClick={handleShareQuotationSummary}>
                      <Share className="w-4 h-4 mr-2" />
                      Share Summary
                      <span className="ml-auto text-xs text-muted-foreground">Quick</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem onClick={handleSharePDFToWhatsApp}>
                      <FileText className="w-4 h-4 mr-2" />
                      Share PDF
                      <span className="ml-auto text-xs text-muted-foreground">Detailed</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuSeparator />
                    
                    <DropdownMenuItem onClick={handleQuickContact}>
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Quick Contact
                      <span className="ml-auto text-xs text-muted-foreground">Chat</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Print Styles - Outside printRef to prevent CSS from showing in preview */}
            {/* These styles match PDF export exactly - same format as screen view, not compact */}
            <style>{`
              /* Print-only styles - hide everything except quotation content */
              /* Match PDF export: 3mm margins on all sides */
              @page { 
                size: A4 portrait; 
                margin: 1mm 1mm 1mm 1mm; 
              }
              
              @media print {
                /* Hide all non-print elements */
                body * { visibility: hidden !important; }
                #quotation-print, #quotation-print * { 
                  visibility: visible !important; 
                }
                #quotation-print { 
                  position: absolute !important; 
                  left: 0 !important; 
                  top: 0 !important; 
                  width: 100% !important;
                  max-width: 100% !important;
                  height: auto !important;
                  /* Match PDF export: 3mm padding (same as PDF margins) */
                  padding: 2mm !important; 
                  margin: 0 !important;
                  /* Reduced font size for A4 fit */
                  font-size: 12px !important;
                  line-height: 1.4 !important;
                  background: white !important;
                  page-break-inside: avoid !important;
                  page-break-after: avoid !important;
                  /* Ensure content fits within page margins */
                  box-sizing: border-box !important;
                }
                
                /* Hide header, navigation, buttons, etc. */
                header, nav, .header, .navigation, .print\\:hidden, 
                button, .btn, [role="button"], .card-header, .card-footer,
                .flex.gap-2, .dropdown-menu, .dropdown-content,
                .screen-only { 
                  display: none !important; 
                }
                
                /* Show print view */
                .print-only { 
                  display: block !important; 
                  visibility: visible !important;
                  position: absolute !important;
                  left: 0 !important;
                  top: 0 !important;
                }
                
                /* Reduced spacing for A4 fit - very compact */
                #quotation-print .mb-6 { margin-bottom: 6px !important; }
                #quotation-print .mb-4 { margin-bottom: 5px !important; }
                #quotation-print .mb-3 { margin-bottom: 4px !important; }
                #quotation-print .mb-2 { margin-bottom: 2px !important; }
                #quotation-print .mt-6 { margin-top: 6px !important; }
                #quotation-print .mt-4 { margin-top: 4px !important; }
                #quotation-print .mt-3 { margin-top: 3px !important; }
                #quotation-print .pt-4 { padding-top: 4px !important; }
                #quotation-print .pt-3 { padding-top: 3px !important; }
                #quotation-print .pb-4 { padding-bottom: 4px !important; }
                #quotation-print .p-4 { padding: 8px !important; }
                #quotation-print .p-2 { padding: 4px !important; }
                #quotation-print .space-y-2 > * + * { margin-top: 2px !important; }
                #quotation-print .mt-4 { margin-top: 10px !important; }
                #quotation-print .mt-3 { margin-top: 8px !important; }
                #quotation-print .mt-2 { margin-top: 4px !important; }
                #quotation-print .pt-4 { padding-top: 4px !important; }
                #quotation-print .pt-3 { padding-top: 3px !important; }
                #quotation-print .pt-2 { padding-top: 2px !important; }
                #quotation-print .pb-4 { padding-bottom: 4px !important; }
                #quotation-print .pb-3 { padding-bottom: 3px !important; }
                #quotation-print .pb-2 { padding-bottom: 2px !important; }
                #quotation-print .p-4 { padding: 6px !important; }
                #quotation-print .p-6 { padding: 8px !important; }
                #quotation-print .p-3 { padding: 4px !important; }
                #quotation-print .p-2 { padding: 3px !important; }
                #quotation-print .p-1 { padding: 2px !important; }
                
                /* Reduced table styling for A4 fit - very compact */
                #quotation-print table { 
                  font-size: 9px !important;
                  border-collapse: collapse !important;
                  width: 100% !important;
                  margin: 3px 0 !important;
                }
                #quotation-print table th, 
                #quotation-print table td { 
                  padding: 2px 4px !important; 
                  border: 1px solid #000 !important;
                  font-size: 9px !important;
                  line-height: 1.15 !important; 
                  vertical-align: top !important;
                }
                #quotation-print table td {
                  min-height: auto !important;
                }
                #quotation-print table .w-16 { width: 25px !important; }
                #quotation-print table .h-16 { height: 25px !important; }
                
                /* Reduced text sizes for A4 fit - very compact */
                #quotation-print h1 { font-size: 14px !important; margin: 2px 0 !important; }
                #quotation-print h2 { font-size: 18px !important; margin: 2px 0 !important; }
                #quotation-print h3 { font-size: 12px !important; margin: 2px 0 !important; }
                #quotation-print .text-2xl { font-size: 14px !important; }
                #quotation-print .text-3xl { font-size: 18px !important; }
                #quotation-print .text-lg { font-size: 12px !important; }
                #quotation-print .text-base { font-size: 11px !important; }
                #quotation-print .text-sm { font-size: 10px !important; }
                #quotation-print .text-xs { font-size: 8px !important; }
                
                /* Logo sizes for A4 fit - compact logo */
                #quotation-print img { 
                  max-width: 100px !important; 
                  max-height: 100px !important; 
                }
                #quotation-print .w-40 { width: 100px !important; }
                #quotation-print .h-40 { height: 100px !important; }
                #quotation-print .w-56 { width: 100px !important; }
                #quotation-print .h-56 { height: 100px !important; }
                #quotation-print .w-28 { width: 140px !important; }
                #quotation-print .h-28 { height: 140px !important; }
                #quotation-print .w-16 { width: 50px !important; }
                #quotation-print .h-16 { height: 50px !important; }
                #quotation-print .w-44 { width: 140px !important; }
                #quotation-print .h-36 { height: 115px !important; }
                
                /* Reduced borders and spacing for A4 fit */
                #quotation-print .border-b-2 { border-bottom-width: 1px !important; padding-bottom: 3px !important; }
                #quotation-print .border-t-2 { border-top-width: 1px !important; padding-top: 3px !important; }
                #quotation-print .border-t { border-top-width: 1px !important; padding-top: 2px !important; }
                #quotation-print .space-x-4 > * + * { margin-left: 10px !important; }
                #quotation-print .space-y-2 > * + * { margin-top: 4px !important; }
                #quotation-print .space-y-0\.5 > * + * { margin-top: 2px !important; }
                #quotation-print .gap-4 { gap: 10px !important; }
                #quotation-print .gap-3 { gap: 8px !important; }
                
                /* Prevent page breaks */
                #quotation-print { page-break-inside: avoid !important; }
                #quotation-print table { page-break-inside: auto !important; }
                #quotation-print thead { display: table-header-group; }
                #quotation-print tr { break-inside: avoid; page-break-inside: avoid; }
              }
              
              /* Screen-only styles - hide print view on screen */
              @media screen {
                .print-only { 
                  display: none !important; 
                  visibility: hidden !important;
                }
              }
            `}</style>

            {/* Screen View - Hidden when printing */}
            <div className="screen-only bg-white p-6 rounded-lg shadow-sm">
              <div className="max-w-4xl mx-auto">
                {/* Company Header with Logo */}
                <div className="flex justify-between items-start border-b-2 border-gray-800 pb-4 mb-6">
                  <div className="flex items-center space-x-4">
                    {(company as any)?.logo_url && (
                      <img 
                        src={(company as any).logo_url} 
                        alt="Company Logo" 
                        className="w-56 h-56 object-contain"
                      />
                    )}
                    <div>
                      <h1 className="text-2xl font-bold text-gray-800">{formatCompanyName(company?.company_name)}</h1>
                      <p className="text-sm text-gray-600">{company?.address || 'Company Address'}</p>
                      {company?.contact_email && <p className="text-sm text-gray-600">Email: {company.contact_email}</p>}
                      {company?.contact_phone && <p className="text-sm text-gray-600">Phone: {company.contact_phone}</p>}
                      <p className="text-sm text-gray-600">
                        {company?.city || 'City'}, {company?.state || 'State'} - {company?.pincode || 'Pincode'}
                      </p>
                      {company?.gstin && <p className="text-sm text-gray-600">GSTIN: {company.gstin}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-3xl font-bold text-gray-800">QUOTATION</h2>
                    <p className="text-sm text-gray-600">Quotation #: {quotationNumber}</p>
                    <p className="text-sm text-gray-600">Date: {new Date().toLocaleDateString('en-IN')}</p>
                    <p className="text-sm text-gray-600">Valid Until: {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN')}</p>
                  </div>
                </div>

                {/* Customer Information and Order Details - Side by Side */}
                <div className="mb-6 grid grid-cols-2 gap-4">
                {/* Customer Information */}
                  <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Bill To:</h3>
                  <div className="bg-gray-50 p-4 rounded">
                    <p className="font-semibold text-gray-800">{customer?.company_name || 'Client Name'}</p>
                    <p className="text-sm text-gray-600">{customer?.contact_person || 'Contact Person'}</p>
                    <p className="text-sm text-gray-600">{customer?.address || 'Address'}</p>
                    <p className="text-sm text-gray-600">
                      {customer?.city || 'City'}, {customer?.state || 'State'} - {customer?.pincode || 'Pincode'}
                    </p>
                    <p className="text-sm text-gray-600">GSTIN: {customer?.gstin || 'GSTIN'}</p>
                  </div>
                </div>

                {/* Order Information */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Order Details:</h3>
                    <div className="bg-gray-50 p-4 rounded space-y-2">
                    <div><strong>Order Number:</strong> {order?.order_number || 'N/A'}</div>
                    <div><strong>Order Date:</strong> {order?.order_date ? new Date(order.order_date).toLocaleDateString('en-IN') : 'N/A'}</div>
                    <div><strong>Expected Delivery:</strong> {(order as any).expected_delivery_date ? new Date((order as any).expected_delivery_date).toLocaleDateString('en-IN') : 'TBD'}</div>
                    <div><strong>Sales Manager:</strong> {salesManager?.full_name || 'N/A'}</div>
                    <div><strong>Status:</strong> <span className="capitalize">{order?.status?.replace('_', ' ') || 'N/A'}</span></div>
                    <div><strong>Payment Terms:</strong> {(order as any).payment_channel || 'As per agreement'}</div>
                    </div>
                  </div>
                </div>

                {/* Order Summary Table */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">ORDER SUMMARY</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-400 text-sm">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border border-gray-400 px-3 py-2 text-left font-semibold">Product Details</th>
                          <th className="border border-gray-400 px-3 py-2 text-left font-semibold">Qty</th>
                          <th className="border border-gray-400 px-3 py-2 text-left font-semibold">Price</th>
                          <th className="border border-gray-400 px-3 py-2 text-left font-semibold">Amount</th>
                          <th className="border border-gray-400 px-3 py-2 text-left font-semibold">GST</th>
                          <th className="border border-gray-400 px-3 py-2 text-left font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderItems.map((item, idx) => {
                          // Get size_prices and sizes_quantities
                          let sizePrices: { [size: string]: number } | undefined = undefined;
                          let sizesQuantities: { [size: string]: number } | undefined = undefined;
                          let sizeTypeId: string | null = null;
                          
                          if (item.size_prices && item.sizes_quantities) {
                            sizePrices = item.size_prices;
                            sizesQuantities = item.sizes_quantities;
                            sizeTypeId = (item as any).size_type_id || null;
                          } else if (item.specifications?.size_prices && item.specifications?.sizes_quantities) {
                            sizePrices = item.specifications.size_prices;
                            sizesQuantities = item.specifications.sizes_quantities;
                            sizeTypeId = item.specifications.size_type_id || null;
                          }
                          
                          let amount = 0;
                          if (sizePrices && sizesQuantities) {
                            amount = calculateSizeBasedTotal(sizesQuantities, sizePrices, item.unit_price);
                          } else {
                            amount = item.quantity * item.unit_price;
                          }
                          
                          const gstRate = (item as any).gst_rate ?? 
                                         ((item.specifications as any)?.gst_rate) ?? 
                                         (order?.gst_rate ?? 0);
                          const gstAmt = (amount * gstRate) / 100;
                          const total = amount + gstAmt;
                          
                          // Group sizes by price for display
                          const sizePriceGroups: { [price: string]: { sizes: string[], qty: number } } = {};
                          if (sizesQuantities) {
                            Object.entries(sizesQuantities).forEach(([size, qty]) => {
                              if (qty > 0) {
                                const sizePrice = sizePrices?.[size] ?? item.unit_price;
                                const priceKey = sizePrice.toFixed(2);
                                if (!sizePriceGroups[priceKey]) {
                                  sizePriceGroups[priceKey] = { sizes: [], qty: 0 };
                                }
                                sizePriceGroups[priceKey].sizes.push(size);
                                sizePriceGroups[priceKey].qty += qty;
                              }
                            });
                          }
                          
                          // Sort sizes within each group and then sort groups by price
                          const sortedPriceGroups = Object.entries(sizePriceGroups)
                            .map(([price, data]) => {
                              let sortedSizes: string[] = [];
                              if (sizeTypeId && sizeTypes[sizeTypeId]) {
                                // Convert sizeTypes map to array for the utility function
                                const sizeTypesArray = Object.values(sizeTypes);
                                const sorted = sortSizesQuantitiesUtil(
                                  data.sizes.reduce((acc, s) => ({ ...acc, [s]: 1 }), {}),
                                  sizeTypeId,
                                  sizeTypesArray
                                );
                                sortedSizes = sorted.map(([s]) => s);
                              } else {
                                sortedSizes = data.sizes.sort((a, b) => {
                                  const order = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
                                  const indexA = order.indexOf(a);
                                  const indexB = order.indexOf(b);
                                  return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
                                });
                              }
                              return {
                                price: parseFloat(price),
                                sizes: sortedSizes,
                                qty: data.qty
                              };
                            })
                            .sort((a, b) => a.price - b.price);
                          
                          // Parse specifications for all order types
                          let specs: any = {};
                          try {
                            specs = typeof item.specifications === 'string' 
                              ? JSON.parse(item.specifications) 
                              : item.specifications || {};
                          } catch (e) {
                            specs = item.specifications || {};
                          }
                          
                          const isReadymade = order?.order_type === 'readymade';
                          
                          // Extract branding items from specifications (works for all order types)
                          // Check multiple sources: specifications.branding_items, item.branding_items, or item.specifications.branding_items
                          let brandingItems: any[] = [];
                          if (specs.branding_items && Array.isArray(specs.branding_items) && specs.branding_items.length > 0) {
                            brandingItems = specs.branding_items;
                          } else if ((item as any).branding_items && Array.isArray((item as any).branding_items) && (item as any).branding_items.length > 0) {
                            brandingItems = (item as any).branding_items;
                          } else if (item.specifications && typeof item.specifications === 'object' && (item.specifications as any).branding_items && Array.isArray((item.specifications as any).branding_items) && (item.specifications as any).branding_items.length > 0) {
                            brandingItems = (item.specifications as any).branding_items;
                          }
                          
                          return (
                            <tr key={item.id}>
                              <td className="border border-gray-400 px-3 py-2">
                                <div className="flex items-start gap-3">
                                  {(() => {
                                    const displayImage = getOrderItemDisplayImage(item, order);
                                    return displayImage ? (
                                      <img
                                        src={displayImage}
                                        alt="Product"
                                        className="w-16 h-16 object-cover rounded flex-shrink-0"
                                      />
                                    ) : null;
                                  })()}
                                  <div className="flex-1">
                                    {isReadymade ? (
                                      <>
                                        <div className="font-semibold">{specs.product_name || item.product_description}</div>
                                        <div className="text-sm text-gray-600">
                                          {specs.class && <span>Class: {specs.class}</span>}
                                          {specs.color && <span className="ml-2">Color: {specs.color}</span>}
                                          {specs.category && <span className="ml-2">Category: {specs.category}</span>}
                                        </div>
                                        {specs.sizes_quantities && typeof specs.sizes_quantities === 'object' && Object.keys(specs.sizes_quantities).length > 0 && (
                                          <div className="text-sm text-gray-600 mt-1">
                                            Size-wise: {sortSizes(specs.sizes_quantities, item.size_type_id || specs.size_type_id)
                                              .map(([size, qty]) => `${size}(${qty})`)
                                              .join(', ')}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <div className="text-sm text-gray-600 font-semibold">
                                          {fabrics[item.fabric_id]?.name || 'Fabric'} - {item.color}, {item.gsm}GSM
                                        </div>
                                        <div className="font-semibold">{item.product_description}</div>
                                        <div className="text-sm text-gray-600">{productCategories[item.product_category_id]?.category_name}</div>
                                        {item.sizes_quantities && typeof item.sizes_quantities === 'object' && (
                                          <div className="text-sm text-gray-600">
                                            Sizes: {sortSizes(item.sizes_quantities)
                                              .map(([size, qty]) => `${size}(${qty})`)
                                                .join(', ')}
                                          </div>
                                        )}
                                      </>
                                    )}
                                    
                                    {/* Branding Details - Show for all order types */}
                                    {brandingItems.length > 0 && (
                                      <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
                                        <div className="text-sm font-semibold text-blue-900 mb-1">Branding Details:</div>
                                        <div className="space-y-1">
                                          {brandingItems.map((b: any, i: number) => (
                                            <div key={i} className="text-xs text-blue-800 bg-white p-2 rounded border border-blue-100">
                                              <div className="grid grid-cols-3 gap-2">
                                                <div>
                                                  <span className="font-medium">Type:</span> {b.branding_type || 'N/A'}
                                                </div>
                                                <div>
                                                  <span className="font-medium">Placement:</span> {b.placement || 'N/A'}
                                                </div>
                                                <div>
                                                  <span className="font-medium">Size:</span> {b.measurement || 'N/A'}
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="border border-gray-400 px-3 py-2 text-sm">
                                <div className="font-semibold">{item.quantity} Pcs</div>
                                {sortedPriceGroups.length > 0 && (
                                  <div className="text-xs text-gray-600 space-y-1 mt-1">
                                    {sortedPriceGroups.map((group, groupIndex) => (
                                      <div key={groupIndex}>
                                        {group.sizes.join(', ')}: {group.qty} @ ₹{group.price.toFixed(2)}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="border border-gray-400 px-3 py-2 text-sm">
                                {sortedPriceGroups.length > 0 ? (
                                  <div className="text-xs text-gray-700 space-y-1">
                                    {sortedPriceGroups.map((group, groupIndex) => (
                                      <div key={groupIndex}>
                                        ₹{group.price.toFixed(2)}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  formatCurrency(item.unit_price)
                                )}
                              </td>
                              <td className="border border-gray-400 px-3 py-2 text-right">{formatCurrency(amount)}</td>
                              <td className="border border-gray-400 px-3 py-2 text-center">
                                <div className="text-sm">{gstRate}%</div>
                                <div className="text-sm">{formatCurrency(gstAmt)}</div>
                              </td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-semibold">{formatCurrency(total)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals Summary */}
                <div className="mt-6 border-t-2 border-gray-800 pt-4">
                  <div className="flex justify-end">
                    <div className="w-80 space-y-2">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>{formatCurrency(orderItems.reduce((sum, item) => {
                          let amount = 0;
                          if (item.size_prices && item.sizes_quantities) {
                            amount = calculateSizeBasedTotal(item.sizes_quantities, item.size_prices, item.unit_price);
                          } else if (item.specifications?.size_prices && item.specifications?.sizes_quantities) {
                            amount = calculateSizeBasedTotal(item.specifications.sizes_quantities, item.specifications.size_prices, item.unit_price);
                          } else {
                            amount = item.quantity * item.unit_price;
                          }
                          return sum + amount;
                        }, 0))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>GST Total:</span>
                        <span>{formatCurrency(orderItems.reduce((sum, item) => {
                          let amount = 0;
                          if (item.size_prices && item.sizes_quantities) {
                            amount = calculateSizeBasedTotal(item.sizes_quantities, item.size_prices, item.unit_price);
                          } else if (item.specifications?.size_prices && item.specifications?.sizes_quantities) {
                            amount = calculateSizeBasedTotal(item.specifications.sizes_quantities, item.specifications.size_prices, item.unit_price);
                          } else {
                            amount = item.quantity * item.unit_price;
                          }
                          const gstRate = (item as any).gst_rate ?? ((item.specifications as any)?.gst_rate) ?? (order?.gst_rate ?? 0);
                          return sum + (amount * gstRate) / 100;
                        }, 0))}</span>
                      </div>
                      <div className="border-t border-gray-400 pt-2">
                        <div className="flex justify-between text-lg font-bold">
                          <span>GRAND TOTAL:</span>
                          <span>{formatCurrency(grandTotal)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Amount in Words */}
                  <div className="mt-3 p-2 bg-gray-100 border border-gray-400">
                    <div className="text-sm text-gray-600">Amount in words:</div>
                    <div className="font-bold">INR {numberToWords(Math.round(grandTotal))}</div>
                  </div>
                </div>

                {/* Terms and Conditions */}
                <div className="mt-4 border-t border-gray-400 pt-3">
                  <h3 className="text-sm font-bold text-gray-800 mb-2">Terms & Conditions:</h3>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="space-y-0.5">
                      <div>• Payment: 50% advance, 50% on delivery</div>
                      <div>• Delivery: {(order as any).expected_delivery_date ? new Date((order as any).expected_delivery_date).toLocaleDateString('en-IN') : '15-20 working days'}</div>
                      <div>• Prices inclusive of GST</div>
                    </div>
                    <div className="space-y-0.5">
                      <div>• Subject to change without notice</div>
                      <div>• Quality as per industry standards</div>
                      <div>• Return policy as per guidelines</div>
                    </div>
                    <div className="space-y-0.5">
                      <div>• Installation & training included</div>
                      <div>• Warranty: 1 year from delivery</div>
                      <div>• Support: 9am–6pm, Mon–Sat</div>
                    </div>
                  </div>
                </div>

                {/* Authorized Signatory Section */}
                <div className="mt-4 pt-3 border-t border-gray-400">
                  <div className="flex justify-between items-end">
                    {/* Customer Signature */}
                    <div className="text-center">
                      <div className="border-b border-gray-400 w-40 mb-2"></div>
                      <div className="text-sm text-gray-600">Customer Signature</div>
                    </div>
                    
                    {/* Company Authorized Signatory */}
                    <div className="text-center">
                      <div className="mb-2">
                        {company?.authorized_signatory_url ? (
                          <img 
                            src={company.authorized_signatory_url} 
                            alt="Authorized Signatory" 
                            className="w-44 h-36 object-contain mx-auto"
                          />
                        ) : (
                          <div className="w-44 h-36 border border-gray-300 mx-auto flex items-center justify-center">
                            <span className="text-lg text-gray-400">Signature</span>
                          </div>
                        )}
                      </div>
                      <div className="border-b border-gray-400 w-40 mb-2"></div>
                      <div className="text-sm text-gray-600">Authorized Signatory</div>
                      <div className="text-xs text-gray-500 mt-1">{formatCompanyName(company?.company_name)}</div>
                  </div>
                </div>

                  {/* Footer - Inline with signature section */}
                  <div className="mt-3 pt-2 border-t border-gray-400 text-right text-xs text-gray-600">
                  <div>Generated: {new Date().toLocaleDateString('en-IN')}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Print View - Always rendered but hidden visually, visible for PDF export and print */}
            {/* This element is used for both print and PDF export - format matches exactly */}
            {/* Same 3mm padding as PDF export margins, same width (210mm A4), same styling */}
            <div
              id="quotation-print"
              ref={printRef}
              className="bg-white print-only"
              style={{
                padding: '2mm',
                width: '210mm',
                maxWidth: '210mm',
                margin: '0',
                position: 'absolute',
                left: '0',
                top: '0',
                boxSizing: 'border-box'
              }}
            >
              <div style={{ maxWidth: '100%' }}>
              {/* Company Header with Logo */}
              <div className="flex justify-between items-start border-b-2 border-gray-800 pb-2 mb-3">
                <div className="flex items-center space-x-4">
                    {company?.logo_url && (
                    <img 
                        src={company.logo_url} 
                      alt="Company Logo" 
                        className="w-56 h-56 object-contain"
                    />
                  )}
                  <div>
                      <h1 className="text-2xl font-bold text-gray-800">{formatCompanyName(company?.company_name)}</h1>
                      <p className="text-sm text-gray-600">{company?.address || 'Company Address'}</p>
                      {company?.contact_email && <p className="text-sm text-gray-600">Email: {company.contact_email}</p>}
                      {company?.contact_phone && <p className="text-sm text-gray-600">Phone: {company.contact_phone}</p>}
                      <p className="text-sm text-gray-600">
                        {company?.city || 'City'}, {company?.state || 'State'} - {company?.pincode || 'Pincode'}
                      </p>
                      {company?.gstin && <p className="text-sm text-gray-600">GSTIN: {company.gstin}</p>}
                  </div>
                </div>
                <div className="text-right">
                    <h2 className="text-3xl font-bold text-gray-800">QUOTATION</h2>
                    <p className="text-sm text-gray-600">Quotation #: {quotationNumber}</p>
                    <p className="text-sm text-gray-600">Date: {order?.order_date ? new Date(order.order_date).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN')}</p>
                    <p className="text-sm text-gray-600">Valid Until: {order?.order_date ? new Date(new Date(order.order_date).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN') : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN')}</p>
                </div>
              </div>

                {/* Customer Information and Order Details - Side by Side */}
                <div className="mb-6 grid grid-cols-2 gap-4">
                  {/* Customer Information */}
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Bill To:</h3>
                    <div className="bg-gray-50 p-2 rounded">
                      <p className="font-semibold text-gray-800">{customer?.company_name || 'Client Name'}</p>
                      <p className="text-sm text-gray-600">{customer?.contact_person || 'Contact Person'}</p>
                      <p className="text-sm text-gray-600">{customer?.address || 'Address'}</p>
                      <p className="text-sm text-gray-600">
                        {customer?.city || 'City'}, {customer?.state || 'State'} - {customer?.pincode || 'Pincode'}
                      </p>
                      {customer?.gstin && <p className="text-sm text-gray-600">GSTIN: {customer.gstin}</p>}
                  </div>
                </div>

                  {/* Order Information */}
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-2">Order Details:</h3>
                    <div className="bg-gray-50 p-4 rounded space-y-2">
                      <div><strong>Order Number:</strong> {order?.order_number || 'N/A'}</div>
                      <div><strong>Order Date:</strong> {order?.order_date ? new Date(order.order_date).toLocaleDateString('en-IN') : 'N/A'}</div>
                      <div><strong>Expected Delivery:</strong> {(order as any)?.expected_delivery_date ? new Date((order as any).expected_delivery_date).toLocaleDateString('en-IN') : 'TBD'}</div>
                    <div><strong>Sales Manager:</strong> {salesManager?.full_name || 'N/A'}</div>
                      <div><strong>Status:</strong> <span className="capitalize">{order?.status?.replace('_', ' ') || 'N/A'}</span></div>
                      <div><strong>Payment Terms:</strong> {(order as any)?.payment_channel || 'As per agreement'}</div>
                  </div>
                </div>
              </div>

              {/* Order Summary Table */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">ORDER SUMMARY</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-400 text-sm">
                    <thead>
                    <tr className="bg-gray-100">
                          <th className="border border-gray-400 px-3 py-2 text-left font-semibold">Product Details</th>
                          <th className="border border-gray-400 px-3 py-2 text-left font-semibold">Qty</th>
                          <th className="border border-gray-400 px-3 py-2 text-left font-semibold">Price</th>
                          <th className="border border-gray-400 px-3 py-2 text-left font-semibold">Amount</th>
                          <th className="border border-gray-400 px-3 py-2 text-left font-semibold">GST</th>
                          <th className="border border-gray-400 px-3 py-2 text-left font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderItems.map((item, idx) => {
                        // Get size_prices and sizes_quantities for print view
                        let sizePrices: { [size: string]: number } | undefined = undefined;
                        let sizesQuantities: { [size: string]: number } | undefined = undefined;
                        let sizeTypeId: string | null = null;
                        
                        if (item.size_prices && item.sizes_quantities) {
                          sizePrices = item.size_prices;
                          sizesQuantities = item.sizes_quantities;
                          sizeTypeId = (item as any).size_type_id || null;
                        } else if (item.specifications?.size_prices && item.specifications?.sizes_quantities) {
                          sizePrices = item.specifications.size_prices;
                          sizesQuantities = item.specifications.sizes_quantities;
                          sizeTypeId = item.specifications.size_type_id || null;
                        }
                        
                        let amount = 0;
                        if (sizePrices && sizesQuantities) {
                          amount = calculateSizeBasedTotal(sizesQuantities, sizePrices, item.unit_price);
                        } else {
                          amount = item.quantity * item.unit_price;
                        }
                        
                        const gstRate = (item as any).gst_rate ?? 
                                     ((item.specifications as any)?.gst_rate) ?? 
                                         (order?.gst_rate ?? 0);
                        const gstAmt = (amount * gstRate) / 100;
                        const total = amount + gstAmt;
                        
                        // Group sizes by price for display
                        const sizePriceGroups: { [price: string]: { sizes: string[], qty: number } } = {};
                        if (sizesQuantities) {
                          Object.entries(sizesQuantities).forEach(([size, qty]) => {
                            if (qty > 0) {
                              const sizePrice = sizePrices?.[size] ?? item.unit_price;
                              const priceKey = sizePrice.toFixed(2);
                              if (!sizePriceGroups[priceKey]) {
                                sizePriceGroups[priceKey] = { sizes: [], qty: 0 };
                              }
                              sizePriceGroups[priceKey].sizes.push(size);
                              sizePriceGroups[priceKey].qty += qty;
                            }
                          });
                        }
                        
                        // Sort sizes within each group and then sort groups by price
                        const sortedPriceGroups = Object.entries(sizePriceGroups)
                          .map(([price, data]) => {
                            let sortedSizes: string[] = [];
                            if (sizeTypeId && sizeTypes[sizeTypeId]) {
                              // Convert sizeTypes map to array for the utility function
                              const sizeTypesArray = Object.values(sizeTypes);
                              const sorted = sortSizesQuantitiesUtil(
                                data.sizes.reduce((acc, s) => ({ ...acc, [s]: 1 }), {}),
                                sizeTypeId,
                                sizeTypesArray
                              );
                              sortedSizes = sorted.map(([s]) => s);
                            } else {
                              sortedSizes = data.sizes.sort((a, b) => {
                                const order = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL'];
                                const indexA = order.indexOf(a);
                                const indexB = order.indexOf(b);
                                return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
                              });
                            }
                            return {
                              price: parseFloat(price),
                              sizes: sortedSizes,
                              qty: data.qty
                            };
                          })
                          .sort((a, b) => a.price - b.price);
                        
                        // Parse specifications for all order types
                          let specs: any = {};
                          try {
                            specs = typeof item.specifications === 'string' 
                          ? JSON.parse(item.specifications) 
                          : item.specifications || {};
                          } catch (e) {
                            specs = item.specifications || {};
                          }
                        
                        const isReadymade = order?.order_type === 'readymade';
                        
                        // Extract branding items from specifications (works for all order types)
                        // Check multiple sources: specifications.branding_items, item.branding_items, or item.specifications.branding_items
                        let brandingItems: any[] = [];
                        if (specs.branding_items && Array.isArray(specs.branding_items) && specs.branding_items.length > 0) {
                          brandingItems = specs.branding_items;
                        } else if ((item as any).branding_items && Array.isArray((item as any).branding_items) && (item as any).branding_items.length > 0) {
                          brandingItems = (item as any).branding_items;
                        } else if (item.specifications && typeof item.specifications === 'object' && (item.specifications as any).branding_items && Array.isArray((item.specifications as any).branding_items) && (item.specifications as any).branding_items.length > 0) {
                          brandingItems = (item.specifications as any).branding_items;
                        }
                        
                        return (
                          <tr key={item.id}>
                              <td className="border border-gray-400 px-3 py-2">
                                <div className="flex items-start gap-3">
                                  {(() => {
                                    const displayImage = getOrderItemDisplayImage(item, order);
                                    return displayImage ? (
                                      <img
                                        src={displayImage}
                                        alt="Product"
                                        className="w-16 h-16 object-cover rounded flex-shrink-0"
                                      />
                                    ) : null;
                                  })()}
                                  <div className="flex-1">
                            {isReadymade ? (
                              <>
                                        <div className="font-semibold">{specs.product_name || item.product_description}</div>
                                        <div className="text-sm text-gray-600">
                                  {specs.class && <span>Class: {specs.class}</span>}
                                          {specs.color && <span className="ml-2">Color: {specs.color}</span>}
                                          {specs.category && <span className="ml-2">Category: {specs.category}</span>}
                                </div>
                                {specs.sizes_quantities && typeof specs.sizes_quantities === 'object' && Object.keys(specs.sizes_quantities).length > 0 && (
                                          <div className="text-sm text-gray-600 mt-1">
                                    Size-wise: {sortSizes(specs.sizes_quantities, item.size_type_id || specs.size_type_id)
                                      .map(([size, qty]) => `${size}(${qty})`)
                                      .join(', ')}
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                        <div className="text-sm text-gray-600 font-semibold">
                                  {fabrics[item.fabric_id]?.name || 'Fabric'} - {item.color}, {item.gsm}GSM
                                </div>
                                        <div className="font-semibold">{item.product_description}</div>
                                        <div className="text-sm text-gray-600">{productCategories[item.product_category_id]?.category_name}</div>
                                {item.sizes_quantities && typeof item.sizes_quantities === 'object' && (
                                          <div className="text-sm text-gray-600">
                                    Sizes: {sortSizes(item.sizes_quantities)
                                      .map(([size, qty]) => `${size}(${qty})`)
                                        .join(', ')}
                                  </div>
                                )}
                              </>
                            )}
                            
                            {/* Branding Details - Show for all order types */}
                            {brandingItems.length > 0 && (
                              <div className="mt-1 p-1 bg-blue-50 border border-blue-200 rounded">
                                <div className="text-xs font-semibold text-blue-900 mb-0.5">Branding:</div>
                                <div className="space-y-0.5">
                                  {brandingItems.map((b: any, i: number) => (
                                    <div key={i} className="text-xs text-blue-800 bg-white p-1 rounded border border-blue-100">
                                      <div className="grid grid-cols-3 gap-1">
                                        <div>
                                          <span className="font-medium">Type:</span> {b.branding_type || 'N/A'}
                                        </div>
                                        <div>
                                          <span className="font-medium">Placement:</span> {b.placement || 'N/A'}
                                        </div>
                                        <div>
                                          <span className="font-medium">Size:</span> {b.measurement || 'N/A'}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                                  </div>
                                </div>
                          </td>
                              <td className="border border-gray-400 px-3 py-2 text-sm">
                                <div className="font-semibold">{item.quantity} Pcs</div>
                                {sortedPriceGroups.length > 0 && (
                                  <div className="text-xs text-gray-600 space-y-1 mt-1">
                                    {sortedPriceGroups.map((group, groupIndex) => (
                                      <div key={groupIndex}>
                                        {group.sizes.join(', ')}: {group.qty} @ ₹{group.price.toFixed(2)}
                                      </div>
                                    ))}
                                  </div>
                                )}
                          </td>
                              <td className="border border-gray-400 px-3 py-2 text-sm">
                                {sortedPriceGroups.length > 0 ? (
                                  <div className="text-xs text-gray-700 space-y-1">
                                    {sortedPriceGroups.map((group, groupIndex) => (
                                      <div key={groupIndex}>
                                        ₹{group.price.toFixed(2)}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  formatCurrency(item.unit_price)
                                )}
                              </td>
                              <td className="border border-gray-400 px-3 py-2 text-right">{formatCurrency(amount)}</td>
                              <td className="border border-gray-400 px-3 py-2 text-center">
                                <div className="text-sm">{gstRate}%</div>
                                <div className="text-sm">{formatCurrency(gstAmt)}</div>
                            </td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-semibold">{formatCurrency(total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </div>

              {/* Totals Summary */}
                <div className="mt-6 border-t-2 border-gray-800 pt-4">
                <div className="flex justify-end">
                    <div className="w-80 space-y-2">
                      <div className="flex justify-between">
                      <span>Subtotal:</span>
                        <span>{formatCurrency(orderItems.reduce((sum, item) => {
                          let amount = 0;
                          if (item.size_prices && item.sizes_quantities) {
                            amount = calculateSizeBasedTotal(item.sizes_quantities, item.size_prices, item.unit_price);
                          } else if (item.specifications?.size_prices && item.specifications?.sizes_quantities) {
                            amount = calculateSizeBasedTotal(item.specifications.sizes_quantities, item.specifications.size_prices, item.unit_price);
                          } else {
                            amount = item.quantity * item.unit_price;
                          }
                          return sum + amount;
                        }, 0))}</span>
                    </div>
                      <div className="flex justify-between">
                      <span>GST Total:</span>
                        <span>{formatCurrency(orderItems.reduce((sum, item) => {
                          let amount = 0;
                          if (item.size_prices && item.sizes_quantities) {
                            amount = calculateSizeBasedTotal(item.sizes_quantities, item.size_prices, item.unit_price);
                          } else if (item.specifications?.size_prices && item.specifications?.sizes_quantities) {
                            amount = calculateSizeBasedTotal(item.specifications.sizes_quantities, item.specifications.size_prices, item.unit_price);
                          } else {
                            amount = item.quantity * item.unit_price;
                          }
                          const gstRate = (item as any).gst_rate ?? ((item.specifications as any)?.gst_rate) ?? (order?.gst_rate ?? 0);
                          return sum + (amount * gstRate) / 100;
                        }, 0))}</span>
                    </div>
                    {additionalChargesTotal > 0 && (
                        <div className="flex justify-between">
                        <span>Additional Charges:</span>
                        <span>{formatCurrency(additionalChargesTotal)}</span>
                      </div>
                    )}
                      <div className="border-t border-gray-400 pt-2">
                        <div className="flex justify-between text-lg font-bold">
                        <span>GRAND TOTAL:</span>
                          <span>{formatCurrency(grandTotal)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Amount in Words */}
                  <div className="mt-3 p-2 bg-gray-100 border border-gray-400">
                    <div className="text-sm text-gray-600">Amount in words:</div>
                    <div className="font-bold">INR {numberToWords(Math.round(grandTotal))}</div>
                </div>
              </div>

              {/* Terms and Conditions */}
                <div className="mt-4 border-t border-gray-400 pt-3">
                  <h3 className="text-sm font-bold text-gray-800 mb-2">Terms & Conditions:</h3>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="space-y-0.5">
                    <div>• Payment: 50% advance, 50% on delivery</div>
                      <div>• Delivery: {(order as any)?.expected_delivery_date ? new Date((order as any).expected_delivery_date).toLocaleDateString('en-IN') : '15-20 working days'}</div>
                    <div>• Prices inclusive of GST</div>
                  </div>
                  <div className="space-y-0.5">
                    <div>• Subject to change without notice</div>
                    <div>• Quality as per industry standards</div>
                    <div>• Return policy as per guidelines</div>
                  </div>
                  <div className="space-y-0.5">
                    <div>• Installation & training included</div>
                    <div>• Warranty: 1 year from delivery</div>
                    <div>• Support: 9am–6pm, Mon–Sat</div>
                  </div>
                </div>
              </div>

              {/* Authorized Signatory Section */}
                <div className="mt-4 pt-3 border-t border-gray-400">
                <div className="flex justify-between items-end">
                  {/* Customer Signature */}
                  <div className="text-center">
                      <div className="border-b border-gray-400 w-40 mb-2"></div>
                      <div className="text-sm text-gray-600">Customer Signature</div>
                  </div>
                  
                  {/* Company Authorized Signatory */}
                  <div className="text-center">
                    <div className="mb-2">
                      {company?.authorized_signatory_url ? (
                        <img 
                          src={company.authorized_signatory_url} 
                          alt="Authorized Signatory" 
                          className="w-44 h-36 object-contain mx-auto"
                        />
                      ) : (
                        <div className="w-44 h-36 border border-gray-300 mx-auto flex items-center justify-center">
                            <span className="text-lg text-gray-400">Signature</span>
                        </div>
                      )}
                    </div>
                      <div className="border-b border-gray-400 w-40 mb-2"></div>
                      <div className="text-sm text-gray-600">Authorized Signatory</div>
                      <div className="text-xs text-gray-500 mt-1">{formatCompanyName(company?.company_name)}</div>
                </div>
              </div>

                {/* Footer - Inline with signature section */}
                <div className="mt-3 pt-2 border-t border-gray-400 text-right text-xs text-gray-600">
                <div>Generated: {new Date().toLocaleDateString('en-IN')}</div>
                </div>
              </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ErpLayout>
  );
} 