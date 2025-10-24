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
  item_type: 'fabric' | 'item' | 'product' | 'Zipper' | 'Drawcord' | 'Laces' | string;
  item_id: string;
  item_name: string;
  item_image_url?: string | null;
  quantity: number;
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

type PurchaseOrder = {
  id?: string;
  po_number?: string;
  supplier_id: string;
  order_date: string;
  status: 'draft' | 'sent' | 'confirmed' | 'cancelled';
  terms_conditions?: string;
  notes?: string;
  delivery_address?: string;
  expected_delivery_date?: string;
  // Transporter details
  preferred_transporter?: string;
  transport_remark?: string;
};

type Supplier = {
  id: string;
  name: string;
  supplier_name?: string;
  supplier_code?: string;
  email?: string;
  phone?: string;
  address?: string;
  gstin?: string;
  gst_number?: string;
  primary_contact_name?: string;
  primary_contact_phone?: string;
  primary_contact_email?: string;
  billing_address_line1?: string;
  billing_address_line2?: string;
  billing_address_city?: string;
  billing_address_state?: string;
  billing_address_pincode?: string;
  pan?: string;
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

export function PurchaseOrderForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isEditMode = !!id && searchParams.get('edit') === '1';
  const isReadOnly = !!id && !isEditMode;
  const printRef = useRef<HTMLDivElement>(null);
  
  // Check for BOM data in URL params and location state
  const location = useLocation();
  const bomParam = searchParams.get('bom');
  const [bomData, setBomData] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersMap, setSuppliersMap] = useState<Record<string, Supplier>>({});
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const logoCache = useRef<Map<string, string>>(new Map());
  const [po, setPo] = useState<PurchaseOrder>({
    supplier_id: '',
    order_date: new Date().toISOString().slice(0, 10),
    status: 'draft',
    delivery_address: '',
    expected_delivery_date: '',
  });
  const [items, setItems] = useState<LineItem[]>([]);
  // Option lists by type
  const [fabricOptions, setFabricOptions] = useState<{ id: string; label: string; image_url?: string | null }[]>([]);
  const [itemOptions, setItemOptions] = useState<{ id: string; label: string; image_url?: string | null; item_type?: string; uom?: string; type?: string }[]>([]);
  const [productOptions, setProductOptions] = useState<{ id: string; label: string; image_url?: string | null }[]>([]);
  const [itemTypeOptions, setItemTypeOptions] = useState<string[]>([]);

  // Process BOM data from URL params
  useEffect(() => {
    if (bomParam) {
      try {
        const parsed = JSON.parse(decodeURIComponent(bomParam));
        setBomData(parsed);
        console.log('BOM data loaded from URL params:', parsed);
      } catch (e) {
        console.error('Failed to parse BOM data:', e);
      }
    }
  }, [bomParam]);

  // Process BOM data from location state
  useEffect(() => {
    if (location.state?.bomData) {
      console.log('BOM data received from location state:', location.state.bomData);
      console.log('BOM items received from location state:', location.state.bomItems);
      console.log('BOM items count:', location.state.bomItems?.length);
      console.log('BOM items details:', location.state.bomItems?.map((item: any) => ({
        item_name: item.item_name,
        item_type: item.item_type,
        category: item.category,
        qty_total: item.qty_total,
        to_order: item.to_order
      })));
      setBomData({
        ...location.state.bomData,
        items: location.state.bomItems || location.state.bomData.items || []
      });
    }
  }, [location.state]);

  // Load BOM data into form
  useEffect(() => {
    if (bomData && (fabricOptions.length > 0 || itemOptions.length > 0)) {
      console.log('Processing BOM data:', bomData);
      console.log('Fabric options loaded:', fabricOptions.length);
      console.log('Item options loaded:', itemOptions.length);
      // Pre-fill items from BOM data
      const bomItems = bomData.items || [];
      console.log('Processing BOM items:', {
        count: bomItems.length,
        items: bomItems.map((item: any) => ({
          item_name: item.item_name,
          item_type: item.item_type,
          category: item.category,
          qty_total: item.qty_total,
          to_order: item.to_order
        }))
      });
      const formattedItems = bomItems.map((item: any) => {
        console.log('Processing BOM item:', item);
        
        if (item.item_type === 'fabric' || item.category === 'Fabric') {
          // Handle fabric items with color and GSM
          const fabricSelections = item.fabricSelections || [];
          const firstSelection = fabricSelections[0] || {};
          
          // Parse fabric details from item_name if not available in separate fields
          let fabricName = item.fabric_name || firstSelection.fabric_name || '';
          let fabricColor = item.fabric_color || firstSelection.color || '';
          let fabricGsm = item.fabric_gsm || firstSelection.gsm || '';
          
          // If fabric details are not available, try to parse from item_name
          if (!fabricColor || !fabricGsm) {
            const itemNameParts = item.item_name?.split(' - ') || [];
            if (itemNameParts.length >= 3) {
              fabricName = fabricName || itemNameParts[0]?.trim();
              fabricColor = fabricColor || itemNameParts[1]?.trim();
              fabricGsm = fabricGsm || itemNameParts[2]?.replace('GSM', '').trim();
            }
          }
          
          console.log('Parsed fabric details:', {
            original: { fabric_name: item.fabric_name, fabric_color: item.fabric_color, fabric_gsm: item.fabric_gsm },
            parsed: { fabricName, fabricColor, fabricGsm },
            itemName: item.item_name
          });
          
        // Find the fabric in fabricOptions to get the GST rate and image
        let fabricOption = fabricOptions.find(f => 
          f.fabric_name === fabricName && 
          f.color === fabricColor && 
          f.gsm === fabricGsm
        );
        
        // If not found with exact match, try to find by fabric name only
        if (!fabricOption && fabricName) {
          fabricOption = fabricOptions.find(f => f.fabric_name === fabricName);
        }
        
        // If still not found, try to find by item name
        if (!fabricOption && item.item_name) {
          fabricOption = fabricOptions.find(f => f.fabric_name === item.item_name);
        }
          
          // Debug logging
          console.log('Processing fabric item:', {
            itemName: item.item_name,
            firstSelection,
            fabricOption,
            fabricOptionsCount: fabricOptions.length
          });
          
          return {
            item_type: 'fabric',
            item_id: item.item_id || '',
            item_name: fabricName || item.item_name || '',
            item_image_url: fabricOption?.image_url || item.item_image_url || null,
            quantity: item.qty_total || item.to_order || item.quantity || 0,
            unit_of_measure: item.unit_of_measure || 'Kgs',
            // Store fabric-specific data with parsed values
            fabric_name: fabricName || 'Unknown Fabric',
            fabric_color: fabricColor || 'N/A',
            fabric_gsm: fabricGsm || 'N/A',
            fabricSelections: fabricSelections,
            attributes: {
              colorsList: fabricColor ? [fabricColor] : (fabricOption?.color ? [fabricOption.color] : []),
              gsmList: fabricGsm ? [fabricGsm] : (fabricOption?.gsm ? [fabricOption.gsm] : []),
              description: item.item_name || 'Fabric Item'
            }
          };
        } else {
          // Handle regular items
          // Find the item in itemOptions to get the GST rate, image, and type
          let itemOption = itemOptions.find(i => i.id === item.item_id);
          
          // If not found by ID, try to find by name
          if (!itemOption && item.item_name) {
            itemOption = itemOptions.find(i => i.label === item.item_name);
          }
          
          // If still not found, try partial name matching
          if (!itemOption && item.item_name) {
            itemOption = itemOptions.find(i => 
              i.label.toLowerCase().includes(item.item_name.toLowerCase()) ||
              item.item_name.toLowerCase().includes(i.label.toLowerCase())
            );
          }
          
          console.log(`Processing item ${item.item_name}:`, {
            itemId: item.item_id,
            itemOption: itemOption,
            itemOptionsCount: itemOptions.length,
            itemOptions: itemOptions.map(i => ({ id: i.id, name: i.label, image: i.image_url, type: i.item_type })),
            itemOptionFull: itemOption,
            originalImageUrl: item.item_image_url
          });
          
          return {
            item_type: 'item',
            item_id: item.item_id || '',
            item_name: item.item_name || '',
            item_image_url: itemOption?.image_url || item.item_image_url || null,
            quantity: item.qty_total || item.to_order || item.quantity || 0,
            unit_of_measure: item.unit_of_measure || 'pcs',
            item_category: itemOption?.item_type || item.item_category || null,
            itemSelections: item.itemSelections || []
          };
        }
      });
      
      // No pricing calculations needed for purchase orders
      const itemsWithTotals = formattedItems;
      setItems(itemsWithTotals);
      console.log('Items loaded from BOM:', itemsWithTotals);
    }
  }, [bomData, fabricOptions, itemOptions]);

  // Enrich existing items with options data when options are loaded
  useEffect(() => {
    if (items.length > 0 && (fabricOptions.length > 0 || itemOptions.length > 0)) {
      console.log('Enriching items with options data:', {
        itemsCount: items.length,
        fabricOptionsCount: fabricOptions.length,
        itemOptionsCount: itemOptions.length,
        items: items.map(i => ({ id: i.item_id, name: i.item_name, currentImage: i.item_image_url, currentType: i.item_category })),
        itemOptions: itemOptions.map(i => ({ id: i.id, name: i.label, image: i.image_url, type: i.item_type }))
      });
      
      const enrichedItems = items.map(item => {
        // Find the item in options to get additional data
        let itemOption = itemOptions.find(i => i.id === item.item_id);
        let fabricOption = null;
        
        // For fabric items, search by fabric details instead of item_id
        if (item.item_type === 'fabric' || item.category === 'Fabric') {
          fabricOption = fabricOptions.find(f => 
            f.fabric_name === item.fabric_name && 
            f.color === item.fabric_color && 
            f.gsm === item.fabric_gsm
          );
          
          // If not found with exact match, try by fabric name only
          if (!fabricOption && item.fabric_name) {
            fabricOption = fabricOptions.find(f => f.fabric_name === item.fabric_name);
          }
          
          // If still not found, try by item name
          if (!fabricOption && item.item_name) {
            fabricOption = fabricOptions.find(f => f.fabric_name === item.item_name);
          }
        } else {
          // For non-fabric items, search by ID
          fabricOption = fabricOptions.find(f => f.id === item.item_id);
        }
        
        // If not found by ID, try to find by name
        if (!itemOption && item.item_name) {
          itemOption = itemOptions.find(i => i.label === item.item_name);
        }
        
        // If still not found, try partial name matching
        if (!itemOption && item.item_name) {
          itemOption = itemOptions.find(i => 
            i.label.toLowerCase().includes(item.item_name.toLowerCase()) ||
            item.item_name.toLowerCase().includes(i.label.toLowerCase())
          );
        }
        if (!fabricOption && item.item_name) {
          fabricOption = fabricOptions.find(f => 
            f.fabric_name.toLowerCase().includes(item.item_name.toLowerCase()) ||
            item.item_name.toLowerCase().includes(f.fabric_name.toLowerCase())
          );
        }
        
        console.log(`Enriching item ${item.item_name}:`, {
          itemId: item.item_id,
          itemOption: itemOption,
          fabricOption: fabricOption,
          currentImage: item.item_image_url,
          currentType: item.item_category,
          itemOptionImage: itemOption?.image_url,
          itemOptionType: itemOption?.item_type,
          fabricOptionImage: fabricOption?.image_url,
          itemOptionFull: itemOption,
          fabricOptionFull: fabricOption
        });
        
        // Determine the best image URL to use
        const bestImageUrl = item.item_image_url || itemOption?.image_url || fabricOption?.image_url || null;
        
        return {
          ...item,
          // Ensure item_id is resolved from options if missing (prevents NOT NULL violations)
          item_id: item.item_id || itemOption?.id || fabricOption?.id || '',
          // Enrich with data from options if available and not already set
          item_image_url: bestImageUrl,
          item_category: item.item_category || itemOption?.item_type || itemOption?.type || 'Not specified',
          // Also update fabric-specific fields if this is a fabric item
          ...(item.item_type === 'fabric' && {
            fabric_color: item.fabric_color || fabricOption?.color || 'N/A',
            fabric_gsm: item.fabric_gsm || fabricOption?.gsm || 'N/A',
            fabric_name: item.fabric_name || fabricOption?.fabric_name || item.item_name
          })
        };
      });
      
      // Only update if there are changes
      const hasChanges = enrichedItems.some((item, index) => 
        item.item_image_url !== items[index].item_image_url || 
        item.item_category !== items[index].item_category
      );
      
      console.log('Has changes:', hasChanges);
      
      if (hasChanges) {
        console.log('Updating items with enriched data');
        setItems(enrichedItems);
      }
    }
  }, [fabricOptions, itemOptions, items.length]); // Only depend on length to avoid infinite loops

  useEffect(() => {
    fetchSuppliers();
    fetchCompanySettings();
    fetchOptions();
    if (id) {
      fetchPurchaseOrder();
    }
  }, [id]);


  // Function to generate PO number with TUC/PO/ prefix starting from 0001
  const generatePONumber = async () => {
    try {
      // Get the latest PO number from database
      const { data: latestPO, error } = await supabase
        .from('purchase_orders')
        .select('po_number')
        .like('po_number', 'TUC/PO/%')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error fetching latest PO:', error);
        // Fallback to 0001 if there's an error
        return 'TUC/PO/0001';
      }

      if (!latestPO || latestPO.length === 0) {
        // No existing PO found, start from 0001
        return 'TUC/PO/0001';
      }

      // Extract the number from the latest PO
      const latestNumber = latestPO[0].po_number;
      const match = latestNumber.match(/TUC\/PO\/(\d+)/);
      
      if (match) {
        const currentNumber = parseInt(match[1], 10);
        const nextNumber = currentNumber + 1;
        return `TUC/PO/${nextNumber.toString().padStart(4, '0')}`;
      } else {
        // If format doesn't match, start from 0001
        return 'TUC/PO/0001';
      }
    } catch (error) {
      console.error('Error generating PO number:', error);
      // Fallback to 0001 if there's an error
      return 'TUC/PO/0001';
    }
  };

  // PDF Generation Functions
  const generatePDF = async () => {
    try {
      // Loading toast removed as requested
      
      // Ensure logo is converted to base64
      if (companySettings?.logo_url && !logoBase64) {
        await convertLogoToBase64(companySettings.logo_url);
      }
      
      console.log('PDF - Company Settings:', companySettings);
      console.log('PDF - Suppliers:', suppliers);
      console.log('PDF - Suppliers Map:', suppliersMap);
      console.log('PDF - PO Supplier ID:', po.supplier_id);
      console.log('PDF - Selected Supplier:', suppliersMap[po.supplier_id]);
      
      // Create a temporary div with the formatted content
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.top = '0';
      tempDiv.style.width = '210mm'; // A4 width
      tempDiv.style.backgroundColor = '#ffffff';
      tempDiv.style.padding = '20px';
      tempDiv.style.fontFamily = 'Arial, sans-serif';
      tempDiv.style.fontSize = '12px';
      tempDiv.style.lineHeight = '1.4';
      
      const companyLogo = logoBase64 ? 
        `<img src="${logoBase64}" alt="Company Logo" style="max-height: 60px; max-width: 200px; display: block;">` : 
        `<div style="height: 60px; width: 200px; background-color: #f0f0f0; display: flex; align-items: center; justify-content: center; font-weight: bold;">LOGO</div>`;
      
      const companyAddress = companySettings ? 
        `${companySettings.address || ''}${companySettings.city ? ', ' + companySettings.city : ''}${companySettings.state ? ', ' + companySettings.state : ''}${companySettings.pincode ? ' - ' + companySettings.pincode : ''}`.replace(/^,\s*/, '') : 
        'Company Address';
      
      // Generate line items table HTML
      const lineItemsHTML = items.map(item => {
        // Debug logging for fabric items
        if (item.item_type === 'fabric') {
          console.log('PDF - Fabric item data:', {
            itemName: item.item_name,
            itemType: item.item_type,
            fabricColor: item.fabric_color,
            fabricGsm: item.fabric_gsm,
            fabricName: item.fabric_name,
            fabricSelections: item.fabricSelections,
            attributes: item.attributes
          });
        }
        
        return `
        <tr>
          <td style="width: 40px; text-align: center;">
            ${item.item_image_url ? 
              `<img src="${item.item_image_url}" alt="${item.item_name}" style="width: 30px; height: 30px; object-fit: cover; border-radius: 3px;">` : 
              '<div style="width: 30px; height: 30px; background-color: #f0f0f0; display: flex; align-items: center; justify-content: center; font-size: 10px;">IMG</div>'
            }
          </td>
          <td>${item.item_name}</td>
          <td>${item.item_type === 'fabric' ? 'Fabric' : (item.item_category || item.item_type || 'N/A')}</td>
          <td>${item.item_type === 'fabric' ? (item.fabric_color || 'N/A') : '-'}</td>
          <td>${item.item_type === 'fabric' ? (item.fabric_gsm || 'N/A') : '-'}</td>
          <td style="text-align: right;">${item.quantity}</td>
          <td>${item.unit_of_measure || 'N/A'}</td>
          <td>${item.remarks || '-'}</td>
        </tr>
      `;
      }).join('');
      
      // No GST summary or totals needed for purchase orders
      const gstSummary = '';
      const grandSubtotal = 0;
      const grandGstAmount = 0;
      const grandTotal = 0;
      
      // Convert number to words (simple implementation)
      const numberToWords = (num: number): string => {
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
        const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        
        if (num === 0) return 'Zero';
        if (num < 10) return ones[num];
        if (num < 20) return teens[num - 10];
        if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
        if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
        if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
        if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + numberToWords(num % 100000) : '');
        return numberToWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + numberToWords(num % 10000000) : '');
      };
      
      tempDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px;">
          <div style="flex: 1; max-width: 50%;">
            ${companyLogo}
            <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">${companySettings?.company_name || 'Company Name'}</div>
            <div>${companyAddress}</div>
            <div>GSTIN: ${companySettings?.gstin || 'GST Number'}</div>
            <div>Phone: ${companySettings?.contact_phone || 'Phone Number'}</div>
            <div>Email: ${companySettings?.contact_email || 'Email Address'}</div>
          </div>
          <div style="text-align: right; flex: 1; max-width: 50%;">
            <div style="font-size: 24px; font-weight: bold; margin-bottom: 10px; text-align: center;">PURCHASE ORDER</div>
            <div style="font-size: 14px; font-weight: bold; margin-bottom: 5px;">PO Number: ${po.po_number || 'Draft'}</div>
            <div>Date: ${po.order_date || new Date().toISOString().split('T')[0]}</div>
            </div>
          </div>
          
        <div style="margin-bottom: 20px; display: flex; gap: 20px;">
          <div style="flex: 1;">
            <div style="font-weight: bold; font-size: 14px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Supplier Information</div>
            <div><strong>${suppliersMap[po.supplier_id]?.supplier_name || suppliersMap[po.supplier_id]?.name || 'Supplier Name'}</strong></div>
            <div>Contact: ${suppliersMap[po.supplier_id]?.primary_contact_name || suppliersMap[po.supplier_id]?.name || 'Contact Person'}</div>
            <div>Phone: ${suppliersMap[po.supplier_id]?.primary_contact_phone || suppliersMap[po.supplier_id]?.phone || 'Phone'}</div>
            <div>Email: ${suppliersMap[po.supplier_id]?.primary_contact_email || suppliersMap[po.supplier_id]?.email || 'Email'}</div>
            <div>GST: ${suppliersMap[po.supplier_id]?.gst_number || 'GST Number'}</div>
            <div>PAN: ${suppliersMap[po.supplier_id]?.pan || 'PAN Number'}</div>
            <div>${suppliersMap[po.supplier_id]?.billing_address_line1 || 'Address'}</div>
          </div>
          <div style="flex: 1;">
            <div style="font-weight: bold; font-size: 14px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Delivery Information</div>
            <div><strong>Delivery Address:</strong></div>
            <div>${po.delivery_address || companyAddress || 'Delivery Address'}</div>
            <div><strong>Expected Delivery:</strong> ${po.expected_delivery_date || 'Not specified'}</div>
            
            ${po.preferred_transporter || po.transport_remark ? `
            <div style="margin-top: 15px; font-weight: bold; font-size: 12px; border-bottom: 1px solid #ccc; padding-bottom: 3px;">Transporter Details</div>
            ${po.preferred_transporter ? `<div><strong>Preferred Transporter:</strong> ${po.preferred_transporter}</div>` : ''}
            ${po.transport_remark ? `<div><strong>Transport Remark:</strong> ${po.transport_remark}</div>` : ''}
            ` : ''}
          </div>
          </div>
          
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px;">
            <thead>
              <tr>
              <th style="border: 1px solid #ddd; padding: 6px; background-color: #f2f2f2; font-weight: bold;">Image</th>
              <th style="border: 1px solid #ddd; padding: 6px; background-color: #f2f2f2; font-weight: bold;">Item</th>
              <th style="border: 1px solid #ddd; padding: 6px; background-color: #f2f2f2; font-weight: bold;">Type</th>
              <th style="border: 1px solid #ddd; padding: 6px; background-color: #f2f2f2; font-weight: bold;">Color</th>
              <th style="border: 1px solid #ddd; padding: 6px; background-color: #f2f2f2; font-weight: bold;">GSM</th>
              <th style="border: 1px solid #ddd; padding: 6px; background-color: #f2f2f2; font-weight: bold;">Quantity</th>
              <th style="border: 1px solid #ddd; padding: 6px; background-color: #f2f2f2; font-weight: bold;">UOM</th>
              <th style="border: 1px solid #ddd; padding: 6px; background-color: #f2f2f2; font-weight: bold;">Remarks</th>
              </tr>
            </thead>
            <tbody>
            ${lineItemsHTML}
            </tbody>
          </table>
          
          
        <div style="margin-top: 30px;">
          <div style="font-weight: bold; font-size: 14px; margin-bottom: 10px; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Terms & Conditions</div>
          <div>${po.terms_conditions || 'Standard terms and conditions apply.'}</div>
        </div>
        
        ${companySettings?.authorized_signatory_url ? `
        <div style="margin-top: 40px; display: flex; justify-content: flex-end;">
          <div style="text-align: center;">
            <div style="font-weight: bold; font-size: 12px; margin-bottom: 5px;">Authorized Signatory</div>
            <div style="margin-bottom: 10px;">
              <img src="${companySettings.authorized_signatory_url}" alt="Authorized Signatory" style="max-width: 180px; max-height: 60px; object-fit: contain;" />
            </div>
            <div style="border-top: 1px solid #000; width: 180px; margin: 0 auto;"></div>
          </div>
        </div>
        ` : ''}
        
      `;
      
      document.body.appendChild(tempDiv);
      
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: tempDiv.offsetWidth,
        height: tempDiv.offsetHeight
      });
      
      document.body.removeChild(tempDiv);
      
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
      
      const fileName = `Purchase_Order_${po.po_number || 'Draft'}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      
      // Loading toasts removed as requested
      toast.success('PDF generated successfully!');
    } catch (error) {
      // Loading toasts removed as requested
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const handlePrint = async () => {
    // Removed loading toast as requested
    
    // Ensure logo is converted to base64
    if (companySettings?.logo_url && !logoBase64) {
      await convertLogoToBase64(companySettings.logo_url);
    }
    
    // Loading toast removed as requested

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      console.log('Company Settings:', companySettings);
      console.log('Suppliers:', suppliers);
      console.log('Suppliers Map:', suppliersMap);
      console.log('PO Supplier ID:', po.supplier_id);
      console.log('Selected Supplier:', suppliersMap[po.supplier_id]);
      
      const companyLogo = logoBase64 ? 
        `<img src="${logoBase64}" alt="Company Logo" style="max-height: 60px; max-width: 200px; display: block;">` : 
        `<div style="height: 60px; width: 200px; background-color: #f0f0f0; display: flex; align-items: center; justify-content: center; font-weight: bold;">LOGO</div>`;
      
      const companyAddress = companySettings ? 
        `${companySettings.address || ''}${companySettings.city ? ', ' + companySettings.city : ''}${companySettings.state ? ', ' + companySettings.state : ''}${companySettings.pincode ? ' - ' + companySettings.pincode : ''}`.replace(/^,\s*/, '') : 
        'Company Address';
      
      // Generate line items table HTML
      const lineItemsHTML = items.map(item => {
        // Debug logging for fabric items
        if (item.item_type === 'fabric') {
          console.log('Print - Fabric item data:', {
            itemName: item.item_name,
            itemType: item.item_type,
            fabricColor: item.fabric_color,
            fabricGsm: item.fabric_gsm,
            fabricName: item.fabric_name,
            fabricSelections: item.fabricSelections,
            attributes: item.attributes
          });
        }
        
        return `
        <tr>
          <td class="image-cell">
            ${item.item_image_url ? 
              `<img src="${item.item_image_url}" alt="${item.item_name}" style="width: 30px; height: 30px; object-fit: cover; border-radius: 3px;">` : 
              '<div style="width: 30px; height: 30px; background-color: #f0f0f0; display: flex; align-items: center; justify-content: center; font-size: 10px;">IMG</div>'
            }
          </td>
          <td>${item.item_name}</td>
          <td>${item.item_type === 'fabric' ? 'Fabric' : (item.item_category || item.item_type || 'N/A')}</td>
          <td>${item.item_type === 'fabric' ? (item.fabric_color || 'N/A') : '-'}</td>
          <td>${item.item_type === 'fabric' ? (item.fabric_gsm || 'N/A') : '-'}</td>
          <td class="number-cell">${item.quantity}</td>
          <td>${item.unit_of_measure || 'N/A'}</td>
          <td>${item.remarks || '-'}</td>
        </tr>
      `;
      }).join('');
      
      // No GST summary or totals needed for purchase orders
      const gstSummary = '';
      const grandSubtotal = 0;
      const grandGstAmount = 0;
      const grandTotal = 0;
      
      // Convert number to words (simple implementation)
      const numberToWords = (num: number): string => {
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
        const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        
        if (num === 0) return 'Zero';
        if (num < 10) return ones[num];
        if (num < 20) return teens[num - 10];
        if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
        if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + numberToWords(num % 100) : '');
        if (num < 100000) return numberToWords(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + numberToWords(num % 1000) : '');
        if (num < 10000000) return numberToWords(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + numberToWords(num % 100000) : '');
        return numberToWords(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + numberToWords(num % 10000000) : '');
      };
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Purchase Order - ${po.po_number || 'Draft'}</title>
          <style>
              body { 
                font-family: Arial, sans-serif; 
                margin: 0; 
                padding: 20px; 
                font-size: 12px;
                line-height: 1.4;
              }
              .print-header { 
                display: flex; 
                justify-content: space-between; 
                align-items: flex-start;
                margin-bottom: 30px;
                border-bottom: 2px solid #333;
                padding-bottom: 20px;
              }
              .company-info { 
                flex: 1; 
                max-width: 50%;
              }
              .po-info { 
                text-align: right; 
                flex: 1;
                max-width: 50%;
              }
              .company-name { 
                font-size: 18px; 
                font-weight: bold; 
                margin-bottom: 10px; 
              }
              .po-title { 
                font-size: 24px; 
                font-weight: bold; 
                margin-bottom: 10px; 
                text-align: right;
              }
              .po-number { 
                font-size: 14px; 
                font-weight: bold; 
                margin-bottom: 5px;
                text-align: right; 
              }
              .print-section { 
                margin-bottom: 20px; 
                display: flex;
                gap: 20px;
              }
              .section-left, .section-right { 
                flex: 1; 
              }
              .section-title { 
                font-weight: bold; 
                font-size: 14px; 
                margin-bottom: 10px; 
                border-bottom: 1px solid #ccc;
                padding-bottom: 5px;
              }
              .print-table { 
                width: 100%; 
                border-collapse: collapse; 
                margin-bottom: 20px; 
                font-size: 11px;
              }
              .print-table th, .print-table td { 
                border: 1px solid #ddd; 
                padding: 6px; 
                text-align: left; 
                vertical-align: top;
              }
              .print-table th { 
                background-color: #f2f2f2; 
                font-weight: bold;
              }
              .print-table .image-cell { 
                width: 40px; 
                text-align: center; 
              }
              .print-table .image-cell img { 
                width: 30px; 
                height: 30px; 
                object-fit: cover; 
                border-radius: 3px;
              }
              .print-table .number-cell { 
                text-align: right; 
              }
              .gst-summary { 
                margin-top: 20px; 
              }
              .grand-total { 
                text-align: right; 
                font-weight: bold; 
                margin-top: 20px; 
                font-size: 14px;
                border-top: 2px solid #333;
                padding-top: 10px;
              }
              .amount-in-words { 
                font-style: italic; 
                margin-top: 5px; 
                font-size: 11px;
              }
              .terms-section { 
                margin-top: 30px; 
                page-break-inside: avoid;
              }
          </style>
        </head>
        <body>
            <div class="print-header">
              <div class="company-info">
                ${companyLogo}
                <div class="company-name">${companySettings?.company_name || 'Company Name'}</div>
                <div>${companyAddress}</div>
                <div>GSTIN: ${companySettings?.gstin || 'GST Number'}</div>
                <div>Phone: ${companySettings?.contact_phone || 'Phone Number'}</div>
                <div>Email: ${companySettings?.contact_email || 'Email Address'}</div>
              </div>
              <div class="po-info">
                <div class="po-title">PURCHASE ORDER</div>
                <div class="po-number">PO Number: ${po.po_number || 'Draft'}</div>
                <div style="text-align: right;">Date: ${po.order_date || new Date().toISOString().split('T')[0]}</div>
            </div>
          </div>
          
            <div class="print-section">
              <div class="section-left">
                <div class="section-title">Supplier Information</div>
                <div><strong>${suppliersMap[po.supplier_id]?.supplier_name || suppliersMap[po.supplier_id]?.name || 'Supplier Name'}</strong></div>
                <div>Contact: ${suppliersMap[po.supplier_id]?.primary_contact_name || suppliersMap[po.supplier_id]?.name || 'Contact Person'}</div>
                <div>Phone: ${suppliersMap[po.supplier_id]?.primary_contact_phone || suppliersMap[po.supplier_id]?.phone || 'Phone'}</div>
                <div>Email: ${suppliersMap[po.supplier_id]?.primary_contact_email || suppliersMap[po.supplier_id]?.email || 'Email'}</div>
                <div>GST: ${suppliersMap[po.supplier_id]?.gst_number || 'GST Number'}</div>
                <div>PAN: ${suppliersMap[po.supplier_id]?.pan || 'PAN Number'}</div>
                <div>${suppliersMap[po.supplier_id]?.billing_address_line1 || 'Address'}</div>
              </div>
              <div class="section-right">
                <div class="section-title">Delivery Information</div>
                <div><strong>Delivery Address:</strong></div>
                <div>${po.delivery_address || companyAddress || 'Delivery Address'}</div>
                <div><strong>Expected Delivery:</strong> ${po.expected_delivery_date || 'Not specified'}</div>
                
                ${po.preferred_transporter || po.transport_remark ? `
                <div style="margin-top: 15px; font-weight: bold; font-size: 12px; border-bottom: 1px solid #ccc; padding-bottom: 3px;">Transporter Details</div>
                ${po.preferred_transporter ? `<div><strong>Preferred Transporter:</strong> ${po.preferred_transporter}</div>` : ''}
                ${po.transport_remark ? `<div><strong>Transport Remark:</strong> ${po.transport_remark}</div>` : ''}
                ` : ''}
              </div>
          </div>
          
            <table class="print-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Item</th>
                <th>Type</th>
                <th>Color</th>
                <th>GSM</th>
                <th>Quantity</th>
                <th>UOM</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
                ${lineItemsHTML}
            </tbody>
          </table>
          
          
            <div class="terms-section">
              <div class="section-title">Terms & Conditions</div>
              <div>${po.terms_conditions || 'Standard terms and conditions apply.'}</div>
            </div>
            
            ${companySettings?.authorized_signatory_url ? `
            <div style="margin-top: 40px; display: flex; justify-content: flex-end;">
              <div style="text-align: center;">
                <div style="font-weight: bold; font-size: 12px; margin-bottom: 5px;">Authorized Signatory</div>
                <div style="margin-bottom: 10px;">
                  <img src="${companySettings.authorized_signatory_url}" alt="Authorized Signatory" style="max-width: 180px; max-height: 60px; object-fit: contain;" />
                </div>
                <div style="border-top: 1px solid #000; width: 180px; margin: 0 auto;"></div>
              </div>
            </div>
            ` : ''}
            
        </body>
      </html>
    `);
    printWindow.document.close();
    
    // Since we're using base64 images, they load immediately - no need to wait
    printWindow.onload = () => {
      setTimeout(() => printWindow.print(), 100);
    };
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: `Purchase Order - ${po.po_number || 'Draft'}`,
      text: `Purchase Order ${po.po_number || 'Draft'} for ${suppliersMap[po.supplier_id]?.supplier_name || suppliersMap[po.supplier_id]?.name || 'Unknown Supplier'}`,
      url: window.location.href
    };

    try {
      if (navigator.share && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        toast.success('Purchase Order shared successfully!');
      } else {
        // Fallback: Copy to clipboard
        await navigator.clipboard.writeText(window.location.href);
        toast.success('Purchase Order link copied to clipboard!');
      }
    } catch (error) {
      console.error('Error sharing:', error);
      toast.error('Failed to share Purchase Order');
    }
  };

  const fetchSuppliers = async () => {
    try {
      const { data, error } = await supabase
        .from('supplier_master')
        .select('*')
        .order('supplier_name');
      
      if (error) throw error;
      const mappedSuppliers = (data || []).map(supplier => ({
        id: supplier.id,
        name: supplier.supplier_name,
        supplier_name: supplier.supplier_name,
        supplier_code: supplier.supplier_code,
        email: supplier.email,
        phone: supplier.phone,
        address: supplier.billing_address,
        gstin: supplier.gst_number,
        gst_number: supplier.gst_number,
        primary_contact_name: supplier.contact_person,
        primary_contact_phone: supplier.phone,
        primary_contact_email: supplier.email,
        billing_address_line1: supplier.billing_address,
        billing_address_line2: null,
        billing_address_city: null,
        billing_address_state: null,
        billing_address_pincode: null,
        pan: supplier.pan
      }));
      
      setSuppliers(mappedSuppliers);
      
      // Create a map for easy lookup
      const map: Record<string, Supplier> = {};
      mappedSuppliers.forEach(supplier => {
        map[supplier.id] = supplier;
      });
      setSuppliersMap(map);
      
      console.log('Suppliers loaded:', data);
      console.log('Suppliers map:', map);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      toast.error('Failed to load suppliers');
    }
  };

  const convertLogoToBase64 = async (logoUrl: string) => {
    try {
      const base64 = await convertImageToBase64WithCache(logoUrl, logoCache.current);
      if (base64) {
        setLogoBase64(base64);
      } else {
        // Use fallback logo if conversion fails
        setLogoBase64(createFallbackLogo('LOGO'));
      }
    } catch (error) {
      console.error('Error converting logo to base64:', error);
      setLogoBase64(createFallbackLogo('LOGO'));
    }
  };

  const fetchCompanySettings = async () => {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .single();
      
      if (error) throw error;
      setCompanySettings(data);
      
      // Convert logo to base64 if available
      if (data?.logo_url) {
        await convertLogoToBase64(data.logo_url);
      } else {
        setLogoBase64(createFallbackLogo('LOGO'));
      }
      
      // Auto-populate delivery address with company address if not set
      if (data && !po.delivery_address) {
        const companyAddress = [
          data.address,
          data.city,
          data.state,
          data.pincode
        ].filter(Boolean).join(', ');
        
        setPo(prev => ({
          ...prev,
          delivery_address: companyAddress
        }));
      }
    } catch (error) {
      console.error('Error fetching company settings:', error);
      setLogoBase64(createFallbackLogo('LOGO'));
    }
  };

  const fetchOptions = async () => {
    try {
      // Fetch fabrics with comprehensive error handling
      const { data: fabrics, error: fabricError } = await supabase
        .from('fabric_master')
        .select('id, fabric_name, color, gsm, image, fabric_description')
        .order('fabric_name');
      
      if (fabricError) {
        console.error('Error fetching fabrics:', fabricError);
        throw fabricError;
      }
      
      const mappedFabrics = (fabrics || []).map(f => ({
        id: f.id,
        label: `${f.fabric_name || 'Unknown'} - ${f.color || 'N/A'} - ${f.gsm || 'N/A'} GSM`,
        image_url: f.image || null,
        fabric_name: f.fabric_name || 'Unknown',
        color: f.color || 'N/A',
        gsm: f.gsm || 'N/A',
        description: f.fabric_description || '',
      }));
      console.log('Fabric options loaded:', {
        count: mappedFabrics.length,
        sample: mappedFabrics.slice(0, 3),
        withImages: mappedFabrics.filter(f => f.image_url).length,
        withColors: mappedFabrics.filter(f => f.color && f.color !== 'N/A').length,
        withGSM: mappedFabrics.filter(f => f.gsm && f.gsm !== 'N/A').length
      });
      setFabricOptions(mappedFabrics);
      console.log('Fabric options set:', mappedFabrics.length);

      // Fetch items with comprehensive error handling
      const { data: items, error: itemError } = await supabase
        .from('item_master')
        .select('id, item_name, item_type, image_url, image, uom')
        .order('item_name');
      
      if (itemError) {
        console.error('Error fetching items:', itemError);
        throw itemError;
      }
      
      const mappedItems = (items || []).map(i => ({
        id: i.id, 
        label: i.item_name || 'Unknown Item', 
        image_url: i.image_url || i.image || null, // Use image_url first, fallback to image
        item_type: i.item_type || 'item',
        type: i.item_type || 'item',
        uom: i.uom || 'pcs',
      }));
      console.log('Item options loaded:', {
        count: mappedItems.length,
        sample: mappedItems.slice(0, 3),
        withImages: mappedItems.filter(i => i.image_url).length,
        withTypes: mappedItems.filter(i => i.item_type).length
      });
      setItemOptions(mappedItems);
      console.log('Item options set:', mappedItems.length);
        
      // Get unique item types
      const types = [...new Set((items || []).map(i => i.item_type))];
        setItemTypeOptions(types);

      // Fetch products - try both tables with fallback
      let productData = [];
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, code')
          .order('name');
        
        if (error) throw error;
        productData = data || [];
      } catch (productError) {
        console.log('Products table not found, trying product_master...');
        try {
          const { data, error } = await supabase
        .from('product_master')
            .select('id, product_name as name, product_code as code')
        .order('product_name');
      
          if (error) throw error;
          productData = data || [];
        } catch (masterError) {
          console.log('No products table found, using empty array');
          productData = [];
        }
      }
      
      setProductOptions((productData || []).map(p => ({
        id: p.id,
        label: p.name,
        image_url: null // No image_url field in either table
      })));

    } catch (error) {
      console.error('Error fetching options:', error);
      toast.error('Failed to load options');
    }
  };

  const fetchPurchaseOrder = async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
          .from('purchase_orders')
        .select('*')
        .eq('id', id)
          .single();
      
        if (error) throw error;
      
      setPo(data);
      
      // Fetch line items
      const { data: lineItems, error: itemsError } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('po_id', id);
      
      if (itemsError) throw itemsError;
      
      // Process line items - use existing GST data from database
      const processedItems = (lineItems || []).map(item => ({
        ...item,
        item_type: item.item_type || 'item', // Ensure item_type is set
        // Map fabric-specific fields from database
        fabric_name: item.fabric_name || null,
        fabric_color: item.fabric_color || null,
        fabric_gsm: item.fabric_gsm || null,
        item_color: item.item_color || null,
        // Ensure proper field mapping
        type: item.item_type || 'item',
        quantity: item.quantity || 0,
        unit_of_measure: item.unit_of_measure || 'pcs'
      }));
      
      // No pricing calculations needed for purchase orders
      const itemsWithTotals = processedItems;
      setItems(itemsWithTotals);
      
    } catch (error) {
      console.error('Error fetching purchase order:', error);
      toast.error('Failed to load purchase order');
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (index: number, updates: Partial<LineItem>) => {
    setItems(prev => prev.map((item, i) => {
      if (i === index) {
        const updatedItem = { ...item, ...updates };
        // No pricing calculations needed
        return updatedItem;
      }
      return item;
    }));
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const addItem = (type: 'fabric' | 'item' | 'product' = 'item') => {
    const newItem: LineItem = {
      item_type: type,
      item_id: '',
      item_name: '',
      item_image_url: null,
      quantity: 0,
      unit_of_measure: type === 'fabric' ? 'kgs' : 'pcs',
      item_category: type === 'item' ? null : undefined,
    };
    setItems(prev => [...prev, newItem]);
  };

  const getOptionsForType = (type: string) => {
    switch (type) {
      case 'fabric':
        return fabricOptions;
      case 'item':
        return itemOptions;
      case 'product':
        return productOptions;
      default:
        return [];
    }
  };

  const handleSelectName = (index: number, value: string) => {
    const type = items[index].item_type;
    const options = getOptionsForType(type);
    const selected = options.find(o => o.id === value);
    
    if (selected) {
      if (type === 'fabric') {
        updateItem(index, {
          item_id: selected.id,
          item_name: selected.label,
          item_image_url: selected.image_url,
          unit_of_measure: 'Kgs',
          fabric_name: (selected as any).fabric_name,
          fabric_color: (selected as any).color,
          fabric_gsm: (selected as any).gsm,
          attributes: {
            colorsList: [(selected as any).color],
            gsmList: [(selected as any).gsm],
            description: (selected as any).description
          }
          });
        } else {
        updateItem(index, {
          item_id: selected.id,
          item_name: selected.label,
          item_image_url: selected.image_url,
          unit_of_measure: selected.uom || 'pcs',
            });
          }
        }
  };

  const save = async () => {
    if (!po.supplier_id) {
      toast.error('Please select a supplier');
      return;
    }

    if (items.length === 0) {
      toast.error('Please add at least one item');
        return;
      }

    try {
      setLoading(true);

      // No rate/amount calculations needed for purchase orders
      const itemsWithTotals = items;
      const grandTotal = 0; // No total amount for purchase orders
    
      // Ensure PO number is always generated
      const poNumber = po.po_number || await generatePONumber();
      
      const poData = {
        supplier_id: po.supplier_id,
        order_date: po.order_date || new Date().toISOString().split('T')[0],
        status: po.status,
        terms_conditions: po.terms_conditions ?? null,
        notes: po.notes ?? null,
        po_number: poNumber, // Explicitly set PO number
        total_amount: grandTotal,
        delivery_address: (po.delivery_address && po.delivery_address.trim() !== '') ? po.delivery_address : null,
        expected_delivery_date: (po.expected_delivery_date && po.expected_delivery_date.trim() !== '') ? po.expected_delivery_date : null,
        // Transporter details
        preferred_transporter: (po.preferred_transporter && po.preferred_transporter.trim() !== '') ? po.preferred_transporter : null,
        transport_remark: (po.transport_remark && po.transport_remark.trim() !== '') ? po.transport_remark : null,
        // BOM reference
        bom_id: bomData?.id || null, // Link to BOM if created from BOM
      };

      console.log('🔧 TIMESTAMP:', new Date().toISOString(), 'PO Data being saved:', poData);
      console.log('🔧 PO Number in data:', poData.po_number);
      console.log('🔧 PO Number type:', typeof poData.po_number);
      console.log('🔧 Expected delivery date:', po.expected_delivery_date);
      console.log('🔧 Expected delivery date processed:', poData.expected_delivery_date);

      let poId = po.id;

      if (poId) {
        // Update existing PO
        const { error: updateError } = await supabase
          .from('purchase_orders')
          .update(poData)
          .eq('id', poId);

        if (updateError) throw updateError;

        // Delete existing line items
        const { error: deleteError } = await supabase
          .from('purchase_order_items')
          .delete()
          .eq('po_id', poId);

        if (deleteError) throw deleteError;
    } else {
        // Create new PO
        const { data: newPo, error: createError } = await supabase
          .from('purchase_orders')
          .insert(poData)
          .select()
          .single();

        if (createError) throw createError;
        poId = newPo.id;
      }

      // Insert line items
      const lineItemsData = itemsWithTotals.map(item => ({
        po_id: poId, // Changed from purchase_order_id to po_id
        item_type: item.type || item.item_type || 'item', // Use correct field name with fallback
        item_id: item.item_id || null,
        item_name: item.item_name,
        item_image_url: item.item_image_url,
        quantity: item.quantity,
        unit_of_measure: item.unit_of_measure,
        remarks: item.remarks,
        // Add fabric-specific fields for fabric items
        ...(item.item_type === 'fabric' && {
          fabric_name: item.fabric_name || null,
          fabric_color: item.fabric_color || null,
          fabric_gsm: item.fabric_gsm || null,
          fabric_id: item.item_id || null // For fabric items, item_id is the fabric_id
        }),
        // Add item color for non-fabric items
        ...(item.item_type !== 'fabric' && {
          item_color: item.item_color || null
        })
      }));

      console.log('Line items data being saved:', lineItemsData);
      console.log('First item type:', lineItemsData[0]?.item_type);
      console.log('First item type type:', typeof lineItemsData[0]?.item_type);

      const { error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(lineItemsData);

      if (itemsError) throw itemsError;

      toast.success('Purchase order saved successfully');
      navigate('/procurement/po');
      
      } catch (error) {
      console.error('Error saving purchase order:', error);
      toast.error('Failed to save purchase order');
    } finally {
      setLoading(false);
    }
  };

  const totals = useMemo(() => {
    let grandSubtotal = 0;
    let grandGstAmount = 0;
    const gstGroups: Record<string, { subtotal: number; gstAmount: number; total: number }> = {};
    const grandTotal = 0; // No pricing for purchase orders
    const amountInWords = numberToWords(Math.floor(grandTotal)) + ' Rupees Only';

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
            onClick={() => navigate('/procurement/po')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
            </Button>
          <h1 className="text-3xl font-bold">
            {isEditMode ? 'Edit Purchase Order' : isReadOnly ? 'View Purchase Order' : 'Create Purchase Order'}
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
              <Button variant="outline" onClick={() => navigate('/procurement/po')}>
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
          <CardTitle>Purchase Order Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="supplier">Supplier *</Label>
              <Select 
                value={po.supplier_id} 
                onValueChange={(value) => setPo(prev => ({ ...prev, supplier_id: value }))}
                disabled={isReadOnly}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map(supplier => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="order_date">Order Date</Label>
              <Input
                id="order_date"
                type="date"
                value={po.order_date}
                onChange={(e) => setPo(prev => ({ ...prev, order_date: e.target.value }))}
                disabled={isReadOnly}
              />
            </div>

            <div>
              <Label htmlFor="status">Status</Label>
              <Select 
                value={po.status} 
                onValueChange={(value) => setPo(prev => ({ ...prev, status: value as any }))}
                disabled={isReadOnly}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="po_number">PO Number</Label>
              <Input
                id="po_number"
                value={po.po_number || ''}
                onChange={(e) => setPo(prev => ({ ...prev, po_number: e.target.value }))}
                disabled={isReadOnly}
                placeholder="TUC/PO/0001 (Auto-generated)"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="delivery_address">Delivery Address</Label>
              <Textarea
                id="delivery_address"
                value={po.delivery_address || ''}
                onChange={(e) => setPo(prev => ({ ...prev, delivery_address: e.target.value }))}
                disabled={isReadOnly}
                placeholder="Enter delivery address..."
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="expected_delivery_date">Expected Delivery Date</Label>
              <Input
                id="expected_delivery_date"
                type="date"
                value={po.expected_delivery_date || ''}
                onChange={(e) => setPo(prev => ({ ...prev, expected_delivery_date: e.target.value }))}
                disabled={isReadOnly}
              />
            </div>
          </div>

          {/* Transporter Details Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Transporter Details</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="preferred_transporter">Preferred Transporter</Label>
                <Input
                  id="preferred_transporter"
                  value={po.preferred_transporter || ''}
                  onChange={(e) => setPo(prev => ({ ...prev, preferred_transporter: e.target.value }))}
                  disabled={isReadOnly}
                  placeholder="Enter preferred transporter..."
                />
              </div>

              <div>
                <Label htmlFor="transport_remark">Transport Remark</Label>
                <Input
                  id="transport_remark"
                  value={po.transport_remark || ''}
                  onChange={(e) => setPo(prev => ({ ...prev, transport_remark: e.target.value }))}
                  disabled={isReadOnly}
                  placeholder="Enter transport remarks..."
                />
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="terms_conditions">Terms & Conditions</Label>
            <Textarea 
              id="terms_conditions"
              value={po.terms_conditions || ''}
              onChange={(e) => setPo(prev => ({ ...prev, terms_conditions: e.target.value }))}
              disabled={isReadOnly}
              placeholder="Enter terms and conditions..."
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea 
              id="notes"
              value={po.notes || ''}
              onChange={(e) => setPo(prev => ({ ...prev, notes: e.target.value }))}
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
                        <div className="col-span-6">
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
                          <div className="text-sm font-medium">
                            {it.item_name || 'N/A'}
                                </div>
                              </div>

                        {/* Quantity */}
                        <div>
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

                        {/* UOM */}
                        <div>
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
                        <div className="col-span-6">
                          <Label className="text-sm font-medium">Remarks</Label>
                          <Input 
                            value={it.remarks || ''} 
                            onChange={(e) => updateItem(idx, { remarks: e.target.value })}
                            className="w-full" 
                            disabled={isReadOnly} 
                            placeholder="Enter remarks for this item"
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
      </div>

      <Card>
        <CardContent className="pt-6">

        </CardContent>
      </Card>
      </div> {/* End of printRef */}
    </div>
  );
}
