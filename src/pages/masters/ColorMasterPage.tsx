import { ErpLayout } from "@/components/ErpLayout";
import ColorMaster from "@/components/masters/ColorMaster";
import { BackButton } from '@/components/common/BackButton';

const ColorMasterPage = () => {
  return (
    <ErpLayout fullPage>
      <div className="w-full h-full p-6 space-y-6">
        <div className="flex items-center">
          <BackButton to="/masters" label="Back to Masters" />
        </div>
        <ColorMaster />
      </div>
    </ErpLayout>
  );
};

export default ColorMasterPage;

