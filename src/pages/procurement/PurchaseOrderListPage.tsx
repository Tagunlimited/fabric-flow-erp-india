import { ErpLayout } from '@/components/ErpLayout';
import { PurchaseOrderDashboard } from '@/components/purchase-orders/PurchaseOrderDashboard';
import { BackButton } from '@/components/common/BackButton';

const PurchaseOrderListPage = () => {
  return (
    <ErpLayout>
      <div className="space-y-6">
        <div className="flex items-center">
          <BackButton to="/procurement" label="Back to Procurement" />
        </div>
        <PurchaseOrderDashboard />
      </div>
    </ErpLayout>
  );
};

export default PurchaseOrderListPage;


