import { ErpLayout } from "@/components/ErpLayout";
import { WarehouseMaster } from "@/components/warehouse/WarehouseMaster";
import { BackButton } from '@/components/common/BackButton';

const WarehouseMasterPage = () => {
  return (
    <ErpLayout fullPage>
      <div className="space-y-6">
        <div className="flex items-center">
          <BackButton to="/masters" label="Back to Masters" />
        </div>
      <WarehouseMaster />
      </div>
    </ErpLayout>
  );
};

export default WarehouseMasterPage;