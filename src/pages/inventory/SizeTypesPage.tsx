import { ErpLayout } from "@/components/ErpLayout";
import SizeTypes from "./SizeTypes";
import { BackButton } from '@/components/common/BackButton';

const SizeTypesPage = () => {
  return (
    <ErpLayout fullPage>
      <div className="space-y-6">
        <div className="flex items-center">
          <BackButton to="/inventory" label="Back to Inventory" />
        </div>
        <SizeTypes />
      </div>
    </ErpLayout>
  );
};

export default SizeTypesPage;