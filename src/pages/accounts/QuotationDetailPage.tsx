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
        .eq('id', orderId)
        .single();
      if (orderError) throw orderError;
      setOrder(orderData);
      // Fetch customer
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', orderData.customer_id)
        .single();
      if (customerError) throw customerError;
      setCustomer(customerData);
      // Fetch sales manager name if available
      if (orderData.sales_manager) {
        const { data: salesManagerData } = await supabase
          .from('employees')
          .select('id, full_name')
          .eq('id', orderData.sales_manager)
          .single();
        setSalesManager(salesManagerData);
      } else {
        setSalesManager(null);
      }
      // Fetch order items
      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select('*, mockup_images, specifications, category_image_url')
        .eq('order_id', orderId);
      if (itemsError) throw itemsError;
      setOrderItems(itemsData || []);
      // Fetch product categories and fabrics for items
      if (itemsData && itemsData.length > 0) {
        const fabricIds = itemsData.map(item => item.fabric_id).filter(Boolean);
        const categoryIds = itemsData.map(item => item.product_category_id).filter(Boolean);
        if (fabricIds.length > 0) {
          const { data: fabricsData } = await supabase
            .from('fabric_master')
            .select('id, fabric_name')
            .in('id', fabricIds);
          if (fabricsData) {
            const fabricsMap = fabricsData.reduce((acc, fabric) => {
              acc[fabric.id] = { ...fabric, name: fabric.fabric_name };
              return acc;
            }, {} as { [key: string]: Fabric });
            setFabrics(fabricsMap);
          }
        }
        if (categoryIds.length > 0) {
          const { data: categoriesData } = await supabase
            .from('product_categories')
            .select('id, category_name')
            .in('id', categoryIds);
          if (categoriesData) {
            const categoriesMap = categoriesData.reduce((acc, category) => {
              acc[category.id] = category;
              return acc;
            }, {} as { [key: string]: ProductCategory });
            setProductCategories(categoriesMap);
          }
        }
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
      const lastNum = data[0].quotation_number;
      const match = lastNum.match(/(\d+)$/);
      if (match) nextSeq = parseInt(match[1]) + 1;
    }
    const seqStr = nextSeq.toString().padStart(3, '0');
    return `SO/${fyStr}/${month}/${seqStr}`;
  };

  // Helper: sort sizes in proper order (S, M, L, XL, XXL, etc.)
  function sortSizes(sizes: { [key: string]: number }): Array<[string, number]> {
    const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50'];
    
    return Object.entries(sizes)
      .filter(([_, qty]) => (qty as number) > 0)
      .sort(([a], [b]) => {
        const indexA = sizeOrder.indexOf(a.toUpperCase());
        const indexB = sizeOrder.indexOf(b.toUpperCase());
        
        // If both sizes are in the predefined order, sort by that order
        if (indexA !== -1 && indexB !== -1) {
          return indexA - indexB;
        }
        
        // If only one is in the predefined order, prioritize it
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        
        // If neither is in the predefined order, sort alphabetically
        return a.localeCompare(b);
      });
  }

  // Helper: number to words
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

  // Enhanced PDF Export with proper A4 sizing
  const handleExportPDF = async () => {
    if (!printRef.current) return;
    try {
      toast.info('Generating PDF...');
      
      const canvas = await html2canvas(printRef.current, { 
        scale: 2, 
        useCORS: true,
        backgroundColor: '#ffffff',
        width: printRef.current.scrollWidth,
        height: printRef.current.scrollHeight,
        logging: false
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // A4 dimensions in mm
      const pdfWidth = 210;
      const pdfHeight = 297;
      const margin = 0; // No margin since we added padding in the content
      
      // Calculate dimensions
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(
        (pdfWidth - 2 * margin) / (imgWidth / 2), // Divide by 2 because scale is 2
        (pdfHeight - 2 * margin) / (imgHeight / 2)
      );
      
      const finalWidth = (imgWidth / 2) * ratio;
      const finalHeight = (imgHeight / 2) * ratio;
      
      // Center the content
      const x = (pdfWidth - finalWidth) / 2;
      const y = (pdfHeight - finalHeight) / 2;
      
      pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
      pdf.save(`Quotation-${quotationNumber}.pdf`);
      toast.success('PDF exported successfully');
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error('Failed to export PDF');
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
  const subtotal = orderItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const gstTotal = orderItems.reduce((sum, item) => {
    const amount = item.quantity * item.unit_price;
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
                        className="w-28 h-28 object-contain"
                      />
                    )}
                    <div>
                      <h1 className="text-2xl font-bold text-gray-800">{(company as any)?.company_name || 'Company Name'}</h1>
                      <p className="text-sm text-gray-600">{(company as any)?.address || 'Company Address'}</p>
                      <p className="text-sm text-gray-600">
                        {(company as any)?.city || 'City'}, {(company as any)?.state || 'State'} - {(company as any)?.pincode || 'Pincode'}
                      </p>
                      <p className="text-sm text-gray-600">GSTIN: {(company as any)?.gstin || 'GSTIN'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <h2 className="text-3xl font-bold text-gray-800">QUOTATION</h2>
                    <p className="text-sm text-gray-600">Quotation #: {quotationNumber}</p>
                    <p className="text-sm text-gray-600">Date: {new Date().toLocaleDateString('en-IN')}</p>
                    <p className="text-sm text-gray-600">Valid Until: {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN')}</p>
                  </div>
                </div>

                {/* Customer Information */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Bill To:</h3>
                  <div className="bg-gray-50 p-4 rounded">
                    <p className="font-semibold text-gray-800">{customer?.company_name || 'Customer Name'}</p>
                    <p className="text-sm text-gray-600">{customer?.contact_person || 'Contact Person'}</p>
                    <p className="text-sm text-gray-600">{customer?.address || 'Address'}</p>
                    <p className="text-sm text-gray-600">
                      {customer?.city || 'City'}, {customer?.state || 'State'} - {customer?.pincode || 'Pincode'}
                    </p>
                    <p className="text-sm text-gray-600">GSTIN: {customer?.gstin || 'GSTIN'}</p>
                  </div>
                </div>

                {/* Order Information */}
                <div className="mb-6">
                  <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded">
                    <div><strong>Order Number:</strong> {order?.order_number || 'N/A'}</div>
                    <div><strong>Order Date:</strong> {order?.order_date ? new Date(order.order_date).toLocaleDateString('en-IN') : 'N/A'}</div>
                    <div><strong>Expected Delivery:</strong> {(order as any).expected_delivery_date ? new Date((order as any).expected_delivery_date).toLocaleDateString('en-IN') : 'TBD'}</div>
                    <div><strong>Sales Manager:</strong> {salesManager?.full_name || 'N/A'}</div>
                    <div><strong>Status:</strong> <span className="capitalize">{order?.status?.replace('_', ' ') || 'N/A'}</span></div>
                    <div><strong>Payment Terms:</strong> {(order as any).payment_channel || 'As per agreement'}</div>
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
                          <th className="border border-gray-400 px-3 py-2 text-left font-semibold">Rate</th>
                          <th className="border border-gray-400 px-3 py-2 text-left font-semibold">Amount</th>
                          <th className="border border-gray-400 px-3 py-2 text-left font-semibold">GST</th>
                          <th className="border border-gray-400 px-3 py-2 text-left font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderItems.map((item, idx) => {
                          const amount = item.quantity * item.unit_price;
                          const gstRate = (item as any).gst_rate ?? 
                                         ((item.specifications as any)?.gst_rate) ?? 
                                         (order?.gst_rate ?? 0);
                          const gstAmt = (amount * gstRate) / 100;
                          const total = amount + gstAmt;
                          
                          // Parse specifications for readymade orders
                          let specs: any = {};
                          try {
                            specs = typeof item.specifications === 'string' 
                              ? JSON.parse(item.specifications) 
                              : item.specifications || {};
                          } catch (e) {
                            specs = item.specifications || {};
                          }
                          
                          const isReadymade = order?.order_type === 'readymade';
                          
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
                                            Size-wise: {sortSizes(specs.sizes_quantities)
                                              .map(([size, qty]) => `${size}(${qty})`)
                                              .join(', ')}
                                          </div>
                                        )}
                                        {specs.branding_items && Array.isArray(specs.branding_items) && specs.branding_items.length > 0 && (
                                          <div className="text-sm text-gray-600 mt-1">
                                            Branding: {specs.branding_items.map((b: any, i: number) => 
                                              `${b.branding_type}${b.placement ? ` (${b.placement})` : ''}`
                                            ).join(', ')}
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
                                  </div>
                                </div>
                              </td>
                              <td className="border border-gray-400 px-3 py-2 text-center">
                                <div className="font-semibold">{item.quantity}</div>
                                <div className="text-sm">Pcs</div>
                              </td>
                              <td className="border border-gray-400 px-3 py-2 text-right">{formatCurrency(item.unit_price)}</td>
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
                        <span>{formatCurrency(orderItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>GST Total:</span>
                        <span>{formatCurrency(orderItems.reduce((sum, item) => {
                          const amount = item.quantity * item.unit_price;
                          const gstRate = (item as any).gst_rate ?? ((item.specifications as any)?.gst_rate) ?? (order?.gst_rate ?? 0);
                          return sum + (amount * gstRate) / 100;
                        }, 0))}</span>
                      </div>
                      <div className="border-t border-gray-400 pt-2">
                        <div className="flex justify-between text-lg font-bold">
                          <span>GRAND TOTAL:</span>
                          <span>{formatCurrency(order?.final_amount || 0)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Amount in Words */}
                  <div className="mt-4 p-3 bg-gray-100 border border-gray-400">
                    <div className="text-sm text-gray-600">Amount in words:</div>
                    <div className="font-bold">INR {numberToWords(Math.round(order?.final_amount || 0))}</div>
                  </div>
                </div>

                {/* Terms and Conditions */}
                <div className="mt-6 border-t border-gray-400 pt-4">
                  <h3 className="text-sm font-bold text-gray-800 mb-2">Terms & Conditions:</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="space-y-1">
                      <div>• Payment: 50% advance, 50% on delivery</div>
                      <div>• Delivery: {(order as any).expected_delivery_date ? new Date((order as any).expected_delivery_date).toLocaleDateString('en-IN') : '15-20 working days'}</div>
                      <div>• Prices inclusive of GST</div>
                    </div>
                    <div className="space-y-1">
                      <div>• Subject to change without notice</div>
                      <div>• Quality as per industry standards</div>
                      <div>• Return policy as per guidelines</div>
                    </div>
                    <div className="space-y-1">
                      <div>• Installation & training included</div>
                      <div>• Warranty: 1 year from delivery</div>
                      <div>• Support: 9am–6pm, Mon–Sat</div>
                    </div>
                  </div>
                </div>

                {/* Authorized Signatory Section */}
                <div className="mt-8 pt-4 border-t border-gray-400">
                  <div className="flex justify-between items-end">
                    {/* Customer Signature */}
                    <div className="text-center">
                      <div className="border-b border-gray-400 w-40 mb-2"></div>
                      <div className="text-sm text-gray-600">Customer Signature</div>
                    </div>
                    
                    {/* Company Authorized Signatory */}
                    <div className="text-center">
                      <div className="mb-3">
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
                      <div className="text-xs text-gray-500 mt-1">{company?.company_name || 'Company Name'}</div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-6 pt-3 border-t border-gray-400 text-right text-sm text-gray-600">
                  <div>Generated: {new Date().toLocaleDateString('en-IN')}</div>
                </div>
              </div>
            </div>

            {/* Print View - Only visible when printing */}
            <div
              id="quotation-print"
              ref={printRef}
              className="bg-white print-only"
              style={{ padding: '10mm', width: '210mm', margin: '0 auto', fontSize: '9px', lineHeight: '1.2' }}
            >
              <style>{`
                /* Print-only styles - hide everything except quotation content */
                @page { 
                  size: A4; 
                  margin: 8mm; 
                }
                
                @media print {
                  /* Hide all non-print elements */
                  body * { visibility: hidden; }
                  #quotation-print, #quotation-print * { visibility: visible; }
                  #quotation-print { 
                    position: absolute; 
                    left: 0; 
                    top: 0; 
                    width: 100% !important;
                    height: 100% !important;
                    padding: 8mm !important; 
                    margin: 0 !important;
                    font-size: 11px !important;
                    line-height: 1.3 !important;
                    background: white !important;
                  }
                  
                  /* Hide header, navigation, buttons, etc. */
                  header, nav, .header, .navigation, .print\\:hidden, 
                  button, .btn, [role="button"], .card-header, .card-footer,
                  .flex.gap-2, .dropdown-menu, .dropdown-content { 
                    display: none !important; 
                  }
                  
                  /* Reasonable spacing for readability */
                  #quotation-print .mb-6 { margin-bottom: 12px !important; }
                  #quotation-print .mb-4 { margin-bottom: 8px !important; }
                  #quotation-print .mb-3 { margin-bottom: 6px !important; }
                  #quotation-print .mb-2 { margin-bottom: 4px !important; }
                  #quotation-print .mt-6 { margin-top: 12px !important; }
                  #quotation-print .mt-4 { margin-top: 8px !important; }
                  #quotation-print .mt-3 { margin-top: 6px !important; }
                  #quotation-print .mt-2 { margin-top: 4px !important; }
                  #quotation-print .pt-4 { padding-top: 8px !important; }
                  #quotation-print .pt-3 { padding-top: 6px !important; }
                  #quotation-print .pt-2 { padding-top: 4px !important; }
                  #quotation-print .pb-4 { padding-bottom: 8px !important; }
                  #quotation-print .pb-3 { padding-bottom: 6px !important; }
                  #quotation-print .pb-2 { padding-bottom: 4px !important; }
                  
                  /* Readable table styling */
                  #quotation-print table { 
                    font-size: 10px !important;
                    border-collapse: collapse !important;
                    width: 100% !important;
                  }
                  #quotation-print table th, 
                  #quotation-print table td { 
                    padding: 3px 4px !important; 
                    border: 1px solid #000 !important;
                    font-size: 10px !important;
                    line-height: 1.2 !important; 
                  }
                  
                  /* Readable text sizes */
                  #quotation-print h1 { font-size: 18px !important; margin: 4px 0 !important; }
                  #quotation-print h2 { font-size: 16px !important; margin: 3px 0 !important; }
                  #quotation-print h3 { font-size: 14px !important; margin: 2px 0 !important; }
                  #quotation-print .text-lg { font-size: 14px !important; }
                  #quotation-print .text-base { font-size: 12px !important; }
                  #quotation-print .text-sm { font-size: 10px !important; }
                  #quotation-print .text-xs { font-size: 9px !important; }
                  #quotation-print .text-\[10px\] { font-size: 9px !important; }
                  #quotation-print .text-\[9px\] { font-size: 8px !important; }
                  
                  /* Larger image sizes for print */
                  #quotation-print img { 
                    max-width: 50px !important; 
                    max-height: 50px !important; 
                  }
                  #quotation-print .w-16 { width: 30px !important; }
                  #quotation-print .h-16 { height: 30px !important; }
                  #quotation-print .w-20 { width: 40px !important; }
                  #quotation-print .h-20 { height: 40px !important; }
                  #quotation-print .w-24 { width: 60px !important; }
                  #quotation-print .h-24 { height: 60px !important; }
                  #quotation-print .w-28 { width: 70px !important; }
                  #quotation-print .h-28 { height: 70px !important; }
                  #quotation-print .w-32 { width: 80px !important; }
                  #quotation-print .h-32 { height: 80px !important; }
                  #quotation-print .w-36 { width: 90px !important; }
                  #quotation-print .h-36 { height: 90px !important; }
                  #quotation-print .w-40 { width: 100px !important; }
                  #quotation-print .h-32 { height: 80px !important; }
                  #quotation-print .w-44 { width: 110px !important; }
                  #quotation-print .h-36 { height: 90px !important; }
                  
                  /* Prevent page breaks */
                  .avoid-break { break-inside: avoid; page-break-inside: avoid; }
                  #quotation-print table { page-break-inside: auto; }
                  #quotation-print thead { display: table-header-group; }
                  #quotation-print tr { break-inside: avoid; page-break-inside: avoid; }
                }
                
                /* Screen-only styles */
                @media screen {
                  .print-only { display: none; }
                }
                
                /* Hide screen view when printing */
                @media print {
                  .screen-only { display: none !important; }
                }
              `}</style>
              {/* Company Header with Logo */}
              <div className="flex justify-between items-start border-b-2 border-gray-800 pb-4 mb-6">
                <div className="flex items-center space-x-4">
                  {(company as any)?.logo_url && (
                    <img 
                      src={(company as any).logo_url} 
                      alt="Company Logo" 
                      className="w-36 h-36 object-contain"
                    />
                  )}
                  <div>
                    <h1 className="text-2xl font-bold text-gray-800 mb-1">{company?.company_name || 'Our Company'}</h1>
                    <div className="text-sm text-gray-600">
                      {company?.address} | Email: {(company as any)?.email} | Phone: {(company as any)?.phone}
                      {company?.gstin && <span> | GSTIN: {company?.gstin}</span>}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="bg-primary text-white px-4 py-2 rounded">
                    <h2 className="text-xl font-bold">QUOTATION</h2>
                  </div>
                </div>
              </div>

              {/* Document Details and Total */}
              <div className="flex justify-between items-start mb-3">
                <div className="space-y-1">
                  <div><strong>Quotation #:</strong> {quotationNumber}</div>
                  <div><strong>Date:</strong> {new Date(order.order_date).toLocaleDateString('en-IN')}</div>
                  <div><strong>Valid Until:</strong> {new Date(new Date(order.order_date).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN')}</div>
                </div>
                <div className="text-right">
                  <div className="border-2 border-gray-800 p-3 bg-gray-50">
                    <div className="font-bold text-lg">{formatCurrency(grandTotal)}</div>
                    <div className="text-sm text-gray-600">Total Amount</div>
                  </div>
                </div>
              </div>

              {/* Customer and Order Information */}
              <div className="grid grid-cols-2 gap-6 mb-4">
                {/* Customer Details */}
                <div>
                  <h3 className="text-base font-bold text-gray-800 mb-2 border-b border-gray-400 pb-1">Bill To:</h3>
                  <div className="space-y-1 text-xs">
                    <div className="font-semibold text-sm">{customer.company_name}</div>
                    <div>{customer.contact_person}</div>
                    <div>{customer.address}</div>
                    <div>{customer.city}, {customer.state} - {customer.pincode}</div>
                    <div><strong>Phone:</strong> {customer.phone}</div>
                    <div><strong>Email:</strong> {customer.email}</div>
                    {customer.gstin && <div><strong>GSTIN:</strong> {customer.gstin}</div>}
                  </div>
                </div>

                {/* Order Details */}
                <div>
                  <h3 className="text-base font-bold text-gray-800 mb-2 border-b border-gray-400 pb-1">Order Details:</h3>
                  <div className="space-y-1 text-xs">
                    <div><strong>Order Number:</strong> {order.order_number}</div>
                    <div><strong>Order Date:</strong> {new Date(order.order_date).toLocaleDateString('en-IN')}</div>
                    <div><strong>Expected Delivery:</strong> {(order as any).expected_delivery_date ? new Date((order as any).expected_delivery_date).toLocaleDateString('en-IN') : 'TBD'}</div>
                    <div><strong>Sales Manager:</strong> {salesManager?.full_name || 'N/A'}</div>
                    <div><strong>Status:</strong> <span className="capitalize">{order.status.replace('_', ' ')}</span></div>
                    <div><strong>Payment Terms:</strong> {(order as any).payment_channel || 'As per agreement'}</div>
                  </div>
                </div>
              </div>
              {/* Order Summary Table */}
              <div className="mb-3 avoid-break">
                <h3 className="text-base font-bold text-gray-800 mb-2 border-b border-gray-400 pb-1">ORDER SUMMARY</h3>
                <table className="w-full border-collapse border border-gray-400 text-xs">
                    <thead>
                    <tr className="bg-gray-100">
                       <th className="border border-gray-400 px-1 py-1 text-left font-semibold" style={{ width: '50%' }}>Product Details</th>
                       <th className="border border-gray-400 px-1 py-1 text-left font-semibold" style={{ width: '10%' }}>Qty</th>
                      <th className="border border-gray-400 px-1 py-1 text-left font-semibold" style={{ width: '15%' }}>Rate</th>
                      <th className="border border-gray-400 px-1 py-1 text-left font-semibold" style={{ width: '15%' }}>Amount</th>
                      <th className="border border-gray-400 px-1 py-1 text-left font-semibold" style={{ width: '10%' }}>GST</th>
                      <th className="border border-gray-400 px-1 py-1 text-left font-semibold" style={{ width: '10%' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderItems.map((item, idx) => {
                        const amount = item.quantity * item.unit_price;
                      const gstRate = (item as any).gst_rate ?? 
                                     ((item.specifications as any)?.gst_rate) ?? 
                                     (order.gst_rate ?? 0);
                        const gstAmt = (amount * gstRate) / 100;
                        const total = amount + gstAmt;
                        
                        // Parse specifications for readymade orders
                        const specs = typeof item.specifications === 'string' 
                          ? JSON.parse(item.specifications) 
                          : item.specifications || {};
                        
                        const isReadymade = order?.order_type === 'readymade';
                        
                        return (
                          <tr key={item.id}>
                          <td className="border border-gray-400 px-1 py-1 align-top">
                            {isReadymade ? (
                              <>
                                <div className="font-semibold text-xs">{specs.product_name || item.product_description}</div>
                                <div className="text-xs text-gray-600">
                                  {specs.class && <span>Class: {specs.class}</span>}
                                  {specs.color && <span className="ml-1">Color: {specs.color}</span>}
                                  {specs.category && <span className="ml-1">Category: {specs.category}</span>}
                                </div>
                                {specs.sizes_quantities && typeof specs.sizes_quantities === 'object' && Object.keys(specs.sizes_quantities).length > 0 && (
                                  <div className="text-xs text-gray-600">
                                    Size-wise: {sortSizes(specs.sizes_quantities)
                                      .map(([size, qty]) => `${size}(${qty})`)
                                      .join(', ')}
                                  </div>
                                )}
                                {specs.branding_items && Array.isArray(specs.branding_items) && specs.branding_items.length > 0 && (
                                  <div className="text-xs text-gray-600">
                                    Branding: {specs.branding_items.map((b: any) => 
                                      `${b.branding_type}${b.placement ? ` (${b.placement})` : ''}`
                                    ).join(', ')}
                                  </div>
                                )}
                              </>
                            ) : (
                              <>
                                <div className="font-semibold text-xs">{item.product_description}</div>
                                <div className="text-xs text-gray-600">{productCategories[item.product_category_id]?.category_name}</div>
                                <div className="text-xs text-gray-600">
                                  {fabrics[item.fabric_id]?.name || 'Fabric'} - {item.color}, {item.gsm}GSM
                                </div>
                                {item.sizes_quantities && typeof item.sizes_quantities === 'object' && (
                                  <div className="text-xs text-gray-600">
                                    Sizes: {sortSizes(item.sizes_quantities)
                                      .map(([size, qty]) => `${size}(${qty})`)
                                        .join(', ')}
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                          <td className="border border-gray-400 px-1 py-1 align-top text-center">
                            <div className="font-semibold text-xs">{item.quantity}</div>
                            <div className="text-xs">Pcs</div>
                          </td>
                          <td className="border border-gray-400 px-1 py-1 align-top text-right text-xs">{formatCurrency(item.unit_price)}</td>
                          <td className="border border-gray-400 px-1 py-1 align-top text-right text-xs">{formatCurrency(amount)}</td>
                          <td className="border border-gray-400 px-1 py-1 align-top text-center">
                            <div className="text-xs">{gstRate}%</div>
                            <div className="text-xs">{formatCurrency(gstAmt)}</div>
                            </td>
                          <td className="border border-gray-400 px-1 py-1 align-top text-right font-semibold text-xs">{formatCurrency(total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              {/* Additional Charges Section (if any) */}
              {additionalCharges.length > 0 && (
                <div className="mb-3 avoid-break">
                  <h3 className="text-lg font-bold text-gray-800 mb-3 border-b border-gray-400 pb-1">Additional Charges</h3>
                  <table className="w-full border-collapse border border-gray-400 text-xs">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-400 px-2 py-1 text-left font-semibold">Particular</th>
                        <th className="border border-gray-400 px-2 py-1 text-left font-semibold">Rate</th>
                        <th className="border border-gray-400 px-2 py-1 text-left font-semibold">GST %</th>
                        <th className="border border-gray-400 px-2 py-1 text-left font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {additionalCharges.map((charge, idx) => (
                          <tr key={idx}>
                          <td className="border border-gray-400 px-2 py-1">{charge.particular}</td>
                          <td className="border border-gray-400 px-2 py-1 text-right">{charge.rate}</td>
                          <td className="border border-gray-400 px-2 py-1 text-center">{charge.gst_percentage}%</td>
                          <td className="border border-gray-400 px-2 py-1 text-right">{formatCurrency(charge.amount_incl_gst)}</td>
                          </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Totals Summary */}
              <div className="mt-3 border-t-2 border-gray-800 pt-2 avoid-break">
                <div className="flex justify-end">
                  <div className="w-72 space-y-0.5">
                    <div className="flex justify-between text-xs">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>GST Total:</span>
                      <span>{formatCurrency(gstTotal)}</span>
                    </div>
                    {additionalChargesTotal > 0 && (
                      <div className="flex justify-between text-xs">
                        <span>Additional Charges:</span>
                        <span>{formatCurrency(additionalChargesTotal)}</span>
                      </div>
                    )}
                    <div className="border-t border-gray-400 pt-1 mt-1">
                      <div className="flex justify-between text-base font-bold">
                        <span>GRAND TOTAL:</span>
                        <span>{formatCurrency(grandTotal)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Amount in Words */}
                <div className="mt-2 p-1.5 bg-gray-100 border border-gray-400">
                  <div className="text-xs text-gray-600">Amount in words:</div>
                  <div className="font-bold text-xs">INR {numberToWords(Math.round(grandTotal))}</div>
                </div>
              </div>

              {/* Terms and Conditions */}
              <div className="mt-3 border-t border-gray-400 pt-2 avoid-break">
                <h3 className="text-xs font-bold text-gray-800 mb-1">Terms & Conditions:</h3>
                <div className="grid grid-cols-3 gap-3 text-[10px] leading-tight">
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
              <div className="mt-6 pt-3 border-t border-gray-400 avoid-break">
                <div className="flex justify-between items-end">
                  {/* Customer Signature */}
                  <div className="text-center">
                    <div className="border-b border-gray-400 w-32 mb-1"></div>
                    <div className="text-[10px] text-gray-600">Customer Signature</div>
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
                          <span className="text-[16px] text-gray-400">Signature</span>
                        </div>
                      )}
                    </div>
                    <div className="border-b border-gray-400 w-32 mb-1"></div>
                    <div className="text-[10px] text-gray-600">Authorized Signatory</div>
                    <div className="text-[9px] text-gray-500 mt-1">{company?.company_name || 'Company Name'}</div>
                  </div>
                </div>
              </div>

              {/* Footer (minimal) */}
              <div className="mt-3 pt-2 border-t border-gray-400 text-right text-[10px] text-gray-600">
                <div>Generated: {new Date().toLocaleDateString('en-IN')}</div>
                {/* <div>Contact: {(company as any)?.phone || ''}</div> */}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ErpLayout>
  );
} 