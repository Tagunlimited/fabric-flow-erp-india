import { ErpLayout } from '@/components/ErpLayout';
import { PurchaseOrderForm } from '@/components/purchase-orders/PurchaseOrderForm';
import { BackButton } from '@/components/common/BackButton';

const PurchaseOrderFormPage = () => {
  return (
    <ErpLayout>
      <div className="space-y-6">
        <div className="flex items-center">
          <BackButton to="/procurement/po" label="Back to Purchase Orders" />
        </div>
        <PurchaseOrderForm />
      </div>
    </ErpLayout>
  );
};

export default PurchaseOrderFormPage;


