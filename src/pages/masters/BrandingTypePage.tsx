import { ErpLayout } from "@/components/ErpLayout";
import BrandingTypeManager from "@/components/masters/BrandingTypeManager";
import { BackButton } from '@/components/common/BackButton';

const BrandingTypePage = () => {
  return (
    <ErpLayout fullPage>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center">
          <BackButton to="/masters" label="Back to Masters" />
        </div>
        <BrandingTypeManager />
      </div>
    </ErpLayout>
  );
};

export default BrandingTypePage;
