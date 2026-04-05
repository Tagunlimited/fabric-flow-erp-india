import { ErpLayout } from '@/components/ErpLayout';
import { PurchaseOrderDashboard } from '@/components/purchase-orders/PurchaseOrderDashboard';

const PurchaseOrderListPage = () => {
  return (
    <ErpLayout>
      <PurchaseOrderDashboard />
    </ErpLayout>
  );
};

export default PurchaseOrderListPage;


