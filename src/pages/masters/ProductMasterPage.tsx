import { ErpLayout } from "@/components/ErpLayout";
import { ProductMasterNew } from "@/components/masters/ProductMasterNew";
import { BackButton } from '@/components/common/BackButton';

const ProductMasterPage = () => {
  return (
    <ErpLayout fullPage>
      <div className="space-y-6">
        <div className="flex items-center">
          <BackButton to="/masters" label="Back to Masters" />
        </div>
      <ProductMasterNew />
      </div>
    </ErpLayout>
  );
};

export default ProductMasterPage;