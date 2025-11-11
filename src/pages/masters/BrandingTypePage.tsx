import { ErpLayout } from "@/components/ErpLayout";
import BrandingTypeManager from "@/components/masters/BrandingTypeManager";

const BrandingTypePage = () => {
  return (
    <ErpLayout fullPage>
      <div className="container mx-auto p-6">
        <BrandingTypeManager />
      </div>
    </ErpLayout>
  );
};

export default BrandingTypePage;
