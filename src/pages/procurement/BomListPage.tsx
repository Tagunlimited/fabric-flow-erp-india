import { ErpLayout } from '@/components/ErpLayout';
import { BomTabsPage } from '@/components/purchase-orders/BomTabsPage';
import { BackButton } from '@/components/common/BackButton';

const BomListPage = () => {
  return (
    <ErpLayout>
      <div className="space-y-6">
        <div className="flex items-center">
          <BackButton to="/procurement" label="Back to Procurement" />
        </div>
        <BomTabsPage />
      </div>
    </ErpLayout>
  );
};

export default BomListPage;
