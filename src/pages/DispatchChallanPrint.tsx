import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ErpLayout } from "@/components/ErpLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useCompanySettings } from '@/hooks/CompanySettingsContext';
import { Printer, Download, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDateIndian } from "@/lib/utils";
import { useSizeTypes } from "@/hooks/useSizeTypes";
import { usePrintDocumentTitle } from "@/hooks/usePrintDocumentTitle";
import {
  OrderSummaryProductDetailsCell,
  OrderSummaryQtyCell,
  sizeTypesArrayToMap,
} from "@/components/accounts/OrderSummaryPrintLine";

interface DispatchItem {
  size_name: string;
  quantity: number;
}

interface OrderItem {
  id: string;
  product_category_id: string;
  product_description: string;
  quantity: number;
  color?: string;
  gsm?: string;
  mockup_images?: string[];
  category_image_url?: string;
  fabric_id?: string;
  fabric_name?: string;
  specifications?: any;
  sizes_quantities?: any;
  size_prices?: any;
  size_type_id?: string;
  unit_price?: number;
  gst_rate?: number;
}

export default function DispatchChallanPrint() {
  const { id } = useParams(); // dispatch_order_id
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  const { config: company } = useCompanySettings();
  const { sizeTypes } = useSizeTypes();
  const sizeTypesMap = useMemo(() => sizeTypesArrayToMap(sizeTypes), [sizeTypes]);
  usePrintDocumentTitle('Delivery Challan');
  
  const [dispatchOrder, setDispatchOrder] = useState<any | null>(null);
  const [dispatchItems, setDispatchItems] = useState<DispatchItem[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [productCategories, setProductCategories] = useState<{ [key: string]: any }>({});
  const [totalApproved, setTotalApproved] = useState(0);
  const [totalDispatched, setTotalDispatched] = useState(0);
  const [thisDispatchTotal, setThisDispatchTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) loadData(id);
  }, [id]);

  const loadData = async (dispatchId: string) => {
    try {
      setLoading(true);

      // Fetch dispatch order
      const { data: dispatchData, error: dispatchError } = await (supabase as any)
        .from('dispatch_orders')
        .select(`
          id,
          dispatch_number,
          dispatch_date,
          courier_name,
          tracking_number,
          order_id,
          orders:orders (
            id,
            order_number,
            order_date,
            order_type,
            gst_rate,
            customers:customers (
              company_name,
              contact_person,
              phone,
              address,
              city,
              state,
              pincode,
              gstin
            )
          )
        `)
        .eq('id', dispatchId)
        .maybeSingle();

      if (dispatchError) throw dispatchError;
      setDispatchOrder(dispatchData);

      if (!dispatchData?.order_id) return;

      // Fetch dispatch items for this challan
      const { data: itemsData, error: itemsError } = await (supabase as any)
        .from('dispatch_order_items')
        .select('size_name, quantity')
        .eq('dispatch_order_id', dispatchId);

      if (itemsError) throw itemsError;
      setDispatchItems(itemsData || []);

      // Calculate this dispatch total
      const thisTotal = (itemsData || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
      setThisDispatchTotal(thisTotal);

      // Fetch order items with product details including fabric_id
      const { data: orderItemsData, error: orderItemsError } = await (supabase as any)
        .from('order_items')
        .select(
          'id, product_category_id, product_description, quantity, color, gsm, mockup_images, category_image_url, fabric_id, specifications, sizes_quantities, size_prices, size_type_id, unit_price, gst_rate'
        )
        .eq('order_id', dispatchData.order_id);

      if (orderItemsError) throw orderItemsError;
      
      // Fetch fabric names for items with fabric_id
      const fabricIds = Array.from(new Set((orderItemsData || []).map((item: any) => item.fabric_id).filter(Boolean)));
      let fabricMap: { [key: string]: { fabric_name: string } } = {};
      if (fabricIds.length > 0) {
        const { data: fabricsData, error: fabricsError } = await supabase
          .from('fabric_master')
          .select('id, fabric_name')
          .in('id', fabricIds as any);
        
        if (!fabricsError && fabricsData) {
          fabricsData.forEach((fabric: any) => {
            fabricMap[fabric.id] = { fabric_name: fabric.fabric_name };
          });
        }
      }
      
      // Enrich order items with fabric_name
      const enrichedOrderItems = (orderItemsData || []).map((item: any) => ({
        ...item,
        fabric_name: item.fabric_id ? (fabricMap[item.fabric_id]?.fabric_name || null) : null
      }));
      
      setOrderItems(enrichedOrderItems);

      // Fetch product categories for names
      const categoryIds = Array.from(new Set((orderItemsData || []).map((item: any) => item.product_category_id).filter(Boolean)));
      if (categoryIds.length > 0) {
        const { data: categoriesData } = await supabase
          .from('product_categories')
          .select('*')
          .in('id', categoryIds as any);
        
        const categoriesMap: { [key: string]: any } = {};
        (categoriesData || []).forEach((cat: any) => {
          categoriesMap[cat.id] = cat;
        });
        setProductCategories(categoriesMap);
      }

      // Calculate total approved quantity (from QC for custom orders, from order_items for readymade)
      let approved = 0;
      if (dispatchData.orders?.order_type === 'readymade') {
        // For readymade, approved = order quantity
        approved = (orderItemsData || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
      } else {
        // For custom orders, get approved from QC reviews
        const { data: assignments } = await (supabase as any)
          .from('order_batch_assignments')
          .select('id')
          .eq('order_id', dispatchData.order_id);

        if (assignments && assignments.length > 0) {
          const assignmentIds = assignments.map((a: any) => a.id);
          const { data: qcReviews } = await (supabase as any)
            .from('qc_reviews')
            .select('approved_quantity')
            .in('order_batch_assignment_id', assignmentIds as any);

          approved = (qcReviews || []).reduce((sum: number, review: any) => sum + Number(review.approved_quantity || 0), 0);
        }
      }
      setTotalApproved(approved);

      // Calculate total already dispatched (including this dispatch)
      const { data: allDispatches } = await (supabase as any)
        .from('dispatch_order_items')
        .select('quantity')
        .eq('order_id', dispatchData.order_id);

      const totalDisp = (allDispatches || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
      setTotalDispatched(totalDisp);

    } catch (error) {
      console.error('Error loading dispatch challan:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const balanceQuantity = totalApproved - totalDispatched;

  const fabricsForPrint = useMemo(() => {
    const m: Record<string, { name: string }> = {};
    orderItems.forEach((it: any) => {
      if (it.fabric_id && it.fabric_name) m[it.fabric_id] = { name: it.fabric_name };
    });
    return m;
  }, [orderItems]);

  const orderForSummary = dispatchOrder?.orders;

  if (loading || !dispatchOrder) {
    return (
      <ErpLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading delivery challan...</p>
          </div>
        </div>
      </ErpLayout>
    );
  }

  return (
    <ErpLayout>
      <div className="space-y-6">
        {/* Action Buttons - Hidden when printing */}
        <div className="print:hidden flex items-center justify-between">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
          </div>
        </div>

        {/* Delivery Challan Content */}
        <div
          ref={printRef}
          className="bg-white p-8 w-full max-w-[210mm] mx-auto print:max-w-none print:w-full print:mx-0 print:m-0 print:px-[16mm] print:py-[12mm]"
        >
          <div className="w-full max-w-4xl mx-auto print:max-w-none print:mx-0 print:w-full print:p-0">
            {/* Company Header */}
            <div className="flex items-start gap-3 mb-3 pb-2 border-b-2 border-gray-300">
              {company?.logo_url && (
                <div className="flex-shrink-0">
                  <img 
                    src={company.logo_url} 
                    alt={company.company_name} 
                    className="h-12 w-auto object-contain"
                    style={{ maxWidth: '50px' }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div className="flex-1">
                <h1 className="text-lg font-bold mb-1">{company?.company_name || 'Company Name'}</h1>
                <p className="text-xs text-gray-700 leading-relaxed break-words">{company?.address || 'Company Address'}</p>
                <p className="text-xs text-gray-700 leading-relaxed">
                  {company?.city || 'City'}, {company?.state || 'State'} - {company?.pincode || 'Pincode'}
                </p>
                <p className="text-xs text-gray-700 font-medium mt-0.5">GSTIN: {company?.gstin || 'GSTIN'}</p>
              </div>
            </div>

            {/* Challan Header */}
            <div className="flex justify-between items-start mb-4 gap-4">
              <div className="flex-1 max-w-[55%]">
                <h2 className="text-2xl font-bold mb-2">DELIVERY CHALLAN</h2>
                <div className="space-y-0.5">
                  <p className="text-xs text-gray-700"><span className="font-semibold">Challan #:</span> {dispatchOrder.dispatch_number}</p>
                  <p className="text-xs text-gray-700"><span className="font-semibold">Date:</span> {formatDateIndian(dispatchOrder.dispatch_date)}</p>
                  <p className="text-xs text-gray-700 break-words">
                    <span className="font-semibold">Order Ref:</span> {dispatchOrder.orders?.order_number}
                  </p>
                  {dispatchOrder.courier_name && (
                    <p className="text-xs text-gray-700">
                      <span className="font-semibold">Courier:</span> {dispatchOrder.courier_name}
                    </p>
                  )}
                  {dispatchOrder.tracking_number && (
                    <p className="text-xs text-gray-700">
                      <span className="font-semibold">Tracking:</span> {dispatchOrder.tracking_number}
                    </p>
                  )}
                </div>
                  </div>
              <div className="text-right flex-1 max-w-[40%]">
                <h3 className="font-bold text-sm mb-1 border-b pb-1">Ship To:</h3>
                <div className="space-y-0.5 mt-1">
                  <p className="text-xs font-semibold break-words">{dispatchOrder.orders?.customers?.company_name}</p>
                  <p className="text-xs text-gray-700 break-words">{dispatchOrder.orders?.customers?.contact_person}</p>
                  {dispatchOrder.orders?.customers?.phone?.trim() && (
                    <p className="text-xs text-gray-700 break-words">
                      Mobile: {dispatchOrder.orders.customers.phone}
                    </p>
                  )}
                  <p className="text-xs text-gray-700 break-words leading-relaxed">{dispatchOrder.orders?.customers?.address}</p>
                  <p className="text-xs text-gray-700">
                    {dispatchOrder.orders?.customers?.city}, {dispatchOrder.orders?.customers?.state} - {dispatchOrder.orders?.customers?.pincode}
                  </p>
                  {dispatchOrder.orders?.customers?.gstin && (
                    <p className="text-xs text-gray-700 font-medium">GSTIN: {dispatchOrder.orders?.customers?.gstin}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Dispatched Items - Size Distribution */}
            {dispatchItems.length > 0 && (
              <div className="mb-3 pb-2 border-b">
                <h3 className="text-sm font-semibold mb-2">Dispatched Items (Size-wise):</h3>
                <div className="grid grid-cols-8 gap-1.5" style={{ gridAutoFlow: 'dense' }}>
                  {dispatchItems.map((item, index) => (
                    <div key={index} className="border border-gray-300 rounded p-1.5 text-center bg-gray-50">
                      <div className="text-xs font-semibold text-gray-700">{item.size_name === 'Total' ? 'Total' : item.size_name}</div>
                      <div className="text-base font-bold text-gray-900">{item.quantity}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Order summary — same product/branding layout as quotation; no rates/amounts */}
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">ORDER SUMMARY</h3>
              <div className="overflow-x-auto print:overflow-visible">
                <table className="order-summary-print-table w-full table-fixed border-collapse border border-gray-400 text-sm">
                  <colgroup>
                    <col style={{ width: '72%' }} />
                    <col style={{ width: '28%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-gray-400 px-4 py-3 text-left font-semibold align-middle">
                        Product Details
                      </th>
                      <th className="border border-gray-400 px-4 py-3 text-left font-semibold align-middle">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderItems.map((item) => (
                      <tr key={item.id}>
                        <td className="border border-gray-400 px-4 py-3 align-middle text-sm">
                          <OrderSummaryProductDetailsCell
                            item={item}
                            order={orderForSummary}
                            fabrics={fabricsForPrint}
                            productCategories={productCategories}
                            sizeTypesMap={sizeTypesMap}
                          />
                        </td>
                        <td className="border border-gray-400 px-4 py-3 align-middle text-sm">
                          <OrderSummaryQtyCell
                            item={item}
                            order={orderForSummary}
                            sizeTypesMap={sizeTypesMap}
                            showUnitRates={false}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quantity Summary */}
            <div className="flex justify-end mb-4">
              <div className="w-80">
                <div className="space-y-2 border-t pt-3">
                  <div className="flex justify-between py-1 text-sm">
                    <span className="font-medium">Total Approved Quantity:</span>
                    <span className="font-semibold">{totalApproved}</span>
                  </div>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="font-medium">This Dispatch:</span>
                    <span className="font-semibold text-blue-600">{thisDispatchTotal}</span>
                  </div>
                  <div className="flex justify-between py-1 text-sm border-t">
                    <span className="font-medium">Total Dispatched:</span>
                    <span className="font-semibold text-green-600">{totalDispatched}</span>
                  </div>
                  <div className="flex justify-between py-1 text-sm border-t-2 border-gray-300">
                    <span className="font-bold">Balance Quantity:</span>
                    <span className={`font-bold text-base ${balanceQuantity > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                      {balanceQuantity}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer with Signatures */}
            <div className="mt-8 pt-4 border-t">
              <div className="flex justify-between items-end">
                <div className="flex-1">
                  <div className="border-t border-gray-400 pt-2 mt-16 w-48">
                    <p className="text-xs text-center text-gray-600">Receiver's Signature</p>
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium mb-4">Thank you for your business!</p>
                </div>
                <div className="flex-1 flex justify-end">
                  <div>
                    <div className="border-t border-gray-400 pt-2 mt-16 w-48">
                      <p className="text-xs text-center font-medium">Authorized Signatory</p>
                      <p className="text-xs text-center text-gray-600">{company?.company_name || 'Company Name'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ErpLayout>
  );
}
