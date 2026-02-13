import { ErpLayout } from "@/components/ErpLayout";
import { CustomerTypeMaster } from "@/components/masters/CustomerTypeMaster";
import { BackButton } from '@/components/common/BackButton';

const CustomerTypeMasterPage = () => {
  return (
    <ErpLayout fullPage>
      <div className="space-y-6">
        <div className="flex items-center">
          <BackButton to="/masters" label="Back to Masters" />
        </div>
      <CustomerTypeMaster />
      </div>
    </ErpLayout>
  );
};

export default CustomerTypeMasterPage;