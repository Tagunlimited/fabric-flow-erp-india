import { ErpLayout } from '@/components/ErpLayout';
import { BomTabsPage } from '@/components/purchase-orders/BomTabsPage';

const BomListPage = () => {
  return (
    <ErpLayout>
      <div className="space-y-6">
        <BomTabsPage />
      </div>
    </ErpLayout>
  );
};

export default BomListPage;
