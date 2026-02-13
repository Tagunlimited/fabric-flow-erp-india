import { ErpLayout } from "@/components/ErpLayout";
import { ItemMaster } from "@/components/masters/ItemMaster";
import { BackButton } from '@/components/common/BackButton';

const ItemMasterPage = () => {
  return (
    <ErpLayout fullPage>
      <div className="space-y-6">
        <div className="flex items-center">
          <BackButton to="/masters" label="Back to Masters" />
        </div>
      <ItemMaster />
      </div>
    </ErpLayout>
  );
};

export default ItemMasterPage;