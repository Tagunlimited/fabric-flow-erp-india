import { ErpLayout } from "@/components/ErpLayout";
import Fabrics from "./Fabrics";
import { BackButton } from '@/components/common/BackButton';

const FabricsPage = () => {
  return (
    <ErpLayout fullPage>
      <div className="space-y-6">
        <div className="flex items-center">
          <BackButton to="/inventory" label="Back to Inventory" />
        </div>
        <Fabrics />
      </div>
    </ErpLayout>
  );
};

export default FabricsPage;