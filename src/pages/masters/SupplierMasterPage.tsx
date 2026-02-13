import { ErpLayout } from "@/components/ErpLayout";
import { SupplierMaster } from "@/components/masters/SupplierMaster";
import { BackButton } from '@/components/common/BackButton';

export default function SupplierMasterPage() {
  return (
    <ErpLayout fullPage>
      <div className="space-y-6">
        <div className="flex items-center">
          <BackButton to="/masters" label="Back to Masters" />
        </div>
      <SupplierMaster />
      </div>
    </ErpLayout>
  );
}
