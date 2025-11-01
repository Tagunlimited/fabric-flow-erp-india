import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trash2, Plus, ExternalLink, X, ArrowLeft, Printer, Download, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { ProductImage } from '@/components/ui/OptimizedImage';
import { convertImageToBase64WithCache, createFallbackLogo } from '@/utils/imageUtils';

type CompanySettings = {
  company_name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  logo_url?: string;
  authorized_signatory_url?: string;
  gstin: string;
  contact_phone: string;
  contact_email: string;
};

type LineItem = {
  id?: string;
  item_type: 'fabric' | 'item';
  item_id: string;
  item_name: string;
  item_image_url?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  gst_rate: number;
  gst_amount: number;
  unit_of_measure?: string;
  remarks?: string;
  attributes?: Record<string, any> | null;
  fabricSelections?: { color: string; gsm: string; quantity: number }[];
  itemSelections?: { id: string; label: string; image_url?: string | null; quantity: number }[];
  item_category?: string | null;
  // Fabric-specific fields
  fabric_name?: string;
  fabric_color?: string;
  fabric_gsm?: string;
};

type Invoice = {
  id?: string;
  invoice_number?: string;
  customer_id: string;
  invoice_date: string;
  due_date: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  terms_conditions?: string;
  notes?: string;
  delivery_address?: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
};

type Customer = {
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
};

function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  
  if (num === 0) return 'Zero';
  if (num < 10) return ones[num];
  if (num < 20) return teens[num - 10];
  if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
  if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
  if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
  if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + numberToWords(num % 100000) : '');
  return numberToWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + numberToWords(num % 10000000) : '');
}

export function InvoiceForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEditMode = !!id && searchParams.get('edit') === '1';
  const isReadOnly = !!id && !isEditMode;
  const printRef = useRef<HTMLDivElement>(null);
  
  // Check for Order data in URL params and location state
  const location = useLocation();
  const orderParam = searchParams.get('order');
  const [orderData, setOrderData] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersMap, setCustomersMap] = useState<Record<string, Customer>>({});
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const logoCache = useRef<Map<string, string>>(new Map());
  const [invoice, setInvoice] = useState<Invoice>({
    customer_id: '',
    invoice_date: new Date().toISOString().slice(0, 10),
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // 30 days from now
    status: 'draft',
    delivery_address: '',
    subtotal: 0,
    tax_amount: 0,
    total_amount: 0,
    paid_amount: 0,
    balance_amount: 0,
  });
  const [items, setItems] = useState<LineItem[]>([]);
  // Option lists by type
  const [fabricOptions, setFabricOptions] = useState<{ id: string; label: string; image_url?: string | null }[]>([]);
  const [itemOptions, setItemOptions] = useState<{ id: string; label: string; image_url?: string | null; item_type?: string; uom?: string; type?: string }[]>([]);
  const [productOptions, setProductOptions] = useState<{ id: string; label: string; image_url?: string | null }[]>([]);
  const [itemTypeOptions, setItemTypeOptions] = useState<string[]>([]);

  // Process Order data from URL params
  useEffect(() => {
    if (orderParam) {
      try {
        const parsed = JSON.parse(decodeURIComponent(orderParam));
        setOrderData(parsed);
        console.log('Order data loaded from URL params:', parsed);
      } catch (e) {
        console.error('Failed to parse Order data:', e);
      }
    }
  }, [orderParam]);

  // Process Order data from location state
  useEffect(() => {
    if (location.state?.orderData) {
      setOrderData(location.state.orderData);
      console.log('Order data loaded from location state:', location.state.orderData);
    }
  }, [location.state]);

  // Generate invoice number with TUC/IN/ prefix
  const generateInvoiceNumber = async () => {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('invoice_number')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      let nextNumber = 1;
      if (data && data.length > 0) {
        const lastInvoice = data[0];
        const lastNumber = lastInvoice.invoice_number?.match(/TUC\/IN\/(\d+)/);
        if (lastNumber) {
          nextNumber = parseInt(lastNumber[1]) + 1;
        }
      }

      return `TUC/IN/${nextNumber.toString().padStart(3, '0')}`;
    } catch (error) {
      console.error('Error generating invoice number:', error);
      return `TUC/IN/001`;
    }
  };

  // Load data on component mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Load customers
        const { data: customersData, error: customersError } = await supabase
          .from('customers')
          .select('*')
          .order('company_name');

        if (customersError) throw customersError;
        setCustomers(customersData || []);
        
        const customersMap = (customersData || []).reduce((acc, customer) => {
          acc[customer.id] = customer;
          return acc;
        }, {} as Record<string, Customer>);
        setCustomersMap(customersMap);

        // Load company settings
        const { data: settingsData, error: settingsError } = await supabase
          .from('company_settings')
          .select('*')
          .single();

        if (settingsError) throw settingsError;
        setCompanySettings(settingsData);

        // Load fabric options
        const { data: fabricData, error: fabricError } = await supabase
          .from('fabric_master')
          .select('id, fabric_name as label, image_url')
          .order('fabric_name');

        if (fabricError) throw fabricError;
        setFabricOptions(fabricData || []);

        // Load item options
        const { data: itemData, error: itemError } = await supabase
          .from('item_master')
          .select('id, item_name as label, image_url, item_type, unit_of_measure as uom')
          .order('item_name');

        if (itemError) throw itemError;
        setItemOptions(itemData || []);

        // Load product options
        const { data: productData, error: productError } = await supabase
          .from('products')
          .select('id, product_name as label, image_url')
          .order('product_name');

        if (productError) throw productError;
        setProductOptions(productData || []);

        // Load item type options
        const { data: itemTypesData, error: itemTypesError } = await supabase
          .from('item_master')
          .select('item_type')
          .not('item_type', 'is', null);

        if (itemTypesError) throw itemTypesError;
        const uniqueTypes = [...new Set((itemTypesData || []).map(item => item.item_type))];
        setItemTypeOptions(uniqueTypes);

        // Load existing invoice if editing
        if (id) {
          const { data: invoiceData, error: invoiceError } = await supabase
            .from('invoices')
            .select(`
              *,
              invoice_items (
                *,
                fabric_master (fabric_name, fabric_color, fabric_gsm, image_url),
                item_master (item_name, item_type, unit_of_measure, image_url)
              )
            `)
            .eq('id', id)
            .single();

          if (invoiceError) throw invoiceError;
          
          if (invoiceData) {
            setInvoice(invoiceData);
            
            // Convert invoice items to line items
            const lineItems: LineItem[] = (invoiceData.invoice_items || []).map((item: any) => ({
              id: item.id,
              item_type: item.item_type || 'item',
              item_id: item.item_id || '',
              item_name: item.item_name || item.description || '',
              item_image_url: item.item_image_url || item.fabric_master?.image_url || item.item_master?.image_url,
              quantity: item.quantity || 0,
              unit_price: item.unit_price || 0,
              total_price: item.total_price || 0,
              gst_rate: item.gst_rate || 0,
              gst_amount: item.gst_amount || 0,
              unit_of_measure: item.unit_of_measure || 'pcs',
              remarks: item.remarks || '',
              attributes: item.attributes,
              fabric_name: item.fabric_name || item.fabric_master?.fabric_name,
              fabric_color: item.fabric_color || item.fabric_master?.fabric_color,
              fabric_gsm: item.fabric_gsm || item.fabric_master?.fabric_gsm,
              item_category: item.item_category || item.item_master?.item_type,
            }));
            
            setItems(lineItems);
          }
        } else {
          // Generate invoice number for new invoice
          const invoiceNumber = await generateInvoiceNumber();
          setInvoice(prev => ({ ...prev, invoice_number: invoiceNumber }));
        }

        // Process order data if available
        if (orderData) {
          setInvoice(prev => ({
            ...prev,
            customer_id: orderData.customer_id || '',
            delivery_address: orderData.delivery_address || '',
          }));

          // Convert order items to invoice items
          if (orderData.items) {
            const invoiceItems: LineItem[] = orderData.items.map((item: any) => ({
              item_type: item.item_type || 'item',
              item_id: item.item_id || '',
              item_name: item.item_name || item.description || '',
              item_image_url: item.item_image_url,
              quantity: item.quantity || 0,
              unit_price: item.unit_price || 0,
              total_price: item.total_price || 0,
              gst_rate: item.gst_rate || 0,
              gst_amount: item.gst_amount || 0,
              unit_of_measure: item.unit_of_measure || 'pcs',
              remarks: item.remarks || '',
              attributes: item.attributes,
              fabric_name: item.fabric_name,
              fabric_color: item.fabric_color,
              fabric_gsm: item.fabric_gsm,
              item_category: item.item_category,
            }));
            
            setItems(invoiceItems);
          }
        }

      } catch (error) {
        console.error('Error loading data:', error);
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, orderData]);

  // Convert logo to base64 for print/PDF
  const convertLogoToBase64 = async (logoUrl: string) => {
    if (logoCache.current.has(logoUrl)) {
      setLogoBase64(logoCache.current.get(logoUrl)!);
      return;
    }

    try {
      const base64 = await convertImageToBase64WithCache(logoUrl);
      logoCache.current.set(logoUrl, base64);
      setLogoBase64(base64);
    } catch (error) {
      console.error('Error converting logo to base64:', error);
    }
  };

  // Add item function
  const addItem = (type: 'fabric' | 'item') => {
    const newItem: LineItem = {
      item_type: type,
      item_id: '',
      item_name: '',
      item_image_url: null,
      quantity: 1,
      unit_price: 0,
      total_price: 0,
      gst_rate: 0,
      gst_amount: 0,
      unit_of_measure: 'pcs',
      remarks: '',
      attributes: null,
      fabricSelections: [],
      itemSelections: [],
      item_category: null,
      fabric_name: '',
      fabric_color: '',
      fabric_gsm: '',
    };
    setItems(prev => [...prev, newItem]);
  };

  // Update item function
  const updateItem = (index: number, updates: Partial<LineItem>) => {
    setItems(prev => prev.map((item, idx) => {
      if (idx === index) {
        const updatedItem = { ...item, ...updates };
        
        // Calculate total price and GST amount
        const totalPrice = updatedItem.quantity * updatedItem.unit_price;
        const gstAmount = (totalPrice * updatedItem.gst_rate) / 100;
        
        return {
          ...updatedItem,
          total_price: totalPrice,
          gst_amount: gstAmount,
        };
      }
      return item;
    }));
  };

  // Remove item function
  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Save invoice function
  const save = async () => {
    if (!invoice.customer_id) {
      toast.error('Please select a customer');
      return;
    }

    if (items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    setLoading(true);
    try {
      const invoiceData = {
        ...invoice,
        subtotal: items.reduce((sum, item) => sum + item.total_price, 0),
        tax_amount: items.reduce((sum, item) => sum + item.gst_amount, 0),
        total_amount: items.reduce((sum, item) => sum + item.total_price + item.gst_amount, 0),
        balance_amount: items.reduce((sum, item) => sum + item.total_price + item.gst_amount, 0) - (invoice.paid_amount || 0),
      };

      let savedInvoice;
      if (isEditMode) {
        const { data, error } = await supabase
          .from('invoices')
          .update(invoiceData)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        savedInvoice = data;

        // Delete existing invoice items
        await supabase
          .from('invoice_items')
          .delete()
          .eq('invoice_id', id);

      } else {
        const { data, error } = await supabase
          .from('invoices')
          .insert(invoiceData)
          .select()
          .single();

        if (error) throw error;
        savedInvoice = data;
      }

      // Insert invoice items
      const invoiceItems = items.map(item => ({
        invoice_id: savedInvoice.id,
        item_type: item.item_type,
        item_id: item.item_id,
        item_name: item.item_name,
        item_image_url: item.item_image_url,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        gst_rate: item.gst_rate,
        gst_amount: item.gst_amount,
        unit_of_measure: item.unit_of_measure,
        remarks: item.remarks,
        attributes: item.attributes,
        fabric_name: item.fabric_name,
        fabric_color: item.fabric_color,
        fabric_gsm: item.fabric_gsm,
        item_category: item.item_category,
      }));

      const { error: itemsError } = await supabase
        .from('invoice_items')
        .insert(invoiceItems);

      if (itemsError) throw itemsError;

      toast.success(isEditMode ? 'Invoice updated successfully' : 'Invoice created successfully');
      navigate(`/accounts/invoices/${savedInvoice.id}`);
    } catch (error) {
      console.error('Error saving invoice:', error);
      toast.error('Failed to save invoice');
    } finally {
      setLoading(false);
    }
  };

  // Print function
  const handlePrint = async () => {
    // Ensure logo is converted to base64
    if (companySettings?.logo_url && !logoBase64) {
      await convertLogoToBase64(companySettings.logo_url);
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const printContent = printRef.current?.innerHTML;
    if (!printContent) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice - ${invoice.invoice_number}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .print-content { max-width: 800px; margin: 0 auto; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
            .company-logo { max-width: 150px; max-height: 80px; }
            .company-info { text-align: right; }
            .invoice-title { font-size: 24px; font-weight: bold; margin-bottom: 20px; }
            .invoice-details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .customer-info { background: #f5f5f5; padding: 15px; border-radius: 5px; }
            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .items-table th, .items-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .items-table th { background-color: #f2f2f2; }
            .totals { text-align: right; margin-top: 20px; }
            .totals table { margin-left: auto; }
            .totals td { padding: 5px 10px; }
            .totals .total-row { font-weight: bold; border-top: 2px solid #000; }
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="print-content">
            ${printContent}
          </div>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
  };

  // PDF generation function
  const generatePDF = async () => {
    try {
      // Ensure logo is converted to base64
      if (companySettings?.logo_url && !logoBase64) {
        await convertLogoToBase64(companySettings.logo_url);
      }

      const element = printRef.current;
      if (!element) return;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
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

      pdf.save(`Invoice-${invoice.invoice_number}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  // Share function
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Invoice ${invoice.invoice_number}`,
          text: `Invoice ${invoice.invoice_number} for ${customersMap[invoice.customer_id]?.company_name}`,
          url: window.location.href,
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied to clipboard');
    }
  };

  const totals = useMemo(() => {
    const grandSubtotal = items.reduce((sum, item) => sum + item.total_price, 0);
    const grandGstAmount = items.reduce((sum, item) => sum + item.gst_amount, 0);
    const grandTotal = grandSubtotal + grandGstAmount;
    const amountInWords = numberToWords(Math.floor(grandTotal)) + ' Rupees Only';

    // Group by GST rate
    const gstGroups: Record<string, { subtotal: number; gstAmount: number; total: number }> = {};
    items.forEach(item => {
      const rate = item.gst_rate.toString();
      if (!gstGroups[rate]) {
        gstGroups[rate] = { subtotal: 0, gstAmount: 0, total: 0 };
      }
      gstGroups[rate].subtotal += item.total_price;
      gstGroups[rate].gstAmount += item.gst_amount;
      gstGroups[rate].total += item.total_price + item.gst_amount;
    });

    return {
      grandSubtotal,
      grandGstAmount,
      grandTotal,
      amountInWords,
      gstGroups,
    };
  }, [items]);

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate('/accounts/invoices')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <h1 className="text-3xl font-bold">
            {isEditMode ? 'Edit Invoice' : isReadOnly ? 'View Invoice' : 'Create Invoice'}
          </h1>
        </div>
        <div className="flex gap-2">
          {/* Print/Export Buttons */}
          <Button variant="outline" size="sm" onClick={handlePrint} className="flex items-center gap-2">
            <Printer className="w-4 h-4" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={generatePDF} className="flex items-center gap-2">
            <Download className="w-4 h-4" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleShare} className="flex items-center gap-2">
            <Share2 className="w-4 h-4" />
            Share
          </Button>
          
          {/* Action Buttons */}
          <Button variant="outline" onClick={() => navigate('/accounts/invoices')}>
            Cancel
          </Button>
          {!isReadOnly && (
            <Button onClick={save} disabled={loading}>
              {loading ? 'Saving...' : 'Save'}
            </Button>
          )}
        </div>
      </div>

      {/* Printable Content */}
      <div ref={printRef} className="print-content">
        <Card>
          <CardHeader>
            <CardTitle>Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="customer">Customer *</Label>
                <Select 
                  value={invoice.customer_id} 
                  onValueChange={(value) => setInvoice(prev => ({ ...prev, customer_id: value }))}
                  disabled={isReadOnly}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map(customer => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="invoice_date">Invoice Date</Label>
                <Input
                  id="invoice_date"
                  type="date"
                  value={invoice.invoice_date}
                  onChange={(e) => setInvoice(prev => ({ ...prev, invoice_date: e.target.value }))}
                  disabled={isReadOnly}
                />
              </div>

              <div>
                <Label htmlFor="due_date">Due Date</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={invoice.due_date}
                  onChange={(e) => setInvoice(prev => ({ ...prev, due_date: e.target.value }))}
                  disabled={isReadOnly}
                />
              </div>

              <div>
                <Label htmlFor="status">Status</Label>
                <Select 
                  value={invoice.status} 
                  onValueChange={(value) => setInvoice(prev => ({ ...prev, status: value as any }))}
                  disabled={isReadOnly}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="delivery_address">Delivery Address</Label>
              <Textarea 
                id="delivery_address"
                value={invoice.delivery_address || ''}
                onChange={(e) => setInvoice(prev => ({ ...prev, delivery_address: e.target.value }))}
                disabled={isReadOnly}
                placeholder="Enter delivery address..."
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="terms_conditions">Terms & Conditions</Label>
              <Textarea 
                id="terms_conditions"
                value={invoice.terms_conditions || ''}
                onChange={(e) => setInvoice(prev => ({ ...prev, terms_conditions: e.target.value }))}
                disabled={isReadOnly}
                placeholder="Enter terms and conditions..."
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea 
                id="notes"
                value={invoice.notes || ''}
                onChange={(e) => setInvoice(prev => ({ ...prev, notes: e.target.value }))}
                disabled={isReadOnly}
                placeholder="Enter any additional notes..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <div className="space-y-6">
          {/* Fabric Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Fabric</CardTitle>
                {!isReadOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addItem('fabric')}
                    className="rounded-full w-8 h-8 p-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {items.filter(item => item.item_type === 'fabric').length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No fabrics added yet. Click + to add fabric.
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((it, idx) => {
                    if (it.item_type !== 'fabric') return null;
                    return (
                      <div key={idx} className="flex items-center gap-4 p-4 border rounded-lg">
                        {/* Fabric Image */}
                        <ProductImage 
                          src={it.item_image_url} 
                          alt={it.item_name}
                          className="w-20 h-20 object-cover rounded"
                          fallbackText="FAB"
                        />

                        {/* Fabric Details */}
                        <div className="flex-1 grid grid-cols-12 gap-4 items-center">
                          {/* Fabric Name */}
                          <div className="col-span-2">
                            <Label className="text-sm font-medium">Fabric</Label>
                            <div className="text-sm font-medium">
                              {it.fabric_name || it.item_name || 'N/A'}
                            </div>
                          </div>

                          {/* Color */}
                          <div className="col-span-1">
                            <Label className="text-sm font-medium">Color</Label>
                            <div className="text-sm">
                              {it.fabric_color || 'N/A'}
                            </div>
                          </div>

                          {/* GSM */}
                          <div className="col-span-1">
                            <Label className="text-sm font-medium">GSM</Label>
                            <div className="text-sm">
                              {it.fabric_gsm ? `${it.fabric_gsm} GSM` : 'N/A'}
                            </div>
                          </div>

                          {/* Quantity */}
                          <div className="col-span-1">
                            <Label className="text-sm font-medium">Qty</Label>
                            <Input
                              type="number"
                              value={it.quantity} 
                              onChange={(e) => {
                                const qty = parseFloat(e.target.value) || 0;
                                updateItem(idx, { quantity: qty });
                              }}
                              disabled={isReadOnly}
                              className="w-full text-right" 
                              placeholder="Qty"
                            />
                          </div>

                          {/* Unit Price */}
                          <div className="col-span-1">
                            <Label className="text-sm font-medium">Unit Price</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={it.unit_price} 
                              onChange={(e) => {
                                const price = parseFloat(e.target.value) || 0;
                                updateItem(idx, { unit_price: price });
                              }}
                              disabled={isReadOnly}
                              className="w-full text-right" 
                              placeholder="0.00"
                            />
                          </div>

                          {/* GST Rate */}
                          <div className="col-span-1">
                            <Label className="text-sm font-medium">GST %</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={it.gst_rate} 
                              onChange={(e) => {
                                const rate = parseFloat(e.target.value) || 0;
                                updateItem(idx, { gst_rate: rate });
                              }}
                              disabled={isReadOnly}
                              className="w-full text-right" 
                              placeholder="0.00"
                            />
                          </div>

                          {/* UOM */}
                          <div className="col-span-1">
                            <Label className="text-sm font-medium">UOM</Label>
                            <Input 
                              value={it.unit_of_measure || ''} 
                              onChange={(e) => {
                                updateItem(idx, { unit_of_measure: e.target.value });
                              }} 
                              className="w-full" 
                              disabled={isReadOnly} 
                              placeholder="UOM"
                            />
                          </div>

                          {/* Remarks */}
                          <div className="col-span-3">
                            <Label className="text-sm font-medium">Remarks</Label>
                            <Input 
                              value={it.remarks || ''} 
                              onChange={(e) => updateItem(idx, { remarks: e.target.value })}
                              className="w-full" 
                              disabled={isReadOnly} 
                              placeholder="Enter remarks for this fabric"
                            />
                          </div>
                        </div>

                        {/* Remove Button */}
                        {!isReadOnly && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeItem(idx)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Items Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Items</CardTitle>
                {!isReadOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addItem('item')}
                    className="rounded-full w-8 h-8 p-0"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {items.filter(item => item.item_type === 'item').length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No items added yet. Click + to add item.
                </div>
              ) : (
                <div className="space-y-4">
                  {items.map((it, idx) => {
                    if (it.item_type !== 'item') return null;
                    return (
                      <div key={idx} className="flex items-center gap-4 p-4 border rounded-lg">
                        {/* Item Image */}
                        <ProductImage 
                          src={it.item_image_url} 
                          alt={it.item_name}
                          className="w-20 h-20 object-cover rounded"
                          fallbackText="ITEM"
                        />

                        {/* Item Details */}
                        <div className="flex-1 grid grid-cols-8 gap-4 items-center">
                          {/* Item Type */}
                          <div>
                            <Label className="text-sm font-medium">Item Type</Label>
                            {isReadOnly ? (
                              <div className="w-full p-2 border rounded-md bg-muted text-sm">
                                {it.item_type === 'fabric' ? 'Fabric' : (it.item_category || 'Not specified')}
                              </div>
                            ) : (
                              <Select
                                value={it.item_category || ''} 
                                onValueChange={(v) => {
                                  updateItem(idx, { item_category: v, item_id: '', item_name: '', item_image_url: null, itemSelections: [] });
                                }}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select Item Type" value={it.item_category || ''} />
                                </SelectTrigger>
                                <SelectContent>
                                  {itemTypeOptions.map((type) => (
                                    <SelectItem key={type} value={type}>{type}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>

                          {/* Item Name */}
                          <div>
                            <Label className="text-sm font-medium">Item Name</Label>
                            {isReadOnly ? (
                              <div className="w-full p-2 border rounded-md bg-muted text-sm font-medium">
                                {it.item_name || 'N/A'}
                              </div>
                            ) : (
                              <div className="text-sm font-medium">
                                {it.item_name || 'N/A'}
                              </div>
                            )}
                          </div>

                          {/* Quantity */}
                          <div>
                            <Label className="text-sm font-medium">Qty</Label>
                            {isReadOnly ? (
                              <div className="w-full p-2 border rounded-md bg-muted text-sm text-right">
                                {it.quantity}
                              </div>
                            ) : (
                              <Input 
                                type="number" 
                                value={it.quantity} 
                                onChange={(e) => {
                                  const qty = parseFloat(e.target.value) || 0;
                                  updateItem(idx, { quantity: qty });
                                }}
                                className="w-full text-right" 
                                placeholder="Qty"
                              />
                            )}
                          </div>

                          {/* Unit Price */}
                          <div>
                            <Label className="text-sm font-medium">Unit Price</Label>
                            {isReadOnly ? (
                              <div className="w-full p-2 border rounded-md bg-muted text-sm text-right">
                                ₹{it.unit_price.toFixed(2)}
                              </div>
                            ) : (
                              <Input 
                                type="number"
                                step="0.01"
                                value={it.unit_price} 
                                onChange={(e) => {
                                  const price = parseFloat(e.target.value) || 0;
                                  updateItem(idx, { unit_price: price });
                                }}
                                className="w-full text-right" 
                                placeholder="0.00"
                              />
                            )}
                          </div>

                          {/* GST Rate */}
                          <div>
                            <Label className="text-sm font-medium">GST %</Label>
                            {isReadOnly ? (
                              <div className="w-full p-2 border rounded-md bg-muted text-sm text-right">
                                {it.gst_rate}%
                              </div>
                            ) : (
                              <Input 
                                type="number"
                                step="0.01"
                                value={it.gst_rate} 
                                onChange={(e) => {
                                  const rate = parseFloat(e.target.value) || 0;
                                  updateItem(idx, { gst_rate: rate });
                                }}
                                className="w-full text-right" 
                                placeholder="0.00"
                              />
                            )}
                          </div>

                          {/* UOM */}
                          <div>
                            <Label className="text-sm font-medium">UOM</Label>
                            {isReadOnly ? (
                              <div className="w-full p-2 border rounded-md bg-muted text-sm">
                                {it.unit_of_measure || 'pcs'}
                              </div>
                            ) : (
                              <Input 
                                value={it.unit_of_measure || ''} 
                                onChange={(e) => {
                                  updateItem(idx, { unit_of_measure: e.target.value });
                                }} 
                                className="w-full" 
                                placeholder="UOM"
                              />
                            )}
                          </div>

                          {/* Remarks */}
                          <div className="col-span-2">
                            <Label className="text-sm font-medium">Remarks</Label>
                            {isReadOnly ? (
                              <div className="w-full p-2 border rounded-md bg-muted text-sm">
                                {it.notes || it.remarks || '-'}
                              </div>
                            ) : (
                              <Input 
                                value={it.notes || it.remarks || ''} 
                                onChange={(e) => updateItem(idx, { notes: e.target.value })}
                                className="w-full" 
                                placeholder="Enter remarks for this item"
                              />
                            )}
                          </div>
                        </div>

                        {/* Remove Button */}
                        {!isReadOnly && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeItem(idx)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Totals Section */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {/* GST Breakdown */}
              {Object.keys(totals.gstGroups).length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-2">GST Breakdown</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>GST Rate</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                        <TableHead className="text-right">GST Amount</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(totals.gstGroups).map(([rate, amounts]) => (
                        <TableRow key={rate}>
                          <TableCell>{rate}%</TableCell>
                          <TableCell className="text-right">₹{amounts.subtotal.toFixed(2)}</TableCell>
                          <TableCell className="text-right">₹{amounts.gstAmount.toFixed(2)}</TableCell>
                          <TableCell className="text-right">₹{amounts.total.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Grand Totals */}
              <div className="border-t pt-4">
                <div className="flex justify-end">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>₹{totals.grandSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total GST:</span>
                      <span>₹{totals.grandGstAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg border-t pt-2">
                      <span>Grand Total:</span>
                      <span>₹{totals.grandTotal.toFixed(2)}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-2">
                      Amount in words: {totals.amountInWords}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div> {/* End of printRef */}
    </div>
  );
}